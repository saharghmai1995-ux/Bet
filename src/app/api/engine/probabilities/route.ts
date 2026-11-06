import { NextRequest, NextResponse } from "next/server";
import { runDixonColes, type DixonColesInput } from "@/lib/engine/poisson";

export const dynamic = "force-dynamic";

/**
 * POST /api/engine/probabilities
 * موتور کمّی دیکسون-کولز: خروجی ماتریس نمره و احتمالات بازارها
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const input: DixonColesInput = {
      homeAttack: clampNum(body.homeAttack, 0.3, 2.5, 1.4),
      awayAttack: clampNum(body.awayAttack, 0.3, 2.5, 1.1),
      homeDefense: clampNum(body.homeDefense, 0.4, 2, 0.9),
      awayDefense: clampNum(body.awayDefense, 0.4, 2, 1.0),
      leagueAvg: clampNum(body.leagueAvg, 0.8, 2.5, 1.35),
      homeAdvantage: clampNum(body.homeAdvantage, 1, 1.4, 1.12),
      rho: clampNum(body.rho, -0.2, 0.2, -0.08),
      eloDiff: clampNum(body.eloDiff, -600, 600, 0),
      eloWeight: clampNum(body.eloWeight, 0, 1, 0.35),
      homeAbsenceImpact: clampNum(body.homeAbsenceImpact, 0, 0.6, 0),
      awayAbsenceImpact: clampNum(body.awayAbsenceImpact, 0, 0.6, 0),
      timeDecayXi: clampNum(body.timeDecayXi, 0, 0.02, 0.0065),
      daysAgo: clampNum(body.daysAgo, 7, 400, 90),
    };

    const result = runDixonColes(input);

    // ضرایب عادلانه (بدون حاشیه)
    const fair = {
      home: 1 / result.pHome,
      draw: 1 / result.pDraw,
      away: 1 / result.pAway,
      over25: 1 / result.pOver25,
      under25: 1 / result.pUnder25,
      bttsYes: 1 / result.pBtts,
    };

    return NextResponse.json({ success: true, input, result, fairOdds: fair });
  } catch (error) {
    console.error("POST /api/engine/probabilities error:", error);
    return NextResponse.json({ success: false, error: "خطا در اجرای موتور" }, { status: 500 });
  }
}

function clampNum(v: unknown, min: number, max: number, dflt: number): number {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  if (Number.isNaN(n)) return dflt;
  return Math.min(max, Math.max(min, n));
}
