-- 0006: жижиг админы өнгө/фонт сонгох эрх (can_style) + сонгосон фонт (text_font).
-- can_style: зөвхөн том админ олгоно, зөвхөн жижиг админд (moderator) хамаарна.
-- text_font: сонгосон фонтын түлхүүр (жишээ нь 'lobster'), NULL = энгийн фонт.
-- Эрх хураагдсан үед фонт нь харагдахгүй болно, харин утга нь DB-д
-- хадгалагдсан хэвээрээ байна — дахин олгоход сэргэнэ.

ALTER TABLE users ADD COLUMN IF NOT EXISTS can_style BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS text_font TEXT;
