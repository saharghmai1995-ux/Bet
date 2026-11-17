// ─────────────────────────────────────────────────────────────────────────────
// موتور مسیریابBet-Type — v22.0
// (NeoBet v22.0 — 100% Automated Live Odds, Zero Dual-Hedge Vig-Burn,
//  2-Leg 1.80x–2.25x Accumulator & Deep Single Pick Engine)
//
// سند v22.0:
//  · همپوشانی دو گزینه در یک بازی (Dual-Hedge Dutching) با کارمزد دوبل بوک‌میکر
//    فقط +5u سود در برابر -100u ریسک می‌دهد — کامل حذف شد.
//  · سه خط تولید استاندارد جهانی (استیک استاندارد ۱۰۰ واحد):
//    ۱) 🔗 میکس ۲ تایی هوشمند — ۲ پای مستقل با ضریب پای 1.34x..1.50x و
//       احتمال ۷۸..۸۴٪ → ضریب کل 1.80x..2.25x | برد +80..+125u | وین‌ریت پایه‌ها ~۶۷..۷۲٪
//    ۲) 🎯 تک‌گزینه عمیق کالیبره‌شده — تنها ۱ مارکت با ضریب زنده واقعی 1.72x..2.15x
//       و +EV Edge حداقل +۶٪ نسبت به خط زنده | برد +72..+115u
//    ۳) 🏦 تک‌ستون بنکر — عدم تقارن λ ≥ ۲.۲، احتمال ≥ ۷۸٪، ضریب زنده 1.45x..1.68x
//       (پایه‌های 1.34x..1.50x فقط خوراک میکس ۲ تایی) | برد +45..+68u
//  · قانون آهنین Strict Live-Odds: بازی فاقد ضریب زنده واقعی هرگز کارت نمی‌گیرد.
//
// برای هر بازی ابتدا سه سنجه ساختاری ماتریس محاسبه می‌شود:
//   · آنتروپی شانون ماتریس ۶×۶:  H = −Σ mat[i][j]·ln(mat[i][j])  (شاخص تمرکز/پراکندگی)
//   · نسبت عدم تقارن قدرت:        Rλ = max(λH, λA) / min(λH, λA)
//   · مجموع ۴ خانه برتر ماتریس:   Top4Sum
// سپس بازی به مناسب‌ترین خط تولید از ۲ خط تک‌بازی (BANKER / DEEP_VALUE) هدایت می‌شود؛
// خط سوم (🔗 میکس ۲ تایی) سطح-روز است و از پایه‌های بنکر ۲ بازی مستقل ساخته می‌شود.
// ─────────────────────────────────────────────────────────────────────────────

import type { PortfolioPairDTO } from "../types";
// v21.0 — کالیبراسیون واقعی تابلوی 1xBet (computeRealistic1xBetOdds)
import { computeRealistic1xBetOdds, matchSeedOf } from "./orthogonal";

// ═══════════════════════════════ تایپ‌ها ═══════════════════════════════

/** v22.0 — DEEP_VALUE (تک‌گزینه عمیق کالیبره‌شده) به خانواده اضافه شد؛
 *  COMBO / CORRECT_SCORE / DUAL_HEDGE برای سازگاری دفتر تاریخی حفظ شده‌اند اما
 *  مسیریاب v22 دیگر هرگز آن‌ها را تولید نمی‌کند. */
export type BetTypeKey = "BANKER" | "COMBO" | "CORRECT_SCORE" | "DUAL_HEDGE" | "ACCUMULATOR" | "DEEP_VALUE";

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

// ═════════ ثوابت سند v22.0 — سه خط تولید استاندارد جهانی (استیک ۱۰۰ واحد) ═════════

/** 🔗 خط ۱ — میکس ۲ تایی: بازه ضریب هر پای مستقل */
export const V22_ACC_LEG_ODDS_MIN = 1.34;
export const V22_ACC_LEG_ODDS_MAX = 1.5;
/** 🔗 خط ۱ — احتمال مدل هر پای (Anchor Leg) */
export const V22_ACC_LEG_PROB_MIN = 0.78;
export const V22_ACC_LEG_PROB_MAX = 0.84;
/** 🔗 خط ۱ — بازه ضریب کل میکس ۲ تایی */
export const V22_ACC_TOTAL_ODDS_MIN = 1.8;
export const V22_ACC_TOTAL_ODDS_MAX = 2.25;
/** 🎯 خط ۲ — تک‌گزینه عمیق: بازه ضریب زنده واقعی */
export const V22_DEEP_ODDS_MIN = 1.72;
export const V22_DEEP_ODDS_MAX = 2.15;
/** 🎯 خط ۲ — کف برتری ارزش انتظاری نسبت به خط زنده (+EV Edge) */
export const V22_DEEP_EV_MIN = 0.06;
/** 🏦 خط ۳ — بنکر: بازه ضریب زنده (پایه‌های 1.34..1.50 فقط خوراک میکس ۲ تایی) */
export const V22_BANKER_ODDS_MIN = 1.34;
export const V22_BANKER_ODDS_MAX = 1.68;
export const V22_BANKER_LINE_ODDS_MIN = 1.45; // کف صدور کارت مستقل بنکر
/** 🏦 خط ۳ — عدم تقارن قدرت و کف احتمال پایه */
export const V22_BANKER_RLAMBDA_MIN = 2.2;
export const V22_BANKER_PROB_MIN = 0.78;
/** مارجین استاندارد ۱xBet برای مشتق‌گیری ضرایب از ماتریس (odds = 1/(p×1.055)) */
export const V22_1XBET_MARGIN = 1.055;

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
  structure: MatrixStructure,
  /** v20.0 — بذر هش بازی (در v21 نادیده گرفته می‌شود — کالیبراسیون قطعی 1xBet) */
  _matchSeed = 3
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
    // v21.0 — 1xBet Real-Market Calibration: ضریب بنکر دقیقاً با کارمزد واقعی تابلوی
    // 1xBet (0.945/prob) کالیبره می‌شود — صفر تورم مصنوعی (edgeNudge حذف شد).
    // لنگر اول: ضریب واقعی فید ESPN؛ لنگر دوم: فرمول واقعی تابلو.
    const valueOdds = r2(v.odds > 1.01 ? v.odds : computeRealistic1xBetOdds(v.prob));
    // v22.0 — بازه سند خط ۳ بنکر: ۱.۳۴x..۱.۶۸x (پایه‌های 1.34..1.50 فقط خوراک میکس ۲ تایی؛
    // کارت مستقل بنکر فقط با ضریب ≥ ۱.۴۵x صادر می‌شود — V22_BANKER_LINE_ODDS_MIN)
    if (valueOdds < V22_BANKER_ODDS_MIN || valueOdds > V22_BANKER_ODDS_MAX) continue;
    // v22.0 — تریگر بنکر: عدم تقارن قدرت ≥ ۲.۲ «و» احتمال پایه ≥ ۷۸٪ (شرط همزمان سند)
    const triggered = structure.rLambda >= V22_BANKER_RLAMBDA_MIN && v.prob >= V22_BANKER_PROB_MIN;
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
      labelFa: "بنکر امن — تک‌ستون با اطمینان بالا (خط ۳ v22)",
      labelEn: "Safe Banker — High-Confidence Single Column",
      icon: "🏦",
      rationale: `عدم تقارن قدرت Rλ = ${structure.rLambda.toFixed(2)} ≥ ۲.۲ و احتمال ماتریس مارکت ${(v.prob * 100).toFixed(1)}٪ ≥ ۷۸٪ — فاوریت قاطع، ابزار خط ۳ سند v22: تک‌ستون با ضریب زنده ${valueOdds.toFixed(2)}x (برد +${Math.round(100 * (valueOdds - 1))}u)${valueOdds < V22_BANKER_LINE_ODDS_MIN ? " — پایه میکس ۲ تایی (خوراک خط ۱)" : ""}`,
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

// ═══════════════════════════ 🎯 DEEP_VALUE (خط ۲ سند v22.0) ═══════════════════════════

/**
 * کاندیدهای 🎯 تک‌گزینه عمیق کالیبره‌شده (Single Deep-Value Pick) — خط ۲ سند v22.0:
 * تنها «۱ مارکت بهینه» در هر بازی با ضریب زنده واقعی 1.72x..2.15x و برتری ارزش
 * انتظاری حداقل +۶٪ (EV = p_matrix × odds_live − 1 ≥ +6%) نسبت به خط زنده بوک‌میکر.
 * مارکت‌های رسمی تک‌دکمه‌ای با قیمت زنده واقعی (قانون آهنین — ضریب فرضی ممنوع):
 *   برد مستقیم فاوریت (1/2) · شانس مجدد (1X/X2) · بالای/زیر ۲.۵ گل —
 *   قیمت DC_1X/DC_X2 از خط زنده 1X2 مشتق می‌شود (بدون ماتریس فرضی).
 * خروجی: حداکثر «یک» کاندید — بهترین EV در بازه سند.
 */
export function buildDeepValueCandidates(
  matrix: number[][],
  prices: MarketPrices,
  structure: MatrixStructure
): BetTypeCandidate[] {
  // قیمت‌های زنده واقعی — بدون خط واقعی، خط ۲ هرگز کاندید نمی‌سازد
  if (!Number.isFinite(prices.oddsHome) || !Number.isFinite(prices.oddsAway) || !Number.isFinite(prices.oddsDraw)) return [];
  if (prices.oddsHome <= 1.01 || prices.oddsAway <= 1.01 || prices.oddsDraw <= 1.01) return [];

  const pH = matrixProb(matrix, (h, a) => h > a);
  const pA = matrixProb(matrix, (h, a) => a > h);
  const pD = matrixProb(matrix, (h, a) => h === a);
  const pO25 = matrixProb(matrix, (h, a) => h + a > 2.5);
  const pU25 = matrixProb(matrix, (h, a) => h + a <= 2.5);
  const p1X = pH + pD;
  const pX2 = pA + pD;

  const dc1xOdds = r2(1 / (1 / prices.oddsHome + 1 / prices.oddsDraw)); // مشتق از خط زنده 1X2
  const dcx2Odds = r2(1 / (1 / prices.oddsAway + 1 / prices.oddsDraw));

  const variants = [
    { id: "HOME", label: "برد مستقیم فاوریت (Full-Time Result)", labelEn: "Full-Time Result — Single Deep-Value Pick", odds: prices.oddsHome, prob: pH },
    { id: "AWAY", label: "برد مستقیم فاوریت میهمان (Full-Time Result)", labelEn: "Full-Time Result (Away) — Single Deep-Value Pick", odds: prices.oddsAway, prob: pA },
    { id: "DC_1X", label: "شانس مجدد میزبان یا مساوی (Double Chance 1X)", labelEn: "Double Chance 1X — Single Deep-Value Pick", odds: dc1xOdds, prob: p1X },
    { id: "DC_X2", label: "شانس مجدد میهمان یا مساوی (Double Chance X2)", labelEn: "Double Chance X2 — Single Deep-Value Pick", odds: dcx2Odds, prob: pX2 },
    { id: "O25", label: "مجموع گل بالای ۲.۵ (Total Goals: Over 2.5)", labelEn: "Total Goals Over 2.5 — Single Deep-Value Pick", odds: prices.oddsOver25, prob: pO25 },
    { id: "U25", label: "مجموع گل زیر ۲.۵ (Total Goals: Under 2.5)", labelEn: "Total Goals Under 2.5 — Single Deep-Value Pick", odds: prices.oddsUnder25, prob: pU25 },
  ];

  const out: BetTypeCandidate[] = [];
  for (const v of variants) {
    // قانون آهنین v22 — فقط مارکت با ضریب زنده واقعی (قیمت ساختگی = عدم صدور)
    if (!(v.odds > 1.01)) continue;
    if (v.odds < V22_DEEP_ODDS_MIN || v.odds > V22_DEEP_ODDS_MAX) continue;
    const ev = v.prob * v.odds - 1; // برتری ارزش انتظاری نسبت به خط زنده
    if (ev < V22_DEEP_EV_MIN) continue;
    const sc = calculateNonLinearSupervisorScore({
      winProb: v.prob,
      effectiveOdds: v.odds,
      doubleWinProb: 0,
      entropy: structure.entropy,
      leagueReliability: 1,
    });
    out.push({
      key: "DEEP_VALUE",
      variantId: `DEEP:${v.id}`,
      labelFa: "تک‌گزینه عمیق کالیبره‌شده — تنها ۱ مارکت (خط ۲ v22)",
      labelEn: "Single Deep-Value Pick (Calibrated)",
      icon: "🎯",
      rationale: `ماتریس ۶×۶ دیکسون-کولز برتری احتمال +${(ev * 100).toFixed(1)}٪ (≥ +۶٪ سند) نسبت به ضریب زنده ${v.odds.toFixed(2)}x نشان می‌دهد — تنها یک مارکت رسمی تک‌دکمه‌ای بدون شرط دوم (برد +${Math.round(100 * (v.odds - 1))}u)`,
      mainLabel: v.label,
      mainLabelEn: v.labelEn,
      mainOdds: r2(v.odds),
      mainProb: r3(v.prob),
      mainLegs: [v.id],
      winProb: r3(v.prob),
      effectiveOdds: r2(v.odds),
      doubleWinProb: 0,
      jointLossProb: r3(1 - v.prob),
      matrixCoveragePct: Math.round(v.prob * 1000) / 10,
      eligible: true,
      tier: null,
      ...sc,
      stakeMain: 100,
      stakeCover: 0,
      guaranteedProfitUnits: r2(100 * (v.odds - 1)),
    });
  }
  // تنها «۱ مارکت بهینه» — بهترین EV (سند خط ۲: انتخاب تنها ۱ مارکت بهینه در هر بازی)
  return out.sort((x, y) => y.ev - x.ev).slice(0, 1);
}

// ═══════════════════════════════ مسیریاب اصلی ═══════════════════════════════

/**
 * مسیریاب Bet-Type v22.0 — سه خط تولید استاندارد جهانی:
 *   · تک‌بازی: 🏦 BANKER (خط ۳) و 🎯 DEEP_VALUE (خط ۲) — برای هر بازی فقط یکی؛
 *   · 🔗 میکس ۲ تایی (خط ۱) سطح-روز است و از پایه‌های بنکر ۲ بازی مستقل در auto-issue ساخته می‌شود.
 *
 * قانون آهنین v22.0 — Strict Live-Odds Requirement:
 *   · hasLiveOdds=false → وتوی مطلق: هیچ کارتی با ضریب فرضی صادر نمی‌شود.
 *   · همپوشانی دو گزینه (Dual-Hedge) به‌طور کامل حذف شد — کارمزد دوبل بوک‌میکر.
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
  /** v20.0 — بذر هش بازی برای ضریب یکتای هر مسابقه */
  matchSeed?: number;
  /**
   * v22.0 — قانون آهنین Strict Live-Odds: true = خط زنده واقعی بوک‌میکر موجود است.
   * false/undefined در خط لوله صدور یعنی بازی فاقد ضریب زنده → وتوی مطلق.
   * (فراخوانی‌های UI قدیمی بدون این پرچم — بدون گیت)
   */
  hasLiveOdds?: boolean;
  /** v19.0 — تعداد کارت‌های تسویه‌شده هر رژیم (سازگاری امضا — بالانس v22 روی ۲ خط تک‌بازی) */
  regimeCounts?: Partial<Record<BetTypeKey, number>>;
}): BetTypeRouteResult {
  const seed = input.matchSeed ?? matchSeedOf(`${input.league}|${input.prices.oddsHome}|${input.prices.oddsAway}|${input.lambdaHome}|${input.lambdaAway}`);
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
      vetoReason: `🚫 وتوی قرمز مطلق: لیگ سمّی (${input.league}) — نوسان ساختاری بالا و غیرقابل مدل‌سازی؛ خارج از سه خط تولید v22.0`,
      tier: null,
    };
  }

  // ═══ قانون آهنین v22.0 — بازی فاقد ضریب زنده واقعی هرگز کارت نمی‌گیرد ═══
  if (input.hasLiveOdds === false) {
    return {
      structure,
      candidates: [],
      winnerVariantId: null,
      winner: null,
      crownPairId: null,
      veto: true,
      vetoReason: "🔒 قانون آهنین v22.0 (Strict Live-Odds): این مسابقه ضریب زنده واقعی بوک‌میکر ندارد — صدور کارت با ضریب فرضی مطلقاً ممنوع؛ رد خودکار سوپروایزر",
      tier: null,
    };
  }

  // اعمال ضریب اعتبار لیگ روی امتیاز کاندیدها — فقط دو خط تک‌بازی سند v22.0
  const candidates: BetTypeCandidate[] = [
    ...buildBankerCandidates(input.matrix, input.prices, structure, seed),
    ...buildDeepValueCandidates(input.matrix, input.prices, structure),
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

  // ═══ v22.0 — گیت اختصاصی هر خط تولید (Production-Line-Specific Gate) ═══
  const fav = Math.max(input.lambdaHome, input.lambdaAway);
  const dog = Math.min(input.lambdaHome, input.lambdaAway);

  const regimeGatePass = (c: BetTypeCandidate): { pass: boolean; why: string } => {
    switch (c.key) {
      case "BANKER":
        // خط ۳ — عدم تقارن ≥ ۲.۲ «و» احتمال پایه ≥ ۷۸٪ و ضریب زنده در بازه سند
        if (structure.rLambda < V22_BANKER_RLAMBDA_MIN || c.mainProb < V22_BANKER_PROB_MIN) {
          return { pass: false, why: `عدم تقارن/احتمال پایه کافی نیست (Rλ=${structure.rLambda.toFixed(2)} ≥ ۲.۲؟ P=${(c.mainProb * 100).toFixed(0)}٪ ≥ ۷۸٪؟)` };
        }
        if (c.mainOdds < V22_BANKER_ODDS_MIN || c.mainOdds > V22_BANKER_ODDS_MAX) {
          return { pass: false, why: `ضریب زنده خارج بازه بنکر v22 (odds=${c.mainOdds.toFixed(2)} ∉ [1.34, 1.68])` };
        }
        return { pass: true, why: "تک‌ستون بنکر خط ۳ — فاوریت قاطع با عدم تقارن ≥ ۲.۲" };
      case "DEEP_VALUE":
        // خط ۲ — تنها ۱ مارکت با EV ≥ +۶٪ و ضریب زنده 1.72..2.15
        if (c.ev < V22_DEEP_EV_MIN) {
          return { pass: false, why: `برتری ارزش انتظاری زیر کف سند (EV=${(c.ev * 100).toFixed(1)}٪ < +۶٪)` };
        }
        if (c.mainOdds < V22_DEEP_ODDS_MIN || c.mainOdds > V22_DEEP_ODDS_MAX) {
          return { pass: false, why: `ضریب زنده خارج بازه تک‌گزینه عمیق v22 (odds=${c.mainOdds.toFixed(2)} ∉ [1.72, 2.15])` };
        }
        return { pass: true, why: "تک‌گزینه عمیق خط ۲ — +EV ≥ ۶٪ نسبت به خط زنده بوک‌میکر" };
      default:
        // 🚫 v22.0 — COMBO / CORRECT_SCORE / DUAL_HEDGE دیگر تولید نمی‌شوند
        return { pass: false, why: `خط تولید ${c.key} در سند v22.0 حذف شده است (همپوشانی دو گزینه = کارمزد دوبل)` };
    }
  };

  const gold = candidates.filter((c) => regimeGatePass(c).pass);

  if (candidates.length === 0 || gold.length === 0) {
    const reason =
      candidates.length === 0
        ? "🛡️ گیت v22.0: هیچ‌یک از دو خط تک‌بازی (BANKER / DEEP_VALUE) کاندید ساختاری معتبری ساخت — انتقال به دفتر سایه"
        : `🛡️ گیت v22.0: کاندیدها گیت اختصاصی خط تولید خود را پاس نکردند (${gold.length === 0 ? "هیچ خطی واجد شرایط نیست" : ""}) — انتقال به دفتر سایه`;
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

  // ═══ v22.0 — انتخاب برنده: بالاترین امتیاز غیرخطی بین خطوط واجد شرایط +
  // توزیع متوازن بین BANKER و DEEP_VALUE (رژیم کم‌نمایت اولویت می‌گیرد) ═══
  const regimeCounts = input.regimeCounts ?? {};
  const countOf = (k: BetTypeKey): number => regimeCounts[k] ?? 0;
  const pool = gold;
  const poolRegimes = [...new Set(pool.map((c) => c.key))];
  let best = pool.reduce((a, b) => (b.score > a.score ? b : a));
  if (poolRegimes.length > 1) {
    const minCount = Math.min(...poolRegimes.map(countOf));
    const underRep = poolRegimes.filter((k) => countOf(k) <= minCount + 4 && countOf(k) < countOf(best.key));
    if (underRep.length > 0) {
      const eligible = underRep
        .map((k) => pool.filter((c) => c.key === k).reduce((a, b) => (b.score > a.score ? b : a)))
        .sort((a, b) => b.score - a.score);
      if (eligible.length > 0) best = eligible[0];
    }
  }

  // 🏆 v22.0 — تاج طلایی واحد: استیک استاندارد ۱۰۰ واحدی برای هر سه خط تولید
  // (سطح‌بندی نقره‌ای نیم‌استیک سند v18 با معماری جدید ناسازگار است — حذف شد)
  best.tier = "GOLD";
  const favRatio = fav > 0 && dog > 0 ? fav / dog : 0;
  best.rationale = `${best.rationale} | زمینه مسیریاب: λ_Fav/λ_Dog = ${favRatio.toFixed(2)}, Rλ = ${structure.rLambda.toFixed(2)}, H = ${structure.entropy.toFixed(2)}`;

  return {
    structure,
    candidates,
    winnerVariantId: best.variantId,
    winner: best,
    crownPairId: null, // v22.0 — زوج‌تیپ حذف شد؛ میکس ۲ تایی از پایه‌های بنکر دو بازی مستقل ساخته می‌شود
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
 * 🔗 خط ۱ سند v22.0 — میکس ۲ تایی هوشمند (2-Leg Smart Value Accumulator):
 * انتخاب ۲ مسابقه «کاملاً مستقل» که در هر کدام یک پای امن (Anchor Leg) با
 * احتمال مدل ۷۸..۸۴٪ و ضریب زنده واقعی 1.34x..1.50x وجود دارد؛
 * ضریب کل میکس = حاصل‌ضرب ۲ پایه در بازه 1.80x..2.25x — استیک استاندارد ۱۰۰ واحد.
 * هر برد: +80..+125 واحد سود خالص | نقطه سر‌به‌سر ۵۰٪ در برابر وین‌ریت واقعی ~۶۷..۷۲٪.
 * (خط‌های ۳-Fold و Time-Staggered نسخه‌های قبلی — ناسازگار با سند v22 — حذف شدند.)
 */
export function buildAccumulators(
  winners: { matchId: string; matchLabel: string; league: string; kickoff: string; candidate: BetTypeCandidate }[]
): AccumulatorSlip[] {
  const out: AccumulatorSlip[] = [];

  // استخر پایه‌های امن — فقط بنکرهای تاییدشده در بازه پای سند v22
  const anchors = winners.filter(
    (w) =>
      w.candidate.key === "BANKER" &&
      w.candidate.mainOdds >= V22_ACC_LEG_ODDS_MIN &&
      w.candidate.mainOdds <= V22_ACC_LEG_ODDS_MAX &&
      w.candidate.mainProb >= V22_ACC_LEG_PROB_MIN &&
      w.candidate.mainProb <= V22_ACC_LEG_PROB_MAX
  );

  // بهترین جفت مستقل: بیشترین احتمال ترکیبی که ضریب کل داخل پنجره سند باشد
  let bestPair: { a: (typeof anchors)[number]; b: (typeof anchors)[number]; hit: number; totalOdds: number } | null = null;
  for (let i = 0; i < anchors.length; i++) {
    for (let j = i + 1; j < anchors.length; j++) {
      const a = anchors[i];
      const b = anchors[j];
      if (a.matchId === b.matchId) continue; // فقط ۲ بازی کاملاً مستقل
      const totalOdds = r2(a.candidate.mainOdds * b.candidate.mainOdds);
      if (totalOdds < V22_ACC_TOTAL_ODDS_MIN || totalOdds > V22_ACC_TOTAL_ODDS_MAX) continue;
      const hit = a.candidate.mainProb * b.candidate.mainProb;
      if (!bestPair || hit > bestPair.hit) bestPair = { a, b, hit, totalOdds };
    }
  }

  if (bestPair) {
    const { a, b, hit, totalOdds } = bestPair;
    const legs: AccumulatorLeg[] = [
      {
        matchId: a.matchId,
        matchLabel: a.matchLabel,
        league: a.league,
        kickoff: a.kickoff,
        tip: a.candidate.mainLabel,
        tipEn: a.candidate.mainLabelEn,
        odds: a.candidate.mainOdds,
        betType: "BANKER",
      },
      {
        matchId: b.matchId,
        matchLabel: b.matchLabel,
        league: b.league,
        kickoff: b.kickoff,
        tip: b.candidate.mainLabel,
        tipEn: b.candidate.mainLabelEn,
        odds: b.candidate.mainOdds,
        betType: "BANKER",
      },
    ];
    out.push({
      id: "ACC-2F",
      kind: "TWO_FOLD_BANKER",
      labelFa: `میکس ۲ تایی هوشمند (2-Leg Smart Value Accumulator) — ${a.candidate.mainOdds.toFixed(2)} × ${b.candidate.mainOdds.toFixed(2)} = ${totalOdds.toFixed(2)}x`,
      labelEn: "2-Leg Smart Value Accumulator",
      icon: "🔗",
      legs,
      totalOdds,
      stake: 100,
      hitRatePct: Math.round(hit * 1000) / 10,
      potentialReturn: Math.round(100 * totalOdds * 10) / 10,
    });
  }

  return out;
}
