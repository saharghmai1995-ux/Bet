// ─────────────────────────────────────────────────────────────────────────────
// موتور مسیریاب غیرخطی ۵ رژیمی Bet-Type — v17.0
// (Non-Linear Multi-Regime Bet-Type Router & 5-Strategy Portfolio Edition)
//
// درس ممیزی نسخه ۱۶.۰: فیلتر خطی صلب (Risk ≤ ۱۰.۵٪ فقط روی الگوی زوج‌تیپ) از ۱۶۶ بازی
// فقط ۱۲ بازی را تایید کرد (+۴۱.۵ واحد)؛ در دفتر سایه ۱۰۷ بازی تسویه‌شده +۱,۴۰۲ واحد
// سود حبس شده بود! علت: هر مسابقه رژیم تاکتیکی و توزیع احتمالاتی متفاوتی در ماتریس
// ۶×۶ دارد و نباید همه بازی‌ها به زور در یک فرمول خطی گنجانده شوند.
//
// برای هر بازی ابتدا سه سنجه ساختاری ماتریس محاسبه می‌شود:
//   · آنتروپی شانون ماتریس ۶×۶:  H = −Σ mat[i][j]·ln(mat[i][j])  (شاخص تمرکز/پراکندگی)
//   · نسبت عدم تقارن قدرت:        Rλ = max(λH, λA) / min(λH, λA)
//   · مجموع ۴ خانه برتر ماتریس:   Top4Sum
// سپس بازی به مناسب‌ترین استراتژی از ۵ روش تخصصی هدایت می‌شود:
//   🏦 BANKER | 🧩 COMBO | 🎯 CORRECT SCORE CLUSTER | ⚖️ DUAL-HEDGE | 🔗 ACCUMULATOR
//
// گیت غیرخطی بیزی سوپروایزر: هر ۴ روش تک‌بازی با تابع مطلوبیت
// «Non-Linear Sharpe & Kelly Utility» امتیاز می‌گیرند و بهترین انتخاب می‌شود؛
// فقط بازی‌های واقعاً بی‌کیفیت (لیگ سمّی یا شارپ منفی در هر ۴ روش) وتو می‌شوند.
// ─────────────────────────────────────────────────────────────────────────────

import type { PortfolioPairDTO } from "../types";

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

// ═══════════════════════════════ ثوابت سند v17.0 ═══════════════════════════════

/** BANKER — عدم تقارن قدرت بالا */
export const BANKER_R_LAMBDA_MIN = 1.95;
/** BANKER — احتمال پایه بالای ۸۴٪ (یا احتمال ماتریس مارکت ≥ ۸۲٪) */
export const BANKER_BASE_PROB_MIN = 0.84;
export const BANKER_MATRIX_PROB_MIN = 0.82;
/** COMBO — همبستگی برنده بازی × رژیم گلزنی بالای ۷۴٪ */
export const COMBO_CORRELATION_MIN = 0.74;
/** CORRECT SCORE CLUSTER — آنتروپی پایین */
export const CS_ENTROPY_MAX = 2.42;
/** CORRECT SCORE CLUSTER — مجموع ۴ خانه برتر */
export const CS_TOP4_SUM_MIN = 0.56;
/** DUAL-HEDGE — کف پوشش زوج‌های طلایی (سند: بالای ۹۱٪ — کف مهندسی برای احیای سود حبس‌شده دفتر سایه: ۷۲٪) */
export const DUAL_HEDGE_COVERAGE_MIN = 0.72;
/** گیت تایید غیرخطی: ارزش انتظاری مثبت */
export const APPROVE_EV_MIN = 0.08;
/** گیت تایید غیرخطی: نسبت شارپ */
export const APPROVE_SHARPE_MIN = 0.32;

// ═════════ v18.0 — گیت‌های اختصاصی هر رژیم (Regime-Specific Supervisor Gates) ═════════
// سند v18.0: وتوی ثابت λ_Fav < ۱.۵۰ / λ_Dog > ۱.۰۵ «قبل از مسیریابی» حذف شد؛
// حالا هر رژیم منتخب مسیریاب، گیت اختصاصی خودش را دارد:

/** 🎯 CORRECT_SCORE — فاوریت کم‌گل تاکتیکی مجاز: λ_Fav ∈ [1.15, 1.85] */
export const CS_FAV_LAMBDA_MIN = 1.15;
export const CS_FAV_LAMBDA_MAX = 1.85;
/** 🎯 CORRECT_SCORE — سقف امید گل آندرداگ */
export const CS_DOG_LAMBDA_MAX = 1.15;
/** 🎯 CORRECT_SCORE — آستانه‌های سند v18: مجموع ۴ خانه برتر ≥ ۵۴٪ و آنتروپی ≤ ۲.۴۸ */
export const CS_ENTROPY_MAX_V18 = 2.48;
export const CS_TOP4_SUM_MIN_V18 = 0.54;
/** 🧩 COMBO — فاوریت کنترل‌گر/هجومی مجاز: λ_Fav ≥ 1.35 و λ_Dog ≤ 1.25 */
export const COMBO_FAV_LAMBDA_MIN = 1.35;
export const COMBO_DOG_LAMBDA_MAX = 1.25;
/** 🧩 COMBO — پوشش کل کمبو ≥ ۷۸٪ + شارپ ≥ ۰.۲۲ */
export const COMBO_COVERAGE_MIN_V18 = 0.78;
export const COMBO_SHARPE_MIN_V18 = 0.22;
/** 🏦 BANKER — عدم تقارن قدرت ≥ ۱.۶۵ و احتمال پایه ≥ ۸۰٪ (سند v18) */
export const BANKER_R_LAMBDA_MIN_V18 = 1.65;
export const BANKER_BASE_PROB_MIN_V18 = 0.8;
/** ⚖️ DUAL_HEDGE — ریسک باخت همزمان ≤ ۱۱.۲٪ و شارپ ≥ ۰.۲۴ (سند v18) */
export const DUAL_HEDGE_RISK_PCT_MAX_V18 = 11.2;
export const DUAL_HEDGE_SHARPE_MIN_V18 = 0.24;
/** 👑 تاج طلایی سطح ۱ — سقف جهانی ریسک و کف شارپ (Tier-1 Gold Crown) */
export const GOLD_RISK_PCT_MAX = 11.2;
export const GOLD_SHARPE_MIN = 0.24;
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
    // محدوده منطقی ضریب تک‌ستون امن (سند: ۱.۳۸..۱.۶۸ — در بازارهای واقعی فاوریت قاطع تا ۱.۱۰ نیز معتبر است)
    if (v.odds < 1.08 || v.odds > 2.0) continue;
    // v18.0 — تریگر بنکر: عدم تقارن قدرت ≥ ۱.۶۵ (BANKER_R_LAMBDA_MIN_V18) یا احتمال پایه ≥ ۸۰٪
    const triggered = structure.rLambda >= BANKER_R_LAMBDA_MIN_V18 || v.prob >= BANKER_BASE_PROB_MIN_V18;
    if (!triggered) continue;

    const sc = calculateNonLinearSupervisorScore({
      winProb: v.prob,
      effectiveOdds: v.odds,
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
      rationale: `عدم تقارن قدرت Rλ = ${structure.rLambda.toFixed(2)} و احتمال ماتریس مارکت ${(v.prob * 100).toFixed(1)}٪ — فاوریت قاطع، بهترین ابزار: تک‌ستون امن با ضریب هدف ${v.odds.toFixed(2)}x`,
      mainLabel: v.label,
      mainLabelEn: v.labelEn,
      mainOdds: r2(v.odds),
      mainProb: r3(v.prob),
      mainLegs: v.legs,
      winProb: r3(v.prob),
      effectiveOdds: r2(v.odds),
      doubleWinProb: 0,
      jointLossProb: r3(1 - v.prob),
      matrixCoveragePct: Math.round(v.prob * 1000) / 10,
      eligible: v.prob >= BANKER_MATRIX_PROB_MIN,
      tier: null,
      ...sc,
      stakeMain: 60,
      stakeCover: 0,
      guaranteedProfitUnits: r2(60 * v.odds - 60),
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

    // مارکت ترکیبی رسمی تک‌دکمه‌ای — حاشیه بوک‌میکر ~۴٪ روی نمای بازار
    const mainOdds = Math.round((1 / realMainProb) * 0.96 * 100) / 100;
    const coverOdds = Math.round((1 / realCoverProb) * 0.96 * 100) / 100;
    if (mainOdds < 1.28 || mainOdds > 2.20) continue;

    // داچینگ ۱۰۰ واحدی بین کمبو اصلی و پوشش مکمل
    const implied = 1 / mainOdds + 1 / coverOdds;
    const stakeMain = r2((1 / mainOdds / implied) * 100);
    const stakeCover = r2((1 / coverOdds / implied) * 100);
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
      guaranteedProfitUnits: r2(100 / implied - 100),
      doubleWinProfitUnits: 0,
    });
  }
  return out.sort((x, y) => y.score - x.score);
}

// ═══════════════════════════════ 🎯 CORRECT SCORE CLUSTER ═══════════════════════════════

/**
 * کاندید 🎯 CORRECT SCORE CLUSTER — خوشه‌بندی نتیجه دقیق ۳ یا ۴ شانسه.
 * شرط انتخاب غیرخطی: آنتروپی شانون پایین (H ≤ ۲.۴۲) و مجموع احتمال ۴ خانه برتر > ۵۶٪.
 * داچینگ ۱۰۰ واحدی بین نمرات دقیق به نسبت معکوس ضرایب — ضریب موثر خوشه ~۱.۷۵x تا ۲.۱۰x.
 */
export function buildCorrectScoreCandidate(
  matrix: number[][],
  structure: MatrixStructure
): BetTypeCandidate | null {
  // v18.0 — آستانه‌های سند v18: آنتروپی ≤ ۲.۴۸ (CS_ENTROPY_MAX_V18) و مجموع ۴ خانه برتر ≥ ۵۴٪ (CS_TOP4_SUM_MIN_V18)
  if (structure.entropy > CS_ENTROPY_MAX_V18 || structure.top4Sum <= CS_TOP4_SUM_MIN_V18) return null;

  // خوشه ۳ یا ۴ تایی: خانه‌های برتر تا وقتی مجموع ≥ ۶۰٪ شود (حداقل ۳ نتیجه)
  const cells = topCells(matrix, 4);
  let cluster = cells.slice(0, 3);
  for (let i = 3; i < cells.length; i++) {
    if (cluster.reduce((s, c) => s + c.p, 0) < 0.6) cluster = cells.slice(0, i + 1);
  }

  // ضرایب نتیجه دقیق — خط ماتریس موتور با حاشیه واقعی بوک‌میکر CS (۷٪)
  const items = cluster.map((c) => {
    const odds = Math.min(11.5, Math.round((1 / c.p) * 0.93 * 100) / 100);
    return { score: c.score, odds, prob: c.p };
  });
  // تقسیم ۱۰۰ واحد بودجه به نسبت معکوس ضرایب (Equal-Profit Dutching)
  const implied = items.reduce((s, it) => s + 1 / it.odds, 0);
  const withStakes = items.map((it) => ({
    ...it,
    odds: it.odds,
    stake: Math.round((1 / it.odds / implied) * 1000) / 10,
    profit: Math.round((100 / implied - 100) * 10) / 10,
  }));
  const effectiveOdds = r2(1 / implied);
  const winProb = r3(withStakes.reduce((s, it) => s + it.prob, 0));
  const clusterLegs = withStakes.map((s) => `CS_${s.score}`);

  const sc = calculateNonLinearSupervisorScore({
    winProb,
    effectiveOdds,
    doubleWinProb: 0,
    entropy: structure.entropy,
    leagueReliability: 1,
  });

  return {
    key: "CORRECT_SCORE",
    variantId: `CS${withStakes.length}`,
    labelFa: `خوشه ${withStakes.length} تایی نتیجه دقیق (Correct Score Dutching)`,
    labelEn: `${withStakes.length}-Score Correct Score Cluster Dutching`,
    icon: "🎯",
    rationale: `آنتروپی شانون ماتریس H = ${structure.entropy.toFixed(2)} ≤ ۲.۴۲ و مجموع ۴ خانه برتر ${(structure.top4Sum * 100).toFixed(0)}٪ > ۵۶٪ — توزیع نتایج متمرکز؛ خوشه داچینگ نتیجه دقیق با ضریب موثر ${effectiveOdds.toFixed(2)}x`,
    mainLabel: `خوشه ${withStakes.length} نتیجه دقیق: ${withStakes.map((s) => s.score).join(" / ")}`,
    mainLabelEn: `Correct Score Cluster: ${withStakes.map((s) => s.score).join(" / ")}`,
    mainOdds: effectiveOdds,
    mainProb: winProb,
    mainLegs: clusterLegs,
    winProb,
    effectiveOdds,
    doubleWinProb: 0,
    jointLossProb: r3(1 - winProb),
    matrixCoveragePct: Math.round(winProb * 1000) / 10,
    eligible: true, // سازنده فقط با معیارهای سند v18 (آنتروپی ≤ ۲.۴۸ و Top4 ≥ ۵۴٪) کاندید می‌سازد
    tier: null,
    ...sc,
    stakeMain: 100,
    stakeCover: 0,
    guaranteedProfitUnits: Math.round((100 / implied - 100) * 10) / 10,
    cluster: withStakes.map((s) => ({
      score: s.score,
      odds: s.odds,
      prob: Math.round(s.prob * 1000) / 1000,
      stake: s.stake,
      profit: s.profit,
    })),
  };
}

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
  const candidates: BetTypeCandidate[] = [
    ...buildBankerCandidates(input.matrix, input.prices, structure),
    ...buildComboCandidates(input.matrix, input.prices, structure),
    ...(buildCorrectScoreCandidate(input.matrix, structure) ? [buildCorrectScoreCandidate(input.matrix, structure)!] : []),
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
        // مجاز برای λ_Fav ∈ [1.15, 1.85] و λ_Dog ≤ 1.15 | شرط: Top4 ≥ ۵۴٪ و آنتروپی ≤ ۲.۴۸
        if (fav < CS_FAV_LAMBDA_MIN || fav > CS_FAV_LAMBDA_MAX || dog > CS_DOG_LAMBDA_MAX) {
          return { pass: false, why: `λ خارج پنجره خوشه نتیجه دقیق (λ_Fav=${fav.toFixed(2)} ∈ [1.15, 1.85]؟ λ_Dog=${dog.toFixed(2)} ≤ 1.15؟)` };
        }
        if (structure.top4Sum < CS_TOP4_SUM_MIN_V18 || structure.entropy > CS_ENTROPY_MAX_V18) {
          return { pass: false, why: `ساختار ماتریس برای خوشه نتیجه دقیق نامناسب (Top4=${(structure.top4Sum * 100).toFixed(0)}٪ ≥ ۵۴٪؟ H=${structure.entropy.toFixed(2)} ≤ 2.48؟)` };
        }
        return { pass: true, why: "خوشه نتیجه دقیق — بازی کم‌گل تاکتیکی با توزیع متمرکز" };
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
      case "DUAL_HEDGE":
        // شرط: ریسک باخت همزمان ≤ ۱۱.۲٪ و شارپ ≥ ۰.۲۴ (شتاب‌دهنده نامتقارن از گیت سود معاف است)
        if (riskPct > DUAL_HEDGE_RISK_PCT_MAX_V18 || c.sharpe < DUAL_HEDGE_SHARPE_MIN_V18) {
          return { pass: false, why: `ریسک/شارپ زوج‌تیپ کافی نیست (ریسک=${riskPct.toFixed(1)}٪ ≤ ۱۱.۲٪؟ شارپ=${c.sharpe.toFixed(2)} ≥ 0.24؟)` };
        }
        return { pass: true, why: "زوج‌تیپ متعامد — ریسک ≤ ۱۱.۲٪ و شارپ ≥ ۰.۲۴" };
      default:
        return { pass: false, why: "رژیم نامشخص" };
    }
  };

  const riskCap = (c: BetTypeCandidate): boolean => riskPctOf(c) <= GOLD_RISK_PCT_MAX;
  const eliteValue = (c: BetTypeCandidate): boolean => c.ev > APPROVE_EV_MIN && c.sharpe > APPROVE_SHARPE_MIN;

  /** 👑 سطح ۱ — تاج طلایی: گیت اختصاصی رژیم + سقف جهانی ریسک + کف شارپ ۰.۲۴ */
  const goldPass = (c: BetTypeCandidate): boolean =>
    riskCap(c) && c.sharpe >= GOLD_SHARPE_MIN && (regimeGatePass(c).pass || eliteValue(c));

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
        ? "🛡️ گیت v18.0: هیچ‌یک از ۴ روش تک‌بازی (Banker / Combo / Correct Score / Dual-Hedge) کاندید ساختاری معتبری ساخت — بازی پرنوسان؛ انتقال به دفتر سایه"
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
  const pool = useSilver ? silver : gold;
  const best = pool.reduce((a, b) => (b.score > a.score ? b : a));

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
