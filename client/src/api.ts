// Чат — API клиент (same-origin; Vite dev нь /api-г localhost:3001 рүү proxy хийдэг).
import type { BanLog, ChatMessage, DirectConversation, DirectMessage, MemberRow, Post, PostComment, ReactionCount, ReactionTargetType, User, UserProfile } from '../../shared/src/types';

const TOKEN_KEY = 'chat_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function saveToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

/** Серверийн алдаа: Mongolian { error } мессеж + HTTP статус.
    Бандуулсан үед banned=true, bannedUntil (ISO эсвэл null) дамжина. */
export class ApiError extends Error {
  status: number;
  banned?: boolean;
  bannedUntil?: string | null;

  constructor(message: string, status: number, banned?: boolean, bannedUntil?: string | null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.banned = banned;
    this.bannedUntil = bannedUntil;
  }
}

/** Бангийн тухай мэдээллийн үйл явдал — App сонсож, дэлгэц дүүрэн мэдэгдэл харуулна. */
export const BAN_EVENT = 'chat:banned';

export function dispatchBanEvent(bannedUntil: string | null): void {
  window.dispatchEvent(new CustomEvent(BAN_EVENT, { detail: { bannedUntil } }));
}

export async function api<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...((opts.headers as Record<string, string> | undefined) ?? {}),
  };
  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (typeof opts.body === 'string' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(path, { ...opts, headers });
  if (!res.ok) {
    let message = 'Алдаа гарлаа. Дахин оролдоно уу.';
    let banned: boolean | undefined;
    let bannedUntil: string | null | undefined;
    try {
      const data: unknown = await res.json();
      if (data && typeof data === 'object' && 'error' in data && typeof (data as { error: unknown }).error === 'string') {
        message = (data as { error: string }).error;
      }
      if (data && typeof data === 'object' && (data as { banned?: unknown }).banned === true) {
        banned = true;
        const until = (data as { bannedUntil?: unknown }).bannedUntil;
        bannedUntil = typeof until === 'string' ? until : null;
        // Нэвтрэх үед бандуулсан бол нэвтрэх хуудас өөрөө мэдэгдэл харуулна —
        // бусад хүсэлт дээр бандуулсан гэдгийг апп даяар мэдэгдэнэ.
        if (!path.startsWith('/api/auth/login')) {
          dispatchBanEvent(bannedUntil);
        }
      }
    } catch {
      // JSON биш алдааны хариулт — анхдагч мессежийг хэрэглэнэ.
    }
    throw new ApiError(message, res.status, banned, bannedUntil);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

function jsonBody(body: unknown): RequestInit {
  return { method: 'POST', body: JSON.stringify(body) };
}

function unwrapList<T>(data: T[] | { [key: string]: unknown }): T[] {
  if (Array.isArray(data)) return data;
  for (const value of Object.values(data as Record<string, unknown>)) {
    if (Array.isArray(value)) return value as T[];
  }
  return [];
}

function unwrapOne<T>(data: T | Record<string, T>): T {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const values = Object.values(data as Record<string, unknown>);
    if (values.length === 1 && values[0] && typeof values[0] === 'object') {
      return values[0] as T;
    }
  }
  return data as T;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export async function register(name: string, username: string, password: string): Promise<User> {
  const data = await api<AuthResponse>('/api/auth/register', jsonBody({ name, username, password }));
  saveToken(data.token);
  return data.user;
}

export async function login(username: string, password: string): Promise<User> {
  const data = await api<AuthResponse>('/api/auth/login', jsonBody({ username, password }));
  saveToken(data.token);
  return data.user;
}

export function logout(): void {
  saveToken(null);
}

export async function me(): Promise<User> {
  const data = await api<User | { user: User }>('/api/auth/me');
  return 'user' in data ? data.user : data;
}

export async function listPosts(): Promise<Post[]> {
  const data = await api<Post[] | { posts: Post[] }>('/api/posts');
  return unwrapList(data);
}

export async function createPost(content: string): Promise<Post> {
  const data = await api<Post | { post: Post }>('/api/posts', jsonBody({ content }));
  return unwrapOne(data);
}

export async function toggleLike(postId: number): Promise<{ liked: boolean; likeCount: number }> {
  return api<{ liked: boolean; likeCount: number }>(`/api/posts/${postId}/like`, { method: 'POST' });
}

export async function addComment(postId: number, content: string, replyToId?: number | null): Promise<PostComment> {
  const data = await api<PostComment | { comment: PostComment }>(
    `/api/posts/${postId}/comments`,
    jsonBody({ content, replyToId: replyToId ?? null }),
  );
  return unwrapOne(data);
}

export async function editComment(commentId: number, content: string): Promise<PostComment> {
  const data = await api<PostComment | { comment: PostComment }>(`/api/comments/${commentId}`, {
    method: 'PATCH',
    body: JSON.stringify({ content }),
  });
  return unwrapOne(data);
}

export async function deletePost(postId: number): Promise<void> {
  await api<void>(`/api/posts/${postId}`, { method: 'DELETE' });
}

export async function editPost(postId: number, content: string): Promise<Post> {
  const data = await api<Post | { post: Post }>(`/api/posts/${postId}`, {
    method: 'PATCH',
    body: JSON.stringify({ content }),
  });
  return unwrapOne(data);
}

/** Нийтийн чатын мессежүүд (одоо зөвхөн нийтийн өрөө л байна). */
export async function listMessages(): Promise<ChatMessage[]> {
  const data = await api<ChatMessage[] | { messages: ChatMessage[] }>('/api/rooms/public/messages');
  return unwrapList(data);
}

export async function sendMessage(content: string, replyToId?: number | null): Promise<ChatMessage> {
  const data = await api<ChatMessage | { message: ChatMessage }>(
    '/api/rooms/public/messages',
    jsonBody({ content, replyToId: replyToId ?? null }),
  );
  return unwrapOne(data);
}

export async function editMessage(messageId: number, content: string): Promise<ChatMessage> {
  const data = await api<ChatMessage | { message: ChatMessage }>(`/api/messages/${messageId}`, {
    method: 'PATCH',
    body: JSON.stringify({ content }),
  });
  return unwrapOne(data);
}

export async function deleteMessage(messageId: number): Promise<void> {
  await api<void>(`/api/messages/${messageId}`, { method: 'DELETE' });
}

/** Эможи урвал — ижил эможи дахин дарвал арилна, өөр эможи дарвал солигдоно. */
export async function toggleReaction(
  targetType: ReactionTargetType,
  targetId: number,
  emoji: string,
): Promise<ReactionCount[]> {
  const data = await api<{ reactions: ReactionCount[] }>(
    '/api/reactions',
    jsonBody({ targetType, targetId, emoji }),
  );
  return data.reactions;
}

export async function adminListMembers(): Promise<MemberRow[]> {
  const data = await api<MemberRow[] | { users: MemberRow[] }>('/api/admin/users');
  return unwrapList(data);
}

export async function adminGrantModerator(userId: number): Promise<User> {
  const data = await api<User | { user: User }>(`/api/admin/users/${userId}/moderator`, { method: 'POST' });
  return unwrapOne(data);
}

export async function adminRevokeModerator(userId: number): Promise<User> {
  const data = await api<User | { user: User }>(`/api/admin/users/${userId}/revoke-moderator`, { method: 'POST' });
  return unwrapOne(data);
}

/** Хугацаатай бандах — durationMinutes: 5, 15, 30, 1440, эсвэл null = Байнга. */
export async function adminBanUser(userId: number, durationMinutes?: number | null): Promise<User> {
  const data = await api<User | { user: User }>(
    `/api/admin/users/${userId}/ban`,
    jsonBody({ durationMinutes: durationMinutes ?? null }),
  );
  return unwrapOne(data);
}

export async function adminUnbanUser(userId: number): Promise<User> {
  const data = await api<User | { user: User }>(`/api/admin/users/${userId}/unban`, { method: 'POST' });
  return unwrapOne(data);
}

/** Бангийн түүх — зөвхөн том админ. */
export async function getBanLogs(): Promise<BanLog[]> {
  const data = await api<BanLog[] | { logs: BanLog[] }>('/api/admin/ban-logs');
  return unwrapList(data);
}

export async function adminGrantBanPermission(userId: number): Promise<User> {
  const data = await api<User | { user: User }>(`/api/admin/users/${userId}/ban-permission`, { method: 'POST' });
  return unwrapOne(data);
}

export async function adminRevokeBanPermission(userId: number): Promise<User> {
  const data = await api<User | { user: User }>(`/api/admin/users/${userId}/revoke-ban-permission`, { method: 'POST' });
  return unwrapOne(data);
}

/** Жижиг админд өнгө/фонт сонгох эрх олгох — зөвхөн том админ. */
export async function adminGrantStylePermission(userId: number): Promise<User> {
  const data = await api<User | { user: User }>(`/api/admin/users/${userId}/style-permission`, { method: 'POST' });
  return unwrapOne(data);
}

/** Жижиг админы өнгө/фонт сонгох эрхийг хураах — зөвхөн том админ. */
export async function adminRevokeStylePermission(userId: number): Promise<User> {
  const data = await api<User | { user: User }>(`/api/admin/users/${userId}/revoke-style-permission`, { method: 'POST' });
  return unwrapOne(data);
}

/** Өөрийн бичлэгийн өнгө, фонт сонгох (color: '#RRGGBB' эсвэл null,
    font: 7 фонтын түлхүүр эсвэл null) — зөвхөн canStyle эрхтэй жижиг админ. */
export async function setMyStyle(color: string | null, font: string | null): Promise<User> {
  const data = await api<User | { user: User }>('/api/me/style', jsonBody({ color, font }));
  return unwrapOne(data);
}

/** Бичлэгийн өнгө оноох / арилгах (color: '#RRGGBB' эсвэл null) — зөвхөн том админ. */
export async function setTextColor(userId: number, color: string | null): Promise<User> {
  const data = await api<User | { user: User }>(
    `/api/admin/users/${userId}/text-color`,
    jsonBody({ color }),
  );
  return unwrapOne(data);
}

/** Ёс зүйн гэрээ — жижиг админ өөрөө зөвшөөрнө (хоёр дахь check ороход
    бүх эрх автоматаар идэвхжинэ). */
export async function agreeMiniAgreement(): Promise<User> {
  const data = await api<User | { user: User }>('/api/agreement/mini', { method: 'POST' });
  return unwrapOne(data);
}

/** Ёс зүйн гэрээ — том админ тухайн жижиг админы гэрээг зөвшөөрнө. */
export async function agreeAdminAgreement(userId: number): Promise<User> {
  const data = await api<User | { user: User }>(`/api/agreement/admin/${userId}`, { method: 'POST' });
  return unwrapOne(data);
}

/** Гэрээнд харуулах том админы нэр, нэвтрэх нэр. */
export async function getAgreementAdmin(): Promise<User> {
  const data = await api<User | { admin: User }>('/api/agreement/admin');
  return 'admin' in data ? data.admin : data;
}

/** Хэрэглэгчийн аккоунтийг устгах (пост, мессеж, чаттай нь хамт) — зөвхөн том админ. */
export async function adminDeleteUser(userId: number): Promise<void> {
  await api<void>(`/api/admin/users/${userId}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------- онлайн/офлайн + профайл зураг

export async function heartbeat(): Promise<void> {
  await api<{ ok: boolean }>('/api/presence/heartbeat', { method: 'POST' });
}

export async function uploadAvatar(avatar: string): Promise<User> {
  const data = await api<User | { user: User }>('/api/me/avatar', jsonBody({ avatar }));
  return unwrapOne(data);
}

export async function removeAvatar(): Promise<User> {
  const data = await api<User | { user: User }>('/api/me/avatar', { method: 'DELETE' });
  return unwrapOne(data);
}

/** Өөрийн профайлыг нууц үгээрээ баталгаажуулж бүрмөсөн устгана. */
export async function deleteMyAccount(password: string): Promise<void> {
  await api<void>('/api/me', { method: 'DELETE', body: JSON.stringify({ password }) });
}

/** Хэрэглэгчийн профайл (зураг, онлайн төлөв, постын тоо). */
export async function getUserProfile(userId: number): Promise<UserProfile> {
  return api<UserProfile>(`/api/users/${userId}`);
}

// ---------------------------------------------------------------- хувь чат (1:1)

export async function listDmConversations(): Promise<DirectConversation[]> {
  const data = await api<DirectConversation[] | { conversations: DirectConversation[] }>('/api/dm/conversations');
  return unwrapList(data);
}

export async function listDmMessages(userId: number): Promise<DirectMessage[]> {
  const data = await api<DirectMessage[] | { messages: DirectMessage[] }>(`/api/dm/${userId}`);
  return unwrapList(data);
}

export async function sendDm(userId: number, content: string, replyToId?: number | null): Promise<DirectMessage> {
  const data = await api<DirectMessage | { message: DirectMessage }>(
    `/api/dm/${userId}`,
    jsonBody({ content, replyToId: replyToId ?? null }),
  );
  return unwrapOne(data);
}

export async function editDm(messageId: number, content: string): Promise<DirectMessage> {
  const data = await api<DirectMessage | { message: DirectMessage }>(`/api/dm/${messageId}`, {
    method: 'PATCH',
    body: JSON.stringify({ content }),
  });
  return unwrapOne(data);
}

export async function deleteDm(messageId: number): Promise<void> {
  await api<void>(`/api/dm/${messageId}`, { method: 'DELETE' });
}
