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

// ═══════════ v21.0 — Reverse-Poisson 1xBet Solver (پنل تطبیق زنده فلش‌کارت) ═══════════

/**
 * v21.0 — مهندسی معکوس λ از «ضریب فعلی 1xBet یک مارکت واحد».
 * کاربر ضریب لحظه‌ای مارکت (مثلاً تیپ A) را در 1xBet می‌بیند و وارد پنل می‌کند؛
 * این حل‌کننده با جستجوی دوبخشی ضریب مقیاس k پیدا می‌کند که در آن
 * P_leg(λ_H×k, λ_A×k) = 0.945 ÷ O_user  (احتمال بدون کارمزد 1xBet)
 * — امید گل واقعی مستتر در تابلوی لحظه‌ای 1xBet استخراج می‌شود.
 */
export function solveImpliedLambdaForLeg(input: {
  /** گزاره مارکت روی سلول‌های ماتریس (h, a) — مثل (h,a)=>h>a برای برد میزبان */
  pred: (h: number, a: number) => boolean;
  /** ضریب فعلی کاربر در 1xBet */
  userOdds: number;
  /** λ مدل جاری */
  lambdaHome: number;
  lambdaAway: number;
  rho?: number;
}): { scale: number; lambdaHome: number; lambdaAway: number; impliedProb: number } | null {
  const { pred, userOdds, lambdaHome, lambdaAway, rho = -0.08 } = input;
  if (!Number.isFinite(userOdds) || userOdds <= 1.01) return null;
  if (!Number.isFinite(lambdaHome) || !Number.isFinite(lambdaAway) || lambdaHome <= 0 || lambdaAway <= 0) return null;

  // احتمال بدون کارمزد 1xBet از ضریب کاربر (سند v21.0: 0.945 ÷ O)
  const impliedProb = Math.max(0.02, Math.min(0.97, 0.945 / userOdds));

  const probAt = (k: number): number => {
    const matrix = buildScoreMatrix(lambdaHome * k, lambdaAway * k, rho, 8);
    let p = 0;
    for (let h = 0; h < matrix.length; h++) {
      const row = matrix[h] ?? [];
      for (let a = 0; a < row.length; a++) {
        if (pred(h, a)) p += row[a] ?? 0;
      }
    }
    return p;
  };

  // جستجوی دوبخشی روی مقیاس مشترک λ (بازه ۰.۲ تا ۳.۰)
  let lo = 0.2;
  let hi = 3.0;
  // اگر احتمال فعلی مدل بالاتر از هدف است، k باید کاهش یابد (P با k رشد یکنواخت دارد)
  let bestK = 1;
  for (let i = 0; i < 42; i++) {
    const mid = (lo + hi) / 2;
    const p = probAt(mid);
    bestK = mid;
    if (Math.abs(p - impliedProb) < 0.0005) break;
    if (p > impliedProb) hi = mid;
    else lo = mid;
  }

  const k = Math.round(bestK * 1000) / 1000;
  return {
    scale: k,
    lambdaHome: Math.round(lambdaHome * k * 100) / 100,
    lambdaAway: Math.round(lambdaAway * k * 100) / 100,
    impliedProb: Math.round(impliedProb * 1000) / 1000,
  };
}

/** درصد سود خالص داچینگ سود-برابر روی ضرایب کاربر — null یعنی 1/O_A+1/O_B ≥ 1 (بدون پوشش سودده) */
export function dutchProfitAtUserOdds(oddsA: number, oddsB: number, budget = 100): {
  stakeA: number;
  stakeB: number;
  profit: number;
  profitPct: number;
  impliedSum: number;
} | null {
  if (!Number.isFinite(oddsA) || !Number.isFinite(oddsB) || oddsA <= 1.01 || oddsB <= 1.01) return null;
  const impliedSum = 1 / oddsA + 1 / oddsB;
  if (impliedSum >= 1) return null;
  const stakeA = Math.round((budget * oddsB / (oddsA + oddsB)) * 10) / 10;
  const stakeB = Math.round((budget - stakeA) * 10) / 10;
  const payout = stakeA * oddsA; // = stakeB * oddsB
  const profit = Math.round((payout - budget) * 10) / 10;
  return { stakeA, stakeB, profit, profitPct: Math.round((profit / budget) * 1000) / 10, impliedSum: Math.round(impliedSum * 1000) / 1000 };
}

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
