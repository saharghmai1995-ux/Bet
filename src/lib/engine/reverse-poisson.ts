// ─────────────────────────────────────────────────────────────────────────────
// موتور مهندسی معکوس ضرایب بوک‌میکر (Reverse-Poisson Market-Implied λ Solver) — v9.0
//
// منطق علمی: ضرایب مرجع بازار (خط شارپ پیناکل / فید جهانی) دقیق‌ترین تخمین
// احتمالاتی را در دل خود دارند. به‌جای اینکه امید گل (λ) فقط از آمار فصل حساب
// شود، معادله پواسون/دیکسون-کولز «به‌صورت معکوس» روی ضرایب حل می‌شود تا
// ابرکامپیوتر بوک‌میکر استخراج شود:
//
//   ۱) Shin De-Vig  →  P_Home, P_Draw, P_Away, P_Over2.5 بدون کارمزد
//   ۲) Grid Search  →  (λmH, λmA) در بازه 0.30..3.50 گام 0.05 طوری که
//      Error = (P_mH − P_shinH)² + (P_mD − P_shinD)² + (P_mO25 − P_shinO25)²
//      کمینه شود (Least Squares روی ماتریس دیکسون-کولز)
//   ۳) فرمول ترکیبی طلایی:
//      λ_Final = (0.65 × λ_Market + 0.35 × λ_Stats) × C_Calibration
// ─────────────────────────────────────────────────────────────────────────────

import { buildScoreMatrix, aggregateMatrix } from "./poisson";
import { shinDevig, shinDevigPair } from "./devig";

/** وزن طلایی بازار در فرمول ترکیبی (سند ارتقا: ۶۵٪ بازار / ۳۵٪ آمار فصل) */
export const MARKET_WEIGHT = 0.65;
/** بازه و گام جستجوی شبکه‌ای سند ارتقا */
export const GRID_MIN = 0.3;
export const GRID_MAX = 3.5;
export const GRID_STEP = 0.05;

export interface MarketImpliedResult {
  lambdaHome: number;
  lambdaAway: number;
  /** خطای Least Squares برازش نهایی (کوچک‌تر = بازار منطبق‌تر) */
  fitError: number;
  /** احتمالات بدون کارمزد بوک‌میکر (شین) */
  shinProbs: { home: number; draw: number; away: number; over25: number | null };
  /** احتمالات ماتریس دیکسون-کولز در λ برنده */
  matrixProbs: { home: number; draw: number; away: number; over25: number };
  /** بازار Over/Under در دسترس بود؟ */
  hasTotals: boolean;
  /** تعداد نقاط گرید بررسی‌شده */
  gridPoints: number;
}

/** جفت λ بازار را از روی ضرایب واقعی 1X2 (+ خط گل 2.5) حل می‌کند */
export function solveMarketImpliedLambdas(input: {
  oddsHome: number;
  oddsDraw: number;
  oddsAway: number;
  oddsOver25?: number | null;
  oddsUnder25?: number | null;
  rho?: number;
}): MarketImpliedResult | null {
  const { oddsHome, oddsDraw, oddsAway, rho = -0.08 } = input;
  if (![oddsHome, oddsDraw, oddsAway].every((o) => Number.isFinite(o) && o >= 1.01)) return null;

  // ─── ۱) استخراج احتمال بدون کارمزد (شین) ───
  const shin = shinDevig([oddsHome, oddsDraw, oddsAway]);
  const pShinHome = shin.probs[0];
  const pShinDraw = shin.probs[1];
  const pShinAway = shin.probs[2];

  // بازار گل — شین دوحالته روی O/U 2.5 (در دسترس نبودن → برازش فقط روی 1X2)
  const hasTotals =
    Number.isFinite(input.oddsOver25 ?? NaN) &&
    Number.isFinite(input.oddsUnder25 ?? NaN) &&
    (input.oddsOver25 ?? 0) >= 1.01 &&
    (input.oddsUnder25 ?? 0) >= 1.01;
  const pair = hasTotals
    ? shinDevigPair([input.oddsOver25 as number, input.oddsUnder25 as number])
    : null;
  const pShinOver25 = pair ? pair.over : null;

  // ─── ۲) جستجوی شبکه‌ای سریع (۰.۳۰ تا ۳.۵۰ گام ۰.۰۵) ───
  const lambdas: number[] = [];
  for (let v = GRID_MIN; v <= GRID_MAX + 1e-9; v += GRID_STEP) lambdas.push(Math.round(v * 100) / 100);

  const errOf = (lh: number, la: number): { err: number; agg: ReturnType<typeof aggregateMatrix> } => {
    const agg = aggregateMatrix(buildScoreMatrix(lh, la, rho, 7));
    let err = (agg.pHome - pShinHome) ** 2 + (agg.pDraw - pShinDraw) ** 2;
    if (pShinOver25 !== null) err += (agg.pOver25 - pShinOver25) ** 2;
    return { err, agg };
  };

  let bestLh = 1.35;
  let bestLa = 1.25;
  let bestErr = Infinity;
  let bestAgg: ReturnType<typeof aggregateMatrix> | null = null;
  let points = 0;
  for (const lh of lambdas) {
    for (const la of lambdas) {
      points += 1;
      const { err, agg } = errOf(lh, la);
      if (err < bestErr) {
        bestErr = err;
        bestLh = lh;
        bestLa = la;
        bestAgg = agg;
      }
    }
  }

  // ─── ۳) پالایش محلی ظریف (±۰.۰۴ با گام ۰.۰۱) — دقت مهندسی روی برنده گرید ───
  for (let dh = -0.04; dh <= 0.041; dh += 0.01) {
    for (let da = -0.04; da <= 0.041; da += 0.01) {
      const lh = Math.round((bestLh + dh) * 100) / 100;
      const la = Math.round((bestLa + da) * 100) / 100;
      if (lh < GRID_MIN || la < GRID_MIN || lh > GRID_MAX || la > GRID_MAX) continue;
      points += 1;
      const { err, agg } = errOf(lh, la);
      if (err < bestErr) {
        bestErr = err;
        bestLh = lh;
        bestLa = la;
        bestAgg = agg;
      }
    }
  }

  if (!bestAgg) return null;
  return {
    lambdaHome: Math.round(bestLh * 100) / 100,
    lambdaAway: Math.round(bestLa * 100) / 100,
    fitError: Math.round(bestErr * 1e6) / 1e6,
    shinProbs: {
      home: Math.round(pShinHome * 1000) / 1000,
      draw: Math.round(pShinDraw * 1000) / 1000,
      away: Math.round(pShinAway * 1000) / 1000,
      over25: pShinOver25 !== null ? Math.round(pShinOver25 * 1000) / 1000 : null,
    },
    matrixProbs: {
      home: Math.round(bestAgg.pHome * 1000) / 1000,
      draw: Math.round(bestAgg.pDraw * 1000) / 1000,
      away: Math.round(bestAgg.pAway * 1000) / 1000,
      over25: Math.round(bestAgg.pOver25 * 1000) / 1000,
    },
    hasTotals,
    gridPoints: points,
  };
}

export interface HybridLambdaResult {
  /** λ استخراج‌شده از الگوی قیمت‌گذاری بوک‌میکر */
  marketHome: number;
  marketAway: number;
  /** λ مدل آماری جدول و فرم فصل */
  statsHome: number;
  statsAway: number;
  /** λ ترکیبی نهایی (بازار × وزن + آمار) × ضریب درس کالیبراسیون */
  finalHome: number;
  finalAway: number;
  /** ضریب درس کالیبراسیون اعمال‌شده (۱ = بدون تعدیل) */
  calibrationHome: number;
  calibrationAway: number;
  /** v14.0 — وزن بازار اعمال‌شده (۰.۶۵ پیش‌فرض / ۰.۷۵ بازی‌های ملی) */
  marketWeight: number;
  fitError: number | null;
  hasMarket: boolean;
}

/** دسته سبک بازار — فقط داده لازم برای فرمول ترکیبی */
export interface MarketHandle {
  lambdaHome: number;
  lambdaAway: number;
  fitError: number | null;
}

const clampLambda = (v: number): number => Math.max(0.2, Math.min(4.0, Math.round(v * 100) / 100));

/**
 * فرمول ترکیبی طلایی سند ارتقا:
 *   λ_Final = (W_Market × λ_Market + (1−W_Market) × λ_Stats) × C_Calibration
 *   v14.0 — W_Market بر اساس دسته رقابت: بازی‌های ملی ۰.۷۵ (۷۵٪ مهندسی معکوس
 *   بوک‌میکر / ۲۵٪ فرم ۵ بازی ملی)، سایر رقابت‌ها ۰.۶۵.
 * اگر بازار در دسترس نباشد، λ آمار با کالیبراسیون مسیر STATS_ONLY می‌رود.
 */
export function hybridLambda(input: {
  statsHome: number;
  statsAway: number;
  market: MarketHandle | null;
  calibrationHome?: number;
  calibrationAway?: number;
  /** v14.0 — وزن بازار (پیش‌فرض ۰.۶۵؛ بازی‌های ملی ۰.۷۵) */
  marketWeight?: number;
}): HybridLambdaResult {
  const w = Math.max(0, Math.min(1, input.marketWeight ?? MARKET_WEIGHT));
  const calH = Math.max(0.7, Math.min(1.3, input.calibrationHome ?? 1));
  const calA = Math.max(0.7, Math.min(1.3, input.calibrationAway ?? 1));
  if (!input.market) {
    return {
      marketHome: 0,
      marketAway: 0,
      statsHome: clampLambda(input.statsHome),
      statsAway: clampLambda(input.statsAway),
      finalHome: clampLambda(input.statsHome * calH),
      finalAway: clampLambda(input.statsAway * calA),
      calibrationHome: calH,
      calibrationAway: calA,
      marketWeight: w,
      fitError: null,
      hasMarket: false,
    };
  }
  const mh = input.market.lambdaHome;
  const ma = input.market.lambdaAway;
  const finalHome = clampLambda((w * mh + (1 - w) * input.statsHome) * calH);
  const finalAway = clampLambda((w * ma + (1 - w) * input.statsAway) * calA);
  return {
    marketHome: mh,
    marketAway: ma,
    statsHome: clampLambda(input.statsHome),
    statsAway: clampLambda(input.statsAway),
    finalHome,
    finalAway,
    calibrationHome: calH,
    calibrationAway: calA,
    marketWeight: w,
    fitError: input.market.fitError,
    hasMarket: true,
  };
}
