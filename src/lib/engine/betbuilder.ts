// ─────────────────────────────────────────────────────────────────────────────
// سازنده تیپ مکمل همبسته (Correlated Bet Builder) — احتمال دقیق از خانه‌های ماتریس
// ضرب کردن مستقیم P(1X) × P(Over 2.5) روی «یک بازی واحد» همبستگی درون‌بازی را
// نادیده می‌گیرد؛ احتمال صحیح هر تیپ = مجموع احتمال خانه‌های مرتبط از همان
// ماتریس نمره دیکسون-کولز.
// ─────────────────────────────────────────────────────────────────────────────

export type CellKey = string; // قالب "h-a" مثل "1-0"

/** کلید خانه ماتریس */
export const cellKey = (h: number, a: number): CellKey => `${h}-${a}`;
export const parseCell = (k: CellKey): [number, number] => {
  const [h, a] = k.split("-").map((x) => parseInt(x, 10));
  return [h, a];
};

/**
 * خانه‌های «1X و بالای ۲.۵ گل»: تمام (i, j) که در آن‌ها i >= j و i + j >= 3
 * یعنی میزبان نبازده و مجموع گل بالای ۲.۵ — دقیقاً از تعریف بازار.
 */
export function p1xOver25Cells(maxGoals = 9): CellKey[] {
  const cells: CellKey[] = [];
  for (let i = 0; i <= maxGoals; i++)
    for (let j = 0; j <= maxGoals; j++) if (i >= j && i + j >= 3) cells.push(cellKey(i, j));
  return cells;
}

/**
 * خانه‌های «1X و زیر ۲.۵ گل»: دقیقاً (0,0)، (1,0)، (2,0) و (1,1)
 * (تنها نمراتی که هم میزبان نبازده است و هم مجموع گل ≤ ۲)
 */
export const P1X_UNDER25_CELLS: CellKey[] = [cellKey(0, 0), cellKey(1, 0), cellKey(2, 0), cellKey(1, 1)];

/**
 * احتمال دقیق یک سبد نتیجه: مجموع احتمال خانه‌های انتخابی از ماتریس دیکسون-کولز
 * matrix می‌تواند ۶×۶ (نمایش UI) یا ۱۰×۱۰ (موتور کامل) باشد.
 */
export function basketProb(matrix: number[][], cells: CellKey[]): number {
  let sum = 0;
  for (const k of cells) {
    const [h, a] = parseCell(k);
    const row = matrix[h];
    if (row && typeof row[a] === "number") sum += row[a];
  }
  return sum;
}

/**
 * احتمال باخت همزمان دو تیپ روی یک بازی: مجموع خانه‌های «انتخاب‌نشده»
 * (خانه‌هایی که نه در تیپ اول هستند و نه در تیپ دوم — هر دو تیپ فقط در این
 * نمرات می‌بازند؛ اگر صفر شود، دو تیپ «مکمل واقعی» هستند.)
 */
export function jointLossProb(matrix: number[][], cellsA: CellKey[], cellsB: CellKey[]): number {
  const covered = new Set([...cellsA, ...cellsB]);
  let lose = 0;
  for (let h = 0; h < matrix.length; h++) {
    const row = matrix[h];
    if (!row) continue;
    for (let a = 0; a < row.length; a++) {
      if (!covered.has(cellKey(h, a))) lose += row[a];
    }
  }
  return lose;
}

/** ضریب عادلانه از احتمال (با حاشیه اختیاری) */
export function fairOddsFrom(p: number, margin = 1): number {
  if (p <= 0) return 999;
  return Math.max(1.01, Math.round((1 / (p * margin)) * 100) / 100);
}

/**
 * تقسیم سود برابر (Equal-Profit Dutching) بین دو تیپ:
 *   stake_i ∝ (1/o_i) / S  و S = Σ 1/o_i
 * اگر S < 1 باشد در صورت برد هر کدام از دو تیپ، سود خالص یکسان حاصل می‌شود.
 */
export function equalProfitSplit(oddsA: number, oddsB: number, totalStake: number): {
  stakeA: number;
  stakeB: number;
  impliedSum: number;
  guaranteedMargin: number;
  profitEach: number;
} {
  const iA = 1 / oddsA;
  const iB = 1 / oddsB;
  const S = iA + iB;
  const stakeA = (totalStake * iA) / S;
  const stakeB = (totalStake * iB) / S;
  const profitEach = (stakeA * oddsA) - totalStake; // == stakeB*oddsB − totalStake
  return { stakeA, stakeB, impliedSum: S, guaranteedMargin: 1 - S, profitEach };
}

/**
 * پیش‌فرض‌های هوشمند سبد: تقسیم خانه‌های 1X به دو سبد مکمل بر اساس خط گل
 * (برای دکمه «پرکردن خودکار مکمل»):
 *   سبد A (بازی باز): 1X و i+j >= 3   → p = P(1X) − P(1X & U2.5)
 *   سبد B (بازی بسته): (0,0),(1,0),(2,0),(1,1)
 * پوشش: تا وقتی میزبان نبازد، دقیقاً یکی از دو سبد برنده است.
 */
export function defaultCoveringBaskets(): { a: CellKey[]; b: CellKey[] } {
  const b = [...P1X_UNDER25_CELLS];
  const a: CellKey[] = [];
  for (let i = 0; i <= 5; i++)
    for (let j = 0; j <= 5; j++) if (i >= j && i + j >= 3) a.push(cellKey(i, j));
  return { a, b };
}
