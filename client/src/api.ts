// Чат — API клиент (same-origin; Vite dev нь /api-г localhost:3001 рүү proxy хийдэг).
import type { AccessRequest, AccessStatus, ChatMessage, DirectConversation, DirectMessage, MemberRow, Post, PostComment, Room, User, UserProfile } from '../../shared/src/types';

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

/** Серверийн алдаа: Mongolian { error } мессеж + HTTP статус. */
export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
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
    try {
      const data: unknown = await res.json();
      if (data && typeof data === 'object' && 'error' in data && typeof (data as { error: unknown }).error === 'string') {
        message = (data as { error: string }).error;
      }
    } catch {
      // JSON биш алдааны хариулт — анхдагч мессежийг хэрэглэнэ.
    }
    throw new ApiError(message, res.status);
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

export async function addComment(postId: number, content: string): Promise<PostComment> {
  const data = await api<PostComment | { comment: PostComment }>(`/api/posts/${postId}/comments`, jsonBody({ content }));
  return unwrapOne(data);
}

export async function deletePost(postId: number): Promise<void> {
  await api<void>(`/api/posts/${postId}`, { method: 'DELETE' });
}

export async function listMessages(room: Room): Promise<ChatMessage[]> {
  const data = await api<ChatMessage[] | { messages: ChatMessage[] }>(`/api/rooms/${room}/messages`);
  return unwrapList(data);
}

export async function sendMessage(room: Room, content: string): Promise<ChatMessage> {
  const data = await api<ChatMessage | { message: ChatMessage }>(`/api/rooms/${room}/messages`, jsonBody({ content }));
  return unwrapOne(data);
}

export async function deleteMessage(messageId: number): Promise<void> {
  await api<void>(`/api/messages/${messageId}`, { method: 'DELETE' });
}

export async function requestPrivateAccess(): Promise<AccessStatus> {
  const data = await api<{ status: AccessStatus }>('/api/rooms/private/request', { method: 'POST' });
  return data.status;
}

export async function myPrivateAccess(): Promise<AccessStatus | 'none'> {
  const data = await api<{ status: AccessStatus | 'none' }>('/api/rooms/private/my-access');
  return data.status;
}

export async function adminListMembers(): Promise<MemberRow[]> {
  const data = await api<MemberRow[] | { users: MemberRow[] }>('/api/admin/users');
  return unwrapList(data);
}

export async function adminListAccessRequests(): Promise<AccessRequest[]> {
  const data = await api<AccessRequest[] | { requests: AccessRequest[] }>('/api/admin/access-requests');
  return unwrapList(data);
}

export async function adminApproveAccess(requestId: number): Promise<void> {
  await api<void>(`/api/admin/access-requests/${requestId}/approve`, { method: 'POST' });
}

export async function adminDenyAccess(requestId: number): Promise<void> {
  await api<void>(`/api/admin/access-requests/${requestId}/deny`, { method: 'POST' });
}

export async function adminGrantModerator(userId: number): Promise<User> {
  const data = await api<User | { user: User }>(`/api/admin/users/${userId}/moderator`, { method: 'POST' });
  return unwrapOne(data);
}

export async function adminRevokeModerator(userId: number): Promise<User> {
  const data = await api<User | { user: User }>(`/api/admin/users/${userId}/revoke-moderator`, { method: 'POST' });
  return unwrapOne(data);
}

export async function adminBanUser(userId: number): Promise<User> {
  const data = await api<User | { user: User }>(`/api/admin/users/${userId}/ban`, { method: 'POST' });
  return unwrapOne(data);
}

export async function adminUnbanUser(userId: number): Promise<User> {
  const data = await api<User | { user: User }>(`/api/admin/users/${userId}/unban`, { method: 'POST' });
  return unwrapOne(data);
}

export async function adminGrantBanPermission(userId: number): Promise<User> {
  const data = await api<User | { user: User }>(`/api/admin/users/${userId}/ban-permission`, { method: 'POST' });
  return unwrapOne(data);
}

export async function adminRevokeBanPermission(userId: number): Promise<User> {
  const data = await api<User | { user: User }>(`/api/admin/users/${userId}/revoke-ban-permission`, { method: 'POST' });
  return unwrapOne(data);
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

export async function sendDm(userId: number, content: string): Promise<DirectMessage> {
  const data = await api<DirectMessage | { message: DirectMessage }>(`/api/dm/${userId}`, jsonBody({ content }));
  return unwrapOne(data);
}

export async function deleteDm(messageId: number): Promise<void> {
  await api<void>(`/api/dm/${messageId}`, { method: 'DELETE' });
}
