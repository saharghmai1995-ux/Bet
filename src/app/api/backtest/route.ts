import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runBacktest, type BacktestConfig, type StakingStrategy } from "@/lib/engine/backtest";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * GET /api/backtest — آخرین اجراهای بک‌تست
 */
export async function GET() {
  try {
    const runs = await db.backtestRun.findMany({ orderBy: { createdAt: "desc" }, take: 5 });
    return NextResponse.json({
      success: true,
      runs: runs.map((r) => ({
        ...r,
        equityCurve: JSON.parse(r.equityCurve),
        config: JSON.parse(r.config),
      })),
    });
  } catch (error) {
    console.error("GET /api/backtest error:", error);
    return NextResponse.json({ success: false, error: "خطا در دریافت نتایج" }, { status: 500 });
  }
}

/**
 * POST /api/backtest — اجرای بک‌تست روی داده‌های تاریخی (۳ استراتژی همزمان)
 * body: { totalMatches?, minEdge?, stakePercent?, seed?, strategy? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const strategy: StakingStrategy = ["FIXED", "KELLY25", "DUTCH2"].includes(body.strategy)
      ? body.strategy
      : "FIXED";

    const config: BacktestConfig = {
      totalMatches: Math.min(3000, Math.max(100, Number(body.totalMatches) || 500)),
      minEdge: Math.min(0.3, Math.max(0, Number(body.minEdge ?? 0.03))),
      bankroll: Math.max(10, Number(body.bankroll) || 1000),
      stakePercent: Math.min(10, Math.max(0.1, Number(body.stakePercent) || 2)),
      seed: Number.isFinite(Number(body.seed)) && Number(body.seed) > 0 ? Number(body.seed) : Math.floor(Math.random() * 2 ** 31),
      strategy,
    };

    const result = runBacktest(config);

    // فقط هر N-امین نقطه برای نمودار (کاهش حجم)
    const sampledCurve = result.bets.filter((_, i) => i % Math.max(1, Math.floor(result.bets.length / 120)) === 0);

    const saved = await db.backtestRun.create({
      data: {
        totalBets: result.totalBets,
        wins: result.wins,
        roi: result.roi,
        strikeRate: result.strikeRate,
        avgClv: result.avgClv,
        positiveClvRate: result.positiveClvRate,
        maxDrawdown: result.maxDrawdown,
        finalEquity: result.finalEquity,
        equityCurve: JSON.stringify(
          sampledCurve.map((b) => ({ i: b.i, equity: b.equity, clv: b.clv, won: b.won }))
        ),
        config: JSON.stringify(config),
      },
    });

    return NextResponse.json({
      success: true,
      runId: saved.id,
      result: {
        ...result,
        bets: result.bets.slice(-60),
      },
    });
  } catch (error) {
    console.error("POST /api/backtest error:", error);
    return NextResponse.json({ success: false, error: "خطا در اجرای بک‌تست" }, { status: 500 });
  }
}
