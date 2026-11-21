// ─────────────────────────────────────────────────────────────────────────────
// قیمت‌گذاری واقعی بازار (Real Market Pricing) — v24.0
//
// پایان «قیمت‌گذاری فانتزی»: هر پای با بازسازی ماتریس دیکسون-کولز از خط واقعی
// 1X2 + O/U بازار، به قیمت واقعی کلاس betforward/1xbet (payout ۰.۹۴۵) می‌رسد.
// این ماژول در لایه موتور است تا هم خط صدور کارت و هم خط راستی‌آزمایی از همان
// یک منبع استفاده کنند — دو منبع = دو عدد = اختلافی که کاربر در سایت می‌بیند.
// ─────────────────────────────────────────────────────────────────────────────

import { buildScoreMatrix } from "@/lib/engine/poisson";
import { selectionCoversCell } from "@/lib/engine/coverage";
import { solveMarketImpliedLambdas } from "@/lib/engine/reverse-poisson";

/** payout واقعی بوکمیکرهای کلاس 1xBet/betforward (اورراند ≈ ۵.۵٪) */
export const REAL_BOOK_PAYOUT = 0.945;
/** آستانه گپ قابل‌قبول بین ضریب کارت و قیمت واقعی بازار (٪) */
export const REALITY_GAP_TOLERANCE_PCT = 12;

// ─── دسترس‌پذیری بازار در سایت‌های واقعی ───
export type MarketAvailability = "DIRECT" | "BETBUILDER" | "MATCH_ONLY" | "OFF_BOARD";

const DIRECT_MARKETS = new Set([
  "HOME", "DRAW", "AWAY", "DC_1X", "DC_X2", "O25", "U25", "O15", "U15", "O35", "U35",
  "BTTS_Y", "BTTS_N", "DNB_HOME", "DNB_AWAY", "NO_DRAW", "TGOAL_HOME", "TGOAL_AWAY",
  "WIN_NIL_HOME", "WIN_NIL_AWAY", "HOME_O15", "AWAY_O15", "EXACT2",
  "AH_HOME_15", "AH_AWAY_15", "ASIAN_O20", "ASIAN_U20", "HOME_BY_1",
]);
const BETBUILDER_MARKETS = new Set(["C1XU35", "CX2U35", "CHOME15", "CBTTS25"]);

export function marketAvailability(key: string): MarketAvailability {
  if (DIRECT_MARKETS.has(key)) return "DIRECT";
  if (BETBUILDER_MARKETS.has(key)) return "BETBUILDER";
  if (key.startsWith("CS_")) return "DIRECT"; // نتیجه دقیق در هر دو سایت تکی موجود است
  return "OFF_BOARD"; // کرنر / کارت / نیمه اول — خارج از ماتریس
}

export interface RealMarketLine {
  oddsHome: number;
  oddsDraw: number;
  oddsAway: number;
  oddsOver25?: number | null;
  oddsUnder25?: number | null;
}

/**
 * بازسازی ماتریس امتیازِ بدون‌حاشیه از خط واقعی بازار (مهندسی معکوس پواسون).
 * خروجی = ماتریس ۶×۶ که «قیمت واقعی هر انتخاب دلخواه» از آن استخراج می‌شود.
 */
export function buildRealMatrixFromLine(line: RealMarketLine): {
  matrix: number[][];
  lambdaHome: number;
  lambdaAway: number;
} | null {
  const valid = [line.oddsHome, line.oddsDraw, line.oddsAway].every(
    (o) => Number.isFinite(o) && o >= 1.01
  );
  if (!valid) return null;
  const solved = solveMarketImpliedLambdas({
    oddsHome: line.oddsHome,
    oddsDraw: line.oddsDraw,
    oddsAway: line.oddsAway,
    oddsOver25: line.oddsOver25 ?? null,
    oddsUnder25: line.oddsUnder25 ?? null,
  });
  if (!solved) return null;
  const matrix = buildScoreMatrix(solved.lambdaHome, solved.lambdaAway, -0.08, 8);
  return { matrix, lambdaHome: solved.lambdaHome, lambdaAway: solved.lambdaAway };
}

/** احتمال واقعی یک پای روی ماتریس امتیاز بازار */
export function legRealProb(matrix: number[][], key: string): number | null {
  if (marketAvailability(key) === "OFF_BOARD") return null;
  let p = 0;
  for (let h = 0; h < matrix.length; h++) {
    for (let a = 0; a < matrix[h].length; a++) {
      if (selectionCoversCell(key, h, a)) p += matrix[h][a];
    }
  }
  return p > 0.0001 ? p : null;
}

/**
 * قیمت واقعی‌پذیر یک پای:
 *   · مارکت پایه با خط مستقیم بوکمیکر → همان قیمت واقعی
 *   · مابقی → fair استخراجی از ماتریس ÷ payout واقعی (کلاس 1xBet)
 */
export function realLegPrice(
  key: string,
  matrix: number[][],
  directOdds?: number | null
): { realProb: number | null; realFairOdds: number | null; realBookOdds: number | null } {
  if (marketAvailability(key) === "OFF_BOARD") {
    return { realProb: null, realFairOdds: null, realBookOdds: null };
  }
  const realProb = legRealProb(matrix, key);
  if (realProb == null) return { realProb: null, realFairOdds: null, realBookOdds: null };
  const fair = 1 / realProb;
  const book =
    typeof directOdds === "number" && directOdds >= 1.01
      ? directOdds
      : Math.max(1.01, fair / REAL_BOOK_PAYOUT);
  return {
    realProb,
    realFairOdds: Math.round(fair * 100) / 100,
    realBookOdds: Math.round(book * 100) / 100,
  };
}

/** گپ درصدی ضریب کارت نسبت به قیمت واقعی (+ یعنی کارت گران‌تر از سایت واقعی) */
export function realityGapPct(cardOdds: number, realBookOdds: number): number {
  return Math.round((cardOdds / realBookOdds - 1) * 1000) / 10;
}
