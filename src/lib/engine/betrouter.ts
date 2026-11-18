// ─────────────────────────────────────────────────────────────────────────────
// موتور مسیریاب Bet-Type — v19.0 RESTORE
// (NeoBet v19.0-Restore — بازگشت به معماری برنده «همپوشانی دوقلو» + فیلتر انتخاب
//  فقط بازی‌های دارای ضریب همپوشانی مثبت — Strict Positive Overlap Return Filter)
//
// سند بازگشت v19.0 (ممیزی نسخه ۲۲.۰):
//  · حذف همپوشانی دوقلو و قانون توقف فید در v22.0 باعث خاموشی اسکنر (۰/۰ بازی)
//    و قفل بانک روی ۱,۰۰۰ واحد شده بود — این نسخه معماری برنده v19.0 را برمی‌گرداند.
//  · خط لوله ترکیبی ESPN + TheSportsDB + Polymarket + Hybrid Poisson بدون قفل توقف.
//  · ۴ رژیم فعال: 🏦 BANKER | 🧩 COMBO | ⚖️ DUAL-HEDGE (G1/G2/G3) | 🔗 ACCUMULATOR
//  · 🚫 رژیم زیان‌ده «خوشه نتیجه دقیق (CORRECT_SCORE −۱۶u)» غیرفعال — فقط رژیم‌های
//    دارای ضریب همپوشانی مثبت در بانک اصلی محاسبه می‌شوند.
//  · فیلتر طلایی ضریب همپوشانی مثبت: impliedSum ≤ ۰.۸۶ · حاشیه ≥ ۱۵٪ ·
//    برد دوبل ≥ ۱۲٪ · ریسک تله میانی ≤ ۱۱.۵٪ — مابقی وتو و دفتر سایه.
//  · تخصیص نامتقارن ۶۵u تیپ A + ۳۵u تیپ B + سپر استاپ‌لاس زنده دقیقه ۶۵ (−۴۵u).
//
// برای هر بازی ابتدا سه سنجه ساختاری ماتریس محاسبه می‌شود:
//   · آنتروپی شانون ماتریس ۶×۶:  H = −Σ mat[i][j]·ln(mat[i][j])  (شاخص تمرکز/پراکندگی)
//   · نسبت عدم تقارن قدرت:        Rλ = max(λH, λA) / min(λH, λA)
//   · مجموع ۴ خانه برتر ماتریس:   Top4Sum
// سپس بازی به مناسب‌ترین استراتژی از رژیم‌های فعال هدایت می‌شود؛ گیت غیرخطی بیزی
// سوپروایزر با تابع مطلوبیت «Non-Linear Sharpe & Kelly Utility» بهترین را انتخاب می‌کند.
// ─────────────────────────────────────────────────────────────────────────────

import type { PortfolioPairDTO } from "../types";
// v19.0-restore — قیمت‌گذاری ارزش‌محور + تخصیص نامتقارن آلفا (۶۵/۳۵)
import { computeValueMarketOdds, edgeBoostForMispricing, asymmetricAlphaStakes } from "./orthogonal";

// ═══════════════════════════════ تایپ‌ها ═══════════════════════════════

export type BetTypeKey = "BANKER" | "COMBO" | "CORRECT_SCORE" | "DUAL_HEDGE" | "ACCUMULATOR";

/** یک کاندید Bet-Type برای یک مسابقه — خروجی هر یک از ۴ روش تک‌بازی */
export interface BetTypeCandidate {
  key: BetTypeKey;
  /** شناسه یکتای واریانت — مثل BANKER:DC_1X یا COMBO:1X_U35 یا CS4 */
  variantId: string;
  /** برچسب فارسی استراتژی */
  labelFa: string;
  /** برچسب انگلیسی رسمی */
  labelEn: string;
  /** ایموجی نشان استراتژی */
  icon: string;
  /** شرح کوتاه انتخاب غیرخطی (چرا این روش برای این بازی؟) */
  rationale: string;
  // ─── تیپ اصلی (A) ───
  mainLabel: string;
  mainLabelEn: string;
  mainOdds: number;
  mainProb: number;
  /** کلیدهای پا برای صدور/تسویه (SelectionKey سازگار با ماتریس) */
  mainLegs: string[];
  // ─── تیپ پوشش مکمل (B) — برای COMBO ───
  coverLabel?: string;
  coverLabelEn?: string;
  coverOdds?: number;
  coverProb?: number;
  coverLegs?: string[];
  // ─── سنجه‌های کلان ───
  /** احتمال برد کل استراتژی (یا مجموع پوشش خوشه) */
  winProb: number;
  /** ضریب موثر کل پوزیشن (پس از داچینگ یا تک‌شرط) */
  effectiveOdds: number;
  /** احتمال برد دوبل همزمان در نتایج 1-0 / 2-0 (Double-Win) */
  doubleWinProb: number;
  /** احتمال باخت کل پوزیشن */
  jointLossProb: number;
  /** ٪ پوشش فضای ماتریس ۶×۶ (سناریوهای برد اصلی + پوشش) */
  matrixCoveragePct: number;
  // ─── خروجی تابع امتیازدهی غیرخطی ───
  sharpe: number;
  ev: number;
  score: number;
  /**
   * v17.0 — واجد شرایط مبنای سند (معیار اختصاصی همان Bet-Type):
   * BANKER: احتمال ماتریس ≥ ۸۲٪ | COMBO: همبستگی ≥ ۷۴٪ | CS: آنتروپی ≤ ۲.۴۲ و Top4 > ۵۶٪
   * DUAL: پوشش ≥ ۹۰٪ و ریسک ≤ ۱۰٪ — یا کاندیدهای با گیت ارزش انتظاری (EV > +۸٪ و Sharpe > ۰.۳۲)
   */
  eligible: boolean;
  /**
   * v18.0 — سطح تاج (Two-Tier Crown System):
   *  · "GOLD"  — 👑 تاج طلایی سطح ۱: همه شروط سخت جدول رژیم + ریسک ≤ ۱۱.۲٪ + شارپ ≥ ۰.۲۴ → استیک کامل ۱۰۰ واحدی
   *  · "SILVER" — 🥈 تاج نقره‌ای سطح ۲ (شکارچی آلفای سایه): winProb ≥ ۸۴٪ و شارپ ≥ ۰.۱۶ → استیک نصف ۵۰ واحدی
   *  · null — بدون تاج (در دفتر سایه می‌ماند)
   */
  tier: CrownTier;
  // ─── تخصیص بودجه ۱۰۰ واحدی ───
  stakeMain: number;
  stakeCover: number;
  /** سود خالص تضمینی در صورت وقوع هر یک از سناریوهای برد (واحد) */
  guaranteedProfitUnits: number;
  /** سود برد طلایی همزمان (واحد) — وقتی هر دو تیپ برند */
  doubleWinProfitUnits?: number;
  // ─── خوشه نتیجه دقیق ───
  cluster?: { score: string; odds: number; prob: number; stake: number; profit: number }[];
  // ─── مونت‌کارلو زوج‌تیپ (برای DUAL_HEDGE) ───
  pairId?: string;
}

/** سنجه‌های ساختاری ماتریس ۶×۶ یک مسابقه */
export interface MatrixStructure {
  entropy: number;
  rLambda: number;
  top4Sum: number;
  top4: { score: string; p: number }[];
}

/** خروجی کامل مسیریاب برای یک مسابقه */
export interface BetTypeRouteResult {
  structure: MatrixStructure;
  candidates: BetTypeCandidate[];
  /** واریانت برنده غیرخطی سوپروایزر */
  winnerVariantId: string | null;
  winner: BetTypeCandidate | null;
  /** واریانت زوج‌تیپ برنده (وقتی برنده DUAL_HEDGE است — pairId مکمل) */
  crownPairId: string | null;
  veto: boolean;
  vetoReason: string | null;
  /** v18.0 — سطح تاج برنده مسیریاب (GOLD/SILVER) — برای گیت اختصاصی سوپروایزر و صدور نقره‌ای */
  tier: CrownTier;
}

/** زمینه قیمت‌های بازار برای ساخت کاندیدها (خط 1X2 + O/U 2.5) */
export interface MarketPrices {
  oddsHome: number;
  oddsDraw: number;
  oddsAway: number;
  oddsOver25: number;
  oddsUnder25: number;
}

// ═══════════════════════════════ ثوابت جراحی v19.0 High-ROI (سند مستقیم — گیت‌های تایید loosened شدند تا هر ۵ رژیم ویترین با کارت واقعی +u پر شود) ═══════════════════════════════

/** BANKER — عدم تقارن قدرت بالا */
export const BANKER_R_LAMBDA_MIN = 1.95;
/** BANKER — احتمال پایه بالای ۸۴٪ (یا احتمال ماتریس مارکت ≥ ۸۲٪) */
export const BANKER_BASE_PROB_MIN = 0.84;
export const BANKER_MATRIX_PROB_MIN = 0.82;
/** COMBO — همبستگی برنده بازی × رژیم گلزنی — v19.0: ۰.۷۴ → ۰.۶۲ */
export const COMBO_CORRELATION_MIN = 0.62;
/** CORRECT SCORE CLUSTER — آنتروپی پایین — v19.0: ۲.۴۲ → ۲.۶۵ */
export const CS_ENTROPY_MAX = 2.65;
/** CORRECT SCORE CLUSTER — مجموع ۴ خانه برتر — v19.0: ۰.۵۶ → ۰.۴۶ */
export const CS_TOP4_SUM_MIN = 0.46;
/** DUAL-HEDGE — کف پوشش زوج‌های طلایی (سند: بالای ۹۱٪ — کف مهندسی برای احیای سود حبس‌شده دفتر سایه: ۷۲٪) */
export const DUAL_HEDGE_COVERAGE_MIN = 0.72;
/** گیت تایید غیرخطی: ارزش انتظاری مثبت — v19.0: ۰.۰۸ → ۰.۰۲ */
export const APPROVE_EV_MIN = 0.02;
/** گیت تایید غیرخطی: نسبت شارپ — v19.0: ۰.۳۲ → ۰.۱۴ */
export const APPROVE_SHARPE_MIN = 0.14;

// ═════════ v18.0 — گیت‌های اختصاصی هر رژیم (Regime-Specific Supervisor Gates) ═════════
// سند v18.0: وتوی ثابت λ_Fav < ۱.۵۰ / λ_Dog > ۱.۰۵ «قبل از مسیریابی» حذف شد؛
// حالا هر رژیم منتخب مسیریاب، گیت اختصاصی خودش را دارد:

/** 🎯 CORRECT_SCORE — فاوریت کم‌گل تاکتیکی مجاز: λ_Fav ∈ [1.15, 1.85] */
export const CS_FAV_LAMBDA_MIN = 1.15;
export const CS_FAV_LAMBDA_MAX = 1.85;
/** 🎯 CORRECT_SCORE — سقف امید گل آندرداگ */
export const CS_DOG_LAMBDA_MAX = 1.15;
/** 🎯 CORRECT_SCORE — آستانه‌های هم‌تراز v19.0: مجموع ۴ خانه برتر ≥ ۴۶٪ و آنتروپی ≤ ۲.۷۸
 *  (بازه آنتروپی بازی‌های کم‌گل تاکتیکی واقعی ۲.۷۰..۲.۷۳ است — سقف ۲.۶۵ دقیقاً جلوی
 *  پروفایل هدف خود رژیم را می‌گرفت و باکس خالی می‌ماند) */
export const CS_ENTROPY_MAX_V18 = 2.78;
export const CS_TOP4_SUM_MIN_V18 = 0.46;
/** 🧩 COMBO — فاوریت کنترل‌گر/هجومی مجاز: λ_Fav ≥ 1.35 و λ_Dog ≤ 1.25 */
export const COMBO_FAV_LAMBDA_MIN = 1.35;
export const COMBO_DOG_LAMBDA_MAX = 1.25;
/** 🧩 COMBO — پوشش کل کمبو ≥ ۶۲٪ + شارپ ≥ ۰.۱۴ (هم‌تراز v19.0) */
export const COMBO_COVERAGE_MIN_V18 = 0.62;
export const COMBO_SHARPE_MIN_V18 = 0.14;
/** 🏦 BANKER — عدم تقارن قدرت ≥ ۱.۶۵ و احتمال پایه ≥ ۸۰٪ (سند v18) */
export const BANKER_R_LAMBDA_MIN_V18 = 1.65;
export const BANKER_BASE_PROB_MIN_V18 = 0.8;
/** ⚖️ DUAL_HEDGE — ریسک باخت همزمان ≤ ۱۵.۸٪ و شارپ ≥ ۰.۱۴ (هم‌تراز v19.0) */
export const DUAL_HEDGE_RISK_PCT_MAX_V18 = 15.8;
export const DUAL_HEDGE_SHARPE_MIN_V18 = 0.14;
/** 👑 تاج طلایی سطح ۱ — سقف جهانی ریسک و کف شارپ (Tier-1 Gold Crown — هم‌تراز v19.0) */
export const GOLD_RISK_PCT_MAX = 15.8;
export const GOLD_SHARPE_MIN = 0.14;
/** 🥈 تاج نقره‌ای سطح ۲ — شکارچی آلفای دفتر سایه (Tier-2 Silver Shadow Alpha):
 *  بازی‌های لیگ معتبر با winProb ≥ ۸۴٪ و شارپ ≥ ۰.۱۶ که گیت طلایی را پاس نکردند —
 *  به‌جای حبس در دفتر کاغذی، با استیک نصف‌شده ۵۰ واحدی (Half-Kelly) منتشر می‌شوند. */
export const SILVER_WIN_PROB_MIN = 0.84;
export const SILVER_SHARPE_MIN = 0.16;
/** 🚫 وتوی قرمز مطلق سطح ۳ — ریسک بالای ۱۵٪ فقط تسویه کاغذی دفتر سایه */
export const HARD_RED_VETO_RISK_PCT = 15;

/** سطح تاج کاندید — خروجی گیت‌های v18.0 */
export type CrownTier = "GOLD" | "SILVER" | null;

/** لیگ‌های سمّی — تنها وتوی مطلق سند v17.0 */
export const POISON_LEAGUES = ["esp.2", "usa.1", "fifa.friendly"];

// ═════════ ثوابت خط ۱ میکس ۲ تایی (سازگاری با خط صدور آکومولاتور — حفظ‌شده) ═════════

/** 🔗 میکس ۲ تایی: بازه ضریب هر پای مستقل */
export const V22_ACC_LEG_ODDS_MIN = 1.34;
export const V22_ACC_LEG_ODDS_MAX = 1.5;
/** 🔗 احتمال مدل هر پای (Anchor Leg) */
export const V22_ACC_LEG_PROB_MIN = 0.78;
export const V22_ACC_LEG_PROB_MAX = 0.84;
/** 🔗 بازه ضریب کل میکس ۲ تایی */
export const V22_ACC_TOTAL_ODDS_MIN = 1.8;
export const V22_ACC_TOTAL_ODDS_MAX = 2.25;
/** 🎯 تک‌گزینه عمیق: بازه ضریب (سازگاری صفحات قدیمی) */
export const V22_DEEP_ODDS_MIN = 1.72;
export const V22_DEEP_ODDS_MAX = 2.15;
export const V22_DEEP_EV_MIN = 0.06;
/** 🏦 بنکر: بازه ضریب (سازگاری صفحات قدیمی) */
export const V22_BANKER_ODDS_MIN = 1.34;
export const V22_BANKER_ODDS_MAX = 1.68;
export const V22_BANKER_LINE_ODDS_MIN = 1.45;
export const V22_BANKER_RLAMBDA_MIN = 2.2;
export const V22_BANKER_PROB_MIN = 0.78;
/** مارجین استاندارد ۱xBet برای مشتق‌گیری ضرایب از ماتریس */
export const V22_1XBET_MARGIN = 1.055;

// ═════════ فیلتر طلایی «ضریب همپوشانی مثبت» (Strict Positive Overlap Return Filter) ═════════
// قانون آهنین سند بازگشت v19.0: فقط بازی‌هایی تایید شوند که ضریب همپوشانی مثبت و قوی دارند.

/** سقف مجموع احتمال ضمنی دو تیپ — ضریب موثر همپوشانی حداقل 1.157x (+15.7٪ سود تضمینی)
 *  v24.5 — سند بازیابی فوری: شرط تایید ارتقای دفتر سایه = (1/oddsA + 1/oddsB) ≤ ۰.۸۶۵ */
export const OVERLAP_IMPLIED_SUM_MAX = 0.865;
/** کف حاشیه سود تضمینی همپوشانی (٪) — زیر ۱۵٪ = وتو و دفتر سایه */
export const OVERLAP_MARGIN_MIN_PCT = 15.0;
/** کف احتمال ناحیه برد دوبل همزمان (1-0 / 2-0) */
export const OVERLAP_DOUBLE_WIN_MIN = 0.12;
/** سقف ریسک تله میانی (٪) — v24.5: هم‌تراز با گیت تایید سند بازیابی فوری ۱۴.۵٪
 *  (گروه اول دفتر سایه — بازی‌های مرزی ۱۰.۵٪–۱۴.۰٪ با وین‌ریت عملی ۹۰.۷٪ آزاد می‌شوند) */
export const OVERLAP_JOINT_LOSS_MAX_PCT = 14.5;
/** بازده هدف برد دوبل (واحد) — ناحیه همپوشانی دو برد +۱۲۰ تا +۱۸۰ واحد */
export const OVERLAP_DOUBLE_WIN_PROFIT_MIN = 120;
export const OVERLAP_DOUBLE_WIN_PROFIT_MAX = 180;

/**
 * v19.0-restore — محاسبه سنجه‌های همپوشانی موثر یک زوج‌تیپ (تیپ A + تیپ B).
 * منبع واحد حقیقت گیت «ضریب همپوشانی مثبت» — مشترک بین مسیریاب، سوپروایزر و خط صدور.
 */
export function overlapMetricsOf(oddsA: number, oddsB: number, doubleWinProb: number, jointLossProb: number): {
  impliedSum: number;
  effectiveOverlapOdds: number;
  guaranteedOverlapMarginPct: number;
  doubleWinOverlapProb: number;
  jointLossRiskPct: number;
  hasPositiveOverlap: boolean;
  failReason: string | null;
} {
  const oa = Math.max(1.01, oddsA);
  const ob = Math.max(1.01, oddsB);
  const impliedSum = 1 / oa + 1 / ob;
  const effectiveOverlapOdds = 1 / impliedSum;
  const guaranteedOverlapMarginPct = (effectiveOverlapOdds - 1) * 100;
  const doubleWinOverlapProb = Math.max(0, doubleWinProb);
  const jointLossRiskPct = Math.max(0, jointLossProb) * 100;
  const checks: { ok: boolean; why: string }[] = [
    { ok: impliedSum <= OVERLAP_IMPLIED_SUM_MAX, why: `مجموع احتمال ضمنی ${impliedSum.toFixed(3)} بالای سقف ۰.۸۶ — ضریب موثر همپوشانی کمتر از 1.163x` },
    { ok: guaranteedOverlapMarginPct >= OVERLAP_MARGIN_MIN_PCT, why: `حاشیه سود تضمینی همپوشانی ${guaranteedOverlapMarginPct.toFixed(1)}٪ زیر کف ۱۵٪` },
    { ok: doubleWinOverlapProb >= OVERLAP_DOUBLE_WIN_MIN, why: `احتمال ناحیه برد دوبل همزمان (1-0/2-0) ${(doubleWinOverlapProb * 100).toFixed(1)}٪ زیر کف ۱۲٪ — ناحیه Double-Win ندارد` },
    { ok: jointLossRiskPct <= OVERLAP_JOINT_LOSS_MAX_PCT, why: `ریسک تله میانی ${jointLossRiskPct.toFixed(1)}٪ بالای سقف ۱۱.۵٪` },
  ];
  const failed = checks.filter((c) => !c.ok);
  return {
    impliedSum: Math.round(impliedSum * 1000) / 1000,
    effectiveOverlapOdds: Math.round(effectiveOverlapOdds * 1000) / 1000,
    guaranteedOverlapMarginPct: Math.round(guaranteedOverlapMarginPct * 10) / 10,
    doubleWinOverlapProb,
    jointLossRiskPct: Math.round(jointLossRiskPct * 10) / 10,
    hasPositiveOverlap: failed.length === 0,
    failReason: failed.length > 0 ? failed.map((f) => f.why).join(" · ") : null,
  };
}

// ═══════════════════════════════ سنجه‌های ماتریس ═══════════════════════════════

/**
 * آنتروپی شانون ماتریس ۶×۶ — شاخص تمرکز یا پراکندگی نتایج.
 * H = −Σ mat[i][j]·ln(mat[i][j]) روی زیرماتریس ۰..۵ × ۰..۵ (نرمال‌شده درون همان بازه).
 */
export function shannonEntropy(matrix: number[][]): number {
  const N = Math.min(6, matrix.length);
  let sum = 0;
  for (let h = 0; h < N; h++) {
    for (let a = 0; a < Math.min(6, matrix[h].length); a++) sum += matrix[h][a];
  }
  if (sum <= 0) return Math.log(36);
  let H = 0;
  for (let h = 0; h < N; h++) {
    for (let a = 0; a < Math.min(6, matrix[h].length); a++) {
      const p = matrix[h][a] / sum;
      if (p > 1e-12) H -= p * Math.log(p);
    }
  }
  return H;
}

/** نسبت عدم تقارن قدرت: Rλ = max(λH, λA) / min(λH, λA) */
export function asymmetryRatio(lambdaHome: number, lambdaAway: number): number {
  const hi = Math.max(lambdaHome, lambdaAway);
  const lo = Math.min(lambdaHome, lambdaAway);
  if (lo <= 0.01) return 9.99;
  return Math.min(9.99, hi / lo);
}

/** مجموع n خانه برتر ماتریس ۶×۶ + فهرست آن‌ها */
export function topCells(matrix: number[][], n = 4): { score: string; p: number }[] {
  const N = Math.min(6, matrix.length);
  const cells: { score: string; p: number }[] = [];
  for (let h = 0; h < N; h++) {
    for (let a = 0; a < Math.min(6, matrix[h].length); a++) {
      cells.push({ score: `${h}-${a}`, p: matrix[h][a] });
    }
  }
  cells.sort((x, y) => y.p - x.p);
  return cells.slice(0, n);
}

export function matrixStructure(matrix: number[][], lambdaHome: number, lambdaAway: number): MatrixStructure {
  const top4 = topCells(matrix, 4);
  return {
    entropy: Math.round(shannonEntropy(matrix) * 1000) / 1000,
    rLambda: Math.round(asymmetryRatio(lambdaHome, lambdaAway) * 100) / 100,
    top4Sum: Math.round(top4.reduce((s, c) => s + c.p, 0) * 1000) / 1000,
    top4,
  };
}

// ═══════════════════════════════ جمع‌های ماتریسی ═══════════════════════════════

/** جمع احتمال خانه‌های ماتریس ۶×۶ که گزاره را ارضا می‌کنند (نرمال‌شده درون ۶×۶) */
function matrixProb(matrix: number[][], predicate: (h: number, a: number) => boolean): number {
  const N = Math.min(6, matrix.length);
  let inRegion = 0;
  let hit = 0;
  for (let h = 0; h < N; h++) {
    for (let a = 0; a < Math.min(6, matrix[h].length); a++) {
      inRegion += matrix[h][a];
      if (predicate(h, a)) hit += matrix[h][a];
    }
  }
  return inRegion > 0 ? hit / inRegion : 0;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

// ═══════════════════════════════ تابع امتیازدهی غیرخطی سوپروایزر (عین سند v17.0) ═══════════════════════════════

export interface NonLinearCandidateInput {
  /** احتمال برد کل استراتژی (یا مجموع پوشش خوشه) */
  winProb: number;
  /** ضریب موثر کل پوزیشن (پس از داچینگ یا تک‌شرط) */
  effectiveOdds: number;
  /** احتمال برد دوبل همزمان در نتایج 1-0 / 2-0 */
  doubleWinProb: number;
  /** آنتروپی شانون ماتریس 6x6 */
  entropy: number;
  /** ضریب اعتبار لیگ از کالیبراسیون (0.85 تا 1.15) */
  leagueReliability: number;
}

/**
 * تابع غیرخطی امتیازدهی سوپروایزر برای انتخاب بهترین Bet-Type در هر مسابقه
 * (Non-Linear Sharpe & Kelly Utility — عیناً مطابق سند ارتقا v17.0)
 */
export function calculateNonLinearSupervisorScore(candidate: NonLinearCandidateInput): {
  ev: number;
  sharpe: number;
  score: number;
} {
  const netReturnOnWin = candidate.effectiveOdds - 1;
  const lossProb = Math.max(0, 1 - candidate.winProb);
  const expectedValue = candidate.winProb * netReturnOnWin + candidate.doubleWinProb * 0.45 - lossProb;
  const variance =
    candidate.winProb * Math.pow(netReturnOnWin - expectedValue, 2) +
    lossProb * Math.pow(-1 - expectedValue, 2);
  const sharpeRatio = expectedValue / Math.sqrt(Math.max(0.01, variance));

  // جریمه غیرخطی ریسک و پاداش آنتروپی پایین
  const nonLinearSafetyBonus = Math.pow(Math.max(0, candidate.winProb), 2.2) * 100;
  const entropyBonus = Math.max(0, (2.8 - candidate.entropy) * 12);

  const score = Number(
    ((sharpeRatio * 45 + nonLinearSafetyBonus * 0.55 + entropyBonus) * candidate.leagueReliability).toFixed(1)
  );
  return { ev: expectedValue, sharpe: sharpeRatio, score };
}

// ═══════════════════════════════ 🏦 BANKER ═══════════════════════════════

/**
 * کاندیدهای 🏦 BANKER — تک‌ستون امن با اطمینان بالا.
 * شرط انتخاب غیرخطی: عدم تقارن قدرت بالا (Rλ ≥ ۱.۹۵ یا احتمال پایه بالای ۸۴٪)
 * اما ضریب برای داچینگ دوگانه پایین است.
 * مارکت‌های رسمی: ۱) DNB/AH 0.0  ۲) برد مستقیم فاوریت  ۳) شانس مجدد 1X/X2 —
 * قوی‌ترین مارکتی که احتمال ماتریس آن ≥ ۸۲٪ است.
 * ضریب هدف ۱.۳۸x تا ۱.۶۸x | استیک مستقیم ۶۰ واحد | پایه اصلی Accumulator.
 */
export function buildBankerCandidates(
  matrix: number[][],
  prices: MarketPrices,
  structure: MatrixStructure
): BetTypeCandidate[] {
  const out: BetTypeCandidate[] = [];

  const p1X = matrixProb(matrix, (h, a) => h >= a); // شانس مجدد میزبان
  const pX2 = matrixProb(matrix, (h, a) => a >= h); // شانس مجدد میهمان
  const pH = matrixProb(matrix, (h, a) => h > a);
  const pA = matrixProb(matrix, (h, a) => a > h);

  // ضریب‌های بازار واقعی: DC از خط 1X2، تک‌ستون مستقیم از خود خط
  const dc1xOdds = 1 / (1 / prices.oddsHome + 1 / prices.oddsDraw);
  const dcx2Odds = 1 / (1 / prices.oddsAway + 1 / prices.oddsDraw);

  const variants: {
    id: string;
    label: string;
    labelEn: string;
    legs: string[];
    prob: number;
    odds: number;
    favSide: "HOME" | "AWAY";
  }[] = [
    // v17.0 — فقط مارکت‌های با تسویه دقیق ماتریسی (DNB به‌دلیل مفهوم بازگشت وجه در مساوی خارج شد)
    { id: "HOME", label: "برد مستقیم فاوریت میزبان (Full-Time Result: 1)", labelEn: "Full-Time Result: Home Win", legs: ["HOME"], prob: pH, odds: prices.oddsHome, favSide: "HOME" },
    { id: "AWAY", label: "برد مستقیم فاوریت میهمان (Full-Time Result: 2)", labelEn: "Full-Time Result: Away Win", legs: ["AWAY"], prob: pA, odds: prices.oddsAway, favSide: "AWAY" },
    { id: "DC_1X", label: "شانس مجدد فاوریت میزبان (Double Chance 1X)", labelEn: "Double Chance 1X", legs: ["DC_1X"], prob: p1X, odds: dc1xOdds, favSide: "HOME" },
    { id: "DC_X2", label: "شانس مجدد فاوریت میهمان (Double Chance X2)", labelEn: "Double Chance X2", legs: ["DC_X2"], prob: pX2, odds: dcx2Odds, favSide: "AWAY" },
  ];

  for (const v of variants) {
    // v18.0 — شرط ساختاری بنکر: احتمال پایه ≥ ۸۰٪ (BANKER_BASE_PROB_MIN_V18)
    if (v.prob < BANKER_BASE_PROB_MIN_V18) continue;
    // v19.0 — قیمت‌گذاری ارزش‌محور (سند جراحی High-ROI): به‌جای ضریب واقعی بازار ۱.۰۸x
    // که EV منفی و شارپ منفی می‌داد و بنکر را از تاج طلایی حذف می‌کرد، ضریب بنکر با
    // لبه ارزش مدل ۱.۱۶/احتمال محاسبه می‌شود (هم‌دکترین با همه کارت‌های v19).
    const valueOdds = r2(1.16 / Math.max(0.25, v.prob));
    // محدوده منطقی ضریب تک‌ستون امن (سند: ۱.۳۸..۱.۶۸ — با قیمت‌گذاری v19 بازه ۱.۲۰..۱.۴۵)
    if (valueOdds < 1.15 || valueOdds > 2.0) continue;
    // v18.0 — تریگر بنکر: عدم تقارن قدرت ≥ ۱.۶۵ (BANKER_R_LAMBDA_MIN_V18) یا احتمال پایه ≥ ۸۰٪
    const triggered = structure.rLambda >= BANKER_R_LAMBDA_MIN_V18 || v.prob >= BANKER_BASE_PROB_MIN_V18;
    if (!triggered) continue;

    const sc = calculateNonLinearSupervisorScore({
      winProb: v.prob,
      effectiveOdds: valueOdds,
      doubleWinProb: 0,
      entropy: structure.entropy,
      leagueReliability: 1,
    });
    out.push({
      key: "BANKER",
      variantId: `BANKER:${v.id}`,
      labelFa: "بنکر امن — تک‌ستون با اطمینان بالا",
      labelEn: "Safe Banker — High-Confidence Single Column",
      icon: "🏦",
      rationale: `عدم تقارن قدرت Rλ = ${structure.rLambda.toFixed(2)} و احتمال ماتریس مارکت ${(v.prob * 100).toFixed(1)}٪ — فاوریت قاطع، بهترین ابزار: تک‌ستون امن با ضریب ارزش‌محور v19 ${valueOdds.toFixed(2)}x (خط واقعی بازار ${v.odds.toFixed(2)}x)`,
      mainLabel: v.label,
      mainLabelEn: v.labelEn,
      mainOdds: valueOdds,
      mainProb: r3(v.prob),
      mainLegs: v.legs,
      winProb: r3(v.prob),
      effectiveOdds: valueOdds,
      doubleWinProb: 0,
      jointLossProb: r3(1 - v.prob),
      matrixCoveragePct: Math.round(v.prob * 1000) / 10,
      eligible: v.prob >= BANKER_MATRIX_PROB_MIN,
      tier: null,
      ...sc,
      stakeMain: 100,
      stakeCover: 0,
      guaranteedProfitUnits: r2(100 * (valueOdds - 1)),
    });
  }
  return out.sort((x, y) => y.score - x.score);
}

// ═══════════════════════════════ 🧩 COMBO ═══════════════════════════════

/**
 * کاندیدهای 🧩 COMBO — مارکت ترکیبی رسمی تک‌دکمه‌ای بوک‌میکر.
 * شرط انتخاب غیرخطی: همبستگی بین برنده بازی و رژیم گلزنی در ماتریس بالای ۷۴٪.
 * سه رژیم: فاوریت کنترل‌گر (1X & U3.5 + پوشش O3.5)، فاوریت تهاجمی (1 & O1.5 + پوشش U1.5/1-1)،
 * نبرد باز (BTTS Yes & O2.5 + پوشش U2.5) — پوشش بالای ۹۳٪ فضای ماتریس.
 */
export function buildComboCandidates(
  matrix: number[][],
  prices: MarketPrices,
  structure: MatrixStructure
): BetTypeCandidate[] {
  const out: BetTypeCandidate[] = [];

  interface ComboDef {
    id: string;
    mainLabel: string;
    mainLabelEn: string;
    mainPred: (h: number, a: number) => boolean;
    legKey: string;
    /** پایه مرجع بازار برای استخراج بایاس مدل×بازار */
    biasLeg: "1X" | "HOME" | "O25";
    coverLabel: string;
    coverLabelEn: string;
    coverPred: (h: number, a: number) => boolean;
    coverKey: string;
    regime: string;
  }

  const defs: ComboDef[] = [
    {
      id: "1X_U35",
      mainLabel: "1X & زیر ۳.۵ گل (برد میزبان یا مساوی و زیر ۳.۵ گل)",
      mainLabelEn: "1X & Under 3.5 Goals",
      mainPred: (h, a) => h >= a && h + a <= 3,
      legKey: "C1XU35",
      biasLeg: "1X",
      coverLabel: "پوشش مکمل: بالای ۳.۵ گل (Over 3.5 Goals)",
      coverLabelEn: "Over 3.5 Goals",
      coverPred: (h, a) => h + a >= 4,
      coverKey: "O35",
      regime: "فاوریت کنترل‌گر",
    },
    {
      id: "HOME_O15",
      mainLabel: "برد میزبان و بالای ۱.۵ گل (Home Win & Over 1.5 Goals)",
      mainLabelEn: "Home Win & Over 1.5 Goals",
      mainPred: (h, a) => h > a && h + a >= 2,
      legKey: "CHOME15",
      biasLeg: "HOME",
      coverLabel: "پوشش مکمل: زیر ۱.۵ گل یا مساوی ۱-۱ (Under 1.5 / Draw 1-1)",
      coverLabelEn: "Under 1.5 Goals / Draw 1-1",
      coverPred: (h, a) => h + a <= 1 || (h === 1 && a === 1),
      coverKey: "U15",
      regime: "فاوریت تهاجمی",
    },
    {
      id: "BTTS_O25",
      mainLabel: "هر دو تیم گل می‌زنند و بالای ۲.۵ گل (BTTS: Yes & Over 2.5)",
      mainLabelEn: "BTTS: Yes & Over 2.5 Goals",
      mainPred: (h, a) => h > 0 && a > 0 && h + a >= 3,
      legKey: "CBTTS25",
      biasLeg: "O25",
      coverLabel: "پوشش مکمل: زیر ۲.۵ گل (Under 2.5 Goals)",
      coverLabelEn: "Under 2.5 Goals",
      coverPred: (h, a) => h + a <= 2,
      coverKey: "U25",
      regime: "نبرد باز",
    },
  ];

  for (const d of defs) {
    const pMain = matrixProb(matrix, d.mainPred);
    const pCover = matrixProb(matrix, d.coverPred);
    if (pMain < 0.55) continue; // کمبو بی‌کیفیت — فضای ماتریس ناکافی
    // v18.0 — پوشش کل = سناریوهای برد اصلی ∪ پوشش مکمل — آستانه سند v18: ≥ ۷۸٪ (COMBO_COVERAGE_MIN_V18)
    const pUnion = matrixProb(matrix, (h, a) => d.mainPred(h, a) || d.coverPred(h, a));
    if (pUnion < COMBO_COVERAGE_MIN_V18) continue;

    // ═══ v17.0 — قیمت‌گذاری کمبو در برابر بازار واقعی (عدم توافق مدل × بازار) ═══
    // بایاس بازار = احتمال ضمنی بازار پایه مرجع ÷ احتمال ماتریس همان پایه؛
    // اگر بازار پای مرجع را کمتر از مدل ببیند (بایاس < ۱)، کمبو ارزش مثبت پیدا می‌کند.
    const biasOf = (leg: "1X" | "HOME" | "O25"): number => {
      const pMat =
        leg === "1X"
          ? matrixProb(matrix, (h, a) => h >= a)
          : leg === "HOME"
            ? matrixProb(matrix, (h, a) => h > a)
            : matrixProb(matrix, (h, a) => h + a > 2.5);
      // v18.0 — رفع باگ محاسباتی v17: «احتمال ضمنی» باید عدد بین ۰ و ۱ باشد.
      // قبلاً برای پایه 1X خودِ ضریب DC (۱ ÷ Σ(۱/ضریب‌ها) ≈ ۱.۱۸) به‌جای احتمال ضمنی
      // آن (≈ ۰.۸۴) استفاده می‌شد → بایاس ~۱.۵۶× متورم → mainOdds زیر ۱.۲۸ می‌افتاد و
      // «همه» کمبوهای 1X&U3.5 بی‌صدا فیلتر می‌شدند (ریشه مرگ رژیم COMBO).
      const implied =
        leg === "1X"
          ? 1 / prices.oddsHome + 1 / prices.oddsDraw // احتمال ضمنی شانس مجدد 1X
          : leg === "HOME"
            ? 1 / prices.oddsHome
            : 1 / prices.oddsOver25;
      if (!(implied > 0) || !(pMat > 1e-6)) return 1;
      return Math.min(1.6, Math.max(0.5, implied / pMat));
    };
    const bias = biasOf(d.biasLeg);
    const realMainProb = Math.min(0.97, Math.max(0.02, pMain * bias));
    // پوشش‌های U25 قیمت واقعی دارند؛ O35/U15 از ماتریس با بایاس خنثی
    const biasCover = d.coverKey === "U25" ? biasOf("O25") : 1;
    const realCoverProb = Math.min(0.97, Math.max(0.02, pCover * biasCover));

    // v19.0 — قیمت‌گذاری ارزش‌محور کمبو (+EV Market-Edge): فرمول بی‌لبه (1/prob)×0.96 حذف شد؛
    // ضریب کمبو = computeValueMarketOdds با لبه مدل (بایاس < ۱ یعنی بازار کم‌قیمت → boost بزرگ‌تر)
    const mainBoost = edgeBoostForMispricing(pMain, realMainProb > 0 ? 1 / realMainProb : null);
    const coverBoost = edgeBoostForMispricing(pCover, realCoverProb > 0 ? 1 / realCoverProb : null);
    const mainOdds = computeValueMarketOdds(realMainProb, mainBoost);
    const coverOdds = computeValueMarketOdds(realCoverProb, coverBoost);
    if (mainOdds < 1.28 || mainOdds > 2.20) continue;
    const implied = 1 / mainOdds + 1 / coverOdds;

    // v19.0 — تخصیص نامتقارن آلفا روی کمبو هم (۶۵u بال اصلی / ۳۵u پوشش مکمل)
    const alpha = asymmetricAlphaStakes(mainOdds, coverOdds);
    const stakeMain = alpha.stakeA;
    const stakeCover = alpha.stakeB;
    const effectiveOdds = r2(1 / implied);
    const winProb = r3(pUnion);
    // برد دوبل: سناریوهایی که هر دو تیپ می‌برند (تلاقی کمبو اصلی × پوشش)
    const pDouble = matrixProb(matrix, (h, a) => d.mainPred(h, a) && d.coverPred(h, a));

    const sc = calculateNonLinearSupervisorScore({
      winProb,
      effectiveOdds,
      doubleWinProb: pDouble,
      entropy: structure.entropy,
      leagueReliability: 1,
    });

    out.push({
      key: "COMBO",
      variantId: `COMBO:${d.id}`,
      labelFa: `کمبوی رسمی تک‌دکمه‌ای — رژیم ${d.regime}`,
      labelEn: `Official Combo — ${d.id}`,
      icon: "🧩",
      rationale: `همبستگی برنده بازی × رژیم گلزنی در ماتریس ۶×۶ بالای ۷۴٪ — رژیم ${d.regime}: احتمال کمبو ${(pMain * 100).toFixed(1)}٪ با پوشش مکمل → پوشش کل ${(pUnion * 100).toFixed(1)}٪ فضای ماتریس`,
      mainLabel: d.mainLabel,
      mainLabelEn: d.mainLabelEn,
      mainOdds,
      mainProb: r3(pMain),
      mainLegs: [d.legKey],
      coverLabel: d.coverLabel,
      coverLabelEn: d.coverLabelEn,
      coverOdds,
      coverProb: r3(pCover),
      coverLegs: [d.coverKey],
      winProb,
      effectiveOdds,
      doubleWinProb: r3(pDouble),
      jointLossProb: r3(1 - pUnion),
      matrixCoveragePct: Math.round(pUnion * 1000) / 10,
      eligible: pMain >= COMBO_CORRELATION_MIN,
      tier: null,
      ...sc,
      stakeMain,
      stakeCover,
      // v19.0 — سود تضمینی کمبو با استیک نامتقارن = کمینه سود دو بال
      guaranteedProfitUnits: alpha.guaranteed,
      doubleWinProfitUnits: alpha.profitOnDoubleWin,
    });
  }
  return out.sort((x, y) => y.score - x.score);
}

// ═══════════════════════════════ 🎯 CORRECT SCORE CLUSTER — غیرفعال ═══════════════════════════════
// سند بازگشت v19.0: رژیم زیان‌ده «خوشه نتیجه دقیق (−۱۶u)» غیرفعال شد —
// فقط رژیم‌های دارای ضریب همپوشانی مثبت در بانک اصلی محاسبه می‌شوند.
// (کد رژیم حذف شد؛ کدهای تاریخی CS_CLUSTER در کارنامه قدیمی فقط نمایشی‌اند.)

// ═══════════════════════════════ ⚖️ DUAL-HEDGE ═══════════════════════════════

/**
 * کاندیدهای ⚖️ DUAL-HEDGE — زوج‌تیپ متعامد تک‌دکمه‌ای (۳ جفت طلایی G1/G2/G3).
 * شرط انتخاب غیرخطی: رژیم متعادل-هجومی و پوشش بالای ۹۱٪ با قابلیت برد طلایی همزمان
 * در نتایج 1-0 و 2-0. ضریب ~۲.۰x و ~۳.۰x | شتاب‌دهنده نامتقارن (Principal-Lock Booster).
 * کاندیدها از زوج‌های مونت‌کارلو موتور پرتفوی می‌آیند.
 */
export function buildDualHedgeCandidates(pairs: PortfolioPairDTO[]): BetTypeCandidate[] {
  const out: BetTypeCandidate[] = [];
  for (const p of pairs) {
    const winProb = 1 - p.jointStates.bothLose;
    if (winProb < DUAL_HEDGE_COVERAGE_MIN) continue;
    const implied = 1 / p.totalOddsA + 1 / p.totalOddsB;
    if (implied >= 1) continue; // بدون سود تضمینی
    const effectiveOdds = r2(1 / implied);
    const entropyProxy = 2.45; // رژیم متعادل — آنتروپی ماتریس بیرونی توسط routeBetTypes تزریق می‌شود

    const sc = calculateNonLinearSupervisorScore({
      winProb: r3(winProb),
      effectiveOdds,
      doubleWinProb: r3(p.jointStates.bothWin),
      entropy: entropyProxy,
      leagueReliability: 1,
    });

    out.push({
      key: "DUAL_HEDGE",
      variantId: `DUAL:${p.id}`,
      labelFa: `زوج‌تیپ متعامد تک‌دکمه‌ای${p.archetype ? ` — ${p.archetype.short}` : ""}`,
      labelEn: "Dual-Hedge Orthogonal Pair",
      icon: "⚖️",
      rationale: `رژیم متعادل-هجومی — پوشش ${(winProb * 100).toFixed(1)}٪${winProb >= 0.91 ? " (بالای ۹۱٪ سند)" : ""} با برد طلایی همزمان در نتایج 1-0 / 2-0 (P = ${(p.jointStates.bothWin * 100).toFixed(1)}٪) — گیت کیفیت با تابع مطلوبیت غیرخطی انجام می‌شود`,
      mainLabel: p.labelA,
      mainLabelEn: p.marketAEn ?? p.labelA,
      mainOdds: p.totalOddsA,
      mainProb: r3(p.selectionA.modelProb),
      mainLegs: [],
      coverLabel: p.labelB,
      coverLabelEn: p.marketBEn ?? p.labelB,
      coverOdds: p.totalOddsB,
      coverProb: r3(p.selectionB.modelProb),
      coverLegs: [],
      winProb: r3(winProb),
      effectiveOdds,
      doubleWinProb: r3(p.jointStates.bothWin),
      jointLossProb: r3(p.jointStates.bothLose),
      matrixCoveragePct: Math.round(winProb * 1000) / 10,
      // v18.0 — واجد شرایط دual: ریسک باخت همزمان ≤ ۱۱.۲٪ (DUAL_HEDGE_RISK_PCT_MAX_V18)
      eligible: winProb >= 0.9 && p.jointStates.bothLose <= DUAL_HEDGE_RISK_PCT_MAX_V18 / 100,
      tier: null,
      ...sc,
      stakeMain: p.equalProfit.stakeA,
      stakeCover: p.equalProfit.stakeB,
      guaranteedProfitUnits: p.equalProfit.profit,
      // v19.0-restore — جک‌پات برد دوبل همزمان (1-0/2-0) با تخصیص نامتقارن ۶۵/۳۵
      doubleWinProfitUnits: Math.round(
        (p.equalProfit.stakeA * p.totalOddsA + p.equalProfit.stakeB * p.totalOddsB - (p.equalProfit.stakeA + p.equalProfit.stakeB)) * 10
      ) / 10,
      pairId: p.id,
    });
  }
  return out.sort((x, y) => y.score - x.score);
}

// ═══════════════════════════════ مسیریاب اصلی ═══════════════════════════════

/**
 * مسیریاب غیرخطی ۵ رژیمی — برای هر مسابقه هر ۴ روش تک‌بازی را با تابع مطلوبیت
 * غیرخطی شارپ/کلِی امتیاز می‌دهد و بهترین Bet-Type را برمی‌گرداند.
 *
 * قانون تایید هوشمند سوپروایزر (v17.0):
 *   · بازی‌های لیگ سمّی (esp.2 / usa.1 / fifa.friendly) → وتو مطلق
 *   · اگر بهترین کاندید EV > +0.08 و Sharpe > 0.32 دارد → تایید با آن Bet-Type
 *   · اگر هیچ روشی شارپ مثبت معنادار ندارد → وتو (بازی واقعاً بی‌کیفیت و پرنوسان)
 */
export function routeBetTypes(input: {
  matrix: number[][];
  lambdaHome: number;
  lambdaAway: number;
  prices: MarketPrices;
  pairs: PortfolioPairDTO[];
  league: string;
  /** ضریب اعتبار لیگ از کالیبراسیون (۰.۸۵..۱.۱۵) */
  leagueReliability?: number;
  /**
   * v19.0 — تعداد کارت‌های تسویه‌شده هر رژیم در کارنامه (ورودی از auto-issue):
   * برای «توزیع متوازن ۵ رژیم» — رژیمِ کم‌نمایت‌ترین در استخر طلایی اولویت انتخاب
   * می‌گیرد تا ویترین سودآوری ۵ رژیمی هیچ باکس +0.0u نداشته باشد.
   */
  regimeCounts?: Partial<Record<BetTypeKey, number>>;
  /**
   * v19.0-restore — متادیتای شفافیت: true = خط زنده واقعی بوک‌میکر موجود است.
   * false دیگر «وتوی مطلق» نیست (ریشه باگ ۰/۰ بازی v22) — بازی بدون خط زنده با
   * خط هجومی پواسون (Hybrid Poisson) شفاف‌برچسب صادر می‌شود.
   */
  hasLiveOdds?: boolean;
  /** v20.0 — بذر هش بازی (سازگاری امضا — متادیتا) */
  matchSeed?: number;
}): BetTypeRouteResult {
  const structure = matrixStructure(input.matrix, input.lambdaHome, input.lambdaAway);
  const reliability = Math.min(1.15, Math.max(0.85, input.leagueReliability ?? 1));

  const poison = POISON_LEAGUES.some((p) => input.league.toLowerCase().includes(p.toLowerCase()));
  if (poison) {
    return {
      structure,
      candidates: [],
      winnerVariantId: null,
      winner: null,
      crownPairId: null,
      veto: true,
      vetoReason: `🚫 وتوی قرمز مطلق v18.0: لیگ سمّی (${input.league}) — نوسان ساختاری بالا و غیرقابل مدل‌سازی؛ همه ۴ روش تک‌بازی وتو می‌شوند — انتقال به دفتر سایه (سطح ۳)`,
      tier: null,
    };
  }

  // اعمال ضریب اعتبار لیگ روی امتیاز کاندیدها (بازمحاسبه با reliability)
  // 🚫 رژیم زیان‌ده خوشه نتیجه دقیق (CORRECT_SCORE −۱۶u) طبق سند بازگشت v19.0 غیرفعال است
  const candidates: BetTypeCandidate[] = [
    ...buildBankerCandidates(input.matrix, input.prices, structure),
    ...buildComboCandidates(input.matrix, input.prices, structure),
    ...buildDualHedgeCandidates(input.pairs),
  ];
  for (const c of candidates) {
    const rescored = calculateNonLinearSupervisorScore({
      winProb: c.winProb,
      effectiveOdds: c.effectiveOdds,
      doubleWinProb: c.doubleWinProb,
      entropy: structure.entropy,
      leagueReliability: reliability,
    });
    c.sharpe = r2(rescored.sharpe);
    c.ev = r3(rescored.ev);
    c.score = rescored.score;
  }

  // ═══ v18.0 — گیت اختصاصی هر رژیم (Regime-Specific Supervisor Gate) ═══
  // وتوی ثابت λ_Fav/λ_Dog نسخه ۱۶ «قبل از مسیریابی» حذف شد؛ حالا رژیمِ برنده
  // گیت اختصاصی خودش را دارد (جدول سند v18.0) + سقف جهانی تاج طلایی:
  // ریسک ≤ ۱۱.۲٪ و شارپ ≥ ۰.۲۴.
  const fav = Math.max(input.lambdaHome, input.lambdaAway);
  const dog = Math.min(input.lambdaHome, input.lambdaAway);
  const riskPctOf = (c: BetTypeCandidate): number => c.jointLossProb * 100;

  /** گیت اختصاصی رژیم هر کاندید — جدول سند v18.0 */
  const regimeGatePass = (c: BetTypeCandidate): { pass: boolean; why: string } => {
    const riskPct = riskPctOf(c);
    switch (c.key) {
      case "CORRECT_SCORE":
        // 🚫 رژیم زیان‌ده خوشه نتیجه دقیق (−۱۶u) — سند بازگشت v19.0: غیرفعال
        return { pass: false, why: "رژیم خوشه نتیجه دقیق غیرفعال است (رژیم زیان‌ده −۱۶u سند بازگشت v19.0)" };
      case "COMBO":
        // مجاز برای λ_Fav ≥ 1.35 و λ_Dog ≤ 1.25 | شرط: پوشش کمبو ≥ ۷۸٪ و شارپ ≥ ۰.۲۲
        if (fav < COMBO_FAV_LAMBDA_MIN || dog > COMBO_DOG_LAMBDA_MAX) {
          return { pass: false, why: `λ خارج پنجره کمبو (λ_Fav=${fav.toFixed(2)} ≥ 1.35؟ λ_Dog=${dog.toFixed(2)} ≤ 1.25؟)` };
        }
        if (c.winProb < COMBO_COVERAGE_MIN_V18 || c.sharpe < COMBO_SHARPE_MIN_V18) {
          return { pass: false, why: `پوشش/شارپ کمبو کافی نیست (پوشش=${(c.winProb * 100).toFixed(0)}٪ ≥ ۷۸٪؟ شارپ=${c.sharpe.toFixed(2)} ≥ 0.22؟)` };
        }
        return { pass: true, why: "کمبوی رسمی — فاوریت کنترل‌گر با پوشش ≥ ۷۸٪" };
      case "BANKER":
        // مجاز برای rLambda ≥ 1.65 و احتمال پایه ≥ ۸۰٪
        if (structure.rLambda < BANKER_R_LAMBDA_MIN_V18 || c.mainProb < BANKER_BASE_PROB_MIN_V18) {
          return { pass: false, why: `عدم تقارن/احتمال پایه کافی نیست (Rλ=${structure.rLambda.toFixed(2)} ≥ 1.65؟ P=${(c.mainProb * 100).toFixed(0)}٪ ≥ ۸۰٪؟)` };
        }
        return { pass: true, why: "بنکر امن — فاوریت قاطع با عدم تقارن بالا" };
      case "DUAL_HEDGE": {
        // ═══ v19.0-restore — فیلتر طلایی ضریب همپوشانی مثبت (Strict Positive Overlap Return Filter) ═══
        // قانون آهنین: فقط بازی‌هایی تایید شوند که ضریب همپوشانی مثبت و قوی دارند —
        // impliedSum ≤ ۰.۸۶ · حاشیه تضمینی ≥ ۱۵٪ · ناحیه برد دوبل ≥ ۱۲٪ · ریسک تله ≤ ۱۱.۵٪
        const m = overlapMetricsOf(c.mainOdds, c.coverOdds ?? 1.01, c.doubleWinProb, c.jointLossProb);
        if (!m.hasPositiveOverlap) {
          return { pass: false, why: `فیلتر ضریب همپوشانی مثبت v19.0: ${m.failReason ?? ""} — وتو و انتقال به دفتر سایه` };
        }
        if (c.sharpe < DUAL_HEDGE_SHARPE_MIN_V18) {
          return { pass: false, why: `شارپ همپوشانی دوقلو ${c.sharpe.toFixed(2)} زیر کف ۰.۱۴ — انتقال به دفتر سایه` };
        }
        const dwProfit = c.doubleWinProfitUnits ?? 0;
        if (dwProfit > 0 && (dwProfit < OVERLAP_DOUBLE_WIN_PROFIT_MIN || dwProfit > OVERLAP_DOUBLE_WIN_PROFIT_MAX + 60)) {
          return { pass: false, why: `سود برد دوبل +${dwProfit.toFixed(1)}u خارج بازه هدف +۱۲۰..+۱۸۰ واحد ناحیه همپوشانی دو برد` };
        }
        return { pass: true, why: `همپوشانی دوقلو با ضریب موثر ${m.effectiveOverlapOdds.toFixed(2)}x و حاشیه تضمینی +${m.guaranteedOverlapMarginPct.toFixed(1)}٪ ≥ ۱۵٪ — برد دوبل +${dwProfit.toFixed(1)}u (تخصیص ۶۵/۳۵ + سپر دقیقه ۶۵)` };
      }
      default:
        return { pass: false, why: "رژیم نامشخص" };
    }
  };

  const riskCap = (c: BetTypeCandidate): boolean => riskPctOf(c) <= GOLD_RISK_PCT_MAX;
  const eliteValue = (c: BetTypeCandidate): boolean => c.ev > APPROVE_EV_MIN && c.sharpe > APPROVE_SHARPE_MIN;

  /** 👑 سطح ۱ — تاج طلایی: گیت اختصاصی رژیم + سقف جهانی ریسک + کف شارپ ۰.۱۴
   *  v19.0-restore — رژیم DUAL_HEDGE از مسیر فرار eliteValue معاف است: قانون آهنین
   *  «فیلتر ضریب همپوشانی مثبت» برای زوج‌تیپ‌های دوبال مطلق است (هیچ escape hatch ندارد). */
  const goldPass = (c: BetTypeCandidate): boolean =>
    riskCap(c) &&
    c.sharpe >= GOLD_SHARPE_MIN &&
    (c.key === "DUAL_HEDGE" ? regimeGatePass(c).pass : regimeGatePass(c).pass || eliteValue(c));

  /** 🥈 سطح ۲ — شکارچی آلفای سایه: winProb ≥ ۸۴٪ + شارپ ≥ ۰.۱۶ + ریسک ≤ ۱۵٪ (لیگ معتبر) */
  const silverPass = (c: BetTypeCandidate): boolean =>
    riskPctOf(c) <= HARD_RED_VETO_RISK_PCT &&
    c.winProb >= SILVER_WIN_PROB_MIN &&
    c.sharpe >= SILVER_SHARPE_MIN;

  // برچسب‌گذاری تاج همه کاندیدها (شفافیت کامل تصمیم سطح‌بندی‌شده)
  for (const c of candidates) {
    c.tier = goldPass(c) ? "GOLD" : silverPass(c) ? "SILVER" : null;
  }

  const gold = candidates.filter((c) => c.tier === "GOLD");
  const silver = candidates.filter((c) => c.tier === "SILVER");

  // 🚫 وتوی قرمز مطلق سطح ۳ — همه کاندیدها ریسک بالای ۱۵٪ دارند → فقط دفتر کاغذی
  if (candidates.length === 0 || (gold.length === 0 && silver.length === 0)) {
    const worstRisk = candidates.length > 0 ? Math.max(...candidates.map(riskPctOf)) : 0;
    const reason =
      candidates.length === 0
        ? "🛡️ گیت v19.0-restore: هیچ‌یک از رژیم‌های فعال (Banker / Combo / Dual-Hedge) کاندید ساختاری معتبری ساخت — بازی پرنوسان؛ انتقال به دفتر سایه"
        : worstRisk > HARD_RED_VETO_RISK_PCT
          ? `🚫 وتوی قرمز مطلق v18.0: کمترین سناریوی کیفیت ریسک ${worstRisk.toFixed(1)}٪ بالای سقف ۱۵٪ دارد — سطح ۳ (فقط تسویه کاغذی دفتر سایه)`
          : "🛡️ گیت v18.0: هیچ رژیمی گیت اختصاصی خود (جدول سند) و هیچ کاندیدی آستانه تاج نقره‌ای (winProb ≥ ۸۴٪ و شارپ ≥ ۰.۱۶) را پاس نکرد — انتقال به دفتر سایه";
    return {
      structure,
      candidates,
      winnerVariantId: null,
      winner: null,
      crownPairId: null,
      veto: true,
      vetoReason: reason,
      tier: null,
    };
  }

  // ═══ سطح‌بندی نهایی: تاج طلایی اولویت مطلق دارد؛ در نبود طلایی، بهترین نقره‌ای
  // به‌جای حبس در دفتر سایه با استیک نصف ۵۰ واحدی (Half-Kelly) منتشر می‌شود ═══
  const useSilver = gold.length === 0 && silver.length > 0;

  // ═══ v19.0 — توزیع متوازن ۵ رژیم (Multi-Regime Balanced Routing — سند جراحی v19.0) ═══
  // «کارت‌های تاییدشده بر اساس ویژگی‌های بازی بین هر ۵ رژیم توزیع شوند تا هر ۵ باکس
  // ویترین دارای کارت تسویه‌شده واقعی و سود مثبت باشد». استخر توزیع = طلایی‌ها +
  // کاندیدهایی که گیت اختصاصی رژیم خود + سقف ریسک + EV مثبت را پاس کرده‌اند (دکترین
  // v18: هر رژیم با گیت خودش قضاوت می‌شود — شارپ فقط معیار سطح تاج است).
  const regimeCounts = input.regimeCounts ?? {};
  const countOf = (k: BetTypeKey): number => regimeCounts[k] ?? 0;
  // سقف ریسک فقط برای رژیم‌هایی معنا دارد که jointLossProb «باخت همزمان دو تیپ» است؛
  // در 🎯 CORRECT_SCORE این عدد = احتمال وقوع هیچ نمره‌ای (~۵۰٪ — ذات داچینگ نتیجه دقیق)
  // است، نه ریسک ساختاری. کنترل کیفیت این رژیم گیت اختصاصی خودش (آنتروپی/Top4/λ) است.
  const balanceEligible = (c: BetTypeCandidate): boolean =>
    riskCap(c) && c.ev > APPROVE_EV_MIN && regimeGatePass(c).pass;
  const gateQualified = candidates.filter((c) => c.tier === null && balanceEligible(c));
  const pool = useSilver ? silver : gold.length > 0 ? [...gold, ...gateQualified] : gateQualified;
  const poolRegimes = [...new Set(pool.map((c) => c.key))];
  let best = pool.reduce((a, b) => (b.score > a.score ? b : a));
  if (poolRegimes.length > 1) {
    // سهمیه هر رژیم کم‌نمایت: تا minCount+4 (نمونه‌سازی کافی برای رگرسیون به EV مثبت)
    const minCount = Math.min(...poolRegimes.map(countOf));
    const underRep = poolRegimes.filter((k) => countOf(k) <= minCount + 4 && countOf(k) < countOf(best.key));
    if (underRep.length > 0) {
      // کف امتیاز مقطعی بین رژیم‌ها معنا ندارد (داچینگ نتیجه دقیق ذاتاً واریانس و شارپ
      // کمتری دارد اما گیت اختصاصی رژیم + EV مثبت + سقف ریسک آن را تایید کرده‌اند —
      // دکترین v18: «هر رژیم با گیت خودش قضاوت می‌شود»). بین رژیم‌های کم‌نمایت،
      // بالاترین امتیاز آن رژیم انتخاب می‌شود.
      const eligible = underRep
        .map((k) => pool.filter((c) => c.key === k).reduce((a, b) => (b.score > a.score ? b : a)))
        .sort((a, b) => b.score - a.score);
      if (eligible.length > 0) best = eligible[0];
    }
  }

  if (useSilver) {
    // 🥈 تاج نقره‌ای — استیک نصف‌شده ۵۰ واحدی به روش Half-Kelly
    const scale = 0.5;
    best.stakeMain = Math.round(best.stakeMain * scale * 10) / 10;
    best.stakeCover = Math.round(best.stakeCover * scale * 10) / 10;
    best.guaranteedProfitUnits = Math.round(best.guaranteedProfitUnits * scale * 10) / 10;
    best.rationale = `${best.rationale} — 🥈 تایید سطح ۲ (شکارچی آلفای سایه — استیک ایمن ۵۰ واحدی به روش Half-Kelly): winProb ${(best.winProb * 100).toFixed(1)}٪ و شارپ ${best.sharpe.toFixed(2)} در لیگ معتبر؛ به‌جای حبس در دفتر سایه با استیک نیم‌مقیاس منتشر می‌شود`;
    return {
      structure,
      candidates,
      winnerVariantId: best.variantId,
      winner: best,
      crownPairId: best.pairId ?? null,
      veto: false,
      vetoReason: null,
      tier: "SILVER",
    };
  }

  // قانون تایید هوشمند v17 (حفظ‌شده): شارپ ضعیف در بهترین روش → بررسی امکان تایید با روش دیگر
  if (best.sharpe < APPROVE_SHARPE_MIN || best.ev < APPROVE_EV_MIN) {
    const eliteEligible = gold.filter((c) => eliteValue(c));
    if (eliteEligible.length === 0) {
      // تایید مبنای سند — گیت اختصاصی رژیم برنده است
      return {
        structure,
        candidates,
        winnerVariantId: best.variantId,
        winner: best,
        crownPairId: best.pairId ?? null,
        veto: false,
        vetoReason: null,
        tier: "GOLD",
      };
    }
    const bestEligible = eliteEligible.reduce((a, b) => (b.score > a.score ? b : a));
    return {
      structure,
      candidates,
      winnerVariantId: bestEligible.variantId,
      winner: bestEligible,
      crownPairId: bestEligible.pairId ?? null,
      veto: false,
      vetoReason: null,
      tier: "GOLD",
    };
  }

  return {
    structure,
    candidates,
    winnerVariantId: best.variantId,
    winner: best,
    crownPairId: best.pairId ?? null,
    veto: false,
    vetoReason: null,
    tier: "GOLD",
  };
}

// ═══════════════════════════════ 🔗 ACCUMULATOR ═══════════════════════════════

/** یک پای Accumulator — از بنکرها/کمبوهای تاییدشده بهترین بازی‌های روز */
export interface AccumulatorLeg {
  matchId: string;
  matchLabel: string;
  league: string;
  kickoff: string;
  tip: string;
  tipEn: string;
  odds: number;
  betType: BetTypeKey;
}

export type AccumulatorKind = "TWO_FOLD_BANKER" | "THREE_FOLD_COMBO" | "TIME_STAGGERED";

export interface AccumulatorSlip {
  id: string;
  kind: AccumulatorKind;
  labelFa: string;
  labelEn: string;
  icon: string;
  legs: AccumulatorLeg[];
  totalOdds: number;
  /** استیک بهینه بر اساس معیار کلِی همزمان (واحد) */
  stake: number;
  hitRatePct: number;
  potentialReturn: number;
  /** فرمول محاسبه مبلغ پوشش زنده پای آخر (Time-Staggered) */
  hedgeNote?: string;
  hedgeTargetLabel?: string;
  hedgeTargetOdds?: number;
  hedgeStake?: number;
  lockedProfitIfHedged?: number;
}

/**
 * 🔗 سازنده سه برگه میکس زنجیره‌ای از بهترین بنکرها/کمبوهای تاییدشده روز:
 *  ۱) 2-Fold Banker Accumulator — ترکیب ۲ پایه Banker (ضریب کل ۲.۱۰..۲.۵۵، نرخ اصابت > ۸۰٪)
 *  ۲) 3-Fold Pro Combo Accumulator — ترکیب ۳ پایه قوی Banker/Combo (ضریب کل ۳.۶۰..۵.۴۰)
 *  ۳) Time-Staggered Hedged Accumulator — میکس ۳ بازی با ساعت شروع متفاوت +
 *     فرمول محاسبه مبلغ پوشش زنده پای آخر (Cash-Out / Final-Leg Hedge).
 * استیک بهینه با معیار کلِی همزمان (Simultaneous Kelly fraction × ۱۰۰).
 */
export function buildAccumulators(
  winners: { matchId: string; matchLabel: string; league: string; kickoff: string; candidate: BetTypeCandidate }[]
): AccumulatorSlip[] {
  const bankers = winners.filter((w) => w.candidate.key === "BANKER");
  const comboOrBanker = winners.filter((w) => w.candidate.key === "BANKER" || w.candidate.key === "COMBO");
  const out: AccumulatorSlip[] = [];

  const legOf = (w: (typeof winners)[number]): AccumulatorLeg => ({
    matchId: w.matchId,
    matchLabel: w.matchLabel,
    league: w.league,
    kickoff: w.kickoff,
    // v17.0 — پای زوج‌تیپ: کل پوزیشن داچینگ‌شده با «ضریب موثر» و «پوشش کل» لحاظ می‌شود
    tip: w.candidate.key === "DUAL_HEDGE" ? `${w.candidate.mainLabel} ↔ ${w.candidate.coverLabel ?? ""}` : w.candidate.mainLabel,
    tipEn: w.candidate.key === "DUAL_HEDGE" ? "Dual-Hedge Effective Position" : w.candidate.mainLabelEn,
    odds: w.candidate.key === "DUAL_HEDGE" ? w.candidate.effectiveOdds : w.candidate.mainOdds,
    betType: w.candidate.key,
  });

  // ۱) 2-Fold Banker Accumulator
  if (bankers.length >= 2) {
    const legs = [legOf(bankers[0]), legOf(bankers[1])];
    const totalOdds = r2(legs.reduce((s, l) => s * l.odds, 1));
    const hit = bankers[0].candidate.mainProb * bankers[1].candidate.mainProb;
    // کلِی همزمان: f* ≈ (p·b − q)/b × نیم‌کِلی محافظه‌کار برای میکس چندپایه
    const b = totalOdds - 1;
    const f = Math.max(0.015, Math.min(0.06, (hit * b - (1 - hit)) / b * 0.5));
    out.push({
      id: "ACC-2F",
      kind: "TWO_FOLD_BANKER",
      labelFa: "میکس زنجیره‌ای ۲ پایه بنکر امن (2-Fold Banker Accumulator)",
      labelEn: "2-Fold Banker Accumulator",
      icon: "🔗",
      legs,
      totalOdds,
      stake: Math.round(f * 1000) / 10,
      hitRatePct: Math.round(hit * 1000) / 10,
      potentialReturn: Math.round(f * totalOdds * 10) / 10,
    });
  } else if (winners.length >= 2) {
    // v17.0 — fallback: قوی‌ترین پایه‌های تاییدشده روز (هر Bet-Type)
    const legs = [legOf(winners[0]), legOf(winners[1])];
    const totalOdds = r2(legs.reduce((s, l) => s * l.odds, 1));
    const legProb = (w: (typeof winners)[number]) => (w.candidate.key === "DUAL_HEDGE" ? w.candidate.winProb : w.candidate.mainProb);
    const hit = legProb(winners[0]) * legProb(winners[1]);
    const b = totalOdds - 1;
    const f = Math.max(0.01, Math.min(0.045, (hit * b - (1 - hit)) / b * 0.5));
    const kinds = [...new Set(winners.slice(0, 2).map((w) => w.candidate.icon + " " + w.candidate.key))].join(" + ");
    out.push({
      id: "ACC-2F",
      kind: "TWO_FOLD_BANKER",
      labelFa: `میکس زنجیره‌ای ۲ پایه تاییدشده روز (${kinds})`,
      labelEn: "2-Fold Smart Accumulator",
      icon: "🔗",
      legs,
      totalOdds,
      stake: Math.round(f * 1000) / 10,
      hitRatePct: Math.round(hit * 1000) / 10,
      potentialReturn: Math.round(f * totalOdds * 10) / 10,
    });
  }

  // ۲) 3-Fold Pro Combo Accumulator
  if (comboOrBanker.length >= 3) {
    const legs = comboOrBanker.slice(0, 3).map(legOf);
    const totalOdds = r2(legs.reduce((s, l) => s * l.odds, 1));
    const hit = comboOrBanker.slice(0, 3).reduce((s, w) => s * w.candidate.mainProb, 1);
    const b = totalOdds - 1;
    const f = Math.max(0.008, Math.min(0.035, (hit * b - (1 - hit)) / b * 0.5));
    out.push({
      id: "ACC-3F",
      kind: "THREE_FOLD_COMBO",
      labelFa: "میکس حرفه‌ای ۳ پایه بنکر/کمبو (3-Fold Pro Combo Accumulator)",
      labelEn: "3-Fold Pro Combo Accumulator",
      icon: "🔗",
      legs,
      totalOdds,
      stake: Math.round(f * 1000) / 10,
      hitRatePct: Math.round(hit * 1000) / 10,
      potentialReturn: Math.round(f * totalOdds * 10) / 10,
    });
  } else if (winners.length >= 3) {
    const legs = winners.slice(0, 3).map(legOf);
    const totalOdds = r2(legs.reduce((s, l) => s * l.odds, 1));
    const hit = winners.slice(0, 3).reduce((s, w) => s * (w.candidate.key === "DUAL_HEDGE" ? w.candidate.winProb : w.candidate.mainProb), 1);
    const b = totalOdds - 1;
    const f = Math.max(0.006, Math.min(0.025, (hit * b - (1 - hit)) / b * 0.5));
    out.push({
      id: "ACC-3F",
      kind: "THREE_FOLD_COMBO",
      labelFa: "میکس حرفه‌ای ۳ پایه تاییدشده روز (3-Fold Pro Accumulator)",
      labelEn: "3-Fold Pro Accumulator",
      icon: "🔗",
      legs,
      totalOdds,
      stake: Math.round(f * 1000) / 10,
      hitRatePct: Math.round(hit * 1000) / 10,
      potentialReturn: Math.round(f * totalOdds * 10) / 10,
    });
  }

  // ۳) Time-Staggered Hedged Accumulator — ۳ بازی با ساعت شروع متفاوت
  const staggerPool = comboOrBanker.length >= 3 ? comboOrBanker : winners;
  if (staggerPool.length >= 3) {
    const sorted = [...staggerPool].sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());
    // سه پای با بیشترین فاصله ساعت شروع
    const picked = [sorted[0], sorted[Math.floor(sorted.length / 2)], sorted[sorted.length - 1]];
    const distinctHours = new Set(picked.map((p) => new Date(p.kickoff).getHours())).size;
    if (distinctHours >= 2) {
      const legs = picked.map(legOf);
      const totalOdds = r2(legs.reduce((s, l) => s * l.odds, 1));
      const stake = 30;
      const payoutIfFirstTwoWin = stake * legs[0].odds * legs[1].odds;
      // فرمول پوشش پای آخر: مبلغ شرط مقابل = (پرداخت فعلی − سود قفل‌شده هدف) ÷ ضریب مقابل
      const hedgeTargetOdds = Math.max(1.4, Math.round(1 / (1 - 1 / legs[2].odds) * 100) / 100);
      const lockedProfit = Math.round(payoutIfFirstTwoWin * 0.35 * 10) / 10;
      const hedgeStake = Math.round(((payoutIfFirstTwoWin - lockedProfit) / hedgeTargetOdds) * 10) / 10;
      const hit = picked.reduce((s, w) => s * (w.candidate.key === "DUAL_HEDGE" ? w.candidate.winProb : w.candidate.mainProb), 1);
      out.push({
        id: "ACC-TS",
        kind: "TIME_STAGGERED",
        labelFa: "میکس پله‌زمانی با پوشش زنده پای آخر (Time-Staggered Hedged Accumulator)",
        labelEn: "Time-Staggered Hedged Accumulator",
        icon: "🔗",
        legs,
        totalOdds,
        stake,
        hitRatePct: Math.round(hit * 1000) / 10,
        potentialReturn: Math.round(stake * totalOdds * 10) / 10,
        hedgeNote: `اگر ۲ بازی اول بردند، پیش از شروع بازی سوم: شرط مقابل «${legs[2].tipEn}» به مبلغ ${hedgeStake} واحد با ضریب ~${hedgeTargetOdds.toFixed(2)}x ببندید → سود قفل‌شده ~${lockedProfit} واحد در هر دو سناریو`,
        hedgeTargetLabel: "مقابل تیپ پای آخر (مثلاً X2 یا زیر گل)",
        hedgeTargetOdds,
        hedgeStake,
        lockedProfitIfHedged: lockedProfit,
      });
    }
  }

  return out;
}
