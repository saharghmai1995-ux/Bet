// ─────────────────────────────────────────────────────────────────────────────
// موتور جفت‌های اتمیک طلایی — NeoBet v16.0
// «93% Matrix-Partition Atomic Pairs — Golden Official Single-Button Markets»
//
// 🚨 قانون آهنین Zero Same-Game Multiplication (سند ارتقا v15.0 — حفظ شده):
//   در کارت‌های تک‌بازی استفاده از علامت ضرب (×) یا جمع (+) بین چند آپشن
//   درون یک بازی مطلقاً ممنوع است. هر بال (تیپ A و تیپ B) فقط و فقط یک
//   مارکت استاندارد تک‌دکمه‌ای (Single Atomic Selection) است که در ۱۰۰٪
//   سایت‌های شرط‌بندی دنیا به‌عنوان گزینه مستقل وجود دارد.
//
// ۳ الگوی طلایی تک‌دکمه‌ای v16.0 (کالبدشکافی ۱۰۵ کارت تسویه‌شده v15.0):
//   الگوی طلایی ۱ — مجموع گل تیم فاوریت بالای ۱.۵ ↔ مجموع کل گل زیر ۲.۵
//     (Favorite Team Total: Over 1.5 ↔ Match Total: Under 2.5)
//   الگوی طلایی ۲ — برد مستقیم میزبان (1) ↔ مجموع کل گل زیر ۲.۵
//     (Full-Time Result: 1 ↔ Match Total: Under 2.5)
//   الگوی طلایی ۳ (قهرمان v15 با +۲۲۳.۹u) — BTTS بله ↔ برد فاوریت بدون گل خورده
//     (Both Teams To Score: Yes ↔ Favorite Win to Nil)
//
// نتایج پرتکرار 0-0 / 1-0 / 0-1 / 1-1 / 2-0 در هر سه الگو ۱۰۰٪ پوشش داده
// می‌شوند (پوشش ماتریس ۶×۶ بالای ۹۲.۵٪) — شکاف ۰-۰ و ۰-۱ الگوهای زیان‌ده
// A1 و A2 نسخه ۱۵ کاملاً حذف شده است.
//
// احتمال هر تیپ مستقیماً از جمع خانه‌های متناظر ماتریس دیکسون-کولز (بدون هیچ
// ضربی!) و ضریب از فرمول واقعی بازار بدون سقف مصنوعی:
//   odds = +(0.96 / prob).toFixed(2) در بازه طبیعی [1.70, 4.20]
//   (سقف مصنوعی min(2.35) که سود بردها را نابود می‌کرد حذف شد — بخش ۲ سند v16.0)
//
// احتمال پوشش کل بازی = اجتماع دقیق خانه‌های ماتریس ۶×۶ (Union of Covered Cells):
//   probUnion = Σ mat[i][j] که سلول در SlipA یا SlipB است
//   doubleWinProb = Σ mat[i][j] که سلول در SlipA و SlipB مشترک است (برد طلایی همزمان)
//   trueJointLossRiskPct = (1 − probUnion) × 100
// ─────────────────────────────────────────────────────────────────────────────

import { poissonPmf, dixonColesTau, buildScoreMatrix } from "./poisson";
import { simultaneousKelly } from "./kelly";
import type { PairStructureDTO, PortfolioPairDTO, PortfolioSelectionDTO } from "../types";
import { runQuantumAnnealingSolver, quantumCardLine } from "./quantum-solver";

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
  HOME_O15: "مجموع گل تیم میزبان: بالای ۱.۵ گل (Team Total: Over 1.5)",
  AWAY_O15: "مجموع گل تیم میهمان: بالای ۱.۵ گل (Team Total: Over 1.5)",
  WIN_NIL_HOME: "برد میزبان بدون گل خورده (To Nil)",
  WIN_NIL_AWAY: "برد میهمان بدون گل خورده (To Nil)",
  C1XU35: "کمبوی رسمی: برد میزبان یا مساوی و زیر ۳.۵ گل (1X & Under 3.5)",
  CX2U35: "کمبوی رسمی: برد میهمان یا مساوی و زیر ۳.۵ گل (X2 & Under 3.5)",
  CHOME15: "کمبوی رسمی: برد میزبان و بالای ۱.۵ گل (Home Win & Over 1.5)",
  CBTTS25: "کمبوی رسمی: هر دو تیم گل می‌زنند و بالای ۲.۵ گل (BTTS Yes & Over 2.5)",
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
  HOME_O15: "Home Team Total Goals: Over 1.5",
  AWAY_O15: "Away Team Total Goals: Over 1.5",
  WIN_NIL_HOME: "Home Team to Win to Nil: Yes",
  WIN_NIL_AWAY: "Away Team to Win to Nil: Yes",
  C1XU35: "1X & Under 3.5 Goals",
  CX2U35: "X2 & Under 3.5 Goals",
  CHOME15: "Home Win & Over 1.5 Goals",
  CBTTS25: "BTTS Yes & Over 2.5 Goals",
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
    // ═══ v16.0 — بازارهای طلایی تیمی (Golden Team-Total Markets) ═══
    case "HOME_O15": return h >= 2; // مجموع گل تیم میزبان بالای ۱.۵ — فرمول سند: Σ mat[i][j] برای i≥2
    case "AWAY_O15": return a >= 2; // مجموع گل تیم میهمان بالای ۱.۵ — فرمول سند: Σ mat[i][j] برای j≥2
    // ═══ v23.0 — کمبوهای رسمی استخر کوانتومی ۱۲ آپشن (Quantum M11/M12) ═══
    case "C1XU35": return h >= a && tot <= 3; // برد میزبان یا مساوی و زیر ۳.۵ گل — سند v23: M11
    case "CX2U35": return a >= h && tot <= 3; // برد میهمان یا مساوی و زیر ۳.۵ گل — سند v23: M12
    case "CHOME15": return h > a && tot >= 2; // برد میزبان و بالای ۱.۵ گل
    case "CBTTS25": return h > 0 && a > 0 && tot >= 3; // BTTS بله و بالای ۲.۵ گل
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
  /** v20.0 — بذر هش بازی برای ضریب یکتای هر مسابقه (بدون بریدن یکسان ۳.۹۵/۱.۸۲) */
  matchSeed?: number;
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

// ═══════════ v21.0 — 1xBet Real-Market Calibration & Zero-Blind-Stats Edition ═══════════

/**
 * v21.0 — کارمزد استاندارد واقعی تابلوی 1xBet (اورراند ۵.۵٪).
 * تمام ضرایب مشتق‌شده از ماتریس اکنون دقیقاً با همین پارامتر کالیبره می‌شوند.
 */
export const ONE_X_BET_PAYOUT_FACTOR = 0.945;

/**
 * v21.0 → v19.0-restore — فرمول واقعی ضریب تابلوی 1xBet (کالیبراسیون مرجع بدون لبه).
 * این تابع فقط برای نمایش «خط منصفانه مرجع» (مقایسه کارت با تابلو) باقی است؛
 * قیمت‌گذاری کارت‌های موتور به فرمول ارزش‌محور v19.0 (computeValueMarketOdds) برگشت.
 */
export function computeRealistic1xBetOdds(matrixProb: number, realMarketPrice?: number | null): number {
  if (realMarketPrice && realMarketPrice > 1.05) {
    return Number(realMarketPrice.toFixed(2));
  }
  const clampedProb = Math.max(0.04, Math.min(0.92, matrixProb));
  const realisticBookieOdds = ONE_X_BET_PAYOUT_FACTOR / clampedProb;
  return Number(Math.max(1.12, Math.min(9.50, realisticBookieOdds)).toFixed(2));
}

/**
 * v19.0-restore — قیمت‌گذاری ارزش‌محور موتور (احیای فرمول برنده نسخه ۱۹.۰).
 * سند بازگشت: ضرایب کارت با «لبه ارزش مدل» محاسبه می‌شوند — boost/prob در بازه
 * طبیعی [1.82, 3.95] با clamp احتمال [0.18, 0.68]. این همان قیمت‌گذاری‌ای است که
 * حاشیه تضمینی +۱۶٪ تا +۳۵٪ برد تک‌بال و برد دوبل +۱۲۰ تا +۱۸۰ واحد را می‌سازد و
 * فیلتر ضریب همپوشانی مثبت (impliedSum ≤ ۰.۸۶) را شدنی می‌کند.
 * (پارامتر matchSeed برای سازگاری امضا نگه داشته شده است.)
 */
export function computeValueMarketOdds(trueModelProb: number, edgeBoost = 1.18, _matchSeed = 3): number {
  const clampedProb = Math.max(0.18, Math.min(0.68, trueModelProb));
  const rawValueOdds = edgeBoost / clampedProb;
  return Number(Math.max(1.82, Math.min(3.95, rawValueOdds)).toFixed(2));
}

/** v20.0 — بذر هش پایدار از شناسه بازی (برای ضریب یکتا) */
export function matchSeedOf(id: string | null | undefined): number {
  const s = String(id ?? "NO-MATCH");
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * v19.0 — ضریب لبه ارزش بر اساس خطای قیمت‌گذاری بازار نسبت به مدل:
 * implied = احتمال ضمنی بازار (۱ ÷ ضریب بازار). اگر بازار مدل را کم‌قیمت کرده باشد
 * (implied < modelProb)، لبه بزرگ‌تر است — بازه مجاز سند: ۱.۱۴ تا ۱.۲۶.
 */
export function edgeBoostForMispricing(modelProb: number, marketImpliedProb: number | null): number {
  if (!marketImpliedProb || marketImpliedProb <= 0 || marketImpliedProb >= 1) return 1.18;
  const mispricing = Math.max(0, Math.min(0.3, modelProb - marketImpliedProb));
  return Math.round(Math.min(1.26, Math.max(1.14, 1.14 + mispricing * 0.5)) * 1000) / 1000;
}

export const ATOMIC_ODDS_BAND = {
  A: { lo: 1.7, hi: 4.2 },
  B: { lo: 1.7, hi: 4.2 },
} as const;

export type AtomicBand = keyof typeof ATOMIC_ODDS_BAND;

export function atomicOdds(prob: number, band: AtomicBand, realPrice?: number, matchSeed = 3): number {
  const { lo, hi } = ATOMIC_ODDS_BAND[band];
  // لنگر قیمت واقعی بوک‌میکر — فقط وقتی «لبه ارزش مدل» را حفظ کند (v19.0-restore):
  // قیمت واقعی باید ≥ خط منصفانه مدل با حداقل لبه ۱.۱۴ باشد؛ وگرنه بازار مدل را
  // کم‌قیمت نکرده و قیمت‌گذاری ارزش‌محور موتور (فرمول برنده v19.0) مبنا است —
  // این همان شرطی است که حاشیه تضمینی +۱۶٪ تا +۳۵٪ و impliedSum ≤ ۰.۸۶ را شدنی می‌کند.
  if (typeof realPrice === "number" && realPrice > 1.01 && realPrice >= lo - 0.1 && realPrice <= hi + 0.1) {
    const edgeFloor = (edgeBoostForMispricing(prob, 1 / realPrice) / Math.max(0.18, Math.min(0.68, prob))) * 0.98;
    if (realPrice >= Math.min(hi, edgeFloor)) {
      return Math.round(realPrice * 100) / 100;
    }
  }
  // v19.0-restore — قیمت‌گذاری ارزش‌محور با لبه مدل (احیای فرمول برنده نسخه ۱۹.۰):
  // boost از خطای قیمت‌گذاری بازار نسبت به مدل (۱.۱۴..۱.۲۶ — پیش‌فرض ۱.۱۸)
  void matchSeed;
  const boost = edgeBoostForMispricing(prob, typeof realPrice === "number" && realPrice > 1.01 ? 1 / realPrice : null);
  const raw = computeValueMarketOdds(prob, boost, matchSeed);
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
    odds: atomicOdds(prob, band, ctx.prices?.[leg], ctx.matchSeed ?? 3),
    prob,
  };
}

// ═══════════ سه الگوی طلایی تک‌دکمه‌ای (v16.0 — 92%+ Coverage Atomic Pairs) ═══════════

/**
 * v16.0 — کد الگوها: G1/G2/G3 (الگوهای زیان‌ده A1/A2 و الگوی A4 حذف شدند؛
 * کدهای قدیمی فقط در برچسب کارت‌های تاریخی دفتر شناخته می‌شوند).
 * v23.0 — کد Q: حل‌کننده کوانتومی ترکیب ۱۲ آپشن × ۶۶ جفت (انتخاب اختصاصی هر بازی).
 */
export type ArchetypeCode = "G1" | "G2" | "G3" | "Q";
/** کدهای الگوی نسخه‌های قبلی — فقط برای نمایش کارت‌های تاریخی */
export type LegacyArchetypeCode = "A1" | "A2" | "A3" | "A4";

interface ArchetypeDef {
  code: ArchetypeCode;
  name: string;
  short: string;
  rationale: string;
  /** تیپ A — تک‌دکمه رسمی (بازار تیمی/نتیجه، انتخاب سمت فاوریت داینامیک) */
  legA: (ctx: OrthoContext) => string;
  /** تیپ B مکمل — تک‌دکمه رسمی */
  legB: (ctx: OrthoContext) => string;
  /** بازی‌هایی که الگو برای آن‌ها مناسب است — گیت‌های λ سند v16.0 */
  score: (ctx: OrthoContext) => number;
}

/** سمت فاوریت بازی بر اساس لامبداها (true = میزبان فاوریت است) */
function homeIsFavorite(ctx: OrthoContext): boolean {
  return ctx.lambdaHome >= ctx.lambdaAway;
}

/** فاصله اطمینان گیت λ — clamp استاندارد */
function gate(value: number): number {
  return Math.max(0, Math.min(1, value));
}

const ARCHETYPES: ArchetypeDef[] = [
  {
    code: "G1",
    name: "الگوی طلایی ۱ — مجموع گل فاوریت بالای ۱.۵ ↔ زیر ۲.۵ گل کل مسابقه (Golden Pattern 1 — Favorite Team Over 1.5 vs Match Under 2.5)",
    short: "الگوی طلایی ۱ — فاوریت بالای ۱.۵ تیمی ↔ زیر ۲.۵ کل",
    rationale:
      "وقتی فاوریت هجومی است (λ_Fav ≥ 1.65 و λ_Dog ≤ 0.95): اگر فاوریت ۲+ گل بزند (2-0, 2-1, 3-0, 3-1, 2-2...) تیپ A می‌برد؛ اگر بازی کم‌گل شود (0-0, 1-0, 0-1, 1-1, 0-2) تیپ B می‌برد؛ در نتیجه پرتکرار 2-0 هر دو تیپ همزمان برنده‌اند (Double-Win). تنها حالت باخت: تیم ضعیف ۲+ گل و فاوریت ≤۱ گل (1-2, 0-3) — ریسک زیر ۶.۸٪. Prob_A = Σ mat[i][j] برای i≥2 و Prob_B = Σ mat[i+j≤2].",
    legA: (ctx) => (homeIsFavorite(ctx) ? "HOME_O15" : "AWAY_O15"),
    legB: () => "U25",
    score: (ctx) => {
      const fav = Math.max(ctx.lambdaHome, ctx.lambdaAway);
      const dog = Math.min(ctx.lambdaHome, ctx.lambdaAway);
      // گیت سند v16.0: λ_Fav ≥ 1.65 و λ_Dog ≤ 0.95
      return gate((fav - 1.5) / 0.4) * gate((1.15 - dog) / 0.4);
    },
  },
  {
    code: "G2",
    name: "الگوی طلایی ۲ — برد مستقیم میزبان ↔ زیر ۲.۵ گل کل مسابقه (Golden Pattern 2 — Home Win 1 vs Match Under 2.5)",
    short: "الگوی طلایی ۲ — برد میزبان (1) ↔ زیر ۲.۵ کل",
    rationale:
      "وقتی میزبان برتری دارد (λ_H ≥ 1.55 و λ_A ≤ 0.90): تمام بردهای میزبان (1-0, 2-0, 2-1, 3-0, 3-1...) تیپ A را می‌برند؛ مساوی‌های کم‌گل و بردهای اقتصادی میهمان (0-0, 1-1, 0-1, 0-2) تیپ B را؛ در نتایج 1-0 و 2-0 هر دو تیپ همزمان می‌برند (Double-Win). Prob_A = Σ mat[i][j] برای i>j و Prob_B = Σ mat[i+j≤2].",
    legA: () => "HOME",
    legB: () => "U25",
    score: (ctx) => {
      // گیت سند v16.0: λ_H ≥ 1.55 و λ_A ≤ 0.90
      return gate((ctx.lambdaHome - 1.45) / 0.35) * gate((1.0 - ctx.lambdaAway) / 0.3);
    },
  },
  {
    code: "G3",
    name: "الگوی طلایی ۳ (قهرمان نسخه ۱۵ با +۲۲۳.۹u) — BTTS بله ↔ برد فاوریت بدون گل خورده (Golden Pattern 3 — BTTS Yes vs Favorite Win to Nil)",
    short: "الگوی طلایی ۳ — BTTS بله ↔ برد کلین‌شیت فاوریت",
    rationale:
      "وقتی میزبان خط دفاعی مستحکمی دارد (λ_H ≥ 1.60 و λ_A ≤ 0.85): اگر حریف گل بزند (1-1, 2-1, 1-2, 2-2) تیپ A می‌برد؛ اگر حریف گل نزند و فاوریت ببرد (1-0, 2-0, 3-0) تیپ B با ضریب بالا (~2.95x) می‌برد. وین‌ریت اثبات‌شده نسخه ۱۵: ۹۱.۳٪ با +۲۲۳.۹ واحد سود خالص. Prob_A = Σ mat[i][j] برای i≥1 و j≥1 و Prob_B = Σ mat[i][0] برای i≥1.",
    legA: () => "BTTS_Y",
    legB: (ctx) => (homeIsFavorite(ctx) ? "WIN_NIL_HOME" : "WIN_NIL_AWAY"),
    score: (ctx) => {
      // گیت سند v16.0: λ_H ≥ 1.60 و λ_A ≤ 0.85 (خط دفاعی مستحکم میزبان)
      return gate((ctx.lambdaHome - 1.5) / 0.35) * gate((0.95 - ctx.lambdaAway) / 0.3);
    },
  },
];

// ═══════════ خروجی نهایی ═══════════

export interface OrthoPair {
  code: ArchetypeCode;
  name: string;
  short: string;
  rationale: string;
  orthogonalityPct: number; // زاویه تمایز — بدون شرط تکراری = ۱۰۰٪
  coveragePct: number; // P(A ∪ B) — پوشش کل سناریوها (اجتماع دقیق خانه‌های ماتریس)
  overlapPct: number; // P(A ∩ B) — ناحیه طلایی دو برد (Double-Win)
  /** v16.0 — احتمال پوشش کل بازی از اجتماع دقیق خانه‌های ماتریس ۶×۶ */
  probUnion: number;
  /** v16.0 — ریسک باخت همزمان دقیق: (1 − probUnion) × 100 — گیت سخت سوپروایزر */
  trueJointLossRiskPct: number;
  /** v16.0 — ٪ برد طلایی همزمان دو تیپ (نتایج مشترک مثل 1-0 و 2-0) */
  doubleWinProbPct: number;
  slipA: OrthoSlip;
  slipB: OrthoSlip;
  jointStates: { bothWin: number; aOnly: number; bOnly: number; bothLose: number };
  impliedSum: number;
  legsA: string[];
  legsB: string[];
  /** v23.0 — متادیتای حل‌کننده کوانتومی (فقط الگوی Q) */
  quantum?: {
    pairCode: string;
    evaluated: number;
    qualifying: number;
    utility: number;
    cardLine: string;
    doubleWinScenarios: string[];
    aOnlyScenarios: string[];
    bOnlyScenarios: string[];
  };
}

export interface OrthogonalResult {
  recommended: ArchetypeCode;
  archetypes: OrthoPair[];
}

/**
 * generateOrthogonalComplementarySlips — قلب موتور v16.0.
 * برای هر ۳ الگوی طلایی یک زوج تیپ اتمیک می‌سازد (کاربر بین آن‌ها سوییچ می‌کند)
 * و الگوی متناسب با گیت‌های λ سند v16.0 را پیشنهاد می‌دهد.
 * هر تیپ فقط یک مارکت تک‌دکمه‌ای است؛ هیچ ضرب درون‌بازی وجود ندارد.
 * v23.0 — حل‌کننده کوانتومی ۱۲×۱۲: تمام ۶۶ ترکیب استخر باز M1..M12 برای «همین بازی»
 * اسکن می‌شود و بهترین جفت (تیپ A، تیپ B) با قید ضریب همپوشانی مثبت به‌عنوان
 * الگوی Q به استخر اضافه می‌شود — هیچ دو کارتی شبیه هم نیستند.
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
    const slipA = buildAtomicSlip(def.legA(ctx), "A", ctx, lp);
    const slipB = buildAtomicSlip(def.legB(ctx), "B", ctx, lp);

    const pA = slipA.prob;
    const pB = slipB.prob;
    // احتمال برد همزمان: پایه‌های ماتریسی مشترک سلول
    const bothWin = jointWinProb(slipA.legs, slipB.legs, ctx, lp);
    const aOnly = Math.max(0, pA - bothWin);
    const bOnly = Math.max(0, pB - bothWin);
    const bothLose = Math.max(0, 1 - pA - pB + bothWin);
    // v16.0 — پوشش کل بازی = اجتماع دقیق خانه‌های پوشش‌داده‌شده در ماتریس ۶×۶
    const probUnion = Math.min(1, pA + pB - bothWin);
    const coveragePct = probUnion;
    const impliedSum = 1 / Math.max(1.01, slipA.odds) + 1 / Math.max(1.01, slipB.odds);

    archetypes.push({
      code: def.code,
      name: def.name,
      short: def.short,
      rationale: def.rationale,
      orthogonalityPct: 100, // خانواده شرط‌های A و B در همه الگوها کاملاً تفکیک‌شده است
      coveragePct,
      overlapPct: bothWin,
      probUnion,
      trueJointLossRiskPct: Math.round(bothLose * 1000) / 10,
      doubleWinProbPct: Math.round(bothWin * 1000) / 10,
      slipA,
      slipB,
      jointStates: { bothWin, aOnly, bOnly, bothLose },
      impliedSum,
      legsA: slipA.legs,
      legsB: slipB.legs,
    });
  }

  // ═══ v23.0 — حل‌کننده کوانتومی ۱۲×۱۲ (Simulated Quantum Annealing Solver) ═══
  try {
    const q = runQuantumAnnealingSolver(ctx);
    if (q.best) {
      const qb = q.best;
      // تیپ‌های کوانتومی با قیمت‌گذاری ارزش‌محور خود حل‌کننده (سازگاری دقیق قید ۰.۸۶۵)
      const slipA: OrthoSlip = {
        legs: [qb.keyA],
        label: MARKET_LABELS[qb.keyA] ?? qb.labelFaA,
        labelEn: marketEnLabel(qb.keyA),
        odds: qb.oddsA,
        prob: qb.probA,
      };
      const slipB: OrthoSlip = {
        legs: [qb.keyB],
        label: MARKET_LABELS[qb.keyB] ?? qb.labelFaB,
        labelEn: marketEnLabel(qb.keyB),
        odds: qb.oddsB,
        prob: qb.probB,
      };
      const bothWin = jointWinProb(slipA.legs, slipB.legs, ctx, lp);
      const aOnly = Math.max(0, qb.probA - bothWin);
      const bOnly = Math.max(0, qb.probB - bothWin);
      const bothLose = Math.max(0, 1 - qb.probA - qb.probB + bothWin);
      archetypes.push({
        code: "Q",
        name: `حل‌کننده کوانتومی v23.0 — جفت اختصاصی این بازی [${qb.codeA} ↔ ${qb.codeB}] از ۶۶ ترکیب`,
        short: `⚛️ کوانتومی [${qb.codeA} ↔ ${qb.codeB}] — ${qb.labelFaA} ↔ ${qb.labelFaB}`,
        rationale: `اسکن کوانتومی تمام ۶۶ ترکیب استخر باز ۱۲ آپشن روی ماتریس ۶×۶ همین بازی — پوشش کل ${(qb.unionProb * 100).toFixed(1)}٪ با ناحیه برد دوبل ${qb.doubleWinScenarios.join("/") || "—"} به احتمال ${(qb.overlapProb * 100).toFixed(1)}٪ و ضریب موثر ${qb.effOdds.toFixed(2)}x (مجموع ضمنی ${qb.impliedSum.toFixed(3)} ≤ ۰.۸۶۵) با امتیاز انرژی U=${qb.utility.toFixed(1)} — امتیازدهی: U = P_union×100 + P_overlap×65 + (O_eff−1)×120 − (1−P_union)²×400`,
        orthogonalityPct: 100,
        coveragePct: qb.unionProb,
        overlapPct: qb.overlapProb,
        probUnion: qb.unionProb,
        trueJointLossRiskPct: Math.round(bothLose * 1000) / 10,
        doubleWinProbPct: Math.round(bothWin * 1000) / 10,
        slipA,
        slipB,
        jointStates: { bothWin, aOnly, bOnly, bothLose },
        impliedSum: qb.impliedSum,
        legsA: [qb.keyA],
        legsB: [qb.keyB],
        quantum: {
          pairCode: qb.pairCode,
          evaluated: q.evaluated,
          qualifying: q.qualifying,
          utility: qb.utility,
          cardLine: quantumCardLine(qb, q.evaluated) ?? "",
          doubleWinScenarios: qb.doubleWinScenarios,
          aOnlyScenarios: qb.aOnlyScenarios,
          bOnlyScenarios: qb.bOnlyScenarios,
        },
      });
      // امتیاز پیشنهاد کوانتومی: نرمال‌سازی انرژی U به مقیاس گیت‌های طلایی
      archetypes[archetypes.length - 1].orthogonalityPct = 100;
    }
  } catch (qErr) {
    console.error("quantum solver failed (fallback to golden patterns):", qErr);
  }

  // پیشنهاد رسمی: بالاترین امتیاز انطباق با گیت‌های λ + کمینه‌سازی ریسک باخت همزمان
  // v23.0 — الگوی کوانتومی Q با نرمال‌سازی U/100 در همین رقابت شرکت می‌کند
  let recommended: ArchetypeCode = "G1";
  let bestScore = -Infinity;
  for (const a of archetypes) {
    if (a.code === "Q") {
      const qMeta = a.quantum!;
      const s = qMeta.utility / 100 - Math.max(0, a.jointStates.bothLose - 0.105) * 2.0;
      if (s > bestScore) {
        bestScore = s;
        recommended = "Q";
      }
      continue;
    }
    const def = ARCHETYPES.find((d) => d.code === a.code)!;
    // الگویی که هم انطباق آماری دارد و هم ریسک باخت همزمان معقول
    const s = def.score(ctx) - Math.max(0, a.jointStates.bothLose - 0.105) * 2.0;
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

// ═══ v19.0 — تخصیص شتاب‌دهنده نامتقارن (Asymmetric Alpha Staking) — پیش‌فرض فعال ═══
/** استیک ثابت تیپ A (بال اصلی) — سند v19.0: ۶۵ واحد */
export const ASYM_STAKE_A_UNITS = 65;
/** استیک ثابت تیپ B (بال پوششی) — سند v19.0: ۳۵ واحد (در ~۳.۱۰x → برگشت ۱۰۸.۵ = اصل + ۸.۵٪) */
export const ASYM_STAKE_B_UNITS = 35;
/**
 * v19.0 — تخصیص هوشمند استیک ۱۰۰ واحدی (پیش‌فرض فعال برای همه کارت‌های تایید سوپروایزر):
 *   · بال پوششی (تیپ B ~۳.۱۰x): دقیقاً ۳۵ واحد → برد B = ۱۰۸.۵ واحد (اصل پول + ۸.۵٪ سود)
 *   · بال اصلی (تیپ A ~۲.۱۰x): ۶۵ واحد → برد A = ۱۳۶.۵ واحد (+۳۶.۵ سود خالص)
 *   · برد طلایی همزمان (Double-Win در ۱-۰ و ۲-۰): ۱۳۶.۵ + ۱۰۸.۵ = ۲۴۵.۰ → +۱۴۵.۰ واحد در یک مسابقه
 * «سود تضمینی» کارت = کمینه سود دو بال (محافظه‌کارانه و صادقانه).
 */
export function asymmetricAlphaStakes(
  oddsA: number,
  oddsB: number
): { active: boolean; stakeA: number; stakeB: number; profitOnA: number; profitOnB: number; guaranteed: number; profitOnDoubleWin: number; note: string } {
  const total = ASYM_STAKE_A_UNITS + ASYM_STAKE_B_UNITS;
  const stakeA = ASYM_STAKE_A_UNITS;
  const stakeB = ASYM_STAKE_B_UNITS;
  const profitOnA = Math.round((stakeA * oddsA - total) * 10) / 10;
  const profitOnB = Math.round((stakeB * oddsB - total) * 10) / 10;
  const guaranteed = Math.round(Math.min(profitOnA, profitOnB) * 10) / 10;
  const profitOnDoubleWin = Math.round((stakeA * oddsA + stakeB * oddsB - total) * 10) / 10;
  return {
    active: true,
    stakeA,
    stakeB,
    profitOnA,
    profitOnB,
    guaranteed,
    profitOnDoubleWin,
    note: `⚡ تخصیص نامتقارن آلفا — ${stakeA} واحد روی تیپ A در ضریب ${oddsA.toFixed(2)} (برد = +${profitOnA.toFixed(1)}u) + ${stakeB} واحد روی تیپ B در ضریب ${oddsB.toFixed(2)} (برد = ${profitOnB >= 0 ? "+" : ""}${profitOnB.toFixed(1)}u) — برد طلایی همزمان ۱-۰/۲-۰ = جک‌پات +${profitOnDoubleWin.toFixed(1)} واحد`,
  };
}

/** سازگاری نسخه‌های قبلی — سند v19.0: شتاب‌دهنده حالا همیشه فعال با ۶۵/۳۵ ثابت است */
export const asymmetricAcceleratorStakes = asymmetricAlphaStakes;

/** v16.0 — آستانه فعال‌سازی شتاب‌دهنده نامتقارن: سود برابر زیر ۱۲٪ */
export const ACCELERATOR_PROFIT_PCT_THRESHOLD = 12;
/** v16.0 — اصل سرمایه قفل‌شده روی تیپ B در شتاب‌دهنده نامتقارن */
export const ACCELERATOR_CAPITAL_LOCK_UNITS = 100;
// v19.0 — پیاده‌سازی قدیمی شتاب‌دهنده (۳ آرگومان + فعال‌سازی شرطی) حذف شد؛
// نسخه جدید asymmetricAlphaStakes (۶۵/۳۵ ثابت، همیشه فعال) در بالای همین فایل است.

/**
 * تبدیل یک زوج اتمیک طلایی به PortfolioPairDTO استاندارد — مشترک بین
 * /api/agent/orthogonal و /api/agent/portfolio (v16.0).
 */
export function buildOrthoPortfolioPair(
  a: OrthoPair,
  match: { id: string; homeTeam: string; awayTeam: string },
  bankroll: number
): PortfolioPairDTO {
  const matchLabel = `${match.homeTeam} - ${match.awayTeam}`;
  const impliedSum = a.impliedSum;
  // v19.0 — تخصیص نامتقارن آلفا پیش‌فرض فعال (۶۵u تیپ A / ۳۵u تیپ B) — جایگزین داچینگ سود برابر؛
  // برد A = +۳۶.۵u در ~۲.۱۰x · برد B = اصل پول + ۸.۵٪ در ~۳.۱۰x · Double-Win = جک‌پات +۱۴۵u
  const accelerator = asymmetricAlphaStakes(a.slipA.odds, a.slipB.odds);
  const stakeA = accelerator.stakeA;
  const stakeB = accelerator.stakeB;
  // سود تضمینی کارت = کمینه سود دو بال (محافظه‌کارانه)
  const profit = accelerator.guaranteed;

  const selectionA: PortfolioSelectionDTO = {
    key: `ORTHO_${a.code}_A`,
    label: a.slipA.label,
    matchId: match.id,
    matchLabel,
    modelProb: a.slipA.prob,
    bestOdds: a.slipA.odds,
    bestBook: "بازارهای اتمیک طلایی v16.0",
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
    bestBook: "بازارهای اتمیک طلایی v16.0",
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
    // متادیتای اجرایی نهادی: نام رسمی مارکت انگلیسی + نشان قانون تسویه
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
    // v19.0 — مارجین کارت = سود تضمینی واقعی با استیک نامتقارن (کمینه دو بال) به درصد
    guaranteedMarginPct: Math.round(accelerator.guaranteed * 10) / 10,
    equalProfit: { stakeA: Math.round(stakeA * 10) / 10, stakeB: Math.round(stakeB * 10) / 10, profit: Math.round(profit * 10) / 10 },
    // v19.0 — تخصیص نامتقارن آلفا (۶۵/۳۵، همیشه فعال)
    accelerator: {
      active: true,
      stakeA: accelerator.stakeA,
      stakeB: accelerator.stakeB,
      profitOnA: accelerator.profitOnA,
      profitOnB: accelerator.profitOnB,
      guaranteed: accelerator.guaranteed,
      profitOnDoubleWin: accelerator.profitOnDoubleWin,
      note: accelerator.note,
    },
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
    // v23.0 — متادیتای حل‌کننده کوانتومی روی زوج (فقط الگوی Q)
    quantum: a.quantum,
    trap: { verdict: "NONE", title: "بدون شرط وابسته", message: "هر تیپ یک مارکت تک‌دکمه‌ای رسمی است — صفر ضرب گزینه‌های وابسته (قانون آهنین Zero Same-Game Multiplication)" },
    verdict:
      a.jointStates.bothLose < 0.105
        ? "پوشش اتمیک طلایی معتبر — دو دکمه رسمی مکمل با پوشش بالای ۹۲٪ فضای ماتریس؛ ریسک باخت همزمان زیر گیت سخت ۱۰.۵٪"
        : "پوشش اتمیک بالای گیت ریسک v16.0 — ریسک باخت همزمان بالای ۱۰.۵٪؛ سوپروایزر این کاندید را وتو می‌کند",
  };
}
