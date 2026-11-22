-- 0003: хугацаатай бан + бангийн түүх + мессежийн 5 минутын хугацаа.
-- banned_until: хугацаатай бан дуусах цаг (NULL = хугацаатай бан байхгүй).
-- Байнга бан нь одоогийн users.banned (boolean) баганаар хэвээр тэмдэглэгдэнэ —
-- banned = true ЭСВЭЛ banned_until ирээдүйд байгаа үед хэрэглэгч бантай гэж тооцно.
-- Хугацаа нь дууссан банг цэвэрлэгээний ажил (server/src/cleanup.ts) арилгаж,
-- бангийн түүхийг auto_expired гэж тэмдэглэнэ.

ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_until TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS ban_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  banned_by_id INTEGER NOT NULL REFERENCES users(id),
  duration_minutes INTEGER,
  banned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  unbanned_at TIMESTAMPTZ,
  unbanned_by_id INTEGER REFERENCES users(id),
  auto_expired BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS ban_logs_user_idx ON ban_logs (user_id, banned_at DESC);
CREATE INDEX IF NOT EXISTS ban_logs_banned_at_idx ON ban_logs (banned_at DESC);
CREATE INDEX IF NOT EXISTS users_banned_until_idx ON users (banned_until) WHERE banned_until IS NOT NULL;
