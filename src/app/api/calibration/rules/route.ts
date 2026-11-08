import { NextResponse } from "next/server";
import { getActiveRules } from "@/lib/server/calibration-rules";

export const dynamic = "force-dynamic";

/**
 * GET /api/calibration/rules
 * بردار قانون فعال کالیبراسیون هر لیگ (Active Rule Vector — v9.0):
 * انحراف گلزنی لیگ + نرخ موفقیت الگوها → ضریب عددی λ و پاداش/جریمه
 * UtilityScore ایجنت سوپروایزر. نشان «⚡ اعمال‌شده در فرمول سوپروایزر».
 */
export async function GET() {
  try {
    const rules = await getActiveRules();
    const list = [...rules.values()].map((r) => ({
      league: r.league,
      sample: r.sample,
      goalBiasPct: r.goalBiasPct,
      lambdaMultiplier: r.lambdaMultiplier,
      archetypeBoosts: r.archetypeBoosts,
      archetypeHitRate: r.archetypeHitRate,
      rules: r.rules,
      applied: r.applied,
    }));
    return NextResponse.json({ success: true, rules: list, count: list.length });
  } catch (error) {
    console.error("GET /api/calibration/rules error:", error);
    return NextResponse.json({ success: false, rules: [], count: 0, error: "خطا در استخراج بردار قوانین" }, { status: 500 });
  }
}
