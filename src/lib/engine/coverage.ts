// ─────────────────────────────────────────────────────────────────────────────
// نقشه پوشش ۶×۶ فلش‌کارت (Mini 6x6 Coverage Map) — v3.0
// هر خانه ماتریس نمره دیکسون-کولز رنگ‌بندی می‌شود:
//   آبی = فقط تیپ A می‌برد | سبز = فقط تیپ B | طلایی = هر دو می‌برند (Double-Win)
// ─────────────────────────────────────────────────────────────────────────────

import { poissonPmf, dixonColesTau } from "./poisson";

/** ساخت مینی‌ماتریس ۶×۶ از لامبدهای نهایی موتور (با تصحیح دیکسون-کولز) */
export function buildScoreMatrix(lambdaHome: number, lambdaAway: number, rho = -0.08, maxGoals = 5): number[][] {
  const matrix: number[][] = [];
  let total = 0;
  for (let h = 0; h <= maxGoals; h++) {
    matrix[h] = [];
    for (let a = 0; a <= maxGoals; a++) {
      const p = Math.max(
        0,
        poissonPmf(h, lambdaHome) * poissonPmf(a, lambdaAway) * dixonColesTau(h, a, lambdaHome, lambdaAway, rho)
      );
      matrix[h][a] = p;
      total += p;
    }
  }
  if (total > 0) {
    for (let h = 0; h <= maxGoals; h++) for (let a = 0; a <= maxGoals; a++) matrix[h][a] /= total;
  }
  return matrix;
}

/** آیا یک انتخاب (کلید بازار) در نمره دقیق (h,a) می‌برد؟ */
export function selectionCoversCell(key: string, h: number, a: number): boolean {
  const tot = h + a;
  switch (key) {
    case "HOME": return h > a;
    case "DRAW": return h === a;
    case "AWAY": return a > h;
    case "DC_1X": return h >= a;
    case "DC_X2": return a >= h;
    case "O25": return tot > 2.5;
    case "U25": return tot < 2.5;
    case "O15": return tot > 1.5;
    case "U15": return tot < 1.5;
    case "U35": return tot < 3.5;
    case "O35": return tot > 3.5;
    case "BTTS_Y": return h > 0 && a > 0;
    case "BTTS_N": return h === 0 || a === 0;
    case "DNB_HOME": return h >= a; // مساوی = بازگشت
    case "DNB_AWAY": return a >= h;
    case "NO_DRAW": return h !== a;
    case "AH_AWAY_15": return h - a <= 1;
    case "ASIAN_O20": return tot >= 2; // دقیقاً ۲ = نیم‌برد
    case "ASIAN_U20": return tot <= 2;
    case "TGOAL_HOME": return h >= 1;
    case "TGOAL_AWAY": return a >= 1;
    case "WIN_NIL_HOME": return h > a && a === 0;
    case "WIN_NIL_AWAY": return a > h && h === 0;
    // ═══ v15.0 — بازارهای رسمی تک‌دکمه‌ای (Atomic Single-Button Markets) ═══
    // استخراج مستقیم از ماتریس دیکسون-کولز — بدون هیچ ضرب گزینه‌های وابسته
    case "EXACT2": return tot === 2; // دقیقاً ۲ گل کل مسابقه
    case "AH_HOME_15": return h - a >= 2; // هندیکپ آسیایی میزبان −۱.۵
    case "HOME_BY_1": return h - a === 1; // برد میزبان دقیقاً با اختلاف ۱ گل
    // ═══ v16.0 — بازارهای طلایی تیمی (Golden Team-Total Markets) ═══
    case "HOME_O15": return h >= 2; // مجموع گل تیم میزبان بالای ۱.۵
    case "AWAY_O15": return a >= 2; // مجموع گل تیم میهمان بالای ۱.۵
    // ═══ v17.0 — کمبوهای رسمی تک‌دکمه‌ای (Official Single-Button Combos) ═══
    case "C1XU35": return h >= a && tot <= 3; // 1X & Under 3.5 Goals
    case "CHOME15": return h > a && tot >= 2; // Home Win & Over 1.5 Goals
    case "CBTTS25": return h > 0 && a > 0 && tot >= 3; // BTTS Yes & Over 2.5 Goals
    // ═══ v23.0 — کمبوی رسمی استخر کوانتومی ۱۲ آپشن (Quantum M12) ═══
    case "CX2U35": return a >= h && tot <= 3; // X2 & Under 3.5 Goals (Quantum M12)
    default: {
      // ═══ v17.0 — نتیجه دقیق خوشه (Correct Score Cluster) — کلید CS_<h>-<a> ═══
      if (key.startsWith("CS_")) {
        const parts = key.slice(3).split("-");
        return Number(parts[0]) === h && Number(parts[1]) === a;
      }
      return false; // کرنر/کارت/نیمه اول خارج از ماتریس نمره است
    }
  }
}

/** پایه‌های خارج از ماتریس نمره (کرنر/کارت/نیمه اول) — پوشش مینی‌مپ تخمینی می‌شود */
const OFF_MATRIX_KEYS = new Set(["HT_O05", "HT_00", "C_O95", "C_U95", "CARDS_O35", "CARDS_O45", "CARDS_U45"]);
export function isOffMatrixKey(key: string): boolean {
  return OFF_MATRIX_KEYS.has(key);
}

export type CoverKind = "A_ONLY" | "B_ONLY" | "BOTH" | "NONE";

export interface CoverageCell {
  h: number;
  a: number;
  p: number;
  kind: CoverKind;
}

export interface CoverageMap {
  cells: CoverageCell[][];
  stats: { aCells: number; bCells: number; bothCells: number; coveredPct: number; bothWinProb: number };
  isConditional: boolean; // میکس دو بازی: متغیر روی بازی دوم است — پوشش روی این بازی مشروط به پایه
  /** v5.0 — تیپ شامل بازار خارج ماتریس (کرنر/کارت/نیمه اول) است — پوشش تخمینی */
  hasOffMatrixLegs: boolean;
}

interface CoverageStructure {
  baseKey: string;
  varAKey: string;
  varBKey: string;
  varAMatchId: string;
  varBMatchId: string;
  legsA?: string[];
  legsB?: string[];
}

/**
 * ساخت گرید پوشش برای زوج تیپ:
 * - بیلدر تک‌بازی: هر دو متغیر روی همین بازی → رنگ‌بندی کامل (آبی/سبز/طلایی)
 * - میکس دو بازی: فقط پایه مشترک روی این بازی رنگ می‌شود (پوشش مشروط)
 * - v5.0 زوج متعامد (legsA/legsB): هر سلول با همه شرط‌های همان تیپ سنجیده می‌شود؛
 *   پایه‌های خارج ماتریس (کرنر/کارت/نیمه اول) در رنگ‌بندی لحاظ نمی‌شوند و با برچسب
 *   «پوشش تخمینی» اعلام می‌گردند.
 */
export function coverageGrid(
  structure: CoverageStructure,
  primaryMatchId: string,
  matrix: number[][]
): CoverageMap {
  const n = matrix.length;
  const cells: CoverageCell[][] = [];
  let aCells = 0;
  let bCells = 0;
  let bothCells = 0;
  let covered = 0;
  let bothWinProb = 0;

  const isConditional = structure.varAMatchId !== primaryMatchId || structure.varBMatchId !== primaryMatchId;
  const legsA = structure.legsA && structure.legsA.length > 0 ? structure.legsA : null;
  // v17.0 — legsB خالی = حالت تک‌تیپ (BANKER) — تیپ A تنها ردیف پوشش است
  const legsB = structure.legsB && structure.legsB.length > 0 ? structure.legsB : null;
  const hasOffMatrixLegs = Boolean(
    legsA?.some(isOffMatrixKey) || legsB?.some(isOffMatrixKey)
  );
  const matA = legsA ? legsA.filter((k) => !isOffMatrixKey(k)) : null;
  const matB = legsB ? legsB.filter((k) => !isOffMatrixKey(k)) : null;
  // v17.0 — خوشه نتیجه دقیق: هر ۴ کلید CS_ = «هرکدام» (any-of) نه همه با هم
  const isClusterA = Boolean(matA && matA.length > 1 && matA.every((k) => k.startsWith("CS_")));
  const isClusterB = Boolean(matB && matB.length > 1 && matB.every((k) => k.startsWith("CS_")));

  for (let h = 0; h < n; h++) {
    cells[h] = [];
    for (let a = 0; a < n; a++) {
      const p = matrix[h][a];
      let kind: CoverKind = "NONE";

      if (legsA && matA && (matB === null || matB.length > 0)) {
        // ═══ زوج متعامد v5.0 / تک‌تیپ یا خوشه v17.0 ═══
        const winsA = matA.length > 0 ? (isClusterA ? matA.some((k) => selectionCoversCell(k, h, a)) : matA.every((k) => selectionCoversCell(k, h, a))) : false;
        const winsB = matB && matB.length > 0 ? (isClusterB ? matB.some((k) => selectionCoversCell(k, h, a)) : matB.every((k) => selectionCoversCell(k, h, a))) : false;
        if (winsA && winsB) {
          kind = "BOTH";
          bothCells++;
          bothWinProb += p;
          covered += p;
        } else if (winsA) {
          kind = "A_ONLY";
          aCells++;
          covered += p;
        } else if (winsB) {
          kind = "B_ONLY";
          bCells++;
          covered += p;
        }
      } else if (isConditional) {
        // میکس دو بازی: هر دو تیپ پایه مشترک روی این بازی دارند
        const base = selectionCoversCell(structure.baseKey, h, a);
        kind = base ? "A_ONLY" : "NONE";
        if (base) {
          aCells++;
          covered += p;
        }
      } else {
        const base = selectionCoversCell(structure.baseKey, h, a);
        const winsA = base && selectionCoversCell(structure.varAKey, h, a);
        const winsB = base && selectionCoversCell(structure.varBKey, h, a);
        if (winsA && winsB) {
          kind = "BOTH";
          bothCells++;
          bothWinProb += p;
          covered += p;
        } else if (winsA) {
          kind = "A_ONLY";
          aCells++;
          covered += p;
        } else if (winsB) {
          kind = "B_ONLY";
          bCells++;
          covered += p;
        }
      }
      cells[h][a] = { h, a, p, kind };
    }
  }

  const totalCells = n * n;
  void totalCells;
  return {
    cells,
    stats: {
      aCells,
      bCells,
      bothCells,
      coveredPct: (covered / Math.max(1e-9, matrix.flat().reduce((s, x) => s + x, 0))) * 100,
      bothWinProb,
    },
    isConditional,
    hasOffMatrixLegs,
  };
}

/** کلاس رنگ تیلویند برای هر نوع خانه */
export function coverColor(kind: CoverKind): string {
  switch (kind) {
    case "A_ONLY": return "bg-sky-500/80 text-white";
    case "B_ONLY": return "bg-emerald-500/80 text-white";
    case "BOTH": return "bg-amber-400/90 text-black";
    default: return "bg-white/6 text-white/35";
  }
}
