// Чат — нэвтрэлт / сесс / эрх.
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { sessions, users } from './schema';
import type { Role } from '../../shared/src/types';

/** Хэрэглэгч бантай эсэх — байнга бан (banned) ЭСВЭЛ хугацаа нь дуусаагүй
    хугацаатай бан (bannedUntil ирээдүйд) байгаа үед true. Хугацаа нь
    өнгөрсөн бан нь бан гэж тооцогдохгүй (цэвэрлэгээний ажил баганыг арилгана). */
export function isBannedNow(banned: boolean, bannedUntil: Date | null): boolean {
  if (banned) return true;
  return bannedUntil !== null && bannedUntil.getTime() > Date.now();
}

/** Бандуулсан хэрэглэгчид харуулах мессеж — хугацааг Монгол цагаар бичнэ. */
export function banMessage(bannedUntil: Date | null): string {
  if (bannedUntil) {
    const when = bannedUntil.toLocaleString('mn-MN', {
      timeZone: 'Asia/Ulaanbaatar',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    return `Та ${when} хүртэл бантай байна. Том админтай холбогдоно уу`;
  }
  return 'Та байнга бантай байна. Том админтай холбогдоно уу';
}

/** req.user-д хавсаргадаг нэвтэрсэн хэрэглэгчийн мэдээлэл (нууц үггүй). */
export interface AuthUser {
  id: number;
  name: string;
  username: string;
  role: Role;
  /** Байнга бандуулсан эсэх. */
  banned: boolean;
  /** Хугацаатай бан дуусах цаг — байхгүй бол null. */
  bannedUntil: Date | null;
  canBan: boolean;
  avatar: string | null;
  /** Бичлэгийн өнгө ('#RRGGBB') — байхгүй бол null. */
  textColor: string | null;
  lastSeenAt: Date | null;
  createdAt: Date;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Шинэ сесс үүсгэж токен буцаана. */
export async function createSession(userId: number): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  await db.insert(sessions).values({ token, userId });
  return token;
}

export async function deleteSession(token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.token, token));
}

function readBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token ? token : null;
}

async function loadUserByToken(token: string): Promise<AuthUser | null> {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      username: users.username,
      role: users.role,
      banned: users.banned,
      bannedUntil: users.bannedUntil,
      canBan: users.canBan,
      avatar: users.avatar,
      textColor: users.textColor,
      lastSeenAt: users.lastSeenAt,
      createdAt: users.createdAt,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.token, token))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return { ...row, role: row.role as Role };
}

/** Нэвтэрсэн хэрэглэгчийг ачаалж req.user-д хавсаргана. */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = readBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Нэвтрэх шаардлагатай байна' });
    return;
  }
  const user = await loadUserByToken(token);
  if (!user) {
    res.status(401).json({ error: 'Сесс хүчингүй болсон байна. Дахин нэвтэрнэ үү' });
    return;
  }
  if (isBannedNow(user.banned, user.bannedUntil)) {
    // Бандуулсан хэрэглэгчийн хуучин сесс ч хүчингүй болно.
    // Клиент бандуулсан гэдгийг таньж, бангийн мэдэгдэл харуулна.
    res.status(401).json({
      error: banMessage(user.bannedUntil),
      banned: true,
      bannedUntil: user.bannedUntil ? user.bannedUntil.toISOString() : null,
    });
    return;
  }
  req.user = user;
  next();
}

/** Зөвхөн том админ. requireAuth-ийн дараа залгана. */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Нэвтрэх шаардлагатай байна' });
    return;
  }
  if (req.user.role !== 'admin') {
    res.status(403).json({ error: 'Энэ үйлдлийг зөвхөн том админ хийх боломжтой' });
    return;
  }
  next();
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const USERNAME_RE = /^[A-Za-z0-9._-]+$/;

/**
 * Хэрэглэгч бүртгэнэ. Хүснэгтийн АНХНЫ хэрэглэгч 'admin' (том админ),
 * дараагийнх нь 'member' болно. Эрх дээшлүүлэх үйлдэл зөвхөн админд
 * (жижиг админ олгох/хураах) байгаа — өөрөө админ болох зам байхгүй.
 */
export async function registerUser(
  name: string,
  username: string,
  password: string,
): Promise<AuthUser> {
  const cleanName = (name ?? '').trim();
  const cleanUsername = (username ?? '').trim();
  if (cleanName.length < 1 || cleanName.length > 60) {
    throw new HttpError(400, 'Нэр 1–60 тэмдэгт байх ёстой');
  }
  if (cleanUsername.length < 3 || cleanUsername.length > 30 || !USERNAME_RE.test(cleanUsername)) {
    throw new HttpError(
      400,
      'Нэвтрэх нэр 3–30 тэмдэгт байх ба зөвхөн үсэг, тоо, цэг, доогуур зураас, зураас агуулна',
    );
  }
  if (!password || password.length < 4) {
    throw new HttpError(400, 'Нууц үг хамгийн багадаа 4 тэмдэгт байх ёстой');
  }

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, cleanUsername))
    .limit(1);
  if (existing.length > 0) {
    throw new HttpError(409, 'Энэ нэвтрэх нэр аль хэдийн бүртгэгдсэн байна');
  }

  const all = await db.select({ id: users.id }).from(users).limit(1);
  const role: Role = all.length === 0 ? 'admin' : 'member';

  const passwordHash = await hashPassword(password);
  const now = new Date();
  const inserted = await db
    .insert(users)
    .values({ name: cleanName, username: cleanUsername, passwordHash, role, lastSeenAt: now })
    .returning({ id: users.id, name: users.name, username: users.username, role: users.role, banned: users.banned, bannedUntil: users.bannedUntil, canBan: users.canBan, avatar: users.avatar, textColor: users.textColor, lastSeenAt: users.lastSeenAt, createdAt: users.createdAt });
  const row = inserted[0];
  return { ...row, role: row.role as Role };
}
