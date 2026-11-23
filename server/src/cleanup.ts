// Чат — тогтмол цэвэрлэгээний ажил (in-process, 60 секунд тутамд).
// Сервер нь Railway дээр ганц instance-аар ажилладаг тул setInterval хангалттай.
// 1) 15 минутаас хуучин өрөөний болон хувь чатын мессежийг устгана
//    (постод хамаарахгүй — постууд хэвээрээ үлдэнэ).
// 2) Хугацаа нь дууссан хугацаатай банг тайлж, бангийн түүхийг
//    auto_expired гэж тэмдэглэнэ (байнга банд хүрэхгүй).
// Юу ч устгаж/тайлаагүй үед лог бичихгүй — лог спам үүсгэхгүйн тулд.

import { sql } from 'drizzle-orm';
import { db } from './db';

const MESSAGE_TTL = "interval '15 minutes'";
const DEFAULT_INTERVAL_MS = 60_000;

export interface CleanupResult {
  deletedMessages: number;
  deletedDms: number;
  expiredBans: number;
}

export async function runCleanup(): Promise<CleanupResult> {
  const msg = await db.execute(sql.raw(`DELETE FROM messages WHERE created_at < now() - ${MESSAGE_TTL}`));
  const dm = await db.execute(sql.raw(`DELETE FROM direct_messages WHERE created_at < now() - ${MESSAGE_TTL}`));
  // Хугацаа нь дууссан банг олж, нэг мэдэгдэлд (CTE) тайлж түүхийг тэмдэглэнэ.
  // JS массивыг ANY($1) руу дамжуулах нь pg драйверт "malformed array literal"
  // алдаа өгдөг нь батлагдсан тул массив параметр ашиглахгүй.
  const expired = await db.execute(
    sql.raw('SELECT id FROM users WHERE banned_until IS NOT NULL AND banned_until < now()'),
  );
  const expiredCount = expired.rows.length;
  if (expiredCount > 0) {
    await db.execute(
      sql.raw(
        `WITH expired AS (
           UPDATE users SET banned_until = NULL
           WHERE banned_until IS NOT NULL AND banned_until < now()
           RETURNING id
         )
         UPDATE ban_logs SET auto_expired = true, unbanned_at = COALESCE(expires_at, now())
         FROM expired
         WHERE ban_logs.unbanned_at IS NULL AND ban_logs.user_id = expired.id`,
      ),
    );
  }
  const result: CleanupResult = {
    deletedMessages: msg.rowCount ?? 0,
    deletedDms: dm.rowCount ?? 0,
    expiredBans: expiredCount,
  };
  if (result.deletedMessages > 0 || result.deletedDms > 0 || result.expiredBans > 0) {
    console.log(
      `Цэвэрлэгээ: ${result.deletedMessages} өрөөний мессеж, ${result.deletedDms} хувь чат, ${result.expiredBans} бангийн хугацаа дууслаа.`,
    );
  }
  return result;
}

let started = false;

/** Сервер эхлэхэд нэг удаа + тогтмол давтамжтайгаар цэвэрлэгээг ажиллуулна.
    Давтамжийг CLEANUP_INTERVAL_MS орчноор өөрчилж болно (туршилтад хэрэглэнэ). */
export function startCleanup(): void {
  if (started) return;
  started = true;
  const intervalMs = Number(process.env.CLEANUP_INTERVAL_MS || DEFAULT_INTERVAL_MS);
  void runCleanup().catch((err) => console.error('Цэвэрлэгээний алдаа:', err));
  setInterval(() => {
    void runCleanup().catch((err) => console.error('Цэвэрлэгээний алдаа:', err));
  }, intervalMs);
}
