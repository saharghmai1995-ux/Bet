import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { autoSyncPastAndPresentMatches } from "@/lib/server/auto-issue";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/settlement/v15-recalculate
 * وضعیت دفتر فعلی برای نمایش در پنجره تأیید بازمحاسبه Clean-Slate.
 */
export async function GET() {
  try {
    const [total, settled, pending, vetoed, retro] = await Promise.all([
      db.issuedSlip.count(),
      db.issuedSlip.count({ where: { status: { in: ["WON_A", "WON_B", "DOUBLE_WIN", "MIDDLE_TRAP"] } } }),
      db.issuedSlip.count({ where: { status: { in: ["PENDING", "LIVE"] } } }),
      db.issuedSlip.count({ where: { supervisorApproved: false, retroIssued: false } }),
      db.issuedSlip.count({ where: { retroIssued: true } }),
    ]);
    return NextResponse.json({
      success: true,
      ledger: { total, settled, pending, vetoed, retro },
      version: "v15.0-clean-slate",
    });
  } catch (error) {
    console.error("GET /api/settlement/v15-recalculate error:", error);
    return NextResponse.json({ success: false, error: "خطا در خواندن وضعیت دفتر" }, { status: 500 });
  }
}

/**
 * POST /api/settlement/v15-recalculate
 * بازمحاسبه Clean-Slate Ledger — بخش ۳ سند ارتقا v15.0:
 *   ۱) کل کارنامه قبلی (محاسبه‌شده با فرمول باطل ضرب درون‌بازی) کامل پاک می‌شود:
 *      IssuedSlip + TelegramOutbox + SettlementJournal + DoctrineEntry
 *   ۲) کلیدهای Dedupe کانال ریست می‌شوند (برآیند/هدیه/رادار امروز دوباره ساخته می‌شوند)
 *   ۳) تمام مسابقات پایان‌یافته واقعی ESPN فقط با ۴ الگوی تک‌دکمه‌ای رسمی دوباره
 *      صادر و تسویه می‌شوند — سود خالص واقعی هر کارت با فرمول بوک‌میکر ۰.۹۵/احتمال
 *      و قفل سخت محدوده ضریب (تیپ A ∈ 1.75..2.35 · تیپ B ∈ 2.50..3.80)
 * Idempotent — اجرای مجدد همان نتیجه را می‌دهد.
 */
export async function POST() {
  try {
    // ─── مرحله ۱: پاک‌سازی کامل کارنامه قدیمی ───
    const delOutbox = await db.telegramOutbox.deleteMany();
    const delJournal = await db.settlementJournal.deleteMany();
    const delDoctrine = await db.doctrineEntry.deleteMany();
    const delSlips = await db.issuedSlip.deleteMany();
    void delSlips;

    // ─── مرحله ۲: ریست کلیدهای Dedupe کانال‌ها (برآیند امروز دوباره ساخته می‌شود) ───
    const dedupeKeys = [
      "funnel_last_gift_day",
      "funnel_last_radar_day",
      "funnel_last_pnl_day",
      "last_daily_digest_day",
    ];
    for (const key of dedupeKeys) {
      try {
        await db.setting.delete({ where: { key } });
      } catch {
        /* کلید وجود نداشت */
      }
    }

    // ─── مرحله ۳: صدور + تسویه مجدد همه بازی‌های FT با ۴ الگوی اتمیک رسمی ───
    const auto = await autoSyncPastAndPresentMatches({ force: true, notify: false, cleanSlate: true });

    // ─── آمار نهایی دفتر v15 ───
    const [total, settledRows, pending, vetoed] = await Promise.all([
      db.issuedSlip.count(),
      db.issuedSlip.findMany({
        where: { status: { in: ["WON_A", "WON_B", "DOUBLE_WIN", "MIDDLE_TRAP"] }, supervisorApproved: true, retroIssued: false },
        select: { status: true, netProfit: true },
      }),
      db.issuedSlip.count({ where: { status: { in: ["PENDING", "LIVE"] } } }),
      db.issuedSlip.count({ where: { supervisorApproved: false, retroIssued: false } }),
    ]);
    const netProfit = Math.round(settledRows.reduce((a, b) => a + (b.netProfit ?? 0), 0) * 100) / 100;
    const wins = settledRows.filter((r) => r.status !== "MIDDLE_TRAP").length;
    const winRate = settledRows.length > 0 ? Math.round((wins / settledRows.length) * 1000) / 10 : 0;

    return NextResponse.json({
      success: true,
      wiped: { outbox: delOutbox.count, journal: delJournal.count, doctrine: delDoctrine.count },
      rescanned: {
        scanned: auto.scanned,
        recalculated: auto.registeredPast,
        todayPending: auto.registeredToday,
        vetoed: auto.vetoed,
        settled: auto.settled,
      },
      ledgerV15: {
        total,
        settled: settledRows.length,
        pending,
        vetoed,
        winRatePct: winRate,
        netProfitUnits: netProfit,
        wonA: settledRows.filter((r) => r.status === "WON_A").length,
        wonB: settledRows.filter((r) => r.status === "WON_B").length,
        doubleWin: settledRows.filter((r) => r.status === "DOUBLE_WIN").length,
        middleTrap: settledRows.filter((r) => r.status === "MIDDLE_TRAP").length,
      },
      version: "v15.0-clean-slate",
    });
  } catch (error) {
    console.error("POST /api/settlement/v15-recalculate error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در بازمحاسبه Clean-Slate دفتر v15" },
      { status: 500 }
    );
  }
}
