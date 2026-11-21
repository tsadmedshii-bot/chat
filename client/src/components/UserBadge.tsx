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

/** Нэр + түүний дээрх тэмдгийг хамт харуулна. */
export default function UserName({ user, className }: { user: User; className?: string }) {
  return (
    <span className={className ?? 'user-name'}>
      <RoleBadge role={user.role} />
      <span className="user-name-text">{user.name}</span>
      <span className="user-username">@{user.username}</span>
    </span>
  );
}
