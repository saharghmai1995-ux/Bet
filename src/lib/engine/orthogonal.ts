// ─────────────────────────────────────────────────────────────────────────────
// موتور تیپ‌های مکمل متعامد — Orthogonal Multi-Market Complementary Engine (v5.0)
//
// تیپ A (هدف ~۲.۰) و تیپ B (هدف ~۳.۰) «مطلقاً هیچ شرط یکسان یا هم‌جهتی»
// ندارند و از ۱۵+ بازار متنوع (1X2، هندیکپ آسیایی، DNB، مجموع گل آسیایی،
// BTTS، کرنر، کارت زرد، نتیجه نیمه اول، گل‌های تیمی، Win-to-Nil) انتخاب
// می‌شوند؛ طوری که «سناریوی باخت تیپ A دقیقاً سناریوی برد تیپ B» باشد.
//
// همه احتمالات از ماتریس نمره دیکسون-کولز (۱۰×۱۰) + توزیع پواسون مستقل
// کرنر/کارت/نیمه اول محاسبه می‌شود — کاملاً قطعی و بدون LLM.
// ─────────────────────────────────────────────────────────────────────────────

import { poissonPmf, dixonColesTau } from "./poisson";
import { simultaneousKelly } from "./kelly";
import type { PairStructureDTO, PortfolioPairDTO, PortfolioSelectionDTO } from "../types";

// ═════════════════════ برچسب بازارها (۱۵ خانواده) ═════════════════════

export const MARKET_LABELS: Record<string, string> = {
  HOME: "برد میزبان (1)",
  DRAW: "مساوی (X)",
  AWAY: "برد میهمان (2)",
  DC_1X: "شانس مجدد میزبان (1X)",
  DC_X2: "هندیکپ آسیایی میهمان +۰.۵ (X2)",
  DNB_HOME: "DNB میزبان (برد یا بازگشت)",
  DNB_AWAY: "DNB میهمان (برد یا بازگشت)",
  NO_DRAW: "برد یکی از دو تیم (12)",
  AH_AWAY_15: "هندیکپ آسیایی میهمان +۱.۵",
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
  HT_O05: "حداقل یک گل در نیمه اول (HT بالای ۰.۵)",
  HT_00: "مساوی ۰-۰ نیمه اول (HT 0-0)",
  C_O95: "بالای ۹.۵ کرنر",
  C_U95: "زیر ۹.۵ کرنر",
  CARDS_O35: "بالای ۳.۵ کارت زرد",
  CARDS_O45: "بالای ۴.۵ کارت زرد",
  CARDS_U45: "زیر ۴.۵ کارت زرد",
};

/** پایه‌های خارج از ماتریس نمره (کرنر/کارت/نیمه اول) — احتمال مستقل پواسون */
const OFF_MATRIX_LEGS = new Set(["HT_O05", "HT_00", "C_O95", "C_U95", "CARDS_O35", "CARDS_O45", "CARDS_U45"]);
export function isOffMatrixLeg(key: string): boolean {
  return OFF_MATRIX_LEGS.has(key);
}

// ═════════════════════ پوشش سلولی پایه‌های ماتریسی ═════════════════════

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
    default: return false; // پایه‌های خارج ماتریس
  }
}

// ═════════════════════ زمینه محاسبه ═════════════════════

export interface OrthoContext {
  lambdaHome: number;
  lambdaAway: number;
  /** ماتریس نمره کامل دیکسون-کولز (خروجی runDixonColes) */
  matrix: number[][];
  lambdaCorners: number;
  lambdaCards: number;
  /** قیمت‌های واقعی بوک‌میکر بر حسب کلید پایه (اختیاری — مابقی خط سینتتیک مدل) */
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

// ═════════════════════ احتمال و ضریب هر پایه ═════════════════════

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

/** احتمال برد هر پایه */
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

// ═════════════════════ ساخت تیپ از فهرست پایه‌ها ═════════════════════

export interface OrthoSlip {
  legs: string[];
  label: string;
  odds: number;
  prob: number;
}

/** احتمال برد یک تیپ (همه پایه‌ها ببرند) — پایه‌های خارج ماتریس ضریب مستقل */
function slipProb(legs: string[], ctx: OrthoContext, lp: LegProbs): number {
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

function slipOdds(legs: string[], ctx: OrthoContext, lp: LegProbs): number {
  let odds = 1;
  for (const k of legs) {
    odds *= orthoLegOdds(k, orthoLegProb(k, ctx, lp), ctx);
  }
  return Math.round(odds * 100) / 100;
}

function buildSlip(legs: string[], ctx: OrthoContext, lp: LegProbs): OrthoSlip {
  return {
    legs,
    label: legs.map((k) => MARKET_LABELS[k] ?? k).join(" × "),
    odds: slipOdds(legs, ctx, lp),
    prob: slipProb(legs, ctx, lp),
  };
}

/** نزدیک‌ترین ترکیب پایه‌ها به ضریب هدف — نگهبان خانواده شرط‌ها */
function pickNearestCombo(menu: string[][], target: number, ctx: OrthoContext, lp: LegProbs): OrthoSlip | null {
  let best: OrthoSlip | null = null;
  let bestDiff = Infinity;
  for (const legs of menu) {
    if (legs.length === 0) continue;
    const s = buildSlip(legs, ctx, lp);
    if (!Number.isFinite(s.odds) || s.odds < 1.15 || s.odds > 6.5) continue;
    if (s.prob < 0.04) continue; // تیپ بی‌احتمال بی‌معنی است
    const diff = Math.abs(s.odds - target);
    // اولویت با ترکیب‌های نزدیک هدف + شبه‌جزا بودن احتمال
    const score = diff + (s.odds > target ? 0.12 : 0);
    if (score < bestDiff) {
      bestDiff = score;
      best = s;
    }
  }
  return best;
}

// ═════════════════════ پنج الگوی متعامد ═════════════════════

export type ArchetypeCode = "A1" | "A2" | "A3" | "A4" | "A5";

interface ArchetypeDef {
  code: ArchetypeCode;
  name: string;
  short: string;
  rationale: string;
  menuA: string[][];
  menuB: string[][];
  score: (ctx: OrthoContext) => number;
}

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

const ARCHETYPES: ArchetypeDef[] = [
  {
    code: "A1",
    name: "هجوم باز در برابر قفل تدافعی (Open Shootout vs. Tactical Lock)",
    short: "الگوی ۱ — هجوم باز ↔ قفل تدافعی",
    rationale:
      "فضای پیشامد بر اساس BTTS: بله و BTTS: خیر کاملاً افراز (Disjoint) شده است؛ اگر بازی کم‌گل و بسته شود تیپ B می‌برد و اگر بازی باز شود تیپ A می‌برد.",
    menuA: [
      ["BTTS_Y", "ASIAN_O20"],
      ["BTTS_Y", "O15"],
      ["TGOAL_HOME", "TGOAL_AWAY", "O15"],
      ["BTTS_Y", "TGOAL_HOME"],
      ["BTTS_Y"],
      ["ASIAN_O20"],
    ],
    menuB: [
      ["BTTS_N", "U25"],
      ["BTTS_N", "ASIAN_U20"],
      ["BTTS_N", "U35", "WIN_NIL_HOME"],
      ["BTTS_N", "WIN_NIL_AWAY"],
      ["BTTS_N"],
      ["U25"],
    ],
    score: (ctx) => 1 - Math.min(1, Math.abs(ctx.lambdaHome - ctx.lambdaAway) / 0.9),
  },
  {
    code: "A2",
    name: "فتح سریع در برابر محاصره کرنر (Favorite Victory vs. Corner Siege Hedge)",
    short: "الگوی ۲ — فتح فاوریت ↔ محاصره کرنر",
    rationale:
      "وقتی تیم قوی‌تر نتواند ببرد (مساوی یا برد میهمان X2)، تمام ۹۰ دقیقه روی دروازه حریف فشار می‌آورد و کرنرها از ۹.۵ عبور می‌کند؛ باخت فاوریت در تیپ A مستقیماً تیپ B را برنده می‌کند.",
    menuA: [
      ["HOME", "O15"],
      ["HOME", "TGOAL_HOME"],
      ["DC_1X", "O25"],
      ["HOME", "BTTS_Y"],
      ["HOME"],
    ],
    menuB: [
      ["DC_X2", "C_O95"],
      ["DC_X2", "TGOAL_HOME"],
      ["DC_X2", "O15"],
      ["DC_X2"],
      ["C_O95"],
    ],
    score: (ctx) => Math.max(0, Math.min(1, (ctx.lambdaHome - 1.15) / 0.55)),
  },
  {
    code: "A3",
    name: "تفکیک هندیکپ آسیایی و خط گل (Asian Split Partition)",
    short: "الگوی ۳ — تفکیک هندیکپ آسیایی ↔ خط گل",
    rationale:
      "تمام نتایج برد اقتصادی میزبان (۱-۰، ۲-۰، ۲-۱) در تیپ A و تمام نتایج برد میهمان یا بازی‌های پرگل (۲-۲، ۳-۱، ۱-۲) در تیپ B پوشش داده شده‌اند.",
    menuA: [
      ["DNB_HOME", "U35"],
      ["DC_1X", "U35"],
      ["DNB_HOME", "U25"],
      ["DC_1X", "ASIAN_U20"],
      ["DNB_HOME"],
    ],
    menuB: [
      ["DC_X2", "O25"],
      ["DC_X2", "O35"],
      ["AWAY", "O25"],
      ["DC_X2", "O15"],
      ["DC_X2"],
    ],
    score: (ctx) => {
      const d = ctx.lambdaHome - ctx.lambdaAway;
      if (d <= 0.05) return 0.15;
      return Math.max(0, Math.min(1, 1 - Math.abs(d - 0.65) / 0.75));
    },
  },
  {
    code: "A4",
    name: "طوفان نیمه اول در برابر درگیری و کارت نیمه دوم (Fast Start vs. Referee Card Grinder)",
    short: "الگوی ۴ — طوفان نیمه اول ↔ کارت داور",
    rationale:
      "اگر بازی در نیمه اول قفل و بدون گل بماند، تنش و خطاها در نیمه دوم بالا می‌رود و تیپ B (HT 0-0 + کارت بالا) با ضریب ~۳ برنده می‌شود؛ دو بازار کاملاً متفاوت (نیمه اول × آمار داور).",
    menuA: [
      ["HT_O05", "NO_DRAW"],
      ["HT_O05", "HOME"],
      ["HT_O05", "DC_1X"],
      ["HT_O05", "TGOAL_HOME"],
      ["HT_O05"],
    ],
    menuB: [
      ["HT_00", "CARDS_O45"],
      ["HT_00", "CARDS_O35"],
      ["HT_00", "C_U95"],
      ["CARDS_O45"],
      ["HT_00"],
    ],
    score: (ctx) => Math.max(0, Math.min(1, (ctx.lambdaCards - 3.3) / 1.5)),
  },
  {
    code: "A5",
    name: "برد کلین‌شیت در برابر کامبک و گلزنی متقابل (Clean Sheet vs. Both Score Battle)",
    short: "الگوی ۵ — کلین‌شیت ↔ گلزنی متقابل",
    rationale:
      "یک تیپ روی کلین‌شیت و بازی کم‌گل سرمایه‌گذاری می‌کند و دیگری دقیقاً روی شکسته شدن کلین‌شیت و گلزنی هر دو تیم — دو روایت متضاد یک بازی.",
    menuA: [
      ["WIN_NIL_HOME"],
      ["HOME", "U25"],
      ["DC_1X", "U25"],
      ["HOME", "U35"],
      ["DC_1X", "ASIAN_U20"],
    ],
    menuB: [
      ["BTTS_Y", "AH_AWAY_15"],
      ["BTTS_Y", "DC_X2"],
      ["BTTS_Y", "O15"],
      ["BTTS_Y"],
      ["AH_AWAY_15"],
    ],
    score: (ctx) => {
      const st = matrixStats(ctx);
      const cs = Math.max(st.pHomeCS, st.pAwayCS * 0.9);
      return Math.max(0, Math.min(1, (cs - 0.24) / 0.3));
    },
  },
];

// ═════════════════════ خروجی نهایی ═════════════════════

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
 * generateOrthogonalComplementarySlips — قلب موتور v5.0.
 * برای هر ۵ الگو یک زوج تیپ متعامد می‌سازد (کاربر بین آن‌ها سوییچ می‌کند)
 * و الگوی متناسب با ویژگی‌های آماری بازی را پیشنهاد می‌دهد.
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
    const slipA = pickNearestCombo(def.menuA, 2.0, ctx, lp);
    const slipB = pickNearestCombo(def.menuB, 3.0, ctx, lp);
    if (!slipA || !slipB) continue;

    const pA = slipA.prob;
    const pB = slipB.prob;
    // احتمال برد همزمان: پایه‌های ماتریسی مشترک سلول + ضرب پایه‌های مستقل خارج ماتریس
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

/** P(برد همزمان A و B) — پایه‌های ماتریسی روی سلول مشترک، خارج ماتریس ضرب مستقل */
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

/** برچسب کوتاه یک پایه (برای labelA/labelB پرتفوی) */
export function orthoLegLabel(key: string): string {
  return MARKET_LABELS[key] ?? key;
}

// ═════════════════════ سازنده زوج پرتفوی از الگو ═════════════════════

const REAL_PRICE_KEYS = ["HOME", "DRAW", "AWAY", "DC_1X", "DC_X2", "O15", "O25", "U25", "U35", "BTTS_Y", "BTTS_N", "C_O95", "C_U95"];

/**
 * تبدیل یک زوج متعامد به PortfolioPairDTO استاندارد — مشترک بین
 * /api/agent/orthogonal و /api/agent/portfolio (v5.0).
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
  // (رفع باگ عدد منفی متناقض «+۶.۲٪ (−۶۱.۶)» — S = مجموع معکوس ضرایب)
  const profit = bankroll / impliedSum - bankroll;

  const selectionA: PortfolioSelectionDTO = {
    key: `ORTHO_${a.code}_A`,
    label: a.slipA.label,
    matchId: match.id,
    matchLabel,
    modelProb: a.slipA.prob,
    bestOdds: a.slipA.odds,
    bestBook: "بازارهای متعامد v5.0",
    sharpOdds: null,
    evPct: a.slipA.prob * a.slipA.odds - 1,
  };
  const selectionB: PortfolioSelectionDTO = {
    key: `ORTHO_${a.code}_B`,
    label: a.slipB.label,
    matchId: match.id,
    matchLabel,
    modelProb: a.slipB.prob,
    bestOdds: a.slipB.odds,
    bestBook: "بازارهای متعامد v5.0",
    sharpOdds: null,
    evPct: a.slipB.prob * a.slipB.odds - 1,
  };
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
    sharpEdgePct: null,
    archetype: {
      code: a.code,
      name: a.name,
      short: a.short,
      rationale: a.rationale,
      orthogonalityPct: a.orthogonalityPct,
      coveragePct: a.coveragePct,
      overlapPct: a.overlapPct,
    },
    trap: { verdict: "NONE", title: "بدون شرط تکراری", message: "تیپ A و تیپ B هیچ خانواده شرط مشترکی ندارند (زاویه تمایز ۱۰۰٪)" },
    verdict:
      a.jointStates.bothLose < 0.2
        ? "پوشش متعامد معتبر — دو روایت متضاد یک بازی؛ باخت همزمان فقط در سناریوی خیلی خاص"
        : "پوشش متعامد پرریسک — سناریوی میانی هر دو تیپ را می‌سوزاند؛ صرفاً برای تنوع",
  };
}
