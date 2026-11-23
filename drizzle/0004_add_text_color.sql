-- 0004: хэрэглэгчийн бичлэгийн өнгө — зөвхөн том админ онооно.
-- text_color: '#RRGGBB' хэлбэртэй өнгө (NULL = өнгө оноогоогүй, анхдагч өнгө).

ALTER TABLE users ADD COLUMN IF NOT EXISTS text_color TEXT;
