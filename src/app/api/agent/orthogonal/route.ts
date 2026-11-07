import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeeded } from "@/lib/seed";
import { computeMatchEngine } from "@/lib/engine/matchEngine";
import { generateOrthogonalComplementarySlips, buildOrthoPortfolioPair, MARKET_LABELS, type OrthoContext } from "@/lib/engine/orthogonal";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** بهترین قیمت واقعی هر پایه بین بوک‌میکرها (برای خط به‌جای سینتتیک) */
function realPrices(odds: { bookmaker: string; oddsHome: number; oddsDraw: number; oddsAway: number; oddsOver25: number; oddsUnder25: number; oddsCornersOver95: number; oddsCornersUnder95: number }[]): OrthoContext["prices"] {
  const best: NonNullable<OrthoContext["prices"]> = {};
  const consider = (key: string, v: number) => {
    if (v > 1.01 && (!best[key] || v > best[key]!)) best[key] = Math.round(v * 100) / 100;
  };
  for (const o of odds) {
    consider("HOME", o.oddsHome);
    consider("DRAW", o.oddsDraw);
    consider("AWAY", o.oddsAway);
    consider("DC_1X", 1 / (1 / o.oddsHome + 1 / o.oddsDraw));
    consider("DC_X2", 1 / (1 / o.oddsAway + 1 / o.oddsDraw));
    consider("O25", o.oddsOver25);
    consider("U25", o.oddsUnder25);
    consider("C_O95", o.oddsCornersOver95);
    consider("C_U95", o.oddsCornersUnder95);
  }
  return best;
}

/**
 * POST /api/agent/orthogonal { matchId }
 * v5.0 — موتور زوج‌های متعامد: ۵ الگوی مکمل از ۱۵ بازار برای یک بازی.
 * خروجی برای «سوییچر الگو» روی فلش‌کارت استفاده می‌شود.
 */
export async function POST(req: NextRequest) {
  try {
    await ensureSeeded();
    const body = await req.json().catch(() => ({}));
    const matchId: string = body.matchId;
    const bankroll = Math.max(1, Number(body.bankroll) || 100);
    if (!matchId) {
      return NextResponse.json({ success: false, error: "matchId الزامی است" }, { status: 400 });
    }

    const match = await db.match.findUnique({ where: { id: matchId }, include: { referee: true } });
    if (!match) {
      return NextResponse.json({ success: false, error: "بازی یافت نشد" }, { status: 404 });
    }
    const odds = await db.oddsRecord.findMany({ where: { matchId: match.id } });
    const engine = computeMatchEngine(match);

    const ortho = generateOrthogonalComplementarySlips({
      lambdaHome: engine.dc.lambdaHome,
      lambdaAway: engine.dc.lambdaAway,
      matrix: engine.dc.matrix,
      lambdaCorners: engine.lambdaCorners,
      lambdaCards: engine.lambdaCards,
      prices: realPrices(odds),
    });

    const pairs = ortho.archetypes.map((a) => buildOrthoPortfolioPair(a, match, bankroll));

    return NextResponse.json({
      success: true,
      matchId: match.id,
      matchLabel: `${match.homeTeam} - ${match.awayTeam}`,
      recommended: ortho.recommended,
      marketFamilies: Object.keys(MARKET_LABELS).length,
      pairs,
      bankroll,
    });
  } catch (error) {
    console.error("POST /api/agent/orthogonal error:", error);
    return NextResponse.json({ success: false, error: "خطا در موتور زوج‌های متعامد" }, { status: 500 });
  }
}
