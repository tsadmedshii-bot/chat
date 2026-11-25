import { boolean, integer, pgTable, serial, text, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 60 }).notNull(),
  username: varchar('username', { length: 30 }).notNull(),
  passwordHash: text('password_hash').notNull(),
  role: varchar('role', { length: 10 }).notNull().default('member'),
  banned: boolean('banned').notNull().default(false),
  /** Хугацаатай бан дуусах цаг — NULL = хугацаатай бан байхгүй. Байнга бан нь
      `banned` (boolean) баганаар тэмдэглэгдэнэ. */
  bannedUntil: timestamp('banned_until'),
  /** Жижиг админд бандах эрх олгосон эсэх — зөвхөн том админ асааж/унтраана. Анхдагчаар false. */
  canBan: boolean('can_ban').notNull().default(false),
  /** Жижиг админд өнгө/фонт сонгох эрх олгосон эсэх — зөвхөн том админ
      асааж/унтраана, зөвхөн жижиг админд (moderator) хамаарна. */
  canStyle: boolean('can_style').notNull().default(false),
  /** Ёс зүйн гэрээ — жижиг админ өөрөө зөвшөөрсөн цаг (NULL = зөвшөөрөөгүй).
      Хоёр цаг (энэ + agreement_admin_at) хоёул тогтсон үед гэрээ бүрэн
      баталгаажиж, жижиг админы бүх эрх автоматаар идэвхжинэ. */
  agreementMiniAt: timestamp('agreement_mini_at'),
  /** Ёс зүйн гэрээ — том админ тухайн жижиг админы гэрээг зөвшөөрсөн цаг. */
  agreementAdminAt: timestamp('agreement_admin_at'),
  /** Жижиг админы сонгосон фонтын түлхүүр (жишээ нь 'lobster') —
      NULL = энгийн фонт. Эрх хураагдсан үед ч утга нь хадгалагдана. */
  textFont: text('text_font'),
  /** Сүүлд идэвхтэй байсан цаг — heartbeat / нэвтрэлт / бүртгэлээс шинэчлэгдэнэ. */
  lastSeenAt: timestamp('last_seen_at'),
  /** Профайл зураг — data URL (JPEG/PNG/WebP, 500 KB хүртэл). */
  avatar: text('avatar'),
  /** Бичлэгийн өнгө ('#RRGGBB') — зөвхөн том админ онооно. NULL = анхдагч өнгө. */
  textColor: text('text_color'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [uniqueIndex('users_username_unique').on(t.username)]);

export const sessions = pgTable('sessions', {
  token: text('token').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const posts = pgTable('posts', {
  id: serial('id').primaryKey(),
  authorId: integer('author_id').notNull().references(() => users.id),
  content: text('content').notNull(),
  /** Зассан цаг — NULL = засагдаагүй. */
  editedAt: timestamp('edited_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const postLikes = pgTable('post_likes', {
  id: serial('id').primaryKey(),
  postId: integer('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [uniqueIndex('post_likes_post_user_unique').on(t.postId, t.userId)]);

export const postComments = pgTable('post_comments', {
  id: serial('id').primaryKey(),
  postId: integer('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  authorId: integer('author_id').notNull().references(() => users.id),
  content: text('content').notNull(),
  /** Хариулж буй сэтгэгдэл — snapshot (нэр + текст) хадгална.
      Гадаад түлхүүр (ON DELETE SET NULL) нь зөвхөн шилжилт 0005-д
      байгаа — schema-д өөрөөсөө хамаарах references нь TypeScript-ийн
      мөчлөгт төрлийн алдаа үүсгэдэг тул энд энгийн баганаар тэмдэглэнэ. */
  replyToId: integer('reply_to_id'),
  replyAuthorName: text('reply_author_name'),
  replyText: text('reply_text'),
  /** Зассан цаг — NULL = засагдаагүй. */
  editedAt: timestamp('edited_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const messages = pgTable('messages', {
  id: serial('id').primaryKey(),
  room: varchar('room', { length: 10 }).notNull(),
  /** Мессежийн төрөл: 'user' = энгийн мессеж, 'welcome' = шинэ гишүүн
      бүртгүүлэхэд гардаг системийн угтах мессеж. */
  kind: varchar('kind', { length: 10 }).notNull().default('user'),
  /** Зохиогч — угтах мессежид хүн зохиогч байхгүй тул NULL байж болно. */
  authorId: integer('author_id').references(() => users.id),
  content: text('content').notNull(),
  /** Хариулж буй мессеж — snapshot (нэр + текст) хадгална.
      Гадаад түлхүүр (ON DELETE SET NULL) нь зөвхөн шилжилт 0005-д
      байгаа (дээрх тайлбарыг харна уу). */
  replyToId: integer('reply_to_id'),
  replyAuthorName: text('reply_author_name'),
  replyText: text('reply_text'),
  /** Зассан цаг — NULL = засагдаагүй. Засвар нь 15 минутын устгах
      цагийг сунгадаггүй (created_at хэвээрээ). */
  editedAt: timestamp('edited_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

/** Эможи урвал — нэг хэрэглэгч нэг зүйл дээр нэг л урвал үлдээнэ.
    target_type: 'message' | 'dm' | 'comment'. */
export const reactions = pgTable('reactions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  targetType: varchar('target_type', { length: 20 }).notNull(),
  targetId: integer('target_id').notNull(),
  emoji: varchar('emoji', { length: 10 }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [uniqueIndex('reactions_user_target_unique').on(t.userId, t.targetType, t.targetId)]);

export const roomAccess = pgTable('room_access', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  status: varchar('status', { length: 10 }).notNull().default('pending'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  decidedAt: timestamp('decided_at'),
}, (t) => [uniqueIndex('room_access_user_unique').on(t.userId)]);

/** Бангийн түүх — хэн, хэнийг, хэр хугацаагаар бандсан, хэзээ тайлсан. */
export const banLogs = pgTable('ban_logs', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  bannedById: integer('banned_by_id').notNull().references(() => users.id),
  /** Бангийн хугацаа минутаар — NULL = байнга. */
  durationMinutes: integer('duration_minutes'),
  bannedAt: timestamp('banned_at').notNull().defaultNow(),
  expiresAt: timestamp('expires_at'),
  unbannedAt: timestamp('unbanned_at'),
  unbannedById: integer('unbanned_by_id').references(() => users.id),
  /** Хугацаа нь дуусч автоматаар тайлагдсан эсэх. */
  autoExpired: boolean('auto_expired').notNull().default(false),
});

/** Хувь чат (1:1) мессеж. */
export const directMessages = pgTable('direct_messages', {
  id: serial('id').primaryKey(),
  senderId: integer('sender_id').notNull().references(() => users.id),
  recipientId: integer('recipient_id').notNull().references(() => users.id),
  content: text('content').notNull(),
  /** Хариулж буй мессеж — snapshot (нэр + текст) хадгална.
      Гадаад түлхүүр (ON DELETE SET NULL) нь зөвхөн шилжилт 0005-д
      байгаа (дээрх тайлбарыг харна уу). */
  replyToId: integer('reply_to_id'),
  replyAuthorName: text('reply_author_name'),
  replyText: text('reply_text'),
  /** Зассан цаг — NULL = засагдаагүй. */
  editedAt: timestamp('edited_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

/** Хэн, хэний чатыг хэзээ хамгийн сүүлд уншсан — уншаагүй тоог тоолоход хэрэглэнэ. */
export const dmReads = pgTable('dm_reads', {
  userId: integer('user_id').notNull().references(() => users.id),
  partnerId: integer('partner_id').notNull().references(() => users.id),
  lastReadAt: timestamp('last_read_at').notNull().defaultNow(),
}, (t) => [uniqueIndex('dm_reads_user_partner_unique').on(t.userId, t.partnerId)]);
