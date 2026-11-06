import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeeded } from "@/lib/seed";
import {
  leagueCalibration,
  reliabilityBuckets,
  systemLessons,
  brierSkillScore,
  PINNACLE_BRIER,
} from "@/lib/engine/calibration";
import type { CalibrationDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/calibration — داشبورد امتیاز بریر + ضرایب اصلاحی خودکار هر لیگ
 */
export async function GET() {
  try {
    await ensureSeeded();
    const logs = await db.calibrationLog.findMany({ orderBy: { createdAt: "desc" } });

    const records = logs.map((l) => ({
      league: l.league,
      predictedProb: l.predictedProb,
      outcome: l.outcome as "WIN" | "LOSS",
      brier: l.brier,
    }));

    const count = records.length;
    const avgBrier = count ? records.reduce((s, r) => s + r.brier, 0) / count : 0;
    const hitRate = count ? records.filter((r) => r.outcome === "WIN").length / count : 0;
    const avgPredicted = count ? records.reduce((s, r) => s + r.predictedProb, 0) / count : 0;

    const leagues = leagueCalibration(records);
    const buckets = reliabilityBuckets(records);
    const lessons = systemLessons(records, leagues);

    const result: CalibrationDTO = {
      success: true,
      overall: {
        count,
        avgBrier,
        hitRate,
        avgPredicted,
        brierSkillVsRandom: 1 - avgBrier / 0.25,
        // فرمول استاندارد Brier Skill Score: BSS = (1 − Brier/0.25) × 100
        brierSkillScore: brierSkillScore(avgBrier),
        pinnacleBrier: PINNACLE_BRIER,
        vsPinnacleDelta: avgBrier - PINNACLE_BRIER,
      },
      byLeague: leagues,
      buckets,
      logs: logs.map((l) => ({
        id: l.id,
        matchLabel: l.matchLabel,
        league: l.league,
        pick: l.pick,
        predictedProb: l.predictedProb,
        outcome: l.outcome,
        brier: l.brier,
        lesson: l.lesson,
      })),
      lessons,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/calibration error:", error);
    return NextResponse.json({ success: false, error: "خطا در داشبورد کالیبراسیون" }, { status: 500 });
  }
}
