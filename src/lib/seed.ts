// ─────────────────────────────────────────────────────────────────────────────
// v6.0 — Strict Zero-Mock Bootstrap
//
// قانون طلایی نسخه ۶.۰: هیچ بازیکن فرضی، هیچ بوک‌میکر ساختگی، هیچ لاگ کالیبراسیون
// جعلی و هیچ دکمه شبیه‌سازی در سیستم وجود ندارد. داده اولیه فقط از فید زنده
// واقعی (ESPN Scoreboard + ESPN Standings + The Odds API) ساخته می‌شود.
//
// وظایف این ماژول:
//   ۱) پاک‌سازی یک‌باره میراث v5.0 (بازی‌های SEED + لاگ‌های بریر ساختگی)
//   ۲) اگر دیتابیس خالی است → یک‌بار همگام‌سازی زنده واقعی اجرا می‌شود
// ─────────────────────────────────────────────────────────────────────────────

import { db } from "@/lib/db";

let bootstrapped = false;

/**
 * اگر دیتابیس خالی باشد، به‌جای دیتای شبیه‌سازی‌شده، فید زنده واقعی فراخوانی می‌شود.
 * در صورت قطعی شبکه، دیتابیس خالی می‌ماند و UI وضعیت شفاف «در انتظار فید زنده» نشان می‌دهد.
 */
export async function ensureSeeded(): Promise<void> {
  if (bootstrapped) return;

  // ۱) پاک‌سازی یک‌باره میراث نسخه‌های قبلی (بازی‌های ساختگی SEED + لاگ بریر جعلی)
  const legacyCount = await db.match.count({ where: { dataSource: "SEED" } });
  if (legacyCount > 0) {
    await db.match.updateMany({ where: { dataSource: "SEED" }, data: { status: "ARCHIVED" } });
    // لاگ‌های کالیبراسیون ساختگی هم پاک می‌شوند — لاگ واقعی از نتایج واقعی ESPN بازسازی می‌شود
    await db.calibrationLog.deleteMany({});
  }

  // ۲) اگر هیچ بازی فعالی نیست → بوت‌استرپ از فید زنده واقعی
  const liveCount = await db.match.count({ where: { status: { not: "ARCHIVED" } } });
  if (liveCount === 0) {
    bootstrapped = true;
    try {
      const { getLiveFeed } = await import("./server/live-ingest");
      await getLiveFeed();
    } catch (err) {
      console.warn("[v6.0] live bootstrap failed — waiting for network:", err);
    }
    return;
  }

  bootstrapped = true;
}
