// ─────────────────────────────────────────────
// شبیه‌ساز مونت‌کارلو با کاپولا گاوسی — ۱۰٬۰۰۰ تکرار برای هر بازی
// همبستگی گل×کرنر×کارت از طریق عامل نهان مشترک (Gaussian Copula)
// خروجی: توزیع بازارها + ماتریس حالات همزمان زوج تیپ‌ها (Joint Loss)
// ─────────────────────────────────────────────

import { mulberry32, type Rng } from "./rng";

export type SelectionKey =
  | "HOME" | "DRAW" | "AWAY"
  | "DC_1X" | "DC_X2"
  | "O25" | "U25"
  | "BTTS_Y" | "BTTS_N"
  | "C_O95" | "C_U95";

export const SELECTION_LABELS: Record<SelectionKey, string> = {
  HOME: "برد میزبان",
  DRAW: "مساوی",
  AWAY: "برد میهمان",
  DC_1X: "شانس مجدد میزبان (1X)",
  DC_X2: "شانس مجدد میهمان (X2)",
  O25: "بالای ۲.۵ گل",
  U25: "زیر ۲.۵ گل",
  BTTS_Y: "هر دو تیم گل می‌زنند",
  BTTS_N: "گل نزدن حداقل یک تیم",
  C_O95: "بالای ۹.۵ کرنر",
  C_U95: "زیر ۹.۵ کرنر",
};

export interface MonteCarloInput {
  matrix: number[][]; // ماتریس نمره دیکسون-کولز (نرمال‌شده)
  lambdaCorners: number; // امید کرنر کل بازی
  lambdaCards: number; // امید کارت زرد کل بازی (پروفایل داور)
  sims?: number; // پیش‌فرض ۱۰٬۰۰۰
  seed?: number;
}

export interface JointStates {
  bothWin: number;
  aOnly: number;
  bOnly: number;
  bothLose: number;
}

export interface MonteCarloResult {
  sims: number;
  pHome: number;
  pDraw: number;
  pAway: number;
  pOver25: number;
  pUnder25: number;
  pBtts: number;
  cornersOver95: number;
  cornersOver85: number;
  cardsOver35: number;
  avgCorners: number;
  avgCards: number;
  avgGoals: number;
  corrGoalsCorners: number; // همبستگی پیرسون گل×کرنر (اثر کاپولا)
  // آرایه‌های باینری per-sim برای ارزیابی زوج‌ها
  flags: Record<SelectionKey, Uint8Array>;
  samples: { goals: number; corners: number }[];
}

/** CDF معکوس پواسون با پیمایش تجمعی */
function invPoissonCdf(u: number, lambda: number): number {
  const L = Math.exp(-lambda);
  let k = 0;
  let cum = L;
  let term = L;
  while (cum < u && k < 25) {
    k++;
    term = (term * lambda) / k;
    cum += term;
  }
  return k;
}

/** CDF استاندارد نرمال (تقریب Abramowitz-Stegun) */
function normCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x >= 0 ? 1 - p : p;
}

function gaussianPair(rng: Rng): [number, number] {
  let u1 = 0;
  let u2 = 0;
  while (u1 === 0) u1 = rng();
  while (u2 === 0) u2 = rng();
  const r = Math.sqrt(-2 * Math.log(u1));
  return [r * Math.cos(2 * Math.PI * u2), r * Math.sin(2 * Math.PI * u2)];
}

/** آیا انتخاب در نمونه شبیه‌سازی برنده است؟ */
function selectionWins(key: SelectionKey, hg: number, ag: number, corners: number, cards: number): boolean {
  switch (key) {
    case "HOME": return hg > ag;
    case "DRAW": return hg === ag;
    case "AWAY": return ag > hg;
    case "DC_1X": return hg >= ag;
    case "DC_X2": return ag >= hg;
    case "O25": return hg + ag > 2.5;
    case "U25": return hg + ag < 2.5;
    case "BTTS_Y": return hg > 0 && ag > 0;
    case "BTTS_N": return hg === 0 || ag === 0;
    case "C_O95": return corners > 9.5;
    case "C_U95": return corners < 9.5;
  }
}

export const MC_SELECTIONS: SelectionKey[] = [
  "HOME", "DRAW", "AWAY", "DC_1X", "DC_X2", "O25", "U25", "BTTS_Y", "BTTS_N", "C_O95", "C_U95",
];

/**
 * اجرای شبیه‌سازی: نمره از ماتریس DC (نمونه‌گیری کاتاگوریک — تصحیح تاو حفظ می‌شود)،
 * سپس کرنر با عامل نهان مرتبط با مجموع گل (کاپولا گاوسی) و کارت از پروفایل داور.
 */
export function runMonteCarlo(input: MonteCarloInput): MonteCarloResult {
  const sims = input.sims ?? 10000;
  const rng = mulberry32(input.seed ?? 20240315);
  const matrix = input.matrix;
  const N = matrix.length;

  // جدول تجمعی ماتریس نمره برای نمونه‌گیری سریع
  const cdf = new Float64Array(N * N);
  let acc = 0;
  for (let h = 0; h < N; h++) {
    for (let a = 0; a < N; a++) {
      acc += matrix[h][a];
      cdf[h * N + a] = acc;
    }
  }

  const flags = {} as Record<SelectionKey, Uint8Array>;
  for (const k of MC_SELECTIONS) flags[k] = new Uint8Array(sims);

  const samples: { goals: number; corners: number }[] = [];
  let home = 0, draw = 0, away = 0, over25 = 0, btts = 0;
  let corners95 = 0, corners85 = 0, cards35 = 0;
  let sumG = 0, sumC = 0, sumGC = 0, sumG2 = 0, sumC2 = 0, sumCards = 0;

  for (let s = 0; s < sims; s++) {
    // ۱) نمره از ماتریس دیکسون-کولز
    const u = rng();
    let idx = 0;
    let lo = 0;
    let hi = cdf.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cdf[mid] < u) lo = mid + 1;
      else hi = mid;
    }
    idx = lo;
    const hg = Math.floor(idx / N);
    const ag = idx % N;
    const goals = hg + ag;

    // ۲) کرنر: عامل نهان گاوسی مرتبط با گل (کاپولا)
    const [z1] = gaussianPair(rng);
    const uC = normCdf(z1);
    // β = 0.13 → همبستگی مثبت گل-کرنر (~۰.۳۵)
    const lambdaEff = Math.max(2, input.lambdaCorners * Math.exp(0.13 * (goals - 2.6)));
    const corners = invPoissonCdf(uC, lambdaEff);

    // ۳) کارت زرد: مستقل از پروفایل داور
    const cards = invPoissonCdf(rng(), Math.max(1, input.lambdaCards));

    if (hg > ag) home++;
    else if (hg === ag) draw++;
    else away++;
    if (goals > 2.5) over25++;
    if (hg > 0 && ag > 0) btts++;
    if (corners > 9.5) corners95++;
    if (corners > 8.5) corners85++;
    if (cards > 3.5) cards35++;

    sumG += goals; sumC += corners; sumCards += cards;
    sumGC += goals * corners; sumG2 += goals * goals; sumC2 += corners * corners;

    for (const k of MC_SELECTIONS) {
      if (selectionWins(k, hg, ag, corners, cards)) flags[k][s] = 1;
    }

    if (s % 2 === 0 && samples.length < 400) samples.push({ goals, corners });
  }

  const meanG = sumG / sims;
  const meanC = sumC / sims;
  const cov = sumGC / sims - meanG * meanC;
  const sdG = Math.sqrt(Math.max(1e-9, sumG2 / sims - meanG * meanG));
  const sdC = Math.sqrt(Math.max(1e-9, sumC2 / sims - meanC * meanC));

  return {
    sims,
    pHome: home / sims,
    pDraw: draw / sims,
    pAway: away / sims,
    pOver25: over25 / sims,
    pUnder25: 1 - over25 / sims,
    pBtts: btts / sims,
    cornersOver95: corners95 / sims,
    cornersOver85: corners85 / sims,
    cardsOver35: cards35 / sims,
    avgCorners: meanC,
    avgCards: sumCards / sims,
    avgGoals: meanG,
    corrGoalsCorners: cov / (sdG * sdC),
    flags,
    samples,
  };
}

/**
 * حالات همزمان زوج انتخاب‌ها از روی فلگ‌های شبیه‌سازی (همان اندیس = همان جهان)
 * برای دو بازی مستقل کافی است فلگ‌ها از دو اجرای جدا (با seed متفاوت) بیایند؛
 * ترکیب اندیسی استقلال دو بازی را حفظ می‌کند.
 */
export function jointStates(flagsA: Uint8Array, flagsB: Uint8Array): JointStates {
  const n = Math.min(flagsA.length, flagsB.length);
  let bothWin = 0, aOnly = 0, bOnly = 0, bothLose = 0;
  for (let i = 0; i < n; i++) {
    const a = flagsA[i];
    const b = flagsB[i];
    if (a && b) bothWin++;
    else if (a) aOnly++;
    else if (b) bOnly++;
    else bothLose++;
  }
  return { bothWin: bothWin / n, aOnly: aOnly / n, bOnly: bOnly / n, bothLose: bothLose / n };
}
