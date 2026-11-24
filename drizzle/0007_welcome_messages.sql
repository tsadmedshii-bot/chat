-- 0007: угтах мессеж (welcome) — шинэ гишүүн бүртгүүлэхэд нийтийн чатад гарна.
-- messages.kind: 'user' (энгийн мессеж) | 'welcome' (системийн угтах мессеж),
-- анхдагч 'user'.
-- messages.author_id: NULL болгож суллана — угтах мессежид хүн зохиогч байхгүй.
-- Угтах мессеж нь 15 минутын оронд 1 цаг (60 минут) харагдана (cleanup.ts-ийг хар).

ALTER TABLE messages ADD COLUMN IF NOT EXISTS kind VARCHAR(10) NOT NULL DEFAULT 'user';
ALTER TABLE messages ALTER COLUMN author_id DROP NOT NULL;
