import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runDixonColes } from "@/lib/engine/poisson";
import { computeMatchEngine } from "@/lib/engine/matchEngine";
import { basketProb, p1xOver25Cells, P1X_UNDER25_CELLS, jointLossProb } from "@/lib/engine/betbuilder";
import {
  dutchAllocate,
  checkMiddleTrap,
  type DutchStrategy,
  type SelectionKind,
} from "@/lib/engine/dutching";

export const dynamic = "force-dynamic";

/**
 * POST /api/agent/risk
 * ایجنت مدیریت ریسک و تیپ‌های مکمل:
 * از خروجی ایجنت تحلیلگر، دو تیپ مکمل (سود برابر / بیمه سرمایه / تهاجمی) می‌سازد.
 *
 * body: {
 *   analysisId: string,
 *   bankroll: number,
 *   strategy: "EQUAL_PROFIT" | "HEDGE_MAIN" | "AGGRESSIVE",
 *   mode: "SINGLE_MATCH" | "TWO_MATCH",
 *   secondMatchId?: string  // برای حالت میکس دو بازی
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const analysisId: string = body.analysisId;
    const bankroll: number = Math.max(1, Number(body.bankroll) || 100);
    const strategy: DutchStrategy = ["EQUAL_PROFIT", "HEDGE_MAIN", "AGGRESSIVE"].includes(body.strategy)
      ? body.strategy
      : "EQUAL_PROFIT";
    const mode: "SINGLE_MATCH" | "TWO_MATCH" = body.mode === "TWO_MATCH" ? "TWO_MATCH" : "SINGLE_MATCH";

    const analysis = await db.agentAnalysis.findUnique({
      where: { id: analysisId },
      include: { match: { include: { referee: true } } },
    });
    if (!analysis) {
      return NextResponse.json({ success: false, error: "تحلیل یافت نشد" }, { status: 404 });
    }
    const m1 = analysis.match;
    const p1x = analysis.pHome + analysis.pDraw;

    // ─── انتخاب بازی دوم برای حالت میکس دو بازی ───
    let m2 = m1;
    let p2Over = analysis.pOver25;
    let p2Under = analysis.pUnder25;
    let odds2Over = m1.oddsOver25;
    let odds2Under = m1.oddsUnder25;
    let bankerTeam = `${m1.homeTeam} - ${m1.awayTeam}`;

    if (mode === "TWO_MATCH") {
      const secondId: string | undefined = body.secondMatchId;
      const second = secondId && secondId !== m1.id
        ? await db.match.findUnique({ where: { id: secondId } })
        : await db.match.findFirst({
            where: { id: { not: m1.id }, kickoff: { gte: new Date() } },
            orderBy: { kickoff: "asc" },
          });
      if (!second) {
        return NextResponse.json({ success: false, error: "بازی دوم یافت نشد" }, { status: 404 });
      }
      m2 = second;
      bankerTeam = `${m1.homeTeam} - ${m1.awayTeam}`;

      // احتمالات گل بازی دوم: از تحلیل موجود یا موتور کمّی
      const secondAnalysis = await db.agentAnalysis.findFirst({
        where: { matchId: second.id },
        orderBy: { createdAt: "desc" },
      });
      if (secondAnalysis) {
        p2Over = secondAnalysis.pOver25;
        p2Under = secondAnalysis.pUnder25;
      } else {
        const engine2 = runDixonColes({
          homeAttack: second.homeAttack,
          awayAttack: second.awayAttack,
          homeDefense: second.homeDefense,
          awayDefense: second.awayDefense,
          leagueAvg: 1.35,
          homeAdvantage: 1.12,
          rho: -0.08,
          eloDiff: second.homeElo - second.awayElo,
          eloWeight: 0.35,
          homeAbsenceImpact: 0,
          awayAbsenceImpact: 0,
          timeDecayXi: 0.0065,
          daysAgo: 60,
        });
        p2Over = engine2.pOver25;
        p2Under = engine2.pUnder25;
      }
      odds2Over = second.oddsOver25;
      odds2Under = second.oddsUnder25;
    }

    // ─── احتمال دقیق تیپ‌های همبسته از ماتریس دیکسون-کولز (اصلاح همبستگی درون‌بازی) ───
    // در حالت تک‌بازی، ضرب p(1X) × p(OU) همبستگی درون‌بازی را نادیده می‌گیرد؛
    // احتمال صحیح = مجموع خانه‌های ماتریس (i,j) مرتبط با هر بازار:
    //   1X & Over 2.5 → i >= j و i + j >= 3
    //   1X & Under 2.5 → خانه‌های (0,0)، (1,0)، (2,0)، (1,1)
    let probA: number;
    let probB: number;
    let exactMatrixNote: string;
    if (mode === "SINGLE_MATCH") {
      const engine = computeMatchEngine(m1);
      probA = basketProb(engine.dc.matrix, p1xOver25Cells());
      probB = basketProb(engine.dc.matrix, P1X_UNDER25_CELLS);
      exactMatrixNote = `احتمالات با جمع دقیق خانه‌های ماتریس دیکسون-کولز محاسبه شد — P(1X+Over)=${(probA * 100).toFixed(1)}٪ / P(1X+Under)=${(probB * 100).toFixed(1)}٪ (ضرب مستقل: ${(p1x * p2Over * 100).toFixed(1)}٪ / ${(p1x * p2Under * 100).toFixed(1)}٪)`;
    } else {
      probA = p1x * p2Over;
      probB = p1x * p2Under;
      exactMatrixNote = "دو بازی مستقل — ضرب احتمالات مجاز است";
    }

    // ─── شرط پایه مشترک (Banker): شانس مجدد میزبان 1X ───
    const oddsBanker = m1.odds1x;
    const baseSafe = p1x >= 0.72;

    // ─── ساخت دو تیپ مکمل ───
    // تیپ A: پایه (1X) × بالای ۲.۵ گل  → سناریوی بازی باز
    // تیپ B: پایه (1X) × زیر ۲.۵ گل   → سناریوی بازی بسته
    // (ضرایب سایت مستقل قیمت‌گذاری می‌شوند — همین‌جاست که لبه آماری ظاهر می‌شود)
    const oddsA = round2(oddsBanker * odds2Over);
    const oddsB = round2(oddsBanker * odds2Under);

    const legsA = [
      { match: bankerTeam, market: "شانس مجدد (1X)", selection: "HOME_OR_DRAW" as SelectionKind, odds: oddsBanker, prob: p1x },
      {
        match: mode === "TWO_MATCH" ? `${m2.homeTeam} - ${m2.awayTeam}` : bankerTeam,
        market: "بازار گل (۲.۵)",
        selection: "OVER_2_5" as SelectionKind,
        odds: odds2Over,
        prob: p2Over,
      },
    ];
    const legsB = [
      { match: bankerTeam, market: "شانس مجدد (1X)", selection: "HOME_OR_DRAW" as SelectionKind, odds: oddsBanker, prob: p1x },
      {
        match: mode === "TWO_MATCH" ? `${m2.homeTeam} - ${m2.awayTeam}` : bankerTeam,
        market: "بازار گل (۲.۵)",
        selection: "UNDER_2_5" as SelectionKind,
        odds: odds2Under,
        prob: p2Under,
      },
    ];

    // ─── داچینگ: تقسیم سرمایه ───
    const dutch = dutchAllocate(
      [
        { label: "تیپ A — بازی باز", odds: oddsA, prob: probA },
        { label: "تیپ B — بازی بسته", odds: oddsB, prob: probB },
      ],
      bankroll,
      strategy
    );

    // ─── بررسی تله باخت همزمان ───
    const trap = checkMiddleTrap(legsA, legsB);
    // پوشش ریاضی دقیق: در حالت تک‌بازی از ماتریس (احتمال باخت همزمان = خانه‌های انتخاب‌نشده)
    const bothLoseExact =
      mode === "SINGLE_MATCH"
        ? jointLossProb(computeMatchEngine(m1).dc.matrix, p1xOver25Cells(), P1X_UNDER25_CELLS)
        : null;
    const coverageProb = mode === "SINGLE_MATCH" && bothLoseExact !== null ? 1 - bothLoseExact : p1x;
    const coverageOk = coverageProb >= 0.72 && dutch.arbitrageFree;

    // ─── ذخیره تیپ‌ها ───
    const batchId = `batch-${Date.now()}`;
    const notes = baseSafe
      ? "شرط پایه امن (1X بالای ۷۲٪) — ریسک محدود به شکست پایه مشترک"
      : "هشدار: شرط پایه زیر آستانه امنیت ۷۲٪ — افزایش ریسک تله";

    const [tipA, tipB] = await Promise.all([
      db.tipSet.create({
        data: {
          label: "تیپ A — سناریوی بازی باز (1X + بالای ۲.۵)",
          strategy,
          mode,
          legs: JSON.stringify(legsA),
          totalOdds: oddsA,
          stake: dutch.stakes[0],
          potentialReturn: dutch.returns[0],
          guaranteedProfit: dutch.profits[0],
          coverageProb,
          coverageOk,
          trapRisk: trap.verdict,
          batchId,
          notes,
        },
      }),
      db.tipSet.create({
        data: {
          label: "تیپ B — سناریوی بازی بسته (1X + زیر ۲.۵)",
          strategy,
          mode,
          legs: JSON.stringify(legsB),
          totalOdds: oddsB,
          stake: dutch.stakes[1],
          potentialReturn: dutch.returns[1],
          guaranteedProfit: dutch.profits[1],
          coverageProb,
          coverageOk,
          trapRisk: trap.verdict,
          batchId,
          notes,
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      banker: {
        match: bankerTeam,
        selection: "HOME_OR_DRAW",
        marketName: "شانس مجدد میزبان (1X)",
        odds: oddsBanker,
        prob: p1x,
        baseSafe,
      },
      variable: {
        match: `${m2.homeTeam} - ${m2.awayTeam}`,
        over: { odds: odds2Over, prob: p2Over },
        under: { odds: odds2Under, prob: p2Under },
      },
      tips: [
        {
          id: tipA.id,
          label: "تیپ A — بازی باز",
          legs: legsA,
          totalOdds: oddsA,
          stake: dutch.stakes[0],
          potentialReturn: dutch.returns[0],
          profitIfWin: dutch.profits[0],
          prob: probA,
        },
        {
          id: tipB.id,
          label: "تیپ B — بازی بسته",
          legs: legsB,
          totalOdds: oddsB,
          stake: dutch.stakes[1],
          potentialReturn: dutch.returns[1],
          profitIfWin: dutch.profits[1],
          prob: probB,
        },
      ],
      dutching: {
        strategy,
        impliedSum: dutch.impliedSum,
        arbitrageFree: dutch.arbitrageFree,
        guaranteedMargin: dutch.guaranteedMargin,
        bothLoseProb: 1 - coverageProb,
        expectedValue: dutch.expectedValue,
      },
      exactMatrixNote,
      trap,
      batchId,
    });
  } catch (error) {
    console.error("POST /api/agent/risk error:", error);
    return NextResponse.json({ success: false, error: "خطا در اجرای ایجنت مدیریت ریسک" }, { status: 500 });
  }
}

function round2(x: number) {
  return Math.round(x * 100) / 100;
}
