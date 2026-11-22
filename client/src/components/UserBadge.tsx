// Хэрэглэгчийн нэрний ДЭЭР гардаг эрхний тэмдэг.
import type { User } from '../../../shared/src/types';

export function RoleBadge({ role }: { role: User['role'] }) {
  if (role === 'admin') {
    return <span className="role-badge role-admin">👑 ТОМ АДМИН</span>;
  }
  if (role === 'moderator') {
    return <span className="role-badge role-moderator">⚔️🛡️ ЖИЖИГ АДМИН</span>;
  }
  return null;
}

/** 🟢 онлайн / ⚪ офлайн цэг. */
export function OnlineDot({ online }: { online: boolean }) {
  return (
    <span
      className={online ? 'online-dot online' : 'online-dot offline'}
      title={online ? 'Онлайн — одоо байна' : 'Офлайн'}
    />
  );
}

export type AvatarSize = 'small' | 'medium' | 'large';

/**
 * Профайл зураг: зураг байвал дугуйгаар харуулж, байхгүй бол нэрний
 * эхний үсэгтэй өнгөт дугуй харуулна. showDot бол онлайн цэгийг давхарлана.
 */
export function Avatar({ user, size = 'medium', showDot = false }: { user: User; size?: AvatarSize; showDot?: boolean }) {
  const cls = size === 'small' ? 'avatar small' : size === 'large' ? 'avatar large' : 'avatar';
  const inner = user.avatar ? (
    <img className={cls} src={user.avatar} alt={user.name} />
  ) : (
    <span className={cls}>{user.name.slice(0, 1).toUpperCase()}</span>
  );
  if (!showDot) return inner;
  return (
    <span className="avatar-wrap">
      {inner}
      <OnlineDot online={user.online} />
    </span>
  );
}

/** Нэр + түүний дээрх тэмдгийг хамт харуулна. */
export default function UserName({ user, className, showOnline = false }: { user: User; className?: string; showOnline?: boolean }) {
  return (
    <span className={className ?? 'user-name'}>
      <RoleBadge role={user.role} />
      <span className="user-name-text">
        {user.name}
        {showOnline && <OnlineDot online={user.online} />}
      </span>
      <span className="user-username">@{user.username}</span>
    </span>
  );
}
