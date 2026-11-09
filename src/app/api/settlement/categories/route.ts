import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { CategoryPerformanceDTO, CategoryPerformanceResponseDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

/** وضعیت‌های تسویه‌شده معتبر برای محاسبه وین‌ریت */
const SETTLED = ["WON_A", "WON_B", "DOUBLE_WIN", "MIDDLE_TRAP"];
const WIN_STATUSES = ["WON_A", "WON_B", "DOUBLE_WIN"];

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * GET /api/settlement/categories — v13.0
 * ═══ افراز ۱۰۰٪ مجزا (Disjoint Partitioning) — صفر دوباره‌شماری ═══
 * هر کارت صادرشده فقط و فقط در یکی از ۴ دسته زیر شمرده می‌شود:
 *   الف — LINE_A: تک‌بازی‌های تاییدشده سوپروایزر (productLine=SINGLE، پول واقعی)
 *   ب — LINE_B: میکس‌های ۲ و ۳ تایی هوشمند (productLine=COMBO، محاسبه مستقل)
 *   ج — LINE_C: شکارچی ضرایب بالا (productLine=SNIPER، محاسبه مستقل)
 *   د — LINE_D: وتوشده‌های دفتر سایه (supervisorApproved=false — تسویه کاغذی، ۰ اشتراک با الف)
 *
 * v12 قدیمی دسته‌های همپوشان (RISK10/PROFIT15/DOUBLE) داشت که یک کارت می‌توانست
 * هم‌زمان در چند دسته شمرده شود (+۳۵۱.۸ و +۳۱۶.۱ جمع‌پذیر نبودند) — حذف شد.
 */
export async function GET() {
  try {
    const slips = await db.issuedSlip.findMany({
      select: {
        status: true,
        supervisorApproved: true,
        productLine: true,
        netProfit: true,
        marginPct: true,
        jointLossRiskPct: true,
        doubleWinProbPct: true,
      },
    });

    const bucketOf = (): CategoryPerformanceDTO => ({
      key: "APPROVED",
      label: "",
      description: "",
      total: 0,
      settled: 0,
      pending: 0,
      wins: 0,
      losses: 0,
      winRate: null,
      netProfit: 0,
      paper: false,
      doubleWinHits: 0,
      avgGuaranteedProfitPct: null,
      avgJointLossRiskPct: null,
      avgDoubleWinProbPct: null,
    });

    const agg = (
      rows: typeof slips,
      key: CategoryPerformanceDTO["key"],
      label: string,
      description: string,
      paper: boolean
    ): CategoryPerformanceDTO => {
      const c = bucketOf();
      c.key = key;
      c.label = label;
      c.description = description;
      c.paper = paper;
      let riskSum = 0;
      let riskN = 0;
      for (const s of rows) {
        c.total += 1;
        if (typeof s.jointLossRiskPct === "number") {
          riskSum += s.jointLossRiskPct;
          riskN += 1;
        }
        if (!SETTLED.includes(s.status)) {
          c.pending += 1;
          continue;
        }
        c.settled += 1;
        c.netProfit += s.netProfit ?? 0;
        if (WIN_STATUSES.includes(s.status)) c.wins += 1;
        else c.losses += 1;
        if (s.status === "DOUBLE_WIN") c.doubleWinHits += 1;
      }
      c.winRate = c.settled > 0 ? r1((c.wins / c.settled) * 100) : null;
      c.netProfit = r2(c.netProfit);
      c.avgJointLossRiskPct = riskN > 0 ? r1(riskSum / riskN) : null;
      return c;
    };

    // ─── افراز مجزا بر اساس productLine + وضعیت تایید سوپروایزر ───
    const approved = slips.filter((s) => s.supervisorApproved);
    const partitionA = approved.filter((s) => (s.productLine ?? "SINGLE") === "SINGLE");
    const partitionB = approved.filter((s) => s.productLine === "COMBO");
    const partitionC = approved.filter((s) => s.productLine === "SNIPER");
    const partitionD = slips.filter((s) => !s.supervisorApproved);

    // کنترل افراز: مجموع ۴ دسته = کل کارت‌ها (هر کارت دقیقاً یک‌بار)
    const sumTotal = partitionA.length + partitionB.length + partitionC.length + partitionD.length;

    const categories: CategoryPerformanceDTO[] = [
      agg(
        partitionA,
        "APPROVED",
        "👑 دسته الف — تک‌بازی‌های تاییدشده سوپروایزر",
        "خط تولید ۱ (Single Dual-Hedge) — پول واقعی و اعلام تلگرام؛ بدون هیچ اشتراکی با دسته‌های دیگر",
        false
      ),
      agg(
        partitionB,
        "COMBO",
        "🔗 دسته ب — میکس‌های ۲ و ۳ تایی هوشمند",
        "خط تولید ۲ (Smart Combos) — محاسبه مستقل؛ با اولین صدور میکس‌ها پر می‌شود",
        false
      ),
      agg(
        partitionC,
        "SNIPER",
        "🎯 دسته ج — شکارچی ضرایب بالا",
        "خط تولید ۳ (High-Odds Sniper) — محاسبه مستقل؛ با اولین صدور شکارها پر می‌شود",
        false
      ),
      agg(
        partitionD,
        "VETOED",
        "🛡️ دسته د — وتوشده‌های دفتر سایه",
        "تسویه کاغذی counterfactual — ۰ اشتراک با تاییدشده‌ها؛ اثبات نجات سرمایه (والنسیا–رئال مادرید −۱۰۰ واحد)",
        true
      ),
    ];

    const body: CategoryPerformanceResponseDTO = {
      success: true,
      categories,
      shadowLedger: {
        approvedSlips: approved.length,
        shadowSlips: partitionD.length,
        note:
          sumTotal === slips.length
            ? "افراز مجزا v13.0 تأیید شد — مجموع ۴ دسته دقیقاً برابر کل کارت‌هاست؛ هیچ کارتی دوبار شمرده نمی‌شود."
            : `هشدار افراز: مجموع دسته‌ها (${sumTotal}) با کل کارت‌ها (${slips.length}) نمی‌خواند.`,
      },
      generatedAt: new Date().toISOString(),
    };
    return NextResponse.json(body);
  } catch (error) {
    console.error("GET /api/settlement/categories error:", error);
    return NextResponse.json(
      {
        success: false,
        categories: [],
        shadowLedger: { approvedSlips: 0, shadowSlips: 0, note: "خطا" },
        generatedAt: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
