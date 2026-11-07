import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeeded } from "@/lib/seed";
import { inPlayAnalysis, type LiveEvent, type PreSelection } from "@/lib/engine/livehedge";
import type { LiveHedgeDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

const VALID_EVENTS: LiveEvent[] = ["GOAL_HOME", "GOAL_AWAY", "RED_HOME", "RED_AWAY", "NONE"];

/**
 * POST /api/live { matchId, minute, event, selection: HOME|AWAY|O25, odds, stake }
 * ایجنت رصدگر زنده: رویداد در حین بازی → بازمحاسبه احتمالات → سیگنال پوشش
 */
export async function POST(req: NextRequest) {
  try {
    await ensureSeeded();
    const body = await req.json();
    const matchId: string = body.matchId;
    const minute = Math.min(89, Math.max(1, Number(body.minute) || 25));
    const event: LiveEvent = VALID_EVENTS.includes(body.event) ? body.event : "GOAL_HOME";
    const selection: PreSelection = ["HOME", "AWAY", "O25"].includes(body.selection) ? body.selection : "HOME";
    const preOdds = Math.max(1.01, Number(body.odds) || 2.1);
    const preStake = Math.max(1, Number(body.stake) || 100);
    // v6.1 — نتیجه واقعی لحظه‌ای ESPN (اختیاری؛ سناریوی فرضی فقط برای تست دستی موتور)
    const scoreHome =
      body.scoreHome === undefined || body.scoreHome === null || body.scoreHome === ""
        ? undefined
        : Math.max(0, Math.floor(Number(body.scoreHome) || 0));
    const scoreAway =
      body.scoreAway === undefined || body.scoreAway === null || body.scoreAway === ""
        ? undefined
        : Math.max(0, Math.floor(Number(body.scoreAway) || 0));

    const match = await db.match.findUnique({ where: { id: matchId } });
    if (!match) {
      return NextResponse.json({ success: false, error: "بازی یافت نشد" }, { status: 404 });
    }

    // λ پایه پیش‌بازی (بدون تعدیل‌های T-60 — بازی در جریان است)
    const baseHome = match.homeAttack * match.awayDefense * 1.35 * 1.12;
    const baseAway = match.awayAttack * match.homeDefense * 1.35;

    const analysis = inPlayAnalysis({
      lambdaHome: baseHome,
      lambdaAway: baseAway,
      minute,
      event,
      preSelection: selection,
      preOdds,
      preStake,
      scoreHome,
      scoreAway,
    });

    const preLabel = selection === "HOME" ? "برد میزبان" : selection === "AWAY" ? "برد میهمان" : "بالای ۲.۵ گل";

    const result: LiveHedgeDTO = {
      success: true,
      minute,
      scenario: event,
      scenarioLabel: analysis.scenarioLabel,
      score: analysis.scoreLabel,
      remainingLambdas: analysis.remainingLambdas,
      updatedProbs: {
        home: analysis.probs.home,
        draw: analysis.probs.draw,
        away: analysis.probs.away,
      },
      fairLiveOdds: analysis.fairOdds,
      marketLiveOdds: analysis.marketOdds,
      preBet: { selection, label: preLabel, odds: preOdds, stake: preStake },
      hedge: analysis.hedge
        ? {
            targetOdds: analysis.hedge.targetOdds,
            targetLabel: analysis.hedge.targetLabel,
            stake: analysis.hedge.stake,
            profitIfPre: analysis.hedge.profitIfPre,
            profitIfHedge: analysis.hedge.profitIfHedge,
          }
        : null,
      holdEV: analysis.holdEV,
      recommendation: analysis.recommendation,
      message: analysis.message,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/live error:", error);
    return NextResponse.json({ success: false, error: "خطا در سیگنال زنده" }, { status: 500 });
  }
}
