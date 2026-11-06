// ─────────────────────────────────────────────
// امتیازدهی الو پویا (Dynamic ELO) + تعدیل غیبت بازیکنان کلیدی
// ─────────────────────────────────────────────

export const HOME_ADV_ELO = 65; // مزیت میزبانی در امتیاز الو

/**
 * احتمال امتیازگیری تیم میزبان بر اساس الو
 * E = 1 / (1 + 10^((eloAway − eloHome − homeAdv) / 400))
 */
export function eloExpectedScore(eloHome: number, eloAway: number, homeAdv = HOME_ADV_ELO): number {
  return 1 / (1 + Math.pow(10, (eloAway - eloHome - homeAdv) / 400));
}

/**
 * به‌روزرسانی امتیاز الو پس از نتیجه بازی
 * K-factor پویا: بازی‌های حساس‌تر (حذفی/دربی) ضریب بالاتر
 */
export function updateElo(
  eloHome: number,
  eloAway: number,
  result: 0 | 0.5 | 1, // 1 = برد میزبان، 0.5 = مساوی، 0 = برد میهمان
  k = 20,
  homeAdv = HOME_ADV_ELO
): { eloHome: number; eloAway: number } {
  const e = eloExpectedScore(eloHome, eloAway, homeAdv);
  const delta = k * (result - e);
  return { eloHome: eloHome + delta, eloAway: eloAway - delta };
}

/**
 * کسر اثر خلاقیت در صورت غیبت پلی‌میکر اصلی:
 * بر اساس اهمیت بازیکن (0 تا 1) و تعداد روز غیبت، ضریب الو مؤثر تعدیل می‌شود
 */
export function eloAbsenceAdjustment(elo: number, importance: number): number {
  // غیبت بازیکن با اهمیت ۱ (ستاره تیم) ≈ ۴۰ امتیاز الو منفی
  return elo - 40 * Math.max(0, Math.min(1, importance));
}
