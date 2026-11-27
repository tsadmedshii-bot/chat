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

/**
 * Тэнгэр элчийн тэмдэг — ЗӨВХӨН гоёлын тэмдэг, ямар ч эрх дагалдахгүй.
 * Том админ онцгой хүнд олгоно. Харагдах байдал: хар/бараан дэвсгэр дээр
 * цагаан далавчтай сахиусан тэнгэр (halo 😇 + цагаан далавч 🪽) —
 * алтан админ тэмдэг, slate-violet жижиг админ тэмдэг хоёроос ялгаатай.
 */
export function AngelBadge() {
  return (
    <span className="role-badge role-angel" title="Тэнгэр элч — том админы олгосон гоёлын тэмдэг">
      😇🪽 ТЭНГЭР ЭЛЧ
    </span>
  );
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
 * onClick өгвөл зураг дарагдах товч болно (профайл харах).
 */
export function Avatar({
  user,
  size = 'medium',
  showDot = false,
  onClick,
}: {
  user: User;
  size?: AvatarSize;
  showDot?: boolean;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const cls = size === 'small' ? 'avatar small' : size === 'large' ? 'avatar large' : 'avatar';
  const inner = user.avatar ? (
    <img className={cls} src={user.avatar} alt={user.name} />
  ) : (
    <span className={cls}>{user.name.slice(0, 1).toUpperCase()}</span>
  );
  const withDot = showDot ? (
    <span className="avatar-wrap">
      {inner}
      <OnlineDot online={user.online} />
    </span>
  ) : (
    inner
  );
  if (!onClick) return withDot;
  return (
    <button
      type="button"
      className="avatar-btn"
      onClick={(e) => {
        // Жагсаалтын мөрийн даралтыг давхардуулахгүй (DM жагсаалт гэх мэт).
        e.stopPropagation();
        onClick(e);
      }}
      aria-label={`${user.name} — профайл харах`}
    >
      {withDot}
    </button>
  );
}

/** Нэр + түүний дээрх тэмдгийг хамт харуулна. */
export default function UserName({ user, className, showOnline = false }: { user: User; className?: string; showOnline?: boolean }) {
  return (
    <span className={className ?? 'user-name'}>
      <RoleBadge role={user.role} />
      {user.isAngel && <AngelBadge />}
      <span className="user-name-text">
        {user.name}
        {showOnline && <OnlineDot online={user.online} />}
      </span>
      <span className="user-username">@{user.username}</span>
    </span>
  );
}
