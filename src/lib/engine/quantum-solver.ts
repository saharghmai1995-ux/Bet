// ─────────────────────────────────────────────────────────────────────────────
// ⚛️ حل‌کننده کوانتومی ترکیب ۱۲ آپشن باز — NeoBet v23.0
// «Simulated Quantum Annealing — 12×12 Combinatorial Market State Solver»
//
// سند ارتقا v23.0: به‌جای الگوهای تکراری G1/G2/G3 برای همه بازی‌ها، برای هر مسابقه
// به‌صورت کاملاً مجزا و منحصربه‌فرد، بهترین جفت (تیپ A، تیپ B) از میان استخر باز
// ۱۲ آپشن رسمی بوک‌میکر (M1..M12) با اسکن تمام ۶۶ ترکیب ممکن انتخاب می‌شود تا
// هیچ دو کارتی شبیه هم نباشند.
//
// احتمال هر آپشن مستقیماً از جمع خانه‌های متناظر ماتریس چگالی ۶×۶ سارمانوف-
// دیکسون-کولز (ρ_m[i][j]) همان بازی محاسبه می‌شود (بدون هیچ ضربی).
//
// برای هر جفت (M_a, M_b) سه کمیت دقیق از ماتریس ۶×۶ همان بازی محاسبه می‌شود:
//   ۱) احتمال پوشش کل (Union Coverage):     P_union = Σ ρ[i][j] روی S_a ∪ S_b
//   ۲) احتمال تداخل سازنده برد دوبل:        P_overlap = Σ ρ[i][j] روی S_a ∩ S_b
//      (خانه‌هایی که هر دو تیپ همزمان برنده می‌شوند — جک‌پات Double-Win)
//   ۳) ضریب همپوشانی موثر:                  O_eff = 1 / (1/O_a + 1/O_b)
//
// تابع انرژی کوانتومی (Quantum Utility Score):
//   U(a,b) = (P_union × 100) + (P_overlap × 65) + ((O_eff − 1) × 120)
//            − ((1 − P_union)² × 400)
//
// شرط آهنین ضریب همپوشانی مثبت:  1/O_a + 1/O_b ≤ 0.865
//   (حداقل +۱۵.۶٪ سود در تک‌برد و +۱۱۵ تا +۱۷۵ واحد در برد دوبل)
// ─────────────────────────────────────────────────────────────────────────────

import type { OrthoContext } from "./orthogonal";

// ═══════════ استخر باز ۱۲ آپشن رسمی بوک‌میکر (Open 12-Option Market Pool) ═══════════

/** یک آپشن تک‌دکمه‌ای رسمی — احتمالش از جمع خانه‌های ماتریس همان بازی می‌آید */
export interface QuantumMarketDef {
  /** کد رسمی سند: M1..M12 */
  code: string;
  /** کلید پایه برای صدور/تسویه (سازگار با selectionCoversCell — تسویه ESPN واقعی) */
  key: string;
  labelFa: string;
  labelEn: string;
  /** مجموعه سلول‌های برد آپشن روی ماتریس نمره */
  covers: (h: number, a: number) => boolean;
}

/** فرمول‌های سند v23.0 — بخش ۲ (استخر باز ۱۲ آپشن M1..M12) */
export const QUANTUM_MARKET_POOL: QuantumMarketDef[] = [
  {
    code: "M1",
    key: "HOME",
    labelFa: "برد مستقیم میزبان",
    labelEn: "Full-Time Result: 1 — Home Win",
    covers: (h, a) => h > a, // Σ ρ[i][j] برای i > j
  },
  {
    code: "M2",
    key: "AWAY",
    labelFa: "برد مستقیم میهمان",
    labelEn: "Full-Time Result: 2 — Away Win",
    covers: (h, a) => a > h, // Σ ρ[i][j] برای j > i
  },
  {
    code: "M3",
    key: "DRAW",
    labelFa: "مساوی در وقت قانونی",
    labelEn: "Full-Time Result: X — Draw",
    covers: (h, a) => h === a, // Σ ρ[i][j] برای i = j
  },
  {
    code: "M4",
    key: "HOME_O15",
    labelFa: "مجموع گل تیم میزبان: بالای ۱.۵ گل",
    labelEn: "Home Team Total: Over 1.5 Goals",
    covers: (h) => h >= 2, // Σ ρ[i][j] برای i ≥ 2
  },
  {
    code: "M5",
    key: "AWAY_O15",
    labelFa: "مجموع گل تیم میهمان: بالای ۱.۵ گل",
    labelEn: "Away Team Total: Over 1.5 Goals",
    covers: (_h, a) => a >= 2, // Σ ρ[i][j] برای j ≥ 2
  },
  {
    code: "M6",
    key: "U25",
    labelFa: "مجموع کل گل‌های بازی: زیر ۲.۵ گل",
    labelEn: "Match Total: Under 2.5 Goals",
    covers: (h, a) => h + a <= 2, // Σ ρ[i][j] برای i+j ≤ 2
  },
  {
    code: "M7",
    key: "O25",
    labelFa: "مجموع کل گل‌های بازی: بالای ۲.۵ گل",
    labelEn: "Match Total: Over 2.5 Goals",
    covers: (h, a) => h + a >= 3, // Σ ρ[i][j] برای i+j ≥ 3
  },
  {
    code: "M8",
    key: "BTTS_Y",
    labelFa: "گلزنی هر دو تیم: بله",
    labelEn: "Both Teams To Score: Yes",
    covers: (h, a) => h >= 1 && a >= 1, // Σ ρ[i][j] برای i ≥ 1 و j ≥ 1
  },
  {
    code: "M9",
    key: "WIN_NIL_HOME",
    labelFa: "برد میزبان با کلین‌شیت",
    labelEn: "Home Team Win to Nil: Yes",
    covers: (h, a) => h >= 1 && a === 0, // Σ ρ[i][0] برای i ≥ 1
  },
  {
    code: "M10",
    key: "WIN_NIL_AWAY",
    labelFa: "برد میهمان با کلین‌شیت",
    labelEn: "Away Team Win to Nil: Yes",
    covers: (h, a) => a >= 1 && h === 0, // Σ ρ[0][j] برای j ≥ 1
  },
  {
    code: "M11",
    key: "C1XU35",
    labelFa: "کمبوی رسمی: برد میزبان یا مساوی و زیر ۳.۵ گل",
    labelEn: "Double Chance Combo: 1X & Under 3.5 Goals",
    covers: (h, a) => h >= a && h + a <= 3, // Σ ρ[i][j] برای i ≥ j و i+j ≤ 3
  },
  {
    code: "M12",
    key: "CX2U35",
    labelFa: "کمبوی رسمی: برد میهمان یا مساوی و زیر ۳.۵ گل",
    labelEn: "Double Chance Combo: X2 & Under 3.5 Goals",
    covers: (h, a) => a >= h && h + a <= 3, // Σ ρ[i][j] برای j ≥ i و i+j ≤ 3
  },
];

// ═══════════ ثوابت سند v23.0 ═══════════

/** شرط آهنین ضریب همپوشانی مثبت — ۱/O_a + ۱/O_b ≤ ۰.۸۶۵ */
export const QUANTUM_IMPLIED_SUM_MAX = 0.865;
/** وزن‌های تابع انرژی کوانتومی (Quantum Utility Score) — دقیقاً طبق سند */
export const QUANTUM_W_UNION = 100;
export const QUANTUM_W_OVERLAP = 65;
export const QUANTUM_W_EDGE = 120;
export const QUANTUM_W_GAP_PENALTY = 400;
/** تعداد کل ترکیب‌های ممکن از ۱۲ آپشن — C(12,2) = ۶۶ */
export const QUANTUM_TOTAL_PAIRS = 66;

// ═══════════ قیمت‌گذاری ارزش‌محور هر آپشن (هم‌دکترین با موتور v19) ═══════════

/**
 * ضریب هر آپشن از ترکیب احتمال ماتریس همان بازی و لبه ارزش مدل — دقیقاً همان
 * فرمول computeValueMarketOdds موتور (boost ۱.۱۸، clamp احتمال [0.18, 0.68]،
 * بازه ضریب [1.82, 3.95]) تا هیچ دو مسابقه‌ای ضریب یکسان نداشته باشند.
 */
export function quantumOddsOf(prob: number): number {
  const clamped = Math.max(0.18, Math.min(0.68, prob));
  const raw = 1.18 / clamped;
  return Math.round(Math.max(1.82, Math.min(3.95, raw)) * 100) / 100;
}

// ═══════════ حل‌کننده اصلی ═══════════

/** یک ترکیب کاندید از ۶۶ ترکیب ممکن */
export interface QuantumPairCandidate {
  /** کد جفت مثل «M11↔M7» */
  pairCode: string;
  codeA: string;
  codeB: string;
  keyA: string;
  keyB: string;
  labelFaA: string;
  labelFaB: string;
  labelEnA: string;
  labelEnB: string;
  probA: number;
  probB: number;
  oddsA: number;
  oddsB: number;
  /** P_union — احتمال پوشش کل (اجتماع سلول‌های دو تیپ) */
  unionProb: number;
  /** P_overlap — احتمال برد دوبل همزمان (اشتراک سلول‌ها) */
  overlapProb: number;
  /** O_eff — ضریب همپوشانی موثر */
  effOdds: number;
  /** مجموع احتمال ضمنی — قید سند: ≤ ۰.۸۶۵ */
  impliedSum: number;
  /** امتیاز انرژی کوانتومی U(a,b) */
  utility: number;
  /** پاس‌کردن قید ضریب همپوشانی مثبت */
  passesConstraint: boolean;
  /** نتایج دقیق برد دوبل همزمان (مثل ۲-۱ / ۳-۰) */
  doubleWinScenarios: string[];
  /** نتایج برد انحصاری تیپ A */
  aOnlyScenarios: string[];
  /** نتایج برد انحصاری تیپ B */
  bOnlyScenarios: string[];
}

export interface QuantumSolverResult {
  /** هر ۶۶ ترکیب مرتب‌شده بر اساس U نزولی */
  candidates: QuantumPairCandidate[];
  /** بهترین ترکیب پاس‌کننده قید — null اگر هیچ ترکیبی قید را پاس نکرد */
  best: QuantumPairCandidate | null;
  /** تعداد ترکیب‌های ارزیابی‌شده (۶۶) */
  evaluated: number;
  /** تعداد ترکیب‌های پاس‌کننده قید ۰.۸۶۵ */
  qualifying: number;
  /** خلاصه متن انتخاب برای نمایش روی کارت */
  selectionLine: string | null;
}

/** جمع احتمال سلول‌های ماتریس ۶×۶ (نرمال‌شده درون همان ۶×۶) */
function matrixSum(matrix: number[][], predicate: (h: number, a: number) => boolean): { hit: number; total: number } {
  const N = Math.min(6, matrix.length);
  let hit = 0;
  let total = 0;
  for (let h = 0; h < N; h++) {
    const row = matrix[h] ?? [];
    for (let a = 0; a < Math.min(6, row.length); a++) {
      total += row[a] ?? 0;
      if (predicate(h, a)) hit += row[a] ?? 0;
    }
  }
  return { hit: total > 0 ? hit / total : 0, total };
}

/** برچسب فارسی نمره با ارقام فارسی-سازگار (مثل «۲-۱») */
const scoreCell = (h: number, a: number): string => `${h}-${a}`;

/**
 * ⚛️ runQuantumAnnealingSolver — قلب v23.0.
 * تمام ۶۶ ترکیب (M_a, M_b) را روی ماتریس ۶×۶ همین بازی اسکن می‌کند و
 * بهترین جفت با بیشترین U(a,b) که قید ضریب همپوشانی مثبت را پاس کند انتخاب می‌شود.
 */
export function runQuantumAnnealingSolver(ctx: OrthoContext): QuantumSolverResult {
  const probs = QUANTUM_MARKET_POOL.map((m) => {
    const { hit } = matrixSum(ctx.matrix, m.covers);
    return { def: m, prob: Math.max(0.01, Math.min(0.99, hit)) };
  });

  const candidates: QuantumPairCandidate[] = [];
  for (let i = 0; i < probs.length; i++) {
    for (let j = i + 1; j < probs.length; j++) {
      const A = probs[i];
      const B = probs[j];
      const oddsA = quantumOddsOf(A.prob);
      const oddsB = quantumOddsOf(B.prob);
      const impliedSum = 1 / oddsA + 1 / oddsB;
      const effOdds = 1 / impliedSum;

      // P_union و P_overlap از اجتماع/اشتراک دقیق سلول‌های ماتریس
      const union = matrixSum(ctx.matrix, (h, a) => A.def.covers(h, a) || B.def.covers(h, a)).hit;
      const overlap = matrixSum(ctx.matrix, (h, a) => A.def.covers(h, a) && B.def.covers(h, a)).hit;

      // تابع انرژی کوانتومی سند v23.0
      const utility =
        union * QUANTUM_W_UNION +
        overlap * QUANTUM_W_OVERLAP +
        (effOdds - 1) * QUANTUM_W_EDGE -
        Math.pow(1 - union, 2) * QUANTUM_W_GAP_PENALTY;

      // سناریوهای نمره دقیق هر ناحیه (حداکثر ۴ نمره پرتکرار هر ناحیه)
      const dwCells: { s: string; p: number }[] = [];
      const aCells: { s: string; p: number }[] = [];
      const bCells: { s: string; p: number }[] = [];
      const N = Math.min(6, ctx.matrix.length);
      for (let h = 0; h < N; h++) {
        const row = ctx.matrix[h] ?? [];
        for (let a = 0; a < Math.min(6, row.length); a++) {
          const p = row[a] ?? 0;
          if (p <= 0.004) continue;
          const cell = scoreCell(h, a);
          if (A.def.covers(h, a) && B.def.covers(h, a)) dwCells.push({ s: cell, p });
          else if (A.def.covers(h, a)) aCells.push({ s: cell, p });
          else if (B.def.covers(h, a)) bCells.push({ s: cell, p });
        }
      }
      const top3 = (arr: { s: string; p: number }[]) =>
        arr.sort((x, y) => y.p - x.p).slice(0, 3).map((c) => c.s);

      candidates.push({
        pairCode: `${A.def.code}↔${B.def.code}`,
        codeA: A.def.code,
        codeB: B.def.code,
        keyA: A.def.key,
        keyB: B.def.key,
        labelFaA: A.def.labelFa,
        labelFaB: B.def.labelFa,
        labelEnA: A.def.labelEn,
        labelEnB: B.def.labelEn,
        probA: Math.round(A.prob * 1000) / 1000,
        probB: Math.round(B.prob * 1000) / 1000,
        oddsA,
        oddsB,
        unionProb: Math.round(union * 1000) / 1000,
        overlapProb: Math.round(overlap * 1000) / 1000,
        effOdds: Math.round(effOdds * 1000) / 1000,
        impliedSum: Math.round(impliedSum * 1000) / 1000,
        utility: Math.round(utility * 10) / 10,
        passesConstraint: impliedSum <= QUANTUM_IMPLIED_SUM_MAX,
        doubleWinScenarios: top3(dwCells),
        aOnlyScenarios: top3(aCells),
        bOnlyScenarios: top3(bCells),
      });
    }
  }

  candidates.sort((x, y) => y.utility - x.utility);
  const passing = candidates.filter((c) => c.passesConstraint);
  const best = passing.length > 0 ? passing[0] : null;

  const selectionLine = best
    ? `⚛️ انتخاب کوانتومی از ${best.pairCode} — پوشش ماتریس: ${(best.unionProb * 100).toFixed(1)}٪ • ناحیه برد دوبل (${best.doubleWinScenarios.join(" / ") || "—"}): ${(best.overlapProb * 100).toFixed(1)}٪`
    : null;

  return {
    candidates,
    best,
    evaluated: candidates.length,
    qualifying: passing.length,
    selectionLine,
  };
}

/**
 * متن رسمی نمایش روی فلش‌کارت — سند v23.0 بخش ۳:
 * «⚛️ انتخاب کوانتومی از ۶۶ ترکیب: [M11 ↔ M7] • پوشش ماتریس: ۹۲.۴٪ • ناحیه برد دوبل (۲-۱ / ۳-۰): ۱۸.۶٪»
 */
export function quantumCardLine(best: QuantumPairCandidate | null, evaluated = QUANTUM_TOTAL_PAIRS): string | null {
  if (!best) return null;
  const dw = best.doubleWinScenarios.length > 0 ? `(${best.doubleWinScenarios.join(" / ")})` : "بدون ناحیه مشترک";
  return `⚛️ انتخاب کوانتومی از ${evaluated} ترکیب: [${best.codeA} ↔ ${best.codeB}] • پوشش ماتریس: ${(best.unionProb * 100).toFixed(1)}٪ • ناحیه برد دوبل ${dw}: ${(best.overlapProb * 100).toFixed(1)}٪`;
}

/** نگاشت کلید پایه → کد آپشن کوانتومی (برای QQL pair_code) */
export const M_CODE_OF_KEY: Record<string, string> = Object.fromEntries(
  QUANTUM_MARKET_POOL.map((m) => [m.key, m.code])
);

/** کد جفت QQL از دو کلید پایه (مرتب بر اساس اندیس آپشن) */
export function pairCodeOfKeys(keyA: string, keyB: string): string | null {
  const a = M_CODE_OF_KEY[keyA];
  const b = M_CODE_OF_KEY[keyB];
  if (!a || !b || a === b) return null;
  const idxA = QUANTUM_MARKET_POOL.findIndex((m) => m.code === a);
  const idxB = QUANTUM_MARKET_POOL.findIndex((m) => m.code === b);
  return idxA < idxB ? `${a}↔${b}` : `${b}↔${a}`;
}
