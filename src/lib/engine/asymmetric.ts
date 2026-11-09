// ─────────────────────────────────────────────────────────────────────────────
// موتور تخصیص نامتقارن (Asymmetric Free-Roll Booster) — v11.0
//
// مسئله ریاضی (از کارنامه واقعی ۳۹ کارت ریسک زیر ۱۰٪):
//   در ۹ کارت، با وجود برد ۱۰۰٪، تقسیم «سود برابر» به دلیل نزدیک بودن ضرایب
//   فقط +۴٪ تا +۷٪ سود می‌دهد. راه‌حل: قفل اصل سرمایه روی تیپ B + پرتاب
//   سود روی تیپ A (Principal-Lock Mode).
//
// فرمول تخصیص نامتقارن برای بودجه کل B = ۱۰۰ واحد:
//   Stake_B = B / O_B      → اگر تیپ B ببرد دقیقاً B برمی‌گردد (ضرر = صفر مطلق)
//   Stake_A = B − Stake_B  → اگر تیپ A ببرد، سود خالص بزرگ
//
// سناریوهای بازده (Principal-Lock):
//   برد تیپ A  →  Stake_A × O_A − B         (سود شتاب‌دهنده)
//   برد تیپ B  →  Stake_B × O_B − B = 0.0   (برگشت ۱۰۰٪ اصل — بدون ضرر)
//   باخت هر دو →  −B                        (مثل هر داچینگ کامل)
// ─────────────────────────────────────────────────────────────────────────────

/** حالت تخصیص بودجه روی فلش‌کارت — v11.0 دو سوییچه شفاف */
export type AllocationMode = "EQUAL_PROFIT" | "PRINCIPAL_LOCK";

/** خروجی یک استراتژی تخصیص روی بودجه ۱۰۰ واحدی */
export interface AllocationPlan {
  mode: AllocationMode;
  /** استیک تیپ A (واحد) */
  stakeA: number;
  /** استیک تیپ B (واحد) */
  stakeB: number;
  /** سود خالص اگر تیپ A ببرد (واحد) */
  profitIfA: number;
  /** سود خالص اگر تیپ B ببرد (واحد) */
  profitIfB: number;
  /** بازده درصدی بدترین سناریوی سودآور (معیار مقایسه) */
  worstCaseProfitPct: number;
  /** بازده درصدی بهترین سناریو */
  bestCaseProfitPct: number;
  /** آیا اصل پول در یک سناریو ۱۰۰٪ محافظت می‌شود؟ (فقط Principal-Lock) */
  principalProtected: boolean;
}

const r1 = (v: number) => Math.round(v * 10) / 10;

/** ⚖️ حالت ۱ — سود تضمینی برابر (Equal Profit / Dutching کلاسیک) */
export function equalProfitAllocation(oddsA: number, oddsB: number, bank = 100): AllocationPlan {
  const s = 1 / oddsA + 1 / oddsB;
  const stakeA = (1 / oddsA / s) * bank;
  const stakeB = (1 / oddsB / s) * bank;
  const profit = bank / s - bank; // سود یکسان در هر دو سناریو
  return {
    mode: "EQUAL_PROFIT",
    stakeA: r1(stakeA),
    stakeB: r1(stakeB),
    profitIfA: r1(profit),
    profitIfB: r1(profit),
    worstCaseProfitPct: r1((profit / bank) * 100),
    bestCaseProfitPct: r1((profit / bank) * 100),
    principalProtected: false,
  };
}

/** 🚀 حالت ۲ — شتاب‌دهنده نامتقارن (Principal-Lock Booster) */
export function principalLockAllocation(oddsA: number, oddsB: number, bank = 100): AllocationPlan {
  const stakeB = bank / oddsB; // بازگشت دقیق بانک اگر B ببرد
  const stakeA = bank - stakeB;
  const profitIfA = stakeA * oddsA - bank;
  const profitIfB = stakeB * oddsB - bank; // = 0
  return {
    mode: "PRINCIPAL_LOCK",
    stakeA: r1(stakeA),
    stakeB: r1(stakeB),
    profitIfA: r1(profitIfA),
    profitIfB: r1(profitIfB),
    worstCaseProfitPct: r1((Math.min(profitIfA, profitIfB) / bank) * 100),
    bestCaseProfitPct: r1((Math.max(profitIfA, profitIfB) / bank) * 100),
    principalProtected: true,
  };
}

/** هر دو استراتژی یک کارت — برای سوییچ دوحالته فلش‌کارت */
export function allocationPlans(oddsA: number, oddsB: number, bank = 100): { equal: AllocationPlan; booster: AllocationPlan } {
  return {
    equal: equalProfitAllocation(oddsA, oddsB, bank),
    booster: principalLockAllocation(oddsA, oddsB, bank),
  };
}

/**
 * سود شتاب‌دهنده نامتقارن یک کارت (درصد) — معیار فیلتر «شتاب‌دهنده نامتقارن»:
 * کارت‌های ریسک زیر ۱۰٪ که حالت Principal-Lock رویشان سود بالای ۲۵٪ می‌دهد.
 */
export function boosterProfitPct(oddsA: number, oddsB: number): number {
  return principalLockAllocation(oddsA, oddsB).bestCaseProfitPct;
}

/**
 * P&L واقعی حالت Principal-Lock برای یک کارت «تسویه‌شده» (شبیه‌سازی کاغذی).
 * status: WON_A | WON_B | DOUBLE_WIN | MIDDLE_TRAP
 * DOUBLE_WIN یعنی هر دو برندند → سناریوی برد A (سود شتاب‌دهنده).
 */
export function principalLockSettledPnl(oddsA: number, oddsB: number, status: string, bank = 100): number {
  const p = principalLockAllocation(oddsA, oddsB, bank);
  switch (status) {
    case "WON_A":
    case "DOUBLE_WIN":
      return p.profitIfA;
    case "WON_B":
      return p.profitIfB; // صفر مطلق — اصل پول برگشت
    case "MIDDLE_TRAP":
      return -bank;
    default:
      return 0;
  }
}
