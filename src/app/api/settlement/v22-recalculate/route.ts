import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { settlementProfit } from "@/lib/server/liveDataService";

export const dynamic = "force-dynamic";

/**
 * POST /api/settlement/v22-recalculate
 * ═══ v22.0 — بازمحاسبه ۱۰۰٪ صادقانه بانک ۱,۰۰۰ واحدی (سند §۳) ═══
 * ۱) تسویه صادقانه: هر باخت دقیقاً -۱۰۰.0 واحد (استیک کامل — بدون استاپ‌لاس مصنوعی -۴۵)؛
 *    هر برد با ضریب واقعی کارت: profit = stake × odds − staked (+۸۰..+۱۲۵u در سه خط تولید).
 *    همه سطرها فقط از «تنها فرمول سود مجاز سیستم» (settlementProfit) بازمحاسبه می‌شوند.
 * ۲) حذف کارت‌های ضرایب فرضی از کارنامه رسمی: هر کارتی که بازی آن ضریب زنده واقعی
 *    بوک‌میکر نداشته (STATS_ONLY — بدون OddsRecord واقعی) → VOID با یادداشت شفاف
 *    (قانون آهنین Strict Live-Odds) — از آمار رسمی خارج و در دفتر یادداشت باقی می‌ماند.
 * خروجی: خلاصه بازمحاسبه (تعداد بازمحاسبه/VOID/اسکن) + بانک نهایی از منبع واحد حقیقت.
 */
export async function POST() {
  try {
    const slips = await db.issuedSlip.findMany({
      where: { status: { in: ["WON_A", "WON_B", "DOUBLE_WIN", "MIDDLE_TRAP"] } },
    });

    let recomputed = 0;
    const recomputedRows: { hash: string; before: number; after: number }[] = [];

    for (const s of slips) {
      const prof = settlementProfit(
        s.status as "WON_A" | "WON_B" | "DOUBLE_WIN" | "MIDDLE_TRAP",
        s.stakeA,
        s.stakeB,
        s.oddsA,
        s.oddsB
      );
      const delta = Math.abs((s.netProfit ?? 0) - prof.netProfit);
      const fieldsChanged =
        delta > 0.01 ||
        (s.profitA !== null && Math.abs(s.profitA - prof.profitA) > 0.01) ||
        (s.profitB !== null && Math.abs(s.profitB - prof.profitB) > 0.01);
      if (fieldsChanged) {
        await db.issuedSlip.update({
          where: { id: s.id },
          data: {
            netProfit: prof.netProfit,
            profitA: prof.profitA,
            profitB: prof.profitB,
            // سپر استاپ‌لاس مصنوعی -۴۵ برای همیشه از حسابداری حذف شد
            stopLossShield: false,
            settleNote: `${s.settleNote ?? ""} | v22.0 honest-recalc: بازمحاسبه صادقانه (${s.netProfit ?? 0}u → ${prof.netProfit}u)`.slice(0, 400),
          },
        });
        recomputed += 1;
        recomputedRows.push({ hash: s.hash.slice(0, 10), before: s.netProfit ?? 0, after: prof.netProfit });
      }
    }

    // ═══ ۲) قانون آهنین — کارت‌های بازی‌های فاقد ضریب زنده واقعی از کارنامه رسمی خارج می‌شوند ═══
    const allSlips = await db.issuedSlip.findMany({
      where: { status: { in: ["PENDING", "LIVE", "WON_A", "WON_B", "DOUBLE_WIN", "MIDDLE_TRAP"] }, autoIssued: true },
      select: { id: true, hash: true, matchId: true, externalId: true, status: true },
    });
    const matchIds = [...new Set(allSlips.map((s) => s.matchId).filter((v): v is string => Boolean(v)))];
    const [oddsRows, matchRows] = await Promise.all([
      db.oddsRecord.findMany({ where: { matchId: { in: matchIds } }, select: { matchId: true, bookmaker: true } }),
      db.match.findMany({
        where: { id: { in: matchIds } },
        select: { id: true, lambdaSource: true, oddsSource: true },
      }),
    ]);
    const realOddsMatchIds = new Set(oddsRows.filter((r) => r.bookmaker !== "ENGINE").map((r) => r.matchId));
    const marketHybridIds = new Set(matchRows.filter((m) => m.lambdaSource === "MARKET_HYBRID").map((m) => m.id));

    let voided = 0;
    for (const s of allSlips) {
      if (!s.matchId) continue; // کارت‌های ACC (externalId اختصاصی) پای‌به‌پا از ESPN تسویه می‌شوند — سالم
      const hasRealOdds = realOddsMatchIds.has(s.matchId) && marketHybridIds.has(s.matchId);
      if (!hasRealOdds) {
        await db.issuedSlip.update({
          where: { id: s.id },
          data: {
            status: "VOID",
            settleNote: "🔒 قانون آهنین v22.0 (Strict Live-Odds): این بازی ضریب زنده واقعی بوک‌میکر نداشت — کارت با ضریب فرضی از کارنامه رسمی حذف شد",
          },
        });
        voided += 1;
      }
    }

    // بانک نهایی از منبع واحد حقیقت (بدون هیچ محاسبه موازی)
    const settledRows = await db.issuedSlip.findMany({
      where: {
        supervisorApproved: true,
        retroIssued: false,
        crownTier: { not: "SILVER_SHADOW" },
        status: { in: ["WON_A", "WON_B", "DOUBLE_WIN", "MIDDLE_TRAP"] },
      },
      select: { netProfit: true },
    });
    const net = settledRows.reduce((a, r) => a + (r.netProfit ?? 0), 0);

    return NextResponse.json({
      success: true,
      version: "v22.0",
      scanned: slips.length,
      recomputed,
      recomputedRows: recomputedRows.slice(0, 25),
      voided,
      bank: {
        startBank: 1000,
        netProfit: Math.round(net * 100) / 100,
        finalBank: Math.round((1000 + net) * 100) / 100,
        formula: "win = +stake×odds−staked (واقعی) · loss = دقیقاً −staked (بدون استاپ‌لاس مصنوعی)",
      },
      message:
        "بازمحاسبه ۱۰۰٪ صادقانه انجام شد — باخت‌ها دقیقاً −۱۰۰u، کارت‌های ضریب فرضی VOID، بانک فقط از منبع واحد حقیقت (settledCards).",
    });
  } catch (error) {
    console.error("POST /api/settlement/v22-recalculate error:", error);
    return NextResponse.json({ success: false, error: "خطا در بازمحاسبه v22.0" }, { status: 500 });
  }
}
