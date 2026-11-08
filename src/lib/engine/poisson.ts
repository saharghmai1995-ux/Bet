// ─────────────────────────────────────────────────────────────────────────────
// موتور کمّی: توزیع پواسون دو متغیره + مدل دیکسون-کولز
// Quantitative Engine: Bivariate Poisson + Dixon-Coles correction
// ─────────────────────────────────────────────────────────────────────────────
// λ_home = homeAttack × awayDefense × homeAdvantage × leagueAvg
// μ_away = awayAttack × homeDefense × leagueAvg
// توزیع وزنی زمانی (Time-decay): w = exp(−ξ × daysAgo) برای وزن‌دهی بازی‌های اخیر
// ─────────────────────────────────────────────────────────────────────────────

export interface DixonColesInput {
  homeAttack: number; // ضریب قدرت تهاجمی میزبان (۱ = میانگین لیگ)
  awayAttack: number;
  homeDefense: number; // ضریب ضعف تدافعی (کمتر = دفاع بهتر)
  awayDefense: number;
  leagueAvg: number; // میانگین گل هر تیم در هر بازی (پیش‌فرض ۱.۳۵)
  homeAdvantage: number; // ضریب میزبانی (پیش‌فرض ۱.۱۲)
  rho: number; // پارامتر همبستگی دیکسون-کولز (−۰.۲ تا ۰.۲)
  eloDiff: number; // (eloHome − eloAway) بعد از تعدیل غیبت‌ها
  eloWeight: number; // وزن اثر الو روی امید گل (۰ تا ۱)
  homeAbsenceImpact: number; // ۰ تا ۰.۵ — کسر اثر غیبت بازیکن کلیدی روی حمله میزبان
  awayAbsenceImpact: number;
  timeDecayXi: number; // ξ دیکسون-کولز برای وزن‌دهی بازی‌های اخیر
  daysAgo: number; // میانگین فاصله زمانی داده‌های تاریخی
}

export interface MarketProbabilities {
  lambdaHome: number;
  lambdaAway: number;
  pHome: number;
  pDraw: number;
  pAway: number;
  pOver25: number;
  pUnder25: number;
  pBtts: number;
  pHomeCleanSheet: number;
  pAwayCleanSheet: number;
  // سناریوهای ساختاریافته بازی
  scenarioClosed: number; // بازی بسته و کم‌گل (مجموع گل ≤ ۲)
  scenarioOpenHome: number; // برد پرگل میزبان
  scenarioOpenAway: number; // برد پرگل میهمان
  scenarioOther: number; // تساوی پرگل و سایر حالات
  topScores: { score: string; p: number }[];
  matrix: number[][]; // ماتریس نمره کامل برای heatmap
}

const MAX_GOALS = 9; // ماتریس نمره ۰ تا ۹ گل

function factorial(n: number): number {
  if (n <= 1) return 1;
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

export function poissonPmf(k: number, lambda: number): number {
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial(k);
}

/**
 * تابع تصحیح دیکسون-کولز: همبستگی نتایج کم‌گل (۰-۰، ۱-۰، ۰-۱، ۱-۱)
 */
export function dixonColesTau(h: number, a: number, lh: number, la: number, rho: number): number {
  if (h === 0 && a === 0) return 1 - lh * la * rho;
  if (h === 0 && a === 1) return 1 + lh * rho;
  if (h === 1 && a === 0) return 1 + la * rho;
  if (h === 1 && a === 1) return 1 - rho;
  return 1;
}

/**
 * تعدیل الو: تبدیل اختلاف امتیاز الو به ضریب تعدیل امید گل
 * اختلاف ۴۰۰ امتیاز ≈ ضریب e ≈ ۲.۷۱ برابر
 */
export function eloMultiplier(eloDiff: number, weight: number): number {
  return Math.exp((weight * eloDiff) / 400);
}

/**
 * وزن‌دهی زمانی دیکسون-کولز (Time decay weighting)
 * بازی‌های اخیر وزن بیشتری دارند
 */
export function timeDecayWeight(xi: number, daysAgo: number): number {
  return Math.exp(-xi * daysAgo);
}

/**
 * موتور اصلی: محاسبه ماتریس نمره و احتمالات بازارها
 */
export function runDixonColes(input: DixonColesInput): MarketProbabilities {
  const {
    homeAttack,
    awayAttack,
    homeDefense,
    awayDefense,
    leagueAvg,
    homeAdvantage,
    rho,
    eloDiff,
    eloWeight,
    homeAbsenceImpact,
    awayAbsenceImpact,
    timeDecayXi,
    daysAgo,
  } = input;

  // کسر اثر غیبت بازیکن کلیدی (تعدیل بر اساس الو)
  const homeAttEff = homeAttack * (1 - homeAbsenceImpact);
  const awayAttEff = awayAttack * (1 - awayAbsenceImpact);

  const eloFactor = eloMultiplier(eloDiff, eloWeight);

  // امید گل هر تیم
  let lambdaHome = homeAttEff * awayDefense * homeAdvantage * leagueAvg * Math.max(eloFactor, 0.35);
  let lambdaAway = awayAttEff * homeDefense * leagueAvg * Math.max(1 / Math.max(eloFactor, 0.35), 0.35);

  // وزن زمانی: با بازی‌های قدیمی‌تر، به سمت میانگین لیگ بازمی‌گردیم (Blending)
  const w = timeDecayWeight(timeDecayXi, daysAgo); // 1 = اخیر، کوچک = قدیمی
  lambdaHome = w * lambdaHome + (1 - w) * leagueAvg;
  lambdaAway = w * lambdaAway + (1 - w) * leagueAvg;

  lambdaHome = Math.max(0.15, Math.min(lambdaHome, 5.5));
  lambdaAway = Math.max(0.15, Math.min(lambdaAway, 5.5));

  // ماتریس نمره با تصحیح دیکسون-کولز
  const matrix = buildScoreMatrix(lambdaHome, lambdaAway, rho);

  const agg = aggregateMatrix(matrix);
  const pUnder25 = 1 - agg.pOver25;

  // محتمل‌ترین نمرات
  const scores: { score: string; p: number }[] = [];
  for (let h = 0; h <= 5; h++) for (let a = 0; a <= 5; a++) scores.push({ score: `${h}-${a}`, p: matrix[h][a] });
  scores.sort((x, y) => y.p - x.p);

  return {
    lambdaHome,
    lambdaAway,
    ...agg,
    pUnder25,
    scenarioOther: agg.scenarioDrawOpen,
    topScores: scores.slice(0, 6),
    matrix,
  };
}

/**
 * v9.0 — ساخت ماتریس نمره مستقیم از جفت λ (بدون عبور از ضرایب حمله/دفاع).
 * هسته مشترک موتور مستقیم و موتور مهندسی معکوس (Reverse-Poisson).
 */
export function buildScoreMatrix(lambdaHome: number, lambdaAway: number, rho = -0.08, maxGoals = MAX_GOALS): number[][] {
  const matrix: number[][] = [];
  let total = 0;
  for (let h = 0; h <= maxGoals; h++) {
    matrix[h] = [];
    for (let a = 0; a <= maxGoals; a++) {
      const p =
        poissonPmf(h, lambdaHome) * poissonPmf(a, lambdaAway) * dixonColesTau(h, a, lambdaHome, lambdaAway, rho);
      matrix[h][a] = Math.max(p, 0);
      total += matrix[h][a];
    }
  }
  for (let h = 0; h <= maxGoals; h++) for (let a = 0; a <= maxGoals; a++) matrix[h][a] /= total;
  return matrix;
}

/** خروجی تجمیعی ماتریس نمره — سناریوهای متقابل مستثنی (Mutually Exclusive) */
export interface MatrixAggregate {
  pHome: number;
  pDraw: number;
  pAway: number;
  pOver25: number;
  pBtts: number;
  pHomeCleanSheet: number;
  pAwayCleanSheet: number;
  scenarioClosed: number;
  scenarioOpenHome: number;
  scenarioOpenAway: number;
  scenarioDrawOpen: number;
}

export function aggregateMatrix(matrix: number[][]): MatrixAggregate {
  let pHome = 0;
  let pDraw = 0;
  let pAway = 0;
  let pOver25 = 0;
  let pBtts = 0;
  let pHomeCleanSheet = 0;
  let pAwayCleanSheet = 0;
  let scenarioClosed = 0; // بازی بسته و کم‌گل: مجموع گل ≤ ۲
  let scenarioOpenHome = 0; // برد پرگل میزبان
  let scenarioOpenAway = 0; // برد پرگل میهمان

  for (let h = 0; h < matrix.length; h++) {
    for (let a = 0; a < matrix[h].length; a++) {
      const p = matrix[h][a];
      if (h > a) pHome += p;
      else if (h === a) pDraw += p;
      else pAway += p;
      if (h + a > 2.5) pOver25 += p;
      if (h > 0 && a > 0) pBtts += p;
      if (a === 0) pHomeCleanSheet += p;
      if (h === 0) pAwayCleanSheet += p;
      if (h + a <= 2) scenarioClosed += p;
      else if (h > a) scenarioOpenHome += p;
      else if (a > h) scenarioOpenAway += p;
    }
  }
  const scenarioDrawOpen = Math.max(0, 1 - scenarioClosed - scenarioOpenHome - scenarioOpenAway);
  return {
    pHome,
    pDraw,
    pAway,
    pOver25,
    pBtts,
    pHomeCleanSheet,
    pAwayCleanSheet,
    scenarioClosed,
    scenarioOpenHome,
    scenarioOpenAway,
    scenarioDrawOpen,
  };
}

/**
 * تبدیل احتمالات به ضرایب عادلانه (Fair Odds) با حاشیه سود سایت
 */
export function fairOdds(p: number, margin = 1.05): number {
  const o = 1 / (p * margin);
  return Math.max(1.01, Math.round(o * 100) / 100);
}

/**
 * ارزش مورد انتظار (+EV): احتمال واقعی × ضریب − ۱
 */
export function expectedValue(trueProb: number, odds: number): number {
  return trueProb * odds - 1;
}
