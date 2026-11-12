// ─────────────────────────────────────────────────────────────────────────────
// موتور بازارهای اتمیک رسمی — NeoBet v15.0
// «100% Executable Atomic Single-Button Markets»
//
// 🚨 قانون آهنین Zero Same-Game Multiplication (سند ارتقا v15.0):
//   در کارت‌های تک‌بازی استفاده از علامت ضرب (×) یا جمع (+) بین چند آپشن
//   درون یک بازی مطلقاً ممنوع است. هر بال (تیپ A و تیپ B) فقط و فقط یک
//   مارکت استاندارد تک‌دکمه‌ای (Single Atomic Selection) است که در ۱۰۰٪
//   سایت‌های شرط‌بندی دنیا به‌عنوان گزینه مستقل وجود دارد.
//
// ۴ الگوی رسمی تک‌دکمه‌ای (موجود در تمام سایت‌های شرط‌بندی دنیا):
//   الگوی ۱ — پوشش 1X با دو تک‌دکمه: برد میزبان (1) ↔ مساوی (X)
//   الگوی ۲ — تفکیک خط گل: بالای ۲.۵ گل ↔ دقیقاً ۲ گل
//   الگوی ۳ — BTTS بله ↔ برد میزبان بدون گل خورده (To Nil)
//   الگوی ۴ — هندیکپ میزبان −۱.۵ ↔ برد میزبان با اختلاف دقیق ۱ گل
//
// احتمال هر تیپ مستقیماً از جمع خانه‌های متناظر ماتریس دیکسون-کولز (بدون هیچ
// ضربی!) و ضریب از فرمول بوک‌میکر با کسر ۵٪ کارمزد: odds = 0.95 / prob
// با قفل سخت محدوده واقعی: تیپ A ∈ [1.75, 2.35] · تیپ B ∈ [2.50, 3.80]
// ─────────────────────────────────────────────────────────────────────────────

import { poissonPmf, dixonColesTau, buildScoreMatrix } from "./poisson";
import { simultaneousKelly } from "./kelly";
import type { PairStructureDTO, PortfolioPairDTO, PortfolioSelectionDTO } from "../types";

// ═══════════ برچسب بازارها — فارسی + نام رسمی بین‌المللی انگلیسی ═══════════

export const MARKET_LABELS: Record<string, string> = {
  HOME: "برد میزبان (1)",
  DRAW: "مساوی (X)",
  AWAY: "برد میهمان (2)",
  DC_1X: "شانس مجرد میزبان (1X)",
  DC_X2: "هندیکپ آسیایی میهمان +۰.۵ (X2)",
  DNB_HOME: "DNB میزبان (برد یا بازگشت)",
  DNB_AWAY: "DNB میهمان (برد یا بازگشت)",
  NO_DRAW: "برد یکی از دو تیم (12)",
  AH_AWAY_15: "هندیکپ آسیایی میهمان +۱.۵",
  AH_HOME_15: "هندیکپ آسیایی میزبان −۱.۵",
  ASIAN_O20: "بالای ۲.۰ گل آسیایی",
  ASIAN_U20: "زیر ۲.۰ گل آسیایی",
  O15: "بالای ۱.۵ گل",
  O25: "بالای ۲.۵ گل",
  O35: "بالای ۳.۵ گل",
  U25: "زیر ۲.۵ گل",
  U35: "زیر ۳.۵ گل",
  BTTS_Y: "هر دو تیم گل می‌زنند (BTTS: بله)",
  BTTS_N: "حداقل یک تیم گل نمی‌زند (BTTS: خیر)",
  TGOAL_HOME: "گل میزبان (بالای ۰.۵ تیمی)",
  TGOAL_AWAY: "گل میهمان (بالای ۰.۵ تیمی)",
  WIN_NIL_HOME: "برد میزبان بدون گل خورده (To Nil)",
  WIN_NIL_AWAY: "برد میهمان بدون گل خورده (To Nil)",
  EXACT2: "دقیقاً ۲ گل کل مسابقه (Exact Total Goals: 2)",
  HOME_BY_1: "برد میزبان دقیقاً با اختلاف ۱ گل (Home by 1)",
  HT_O05: "حداقل یک گل در نیمه اول (HT بالای ۰.۵)",
  HT_00: "مساوی ۰-۰ نیمه اول (HT 0-0)",
  C_O95: "بالای ۹.۵ کرنر",
  C_U95: "زیر ۹.۵ کرنر",
  CARDS_O35: "بالای ۳.۵ کارت زرد",
  CARDS_O45: "بالای ۴.۵ کارت زرد",
  CARDS_U45: "زیر ۴.۵ کارت زرد",
};

/**
 * v15.0 — نام رسمی بین‌المللی هر مارکت (انگلیسی) برای متادیتای اجرایی فلش‌کارت.
 * «نام رسمی مارکت بین‌المللی به انگلیسی و فارسی» — بخش ۴ سند ارتقا v15.0.
 */
export const MARKET_LABELS_EN: Record<string, string> = {
  HOME: "Full-Time Result: 1 — Home Win",
  DRAW: "Full-Time Result: X — Draw",
  AWAY: "Full-Time Result: 2 — Away Win",
  DC_1X: "Double Chance: 1X",
  DC_X2: "Double Chance: X2",
  DNB_HOME: "Draw No Bet: Home",
  DNB_AWAY: "Draw No Bet: Away",
  NO_DRAW: "No Draw (12)",
  AH_AWAY_15: "Asian Handicap: Away +1.5",
  AH_HOME_15: "Asian Handicap: Home −1.5",
  ASIAN_O20: "Asian Total: Over 2.0",
  ASIAN_U20: "Asian Total: Under 2.0",
  O15: "Total Goals: Over 1.5",
  O25: "Total Goals: Over 2.5",
  O35: "Total Goals: Over 3.5",
  U25: "Total Goals: Under 2.5",
  U35: "Total Goals: Under 3.5",
  BTTS_Y: "Both Teams To Score: Yes",
  BTTS_N: "Both Teams To Score: No",
  TGOAL_HOME: "Home Total Goals: Over 0.5",
  TGOAL_AWAY: "Away Total Goals: Over 0.5",
  WIN_NIL_HOME: "Home Team to Win to Nil: Yes",
  WIN_NIL_AWAY: "Away Team to Win to Nil: Yes",
  EXACT2: "Exact Total Goals: 2 Goals",
  HOME_BY_1: "Winning Margin: Home by 1 Goal",
};

/** نام رسمی انگلیسی یک کلید بازار (فالبک: کلید خام) */
export function marketEnLabel(key: string): string {
  return MARKET_LABELS_EN[key] ?? MARKET_LABELS[key] ?? key;
}

/**
 * v15.0 — نشان رسمی قانون تسویه روی هر فلش‌کارت (Settlement Rule Badge):
 * «وقت قانونی ۹۰ دقیقه — بدون وقت اضافه» برای حذف ریسک اختلاف قوانین بوک‌میکرها.
 */
export const SETTLEMENT_RULE_FA = "⏱️ قانون تسویه: وقت قانونی ۹۰ دقیقه — بدون وقت اضافه";
export const SETTLEMENT_RULE_EN = "90 MINUTES REGULAR TIME ONLY — NO EXTRA TIME";

// ═══════════ گارد آهنین ضد ضرب گزینه‌های وابسته ═══════════

/**
 * assertNoSameGameMultiply — نگهبان رسمی v15.0 (بخش ۲ سند ارتقا).
 * ضرب کردن دو شرط با matchId یکسان (Related Contingency) ۱۰۰٪ غیرمجاز و
 * غیرقابل‌ثبت است — طبق قوانین رسمی تمام بوک‌میکرهای جهان.
 * فقط در میکس ۲ و ۳ مسابقه «کاملاً مجزا» ضرب مجاز است.
 */
export function assertNoSameGameMultiply(legs: { matchId: string }[], context = "combo"): void {
  const ids = legs.map((l) => String(l.matchId ?? ""));
  const distinct = new Set(ids.filter((x) => x.length > 0));
  const hasDuplicate = ids.some((x, i) => ids.indexOf(x) !== i);
  if (hasDuplicate && distinct.size < ids.filter((x) => x.length > 0).length) {
    throw new Error(
      `SAME_GAME_MULTIPLY_FORBIDDEN (${context}): two legs share the same matchId — related contingencies may never be multiplied (NeoBet v15.0 Zero Same-Game Multiplication Rule)`
    );
  }
}

// ═══════════ پوشش سلولی پایه‌های ماتریسی ═══════════

/** آیا انتخاب در نمره دقیق (h,a) می‌برد؟ (فقط پایه‌های ماتریسی) */
export function orthoLegCoversCell(key: string, h: number, a: number): boolean {
  const tot = h + a;
  switch (key) {
    case "HOME": return h > a;
    case "DRAW": return h === a;
    case "AWAY": return a > h;
    case "DC_1X": return h >= a;
    case "DC_X2": return a >= h;
    case "DNB_HOME": return h >= a; // مساوی = بازگشت (رفتار محافظه‌کارانه: برنده)
    case "DNB_AWAY": return a >= h;
    case "NO_DRAW": return h !== a;
    case "AH_AWAY_15": return h - a <= 1;
    case "AH_HOME_15": return h - a >= 2;
    case "ASIAN_O20": return tot >= 2; // دقیقاً ۲ = نیم‌برد
    case "ASIAN_U20": return tot <= 2; // دقیقاً ۲ = نیم‌برد
    case "O15": return tot > 1.5;
    case "O25": return tot > 2.5;
    case "O35": return tot > 3.5;
    case "U25": return tot < 2.5;
    case "U35": return tot < 3.5;
    case "BTTS_Y": return h > 0 && a > 0;
    case "BTTS_N": return h === 0 || a === 0;
    case "TGOAL_HOME": return h >= 1;
    case "TGOAL_AWAY": return a >= 1;
    case "WIN_NIL_HOME": return h > a && a === 0;
    case "WIN_NIL_AWAY": return a > h && h === 0;
    case "EXACT2": return tot === 2; // دقیقاً ۲ گل کل مسابقه
    case "HOME_BY_1": return h - a === 1; // برد میزبان دقیقاً با اختلاف ۱ گل
    default: return false; // پایه‌های خارج ماتریس
  }
}

// ═══════════ زمینه محاسبه ═══════════

export interface OrthoContext {
  lambdaHome: number;
  lambdaAway: number;
  /** ماتریس نمره کامل دیکسون-کولز (خروجی runDixonColes) */
  matrix: number[][];
  lambdaCorners: number;
  lambdaCards: number;
  /** قیمت‌های واقعی بوک‌میکر بر حسب کلید پایه (اختیاری — فقط برای خط شارپ نمایشی) */
  prices?: Partial<Record<string, number>>;
}

interface LegProbs {
  htOver05: number;
  ht00: number;
  cornersOver95: number;
  cornersUnder95: number;
  cardsOver35: number;
  cardsOver45: number;
  cardsUnder45: number;
}

function poissonTail(k: number, lambda: number): number {
  // P(X > k) = 1 − P(X ≤ k)
  let cdf = 0;
  for (let i = 0; i <= k; i++) cdf += poissonPmf(i, lambda);
  return Math.max(0, Math.min(1, 1 - cdf));
}

/** ماتریس نیمه اول با λ×۰.۴۵ (سهم استاندارد گل‌های نیمه اول) + تصحیح دیکسون-کولز */
function buildHtProbs(lambdaHome: number, lambdaAway: number, rho = -0.08): { over05: number; zero: number } {
  const lh = lambdaHome * 0.45;
  const la = lambdaAway * 0.45;
  let zero = 0;
  let any = 0;
  for (let h = 0; h <= 4; h++) {
    for (let a = 0; a <= 4; a++) {
      const p = Math.max(0, poissonPmf(h, lh) * poissonPmf(a, la) * dixonColesTau(h, a, lh, la, rho));
      if (h === 0 && a === 0) zero = p;
      if (h + a >= 1) any += p;
    }
  }
  return { over05: Math.min(1, any), zero: Math.min(1, zero) };
}

// ═══════════ احتمال هر پایه از ماتریس (بدون هیچ ضربی) ═══════════

function matrixProb(covers: (h: number, a: number) => boolean, matrix: number[][]): number {
  let p = 0;
  for (let h = 0; h < matrix.length; h++) {
    const row = matrix[h] ?? [];
    for (let a = 0; a < row.length; a++) {
      if (covers(h, a)) p += row[a] ?? 0;
    }
  }
  return p;
}

/** احتمال برد هر پایه — بازارهای اتمیک همگی روی ماتریس نمره‌اند */
export function orthoLegProb(key: string, ctx: OrthoContext, lp: LegProbs): number {
  switch (key) {
    case "HT_O05": return lp.htOver05;
    case "HT_00": return lp.ht00;
    case "C_O95": return lp.cornersOver95;
    case "C_U95": return lp.cornersUnder95;
    case "CARDS_O35": return lp.cardsOver35;
    case "CARDS_O45": return lp.cardsOver45;
    case "CARDS_U45": return lp.cardsUnder45;
    default:
      return matrixProb((h, a) => orthoLegCoversCell(key, h, a), ctx.matrix);
  }
}

/** ضریب پایه: قیمت واقعی در اولویت، وگرنه خط سینتتیک عادلانه با حاشیه ۴.۵٪ */
export function orthoLegOdds(key: string, p: number, ctx: OrthoContext): number {
  const real = ctx.prices?.[key];
  if (real && real > 1.01) return Math.round(real * 100) / 100;
  return Math.max(1.02, Math.round((1 / Math.max(0.02, p)) * 0.955 * 100) / 100);
}

// ═══════════ v15.0 — فرمول رسمی ضریب بوک‌میکر + قفل سخت محدوده ═══════════

/**
 * Realistic Odds Guardrail (بخش ۱ سند ارتقا v15.0):
 *   odds = +(0.95 / prob).toFixed(2)  — کسر ۵٪ کارمزد بوک‌میکر از احتمال ماتریس
 *   قفل سخت: تیپ A ∈ [1.75, 2.35] · تیپ B ∈ [2.50, 3.80]
 *   ضریب غیرواقعی بالای ۴.۵۰ در زوج‌تیپ تک‌بازی مطلقاً ممنوع است.
 */
export const ATOMIC_ODDS_BAND = {
  A: { lo: 1.75, hi: 2.35 },
  B: { lo: 2.5, hi: 3.8 },
} as const;

export type AtomicBand = keyof typeof ATOMIC_ODDS_BAND;

export function atomicOdds(prob: number, band: AtomicBand, realPrice?: number): number {
  const { lo, hi } = ATOMIC_ODDS_BAND[band];
  // v15.0 — لنگر قیمت واقعی بوک‌میکر وقتی فید موجود است و داخل محدوده واقع‌گرایانه قرار دارد
  if (typeof realPrice === "number" && realPrice > 1.01 && realPrice >= lo - 0.1 && realPrice <= hi + 0.1) {
    return Math.round(realPrice * 100) / 100;
  }
  const raw = 0.95 / Math.max(0.01, Math.min(0.99, prob));
  const clamped = Math.min(hi, Math.max(lo, raw));
  return Math.round(clamped * 100) / 100;
}

// ═══════════ ساخت تیپ اتمیک ═══════════

export interface OrthoSlip {
  legs: string[];
  label: string;
  /** v15.0 — نام رسمی بین‌المللی مارکت (انگلیسی) */
  labelEn: string;
  odds: number;
  prob: number;
}

/** ساخت تیپ تک‌مارکتی اتمیک — هر تیپ فقط و فقط یک دکمه رسمی سایت بت است */
function buildAtomicSlip(leg: string, band: AtomicBand, ctx: OrthoContext, lp: LegProbs): OrthoSlip {
  const prob = Math.max(0.01, Math.min(0.99, orthoLegProb(leg, ctx, lp)));
  return {
    legs: [leg],
    label: MARKET_LABELS[leg] ?? leg,
    labelEn: marketEnLabel(leg),
    odds: atomicOdds(prob, band, ctx.prices?.[leg]),
    prob,
  };
}

// ═══════════ چهار الگوی رسمی تک‌دکمه‌ای (v15.0) ═══════════

export type ArchetypeCode = "A1" | "A2" | "A3" | "A4";

interface ArchetypeDef {
  code: ArchetypeCode;
  name: string;
  short: string;
  rationale: string;
  /** تیپ A — تک‌دکمه رسمی (ضریب ~۱.۸۵ تا ۲.۱۵) */
  legA: string;
  /** تیپ B مکمل — تک‌دکمه رسمی (ضریب ~۲.۸۰ تا ۳.۴۵) */
  legB: string;
  /** بازی‌هایی که الگو برای آن‌ها مناسب است */
  score: (ctx: OrthoContext) => number;
}

const ARCHETYPES: ArchetypeDef[] = [
  {
    code: "A1",
    name: "الگوی رسمی ۱ — پوشش 1X با دو تک‌دکمه (Official Pattern 1 — 1X Cover with Two Single Buttons)",
    short: "الگوی ۱ — برد میزبان ↔ مساوی",
    rationale:
      "مناسب بازی‌های متعادل با برتری میزبان: پوشش ۱۰۰٪ فضای 1X با دو دکمه استاندارد ردیف اول هر سایت بت. Prob_A = Σ mat[i][j] برای i>j و Prob_B = Σ mat[i][j] برای i=j — بدون هیچ ضربی.",
    legA: "HOME",
    legB: "DRAW",
    score: (ctx) => {
      const pAway = matrixProb((h, a) => a > h, ctx.matrix);
      return Math.max(0, Math.min(1, (0.32 - pAway) / 0.25)); // هرچه برد میهمان کم‌احتمال‌تر، پوشش 1X امن‌تر
    },
  },
  {
    code: "A2",
    name: "الگوی رسمی ۲ — تفکیک خط گل و ۲ گل دقیق (Official Pattern 2 — Over 2.5 vs Exact 2 Goals Split)",
    short: "الگوی ۲ — بالای ۲.۵ ↔ دقیقاً ۲ گل",
    rationale:
      "مناسب بازی‌های هجومی: پوشش تمام نتایج ۲ گل، ۳ گل، ۴ گل و بیشتر با دو تک‌دکمه رسمی. Prob_A = Σ mat[i][j] برای i+j≥3 و Prob_B = mat[2][0]+mat[1][1]+mat[0][2] — هر دو دکمه رسمی است.",
    legA: "O25",
    legB: "EXACT2",
    score: (ctx) => {
      const pOver25 = matrixProb((h, a) => h + a > 2.5, ctx.matrix);
      return Math.max(0, Math.min(1, (pOver25 - 0.42) / 0.2)); // هرچه بازی پرگل‌تر، الگو درخشان‌تر
    },
  },
  {
    code: "A3",
    name: "الگوی رسمی ۳ — گلزنی دو تیم در برابر برد کلین‌شیت میزبان (Official Pattern 3 — BTTS Yes vs Home Win to Nil)",
    short: "الگوی ۳ — BTTS بله ↔ برد کلین‌شیت میزبان",
    rationale:
      "اگر میهمان گل بزند تیپ A می‌برد؛ اگر میهمان گل نزند و میزبان ۱-۰، ۲-۰ یا ۳-۰ ببرد تیپ B می‌برد. Prob_A = Σ mat[i][j] برای i≥1 و j≥1 و Prob_B = Σ mat[i][0] برای i≥1.",
    legA: "BTTS_Y",
    legB: "WIN_NIL_HOME",
    score: (ctx) => {
      const st = matrixStats(ctx);
      const cs = st.pHomeCS;
      return Math.max(0, Math.min(1, (cs - 0.18) / 0.22)); // احتمال کلین‌شیت میزبان
    },
  },
  {
    code: "A4",
    name: "الگوی رسمی ۴ — تفکیک هندیکپ و حاشیه برد میزبان (Official Pattern 4 — AH −1.5 vs Home by 1 Goal)",
    short: "الگوی ۴ — AH میزبان −۱.۵ ↔ برد با ۱ گل",
    rationale:
      "مناسب فاوریت‌های قوی: پوشش ۱۰۰٪ تمام بردهای میزبان — چه ۱-۰ و ۲-۱، چه ۲-۰ و ۳-۱ و ۴-۰. Prob_A = Σ mat[i][j] برای i−j≥2 و Prob_B = Σ mat[i][j] برای i−j=1.",
    legA: "AH_HOME_15",
    legB: "HOME_BY_1",
    score: (ctx) => {
      const d = ctx.lambdaHome - ctx.lambdaAway;
      return Math.max(0, Math.min(1, (d - 0.25) / 0.6)); // فاوریت قوی میزبان
    },
  },
];

/** سنجه‌های سریع از ماتریس برای امتیازدهی الگوها */
function matrixStats(ctx: OrthoContext): { pHomeCS: number; pAwayCS: number; pClosed: number } {
  let pHomeCS = 0;
  let pAwayCS = 0;
  let pClosed = 0;
  for (let h = 0; h < ctx.matrix.length; h++) {
    const row = ctx.matrix[h] ?? [];
    for (let a = 0; a < row.length; a++) {
      const p = row[a] ?? 0;
      if (a === 0) pHomeCS += p;
      if (h === 0) pAwayCS += p;
      if (h + a <= 2) pClosed += p;
    }
  }
  return { pHomeCS, pAwayCS, pClosed };
}

// ═══════════ خروجی نهایی ═══════════

export interface OrthoPair {
  code: ArchetypeCode;
  name: string;
  short: string;
  rationale: string;
  orthogonalityPct: number; // زاویه تمایز — بدون شرط تکراری = ۱۰۰٪
  coveragePct: number; // P(A ∪ B) — پوشش کل سناریوها
  overlapPct: number; // P(A ∩ B) — ناحیه طلایی دو برد
  slipA: OrthoSlip;
  slipB: OrthoSlip;
  jointStates: { bothWin: number; aOnly: number; bOnly: number; bothLose: number };
  impliedSum: number;
  legsA: string[];
  legsB: string[];
}

export interface OrthogonalResult {
  recommended: ArchetypeCode;
  archetypes: OrthoPair[];
}

/**
 * generateOrthogonalComplementarySlips — قلب موتور v15.0.
 * برای هر ۴ الگوی رسمی یک زوج تیپ اتمیک می‌سازد (کاربر بین آن‌ها سوییچ می‌کند)
 * و الگوی متناسب با ویژگی‌های آماری بازی را پیشنهاد می‌دهد.
 * v15.0 — هر تیپ فقط یک مارکت تک‌دکمه‌ای است؛ هیچ ضرب درون‌بازی وجود ندارد.
 */
export function generateOrthogonalComplementarySlips(ctx: OrthoContext): OrthogonalResult {
  const ht = buildHtProbs(ctx.lambdaHome, ctx.lambdaAway);
  const lp: LegProbs = {
    htOver05: ht.over05,
    ht00: ht.zero,
    cornersOver95: poissonTail(9, ctx.lambdaCorners),
    cornersUnder95: 1 - poissonTail(9, ctx.lambdaCorners),
    cardsOver35: poissonTail(3, ctx.lambdaCards),
    cardsOver45: poissonTail(4, ctx.lambdaCards),
    cardsUnder45: 1 - poissonTail(4, ctx.lambdaCards),
  };

  const archetypes: OrthoPair[] = [];
  for (const def of ARCHETYPES) {
    const slipA = buildAtomicSlip(def.legA, "A", ctx, lp);
    const slipB = buildAtomicSlip(def.legB, "B", ctx, lp);

    const pA = slipA.prob;
    const pB = slipB.prob;
    // احتمال برد همزمان: پایه‌های ماتریسی مشترک سلول
    const bothWin = jointWinProb(slipA.legs, slipB.legs, ctx, lp);
    const aOnly = Math.max(0, pA - bothWin);
    const bOnly = Math.max(0, pB - bothWin);
    const bothLose = Math.max(0, 1 - pA - pB + bothWin);
    const coveragePct = Math.min(1, pA + pB - bothWin);
    const impliedSum = 1 / Math.max(1.01, slipA.odds) + 1 / Math.max(1.01, slipB.odds);

    archetypes.push({
      code: def.code,
      name: def.name,
      short: def.short,
      rationale: def.rationale,
      orthogonalityPct: 100, // خانواده شرط‌های A و B در همه الگوها کاملاً تفکیک‌شده است
      coveragePct,
      overlapPct: bothWin,
      slipA,
      slipB,
      jointStates: { bothWin, aOnly, bOnly, bothLose },
      impliedSum,
      legsA: slipA.legs,
      legsB: slipB.legs,
    });
  }

  // پیشنهاد رسمی: بالاترین امتیاز انطباق با ویژگی‌های آماری بازی
  let recommended: ArchetypeCode = "A1";
  let bestScore = -Infinity;
  for (const a of archetypes) {
    const def = ARCHETYPES.find((d) => d.code === a.code)!;
    // الگویی که هم انطباق آماری دارد و هم ریسک باخت همزمان معقول
    const s = def.score(ctx) - Math.max(0, a.jointStates.bothLose - 0.35) * 1.5;
    if (s > bestScore) {
      bestScore = s;
      recommended = a.code;
    }
  }

  return { recommended, archetypes };
}

/** P(برد همزمان A و B) — پایه‌های ماتریسی روی سلول مشترک */
function jointWinProb(legsA: string[], legsB: string[], ctx: OrthoContext, lp: LegProbs): number {
  const offA = legsA.filter(isOffMatrixLeg).map((k) => orthoLegProb(k, ctx, lp));
  const offB = legsB.filter(isOffMatrixLeg).map((k) => orthoLegProb(k, ctx, lp));
  const offProd = [...offA, ...offB].reduce((s, x) => s * x, 1);
  if (offProd <= 1e-6) return 0;
  const matA = legsA.filter((k) => !isOffMatrixLeg(k));
  const matB = legsB.filter((k) => !isOffMatrixLeg(k));
  let p = 0;
  for (let h = 0; h < ctx.matrix.length; h++) {
    const row = ctx.matrix[h] ?? [];
    for (let a = 0; a < row.length; a++) {
      const cell = row[a] ?? 0;
      if (cell <= 0) continue;
      let ok = true;
      for (const k of matA) if (!orthoLegCoversCell(k, h, a)) { ok = false; break; }
      if (!ok) continue;
      for (const k of matB) if (!orthoLegCoversCell(k, h, a)) { ok = false; break; }
      if (ok) p += cell * offProd;
    }
  }
  return p;
}

/** پایه‌های خارج از ماتریس نمره (کرنر/کارت/نیمه اول) — احتمال مستقل پواسون */
const OFF_MATRIX_LEGS = new Set(["HT_O05", "HT_00", "C_O95", "C_U95", "CARDS_O35", "CARDS_O45", "CARDS_U45"]);
export function isOffMatrixLeg(key: string): boolean {
  return OFF_MATRIX_LEGS.has(key);
}

/**
 * v11.0 — jointShadowMetrics — بازتولید سنجه‌های لحظه تصمیم سوپروایزر از λ و پایه‌های
 * ذخیره‌شده کارت (بدون هیچ عدد ساختگی): ٪ باخت همزمان + ٪ برد طلایی همزمان.
 * دقیقاً همان ریاضیات generateOrthogonalComplementarySlips است تا backfill
 * کارت‌های قدیمی با صدور جدید کاملاً هم‌مقیاس بماند.
 */
export function jointShadowMetrics(
  lambdaHome: number,
  lambdaAway: number,
  lambdaCorners: number,
  lambdaCards: number,
  legsA: string[],
  legsB: string[]
): { jointLossRiskPct: number; doubleWinProbPct: number } {
  const matrix = buildScoreMatrix(lambdaHome || 1.35, lambdaAway || 1.25);
  const ctx: OrthoContext = { lambdaHome, lambdaAway, matrix, lambdaCorners, lambdaCards };
  const ht = buildHtProbs(lambdaHome || 1.35, lambdaAway || 1.25);
  const lp: LegProbs = {
    htOver05: ht.over05,
    ht00: ht.zero,
    cornersOver95: poissonTail(9, ctx.lambdaCorners),
    cornersUnder95: 1 - poissonTail(9, ctx.lambdaCorners),
    cardsOver35: poissonTail(3, ctx.lambdaCards),
    cardsOver45: poissonTail(4, ctx.lambdaCards),
    cardsUnder45: 1 - poissonTail(4, ctx.lambdaCards),
  };
  const pA = atomicLegProb(legsA, ctx, lp);
  const pB = atomicLegProb(legsB, ctx, lp);
  const bothWin = jointWinProb(legsA, legsB, ctx, lp);
  const bothLose = Math.max(0, 1 - pA - pB + bothWin);
  const r1 = (v: number) => Math.round(v * 1000) / 10; // کسر → ٪ با یک رقم اعشار
  return { jointLossRiskPct: r1(bothLose), doubleWinProbPct: r1(bothWin) };
}

/** احتمال یک تیپ (همه پایه‌ها ببرند) — پشتیبانی از کارت‌های قدیمی چندپایه */
function atomicLegProb(legs: string[], ctx: OrthoContext, lp: LegProbs): number {
  const offFactors = legs.filter(isOffMatrixLeg).map((k) => orthoLegProb(k, ctx, lp));
  for (const f of offFactors) if (f <= 1e-6) return 0;
  const offProd = offFactors.reduce((s, x) => s * x, 1);
  const matrixLegs = legs.filter((k) => !isOffMatrixLeg(k));
  let p = 0;
  for (let h = 0; h < ctx.matrix.length; h++) {
    const row = ctx.matrix[h] ?? [];
    for (let a = 0; a < row.length; a++) {
      const cell = row[a] ?? 0;
      if (cell <= 0) continue;
      let ok = true;
      for (const k of matrixLegs) {
        if (!orthoLegCoversCell(k, h, a)) {
          ok = false;
          break;
        }
      }
      if (ok) p += cell * offProd;
    }
  }
  return p;
}

/** برچسب کوتاه یک پایه (برای labelA/labelB پرتفوی) */
export function orthoLegLabel(key: string): string {
  return MARKET_LABELS[key] ?? key;
}

// ═══════════ سازنده زوج پرتفوی از الگو ═══════════

const REAL_PRICE_KEYS = ["HOME", "DRAW", "AWAY", "DC_1X", "DC_X2", "O15", "O25", "U25", "U35", "BTTS_Y", "BTTS_N", "C_O95", "C_U95"];

/**
 * تبدیل یک زوج اتمیک رسمی به PortfolioPairDTO استاندارد — مشترک بین
 * /api/agent/orthogonal و /api/agent/portfolio (v15.0).
 */
export function buildOrthoPortfolioPair(
  a: OrthoPair,
  match: { id: string; homeTeam: string; awayTeam: string },
  bankroll: number
): PortfolioPairDTO {
  const matchLabel = `${match.homeTeam} - ${match.awayTeam}`;
  const impliedSum = a.impliedSum;
  const stakeA = bankroll * (1 / Math.max(1.01, a.slipA.odds)) / impliedSum;
  const stakeB = bankroll * (1 / Math.max(1.01, a.slipB.odds)) / impliedSum;
  // v8.0 — فرمول صحیح سود خالص واحد: Payout − B که Payout = B / S
  const profit = bankroll / impliedSum - bankroll;

  const selectionA: PortfolioSelectionDTO = {
    key: `ORTHO_${a.code}_A`,
    label: a.slipA.label,
    matchId: match.id,
    matchLabel,
    modelProb: a.slipA.prob,
    bestOdds: a.slipA.odds,
    bestBook: "بازارهای اتمیک رسمی v15.0",
    // v10.0 — ارزش عددی همیشه دارد: (prob مدل × ضریب − ۱) × ۱۰۰ نسبت به خط منصفانه
    sharpOdds: a.slipA.odds,
    evPct: a.slipA.prob * a.slipA.odds - 1,
    sharpEdgePct: Math.round((a.slipA.prob * a.slipA.odds - 1) * 1000) / 10,
  } as PortfolioSelectionDTO;
  const selectionB: PortfolioSelectionDTO = {
    key: `ORTHO_${a.code}_B`,
    label: a.slipB.label,
    matchId: match.id,
    matchLabel,
    modelProb: a.slipB.prob,
    bestOdds: a.slipB.odds,
    bestBook: "بازارهای اتمیک رسمی v15.0",
    sharpOdds: a.slipB.odds,
    evPct: a.slipB.prob * a.slipB.odds - 1,
    sharpEdgePct: Math.round((a.slipB.prob * a.slipB.odds - 1) * 1000) / 10,
  } as PortfolioSelectionDTO;
  // v10.0 — ارزش عددی جفت‌تیپ: میانگین لبه دو سمت
  const pairSharpEdgePct = Math.round(((selectionA.sharpEdgePct ?? 0) + (selectionB.sharpEdgePct ?? 0)) / 2 * 10) / 10;
  const structure: PairStructureDTO = {
    baseKey: "ORTHO",
    varAKey: a.legsA[0] ?? "ORTHO_A",
    varBKey: a.legsB[0] ?? "ORTHO_B",
    varAMatchId: match.id,
    varBMatchId: match.id,
    legsA: a.legsA,
    legsB: a.legsB,
    band: null,
    synthetic: a.legsA.some((k) => !REAL_PRICE_KEYS.includes(k)) || a.legsB.some((k) => !REAL_PRICE_KEYS.includes(k)),
    doubleWin: a.overlapPct > 0.02,
  };
  const kelly = simultaneousKelly(
    [
      { p: a.jointStates.bothWin, aWins: true, bWins: true },
      { p: a.jointStates.aOnly, aWins: true, bWins: false },
      { p: a.jointStates.bOnly, aWins: false, bWins: true },
      { p: a.jointStates.bothLose, aWins: false, bWins: false },
    ],
    a.slipA.odds,
    a.slipB.odds
  );

  return {
    id: `ortho-${a.code}-${match.id}`,
    kind: "SINGLE_MATCH_BUILDER",
    labelA: a.slipA.label,
    labelB: a.slipB.label,
    // v15.0 — متادیتای اجرایی نهادی: نام رسمی مارکت انگلیسی + نشان قانون تسویه
    marketAEn: a.slipA.labelEn,
    marketBEn: a.slipB.labelEn,
    settlementRule: SETTLEMENT_RULE_EN,
    structure,
    selectionA,
    selectionB,
    totalOddsA: a.slipA.odds,
    totalOddsB: a.slipB.odds,
    jointStates: a.jointStates,
    impliedSum,
    guaranteedMarginPct: (1 - impliedSum) * 100,
    equalProfit: { stakeA: Math.round(stakeA * 10) / 10, stakeB: Math.round(stakeB * 10) / 10, profit: Math.round(profit * 10) / 10 },
    kelly: { fA: Math.round(kelly.fA * 1000) / 1000, fB: Math.round(kelly.fB * 1000) / 1000, growth: kelly.growth },
    sharpEdgePct: pairSharpEdgePct,
    archetype: {
      code: a.code,
      name: a.name,
      short: a.short,
      rationale: a.rationale,
      orthogonalityPct: a.orthogonalityPct,
      coveragePct: a.coveragePct,
      overlapPct: a.overlapPct,
    },
    trap: { verdict: "NONE", title: "بدون شرط وابسته", message: "هر تیپ یک مارکت تک‌دکمه‌ای رسمی است — صفر ضرب گزینه‌های وابسته (قانون v15.0)" },
    verdict:
      a.jointStates.bothLose < 0.2
        ? "پوشش اتمیک معتبر — دو دکمه رسمی مکمل؛ باخت همزمان فقط در سناریوی خیلی خاص"
        : "پوشش اتمیک پرریسک — سناریوی میانی هر دو تیپ را می‌سوزاند؛ صرفاً برای تنوع",
  };
}
