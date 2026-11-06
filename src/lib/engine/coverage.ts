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
    case "U35": return tot < 3.5;
    case "BTTS_Y": return h > 0 && a > 0;
    case "BTTS_N": return h === 0 || a === 0;
    default: return false; // کرنر/کارت خارج از ماتریس نمره است
  }
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
}

/**
 * ساخت گرید پوشش برای زوج تیپ:
 * - بیلدر تک‌بازی: هر دو متغیر روی همین بازی → رنگ‌بندی کامل (آبی/سبز/طلایی)
 * - میکس دو بازی: فقط پایه مشترک روی این بازی رنگ می‌شود (پوشش مشروط)
 */
export function coverageGrid(
  structure: { baseKey: string; varAKey: string; varBKey: string; varAMatchId: string; varBMatchId: string },
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

  for (let h = 0; h < n; h++) {
    cells[h] = [];
    for (let a = 0; a < n; a++) {
      const p = matrix[h][a];
      const base = selectionCoversCell(structure.baseKey, h, a);
      let kind: CoverKind = "NONE";

      if (isConditional) {
        // میکس دو بازی: هر دو تیپ پایه مشترک روی این بازی دارند
        kind = base ? "A_ONLY" : "NONE";
        if (base) {
          aCells++;
          covered += p;
        }
      } else {
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
