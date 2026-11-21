// Чат — /api чиглүүлэгч (бүх endpoint энд).
import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from './db';
import { messages, postComments, postLikes, posts, roomAccess, users } from './schema';
import type { AuthUser } from './auth';
import { createSession, deleteSession, HttpError, registerUser, requireAdmin, requireAuth, verifyPassword } from './auth';
import type { AccessRequest, AccessStatus, ChatMessage, MemberRow, Post, PostComment, Role, Room, User } from '../../shared/src/types';

export const router = Router();

function toIso(d: Date): string {
  return d.toISOString();
}

function publicUser(row: { id: number; name: string; username: string; role: string; banned: boolean; canBan: boolean; createdAt: Date }): User {
  return { id: row.id, name: row.name, username: row.username, role: row.role as Role, banned: row.banned, canBan: row.canBan, createdAt: toIso(row.createdAt) };
}

/** Том админ болон жижиг админ зөвшөөрөлтэй өрөөнд автоматаар орно. */
function hasPrivateAccess(user: AuthUser, accessRow: { status: string } | undefined): boolean {
  if (user.role === 'admin' || user.role === 'moderator') return true;
  return accessRow?.status === 'approved';
}

async function loadAccess(userId: number): Promise<{ id: number; status: string } | undefined> {
  const rows = await db.select().from(roomAccess).where(eq(roomAccess.userId, userId)).limit(1);
  return rows[0];
}

function requirePrivateAccess(user: AuthUser, accessRow: { status: string } | undefined): void {
  if (!hasPrivateAccess(user, accessRow)) {
    throw new HttpError(403, 'Энэ өрөөнд орох зөвшөөрөл хэрэгтэй байна. Эхлээд хүсэлт илгээнэ үү');
  }
}

/** Өөрийнх нь, эсвэл админ/жижиг админ бол бусдынхыг устгаж болно. */
function canDelete(user: AuthUser, authorId: number): boolean {
  return user.id === authorId || user.role === 'admin' || user.role === 'moderator';
}

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void> | void;
function ah(fn: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function parseId(req: Request, label = 'Бичлэг олдсонгүй'): number {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(404, label);
  return id;
}

function parseRoom(req: Request): Room {
  const room = req.params.room;
  if (room !== 'public' && room !== 'private') throw new HttpError(404, 'Өрөө олдсонгүй');
  return room;
}

// ---------------------------------------------------------------- нэвтрэлт

router.post(
  '/auth/register',
  ah(async (req, res) => {
    const { name, username, password } = req.body ?? {};
    const user: AuthUser = await registerUser(String(name ?? ''), String(username ?? ''), String(password ?? ''));
    const token = await createSession(user.id);
    res.status(201).json({
      user: { id: user.id, name: user.name, username: user.username, role: user.role, banned: user.banned, canBan: user.canBan, createdAt: toIso(user.createdAt) },
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
    if (row.banned) {
      res.status(401).json({ error: 'Таны хаяг бандуулсан байна. Том админтай холбогдоно уу' });
      return;
    }
    const token = await createSession(row.id);
    res.json({ user: publicUser(row), token });
  }),
);

router.get('/auth/me', requireAuth, (req, res) => {
  const u = req.user as AuthUser;
  res.json({
    user: { id: u.id, name: u.name, username: u.username, role: u.role, banned: u.banned, canBan: u.canBan, createdAt: toIso(u.createdAt) },
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

// ---------------------------------------------------------------- пост (нүүр)

async function listPosts(meId: number): Promise<Post[]> {
  const postRows = await db.select().from(posts).orderBy(desc(posts.createdAt)).limit(50);
  if (postRows.length === 0) return [];
  const userRows = await db.select().from(users);
  const userById = new Map(userRows.map((u) => [u.id, publicUser(u)]));
  const likeRows = await db.select().from(postLikes);
  const commentRows = await db.select().from(postComments).orderBy(asc(postComments.createdAt));
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
    list.push({ id: c.id, postId: c.postId, author, content: c.content, createdAt: toIso(c.createdAt) });
    commentsByPost.set(c.postId, list);
  }
  return postRows.map((p) => {
    const author = userById.get(p.authorId);
    const likes = likesByPost.get(p.id) ?? { count: 0, mine: false };
    return {
      id: p.id,
      author: author ?? { id: p.authorId, name: 'Устгасан хэрэглэгч', username: '', role: 'member' as Role, banned: false, canBan: false, createdAt: toIso(p.createdAt) },
      content: p.content,
      likeCount: likes.count,
      likedByMe: likes.mine,
      comments: commentsByPost.get(p.id) ?? [],
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
    const inserted = await db.insert(postComments).values({ postId: id, authorId: u.id, content }).returning();
    const row = inserted[0];
    res.status(201).json({
      comment: {
        id: row.id,
        postId: id,
        author: publicUser({ ...u, createdAt: u.createdAt }),
        content: row.content,
        createdAt: toIso(row.createdAt),
      } satisfies PostComment,
    });
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

// ---------------------------------------------------------------- чат өрөөнүүд

async function listMessages(room: Room): Promise<ChatMessage[]> {
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.room, room))
    .orderBy(asc(messages.createdAt))
    .limit(200);
  if (rows.length === 0) return [];
  const userRows = await db.select().from(users);
  const userById = new Map(userRows.map((u) => [u.id, publicUser(u)]));
  return rows.map((m) => ({
    id: m.id,
    room: m.room as Room,
    author: userById.get(m.authorId) ?? { id: m.authorId, name: 'Устгасан хэрэглэгч', username: '', role: 'member' as Role, banned: false, canBan: false, createdAt: toIso(m.createdAt) },
    content: m.content,
    createdAt: toIso(m.createdAt),
  }));
}

router.get(
  '/rooms/:room/messages',
  requireAuth,
  ah(async (req, res) => {
    const u = req.user as AuthUser;
    const room = parseRoom(req);
    if (room === 'private') {
      requirePrivateAccess(u, await loadAccess(u.id));
    }
    res.json({ messages: await listMessages(room) });
  }),
);

router.post(
  '/rooms/:room/messages',
  requireAuth,
  ah(async (req, res) => {
    const u = req.user as AuthUser;
    const room = parseRoom(req);
    if (room === 'private') {
      requirePrivateAccess(u, await loadAccess(u.id));
    }
    const content = String(req.body?.content ?? '').trim();
    if (content.length < 1 || content.length > 2000) {
      throw new HttpError(400, 'Мессеж 1–2000 тэмдэгт байх ёстой');
    }
    const inserted = await db.insert(messages).values({ room, authorId: u.id, content }).returning();
    const row = inserted[0];
    res.status(201).json({
      message: {
        id: row.id,
        room,
        author: publicUser({ ...u, createdAt: u.createdAt }),
        content: row.content,
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
    if (!canDelete(u, rows[0].authorId)) {
      throw new HttpError(403, 'Энэ мессежийг зөвхөн зохиогч, том админ эсвэл жижиг админ устгаж болно');
    }
    await db.delete(messages).where(eq(messages.id, id));
    res.status(204).send();
  }),
);

// ---------------------------------------------------------------- зөвшөөрөлтэй өрөөний хүсэлт

router.post(
  '/rooms/private/request',
  requireAuth,
  ah(async (req, res) => {
    const u = req.user as AuthUser;
    if (u.role === 'admin' || u.role === 'moderator') {
      res.json({ status: 'approved' as AccessStatus, note: 'Танд аль хэдийн зөвшөөрөл байгаа' });
      return;
    }
    const existing = await loadAccess(u.id);
    if (existing?.status === 'approved') {
      res.json({ status: 'approved' as AccessStatus });
      return;
    }
    if (existing) {
      // Татгалзсан бол дахин хүсэлт илгээж болно.
      await db.update(roomAccess).set({ status: 'pending', decidedAt: null }).where(eq(roomAccess.id, existing.id));
      res.json({ status: 'pending' as AccessStatus });
      return;
    }
    await db.insert(roomAccess).values({ userId: u.id, status: 'pending' });
    res.status(201).json({ status: 'pending' as AccessStatus });
  }),
);

router.get(
  '/rooms/private/my-access',
  requireAuth,
  ah(async (req, res) => {
    const u = req.user as AuthUser;
    if (u.role === 'admin' || u.role === 'moderator') {
      res.json({ status: 'approved' as AccessStatus });
      return;
    }
    const row = await loadAccess(u.id);
    res.json({ status: (row?.status ?? 'none') as AccessStatus | 'none' });
  }),
);

// ---------------------------------------------------------------- админ: гишүүд, хүсэлт, жижиг админ

router.get('/admin/users', requireAuth, requireAdminOrBanModerator, ah(async (_req, res) => {
  const userRows = await db.select().from(users).orderBy(asc(users.createdAt));
  const accessRows = await db.select().from(roomAccess);
  const accessByUser = new Map(accessRows.map((a) => [a.userId, a.status as AccessStatus]));
  const members: MemberRow[] = userRows.map((u) => ({
    user: publicUser(u),
    privateAccess: u.role === 'admin' || u.role === 'moderator' ? 'auto' : (accessByUser.get(u.id) ?? 'none'),
  }));
  res.json({ users: members });
}));

router.get('/admin/access-requests', requireAuth, requireAdmin, ah(async (_req, res) => {
  const rows = await db
    .select()
    .from(roomAccess)
    .where(eq(roomAccess.status, 'pending'))
    .orderBy(asc(roomAccess.createdAt));
  const userRows = await db.select().from(users);
  const userById = new Map(userRows.map((u) => [u.id, publicUser(u)]));
  const requests: AccessRequest[] = rows
    .map((r) => {
      const user = userById.get(r.userId);
      if (!user) return null;
      return { id: r.id, user, status: r.status as AccessStatus, createdAt: toIso(r.createdAt) };
    })
    .filter((r): r is AccessRequest => r !== null);
  res.json({ requests });
}));

async function decideAccess(id: number, status: 'approved' | 'denied'): Promise<void> {
  const rows = await db.select().from(roomAccess).where(eq(roomAccess.id, id)).limit(1);
  if (!rows[0]) throw new HttpError(404, 'Хүсэлт олдсонгүй');
  await db.update(roomAccess).set({ status, decidedAt: new Date() }).where(eq(roomAccess.id, id));
}

router.post('/admin/access-requests/:id/approve', requireAuth, requireAdmin, ah(async (req, res) => {
  await decideAccess(parseId(req, 'Хүсэлт олдсонгүй'), 'approved');
  res.json({ status: 'approved' as AccessStatus });
}));

router.post('/admin/access-requests/:id/deny', requireAuth, requireAdmin, ah(async (req, res) => {
  await decideAccess(parseId(req, 'Хүсэлт олдсонгүй'), 'denied');
  res.json({ status: 'denied' as AccessStatus });
}));

async function setModerator(id: number, role: 'moderator' | 'member'): Promise<User> {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!rows[0]) throw new HttpError(404, 'Хэрэглэгч олдсонгүй');
  if (rows[0].role === 'admin') {
    throw new HttpError(400, 'Том админы эрхийг өөрчлөх боломжгүй');
  }
  // Жижиг админ эрхийг хураахад бандах эрх нь ч хамт арилна.
  const updated = await db
    .update(users)
    .set({ role, canBan: role === 'member' ? false : rows[0].canBan })
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
// - Жижиг админ: бандах эрх (can_ban) авсан үедээ л, зөвхөн энгийн хэрэглэгчийг
//   бандаж чадна — том админ болон өөр жижиг админыг бандаж болохгүй.
// - Анхдагчаар жижиг админ бандаж болохгүй.

/** Гишүүдийн жагсаалтыг том админ + бандах эрхтэй жижиг админ харж болно. */
function requireAdminOrBanModerator(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Нэвтрэх шаардлагатай байна' });
    return;
  }
  if (req.user.role === 'admin' || (req.user.role === 'moderator' && req.user.canBan)) {
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
  if (actor.role !== 'moderator' || !actor.canBan) {
    throw new HttpError(403, 'Бандаж болох эрх танд байхгүй байна');
  }
  if (target.role !== 'member') {
    throw new HttpError(403, 'Жижиг админ зөвхөн энгийн хэрэглэгчийг бандаж чадна');
  }
}

async function setBanned(actor: AuthUser, id: number, banned: boolean): Promise<User> {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!rows[0]) throw new HttpError(404, 'Хэрэглэгч олдсонгүй');
  canBanTarget(actor, rows[0]);
  const updated = await db.update(users).set({ banned }).where(eq(users.id, id)).returning();
  return publicUser(updated[0]);
}

router.post('/admin/users/:id/ban', requireAuth, ah(async (req, res) => {
  const user = await setBanned(req.user as AuthUser, parseId(req, 'Хэрэглэгч олдсонгүй'), true);
  res.json({ user });
}));

router.post('/admin/users/:id/unban', requireAuth, ah(async (req, res) => {
  const user = await setBanned(req.user as AuthUser, parseId(req, 'Хэрэглэгч олдсонгүй'), false);
  res.json({ user });
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
