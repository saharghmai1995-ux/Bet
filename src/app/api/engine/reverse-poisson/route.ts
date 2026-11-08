import { NextRequest, NextResponse } from "next/server";
import { solveMarketImpliedLambdas, hybridLambda } from "@/lib/engine/reverse-poisson";

export const dynamic = "force-dynamic";

/**
 * POST /api/engine/reverse-poisson
 * موتور مهندسی معکوس ضرایب بوک‌میکر (v9.0):
 *   ۱) Shin De-Vig → احتمالات خالص بازار
 *   ۲) Grid Search (0.30..3.50 گام 0.05) → λ_Market با کمترین خطای مربعات
 *   ۳) فرمول ترکیبی طلایی: λ_Final = (0.65 × λ_Market + 0.35 × λ_Stats) × C_Calibration
 * بدنه: { oddsHome, oddsDraw, oddsAway, oddsOver25?, oddsUnder25?, statsHome?, statsAway?, calibrationHome?, calibrationAway? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const num = (v: unknown, dflt: number): number => {
      const n = typeof v === "number" ? v : parseFloat(String(v));
      return Number.isFinite(n) ? n : dflt;
    };

    const market = solveMarketImpliedLambdas({
      oddsHome: num(body.oddsHome, 0),
      oddsDraw: num(body.oddsDraw, 0),
      oddsAway: num(body.oddsAway, 0),
      oddsOver25: body.oddsOver25 != null ? num(body.oddsOver25, 0) : null,
      oddsUnder25: body.oddsUnder25 != null ? num(body.oddsUnder25, 0) : null,
    });

    if (!market) {
      return NextResponse.json({ success: false, error: "ضرایب نامعتبر است (1X2 با ضرایب ≥ 1.01 الزامی است)" }, { status: 400 });
    }

    const statsHome = num(body.statsHome, 1.35);
    const statsAway = num(body.statsAway, 1.25);
    const hybrid = hybridLambda({
      statsHome,
      statsAway,
      market: { lambdaHome: market.lambdaHome, lambdaAway: market.lambdaAway, fitError: market.fitError },
      calibrationHome: body.calibrationHome != null ? num(body.calibrationHome, 1) : undefined,
      calibrationAway: body.calibrationAway != null ? num(body.calibrationAway, 1) : undefined,
    });

    return NextResponse.json({ success: true, market, hybrid });
  } catch (error) {
    console.error("POST /api/engine/reverse-poisson error:", error);
    return NextResponse.json({ success: false, error: "خطا در حل معکوس پواسون" }, { status: 500 });
  }
}
