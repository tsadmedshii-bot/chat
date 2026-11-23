// Хэрэглэгчийн профайл цонх — ямар ч хэрэглэгчийн зураг дээр дарахад нээгдэнэ.
// Том зураг, нэр, эрх, онлайн төлөв, гишүүн болсон өдөр, постын тоо.
// Том зураг дээр дарахад дэлгэц дүүрэн харагдана (Lightbox).
import { useEffect, useState } from 'react';
import type { User, UserProfile } from '../../../shared/src/types';
import { ApiError, adminBanUser, adminUnbanUser, getUserProfile, me } from '../api';
import { Avatar, RoleBadge } from './UserBadge';
import Lightbox from './Lightbox';

/** Бангийн хугацааны шошго — Гишүүд хуудасныхтай ижил. */
function durationLabel(minutes: number | null): string {
  if (minutes === null) return 'Байнга';
  if (minutes === 1440) return '24 цаг';
  return `${minutes} минут`;
}

/** Бан дуусах цагийг хүн уншихад амар хэлбэрээр харуулна. */
function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('mn-MN', {
    timeZone: 'Asia/Ulaanbaatar',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Хэрэглэгч одоо бантай эсэх — байнга бан ЭСВЭЛ хугацаа нь дуусаагүй бан. */
function isBannedUser(u: User): boolean {
  if (u.banned) return true;
  return u.bannedUntil !== null && new Date(u.bannedUntil).getTime() > Date.now();
}

/** "Сүүлд идэвхтэй" цагийг хүн уншихад амар хэлбэрээр харуулна. */
function lastSeenText(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'дөнгөж сая';
  if (min < 60) return `${min} минутын өмнө`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} цагийн өмнө`;
  return new Date(iso).toLocaleDateString('mn-MN', { year: 'numeric', month: 'long', day: 'numeric' });
}

export default function ProfileModal({
  userId,
  viewer,
  onClose,
  onOpenDm,
  onUserChange,
}: {
  userId: number;
  viewer: User;
  onClose: () => void;
  onOpenDm: (userId: number) => void;
  onUserChange?: (u: User) => void;
}) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [lightbox, setLightbox] = useState(false);
  const [freshViewer, setFreshViewer] = useState<User | null>(null);
  const [choosing, setChoosing] = useState(false);

  useEffect(() => {
    let alive = true;
    setProfile(null);
    setError('');
    setNotice('');
    setFreshViewer(null);
    setChoosing(false);
    void getUserProfile(userId)
      .then((p) => {
        if (alive) setProfile(p);
      })
      .catch((err) => {
        if (alive) setError(err instanceof ApiError ? err.message : 'Профайл ачааллахад алдаа гарлаа.');
      });
    // Харагдаж байгаа хүний эрхийг шинээр авна — нэвтэрчихсэн байхад нь
    // бандах эрх олгогдсон бол дахин нэвтрэхгүйгээр товч нь гарна.
    // (Гишүүд хуудасны засвартай ижил сургамж.) Амжилтгүй бол props-оор
    // дамжсан viewer-ийг хэрэглэнэ.
    void me()
      .then((u) => {
        if (!alive) return;
        setFreshViewer(u);
        if ((u.role !== viewer.role || u.canBan !== viewer.canBan) && onUserChange) {
          onUserChange(u);
        }
      })
      .catch(() => {
        // Шинээр авч чадахгүй бол хуучин viewer-ээ хэрэглэнэ.
      });
    return () => {
      alive = false;
    };
  }, [userId]);

  // Escape: эхлээд том зургийг, дараа нь цонхыг хаана.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key !== 'Escape') return;
      if (lightbox) setLightbox(false);
      else onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox, onClose]);

  const user = profile?.user ?? null;
  const viewerNow = freshViewer ?? viewer;

  // Энэ хэрэглэгчийг бандаж болох эсэх (UI түвшинд; сервер дахин шалгана).
  // Серверийн canBanTarget-тай яг ижил дүрэм: өөрийгөө болохгүй; том админ
  // админаас бусдыг бандаж болно; жижиг админ зөвхөн энгийн хэрэглэгчийг
  // бандаж чадна — том админ болон өөр жижиг админыг бандаж болохгүй.
  const canBan = user !== null && ((): boolean => {
    if (user.id === viewerNow.id) return false;
    if (viewerNow.role === 'admin') return user.role !== 'admin';
    return viewerNow.role === 'moderator' && viewerNow.canBan && user.role === 'member';
  })();

  async function ban(durationMinutes: number | null): Promise<void> {
    if (!user) return;
    setError('');
    setNotice('');
    try {
      await adminBanUser(user.id, durationMinutes);
      setNotice(
        durationMinutes === null
          ? `«${user.name}» хэрэглэгчийг байнга бандлаа. 🚫`
          : `«${user.name}» хэрэглэгчийг ${durationLabel(durationMinutes)}-аар бандлаа. 🚫`,
      );
      setChoosing(false);
      setProfile(await getUserProfile(user.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Алдаа гарлаа.');
    }
  }

  async function unban(): Promise<void> {
    if (!user) return;
    setError('');
    setNotice('');
    try {
      await adminUnbanUser(user.id);
      setNotice('Бан тайлагдлаа.');
      setProfile(await getUserProfile(user.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Алдаа гарлаа.');
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="profile-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose} aria-label="Хаах">
          ✕
        </button>
        {error ? (
          <p className="error">{error}</p>
        ) : !user || !profile ? (
          <p className="muted">Ачааллаж байна…</p>
        ) : (
          <>
            <Avatar
              user={user}
              size="large"
              showDot
              onClick={user.avatar ? () => setLightbox(true) : undefined}
            />
            <h2>{user.name}</h2>
            <p className="muted">@{user.username}</p>
            <div className="profile-modal-badges">
              <RoleBadge role={user.role} />
              {isBannedUser(user) && (
                <span className="banned-badge">
                  🚫 Бандуулсан
                  {user.bannedUntil ? ` · ${formatDateTime(user.bannedUntil)} хүртэл` : ''}
                </span>
              )}
            </div>
            <p className="muted">
              {user.online ? '🟢 Онлайн — одоо байна' : '⚪ Офлайн'}
              {!user.online && user.lastSeenAt ? ` · Сүүлд идэвхтэй: ${lastSeenText(user.lastSeenAt)}` : ''}
            </p>
            <div className="profile-stats">
              <div>
                <strong>{profile.postCount}</strong>
                <span>Пост</span>
              </div>
              <div>
                <strong>{new Date(user.createdAt).toLocaleDateString('mn-MN')}</strong>
                <span>Гишүүн болсон</span>
              </div>
            </div>
            {user.id !== viewerNow.id && (
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  onOpenDm(user.id);
                  onClose();
                }}
              >
                💬 Хувь чат
              </button>
            )}
            {canBan &&
              (isBannedUser(user) ? (
                <button type="button" className="btn-primary small" onClick={() => void unban()}>
                  Бан тайлах
                </button>
              ) : choosing ? (
                <span className="ban-chooser">
                  <span className="muted small">Хугацаа:</span>
                  {([5, 15, 30, 1440] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      className="btn-danger-ghost small"
                      onClick={() => void ban(m)}
                    >
                      {durationLabel(m)}
                    </button>
                  ))}
                  <button type="button" className="btn-danger-ghost small" onClick={() => void ban(null)}>
                    Байнга
                  </button>
                  <button type="button" className="btn-ghost small" onClick={() => setChoosing(false)}>
                    Цуцлах
                  </button>
                </span>
              ) : (
                <button type="button" className="btn-danger-ghost" onClick={() => setChoosing(true)}>
                  🚫 Бандах
                </button>
              ))}
            {notice && <p className="notice">{notice}</p>}
            {error && <p className="error">{error}</p>}
            {user.avatar && <p className="muted small">Зургийг томруулж харахын тулд дарна уу.</p>}
          </>
        )}
      </div>
      {lightbox && user?.avatar && <Lightbox src={user.avatar} alt={user.name} onClose={() => setLightbox(false)} />}
    </div>
  );
}
