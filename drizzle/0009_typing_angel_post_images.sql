-- Чат шинэчлэл 19: typing заагч, тэнгэр элчийн тэмдэг, постод зураг.
-- is_angel: зөвхөн гоёлын тэмдэг — ямар ч эрх дагалдахгүй, зөвхөн
--   том админ олгоно/хураана. Эрх (can_ban/can_style/устгах) -тэй огт холбоогүй.
-- posts.image: постын зураг — data URL (JPEG/PNG/WebP, 1 MB хүртэл).
--   Пост хэзээ ч хугацаа нь дуусдаггүй хэвээрээ.
-- typing_states: хэн, хаана бичиж байгаа — 5 секундын дараа хугацаа нь
--   дуусна (updated_at + 5 сек). Мессеж биш, тусдаа төлөв.
ALTER TABLE users ADD COLUMN is_angel BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE posts ADD COLUMN image TEXT;

CREATE TABLE IF NOT EXISTS typing_states (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope VARCHAR(10) NOT NULL,
  target_id INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, scope, target_id)
);
CREATE INDEX IF NOT EXISTS typing_states_scope_idx ON typing_states (scope, updated_at);
