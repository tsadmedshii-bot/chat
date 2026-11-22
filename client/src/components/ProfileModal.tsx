// Хэрэглэгчийн профайл цонх — ямар ч хэрэглэгчийн зураг дээр дарахад нээгдэнэ.
// Том зураг, нэр, эрх, онлайн төлөв, гишүүн болсон өдөр, постын тоо.
// Том зураг дээр дарахад дэлгэц дүүрэн харагдана (Lightbox).
import { useEffect, useState } from 'react';
import type { UserProfile } from '../../../shared/src/types';
import { ApiError, getUserProfile } from '../api';
import { Avatar, RoleBadge } from './UserBadge';
import Lightbox from './Lightbox';

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
  meId,
  onClose,
  onOpenDm,
}: {
  userId: number;
  meId: number;
  onClose: () => void;
  onOpenDm: (userId: number) => void;
}) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState('');
  const [lightbox, setLightbox] = useState(false);

  useEffect(() => {
    let alive = true;
    setProfile(null);
    setError('');
    void getUserProfile(userId)
      .then((p) => {
        if (alive) setProfile(p);
      })
      .catch((err) => {
        if (alive) setError(err instanceof ApiError ? err.message : 'Профайл ачааллахад алдаа гарлаа.');
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
              {user.banned && <span className="banned-badge">🚫 Бандуулсан</span>}
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
            {user.id !== meId && (
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
            {user.avatar && <p className="muted small">Зургийг томруулж харахын тулд дарна уу.</p>}
          </>
        )}
      </div>
      {lightbox && user?.avatar && <Lightbox src={user.avatar} alt={user.name} onClose={() => setLightbox(false)} />}
    </div>
  );
}
