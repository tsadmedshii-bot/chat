// Чат — /api чиглүүлэгч (бүх endpoint энд).
import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { and, asc, desc, eq, isNull, or } from 'drizzle-orm';
import { db } from './db';
import { directMessages, dmReads, messages, postComments, postLikes, posts, reactions, roomAccess, sessions, users, banLogs } from './schema';
import type { AuthUser } from './auth';
import { createSession, deleteSession, HttpError, banMessage, isBannedNow, registerUser, requireAdmin, requireAuth, verifyPassword, isAgreementComplete, effectiveCanBan, effectiveCanStyle } from './auth';
import type { BanLog, ChatMessage, DirectConversation, DirectMessage, MemberRow, MessageKind, Post, PostComment, ReactionCount, ReactionTargetType, ReplyQuote, Role, Room, User } from '../../shared/src/types';
import { REACTION_EMOJIS, SYSTEM_NAME, TEXT_FONT_KEYS } from '../../shared/src/types';

export const router = Router();

function toIso(d: Date): string {
  return d.toISOString();
}

/** Сүүлийн 90 секундэд идэвхтэй байсан хэрэглэгчийг онлайн гэж тооцно. */
const ONLINE_WINDOW_MS = 90_000;

function isOnline(lastSeenAt: Date | null): boolean {
  if (!lastSeenAt) return false;
  return Date.now() - lastSeenAt.getTime() <= ONLINE_WINDOW_MS;
}

function publicUser(row: { id: number; name: string; username: string; role: string; banned: boolean; bannedUntil: Date | null; canBan: boolean; canStyle: boolean; agreementMiniAt: Date | null; agreementAdminAt: Date | null; avatar: string | null; textColor: string | null; textFont: string | null; lastSeenAt: Date | null; createdAt: Date }): User {
  return { id: row.id, name: row.name, username: row.username, role: row.role as Role, banned: row.banned, bannedUntil: row.bannedUntil ? toIso(row.bannedUntil) : null, canBan: row.canBan, canStyle: row.canStyle, agreementMiniAt: row.agreementMiniAt ? toIso(row.agreementMiniAt) : null, agreementAdminAt: row.agreementAdminAt ? toIso(row.agreementAdminAt) : null, agreementActive: isAgreementComplete(row.agreementMiniAt, row.agreementAdminAt), avatar: row.avatar ?? null, textColor: row.textColor ?? null, textFont: row.canStyle && isAgreementComplete(row.agreementMiniAt, row.agreementAdminAt) ? (row.textFont ?? null) : null, lastSeenAt: row.lastSeenAt ? toIso(row.lastSeenAt) : null, online: isOnline(row.lastSeenAt), createdAt: toIso(row.createdAt) };
}

/** Устгагдсан хэрэглэгчийн оронд харуулдаг орлуулагч. */
function deletedUser(authorId: number, createdAt: Date): User {
  return { id: authorId, name: 'Устгасан хэрэглэгч', username: '', role: 'member' as Role, banned: false, bannedUntil: null, canBan: false, canStyle: false, agreementMiniAt: null, agreementAdminAt: null, agreementActive: false, avatar: null, textColor: null, textFont: null, lastSeenAt: null, online: false, createdAt: toIso(createdAt) };
}

function toDirectMessage(row: { id: number; senderId: number; recipientId: number; content: string; replyAuthorName: string | null; replyText: string | null; editedAt: Date | null; createdAt: Date }, reactionRows: { targetType: string; targetId: number; emoji: string; userId: number }[], meId: number): DirectMessage {
  return {
    id: row.id,
    senderId: row.senderId,
    recipientId: row.recipientId,
    content: row.content,
    replyTo: replyQuote(row.replyAuthorName, row.replyText),
    editedAt: row.editedAt ? toIso(row.editedAt) : null,
    reactions: reactionCounts(reactionRows, 'dm', row.id, meId),
    createdAt: toIso(row.createdAt),
  };
}

/** Хариултын snapshot — нэр + текст хоёулаа байвал эшлэл, үгүй бол null. */
function replyQuote(authorName: string | null, text: string | null): ReplyQuote | null {
  if (!authorName || text === null) return null;
  return { authorName, text };
}

/** Бичлэгийн агуулгыг шалгана — хоосон, эсвэл хэт урт бол 400. */
function validateContent(body: unknown, max: number, label: string): string {
  const content = String((body as { content?: unknown } | null | undefined)?.content ?? '').trim();
  if (content.length < 1 || content.length > max) {
    throw new HttpError(400, label);
  }
  return content;
}

/** Урвалүүдыг (target_type, target_id)-ээр бүлэглэж, эможи тус бүрээр
    тоолж, би дарсан эсэхийг тэмдэглэнэ. REACTION_EMOJIS дарааллаар буцаана. */
function reactionCounts(
  rows: { targetType: string; targetId: number; emoji: string; userId: number }[],
  type: ReactionTargetType,
  id: number,
  meId: number,
): ReactionCount[] {
  const byEmoji = new Map<string, { count: number; mine: boolean }>();
  for (const r of rows) {
    if (r.targetType !== type || r.targetId !== id) continue;
    const cur = byEmoji.get(r.emoji) ?? { count: 0, mine: false };
    cur.count += 1;
    if (r.userId === meId) cur.mine = true;
    byEmoji.set(r.emoji, cur);
  }
  return (REACTION_EMOJIS as readonly string[])
    .filter((e) => byEmoji.has(e))
    .map((e) => ({ emoji: e, count: byEmoji.get(e)!.count, reactedByMe: byEmoji.get(e)!.mine }));
}

async function loadAllReactions(): Promise<{ targetType: string; targetId: number; emoji: string; userId: number }[]> {
  const rows = await db.select().from(reactions);
  return rows.map((r) => ({ targetType: r.targetType, targetId: r.targetId, emoji: r.emoji, userId: r.userId }));
}

/** Өөрийнх нь л засч болно — админ/жижиг админ ч бусдын бичлэгийг засаж болохгүй
    (устгаж л болно). */
function requireAuthor(user: AuthUser, authorId: number): void {
  if (user.id !== authorId) {
    throw new HttpError(403, 'Зөвхөн зохиогч өөрийн бичлэгийг засч болно');
  }
}

/** Урвалын зорилт байгаа эсэхийг шалгана — байхгүй бол 404. */
async function requireReactionTarget(type: ReactionTargetType, id: number): Promise<void> {
  const table = type === 'message' ? messages : type === 'dm' ? directMessages : postComments;
  const rows = await db.select({ id: table.id }).from(table).where(eq(table.id, id)).limit(1);
  if (!rows[0]) throw new HttpError(404, 'Бичлэг олдсонгүй');
}

/** Өөрийнх нь, эсвэл админ/жижиг админ бол бусдынхыг устгаж болно.
    Жижиг админ бусдынхыг устгахдаа ёс зүйн гэрээ нь бүрэн баталгаажсан
    байх ёстой (гэрээгүй бол зөвхөн өөрийнхөө бичлэгийг устгана). */
function canDelete(user: AuthUser, authorId: number): boolean {
  if (user.id === authorId) return true;
  if (user.role === 'admin') return true;
  return user.role === 'moderator' && isAgreementComplete(user.agreementMiniAt, user.agreementAdminAt);
}

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void> | void;
function ah(fn: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function parseId(req: Request, label = 'Бичлэг олдсонгүй', param = 'id'): number {
  const id = Number(req.params[param]);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(404, label);
  return id;
}

function parseRoom(req: Request): Room {
  // Одоо зөвхөн нийтийн өрөө л байна.
  const room = req.params.room;
  if (room !== 'public') throw new HttpError(404, 'Өрөө олдсонгүй');
  return room;
}

// ---------------------------------------------------------------- нэвтрэлт

router.post(
  '/auth/register',
  ah(async (req, res) => {
    const { name, username, password } = req.body ?? {};
    const user: AuthUser = await registerUser(String(name ?? ''), String(username ?? ''), String(password ?? ''));
    const token = await createSession(user.id);
    // Шинэ гишүүн бүртгүүлэхэд нийтийн чатад угтах мессеж гарна (1 цаг харагдана).
    // Анхны бүртгэл нь эзэн (том админ) өөрөө тул угтах мессеж гаргахгүй.
    if (user.role !== 'admin') {
      try {
        await db.insert(messages).values({
          room: 'public',
          kind: 'welcome',
          authorId: null,
          content: `🎉 Шинэ гишүүн орж ирлээ! Сайн байна уу, ${user.name}! Таныг халуун дулаанаар угтаж авч байна! 👋✨`,
        });
      } catch (err) {
        // Угтах мессеж бүтэлгүйтсэн ч бүртгэл амжилттай хэвээрээ — зөвхөн лог бичнэ.
        console.error('Угтах мессеж оруулахад алдаа гарлаа:', err);
      }
    }
    res.status(201).json({
      user: publicUser(user),
      token,
    });
  }),
);

router.post(
  '/auth/login',
  ah(async (req, res) => {
    const { username, password } = req.body ?? {};
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.username, String(username ?? '')))
      .limit(1);
    const row = rows[0];
    const ok = row ? await verifyPassword(String(password ?? ''), row.passwordHash) : false;
    if (!row || !ok) {
      res.status(401).json({ error: 'Нэвтрэх нэр эсвэл нууц үг буруу байна' });
      return;
    }
    if (isBannedNow(row.banned, row.bannedUntil)) {
      res.status(401).json({
        error: banMessage(row.bannedUntil),
        banned: true,
        bannedUntil: row.bannedUntil ? row.bannedUntil.toISOString() : null,
      });
      return;
    }
    const token = await createSession(row.id);
    const now = new Date();
    await db.update(users).set({ lastSeenAt: now }).where(eq(users.id, row.id));
    res.json({ user: publicUser({ ...row, lastSeenAt: now }), token });
  }),
);

router.get('/auth/me', requireAuth, (req, res) => {
  const u = req.user as AuthUser;
  res.json({
    user: publicUser(u),
  });
});

router.post(
  '/auth/logout',
  requireAuth,
  ah(async (req, res) => {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    if (token) await deleteSession(token);
    res.status(204).send();
  }),
);

// ---------------------------------------------------------------- онлайн/офлайн төлөв

/** Клиент 30 секунд тутамд дуудна — сүүлд идэвхтэй байсан цагийг шинэчилнэ. */
router.post(
  '/presence/heartbeat',
  requireAuth,
  ah(async (req, res) => {
    const u = req.user as AuthUser;
    await db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, u.id));
    res.json({ ok: true });
  }),
);

// ---------------------------------------------------------------- профайл зураг

const MAX_AVATAR_LENGTH = 500 * 1024;
const AVATAR_PREFIXES = ['data:image/jpeg;base64,', 'data:image/png;base64,', 'data:image/webp;base64,'];

function validateAvatar(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new HttpError(400, 'Зураг сонгоно уу');
  }
  if (value.length > MAX_AVATAR_LENGTH) {
    throw new HttpError(400, 'Зураг хэт том байна — 500 KB-аас бага зураг сонгоно уу');
  }
  const prefix = AVATAR_PREFIXES.find((p) => value.startsWith(p));
  if (!prefix) {
    throw new HttpError(400, 'Зөвхөн JPEG, PNG эсвэл WebP зураг оруулж болно');
  }
  const payload = value.slice(prefix.length);
  if (!/^[A-Za-z0-9+/=]+$/.test(payload)) {
    throw new HttpError(400, 'Зургийн мэдээлэл буруу байна');
  }
  return value;
}

router.post(
  '/me/avatar',
  requireAuth,
  ah(async (req, res) => {
    const u = req.user as AuthUser;
    const avatar = validateAvatar(req.body?.avatar);
    const updated = await db.update(users).set({ avatar }).where(eq(users.id, u.id)).returning();
    res.json({ user: publicUser(updated[0]) });
  }),
);

router.delete(
  '/me/avatar',
  requireAuth,
  ah(async (req, res) => {
    const u = req.user as AuthUser;
    const updated = await db.update(users).set({ avatar: null }).where(eq(users.id, u.id)).returning();
    res.json({ user: publicUser(updated[0]) });
  }),
);

// ---------------------------------------------------------------- профайл устгах
// Нууц үгээ баталгаажуулж, өөрийн бүх өгөгдлийг (сесс, пост, сэтгэгдэл,
// таалагдсан, өрөөний мессеж, хувь чат, зөвшөөрөл) нэг гүйлгээнд устгана.
// Том админ өөрийгөө устгаж болохгүй — чат админгүй үлдэнэ.

router.delete(
  '/me',
  requireAuth,
  ah(async (req, res) => {
    const u = req.user as AuthUser;
    if (u.role === 'admin') {
      throw new HttpError(400, 'Том админ өөрийн профайлыг устгах боломжгүй');
    }
    const password = String(req.body?.password ?? '');
    const rows = await db.select().from(users).where(eq(users.id, u.id)).limit(1);
    const row = rows[0];
    if (!row || !(await verifyPassword(password, row.passwordHash))) {
      throw new HttpError(401, 'Нууц үг буруу байна');
    }
    await db.transaction(async (tx) => {
      await tx.delete(sessions).where(eq(sessions.userId, u.id));
      await tx.delete(postLikes).where(eq(postLikes.userId, u.id));
      await tx.delete(postComments).where(eq(postComments.authorId, u.id));
      // Миний постууд дээрх бусдын like/сэтгэгдэл cascade-аар арилна.
      await tx.delete(posts).where(eq(posts.authorId, u.id));
      await tx.delete(messages).where(eq(messages.authorId, u.id));
      await tx.delete(directMessages).where(or(eq(directMessages.senderId, u.id), eq(directMessages.recipientId, u.id)));
      await tx.delete(dmReads).where(or(eq(dmReads.userId, u.id), eq(dmReads.partnerId, u.id)));
      await tx.delete(roomAccess).where(eq(roomAccess.userId, u.id));
      // Бангийн түүхээс энэ хэрэглэгчтэй холбоотой бичлэгүүдийг арилгана —
      // эс бөгөөс хэрэглэгчийн мөр устгахад гадаад түлхүүрийн алдаа гарна.
      await tx.delete(banLogs).where(or(eq(banLogs.userId, u.id), eq(banLogs.bannedById, u.id), eq(banLogs.unbannedById, u.id)));
      await tx.delete(users).where(eq(users.id, u.id));
    });
    res.status(204).send();
  }),
);

// ---------------------------------------------------------------- хэрэглэгчийн профайл

router.get(
  '/users/:id',
  requireAuth,
  ah(async (req, res) => {
    const id = parseId(req, 'Хэрэглэгч олдсонгүй');
    const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!rows[0]) throw new HttpError(404, 'Хэрэглэгч олдсонгүй');
    const postRows = await db.select({ id: posts.id }).from(posts).where(eq(posts.authorId, id));
    res.json({ user: publicUser(rows[0]), postCount: postRows.length });
  }),
);

// ---------------------------------------------------------------- пост (нүүр)

async function listPosts(meId: number): Promise<Post[]> {
  const postRows = await db.select().from(posts).orderBy(desc(posts.createdAt)).limit(50);
  if (postRows.length === 0) return [];
  const userRows = await db.select().from(users);
  const userById = new Map(userRows.map((u) => [u.id, publicUser(u)]));
  const likeRows = await db.select().from(postLikes);
  const commentRows = await db.select().from(postComments).orderBy(asc(postComments.createdAt));
  const reactionRows = await loadAllReactions();
  const likesByPost = new Map<number, { count: number; mine: boolean }>();
  for (const l of likeRows) {
    const cur = likesByPost.get(l.postId) ?? { count: 0, mine: false };
    cur.count += 1;
    if (l.userId === meId) cur.mine = true;
    likesByPost.set(l.postId, cur);
  }
  const commentsByPost = new Map<number, PostComment[]>();
  for (const c of commentRows) {
    const author = userById.get(c.authorId);
    if (!author) continue;
    const list = commentsByPost.get(c.postId) ?? [];
    list.push({
      id: c.id,
      postId: c.postId,
      author,
      content: c.content,
      replyTo: replyQuote(c.replyAuthorName, c.replyText),
      editedAt: c.editedAt ? toIso(c.editedAt) : null,
      reactions: reactionCounts(reactionRows, 'comment', c.id, meId),
      createdAt: toIso(c.createdAt),
    });
    commentsByPost.set(c.postId, list);
  }
  return postRows.map((p) => {
    const author = userById.get(p.authorId);
    const likes = likesByPost.get(p.id) ?? { count: 0, mine: false };
    return {
      id: p.id,
      author: author ?? deletedUser(p.authorId, p.createdAt),
      content: p.content,
      likeCount: likes.count,
      likedByMe: likes.mine,
      comments: commentsByPost.get(p.id) ?? [],
      editedAt: p.editedAt ? toIso(p.editedAt) : null,
      createdAt: toIso(p.createdAt),
    };
  });
}

router.get('/posts', requireAuth, ah(async (req, res) => {
  const u = req.user as AuthUser;
  res.json({ posts: await listPosts(u.id) });
}));

router.post(
  '/posts',
  requireAuth,
  ah(async (req, res) => {
    const u = req.user as AuthUser;
    const content = String(req.body?.content ?? '').trim();
    if (content.length < 1 || content.length > 2000) {
      throw new HttpError(400, 'Пост 1–2000 тэмдэгт байх ёстой');
    }
    const inserted = await db.insert(posts).values({ authorId: u.id, content }).returning();
    const row = inserted[0];
    res.status(201).json({
      post: {
        id: row.id,
        author: publicUser({ ...u, createdAt: u.createdAt }),
        content: row.content,
        likeCount: 0,
        likedByMe: false,
        comments: [],
        editedAt: null,
        createdAt: toIso(row.createdAt),
      } satisfies Post,
    });
  }),
);

router.post(
  '/posts/:id/like',
  requireAuth,
  ah(async (req, res) => {
    const u = req.user as AuthUser;
    const id = parseId(req);
    const postRows = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
    if (!postRows[0]) throw new HttpError(404, 'Пост олдсонгүй');
    const existing = await db
      .select()
      .from(postLikes)
      .where(and(eq(postLikes.postId, id), eq(postLikes.userId, u.id)))
      .limit(1);
    let liked: boolean;
    if (existing[0]) {
      await db.delete(postLikes).where(eq(postLikes.id, existing[0].id));
      liked = false;
    } else {
      await db.insert(postLikes).values({ postId: id, userId: u.id });
      liked = true;
    }
    const countRows = await db.select().from(postLikes).where(eq(postLikes.postId, id));
    res.json({ liked, likeCount: countRows.length });
  }),
);

router.post(
  '/posts/:id/comments',
  requireAuth,
  ah(async (req, res) => {
    const u = req.user as AuthUser;
    const id = parseId(req);
    const content = String(req.body?.content ?? '').trim();
    if (content.length < 1 || content.length > 1000) {
      throw new HttpError(400, 'Сэтгэгдэл 1–1000 тэмдэгт байх ёстой');
    }
    const postRows = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
    if (!postRows[0]) throw new HttpError(404, 'Пост олдсонгүй');
    // Хариулж буй сэтгэгдэл: энэ постын сэтгэгдэл байх ёстой.
    const rawReplyToId = req.body?.replyToId;
    let replyId: number | null = null;
    let replyAuthorName: string | null = null;
    let replyText: string | null = null;
    if (rawReplyToId !== undefined && rawReplyToId !== null) {
      replyId = Number(rawReplyToId);
      if (!Number.isInteger(replyId) || replyId < 1) throw new HttpError(404, 'Хариулж буй сэтгэгдэл олдсонгүй');
      const origRows = await db
        .select()
        .from(postComments)
        .where(and(eq(postComments.id, replyId), eq(postComments.postId, id)))
        .limit(1);
      if (!origRows[0]) throw new HttpError(404, 'Хариулж буй сэтгэгдэл олдсонгүй');
      const origAuthor = await db.select().from(users).where(eq(users.id, origRows[0].authorId)).limit(1);
      replyAuthorName = origAuthor[0]?.name ?? 'Устгасан хэрэглэгч';
      replyText = origRows[0].content;
    }
    const inserted = await db
      .insert(postComments)
      .values({ postId: id, authorId: u.id, content, replyToId: replyId, replyAuthorName, replyText })
      .returning();
    const row = inserted[0];
    res.status(201).json({
      comment: {
        id: row.id,
        postId: id,
        author: publicUser({ ...u, createdAt: u.createdAt }),
        content: row.content,
        replyTo: replyQuote(replyAuthorName, replyText),
        editedAt: null,
        reactions: [],
        createdAt: toIso(row.createdAt),
      } satisfies PostComment,
    });
  }),
);

// Сэтгэгдэл засах — зөвхөн зохиогч (1–1000 тэмдэгт).
router.patch(
  '/comments/:id',
  requireAuth,
  ah(async (req, res) => {
    const u = req.user as AuthUser;
    const id = parseId(req, 'Сэтгэгдэл олдсонгүй');
    const content = validateContent(req.body, 1000, 'Сэтгэгдэл 1–1000 тэмдэгт байх ёстой');
    const rows = await db.select().from(postComments).where(eq(postComments.id, id)).limit(1);
    if (!rows[0]) throw new HttpError(404, 'Сэтгэгдэл олдсонгүй');
    requireAuthor(u, rows[0].authorId);
    const updated = await db
      .update(postComments)
      .set({ content, editedAt: new Date() })
      .where(eq(postComments.id, id))
      .returning();
    const row = updated[0];
    const reactionRows = await loadAllReactions();
    const authorRows = await db.select().from(users).where(eq(users.id, row.authorId)).limit(1);
    const author = authorRows[0] ? publicUser(authorRows[0]) : deletedUser(row.authorId, row.createdAt);
    res.json({
      comment: {
        id: row.id,
        postId: row.postId,
        author,
        content: row.content,
        replyTo: replyQuote(row.replyAuthorName, row.replyText),
        editedAt: row.editedAt ? toIso(row.editedAt) : null,
        reactions: reactionCounts(reactionRows, 'comment', row.id, u.id),
        createdAt: toIso(row.createdAt),
      } satisfies PostComment,
    });
  }),
);

// Пост засах — зөвхөн зохиогч (1–2000 тэмдэгт).
router.patch(
  '/posts/:id',
  requireAuth,
  ah(async (req, res) => {
    const u = req.user as AuthUser;
    const id = parseId(req);
    const content = validateContent(req.body, 2000, 'Пост 1–2000 тэмдэгт байх ёстой');
    const rows = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
    if (!rows[0]) throw new HttpError(404, 'Пост олдсонгүй');
    requireAuthor(u, rows[0].authorId);
    await db.update(posts).set({ content, editedAt: new Date() }).where(eq(posts.id, id));
    const all = await listPosts(u.id);
    const post = all.find((p) => p.id === id);
    if (!post) throw new HttpError(404, 'Пост олдсонгүй');
    res.json({ post });
  }),
);

router.delete(
  '/posts/:id',
  requireAuth,
  ah(async (req, res) => {
    const u = req.user as AuthUser;
    const id = parseId(req);
    const postRows = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
    if (!postRows[0]) throw new HttpError(404, 'Пост олдсонгүй');
    if (!canDelete(u, postRows[0].authorId)) {
      throw new HttpError(403, 'Энэ постыг зөвхөн зохиогч, том админ эсвэл жижиг админ устгаж болно');
    }
    await db.delete(posts).where(eq(posts.id, id));
    res.status(204).send();
  }),
);

// ---------------------------------------------------------------- нийтийн чат
// Одоо зөвхөн нийтийн өрөө л байна — зөвшөөрөлтэй өрөөг хаасан.

async function listMessages(meId: number): Promise<ChatMessage[]> {
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.room, 'public'))
    .orderBy(asc(messages.createdAt))
    .limit(200);
  if (rows.length === 0) return [];
  const userRows = await db.select().from(users);
  const userById = new Map(userRows.map((u) => [u.id, publicUser(u)]));
  const reactionRows = await loadAllReactions();
  return rows.map((m) => {
    // Угтах мессежид хүн зохиогч байхгүй — author null.
    const author =
      m.kind === 'welcome'
        ? null
        : m.authorId !== null
          ? (userById.get(m.authorId) ?? deletedUser(m.authorId, m.createdAt))
          : deletedUser(0, m.createdAt);
    return {
      id: m.id,
      room: m.room as Room,
      kind: m.kind as MessageKind,
      author,
      content: m.content,
      replyTo: replyQuote(m.replyAuthorName, m.replyText),
      editedAt: m.editedAt ? toIso(m.editedAt) : null,
      reactions: reactionCounts(reactionRows, 'message', m.id, meId),
      createdAt: toIso(m.createdAt),
    };
  });
}

router.get(
  '/rooms/:room/messages',
  requireAuth,
  ah(async (req, res) => {
    const u = req.user as AuthUser;
    parseRoom(req);
    res.json({ messages: await listMessages(u.id) });
  }),
);

router.post(
  '/rooms/:room/messages',
  requireAuth,
  ah(async (req, res) => {
    const u = req.user as AuthUser;
    const room = parseRoom(req);
    const content = String(req.body?.content ?? '').trim();
    if (content.length < 1 || content.length > 2000) {
      throw new HttpError(400, 'Мессеж 1–2000 тэмдэгт байх ёстой');
    }
    // Хариулж буй мессеж: нийтийн өрөөний мессеж байх ёстой.
    const rawReplyToId = req.body?.replyToId;
    let replyId: number | null = null;
    let replyAuthorName: string | null = null;
    let replyText: string | null = null;
    if (rawReplyToId !== undefined && rawReplyToId !== null) {
      replyId = Number(rawReplyToId);
      if (!Number.isInteger(replyId) || replyId < 1) throw new HttpError(404, 'Хариулж буй мессеж олдсонгүй');
      const origRows = await db.select().from(messages).where(eq(messages.id, replyId)).limit(1);
      if (!origRows[0] || origRows[0].room !== 'public') throw new HttpError(404, 'Хариулж буй мессеж олдсонгүй');
      // Угтах мессежид хариулах үед эшлэл нь системийн нэртэй байна.
      if (origRows[0].kind === 'welcome') {
        replyAuthorName = SYSTEM_NAME;
      } else {
        const origAuthorId = origRows[0].authorId;
        const origAuthor =
          origAuthorId === null
            ? []
            : await db.select().from(users).where(eq(users.id, origAuthorId)).limit(1);
        replyAuthorName = origAuthor[0]?.name ?? 'Устгасан хэрэглэгч';
      }
      replyText = origRows[0].content;
    }
    const inserted = await db
      .insert(messages)
      .values({ room, authorId: u.id, content, replyToId: replyId, replyAuthorName, replyText })
      .returning();
    const row = inserted[0];
    res.status(201).json({
      message: {
        id: row.id,
        room,
        kind: 'user' as MessageKind,
        author: publicUser({ ...u, createdAt: u.createdAt }),
        content: row.content,
        replyTo: replyQuote(replyAuthorName, replyText),
        editedAt: null,
        reactions: [],
        createdAt: toIso(row.createdAt),
      } satisfies ChatMessage,
    });
  }),
);

// Өрөөний мессеж засах — зөвхөн зохиогч (1–2000 тэмдэгт).
// Засвар нь 15 минутын устгах цагийг сунгадаггүй (created_at хэвээрээ).
router.patch(
  '/messages/:id',
  requireAuth,
  ah(async (req, res) => {
    const u = req.user as AuthUser;
    const id = parseId(req, 'Мессеж олдсонгүй');
    const content = validateContent(req.body, 2000, 'Мессеж 1–2000 тэмдэгт байх ёстой');
    const rows = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
    if (!rows[0]) throw new HttpError(404, 'Мессеж олдсонгүй');
    // Угтах мессеж (системийн) — зохиогч байхгүй тул хэний ч засаж болохгүй.
    if (rows[0].kind === 'welcome' || rows[0].authorId === null) {
      throw new HttpError(403, 'Системийн угтах мессежийг засах боломжгүй');
    }
    requireAuthor(u, rows[0].authorId);
    const updated = await db
      .update(messages)
      .set({ content, editedAt: new Date() })
      .where(eq(messages.id, id))
      .returning();
    const row = updated[0];
    const reactionRows = await loadAllReactions();
    const authorRows =
      row.authorId === null
        ? []
        : await db.select().from(users).where(eq(users.id, row.authorId)).limit(1);
    const author = authorRows[0] ? publicUser(authorRows[0]) : deletedUser(row.authorId ?? 0, row.createdAt);
    res.json({
      message: {
        id: row.id,
        room: row.room as Room,
        kind: row.kind as MessageKind,
        author,
        content: row.content,
        replyTo: replyQuote(row.replyAuthorName, row.replyText),
        editedAt: row.editedAt ? toIso(row.editedAt) : null,
        reactions: reactionCounts(reactionRows, 'message', row.id, u.id),
        createdAt: toIso(row.createdAt),
      } satisfies ChatMessage,
    });
  }),
);

router.delete(
  '/messages/:id',
  requireAuth,
  ah(async (req, res) => {
    const u = req.user as AuthUser;
    const id = parseId(req, 'Мессеж олдсонгүй');
    const rows = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
    if (!rows[0]) throw new HttpError(404, 'Мессеж олдсонгүй');
    // Угтах мессежийг зөвхөн админ устгаж болно — жижиг админ нь гэрээ нь
    // бүрэн баталгаажсан үед л устгана (зохиогч байхгүй).
    if (rows[0].kind === 'welcome') {
      if (u.role !== 'admin' && !(u.role === 'moderator' && isAgreementComplete(u.agreementMiniAt, u.agreementAdminAt))) {
        throw new HttpError(403, 'Угтах мессежийг зөвхөн админ устгаж болно');
      }
    } else if (!canDelete(u, rows[0].authorId ?? 0)) {
      throw new HttpError(403, 'Энэ мессежийг зөвхөн зохиогч, том админ эсвэл жижиг админ устгаж болно');
    }
    await db.delete(messages).where(eq(messages.id, id));
    await db
      .delete(reactions)
      .where(and(eq(reactions.targetType, 'message'), eq(reactions.targetId, id)));
    res.status(204).send();
  }),
);

// ---------------------------------------------------------------- эможи урвал
// Нэг хэрэглэгч нэг зүйл дээр нэг л урвал үлдээнэ: ижил эможи дахин
// дарвал арилна, өөр эможи дарвал солигдоно. Постын ❤️ лайк нь
// хэвээрээ — энд зөвхөн мессеж / хувь чат / сэтгэгдэлд хамаарна.

router.post(
  '/reactions',
  requireAuth,
  ah(async (req, res) => {
    const u = req.user as AuthUser;
    const targetType = String(req.body?.targetType ?? '');
    const targetId = Number(req.body?.targetId);
    const emoji = String(req.body?.emoji ?? '');
    if (targetType !== 'message' && targetType !== 'dm' && targetType !== 'comment') {
      throw new HttpError(400, 'Урвалын төрөл буруу байна');
    }
    if (!Number.isInteger(targetId) || targetId < 1) throw new HttpError(404, 'Бичлэг олдсонгүй');
    if (!(REACTION_EMOJIS as readonly string[]).includes(emoji)) {
      throw new HttpError(400, 'Эможи буруу байна');
    }
    await requireReactionTarget(targetType, targetId);
    const existing = await db
      .select()
      .from(reactions)
      .where(
        and(
          eq(reactions.userId, u.id),
          eq(reactions.targetType, targetType),
          eq(reactions.targetId, targetId),
        ),
      )
      .limit(1);
    if (existing[0]) {
      if (existing[0].emoji === emoji) {
        await db.delete(reactions).where(eq(reactions.id, existing[0].id));
      } else {
        await db.update(reactions).set({ emoji }).where(eq(reactions.id, existing[0].id));
      }
    } else {
      await db.insert(reactions).values({ userId: u.id, targetType, targetId, emoji });
    }
    const all = await loadAllReactions();
    res.json({ reactions: reactionCounts(all, targetType, targetId, u.id) });
  }),
);

// ---------------------------------------------------------------- хувь чат (1:1)
// Бандуулсан хэрэглэгчийг requireAuth аль хэдийн хаасан тул DM ч хаагдсан байна.
// '/dm/conversations' замыг '/dm/:userId'-ээс ӨМНӨ бүртгэнэ —
// эс бөгөөс 'conversations' нь userId параметр гэж танигдана.

router.get(
  '/dm/conversations',
  requireAuth,
  ah(async (req, res) => {
    const u = req.user as AuthUser;
    const userRows = await db.select().from(users).orderBy(asc(users.name));
    const dmRows = await db
      .select()
      .from(directMessages)
      .where(or(eq(directMessages.senderId, u.id), eq(directMessages.recipientId, u.id)))
      .orderBy(desc(directMessages.createdAt));
    const readRows = await db.select().from(dmReads).where(eq(dmReads.userId, u.id));
    const lastReadByPartner = new Map(readRows.map((r) => [r.partnerId, r.lastReadAt]));

    const conversations: DirectConversation[] = userRows
      .filter((row) => row.id !== u.id)
      .map((row) => {
        const mine = dmRows.filter(
          (m) =>
            (m.senderId === u.id && m.recipientId === row.id) ||
            (m.senderId === row.id && m.recipientId === u.id),
        );
        const last = mine[0];
        const lastRead = lastReadByPartner.get(row.id);
        const unreadCount = mine.filter(
          (m) => m.senderId === row.id && (!lastRead || m.createdAt.getTime() > lastRead.getTime()),
        ).length;
        return {
          user: publicUser(row),
          lastMessage: last
            ? { content: last.content, createdAt: toIso(last.createdAt), senderId: last.senderId }
            : null,
          unreadCount,
        };
      });

    conversations.sort((a, b) => {
      const at = a.lastMessage?.createdAt;
      const bt = b.lastMessage?.createdAt;
      if (at && bt) return bt.localeCompare(at);
      if (at) return -1;
      if (bt) return 1;
      return a.user.name.localeCompare(b.user.name, 'mn');
    });
    res.json({ conversations });
  }),
);

router.get(
  '/dm/:userId',
  requireAuth,
  ah(async (req, res) => {
    const u = req.user as AuthUser;
    const partnerId = parseId(req, 'Хэрэглэгч олдсонгүй', 'userId');
    const partnerRows = await db.select({ id: users.id }).from(users).where(eq(users.id, partnerId)).limit(1);
    if (!partnerRows[0]) throw new HttpError(404, 'Хэрэглэгч олдсонгүй');
    const rows = await db
      .select()
      .from(directMessages)
      .where(
        or(
          and(eq(directMessages.senderId, u.id), eq(directMessages.recipientId, partnerId)),
          and(eq(directMessages.senderId, partnerId), eq(directMessages.recipientId, u.id)),
        ),
      )
      .orderBy(asc(directMessages.createdAt))
      .limit(200);
    // Уншсан гэж тэмдэглэнэ.
    const now = new Date();
    await db
      .insert(dmReads)
      .values({ userId: u.id, partnerId, lastReadAt: now })
      .onConflictDoUpdate({ target: [dmReads.userId, dmReads.partnerId], set: { lastReadAt: now } });
    const reactionRows = await loadAllReactions();
    res.json({ messages: rows.map((r) => toDirectMessage(r, reactionRows, u.id)) });
  }),
);

router.post(
  '/dm/:userId',
  requireAuth,
  ah(async (req, res) => {
    const u = req.user as AuthUser;
    const partnerId = parseId(req, 'Хэрэглэгч олдсонгүй', 'userId');
    if (partnerId === u.id) {
      throw new HttpError(400, 'Өөртөө хувь чат бичиж болохгүй');
    }
    const content = String(req.body?.content ?? '').trim();
    if (content.length < 1 || content.length > 2000) {
      throw new HttpError(400, 'Мессеж 1–2000 тэмдэгт байх ёстой');
    }
    const partnerRows = await db.select({ id: users.id }).from(users).where(eq(users.id, partnerId)).limit(1);
    if (!partnerRows[0]) throw new HttpError(404, 'Хэрэглэгч олдсонгүй');
    // Хариулж буй мессеж: энэ хоёр хүний хоорондын мессеж байх ёстой.
    const rawReplyToId = req.body?.replyToId;
    let replyId: number | null = null;
    let replyAuthorName: string | null = null;
    let replyText: string | null = null;
    if (rawReplyToId !== undefined && rawReplyToId !== null) {
      replyId = Number(rawReplyToId);
      if (!Number.isInteger(replyId) || replyId < 1) throw new HttpError(404, 'Хариулж буй мессеж олдсонгүй');
      const origRows = await db
        .select()
        .from(directMessages)
        .where(
          and(
            eq(directMessages.id, replyId),
            or(
              and(eq(directMessages.senderId, u.id), eq(directMessages.recipientId, partnerId)),
              and(eq(directMessages.senderId, partnerId), eq(directMessages.recipientId, u.id)),
            ),
          ),
        )
        .limit(1);
      if (!origRows[0]) throw new HttpError(404, 'Хариулж буй мессеж олдсонгүй');
      const origAuthor = await db.select().from(users).where(eq(users.id, origRows[0].senderId)).limit(1);
      replyAuthorName = origAuthor[0]?.name ?? 'Устгасан хэрэглэгч';
      replyText = origRows[0].content;
    }
    const inserted = await db
      .insert(directMessages)
      .values({ senderId: u.id, recipientId: partnerId, content, replyToId: replyId, replyAuthorName, replyText })
      .returning();
    res.status(201).json({ message: toDirectMessage(inserted[0], [], u.id) });
  }),
);

// Хувь чатын мессеж засах — зөвхөн зохиогч (1–2000 тэмдэгт).
router.patch(
  '/dm/:id',
  requireAuth,
  ah(async (req, res) => {
    const u = req.user as AuthUser;
    const id = parseId(req, 'Мессеж олдсонгүй');
    const content = validateContent(req.body, 2000, 'Мессеж 1–2000 тэмдэгт байх ёстой');
    const rows = await db.select().from(directMessages).where(eq(directMessages.id, id)).limit(1);
    if (!rows[0]) throw new HttpError(404, 'Мессеж олдсонгүй');
    requireAuthor(u, rows[0].senderId);
    const updated = await db
      .update(directMessages)
      .set({ content, editedAt: new Date() })
      .where(eq(directMessages.id, id))
      .returning();
    const reactionRows = await loadAllReactions();
    res.json({ message: toDirectMessage(updated[0], reactionRows, u.id) });
  }),
);

router.delete(
  '/dm/:id',
  requireAuth,
  ah(async (req, res) => {
    const u = req.user as AuthUser;
    const id = parseId(req, 'Мессеж олдсонгүй');
    const rows = await db.select().from(directMessages).where(eq(directMessages.id, id)).limit(1);
    if (!rows[0]) throw new HttpError(404, 'Мессеж олдсонгүй');
    if (!canDelete(u, rows[0].senderId)) {
      throw new HttpError(403, 'Энэ мессежийг зөвхөн зохиогч, том админ эсвэл жижиг админ устгаж болно');
    }
    await db.delete(directMessages).where(eq(directMessages.id, id));
    await db
      .delete(reactions)
      .where(and(eq(reactions.targetType, 'dm'), eq(reactions.targetId, id)));
    res.status(204).send();
  }),
);

// ---------------------------------------------------------------- админ: гишүүд, жижиг админ

router.get('/admin/users', requireAuth, requireAdminOrBanModerator, ah(async (_req, res) => {
  const userRows = await db.select().from(users).orderBy(asc(users.createdAt));
  const members: MemberRow[] = userRows.map((u) => ({
    user: publicUser(u),
  }));
  res.json({ users: members });
}));

async function setModerator(id: number, role: 'moderator' | 'member'): Promise<User> {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!rows[0]) throw new HttpError(404, 'Хэрэглэгч олдсонгүй');
  if (rows[0].role === 'admin') {
    throw new HttpError(400, 'Том админы эрхийг өөрчлөх боломжгүй');
  }
  // Жижиг админ эрхийг хураахад бандах эрх болон өнгө/фонт сонгох эрх нь
  // ч хамт арилна. Ёс зүйн гэрээ ч арилна — дахин жижиг админ болбол
  // гэрээнд дахин гарын үсэг зурах ёстой (гэрээ нь нэг удаагийн эрх
  // олголт бүрд хамаарна).
  const updated = await db
    .update(users)
    .set({ role, canBan: role === 'member' ? false : rows[0].canBan, canStyle: role === 'member' ? false : rows[0].canStyle, agreementMiniAt: role === 'member' ? null : rows[0].agreementMiniAt, agreementAdminAt: role === 'member' ? null : rows[0].agreementAdminAt })
    .where(eq(users.id, id))
    .returning();
  return publicUser(updated[0]);
}

router.post('/admin/users/:id/moderator', requireAuth, requireAdmin, ah(async (req, res) => {
  const user = await setModerator(parseId(req, 'Хэрэглэгч олдсонгүй'), 'moderator');
  res.json({ user });
}));

router.post('/admin/users/:id/revoke-moderator', requireAuth, requireAdmin, ah(async (req, res) => {
  const user = await setModerator(parseId(req, 'Хэрэглэгч олдсонгүй'), 'member');
  res.json({ user });
}));

// ---------------------------------------------------------------- бан
// Бандах дүрэм:
// - Том админ: өөрийгөөсөө бусад хэнийг ч (жижиг админ, гишүүн) бандаж/тайлж чадна.
// - Жижиг админ: бандах эрх (can_ban) авсан + ёс зүйн гэрээ нь бүрэн
//   баталгаажсан үедээ л, зөвхөн энгийн хэрэглэгчийг бандаж чадна —
//   том админ болон өөр жижиг админыг бандаж болохгүй.
// - Анхдагчаар жижиг админ бандаж болохгүй.
// Бангийн хугацаа: 5, 15, 30 минут, 24 цаг (1440 минут), эсвэл Байнга (null).
// Байнга бан нь users.banned (boolean) баганаар, хугацаатай бан нь
// users.banned_until баганаар тэмдэглэгдэнэ. Бангийн түүх ban_logs-д хадгалагдана.

/** Гишүүдийн жагсаалтыг том админ + бандах эрхтэй жижиг админ харж болно.
    Жижиг админд бандах эрх нь гэрээ бүрэн баталгаажсан үед л үр дүнтэй. */
function requireAdminOrBanModerator(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Нэвтрэх шаардлагатай байна' });
    return;
  }
  if (req.user.role === 'admin' || (req.user.role === 'moderator' && effectiveCanBan(req.user))) {
    next();
    return;
  }
  res.status(403).json({ error: 'Энэ хэсгийг зөвхөн том админ харна' });
}

function canBanTarget(actor: AuthUser, target: { id: number; role: string }): void {
  if (actor.id === target.id) {
    throw new HttpError(400, 'Өөрийгөө бандаж болохгүй');
  }
  if (actor.role === 'admin') {
    if (target.role === 'admin') {
      throw new HttpError(400, 'Том админыг бандаж болохгүй');
    }
    return;
  }
  if (actor.role !== 'moderator' || !effectiveCanBan(actor)) {
    throw new HttpError(403, 'Бандаж болох эрх танд байхгүй байна');
  }
  if (target.role !== 'member') {
    throw new HttpError(403, 'Жижиг админ зөвхөн энгийн хэрэглэгчийг бандаж чадна');
  }
}

/** Бангийн зөвшөөрөгдсөн хугацаа (минутаар). */
const BAN_DURATIONS = [5, 15, 30, 1440];

/** Биеийн durationMinutes талбарыг шалгана — буруу утга бол 400. null = Байнга. */
function parseBanDuration(body: unknown): number | null {
  const value = (body as { durationMinutes?: unknown } | null | undefined)?.durationMinutes;
  if (value === undefined || value === null) return null;
  const n = Number(value);
  if (!BAN_DURATIONS.includes(n)) {
    throw new HttpError(400, 'Бангийн хугацаа буруу байна — 5, 15, 30 минут эсвэл 24 цаг сонгоно уу');
  }
  return n;
}

/** Хугацаатай бандах: banned = false, banned_until = одоо + хугацаа.
    Байнга бандах: banned = true, banned_until = null. Түүхэнд бичлэг нэмнэ. */
async function banUser(actor: AuthUser, id: number, durationMinutes: number | null): Promise<User> {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!rows[0]) throw new HttpError(404, 'Хэрэглэгч олдсонгүй');
  canBanTarget(actor, rows[0]);
  const now = new Date();
  const expiresAt = durationMinutes === null ? null : new Date(now.getTime() + durationMinutes * 60_000);
  const updated = await db.transaction(async (tx) => {
    // Өмнөх нээлттэй түүхийн бичлэгийг хаана — шинэ бан түүнийг орлоно.
    await tx
      .update(banLogs)
      .set({ unbannedAt: now, unbannedById: actor.id })
      .where(and(eq(banLogs.userId, id), isNull(banLogs.unbannedAt)));
    const u = await tx
      .update(users)
      .set({ banned: durationMinutes === null, bannedUntil: expiresAt })
      .where(eq(users.id, id))
      .returning();
    await tx.insert(banLogs).values({
      userId: id,
      bannedById: actor.id,
      durationMinutes,
      bannedAt: now,
      expiresAt,
    });
    return u[0];
  });
  return publicUser(updated);
}

/** Бан тайлах: хоёр баганыг арилгаж, нээлттэй түүхийн бичлэгийг хаана. */
async function unbanUser(actor: AuthUser, id: number): Promise<User> {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!rows[0]) throw new HttpError(404, 'Хэрэглэгч олдсонгүй');
  canBanTarget(actor, rows[0]);
  const now = new Date();
  const updated = await db.transaction(async (tx) => {
    const u = await tx
      .update(users)
      .set({ banned: false, bannedUntil: null })
      .where(eq(users.id, id))
      .returning();
    await tx
      .update(banLogs)
      .set({ unbannedAt: now, unbannedById: actor.id })
      .where(and(eq(banLogs.userId, id), isNull(banLogs.unbannedAt)));
    return u[0];
  });
  return publicUser(updated);
}

router.post('/admin/users/:id/ban', requireAuth, ah(async (req, res) => {
  const durationMinutes = parseBanDuration(req.body);
  const user = await banUser(req.user as AuthUser, parseId(req, 'Хэрэглэгч олдсонгүй'), durationMinutes);
  res.json({ user });
}));

router.post('/admin/users/:id/unban', requireAuth, ah(async (req, res) => {
  const user = await unbanUser(req.user as AuthUser, parseId(req, 'Хэрэглэгч олдсонгүй'));
  res.json({ user });
}));

// ---------------------------------------------------------------- бангийн түүх (зөвхөн том админ)
// Сүүлийн 100 бичлэг, хамгийн сүүлийнх нь эхэндээ. Төлөв:
// active = идэвхтэй, expired = хугацаа дууссан, unbanned = гараар тайлсан.

function banLogStatus(log: {
  durationMinutes: number | null;
  expiresAt: Date | null;
  unbannedAt: Date | null;
  autoExpired: boolean;
}): BanLog['status'] {
  if (log.unbannedAt) return log.autoExpired ? 'expired' : 'unbanned';
  if (log.durationMinutes === null) return 'active';
  if (log.expiresAt && log.expiresAt.getTime() > Date.now()) return 'active';
  return 'expired';
}

router.get('/admin/ban-logs', requireAuth, requireAdmin, ah(async (_req, res) => {
  const rows = await db.select().from(banLogs).orderBy(desc(banLogs.bannedAt)).limit(100);
  const userIds = new Set<number>();
  for (const r of rows) {
    userIds.add(r.userId);
    userIds.add(r.bannedById);
    if (r.unbannedById !== null) userIds.add(r.unbannedById);
  }
  const userRows = userIds.size > 0 ? await db.select().from(users) : [];
  const userById = new Map(userRows.map((u) => [u.id, u]));
  const mini = (id: number | null): { id: number; username: string; name: string } | null => {
    if (id === null) return null;
    const u = userById.get(id);
    if (!u) return { id, username: '', name: 'Устгасан хэрэглэгч' };
    return { id: u.id, username: u.username, name: u.name };
  };
  const logs: BanLog[] = rows.map((r) => {
    const user = mini(r.userId);
    const bannedBy = mini(r.bannedById);
    return {
      id: r.id,
      user: user ?? { id: r.userId, username: '', name: 'Устгасан хэрэглэгч' },
      bannedBy: bannedBy ?? { id: r.bannedById, username: '', name: 'Устгасан хэрэглэгч' },
      durationMinutes: r.durationMinutes,
      bannedAt: toIso(r.bannedAt),
      expiresAt: r.expiresAt ? toIso(r.expiresAt) : null,
      unbannedAt: r.unbannedAt ? toIso(r.unbannedAt) : null,
      unbannedBy: mini(r.unbannedById),
      autoExpired: r.autoExpired,
      status: banLogStatus(r),
    };
  });
  res.json({ logs });
}));

async function setBanPermission(id: number, canBan: boolean): Promise<User> {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!rows[0]) throw new HttpError(404, 'Хэрэглэгч олдсонгүй');
  if (rows[0].role !== 'moderator') {
    throw new HttpError(400, 'Бандаж болох эрх зөвхөн жижиг админд олгоно');
  }
  const updated = await db.update(users).set({ canBan }).where(eq(users.id, id)).returning();
  return publicUser(updated[0]);
}

router.post('/admin/users/:id/ban-permission', requireAuth, requireAdmin, ah(async (req, res) => {
  const user = await setBanPermission(parseId(req, 'Хэрэглэгч олдсонгүй'), true);
  res.json({ user });
}));

router.post('/admin/users/:id/revoke-ban-permission', requireAuth, requireAdmin, ah(async (req, res) => {
  const user = await setBanPermission(parseId(req, 'Хэрэглэгч олдсонгүй'), false);
  res.json({ user });
}));

// ---------------------------------------------------------------- өнгө/фонт сонгох эрх (зөвхөн том админ, зөвхөн жижиг админд)
// Бандах эрхтэй яг ижил загвар: тусад нь олгоно/хураана. Эрхгүй жижиг
// админ өөрийн өнгө, фонтыг өөрөө сонгож чадахгүй.

async function setStylePermission(id: number, canStyle: boolean): Promise<User> {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!rows[0]) throw new HttpError(404, 'Хэрэглэгч олдсонгүй');
  if (rows[0].role !== 'moderator') {
    throw new HttpError(400, 'Өнгө/фонт сонгох эрх зөвхөн жижиг админд олгоно');
  }
  const updated = await db.update(users).set({ canStyle }).where(eq(users.id, id)).returning();
  return publicUser(updated[0]);
}

router.post('/admin/users/:id/style-permission', requireAuth, requireAdmin, ah(async (req, res) => {
  const user = await setStylePermission(parseId(req, 'Хэрэглэгч олдсонгүй'), true);
  res.json({ user });
}));

router.post('/admin/users/:id/revoke-style-permission', requireAuth, requireAdmin, ah(async (req, res) => {
  const user = await setStylePermission(parseId(req, 'Хэрэглэгч олдсонгүй'), false);
  res.json({ user });
}));

// ---------------------------------------------------------------- жижиг админы ёс зүйн гэрээ
// Гэрээг нэг удаа хийнэ: жижиг админ өөрөө check хийж зөвшөөрч, том админ
// check хийж зөвшөөрсний дараа (хоёр дахь check орох мөчид) жижиг админы
// БҮХ эрх (бандах + өнгө/фонт + бусдын бичлэг устгах) автоматаар идэвхжинэ.
// Тусдаа олгосон бандах/өнгө-фонт эрх нь гэрээ бүрэн болоогүй үед үр дүнгүй.
// Эрх хураах товчнууд хэвээрээ — гэрээ бүрэн болсон ч том админ тухайн
// эрхийг дангаар нь хурааж болно (гэрээний 5-р зүйл).

/** Гэрээний нэг талын check-ийг бүртгэнэ. Аль хэдийн зөвшөөрсөн бол
    юу ч өөрчлөхгүй (idempotent). Хоёр дахь check орох мөчид л
    canBan + canStyle хоёрыг автоматаар true болгоно — дараа нь эрх
    хураагдсан бол дахин зөвшөөрөхөд сэргэхгүй (хураалт хэвээрээ). */
async function recordAgreementCheck(id: number, side: 'mini' | 'admin'): Promise<User> {
  const updated = await db.transaction(async (tx) => {
    const rows = await tx.select().from(users).where(eq(users.id, id)).limit(1);
    const row = rows[0];
    if (!row) throw new HttpError(404, 'Хэрэглэгч олдсонгүй');
    if (row.role !== 'moderator') {
      throw new HttpError(400, 'Ёс зүйн гэрээ зөвхөн жижиг админд хамаарна');
    }
    const myAt = side === 'mini' ? row.agreementMiniAt : row.agreementAdminAt;
    const otherAt = side === 'mini' ? row.agreementAdminAt : row.agreementMiniAt;
    // Аль хэдийн зөвшөөрсөн — өөрчлөлтгүй буцаана.
    if (myAt !== null) return row;
    const now = new Date();
    const set = side === 'mini' ? { agreementMiniAt: now } : { agreementAdminAt: now };
    const after = await tx.update(users).set(set).where(eq(users.id, id)).returning();
    // Хоёр дахь check — гэрээ бүрэн боллоо, бүх эрх автоматаар идэвхжинэ.
    if (otherAt !== null) {
      const activated = await tx
        .update(users)
        .set({ canBan: true, canStyle: true })
        .where(eq(users.id, id))
        .returning();
      return activated[0];
    }
    return after[0];
  });
  return publicUser(updated);
}

/** Жижиг админ өөрөө гэрээг зөвшөөрнө — зөвхөн өөрийнхөө төлөө. */
router.post('/agreement/mini', requireAuth, ah(async (req, res) => {
  const u = req.user as AuthUser;
  if (u.role !== 'moderator') {
    throw new HttpError(403, 'Ёс зүйн гэрээнд зөвхөн жижиг админ гарын үсэг зурна');
  }
  const user = await recordAgreementCheck(u.id, 'mini');
  res.json({ user });
}));

/** Том админ тухайн жижиг админы гэрээг зөвшөөрнө. */
router.post('/agreement/admin/:userId', requireAuth, requireAdmin, ah(async (req, res) => {
  const user = await recordAgreementCheck(parseId(req, 'Хэрэглэгч олдсонгүй', 'userId'), 'admin');
  res.json({ user });
}));

/** Гэрээнд харуулах том админы нэр, нэвтрэх нэр — гэрээний толгой хэсэгт хэрэглэнэ. */
router.get('/agreement/admin', requireAuth, ah(async (_req, res) => {
  const rows = await db.select().from(users).where(eq(users.role, 'admin')).limit(1);
  if (!rows[0]) throw new HttpError(404, 'Том админ олдсонгүй');
  res.json({ admin: publicUser(rows[0]) });
}));

// ---------------------------------------------------------------- бичлэгийн өнгө
// Зөвхөн том админ хэрэглэгчид бичлэгийн өнгө онооно. Өнгө нь '#RRGGBB'
// хэлбэртэй байх ёстой; null илгээхэд өнгө арилна.

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

router.post('/admin/users/:id/text-color', requireAuth, requireAdmin, ah(async (req, res) => {
  const id = parseId(req, 'Хэрэглэгч олдсонгүй');
  const color: unknown = req.body?.color;
  if (color !== null && (typeof color !== 'string' || !COLOR_RE.test(color))) {
    throw new HttpError(400, 'Өнгө нь #RRGGBB хэлбэртэй байх ёстой (жишээ нь #D4AF37)');
  }
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!rows[0]) throw new HttpError(404, 'Хэрэглэгч олдсонгүй');
  const updated = await db.update(users).set({ textColor: color }).where(eq(users.id, id)).returning();
  res.json({ user: publicUser(updated[0]) });
}));

// ---------------------------------------------------------------- өөрийн өнгө, фонт (canStyle эрхтэй жижиг админ)
// Зөвхөн moderator + canStyle=true + ёс зүйн гэрээ бүрэн үед өөрийн
// өнгө, фонтыг өөрөө сонгоно. Том админ (Playfair фонт нь өөр замаар),
// энгийн гишүүн → 403. Гэрээ бүрэн болоогүй бол 403 (тусдаа мессеж).
// Биедээ байхгүй талбарыг дамжуулбал хуучин утга нь хэвээрээ байна;
// null илгээхэд тухайн сонголт арилна. Эрх хураагдсан үед фонт нь
// харагдахгүй болно (утга нь DB-д хадгалагдсан хэвээрээ — дахин олгоход сэргэнэ).

router.post('/me/style', requireAuth, ah(async (req, res) => {
  const u = req.user as AuthUser;
  const rows = await db.select().from(users).where(eq(users.id, u.id)).limit(1);
  if (!rows[0]) throw new HttpError(404, 'Хэрэглэгч олдсонгүй');
  const row = rows[0];
  if (row.role !== 'moderator' || !row.canStyle) {
    throw new HttpError(403, 'Өнгө, фонт сонгох эрх танд олгогдоогүй байна. Том админаас эрх авна уу');
  }
  if (!effectiveCanStyle(u)) {
    throw new HttpError(403, 'Ёс зүйн гэрээ бүрэн баталгаажаагүй байна. Эхлээд гэрээг зөвшөөрнө үү');
  }
  const body = (req.body ?? {}) as { color?: unknown; font?: unknown };
  let nextColor = row.textColor;
  let nextFont = row.textFont;
  if ('color' in body) {
    const color: unknown = body.color;
    if (color !== null && (typeof color !== 'string' || !COLOR_RE.test(color))) {
      throw new HttpError(400, 'Өнгө нь #RRGGBB хэлбэртэй байх ёстой (жишээ нь #D4AF37)');
    }
    nextColor = color as string | null;
  }
  if ('font' in body) {
    const font: unknown = body.font;
    if (font !== null && (typeof font !== 'string' || !TEXT_FONT_KEYS.includes(font))) {
      throw new HttpError(400, 'Фонт сонголт буруу байна');
    }
    nextFont = font as string | null;
  }
  const updated = await db.update(users).set({ textColor: nextColor, textFont: nextFont }).where(eq(users.id, u.id)).returning();
  res.json({ user: publicUser(updated[0]) });
}));

// ---------------------------------------------------------------- хэрэглэгч устгах (зөвхөн том админ)
// Өөрийн профайлыг устгах (DELETE /api/me) үйлдэлтэй яг ижил
// каскадыг тухайн хэрэглэгчид хэрэглэнэ: сесс, пост, сэтгэгдэл,
// таалагдсан, өрөөний мессеж, хувь чат, зөвшөөрөл, бангийн түүх,
// дараа нь хэрэглэгчийн мөр. Том админ өөрийгөө устгаж болохгүй —
// чат админгүй үлдэнэ.

router.delete('/admin/users/:id', requireAuth, requireAdmin, ah(async (req, res) => {
  const u = req.user as AuthUser;
  const id = parseId(req, 'Хэрэглэгч олдсонгүй');
  if (id === u.id) {
    throw new HttpError(400, 'Том админ өөрийн профайлыг устгах боломжгүй');
  }
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!rows[0]) throw new HttpError(404, 'Хэрэглэгч олдсонгүй');
  await db.transaction(async (tx) => {
    await tx.delete(sessions).where(eq(sessions.userId, id));
    await tx.delete(postLikes).where(eq(postLikes.userId, id));
    await tx.delete(postComments).where(eq(postComments.authorId, id));
    // Тухайн хэрэглэгчийн постууд дээрх бусдын like/сэтгэгдэл cascade-аар арилна.
    await tx.delete(posts).where(eq(posts.authorId, id));
    await tx.delete(messages).where(eq(messages.authorId, id));
    await tx.delete(directMessages).where(or(eq(directMessages.senderId, id), eq(directMessages.recipientId, id)));
    await tx.delete(dmReads).where(or(eq(dmReads.userId, id), eq(dmReads.partnerId, id)));
    await tx.delete(roomAccess).where(eq(roomAccess.userId, id));
    await tx.delete(banLogs).where(or(eq(banLogs.userId, id), eq(banLogs.bannedById, id), eq(banLogs.unbannedById, id)));
    await tx.delete(users).where(eq(users.id, id));
  });
  res.status(204).send();
}));
