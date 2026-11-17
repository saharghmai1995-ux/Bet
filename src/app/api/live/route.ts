import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeeded } from "@/lib/seed";
import {
  inPlayAnalysis,
  minute65Shield,
  type LiveEvent,
  type PreSelection,
  type TipMarketKind,
} from "@/lib/engine/livehedge";
import type { LiveHedgeDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

const VALID_EVENTS: LiveEvent[] = ["GOAL_HOME", "GOAL_AWAY", "RED_HOME", "RED_AWAY", "NONE"];

const SIDES = new Set(["HOME", "AWAY"]);

/** اعتبارسنجی و پارس بازار تیپ از بدنه درخواست (سپر دقیقه ۶۵ — v19.0-restore) */
function parseTip(raw: unknown): TipMarketKind | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const side = (v: unknown) => (typeof v === "string" && SIDES.has(v) ? (v as "HOME" | "AWAY") : null);
  const num = (v: unknown, fallback: number) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
  switch (r.kind) {
    case "OVER_TEAM": {
      const team = side(r.team);
      return team ? { kind: "OVER_TEAM", team, line: num(r.line, 1.5) } : null;
    }
    case "TOTAL_OVER":
      return { kind: "TOTAL_OVER", line: num(r.line, 2.5) };
    case "TOTAL_UNDER":
      return { kind: "TOTAL_UNDER", line: num(r.line, 2.5) };
    case "RESULT": {
      const s = side(r.side);
      return s ? { kind: "RESULT", side: s } : null;
    }
    case "BTTS":
      return { kind: "BTTS", yes: r.yes !== false };
    case "WIN_NIL": {
      const team = side(r.team);
      return team ? { kind: "WIN_NIL", team } : null;
    }
    default:
      return null;
  }
}

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

    // v19.0-restore — ورودی سپر استاپ‌لاس دقیقه ۶۵ (زوج‌تیپ A/B اختیاری):
    // اگر تیپ‌ها ارسال شوند، وضعیت تله میانی و سقف زیان −۴۵.۰u محاسبه می‌شود.
    const tipA = parseTip(body.tipA);
    const tipB = parseTip(body.tipB);
    const shieldStakeA = Math.max(1, Number(body.stakeA) || 65);
    const shieldStakeB = Math.max(1, Number(body.stakeB) || 35);

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

    // ═══ v19.0-restore — سپر استاپ‌لاس زنده دقیقه ۶۵ ═══
    // تیپ A و تیپ B واقعی (الگوهای طلایی G1/G2/G3) ارسال شده باشند → سپر فعال است:
    // در تله میانی از دقیقه ۶۵ زیان روی −۴۵.۰u سقف‌دار می‌شود (بازگشت تضمینی ۵۵u).
    const scoreH = scoreHome ?? (event === "GOAL_HOME" ? 1 : 0);
    const scoreA = scoreAway ?? (event === "GOAL_AWAY" ? 1 : 0);
    const shield =
      tipA && tipB
        ? minute65Shield({
            minute,
            scoreHome: scoreH,
            scoreAway: scoreA,
            lambdaHome: baseHome,
            lambdaAway: baseAway,
            tipA,
            tipB,
            oddsA: preOdds,
            oddsB: Math.max(1.01, Number(body.oddsB) || 3.1),
            stakeA: shieldStakeA,
            stakeB: shieldStakeB,
          })
        : null;

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
      // v19.0-restore — سپر دقیقه ۶۵ (وقتی زوج‌تیپ ارسال شده باشد)
      minute65Shield: shield,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/live error:", error);
    return NextResponse.json({ success: false, error: "خطا در سیگنال زنده" }, { status: 500 });
  }
}
