// ─────────────────────────────────────────────────────────────────────────────
// بهینه‌ساز کلِی همزمان با قید بودجه (Budget-Constrained Simultaneous Kelly)
// v3.0 — تخصیص خودکار بودجه روزانه بین چند زوج‌تیپ مکمل (دوراهی کارت‌ها)
//
// ریاضیات:
//   هر زوج i توزیع همزمان ۴ حالتی دارد و رشد لگاریتمی خودش:
//     G_i(fA,fB) = Σ_j p_ij · ln(1 + fA·rA_j + fB·rB_j)
//   بازی‌ها مستقل‌اند → رشد کل = Σ G_i (لگاریتم جمع‌پذیر)
//   قید: Σ_i (fA_i + fB_i) ≤ D  (D = کسر استقرار از بودجه روزانه)
//
//   حل با ضرب لانگرانژ: f_i(λ) = argmax [ G_i(f) − λ·(fA+fB) ]
//   و جست‌وجوی دوبخشی روی λ تا Σ_i (fA_i+fB_i) = D
//   حل‌کننده داخلی هر زوج: صعود گرادیانی پیش‌نمونه‌دار (مثل arXiv 1710.00431)
// ─────────────────────────────────────────────────────────────────────────────

export interface SimKellyPairInput {
  id: string;
  label?: string;
  /** توزیع همزمان ۴ حالتی از مونت‌کارلو */
  jointStates: { bothWin: number; aOnly: number; bOnly: number; bothLose: number };
  oddsA: number;
  oddsB: number;
}

export interface SimKellyAllocation {
  id: string;
  label?: string;
  fA: number; // کسر نهایی از کل بودجه برای تیپ A
  fB: number;
  stakeA: number; // مبلغ نهایی (واحد پول)
  stakeB: number;
  pairTotal: number;
  growth: number; // نرخ رشد لگاریتمی بهینه این زوج پس از قید
}

export interface SimKellyResult {
  allocations: SimKellyAllocation[];
  deployed: number; // مجموع کسر مستقرشده (۰..۱)
  growth: number; // نرخ رشد کل پرتفوی (لگاریتمی)
  constrained: boolean; // آیا قید بودجه فعال شد؟
}

interface _PairState {
  p: number;
  aWins: boolean;
  bWins: boolean;
}

/** حل داخلی یک زوج با جریمه لانگرانژ λ */
function solvePairWithPenalty(
  states: _PairState[],
  oddsA: number,
  oddsB: number,
  lambda: number,
  opts: { maxEach?: number; maxTotal?: number; iters?: number } = {}
): { fA: number; fB: number; growth: number } {
  const maxEach = opts.maxEach ?? 0.2;
  const maxTotal = opts.maxTotal ?? 0.35;
  const iters = opts.iters ?? 400;

  const rA = (st: _PairState) => (st.aWins ? oddsA - 1 : -1);
  const rB = (st: _PairState) => (st.bWins ? oddsB - 1 : -1);

  const growth = (fA: number, fB: number) =>
    states.reduce((acc, st) => acc + st.p * Math.log(1 + fA * rA(st) + fB * rB(st)), 0);

  let fA = 0.01;
  let fB = 0.01;
  let lr = 0.06;

  for (let it = 0; it < iters; it++) {
    let gA = 0;
    let gB = 0;
    for (const st of states) {
      const w = Math.max(1e-9, 1 + fA * rA(st) + fB * rB(st));
      gA += (st.p * rA(st)) / w - lambda;
      gB += (st.p * rB(st)) / w - lambda;
    }
    fA += lr * gA;
    fB += lr * gB;
    // پیش‌نمونه‌گذاری روی محدوده مجاز
    fA = Math.min(Math.max(fA, 0), maxEach);
    fB = Math.min(Math.max(fB, 0), maxEach);
    if (fA + fB > maxTotal) {
      const s = maxTotal / (fA + fB);
      fA *= s;
      fB *= s;
    }
    if (it % 100 === 99) lr *= 0.6;
  }

  return { fA, fB, growth: growth(fA, fB) };
}

function normalizeStates(js: SimKellyPairInput["jointStates"]): _PairState[] {
  const raw = [
    { p: js.bothWin, aWins: true, bWins: true },
    { p: js.aOnly, aWins: true, bWins: false },
    { p: js.bOnly, aWins: false, bWins: true },
    { p: js.bothLose, aWins: false, bWins: false },
  ];
  const sum = raw.reduce((s, x) => s + Math.max(0, x.p), 0);
  if (sum <= 0) return raw.map((x) => ({ ...x, p: 0.25 }));
  return raw.map((x) => ({ ...x, p: Math.max(0, x.p) / sum }));
}

/**
 * تخصیص بودجه بین چند زوج مستقل با کلِی همزمان و قید Σ(fA+fB) ≤ deployment.
 * deployment = 1 یعنی کل بودجه روزانه (حداکثر) درگیر شود.
 */
export function solveSimultaneousKelly(
  pairs: SimKellyPairInput[],
  budget: number,
  deployment = 1,
  opts?: { maxEach?: number; maxTotal?: number }
): SimKellyResult {
  const D = Math.min(1, Math.max(0.05, deployment));
  const valid = pairs.filter((p) => p.oddsA > 1.01 && p.oddsB > 1.01 && budget > 0);

  if (valid.length === 0) {
    return { allocations: [], deployed: 0, growth: 0, constrained: false };
  }

  const statesFor = valid.map((p) => normalizeStates(p.jointStates));

  const totalAt = (lambda: number) =>
    valid.reduce((acc, _, i) => {
      const r = solvePairWithPenalty(statesFor[i], valid[i].oddsA, valid[i].oddsB, lambda, opts);
      return acc + r.fA + r.fB;
    }, 0);

  // اگر حل بدون قید (λ=0) زیر سقف بود بود، همان بهینه سراسری است
  const unconstrainedTotal = totalAt(0);
  let lambda = 0;
  let constrained = false;

  if (unconstrainedTotal > D) {
    constrained = true;
    let lo = 0;
    let hi = 0.5;
    // یافتن سقف λ با دوبرابرکردن
    while (totalAt(hi) > D && hi < 64) hi *= 2;
    // جست‌وجوی دوبخشی روی λ
    for (let k = 0; k < 42; k++) {
      const mid = (lo + hi) / 2;
      if (totalAt(mid) > D) lo = mid;
      else hi = mid;
    }
    lambda = (lo + hi) / 2;
  }

  const allocations: SimKellyAllocation[] = valid.map((p, i) => {
    const r = solvePairWithPenalty(statesFor[i], p.oddsA, p.oddsB, lambda, opts);
    const fA = Math.round(r.fA * 10000) / 10000;
    const fB = Math.round(r.fB * 10000) / 10000;
    return {
      id: p.id,
      label: p.label,
      fA,
      fB,
      stakeA: Math.round(fA * budget * 10) / 10,
      stakeB: Math.round(fB * budget * 10) / 10,
      pairTotal: Math.round((fA + fB) * budget * 10) / 10,
      growth: r.growth,
    };
  });

  const deployed = allocations.reduce((s, a) => s + a.fA + a.fB, 0);
  const growth = allocations.reduce((s, a) => s + a.growth, 0);

  return { allocations, deployed, growth, constrained };
}
