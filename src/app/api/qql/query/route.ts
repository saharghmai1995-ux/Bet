import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeeded } from "@/lib/seed";
import { computeMatchEngine } from "@/lib/engine/matchEngine";
import { runQuantumAnnealingSolver } from "@/lib/engine/quantum-solver";
import {
  buildTelemetryWarehouse,
  qqlTopPerformingPairs,
  qqlRcaAudit,
  qqlCounterfactualRoi,
  runQqlPipeline,
  type TelemetrySlipInput,
  type QqlTelemetryRow,
  type QqlConsoleResult,
} from "@/lib/engine/qql-rca-engine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** آنتروپی شانون ماتریس نمره (نرمال‌شده درون ماتریس) */
function entropyOfMatrix(matrix: number[][]): number {
  let sum = 0;
  for (const row of matrix) for (const v of row) sum += v;
  let H = 0;
  for (const row of matrix) for (const v of row) {
    const p = sum > 0 ? v / sum : 0;
    if (p > 1e-12) H -= p * Math.log(p);
  }
  return H;
}

/**
 * POST /api/qql/query
 * 💻 کنسول تعاملی زبان پرس‌وجوی علوم داده (Interactive Quant SQL / QQL & AI RCA Lab) — v24.0
 * چهار کوئری آماده ۱ کلیکی + اجرای خط لوله QQL کامل روی بازی‌های امروز.
 */
export async function POST(req: NextRequest) {
  try {
    await ensureSeeded();
    const body = (await req.json()) as { preset?: string };
    const preset = body.preset ?? "Q1";

    // انبار تله‌متری — فقط کارت‌های تسویه‌شده واقعی ESPN (صفر عدد جعلی)
    const settledSlips = await db.issuedSlip.findMany({
      where: { status: { in: ["WON_A", "WON_B", "DOUBLE_WIN", "MIDDLE_TRAP"] } },
      select: { id: true, league: true, legsA: true, legsB: true, lambdaHome: true, lambdaAway: true, status: true, netProfit: true, settledAt: true },
      orderBy: { settledAt: "desc" },
      take: 400,
    });
    const telemetry: QqlTelemetryRow[] = buildTelemetryWarehouse(settledSlips as TelemetrySlipInput[]);

    // Query 3 — بازی‌های امروز با ضریب همپوشانی موثر ≥ 1.20 (خط لوله QQL کامل روی هر بازی)
    if (preset === "Q3") {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(startOfDay.getTime() + 86_400_000);
      const todayMatches = await db.match.findMany({
        where: { kickoff: { gte: startOfDay, lt: endOfDay }, status: { in: ["UPCOMING", "ANALYZED", "LIVE"] } },
        orderBy: { kickoff: "asc" },
        take: 40,
      });
      const rows: (string | number | null)[][] = [];
      for (const m of todayMatches) {
        try {
          const eng = computeMatchEngine(m as never);
          const solver = runQuantumAnnealingSolver({
            lambdaHome: eng.dc.lambdaHome,
            lambdaAway: eng.dc.lambdaAway,
            matrix: eng.dc.matrix,
            lambdaCorners: eng.lambdaCorners,
            lambdaCards: eng.lambdaCards,
          });
          if (!solver.best) continue;
          const c = solver.best;
          if (c.effOdds < 1.2) continue;
          const risk = Math.max(0.01, 1 - c.unionProb);
          const sharpe = c.utility / 100 / risk;
          const qql = runQqlPipeline({
            lambdaHome: eng.dc.lambdaHome,
            lambdaAway: eng.dc.lambdaAway,
            entropy: entropyOfMatrix(eng.dc.matrix),
            candidates: solver.candidates.map((cc) => ({
              pairCode: cc.pairCode,
              keyA: cc.keyA,
              keyB: cc.keyB,
              oddsA: cc.oddsA,
              oddsB: cc.oddsB,
              unionProb: cc.unionProb,
              doubleWinProb: cc.overlapProb,
              jointLossProb: 1 - cc.unionProb,
            })),
            telemetry,
          });
          rows.push([
            `${m.homeTeam} - ${m.awayTeam}`,
            m.league,
            c.pairCode,
            c.effOdds.toFixed(2),
            `${(c.unionProb * 100).toFixed(1)}٪`,
            sharpe.toFixed(2),
            qql.firedRules.length > 0 ? qql.firedRules.map((r) => r.id).join("+") : "—",
          ]);
        } catch {
          // بازی با داده ناقص — رد می‌شود
        }
      }
      rows.sort((a, b) => Number(b[5]) - Number(a[5]));
      const result: QqlConsoleResult = {
        queryId: "Q3",
        title: "SELECT today_matches WHERE effective_overlap_odds >= 1.20 ORDER BY sharpe DESC — فیلتر بازی‌های امروز با سود همپوشانی بالای ۲۰٪",
        columns: ["match", "league", "best_pair", "eff_odds", "matrix_union", "sharpe", "rca_flags"],
        rows,
        note: `${rows.length} بازی امروز آستانه ضریب همپوشانی ۱.۲۰ را پاس کردند (از ${todayMatches.length} بازی اسکن‌شده)`,
      };
      return NextResponse.json({ success: true, telemetrySize: telemetry.length, result });
    }

    // کوئری‌های آماده روی انبار تله‌متری
    let result: QqlConsoleResult;
    switch (preset) {
      case "Q2":
        result = qqlRcaAudit(telemetry);
        break;
      case "Q4":
        result = qqlCounterfactualRoi(telemetry);
        break;
      case "Q1":
      default:
        result = qqlTopPerformingPairs(telemetry);
        break;
    }
    return NextResponse.json({ success: true, telemetrySize: telemetry.length, result });
  } catch (error) {
    console.error("POST /api/qql/query error:", error);
    return NextResponse.json({ success: false, error: "خطا در اجرای کوئری QQL" }, { status: 500 });
  }
}
