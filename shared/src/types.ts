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
  /** Жижиг админд өнгө/фонт сонгох эрх олгосон эсэх (зөвхөн moderator-д хамаарна). */
  canStyle: boolean;
  /** Жижиг админы сонгосон фонтын түлхүүр — эрх нь байж байж л
      харагдана, байхгүй бол null. */
  textFont: string | null;
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

/** Одоо зөвхөн нийтийн өрөө л байна — зөвшөөрөлтэй өрөөг хаасан. */
export type Room = 'public';

/** Өрөөний мессежийн төрөл: 'user' = энгийн мессеж,
    'welcome' = шинэ гишүүн бүртгүүлэхэд гардаг системийн угтах мессеж. */
export type MessageKind = 'user' | 'welcome';

/** Системийн бичлэгийн (угтах мессеж, хариултын эшлэл) харагдах нэр. */
export const SYSTEM_NAME = 'Систем';

/** Эможи урвалын зөвшөөрөгдсөн багц (өрөөний мессеж, хувь чат, сэтгэгдэлд). */
export const REACTION_EMOJIS = ['❤️', '😂', '👍', '😮', '😢', '😡', '🔥', '🎉'] as const;

/** Жижиг админы сонгож болох 7 гоёмсог фонт — бүгд Кирилл (Монгол) +
    Латин (Англи) дэмждэг нь Google Fonts-оор баталгаажсан.
    Playfair Display энд байхгүй — тэр нь зөвхөн том админых. */
export const STYLE_FONTS = [
  { key: 'lobster', name: 'Lobster', cssClass: 'font-lobster' },
  { key: 'pacifico', name: 'Pacifico', cssClass: 'font-pacifico' },
  { key: 'caveat', name: 'Caveat', cssClass: 'font-caveat' },
  { key: 'cormorant', name: 'Cormorant Garamond', cssClass: 'font-cormorant' },
  { key: 'comfortaa', name: 'Comfortaa', cssClass: 'font-comfortaa' },
  { key: 'yeseva', name: 'Yeseva One', cssClass: 'font-yeseva' },
  { key: 'neucha', name: 'Neucha', cssClass: 'font-neucha' },
] as const;

export type TextFontKey = (typeof STYLE_FONTS)[number]['key'];

/** Сервер талд фонтын түлхүүр зөв эсэхийг шалгахад хэрэглэнэ. */
export const TEXT_FONT_KEYS: readonly string[] = STYLE_FONTS.map((f) => f.key);

export type ReactionTargetType = 'message' | 'dm' | 'comment';

/** Нэг эможигийн тоо + би өөрөө дарсан эсэх. */
export interface ReactionCount {
  emoji: string;
  count: number;
  reactedByMe: boolean;
}

/** Хариултын эшлэл — эх текстийн snapshot (нэр + текст). Эх нь
    15 минутын дараа устахад ч эшлэл уншигдах хэвээр байна. */
export interface ReplyQuote {
  authorName: string;
  text: string;
}

export interface PostComment {
  id: number;
  postId: number;
  author: User;
  content: string;
  replyTo: ReplyQuote | null;
  /** Зассан цаг (ISO) — засагдаагүй бол null. */
  editedAt: string | null;
  reactions: ReactionCount[];
  createdAt: string;
}

export interface Post {
  id: number;
  author: User;
  content: string;
  likeCount: number;
  likedByMe: boolean;
  comments: PostComment[];
  /** Зассан цаг (ISO) — засагдаагүй бол null. */
  editedAt: string | null;
  createdAt: string;
}

export interface ChatMessage {
  id: number;
  room: Room;
  kind: MessageKind;
  /** Зохиогч — угтах мессежид хүн зохиогч байхгүй тул null. */
  author: User | null;
  content: string;
  replyTo: ReplyQuote | null;
  /** Зассан цаг (ISO) — засагдаагүй бол null. */
  editedAt: string | null;
  reactions: ReactionCount[];
  createdAt: string;
}

export interface MemberRow {
  user: User;
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
  replyTo: ReplyQuote | null;
  /** Зассан цаг (ISO) — засагдаагүй бол null. */
  editedAt: string | null;
  reactions: ReactionCount[];
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
