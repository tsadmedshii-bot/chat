// Чат — клиент болон серверийн хооронд хуваалцдаг төрлүүд.
// API гэрээ: server/src/routes.ts болон client/src/api.ts энэ файлыг ашиглана.

export type Role = 'admin' | 'moderator' | 'member';

export interface User {
  id: number;
  name: string;
  username: string;
  role: Role;
  /** Том админаас бандуулсан эсэх — бандуулсан хэрэглэгч нэвтэрч чадахгүй. */
  banned: boolean;
  /** Хугацаатай бан дуусах цаг (ISO) — байхгүй бол null. Байнга бан нь
      `banned` талбараар тэмдэглэгдэнэ. */
  bannedUntil: string | null;
  /** Жижиг админд бандах эрх олгосон эсэх (зөвхөн moderator-д хамаарна). */
  canBan: boolean;
  /** Профайл зураг (data URL) — байхгүй бол null. */
  avatar: string | null;
  /** Бичлэгийн өнгө ('#RRGGBB') — зөвхөн том админ онооно, байхгүй бол null. */
  textColor: string | null;
  /** Сүүлд идэвхтэй байсан цаг (ISO) — хэзээ ч идэвхжээгүй бол null. */
  lastSeenAt: string | null;
  /** Сүүлийн 90 секундэд идэвхтэй байсан эсэх. */
  online: boolean;
  createdAt: string;
}

export type Room = 'public' | 'private';

export type AccessStatus = 'pending' | 'approved' | 'denied';

export interface PostComment {
  id: number;
  postId: number;
  author: User;
  content: string;
  createdAt: string;
}

export interface Post {
  id: number;
  author: User;
  content: string;
  likeCount: number;
  likedByMe: boolean;
  comments: PostComment[];
  createdAt: string;
}

export interface ChatMessage {
  id: number;
  room: Room;
  author: User;
  content: string;
  createdAt: string;
}

export interface AccessRequest {
  id: number;
  user: User;
  status: AccessStatus;
  createdAt: string;
}

export interface MemberRow {
  user: User;
  /** Зөвшөөрөлтэй өрөөнд нэвтрэх эрх: админ/жижиг админ автоматаар 'approved'. */
  privateAccess: AccessStatus | 'auto' | 'none';
}

/** Бангийн түүхийн нэг бичлэг (зөвхөн том админ харна). */
export interface BanLog {
  id: number;
  user: { id: number; username: string; name: string };
  bannedBy: { id: number; username: string; name: string };
  /** Бангийн хугацаа минутаар — null = байнга. */
  durationMinutes: number | null;
  bannedAt: string;
  expiresAt: string | null;
  unbannedAt: string | null;
  unbannedBy: { id: number; username: string; name: string } | null;
  autoExpired: boolean;
  /** active = идэвхтэй, expired = хугацаа дууссан, unbanned = гараар тайлсан. */
  status: 'active' | 'expired' | 'unbanned';
}

/** Хувь чат (1:1) мессеж. */
export interface DirectMessage {
  id: number;
  senderId: number;
  recipientId: number;
  content: string;
  createdAt: string;
}

/** Хувь чатын жагсаалтын нэг мөр — ярилцагч + сүүлийн мессеж + уншаагүй тоо. */
export interface DirectConversation {
  user: User;
  lastMessage: { content: string; createdAt: string; senderId: number } | null;
  unreadCount: number;
}

/** Хэрэглэгчийн профайл — нийтэд харагдах хэрэглэгч + түүний постын тоо. */
export interface UserProfile {
  user: User;
  postCount: number;
}
