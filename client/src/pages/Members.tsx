import { useCallback, useEffect, useState } from 'react';
import type { AccessRequest, BanLog, MemberRow, User } from '../../../shared/src/types';
import {
  ApiError,
  adminApproveAccess,
  adminBanUser,
  adminDenyAccess,
  adminGrantBanPermission,
  adminGrantModerator,
  adminListAccessRequests,
  adminListMembers,
  adminRevokeBanPermission,
  adminRevokeModerator,
  adminUnbanUser,
  getBanLogs,
  setTextColor,
} from '../api';
import UserName, { Avatar } from '../components/UserBadge';

function accessLabel(row: MemberRow): string {
  if (row.privateAccess === 'auto') return 'Автомат (админ)';
  if (row.privateAccess === 'approved') return 'Зөвшөөрсөн';
  if (row.privateAccess === 'pending') return 'Хүлээгдэж байна';
  if (row.privateAccess === 'denied') return 'Татгалзсан';
  return 'Хүсэлтгүй';
}

/** Хэрэглэгч одоо бантай эсэх — байнга бан ЭСВЭЛ хугацаа нь дуусаагүй бан. */
function isBannedUser(u: User): boolean {
  if (u.banned) return true;
  return u.bannedUntil !== null && new Date(u.bannedUntil).getTime() > Date.now();
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('mn-MN', {
    timeZone: 'Asia/Ulaanbaatar',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function durationLabel(minutes: number | null): string {
  if (minutes === null) return 'Байнга';
  if (minutes === 1440) return '24 цаг';
  return `${minutes} минут`;
}

function statusLabel(status: BanLog['status']): string {
  if (status === 'active') return 'Идэвхтэй';
  if (status === 'expired') return 'Хугацаа дууссан';
  return 'Цуцалсан';
}

/** Бичлэгийн өнгөний бэлэн сонголтууд (зөвхөн том админ онооно). */
const PRESET_COLORS = ['#D4AF37', '#E5484D', '#3E63DD', '#30A46C', '#8E4EC6', '#D6409F', '#F76B15', '#12A594'];

/** Нэг хэрэглэгчийн бичлэгийн өнгө сонгогч — бэлэн өнгө + дурын өнгө + арилгах. */
function TextColorPicker({
  userId,
  current,
  onPick,
}: {
  userId: number;
  current: string | null;
  onPick: (id: number, color: string | null) => void;
}) {
  const [custom, setCustom] = useState(current ?? '#D4AF37');
  return (
    <div className="color-picker">
      <span className="muted small">Бичлэгийн өнгө:</span>
      {PRESET_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          className={current === c ? 'color-swatch active' : 'color-swatch'}
          style={{ backgroundColor: c }}
          title={c}
          aria-label={`Өнгө ${c}`}
          onClick={() => onPick(userId, c)}
        />
      ))}
      <input
        type="color"
        value={custom}
        onChange={(e) => setCustom(e.target.value)}
        title="Өөр өнгө сонгох"
        aria-label="Өөр өнгө сонгох"
      />
      <button type="button" className="btn-ghost small" onClick={() => onPick(userId, custom)}>
        Сонгох
      </button>
      {current && (
        <button type="button" className="btn-ghost small" onClick={() => onPick(userId, null)}>
          Арилгах
        </button>
      )}
    </div>
  );
}

export default function Members({
  user,
  onOpenDm,
  onViewProfile,
}: {
  user: User;
  onOpenDm: (userId: number) => void;
  onViewProfile: (userId: number) => void;
}) {
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [banLogs, setBanLogs] = useState<BanLog[]>([]);
  const [banTargetId, setBanTargetId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const isAdmin = user.role === 'admin';
  // Гишүүд хэсгийг том админ + бандах эрхтэй жижиг админ харна.
  const canView = isAdmin || (user.role === 'moderator' && user.canBan);
  // Энэ хэрэглэгчийг бандаж болох эсэх (UI түвшинд; сервер дахин шалгана).
  const canBanRow = (row: MemberRow): boolean => {
    if (row.user.id === user.id) return false;
    if (isAdmin) return row.user.role !== 'admin';
    return user.role === 'moderator' && user.canBan && row.user.role === 'member';
  };

  const refresh = useCallback(async () => {
    if (!canView) return;
    try {
      setMembers(await adminListMembers());
      if (isAdmin) {
        setRequests(await adminListAccessRequests());
        setBanLogs(await getBanLogs());
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Гишүүдийн жагсаалт ачааллахад алдаа гарлаа.');
    }
  }, [canView, isAdmin]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Гишүүдийн жагсаалтыг 30 секунд тутамд шинэчилнэ — онлайн цэг шинэчлэгдэнэ.
  useEffect(() => {
    const t = window.setInterval(() => {
      void refresh();
    }, 30000);
    return () => window.clearInterval(t);
  }, [refresh]);

  if (!canView) {
    return (
      <div className="locked-card">
        <div className="locked-icon">👑</div>
        <h2>Гишүүд</h2>
        <p>Энэ хэсгийг зөвхөн том админ, болон бандах эрхтэй жижиг админ харна.</p>
      </div>
    );
  }

  async function decide(requestId: number, approve: boolean): Promise<void> {
    setError('');
    try {
      if (approve) await adminApproveAccess(requestId);
      else await adminDenyAccess(requestId);
      setNotice(approve ? 'Зөвшөөрөл олголоо.' : 'Хүсэлтийг татгалзлаа.');
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Алдаа гарлаа.');
    }
  }

  async function grant(id: number): Promise<void> {
    setError('');
    try {
      await adminGrantModerator(id);
      setNotice('Жижиг админ эрх олголоо. ⚔️🛡️');
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Алдаа гарлаа.');
    }
  }

  async function revoke(id: number): Promise<void> {
    setError('');
    try {
      await adminRevokeModerator(id);
      setNotice('Жижиг админ эрхийг хураалаа.');
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Алдаа гарлаа.');
    }
  }

  async function ban(id: number, name: string, durationMinutes: number | null): Promise<void> {
    setError('');
    try {
      await adminBanUser(id, durationMinutes);
      setNotice(
        durationMinutes === null
          ? `«${name}» хэрэглэгчийг байнга бандлаа. 🚫`
          : `«${name}» хэрэглэгчийг ${durationLabel(durationMinutes)}-аар бандлаа. 🚫`,
      );
      setBanTargetId(null);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Алдаа гарлаа.');
    }
  }

  async function unban(id: number): Promise<void> {
    setError('');
    try {
      await adminUnbanUser(id);
      setNotice('Бан тайлагдлаа.');
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Алдаа гарлаа.');
    }
  }

  async function grantBanPermission(id: number): Promise<void> {
    setError('');
    try {
      await adminGrantBanPermission(id);
      setNotice('Жижиг админд бандах эрх олголоо.');
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Алдаа гарлаа.');
    }
  }

  async function revokeBanPermission(id: number): Promise<void> {
    setError('');
    try {
      await adminRevokeBanPermission(id);
      setNotice('Жижиг админы бандах эрхийг хураалаа.');
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Алдаа гарлаа.');
    }
  }

  async function setColor(id: number, color: string | null): Promise<void> {
    setError('');
    try {
      await setTextColor(id, color);
      setNotice(color ? 'Бичлэгийн өнгө оноолоо.' : 'Бичлэгийн өнгийг арилгалаа.');
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Алдаа гарлаа.');
    }
  }

  return (
    <div className="members">
      <h2>{isAdmin ? '👑 Том админ — Гишүүд' : '⚔️🛡️ Жижиг админ — Гишүүд'}</h2>
      <p className="muted">
        {isAdmin
          ? 'Зөвхөн та том админ. Жижиг админ (⚔️🛡️) нь бусдын пост, мессежийг устгаж чадна; бандах эрхийг та тусад нь олгоно.'
          : 'Танд бандах эрх олгосон тул гишүүдийг харж, энгийн хэрэглэгчийг бандаж болно.'}
      </p>
      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}

      {isAdmin && (
        <>
          <h3>🏰 Зөвшөөрөл хүссэн гишүүд ({requests.length})</h3>
          {requests.length === 0 ? (
            <p className="empty">Хүлээгдэж буй хүсэлт алга.</p>
          ) : (
            requests.map((r) => (
              <div key={r.id} className="member-row">
                <UserName user={r.user} showOnline />
                <div className="member-actions">
                  <button type="button" className="btn-primary small" onClick={() => void decide(r.id, true)}>
                    Зөвшөөрөх
                  </button>
                  <button type="button" className="btn-danger-ghost small" onClick={() => void decide(r.id, false)}>
                    Татгалзах
                  </button>
                </div>
              </div>
            ))
          )}
        </>
      )}

      {isAdmin && (
        <>
          <h3>🚫 Бантай хэрэглэгчид ({banLogs.filter((l) => l.status === 'active').length})</h3>
          <p className="muted small">Одоо бантай байгаа хэрэглэгчид — бан тайлахад эндээс шууд тайлж болно.</p>
          {banLogs.filter((l) => l.status === 'active').length === 0 ? (
            <p className="empty">Одоо бантай хэрэглэгч алга.</p>
          ) : (
            banLogs
              .filter((l) => l.status === 'active')
              .map((log) => (
                <div key={log.id} className="ban-log-row">
                  <div>
                    <strong>{log.user.name}</strong>
                    <span className="muted"> (@{log.user.username})</span>
                    <div className="muted small">
                      Бандсан: {log.bannedBy.name} · {formatDateTime(log.bannedAt)} · {durationLabel(log.durationMinutes)}
                      {log.expiresAt ? ` · дуусах: ${formatDateTime(log.expiresAt)}` : ' · Байнга'}
                    </div>
                  </div>
                  <button type="button" className="btn-primary small" onClick={() => void unban(log.user.id)}>
                    Бан цуцлах
                  </button>
                </div>
              ))
          )}
        </>
      )}

      {isAdmin && (
        <>
          <h3>📜 Бангийн түүх ({banLogs.length})</h3>
          <p className="muted small">Хэн, хэнийг, хэр хугацаагаар бандсан нь энд харагдана. Хугацаа нь дууссан бан автоматаар тайлагдаж, «Хугацаа дууссан» гэж тэмдэглэгдэнэ.</p>
          {banLogs.length === 0 ? (
            <p className="empty">Одоохондоо бангийн түүх алга.</p>
          ) : (
            banLogs.map((log) => (
              <div key={log.id} className="ban-log-row">
                <div>
                  <strong>{log.bannedBy.name}</strong>
                  <span className="muted"> бандлаа: </span>
                  <strong>{log.user.name}</strong>
                  <span className="muted"> (@{log.user.username})</span>
                  <div className="muted small">
                    {formatDateTime(log.bannedAt)} · {durationLabel(log.durationMinutes)}
                    {log.expiresAt ? ` · дуусах: ${formatDateTime(log.expiresAt)}` : ''}
                    {log.unbannedAt
                      ? ` · ${log.autoExpired ? 'хугацаа дуусч тайлагдсан' : `тайлсан: ${log.unbannedBy ? log.unbannedBy.name : ''} (${formatDateTime(log.unbannedAt)})`}`
                      : ''}
                  </div>
                </div>
                <span className={log.status === 'active' ? 'banned-badge' : 'muted small'}>
                  {statusLabel(log.status)}
                </span>
              </div>
            ))
          )}
        </>
      )}

      <h3>👥 Бүх гишүүд ({members.length})</h3>
      {members.map((row) => (
        <div key={row.user.id} className="member-row">
          <Avatar user={row.user} showDot onClick={() => onViewProfile(row.user.id)} />
          <div>
            <UserName user={row.user} />
            {isBannedUser(row.user) && (
              <span className="banned-badge">
                {row.user.banned
                  ? '🚫 Байнга бантай'
                  : `🚫 Бантай: ${row.user.bannedUntil ? formatDateTime(row.user.bannedUntil) : ''} хүртэл`}
              </span>
            )}
            <div className="muted small">
              {row.user.online ? '🟢 Онлайн — одоо байна' : '⚪ Офлайн'}
            </div>
            <div className="muted small">Зөвшөөрөлтэй өрөө: {accessLabel(row)}</div>
            {row.user.role === 'moderator' && (
              <div className="muted small">
                Бандах эрх: {row.user.canBan ? 'Олгосон ✅' : 'Олгоогүй'}
              </div>
            )}
            {isAdmin && (
              <TextColorPicker userId={row.user.id} current={row.user.textColor} onPick={(id, color) => void setColor(id, color)} />
            )}
          </div>
          <div className="member-actions">
            {row.user.id !== user.id && (
              <button type="button" className="btn-ghost small" onClick={() => onOpenDm(row.user.id)}>
                💬 Чат
              </button>
            )}
            {isAdmin && row.user.role === 'member' && (
              <button type="button" className="btn-ghost small" onClick={() => void grant(row.user.id)}>
                ⚔️🛡️ Жижиг админ болгох
              </button>
            )}
            {isAdmin && row.user.role === 'moderator' && (
              <>
                {row.user.canBan ? (
                  <button type="button" className="btn-ghost small" onClick={() => void revokeBanPermission(row.user.id)}>
                    Бандах эрхийг хураах
                  </button>
                ) : (
                  <button type="button" className="btn-ghost small" onClick={() => void grantBanPermission(row.user.id)}>
                    🚫 Бандах эрх олгох
                  </button>
                )}
                <button type="button" className="btn-danger-ghost small" onClick={() => void revoke(row.user.id)}>
                  Жижиг админ эрхийг хураах
                </button>
              </>
            )}
            {canBanRow(row) &&
              (isBannedUser(row.user) ? (
                <button type="button" className="btn-primary small" onClick={() => void unban(row.user.id)}>
                  Бан тайлах
                </button>
              ) : banTargetId === row.user.id ? (
                <span className="ban-chooser">
                  <span className="muted small">Хугацаа:</span>
                  {([5, 15, 30, 1440] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      className="btn-danger-ghost small"
                      onClick={() => void ban(row.user.id, row.user.name, m)}
                    >
                      {durationLabel(m)}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="btn-danger-ghost small"
                    onClick={() => void ban(row.user.id, row.user.name, null)}
                  >
                    Байнга
                  </button>
                  <button type="button" className="btn-ghost small" onClick={() => setBanTargetId(null)}>
                    Цуцлах
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="btn-danger-ghost small"
                  onClick={() => setBanTargetId(row.user.id)}
                >
                  🚫 Бандах
                </button>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
