import { useCallback, useEffect, useState } from 'react';
import type { AccessRequest, MemberRow, User } from '../../../shared/src/types';
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
} from '../api';
import UserName, { Avatar } from '../components/UserBadge';

function accessLabel(row: MemberRow): string {
  if (row.privateAccess === 'auto') return 'Автомат (админ)';
  if (row.privateAccess === 'approved') return 'Зөвшөөрсөн';
  if (row.privateAccess === 'pending') return 'Хүлээгдэж байна';
  if (row.privateAccess === 'denied') return 'Татгалзсан';
  return 'Хүсэлтгүй';
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

  async function ban(id: number, name: string): Promise<void> {
    if (!window.confirm(`«${name}» хэрэглэгчийг бандах уу? Бандуулсан хэрэглэгч нэвтэрч, пост оруулж, чат бичиж чадахгүй болно.`)) return;
    setError('');
    try {
      await adminBanUser(id);
      setNotice('Хэрэглэгчийг бандлаа. 🚫');
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

      <h3>👥 Бүх гишүүд ({members.length})</h3>
      {members.map((row) => (
        <div key={row.user.id} className="member-row">
          <Avatar user={row.user} showDot onClick={() => onViewProfile(row.user.id)} />
          <div>
            <UserName user={row.user} />
            {row.user.banned && <span className="banned-badge">🚫 Бандуулсан</span>}
            <div className="muted small">
              {row.user.online ? '🟢 Онлайн — одоо байна' : '⚪ Офлайн'}
            </div>
            <div className="muted small">Зөвшөөрөлтэй өрөө: {accessLabel(row)}</div>
            {row.user.role === 'moderator' && (
              <div className="muted small">
                Бандах эрх: {row.user.canBan ? 'Олгосон ✅' : 'Олгоогүй'}
              </div>
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
              (row.user.banned ? (
                <button type="button" className="btn-primary small" onClick={() => void unban(row.user.id)}>
                  Бан тайлах
                </button>
              ) : (
                <button type="button" className="btn-danger-ghost small" onClick={() => void ban(row.user.id, row.user.name)}>
                  🚫 Бандах
                </button>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
