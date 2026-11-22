import { useRef, useState } from 'react';
import type { User } from '../../../shared/src/types';
import { ApiError, removeAvatar, uploadAvatar } from '../api';
import { Avatar, RoleBadge } from '../components/UserBadge';

/**
 * Зургийг 256x256 JPEG (чанар 0.8) болгон жижигрүүлж data URL буцаана.
 * Төв хэсгийг дөрвөлжин тасалж авна — зураг сунахгүй.
 */
function resizeImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Зураг уншиж чадсангүй'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Зураг нээж чадсангүй'));
      img.onload = () => {
        const size = 256;
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

export default function Profile({ user, onUserChange }: { user: User; onUserChange: (u: User) => void }) {
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

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

  return (
    <div className="profile">
      <div className="profile-card">
        <Avatar user={user} size="large" showDot />
        <h2>{user.name}</h2>
        <p className="muted">@{user.username}</p>
        <RoleBadge role={user.role} />
        <p className="muted">
          {user.online ? '🟢 Онлайн — одоо байна' : '⚪ Офлайн'}
          {' · '}
          Бүртгүүлсэн: {new Date(user.createdAt).toLocaleDateString('mn-MN')}
        </p>

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
          Зураг автоматаар 256×256 хэмжээтэй болж жижигрэнэ. Зөвхөн JPEG, PNG, WebP — 500 KB хүртэл.
        </p>
      </div>
    </div>
  );
}
