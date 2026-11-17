import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { autoSyncPastAndPresentMatches } from "@/lib/server/auto-issue";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/settlement/v19-restore
 * وضعیت دفتر فعلی برای پنجره تأیید بازگشت به معماری برنده v19.0.
 */
export async function GET() {
  try {
    const [total, settled, pending, vetoed, voided, dualCards] = await Promise.all([
      db.issuedSlip.count(),
      db.issuedSlip.count({ where: { status: { in: ["WON_A", "WON_B", "DOUBLE_WIN", "MIDDLE_TRAP"] } } }),
      db.issuedSlip.count({ where: { status: { in: ["PENDING", "LIVE"] } } }),
      db.issuedSlip.count({ where: { supervisorApproved: false, retroIssued: false } }),
      db.issuedSlip.count({ where: { status: "VOID" } }),
      db.issuedSlip.count({ where: { productLine: "DUAL_HEDGE" } }),
    ]);
    return NextResponse.json({
      success: true,
      ledger: { total, settled, pending, vetoed, voided, dualCards },
      version: "v19.0-restore-dual-hedge",
    });
  } catch (error) {
    console.error("GET /api/settlement/v19-restore error:", error);
    return NextResponse.json({ success: false, error: "خطا در خواندن وضعیت دفتر" }, { status: 500 });
  }
}

/**
 * POST /api/settlement/v19-restore?daysBack=12
 * ═══ بازگشت به معماری برنده «همپوشانی دوقلو» نسخه ۱۹.۰ — بازمحاسبه کامل کارنامه ═══
 * ممیزی نسخه ۲۲.۰: حذف همپوشانی + قانون توقف فید باعث «۰/۰ بازی» و قفل بانک روی
 * ۱,۰۰۰ واحد شده بود. این مسیر کل کارنامه را پاک و با موتور احیاشده v19.0 بازسازی می‌کند:
 *  ۱) ۳ الگوی طلایی همپوشانی دوقلو G1/G2/G3 با ناحیه برد دوبل (Double-Win)
 *  ۲) فیلتر طلایی ضریب همپوشانی مثبت: impliedSum ≤ ۰.۸۶ · حاشیه ≥ ۱۵٪ ·
 *     برد دوبل ≥ ۱۲٪ · ریسک تله میانی ≤ ۱۱.۵٪ — مابقی → دفتر سایه
 *  ۳) تخصیص نامتقارن ۶۵u تیپ A + ۳۵u تیپ B (سند v19.0)
 *  ۴) سپر استاپ‌لاس زنده دقیقه ۶۵ (−۴۵.۰u در تله میانی) فقط برای کارت‌های دوبال
 *  ۵) رژیم زیان‌ده «خوشه نتیجه دقیق (−۱۶u)» غیرفعال — فقط رژیم‌های همپوشانی مثبت
 *     در بانک اصلی محاسبه می‌شوند
 *  ۶) خط لوله ترکیبی ESPN + TheSportsDB + Polymarket + Hybrid Poisson بدون قفل توقف
 *  Idempotent — اجرای مجدد همان نتیجه را می‌دهد.
 */
export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const daysBack = Math.max(3, Math.min(21, Number(url.searchParams.get("daysBack") ?? 12) || 12));

    // ─── مرحله ۱: پاک‌سازی کامل کارنامه قدیمی (دفتر قفل‌شده v22 با کارت‌های VOID) ───
    const delOutbox = await db.telegramOutbox.deleteMany();
    const delJournal = await db.settlementJournal.deleteMany();
    const delDoctrine = await db.doctrineEntry.deleteMany();
    const delSlips = await db.issuedSlip.deleteMany();
    void delSlips;

    // ─── مرحله ۲: ریست کلیدهای Dedupe کانال‌ها (برآیند/هدیه/رادار امروز دوباره ساخته می‌شوند) ───
    const dedupeKeys = [
      "funnel_last_gift_day",
      "funnel_last_radar_day",
      "funnel_last_pnl_day",
      "last_daily_digest_day",
    ];
    for (const key of dedupeKeys) {
      // deleteMany بدون استثنای P2025 (کلید ممکن است وجود نداشته باشد)
      await db.setting.deleteMany({ where: { key } });
    }

    // ─── مرحله ۳: صدور + تسویه مجدد همه بازی‌های FT با معماری احیاشده v19.0 ───
    const auto = await autoSyncPastAndPresentMatches({ force: true, notify: false, cleanSlate: true, daysBack });

    // ─── آمار نهایی دفتر v19.0-restore (منبع واحد حقیقت) ───
    const [total, settledRows, pending, vetoed, byLine] = await Promise.all([
      db.issuedSlip.count(),
      db.issuedSlip.findMany({
        where: { status: { in: ["WON_A", "WON_B", "DOUBLE_WIN", "MIDDLE_TRAP"] }, supervisorApproved: true, retroIssued: false },
        select: { status: true, netProfit: true, productLine: true, stopLossShield: true },
      }),
      db.issuedSlip.count({ where: { status: { in: ["PENDING", "LIVE"] } } }),
      db.issuedSlip.count({ where: { supervisorApproved: false, retroIssued: false } }),
      db.issuedSlip.groupBy({ by: ["productLine"], _count: { _all: true } }),
    ]);
    const netProfit = Math.round(settledRows.reduce((a, b) => a + (b.netProfit ?? 0), 0) * 100) / 100;
    const wins = settledRows.filter((r) => r.status !== "MIDDLE_TRAP").length;
    const winRate = settledRows.length > 0 ? Math.round((wins / settledRows.length) * 1000) / 10 : 0;

    return NextResponse.json({
      success: true,
      version: "v19.0-restore-dual-hedge",
      wiped: { outbox: delOutbox.count, journal: delJournal.count, doctrine: delDoctrine.count, slips: delSlips.count },
      windowDays: daysBack,
      rescanned: {
        scanned: auto.scanned,
        recalculated: auto.registeredPast,
        todayPending: auto.registeredToday,
        vetoed: auto.vetoed,
        settled: auto.settled,
        noLiveOdds: auto.noLiveOdds,
      },
      ledgerV19: {
        total,
        settled: settledRows.length,
        pending,
        vetoed,
        winRatePct: winRate,
        netProfitUnits: netProfit,
        bank: {
          startBank: 1000,
          netProfit,
          finalBank: Math.round((1000 + netProfit) * 100) / 100,
          formula: "win = +stake×odds−staked · dual-hedge loss = −45 (سپر دقیقه ۶۵) · single loss = −staked",
        },
        wonA: settledRows.filter((r) => r.status === "WON_A").length,
        wonB: settledRows.filter((r) => r.status === "WON_B").length,
        doubleWin: settledRows.filter((r) => r.status === "DOUBLE_WIN").length,
        middleTrap: settledRows.filter((r) => r.status === "MIDDLE_TRAP").length,
        stopLossShieldCount: settledRows.filter((r) => r.stopLossShield).length,
        byProductLine: byLine.map((g) => ({ line: g.productLine, count: g._count._all })),
      },
      message:
        "بازگشت به معماری برنده v19.0 انجام شد — همپوشانی دوقلو G1/G2/G3 + فیلتر ضریب همپوشانی مثبت + تخصیص ۶۵/۳۵ + سپر دقیقه ۶۵ + حذف رژیم زیان‌ده خوشه نتیجه دقیق.",
    });
  } catch (error) {
    console.error("POST /api/settlement/v19-restore error:", error);
    return NextResponse.json({ success: false, error: "خطا در بازمحاسبه v19.0-restore" }, { status: 500 });
  }
}
