// ─────────────────────────────────────────────
// موتور حذف حاشیه بوک‌میکر — روش شین (Shin) + توان (Power) + ساده
// حذف حاشیه با تقسیم ساده سوگیری Favorite-Longshot دارد؛
// مدل شین سهم «معامله‌گران آگاه» (z) را از جریان شرط‌ها جدا می‌کند.
// مرجع: Shin (1993) + پیاده‌سازی بسته implied (opisthokonta)
// ─────────────────────────────────────────────

export interface DevigResult {
  probs: number[]; // احتمالات واقعی (بدون حاشیه)
  z: number; // نسبت معامله‌گران آگاه (فقط شین)
  k: number; // توان روش Power
  margin: number; // حاشیه خام (Σ 1/o − 1)
}

/** روش ساده (Multiplicative): p_i = r_i / Σr — خطای سیستماتیک روی آندوگان */
export function multiplicativeDevig(odds: number[]): number[] {
  const sum = odds.reduce((s, o) => s + 1 / o, 0);
  return odds.map((o) => 1 / o / sum);
}

/**
 * روش توان (Power): p_i = r_i^k با k طوری که Σp = 1
 * آندوگان (ضرایب بالا) را بیش از فاوریت‌ها تخفیف می‌زند.
 */
export function powerDevig(odds: number[]): { probs: number[]; k: number } {
  const r = odds.map((o) => 1 / o);
  const target = 1;
  const f = (k: number) => r.reduce((s, x) => s + Math.pow(x, k), 0);
  // f(1) = Σr > 1 و f بزرگ‌تر به صفر میل می‌رود → ریشه در k > 1
  let lo = 1;
  let hi = 2;
  if (f(1) <= 1) {
    // بدون حاشیه یا آربیتراژ — خروجی ساده
    return { probs: multiplicativeDevig(odds), k: 1 };
  }
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > target) lo = mid;
    else hi = mid;
  }
  const k = (lo + hi) / 2;
  return { probs: r.map((x) => Math.pow(x, k)), k };
}

/**
 * مدل شین: بازار ترکیبی از شرط‌بندهای عادی + معامله‌گران آگاه (نسبت z)
 * S = 1/O1 + 1/OX + 1/O2  (مجموع معکوس ضرایب — همان B)
 * p_i(z) = [√(z² + 4(1−z)·(r_i²/S)) − z] / (2(1−z))   که r_i = 1/O_i
 * z اختصاصی «هر بوک‌میکر» به‌صورت خودکار با حل تکرارشونده (Bisection دقیقاً ۲۰ گام)
 * طوری یافت می‌شود که مجموع احتمالات شین دقیقاً برابر 1.000 شود.
 */
export function shinDevig(odds: number[]): DevigResult {
  const r = odds.map((o) => 1 / o);
  const B = r.reduce((s, x) => s + x, 0); // S = مجموع معکوس ضرایب
  const margin = B - 1;

  // بازار بدون حاشیه یا زیر ۱ (آربیتراژ): شین تعریف نمی‌شود → ساده
  if (B <= 1.0005) {
    return { probs: multiplicativeDevig(odds), z: 0, k: 1, margin: Math.min(margin, 0) };
  }

  const shinP = (x: number, z: number): number => {
    if (z < 1e-9) return x / Math.sqrt(B);
    return (Math.sqrt(z * z + 4 * (1 - z) * ((x * x) / B)) - z) / (2 * (1 - z));
  };

  // f(z) = Σ p_i(z) − 1 : در z=0 مثبت (√B − 1 > 0) و در z→1 منفی
  const f = (z: number) => r.reduce((s, x) => s + shinP(x, z), 0) - 1;

  // Bisection — دقیقاً ۲۰ گام (دقت ≈ ۱۰⁻⁶ کافی و مطابق مشخصات مهندسی)
  let lo = 0;
  let hi = 0.9999;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) lo = mid;
    else hi = mid;
  }
  const z = (lo + hi) / 2;

  const probs = r.map((x) => shinP(x, z));
  const { k } = powerDevig(odds);

  return { probs, z, k, margin };
}

/**
 * حذف حاشیه از بازار دوگانه (بالای/زیر یا بله/خیر) — برای OU از شین دوحالته استفاده می‌کنیم
 */
export function shinDevigPair(odds: [number, number]): { over: number; under: number; z: number; margin: number } {
  const res = shinDevig(odds);
  return { over: res.probs[0], under: res.probs[1], z: res.z, margin: res.margin };
}

export const BOOKMAKER_LABELS: Record<string, string> = {
  PINNACLE: "پیناکل (Sharp)",
  SOFT_A: "بت‌مستر (Soft)",
  SOFT_B: "پرسیان‌بت (Soft)",
};
