import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { autoSyncPastAndPresentMatches } from "@/lib/server/auto-issue";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/settlement/v16-recalculate
 * وضعیت دفتر فعلی برای نمایش در پنجره تأیید بازمحاسبه Verified-Ledger.
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
      version: "v16.0-verified-ledger",
    });
  } catch (error) {
    console.error("GET /api/settlement/v16-recalculate error:", error);
    return NextResponse.json({ success: false, error: "خطا در خواندن وضعیت دفتر" }, { status: 500 });
  }
}

/**
 * POST /api/settlement/v16-recalculate
 * بازمحاسبه Verified-Ledger — بخش ۲ سند ارتقا NeoBet v16.0:
 *   «لطفاً ۴ اصلاح قطعی را در کد اعمال کن و کل کارنامه را با کلید جدید
 *    neobet_v16_verified_ledger بازمحاسبه کن»
 *
 *   ۱) کل کارنامه قبلی (محاسبه‌شده با الگوهای زیان‌ده A1/A2 و گیت شل ۴۵٪) کامل پاک می‌شود:
 *      IssuedSlip + TelegramOutbox + SettlementJournal + DoctrineEntry
 *   ۲) کلیدهای Dedupe کانال ریست می‌شوند (برآیند/هدیه/رادار امروز دوباره ساخته می‌شوند)
 *   ۳) تمام مسابقات پایان‌یافته واقعی ESPN فقط با ۳ الگوی طلایی ۹۲٪+ دوباره صادر و
 *      تسویه می‌شوند — با:
 *        · ریسک دقیق اجتماع خانه‌های ماتریس ۶×۶ (trueJointLossRiskPct) و گیت سخت ۱۰.۵٪
 *        · گیت برتری واضح فاوریت (λ_Fav ≥ ۱.۵۰ و λ_Dog ≤ ۱.۰۵)
 *        · بلک‌لیست لیگ‌های سمّی (esp.2 / usa.1 / fifa.friendly) + وایت‌لیست ساختاریافته
 *        · فرمول ضریب واقعی 0.96/prob بدون سقف مصنوعی min(2.35)
 *        · شتاب‌دهنده نامتقارن برای سود برابر زیر ۱۲٪
 *        · سقف ۲۵ تا ۳۵ بازی تراز اول (مازاد → دفتر سایه)
 *        · پنجره طلایی واحد T-60m Lineup Verified (پنجره T-24h بازنشسته)
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

    // ─── مرحله ۳: صدور + تسویه مجدد همه بازی‌های FT با ۳ الگوی طلایی v16.0 ───
    const auto = await autoSyncPastAndPresentMatches({ force: true, notify: false, cleanSlate: true });

    // ─── آمار نهایی دفتر v16 ───
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
    const avgRiskRows = await db.issuedSlip.findMany({
      where: { supervisorApproved: true, retroIssued: false },
      select: { jointLossRiskPct: true },
    });
    const avgApprovedRisk =
      avgRiskRows.length > 0
        ? Math.round((avgRiskRows.reduce((a, b) => a + (b.jointLossRiskPct ?? 0), 0) / avgRiskRows.length) * 10) / 10
        : 0;

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
      ledgerV16: {
        total,
        settled: settledRows.length,
        pending,
        vetoed,
        winRatePct: winRate,
        netProfitUnits: netProfit,
        avgApprovedRiskPct: avgApprovedRisk,
        wonA: settledRows.filter((r) => r.status === "WON_A").length,
        wonB: settledRows.filter((r) => r.status === "WON_B").length,
        doubleWin: settledRows.filter((r) => r.status === "DOUBLE_WIN").length,
        middleTrap: settledRows.filter((r) => r.status === "MIDDLE_TRAP").length,
      },
      version: "v16.0-verified-ledger",
    });
  } catch (error) {
    console.error("POST /api/settlement/v16-recalculate error:", error);
    return NextResponse.json(
      { success: false, error: "خطا در بازمحاسبه Verified-Ledger دفتر v16" },
      { status: 500 }
    );
  }
}
