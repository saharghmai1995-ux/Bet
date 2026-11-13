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
 * GET /api/settlement/categories — v13.4
 * ═══ افراز ۱۰۰٪ مجزا (Disjoint Partitioning) — صفر دوباره‌شماری ═══
 * هر کارت صادرشده فقط و فقط در یکی از ۴ دسته زیر شمرده می‌شود:
 *   الف — LINE_A: تک‌بازی‌های تاییدشده سوپروایزر (productLine=SINGLE، پول واقعی)
 *   ب — LINE_B: میکس‌های ۲ و ۳ تایی هوشمند (productLine=COMBO، محاسبه مستقل)
 *   ج — LINE_C: شکارچی ضرایب بالا (productLine=SNIPER، محاسبه مستقل)
 *   د — LINE_D: وتوشده‌های دفتر سایه (supervisorApproved=false — تسویه کاغذی، ۰ اشتراک با الف)
 *
 * v12 قدیمی دسته‌های همپوشان (RISK10/PROFIT15/DOUBLE) داشت که یک کارت می‌توانست
 * هم‌زمان در چند دسته شمرده شود (+۳۵۱.۸ و +۳۱۶.۱ جمع‌پذیر نبودند) — حذف شد.
 *
 * v13.4 — «پوشش کامل عملکرد هر دسته فلش‌کارت» (filterPerformance):
 *   ۶ فیلتر واقعی دک فلش‌کارت (APPROVED/RISK10/BOOSTER/PROFIT15/FORTRESS/VETOED) با آمار کامل
 *   (کل/تسویه/در انتظار/برد/باخت/وین‌ریت/سود خالص/دوبل‌وین/میانگین ریسک/میانگین حاشیه/میانگین برد طلایی).
 *   برخلاف `categories` این دسته‌ها همپوشان‌اند (مثل خود فیلترهای دک) و کارت‌های بازخوانی
 *   (retroIssued=true — هرگز پیش از بازی صادر و منتشر نشده‌اند) از عملکرد واقعی حذف می‌شوند.
 */
export async function GET() {
  try {
    const slips = await db.issuedSlip.findMany({
      select: {
        status: true,
        supervisorApproved: true,
        retroIssued: true, // v13.4 — کارت‌های بازخوانی از عملکرد واقعی فیلترها حذف می‌شوند
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

    // ─── v13.4 — تجمیع کامل برای فیلترهای دک فلش‌کارت (همپوشان؛ شامل میانگین حاشیه و برد طلایی) ───
    const aggFilter = (
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
      let dwpSum = 0;
      let dwpN = 0;
      for (const s of rows) {
        c.total += 1;
        // سنجه‌های لحظه صدور روی «همه» کارت‌های دسته میانگین می‌شوند (مستقل از تسویه)
        if (typeof s.marginPct === "number") {
          marginSum += s.marginPct;
          marginN += 1;
        }
        if (typeof s.jointLossRiskPct === "number") {
          riskSum += s.jointLossRiskPct;
          riskN += 1;
        }
        if (typeof s.doubleWinProbPct === "number") {
          dwpSum += s.doubleWinProbPct;
          dwpN += 1;
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
      c.avgDoubleWinProbPct = dwpN > 0 ? r1(dwpSum / dwpN) : null;
      return c;
    };

    // ─── افراز مجزا بر اساس productLine + وضعیت تایید سوپروایزر + پرچم بازخوانی v13.2 ───
    // کارت‌های بازخوانی (retroIssued — بازی FT پیش از صدور) دیگر هرگز در دسته الف شمرده
    // نمی‌شوند؛ ریشه باگ «۳ تله میانی بدون صدور و تایید قبلی» حذف شد.
    // v13.5.1 — بازخوانی فقط با پرچم retroIssued شناسایی می‌شود (مستقل از تایید)؛ کارت
    // بازخوانی هرگز «تاییدشده» نیست و دفتر سایه (وتوی زنده) هم نیست — دسته مستقل ه.
    // ═══ v17.0 — افراز ۵ روش Bet-Type: SINGLE (زوج‌تیپ) / COMBO / BANKER / CS_CLUSTER / SNIPER ═══
    const retro = slips.filter((s) => s.retroIssued);
    const live = slips.filter((s) => s.supervisorApproved && !s.retroIssued);
    const partitionHedge = live.filter((s) => (s.productLine ?? "SINGLE") === "SINGLE");
    const partitionCombo = live.filter((s) => s.productLine === "COMBO");
    const partitionBanker = live.filter((s) => s.productLine === "BANKER");
    const partitionCs = live.filter((s) => s.productLine === "CS_CLUSTER");
    const partitionSniper = live.filter((s) => s.productLine === "SNIPER");
    const partitionD = slips.filter((s) => !s.supervisorApproved && !s.retroIssued);

    // کنترل افراز: مجموع دسته‌ها = کل کارت‌ها (هر کارت دقیقاً یک‌بار)
    const sumTotal =
      partitionHedge.length + partitionCombo.length + partitionBanker.length + partitionCs.length + partitionSniper.length + partitionD.length + retro.length;

    const categories: CategoryPerformanceDTO[] = [
      agg(
        partitionHedge,
        "APPROVED",
        "⚖️ زوج‌تیپ‌های دوقلو (Dual-Hedge)",
        "خط تولید ۱ (Dual-Hedge Orthogonal Pair) — زوج‌های متعامد تک‌دکمه‌ای با برد طلایی همزمان؛ پول واقعی و اعلام تلگرام",
        false
      ),
      agg(
        partitionCombo,
        "COMBO",
        "🧩 کمبوهای رسمی (Official Combos)",
        "خط تولید ۲ (Official Single-Button Combos: 1X&U3.5 / 1&O1.5 / BTTS&O2.5) — مارکت ترکیبی رسمی بوک‌میکر با پوشش مکمل",
        false
      ),
      agg(
        partitionBanker,
        "BANKER",
        "🏦 بنکرهای امن (Single Bankers)",
        "خط تولید ۳ (Safe Bankers) — تک‌ستون امن با اطمینان بالا (DNB/1/DC، احتمال ماتریس ≥ ۸۲٪) و استیک مستقیم ۶۰ واحدی",
        false
      ),
      agg(
        partitionCs,
        "CS_CLUSTER",
        "🎯 خوشه نتیجه دقیق (Correct Score Cluster)",
        "خط تولید ۴ (3/4-Score Correct Score Dutching) — داچینگ خوشه‌ای نمرات دقیق با آنتروپی پایین ماتریس",
        false
      ),
      agg(
        partitionSniper,
        "SNIPER",
        "🎯 شکارچی ضرایب بالا (Legacy Sniper)",
        "خط تولید قدیمی ۳ (High-Odds Sniper) — فقط کارت‌های تاریخی نسخه‌های پیشین",
        false
      ),
      agg(
        partitionD,
        "VETOED",
        "🛡️ وتوشده‌های دفتر سایه",
        "تسویه کاغذی counterfactual — ۰ اشتراک با تاییدشده‌ها؛ اثبات نجات سرمایه",
        true
      ),
      agg(
        retro,
        "RETRO",
        "📚 کارت‌های بازخوانی (تحلیل کاغذی)",
        "بازی‌های FT که هرگز پیش از بازی کارت صادر و تایید نشده بود — فقط برای یادگیری دکترین؛ هرگز در وین‌ریت واقعی شمرده نمی‌شوند",
        true
      ),
    ];

    // ─── v17.0 — سطر تجمیعی (Aggregate) — عملکرد کل خطوط تولید بدون سایه/بازخوانی ───
    const aggregateRow = agg(
      [...partitionHedge, ...partitionCombo, ...partitionBanker, ...partitionCs, ...partitionSniper],
      "TOTAL",
      "📊 تجمیعی ۵ خط تولید (Aggregate)",
      "جمع عملکرد تمام Bet-Typeهای واقعی (زوج‌تیپ + کمبو + بنکر + خوشه + شکارچی) — بدون دفتر سایه و بازخوانی",
      false
    );
    categories.push(aggregateRow);

    // ─── v13.4 — معادل دفتری ۶ فیلتر دک فلش‌کارت (مستقیماً از ستون‌های دفتر صدور) ───
    // APPROVED: تاییدشدهٔ زنده — کارت‌های بازخوانی (retroIssued) هرگز پیش از بازی صادر نشده‌اند و حذف می‌شوند
    const liveApproved = slips.filter((s) => s.supervisorApproved && !s.retroIssued);
    // RISK10: ریسک باخت همزمان زیر ۱۰٪ (jointStates.bothLose×۱۰۰ < ۱۰ در لحظه صدور)
    const risk10Base = liveApproved.filter((s) => typeof s.jointLossRiskPct === "number" && s.jointLossRiskPct < 10);
    // BOOSTER: روی همان ست کم‌ریسک، سود اصلاحی شتاب‌دهنده بالای ۲۵٪ (≈ حاشیه داچینگ روی دوبل‌ها)
    const boosterRows = risk10Base.filter((s) => s.marginPct > 25);
    // PROFIT15: حاشیه سود تضمینی بالای ۱۵٪
    const profit15Rows = liveApproved.filter((s) => s.marginPct > 15);
    // FORTRESS: دژ نفوذناپذیر — ریسک باخت همزمان زیر ۷٪
    const fortressRows = liveApproved.filter((s) => typeof s.jointLossRiskPct === "number" && s.jointLossRiskPct < 7);

    const filterPerformance: CategoryPerformanceDTO[] = [
      aggFilter(
        liveApproved,
        "APPROVED",
        "👑 تاییدشده سوپروایزر — همه کارت‌های زنده صادرشده",
        "هر کارتی که سوپروایزر پیش از کیک‌آف تایید و به کانال اعلام کرده است — معیار اصلی عملکرد پول واقعی شما (کارت‌های بازخوانی retro مستثنا هستند).",
        false
      ),
      aggFilter(
        risk10Base,
        "RISK10",
        "🛡️ ریسک باخت همزمان زیر ۱۰٪",
        "کارت‌هایی که در بدترین حالت احتمال باخت همزمان هر دو تیپ زیر ۱۰٪ است — امن‌ترین ستون‌های ماتریس پوشش برای بستن پوزیشن داچینگ.",
        false
      ),
      aggFilter(
        boosterRows,
        "BOOSTER",
        "🚀 شتاب‌دهنده نامتقارن (ریسک<۱۰٪ + سود اصلاحی >۲۵٪)",
        "روی کارت‌های کم‌ریسک، سود تیپ A با اهرم شتاب‌دهنده بیش از ۲۵٪ تقویت شده — بیشترین بازده ممکن به ازای ریسک محدودشده.",
        false
      ),
      aggFilter(
        profit15Rows,
        "PROFIT15",
        "💰 سود تضمینی بالای ۱۵٪",
        "کارت‌هایی با حاشیه سود تضمینی داچینگ بالای ۱۵٪ — حتی در بدترین سناریوی نتیجه، سود قابل‌لمس روی میز می‌ماند.",
        false
      ),
      aggFilter(
        fortressRows,
        "FORTRESS",
        "🏰 دژ نفوذناپذیر (ریسک زیر ۷٪)",
        "کارت‌های دژوار با ریسک باخت همزمان زیر ۷٪ — کم‌بازده‌ترین اما امن‌ترین انتخاب کارنامه برای بستن شرط بدون استرس.",
        false
      ),
      aggFilter(
        partitionD,
        "VETOED",
        "🛡️ وتوشده‌های دفتر سایه (کاغذی)",
        "بازی‌هایی که سوپروایزر وتو کرده و هرگز به کانال نرفته — تسویه کاغذی counterfactual برای اثبات اینکه وتو چند واحد سرمایه نجات داده است.",
        true
      ),
    ];

    const body: CategoryPerformanceResponseDTO = {
      success: true,
      categories,
      filterPerformance,
      shadowLedger: {
        approvedSlips: live.length,
        shadowSlips: partitionD.length,
        note:
          sumTotal === slips.length
            ? "افراز مجزا v13.2 تأیید شد — مجموع ۵ دسته (شامل بازخوانی) دقیقاً برابر کل کارت‌هاست؛ هیچ کارتی دوبار شمرده نمی‌شود."
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
        filterPerformance: [],
        shadowLedger: { approvedSlips: 0, shadowSlips: 0, note: "خطا" },
        generatedAt: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
