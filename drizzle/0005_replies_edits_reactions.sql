-- 0005: хариу (reply), засвар (edit), эможи урвал (reactions) +
-- зөвшөөрөлтэй (хувийн) өрөөг хаах.
--
-- Хариу: эх мессежийн зохиогчийн нэр + текстийг snapshot-аар хадгална —
-- эх мессеж 15 минутын дараа автоматаар устах, эсвэл устгагдсан ч
-- хариулт нь эшлэлтэйгээ уншигдах хэвээр байна. reply_to_id нь зөвхөн
-- лавлагаа (эх нь устгахад NULL болно, snapshot хэвээрээ үлдэнэ).
-- Засвар: edited_at тэмдэглэнэ — засвар нь 15 минутын устгах цагийг
-- сунгадаггүй (created_at хэвээрээ).

ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_id INTEGER REFERENCES messages(id) ON DELETE SET NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_author_name TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_text TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS reply_to_id INTEGER REFERENCES direct_messages(id) ON DELETE SET NULL;
ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS reply_author_name TEXT;
ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS reply_text TEXT;
ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

ALTER TABLE post_comments ADD COLUMN IF NOT EXISTS reply_to_id INTEGER REFERENCES post_comments(id) ON DELETE SET NULL;
ALTER TABLE post_comments ADD COLUMN IF NOT EXISTS reply_author_name TEXT;
ALTER TABLE post_comments ADD COLUMN IF NOT EXISTS reply_text TEXT;
ALTER TABLE post_comments ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

ALTER TABLE posts ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

-- Эможи урвал: нэг хэрэглэгч нэг зүйл дээр нэг л урвал үлдээнэ
-- (user_id, target_type, target_id давхардахгүй).
CREATE TABLE IF NOT EXISTS reactions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  target_type VARCHAR(20) NOT NULL,
  target_id INTEGER NOT NULL,
  emoji VARCHAR(10) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT reactions_user_target_unique UNIQUE (user_id, target_type, target_id)
);
CREATE INDEX IF NOT EXISTS reactions_target_idx ON reactions (target_type, target_id);

-- Зөвшөөрөлтэй өрөөг хаах: хуучин хувийн мессежүүд болон
-- зөвшөөрлийн мөрүүдийг арилгана (мессежүүд 15 минутын дараа
-- автоматаар устах байсан тул үнэ цэнтэй зүйл алдагдахгүй).
DELETE FROM messages WHERE room = 'private';
DELETE FROM room_access;
