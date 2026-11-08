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

// ═══════════════════════════════════════════════════════════════
// v9.0 — بردار قانون فعال کالیبراسیون (Active Calibration Rule Vector)
// درس‌های سیستمی دیگر فقط متن نیستند؛ ضریب عددی دارند و مستقیماً
// λ موتور و UtilityScore ایجنت سوپروایزر را تغییر می‌دهند.
// ═══════════════════════════════════════════════════════════════

/** ورودی مبنای قانون: یک کارت تسویه‌شده با λ پیش‌بینی و نتیجه واقعی */
export interface RuleSettledSlip {
  league: string;
  archetypeCode: string | null; // A1..A5
  lambdaHome: number | null;
  lambdaAway: number | null;
  homeGoals: number;
  awayGoals: number;
  netProfit: number | null;
}

/** یک قانون فعال لیگ — مستقیماً در فرمول سوپروایزر و λ موتور اعمال می‌شود */
export interface ActiveLeagueRule {
  league: string;
  /** تعداد بازی‌های تسویه‌شده مبنای قانون (حداقل ۳ برای فعال‌شدن) */
  sample: number;
  /** ٪ انحراف میانگین گل واقعی از λ پیش‌بینی (منفی = بازار کم‌گل‌تر از مدل) */
  goalBiasPct: number | null;
  /** ضریب اعمالی روی λ موتور (مثلاً ۰.۹۴ = −۶٪) */
  lambdaMultiplier: number;
  /** امتیاز اضافه/کم به UtilityScore هر الگو (A1..A5) */
  archetypeBoosts: Record<string, number>;
  /** متن قوانین فعال فارسی — روی فلش‌کارت و تب کالیبراسیون نمایش داده می‌شود */
  rules: string[];
  /** همیشه true — نشانگر «⚡ اعمال‌شده در فرمول سوپروایزر» */
  applied: boolean;
  /** نرخ موفقیت هر الگو در این لیگ (برای شفافیت) */
  archetypeHitRate: Record<string, { wins: number; total: number; profit: number }>;
}

/** تبدیل عدد فارسی/عربی به لاتین */
function faDigit(s: string): string {
  return s.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
}

/** استخراج کد الگو از متن کوتاه فارسی (مثل «الگوی ۲ — ...») */
export function archetypeCodeOf(archetype: string | null | undefined): string | null {
  if (!archetype) return null;
  const m = faDigit(archetype).match(/الگوی\s*([1-5])/);
  return m ? `A${m[1]}` : null;
}

/**
 * deriveActiveLeagueRule — منطق عددی تبدیل «درس سیستمی» به قانون فعال:
 *   · انحراف گلزنی ≤ −۸٪  →  λ × ۰.۹۴ (کاهش ۶٪) + پاداش ۱۵ امتیازی به الگوی
 *     قفل تدافعی/کلین‌شیت (A1) — مثال سند: سری آ / لالیگا
 *   · انحراف گلزنی ≥ +۸٪  →  λ × ۱.۰۴ + پاداش ۱۸ امتیازی به الگوی فتح فاوریت/
 *     محاصره کرنر (A2) + ۸ امتیاز به الگوی بازی باز (A1) — مثال سند: بوندسلیگا / لیگ برتر
 *   · نرخ موفقیت الگوها: سود خالص مثبت هر الگو → پاداش تا +۱۲ | زیان سنگین → جریمه −۸
 */
export function deriveActiveLeagueRule(league: string, slips: RuleSettledSlip[]): ActiveLeagueRule | null {
  const usable = slips.filter((s) => Number.isFinite(s.homeGoals) && Number.isFinite(s.awayGoals));
  if (usable.length < 3) return null;

  // ─── ۱) انحراف گلزنی لیگ (Goal Bias) ───
  let biasSum = 0;
  let biasN = 0;
  for (const s of usable) {
    if (s.lambdaHome && s.lambdaAway && s.lambdaHome > 0.3 && s.lambdaAway > 0.3) {
      const actual = s.homeGoals + s.awayGoals;
      const predicted = s.lambdaHome + s.lambdaAway;
      biasSum += (actual - predicted) / Math.max(predicted, 0.5);
      biasN += 1;
    }
  }
  const goalBiasPct = biasN >= 3 ? Math.round((biasSum / biasN) * 1000) / 10 : null;

  let lambdaMultiplier = 1;
  const boosts: Record<string, number> = {};
  const rules: string[] = [];

  if (goalBiasPct !== null && goalBiasPct <= -8) {
    lambdaMultiplier = 0.94;
    boosts.A1 = (boosts.A1 ?? 0) + 15;
    rules.push(
      `میانگین گل واقعی ${Math.abs(goalBiasPct).toFixed(1)}٪ کمتر از λ مدل بود — کاهش ۶٪ امید گل پایه + افزایش +۱۵ امتیاز به الگوی قفل تدافعی/کلین‌شیت در سوپروایزر`
    );
  } else if (goalBiasPct !== null && goalBiasPct >= 8) {
    lambdaMultiplier = 1.04;
    boosts.A2 = (boosts.A2 ?? 0) + 18;
    boosts.A1 = (boosts.A1 ?? 0) + 8;
    rules.push(
      `میانگین گل واقعی ${goalBiasPct.toFixed(1)}٪ بیشتر از λ مدل بود — بازی‌های فاوریت این لیگ فشار کرنر بالایی دارند: +۱۸ امتیاز به الگوی فتح فاوریت/محاصره کرنر و +۸ امتیاز به الگوی بازی باز`
    );
  } else if (goalBiasPct !== null) {
    rules.push(`انحراف گلزنی لیگ ${goalBiasPct.toFixed(1)}٪ در باند قابل‌قبول ±۸٪ — λ بدون تعدیل گلزنی`);
  }

  // ─── ۲) نرخ موفقیت الگوها (Archetype Hit Rate) ───
  const byCode = new Map<string, { wins: number; total: number; profit: number }>();
  for (const s of usable) {
    const code = s.archetypeCode;
    if (!code) continue;
    const cur = byCode.get(code) ?? { wins: 0, total: 0, profit: 0 };
    cur.total += 1;
    const profit = s.netProfit ?? 0;
    cur.profit = Math.round((cur.profit + profit) * 10) / 10;
    if (profit > 0) cur.wins += 1;
    byCode.set(code, cur);
  }
  const archetypeHitRate: ActiveLeagueRule["archetypeHitRate"] = {};
  for (const [code, st] of byCode) {
    archetypeHitRate[code] = st;
    if (st.total >= 2) {
      const hitPct = Math.round((st.wins / st.total) * 100);
      if (st.profit > 0) {
        const boost = Math.min(12, Math.round(st.profit / 2));
        if (boost > 0) {
          boosts[code] = (boosts[code] ?? 0) + boost;
          rules.push(`الگوی ${code} در این لیگ ${hitPct}٪ موفقیت و سود +${st.profit.toFixed(1)} ثبت کرده — پاداش +${boost} امتیاز در سوپروایزر`);
        }
      } else if (st.profit < -10) {
        boosts[code] = (boosts[code] ?? 0) - 8;
        rules.push(`الگوی ${code} در این لیگ زیان خالص ${st.profit.toFixed(1)} ثبت کرده — جریمه −۸ امتیاز در سوپروایزر`);
      }
    }
  }

  return {
    league,
    sample: usable.length,
    goalBiasPct,
    lambdaMultiplier,
    archetypeBoosts: boosts,
    rules,
    applied: true,
    archetypeHitRate,
  };
}
