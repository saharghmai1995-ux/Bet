// ─────────────────────────────────────────────
// بهینه‌ساز کلِی همزمان (Simultaneous Multi-Bet Kelly)
// برخلاف کلِی تک‌شرطی، دو تیپ هم‌بسته را با هم بهینه می‌کند:
//   max G(fA,fB) = Σ p_ij · log(1 + fA·rA_ij + fB·rB_ij)
// حل با صعود گرادیانی پیش‌نمونه‌دار (Projected Gradient Ascent)
// مرجع: arXiv 1710.00431 — Simultaneous Kelly Betting
// ─────────────────────────────────────────────

export interface KellyState {
  p: number; // احتمال این حالت از توزیع همزمان
  aWins: boolean; // تیپ A در این حالت می‌برد؟
  bWins: boolean;
}

export interface KellyResult {
  fA: number; // کسر سرمایه تیپ A
  fB: number;
  growth: number; // نرخ رشد لگاریتمی بهینه E[log]
  singleKellyA: number; // کلِی تک‌شرطی A (برای مقایسه)
  singleKellyB: number;
  evPct: number; // EV مجموع پرتفوی
}

/** کلِی تک‌شرطی استاندارد: f* = (p·o − 1) / (o − 1) */
export function singleKelly(p: number, odds: number): number {
  if (odds <= 1) return 0;
  const f = (p * odds - 1) / (odds - 1);
  return Math.max(0, Math.min(0.25, f));
}

/**
 * کلِی همزمان روی توزیع همزمان دو تیپ.
 * states باید کل فضای حالات (4 حالت: هر دو برد / فقط A / فقط B / هیچ‌کدام) را پوشش دهد.
 */
export function simultaneousKelly(
  states: KellyState[],
  oddsA: number,
  oddsB: number,
  opts?: { maxTotal?: number; iters?: number }
): KellyResult {
  const maxTotal = opts?.maxTotal ?? 0.30;
  const iters = opts?.iters ?? 600;

  const norm = (s: KellyState[]) => {
    const sum = s.reduce((acc, x) => acc + Math.max(0, x.p), 0);
    return sum > 0 ? s.map((x) => ({ ...x, p: Math.max(0, x.p) / sum })) : s;
  };
  const S = norm(states);

  const rA = (st: KellyState) => (st.aWins ? oddsA - 1 : -1);
  const rB = (st: KellyState) => (st.bWins ? oddsB - 1 : -1);

  const growth = (fA: number, fB: number) =>
    S.reduce((acc, st) => acc + st.p * Math.log(1 + fA * rA(st) + fB * rB(st)), 0);

  // صعود گرادیانی با گام سازگارشونده
  let fA = Math.max(singleKelly(S.reduce((s, x) => s + x.p * (x.aWins ? 1 : 0), 0), oddsA) * 0.5, 0.001);
  let fB = Math.max(singleKelly(S.reduce((s, x) => s + x.p * (x.bWins ? 1 : 0), 0), oddsB) * 0.5, 0.001);
  let lr = 0.05;

  for (let i = 0; i < iters; i++) {
    let gA = 0;
    let gB = 0;
    for (const st of S) {
      const w = st.p / Math.max(1e-9, 1 + fA * rA(st) + fB * rB(st));
      gA += w * rA(st);
      gB += w * rB(st);
    }
    fA += lr * gA;
    fB += lr * gB;
    // پیش‌نمونه‌گذاری: محدوده مجاز [0, 0.2] هر تیپ و سقف مجموع
    fA = Math.min(Math.max(fA, 0), 0.2);
    fB = Math.min(Math.max(fB, 0), 0.2);
    if (fA + fB > maxTotal) {
      const scale = maxTotal / (fA + fB);
      fA *= scale;
      fB *= scale;
    }
    if (i % 150 === 149) lr *= 0.5; // کاهش گام
  }

  // EV پرتفوی: E[سود] = Σ p·(fA·rA + fB·rB)
  const ev = S.reduce((acc, st) => acc + st.p * (fA * rA(st) + fB * rB(st)), 0);

  const pA = S.reduce((s, x) => s + x.p * (x.aWins ? 1 : 0), 0);
  const pB = S.reduce((s, x) => s + x.p * (x.bWins ? 1 : 0), 0);

  return {
    fA,
    fB,
    growth: growth(fA, fB),
    singleKellyA: singleKelly(pA, oddsA),
    singleKellyB: singleKelly(pB, oddsB),
    evPct: ev,
  };
}
