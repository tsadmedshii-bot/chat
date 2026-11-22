-- 0002: онлайн/офлайн төлөв, профайл зураг, хувь чат (DM).
-- Шинэ баганын анхдагч утга NULL — хуучин хэрэглэгчид офлайн гэж тооцогдоно
-- (last_seen_at нь NULL), дараагийн heartbeat-ээс нь онлайн болно.

ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT;

CREATE TABLE IF NOT EXISTS direct_messages (
  id SERIAL PRIMARY KEY,
  sender_id INTEGER NOT NULL REFERENCES users(id),
  recipient_id INTEGER NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS direct_messages_sender_idx ON direct_messages (sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS direct_messages_recipient_idx ON direct_messages (recipient_id, created_at DESC);

CREATE TABLE IF NOT EXISTS dm_reads (
  user_id INTEGER NOT NULL REFERENCES users(id),
  partner_id INTEGER NOT NULL REFERENCES users(id),
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, partner_id)
);
