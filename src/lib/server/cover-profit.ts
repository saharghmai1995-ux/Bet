// ─────────────────────────────────────────────────────────────────────────────
// محاسبه‌گر واقعی «سود تضمینی پوششی» (Real Guaranteed Cover Profit) — v20.0
//
// پاسخ مستقیم به پرسش کارفرما: «چرا سود تضمینی پوششی در کپشن محاسبه نمی‌شود؟»
// ریشه باگ: کپشن و پوستر مقدار ذخیره‌شده marginPct را چاپ می‌کردند که برای بسیاری
// از کارت‌ها صفر یا منفی بود (+0.0٪ یا +-36.3٪ نمایش داده می‌شد) و هیچ‌گاه از
// روی ضریب/استیک واقعی کارت محاسبه نمی‌شد. اکنون سود پوشش در لحظه ارسال از
// اعداد خود کارت (stakeA/stakeB/oddsA/oddsB) محاسبه می‌شود:
//   · برد تیپ A  → profitIfA = stakeA×oddsA − کل استیک
//   · برد تیپ B  → profitIfB = stakeB×oddsB − کل استیک
//   · سود تضمینی پوششی = کمینه این دو سناریو (بدترین حالت)
// کارت‌های تک‌ستونه (BANKER/ACCUMULATOR با stakeB=0) فاقد پوشش‌اند؛ سود «در
// صورت برد» و ریسک کامل −استیک به‌صورت صادقانه گزارش می‌شود.
// ─────────────────────────────────────────────────────────────────────────────

export interface CoverProfitInput {
  stakeA: number;
  stakeB: number;
  oddsA: number;
  oddsB: number;
}

export interface CoverProfitResult {
  /** کل استیک بلیت (stakeA + stakeB) */
  staked: number;
  /** سود خالص وقتی تیپ A می‌برد (تیپ B سوخته) */
  profitIfA: number;
  /** سود خالص وقتی تیپ B می‌برد (تیپ A سوخته) — کارت تک‌ستونه = null */
  profitIfB: number | null;
  /** سود تضمینی پوششی = بدترین سناریو (تک‌ستونه = سود برد) */
  guarantee: number;
  /** آیا پوشش داچینگ واقعی وجود دارد؟ */
  hedged: boolean;
  /** درصد سود تضمینی نسبت به کل استیک */
  guaranteePct: number;
}

/** محاسبه سود تضمینی پوششی از اعداد واقعی کارت — همیشه عدد می‌دهد */
export function coverProfitOf(slip: CoverProfitInput): CoverProfitResult {
  const staked = (slip.stakeA || 0) + (slip.stakeB || 0);
  const hedged = staked > 0 && (slip.stakeB || 0) > 0 && (slip.oddsB || 0) > 1.01;
  const profitIfA = staked > 0 ? (slip.stakeA || 0) * (slip.oddsA || 0) - staked : 0;
  const profitIfB = hedged ? (slip.stakeB || 0) * (slip.oddsB || 0) - staked : null;
  const guarantee = profitIfB !== null ? Math.min(profitIfA, profitIfB) : profitIfA;
  const r2 = (v: number) => Math.round(v * 100) / 100;
  return {
    staked: r2(staked),
    profitIfA: r2(profitIfA),
    profitIfB: profitIfB === null ? null : r2(profitIfB),
    guarantee: r2(guarantee),
    hedged,
    guaranteePct: staked > 0 ? r2((guarantee / staked) * 100) : 0,
  };
}

/** قالب درصد با علامت صحیح (+18.3% | −36.3%) — هرگز «+-36.3%» چاپ نمی‌کند */
export function signedPct(v: number, digits = 1): string {
  return `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(digits)}%`;
}

/** قالب واحد با علامت صحیح (+18.3u | −36.3u) */
export function signedUnit(v: number, digits = 1): string {
  return `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(digits)}`;
}
