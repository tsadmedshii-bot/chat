import { useEffect, useRef, useState } from 'react';
import type { User } from '../../../shared/src/types';
import { STYLE_FONTS } from '../../../shared/src/types';
import { ApiError, deleteMyAccount, getUserProfile, logout, me, removeAvatar, setMyStyle, uploadAvatar } from '../api';
import InstallApp from '../components/InstallApp';
import { Avatar, RoleBadge } from '../components/UserBadge';
import Lightbox from '../components/Lightbox';

/** Бичлэгийн өнгөний бэлэн сонголтууд («Гишүүд» хуудасныхтай ижил). */
const PRESET_COLORS = ['#D4AF37', '#E5484D', '#3E63DD', '#30A46C', '#8E4EC6', '#D6409F', '#F76B15', '#12A594'];

/**
 * Зургийг 512x512 JPEG (чанар 0.8) болгон жижигрүүлж data URL буцаана.
 * Төв хэсгийг дөрвөлжин тасалж авна — зураг сунахгүй. 512px нь томруулж
 * харахад ч хангалттай тод, файлын хэмжээ 500 KB хязгаарт багтана.
 */
function resizeImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Зураг уншиж чадсангүй'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Зураг нээж чадсангүй'));
      img.onload = () => {
        const size = 512;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Зураг боловсруулж чадсангүй'));
          return;
        }
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export default function Profile({ user, onUserChange, onAccountDeleted }: { user: User; onUserChange: (u: User) => void; onAccountDeleted: () => void }) {
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [uploading, setUploading] = useState(false);
  const [postCount, setPostCount] = useState<number | null>(null);
  const [lightbox, setLightbox] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  // Профайл устгах баталгаажуулалт.
  const [showDelete, setShowDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);
  // Өөрийн өнгө, фонт (зөвхөн canStyle эрхтэй жижиг админ).
  const [myColor, setMyColor] = useState<string | null>(user.textColor);
  const [myFont, setMyFont] = useState<string | null>(user.textFont);
  const [customColor, setCustomColor] = useState(user.textColor ?? '#D4AF37');
  const [savingStyle, setSavingStyle] = useState(false);

  // Хуудас нээгдэхэд өөрийн эрхийг серверээс дахин авна: нэвтэрсэн
  // хэвээр байхдаа эрх авсан бол хуучирсан төлөвөөс болоод сонгогч нь
  // харагдахгүй байх алдааг засна (Members-тэй ижил).
  useEffect(() => {
    let alive = true;
    void me()
      .then((fresh) => {
        if (!alive) return;
        if (fresh.canStyle !== user.canStyle || fresh.textColor !== user.textColor || fresh.textFont !== user.textFont) {
          onUserChange(fresh);
          setMyColor(fresh.textColor);
          setMyFont(fresh.textFont);
          setCustomColor(fresh.textColor ?? '#D4AF37');
        }
      })
      .catch(() => {
        // Ачаалж чадсангүй — хуучин хэрэглэгчээр үргэлжлүүлнэ.
      });
    return () => {
      alive = false;
    };
    // Зөвхөн хуудас нээгдэхэд нэг удаа.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Постын тоог профайлаас авна.
  useEffect(() => {
    let alive = true;
    void getUserProfile(user.id)
      .then((p) => {
        if (alive) setPostCount(p.postCount);
      })
      .catch(() => {
        // Тоо ачааллахад алдаа гарвал харуулахгүй.
      });
    return () => {
      alive = false;
    };
  }, [user.id]);

  // Escape: том зургийг хаана.
  useEffect(() => {
    if (!lightbox) return;
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') setLightbox(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setNotice('');
    if (!file.type.startsWith('image/')) {
      setError('Зөвхөн зураг сонгоно уу');
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      const updated = await uploadAvatar(dataUrl);
      onUserChange(updated);
      setNotice('Профайл зураг солигдлоо. ✅');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Зураг оруулахад алдаа гарлаа.');
    } finally {
      setUploading(false);
    }
  }

  async function onRemove(): Promise<void> {
    if (!window.confirm('Профайл зургаа устгах уу?')) return;
    setError('');
    setNotice('');
    try {
      const updated = await removeAvatar();
      onUserChange(updated);
      setNotice('Профайл зураг устгагдлаа.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Зураг устгахад алдаа гарлаа.');
    }
  }

  /** Өөрийн бичлэгийн өнгө, фонтыг хадгална — сонгох бүрд шууд хэрэглэгдэнэ. */
  async function saveStyle(color: string | null, font: string | null): Promise<void> {
    setError('');
    setNotice('');
    setSavingStyle(true);
    try {
      const updated = await setMyStyle(color, font);
      onUserChange(updated);
      setMyColor(updated.textColor);
      setMyFont(updated.textFont);
      setCustomColor(updated.textColor ?? '#D4AF37');
      setNotice('Өнгө, фонт хадгалагдлаа. ✅');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Хадгалахад алдаа гарлаа.');
    } finally {
      setSavingStyle(false);
    }
  }

  async function onDeleteAccount(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setDeleteError('');
    setDeleting(true);
    try {
      await deleteMyAccount(deletePassword);
      logout();
      onAccountDeleted();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'Профайл устгахад алдаа гарлаа.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="profile">
      <div className="profile-card">
        <Avatar user={user} size="large" showDot onClick={user.avatar ? () => setLightbox(true) : undefined} />
        <h2>{user.name}</h2>
        <p className="muted">@{user.username}</p>
        <div className="profile-modal-badges">
          <RoleBadge role={user.role} />
        </div>
        <div className="profile-stats">
          <div>
            <strong>{postCount ?? '—'}</strong>
            <span>Пост</span>
          </div>
          <div>
            <strong>{new Date(user.createdAt).toLocaleDateString('mn-MN')}</strong>
            <span>Гишүүн болсон</span>
          </div>
          <div>
            <strong>{user.online ? '🟢 Онлайн' : '⚪ Офлайн'}</strong>
            <span>Төлөв</span>
          </div>
        </div>

        {error && <p className="error">{error}</p>}
        {notice && <p className="notice">{notice}</p>}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => void onPickFile(e)}
        />
        <div className="profile-actions">
          <button type="button" className="btn-primary" disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? 'Ачааллаж байна…' : user.avatar ? '📷 Зураг солих' : '📷 Зураг оруулах'}
          </button>
          {user.avatar && (
            <button type="button" className="btn-danger-ghost" disabled={uploading} onClick={() => void onRemove()}>
              Зураг устгах
            </button>
          )}
        </div>
        <p className="muted small">
          Зураг автоматаар 512×512 хэмжээтэй болж жижигрэнэ. Зөвхөн JPEG, PNG, WebP — 500 KB хүртэл.
          {user.avatar ? ' Зургийг томруулж харахын тулд дарна уу.' : ''}
        </p>

        {user.role === 'moderator' && user.canStyle && (
          <div className="style-section">
            <h3>🎨 Миний бичлэгийн өнгө, фонт</h3>
            <p className="muted small">
              Том админ танд энэ эрхийг олгосон тул өөрийн өнгө, фонтыг эндээс сонгоно.
              Сонгосон өнгө, фонт нь таны нийтийн чат болон хувь чатын бичлэгт харагдана.
              Эрх хураагдвал фонт нь харагдахгүй болно.
            </p>
            <div className="color-picker">
              <span className="muted small">Бичлэгийн өнгө:</span>
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={myColor === c ? 'color-swatch active' : 'color-swatch'}
                  style={{ backgroundColor: c }}
                  title={c}
                  aria-label={`Өнгө ${c}`}
                  disabled={savingStyle}
                  onClick={() => void saveStyle(c, myFont)}
                />
              ))}
              <input
                type="color"
                value={customColor}
                onChange={(e) => setCustomColor(e.target.value)}
                title="Өөр өнгө сонгох"
                aria-label="Өөр өнгө сонгох"
              />
              <button type="button" className="btn-ghost small" disabled={savingStyle} onClick={() => void saveStyle(customColor, myFont)}>
                Сонгох
              </button>
              {myColor && (
                <button type="button" className="btn-ghost small" disabled={savingStyle} onClick={() => void saveStyle(null, myFont)}>
                  Арилгах
                </button>
              )}
            </div>
            <div className="font-picker">
              <span className="muted small">Фонт (7 гоёмсог фонт — Монгол, Англи хэл дээр бичиж болно):</span>
              <button
                type="button"
                className={myFont === null ? 'font-option active' : 'font-option'}
                disabled={savingStyle}
                onClick={() => void saveStyle(myColor, null)}
              >
                Энгийн — Сайн уу
              </button>
              {STYLE_FONTS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  className={myFont === f.key ? `font-option active ${f.cssClass}` : `font-option ${f.cssClass}`}
                  disabled={savingStyle}
                  onClick={() => void saveStyle(myColor, f.key)}
                >
                  {f.name} — Сайн уу
                </button>
              ))}
            </div>
            {savingStyle && <p className="muted small">Хадгалж байна…</p>}
          </div>
        )}

        <InstallApp />

        <div className="danger-zone">
          <h3>⚠️ Аюултай бүс</h3>
          {user.role === 'admin' ? (
            <p className="muted small">
              Том админ өөрийн профайлыг устгах боломжгүй — чат админгүй үлдэнэ.
            </p>
          ) : !showDelete ? (
            <button type="button" className="btn-danger" onClick={() => setShowDelete(true)}>
              🗑️ Профайл устгах
            </button>
          ) : (
            <form onSubmit={(e) => void onDeleteAccount(e)} className="delete-confirm">
              <p>
                Профайлаа устгавал дараах зүйлс <strong>бүрмөсөн</strong> арилна, буцааж сэргээх
                боломжгүй:
              </p>
              <ul>
                <li>Профайл зураг</li>
                <li>Постууд, сэтгэгдлүүд, таалагдсан тэмдэгтүүд</li>
                <li>Өрөөний мессежүүд</li>
                <li>Хувь чатууд</li>
              </ul>
              <label>
                Баталгаажуулахын тулд нууц үгээ оруулна уу
                <input
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  placeholder="Нууц үг"
                  autoComplete="current-password"
                />
              </label>
              {deleteError && <p className="error">{deleteError}</p>}
              <div className="profile-actions">
                <button type="submit" className="btn-danger" disabled={deleting || deletePassword.length === 0}>
                  {deleting ? 'Устгаж байна…' : 'Тийм, устгая'}
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={deleting}
                  onClick={() => {
                    setShowDelete(false);
                    setDeletePassword('');
                    setDeleteError('');
                  }}
                >
                  Цуцлах
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
      {lightbox && user.avatar && <Lightbox src={user.avatar} alt={user.name} onClose={() => setLightbox(false)} />}
    </div>
  );
}
