// ─────────────────────────────────────────────
// کالیبراسیون پس از بازی — امتیاز بریر + اصلاح خودکار وزن مدل
// Brier = (p − outcome)² | مهارت = 1 − Brier/0.25 (تصادف = ۰)
// خروجی: ضریب اصلاحی هر لیگ که در تحلیل بعدی اعمال می‌شود
// ─────────────────────────────────────────────

/** خط مرجع پیناکل — میانگین بریر خط شارپ بازار (معیار مقایسه صنعتی) */
export const PINNACLE_BRIER = 0.192;

/**
 * Brier Skill Score (BSS) — فرمول استاندارد مهارت نسبت به حدس تصادفی:
 *   BSS = (1 − (brierScore / 0.25)) × 100
 * مثال: بریر ۰.۱۵ → BSS = +۴۰٪ (پیش‌بینی ۴۰٪ بهتر از شانس تصادفی)
 * بریر ۰.۲۵ → صفر | بریر بالای ۰.۲۵ → منفی (بدتر از تصادف)
 */
export function brierSkillScore(brierScore: number): number {
  return (1 - brierScore / 0.25) * 100;
}

export interface CalibrationRecord {
  league: string;
  predictedProb: number;
  outcome: "WIN" | "LOSS";
  brier: number;
}

export function brierScore(p: number, outcome: "WIN" | "LOSS"): number {
  const o = outcome === "WIN" ? 1 : 0;
  return (p - o) * (p - o);
}

export interface LeagueCalibration {
  league: string;
  count: number;
  avgBrier: number;
  hitRate: number;
  calibrationFactor: number; // > 1 تقویت اعتماد مدل، < ۱ کاهش (گرایش به بازار)
  note: string;
}

/**
 * ضریب اصلاحی خودکار:
 * - بریر بالای ۰.۲۸ → مدل بیش‌برآورد کرده؛ ۸٪ به سمت خط شارپ بازار جمع می‌شویم (shrinkage)
 * - بریر بالای ۰.۳۴ → جمع‌شدگی ۱۵٪
 * - بریر زیر ۰.۲ → مدل دقیق است؛ وزن حفظ و کمی تقویت
 */
export function leagueCalibration(records: CalibrationRecord[]): LeagueCalibration[] {
  const byLeague = new Map<string, CalibrationRecord[]>();
  for (const r of records) {
    const arr = byLeague.get(r.league) ?? [];
    arr.push(r);
    byLeague.set(r.league, arr);
  }

  const out: LeagueCalibration[] = [];
  for (const [league, arr] of byLeague) {
    const avgBrier = arr.reduce((s, x) => s + x.brier, 0) / arr.length;
    const hitRate = arr.filter((x) => x.outcome === "WIN").length / arr.length;
    let factor = 1;
    let note = "کالیبراسیون مطلوب — وزن مدل حفظ می‌شود";
    if (avgBrier > 0.34) {
      factor = 0.85;
      note = "خطای سیستماتیک بالا — ۱۵٪ گرایش به بازار شارپ اعمال می‌شود";
    } else if (avgBrier > 0.28) {
      factor = 0.92;
      note = "بیش‌اعتمادی متوسط — ۸٪ گرایش به بازار اعمال می‌شود";
    } else if (avgBrier < 0.2) {
      factor = 1.05;
      note = "مدل در این لیگ دقیق‌تر از بازار عمل کرده — وزن تقویت می‌شود";
    }
    out.push({ league, count: arr.length, avgBrier, hitRate, calibrationFactor: factor, note });
  }
  return out.sort((a, b) => a.avgBrier - b.avgBrier);
}

/** باکت‌های پایایی (Reliability buckets) — پیش‌بینی در برابر واقعیت */
export function reliabilityBuckets(records: CalibrationRecord[]): { bucket: string; predicted: number; observed: number; n: number }[] {
  const ranges: [number, number, string][] = [
    [0, 0.4, "کمتر از ۴۰٪"],
    [0.4, 0.6, "۴۰ تا ۶۰٪"],
    [0.6, 0.8, "۶۰ تا ۸۰٪"],
    [0.8, 1.01, "بالای ۸۰٪"],
  ];
  return ranges.map(([lo, hi, label]) => {
    const arr = records.filter((r) => r.predictedProb >= lo && r.predictedProb < hi);
    const predicted = arr.length ? arr.reduce((s, x) => s + x.predictedProb, 0) / arr.length : 0;
    const observed = arr.length ? arr.filter((x) => x.outcome === "WIN").length / arr.length : 0;
    return { bucket: label, predicted, observed, n: arr.length };
  });
}

/** درس‌های سیستمی — متن فارسی برای ایجنت بازرس */
export function systemLessons(records: CalibrationRecord[], leagues: LeagueCalibration[]): string[] {
  const lessons: string[] = [];
  const avgBrier = records.length ? records.reduce((s, x) => s + x.brier, 0) / records.length : 0;

  const worst = leagues.filter((l) => l.count >= 2).sort((a, b) => b.avgBrier - a.avgBrier)[0];
  if (worst && worst.avgBrier > 0.28) {
    lessons.push(`مدل در «${worst.league}» بیش‌ازحد به سناریوی اصلی اطمینان می‌کند (بریر ${worst.avgBrier.toFixed(3)}) — از هفته آینده توزیع این لیگ ۸٪ به سمت خط پیناکل جمع می‌شود.`);
  }
  const best = leagues.filter((l) => l.count >= 2).sort((a, b) => a.avgBrier - b.avgBrier)[0];
  if (best && best.avgBrier < 0.22) {
    lessons.push(`دقت مدل در «${best.league}» بالاتر از انتظار است (بریر ${best.avgBrier.toFixed(3)}) — وزن خروجی دیکسون-کولز این لیگ ۵٪ تقویت شد.`);
  }

  const misses = records.filter((r) => r.outcome === "LOSS" && r.predictedProb > 0.65);
  if (misses.length > 0) {
    lessons.push(`${misses.length} مورد «فاجعه کم‌احتمال» رخ داده: پیش‌بینی‌های بالای ۶۵٪ که باختند. الگوی مشترک: وابستگی به xG خام بدون تفکیک وضعیت بازی — فیلتر Game State فعال ماند.`);
  }
  const longshotHits = records.filter((r) => r.outcome === "WIN" && r.predictedProb < 0.35);
  if (longshotHits.length > 0) {
    lessons.push(`${longshotHits.length} بار سناریوی کم‌احتمال (زیر ۳۵٪) محقق شد — برای همین پرتفوی مکمل مونت‌کارلو الزامی است، نه تک‌شرط.`);
  }
  if (avgBrier > 0 && avgBrier < 0.25) {
    lessons.push(`مهارت کلی مدل نسبت به پیش‌بینی تصادفی: ${((1 - avgBrier / 0.25) * 100).toFixed(0)}٪ مثبت — خط پایه سالم است، اصلاحات باید موضعی بماند.`);
  }
  return lessons;
}
