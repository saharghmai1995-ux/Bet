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
 * GET /api/settlement/categories
 * عملکرد هر دسته فلش‌کارت روی کارنامه واقعی + دفتر سایه:
 *   APPROVED — کارت‌های تایید سوپروایزر (پول واقعی، تلگرام)
 *   VETOED   — کارت‌های سایه (تسویه کاغذی — پاسخ مستقیم به «وتوها چه نتیجه‌ای گرفتند؟»)
 *   PROFIT15 — کارت‌های با سود تضمینی بالای ۱۵٪
 *   RISK10   — کارت‌های با ریسک باخت همزمان زیر ۱۰٪
 *   DOUBLE   — کارت‌های دارای فرصت Double-Win (احتمال برد همزمان > ۲٪) + بردهای واقعی
 *
 * دسته‌ها متقابلاً منحصربه‌فرد نیستند — یک کارت می‌تواند هم‌زمان PROFIT15 و RISK10 باشد.
 */
export async function GET() {
  try {
    const slips = await db.issuedSlip.findMany({
      select: {
        status: true,
        supervisorApproved: true,
        netProfit: true,
        marginPct: true,
        guaranteedProfit: true,
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
      let marginSum = 0;
      let marginN = 0;
      let riskSum = 0;
      let riskN = 0;
      let dwSum = 0;
      let dwN = 0;
      for (const s of rows) {
        c.total += 1;
        if (typeof s.marginPct === "number") {
          marginSum += s.marginPct;
          marginN += 1;
        }
        if (typeof s.jointLossRiskPct === "number") {
          riskSum += s.jointLossRiskPct;
          riskN += 1;
        }
        if (typeof s.doubleWinProbPct === "number") {
          dwSum += s.doubleWinProbPct;
          dwN += 1;
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
      c.avgGuaranteedProfitPct = marginN > 0 ? r1(marginSum / marginN) : null;
      c.avgJointLossRiskPct = riskN > 0 ? r1(riskSum / riskN) : null;
      c.avgDoubleWinProbPct = dwN > 0 ? r1(dwSum / dwN) : null;
      return c;
    };

    // ─── تفکیک پایه: واقعی در برابر سایه ───
    const approved = slips.filter((s) => s.supervisorApproved);
    const vetoed = slips.filter((s) => !s.supervisorApproved);

    const categories: CategoryPerformanceDTO[] = [
      agg(approved, "APPROVED", "تاییدشده سوپروایزر", "کارت‌های دارای مهر 👑 — پول واقعی و اعلام تلگرام", false),
      agg(
        vetoed,
        "VETOED",
        "وتوشده (دفتر سایه)",
        "کارت‌های وتو شده — تسویه کاغذی counterfactual؛ پاسخ «اگر شرط می‌بستیم چه می‌شد؟»",
        true
      ),
      agg(
        slips.filter((s) => (s.marginPct ?? 0) > 15),
        "PROFIT15",
        "سود تضمینی بالای ۱۵٪",
        "کارت‌هایی که حاشیه داچینگ تضمینی‌شان بالای ۱۵٪ بود (واقعی + سایه)",
        false
      ),
      agg(
        slips.filter((s) => (s.jointLossRiskPct ?? 100) < 10),
        "RISK10",
        "ریسک باخت همزمان زیر ۱۰٪",
        "کارت‌هایی که ریسک باخت همزمان مونت‌کارلوی‌شان زیر ۱۰٪ بود",
        false
      ),
      agg(
        slips.filter((s) => (s.doubleWinProbPct ?? 0) > 2),
        "DOUBLE",
        "فرصت‌های Double-Win",
        "کارت‌هایی با احتمال برد طلایی همزمان بالای ۲٪ — بردهای واقعی DOUBLE_WIN شمرده می‌شوند",
        false
      ),
    ];

    const body: CategoryPerformanceResponseDTO = {
      success: true,
      categories,
      shadowLedger: {
        approvedSlips: approved.length,
        shadowSlips: vetoed.length,
        note: "از v11.0 وتوها دور ریخته نمی‌شوند؛ با همان موتور ESPN تسویه کاغذی می‌شوند تا وین‌ریت کارنامه بدون سوگیری بازماندگی قابل ارزیابی باشد.",
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
