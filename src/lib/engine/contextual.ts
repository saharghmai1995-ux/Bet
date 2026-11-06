// ─────────────────────────────────────────────
// پروفایلر خرد زمینه‌ای (Contextual Micro-Profiler)
// ۱) وضعیت بازی (Game State): تفکیک npxG خام به مساوی/جلو/عقب
// ۲) پروفایل داور: کارت، پنالتی، حساسیت
// ۳) خستگی سفر و فشردگی تقویم (کمتر از ۷۲ ساعت استراحت)
// ─────────────────────────────────────────────

export interface GameStateNpxg {
  level: number; // npxG وقتی بازی مساوی است
  leading: number; // npxG وقتی جلو است (کیفیت پایین‌تر — وقت تلف‌کنی)
  trailing: number; // npxG وقتی عقب است
}

/**
 * npxG مؤثر: میانگین وزنی بر اساس سهم زمانی مورد انتظار هر وضعیت.
 * تیمی که فقط در وضعیت عقب‌بودن xG می‌سازد (حریف دفاع ۱۰نفره) تخفیف می‌خورد.
 * وزن‌های پیش‌فرض: مساوی ۵۵٪، جلو ۲۰٪، عقب ۲۵٪
 */
export function effectiveNpxg(gs: GameStateNpxg | null, fallback: number): { value: number; note: string | null } {
  if (!gs || gs.level <= 0) return { value: fallback, note: null };
  const weighted = 0.55 * gs.level + 0.2 * gs.leading + 0.25 * gs.trailing;
  const raw = 0.55 * fallback + 0.2 * fallback + 0.25 * fallback; // = fallback
  const ratio = weighted / Math.max(raw, 0.01);
  let note: string | null = null;
  if (ratio < 0.85) {
    note = `npxG خام این تیم بیش از حد به وضعیت «عقب‌بودن» وابسته است (نسبت کیفیت ${(ratio * 100).toFixed(0)}٪) — امید گل تعدیل شد`;
  } else if (ratio > 1.12) {
    note = `این تیم حتی در وضعیت تساوی هم خطرناک است (نسبت کیفیت ${(ratio * 100).toFixed(0)}٪) — npxG مؤثر بالاتر از خام`;
  }
  return { value: weighted, note };
}

export interface RefereeProfile {
  name: string;
  yellowPerMatch: number;
  penPerMatch: number;
  foulsPerMatch: number;
  strictness: string; // LENIENT | AVERAGE | STRICT
  note?: string | null;
}

export interface RefereeAdjustment {
  lambdaCards: number; // امید کارت زرد بازی
  penProb: number; // احتمال پنالتی در بازی
  note: string;
}

/**
 * کارت مورد انتظار: ترکیب سبک خطای دو تیم با سخت‌گیری داور.
 * تیم‌های با پرس پایین (PPDA بالا) خطای بیشتری می‌کنند.
 */
export function refereeAdjustment(
  referee: RefereeProfile | null,
  homeFoulPropensity: number, // ۰.۸ تا ۱.۳ — ضریب خطای میزبان
  awayFoulPropensity: number
): RefereeAdjustment {
  if (!referee) {
    return {
      lambdaCards: 4.0,
      penProb: 0.24,
      note: "داور ثبت نشده — میانگین لیگ لحاظ شد",
    };
  }
  const foulLoad = (homeFoulPropensity + awayFoulPropensity) / 2;
  const lambdaCards = Math.max(1.5, referee.yellowPerMatch * foulLoad);
  const penProb = Math.min(0.5, referee.penPerMatch * 1.0);
  const strictLabel = referee.strictness === "STRICT" ? "سخت‌گیر" : referee.strictness === "LENIENT" ? "ساده‌گیر" : "متوسط";
  return {
    lambdaCards,
    penProb,
    note: `داور ${referee.name} (${strictLabel}) — میانگین ${referee.yellowPerMatch.toFixed(1)} کارت و ${referee.penPerMatch.toFixed(2)} پنالتی در بازی؛ کارت مورد انتظار این بازی: ${lambdaCards.toFixed(1)}`,
  };
}

export interface FatigueInput {
  awayTravelKm: number | null;
  awayRestDays: number | null;
  homeRestDays: number | null;
}

export interface FatigueAdjustment {
  awayLambdaMultiplier: number;
  homeLambdaMultiplier: number;
  note: string | null;
}

/** خستگی سفر و فشردگی تقویم — ضریب اصلاحی امید گل */
export function fatigueAdjustment(input: FatigueInput): FatigueAdjustment {
  let awayMult = 1;
  let homeMult = 1;
  const reasons: string[] = [];

  if (input.awayTravelKm !== null && input.awayTravelKm > 1500) {
    awayMult *= 0.955;
    reasons.push(`سفر پروازی ${input.awayTravelKm} کیلومتری میهمان (−۴.۵٪ حمله)`);
  }
  if (input.awayRestDays !== null && input.awayRestDays < 4) {
    awayMult *= 0.95;
    homeMult *= 1.02;
    reasons.push(`تنها ${input.awayRestDays} روز استراحت میهمان در برابر ${input.homeRestDays ?? "؟"} روز میزبان`);
  }
  if (input.homeRestDays !== null && input.homeRestDays < 4) {
    homeMult *= 0.97;
    reasons.push(`تقویم فشرده میزبان (${input.homeRestDays} روز استراحت)`);
  }

  return {
    awayLambdaMultiplier: awayMult,
    homeLambdaMultiplier: homeMult,
    note: reasons.length ? reasons.join("؛ ") : null,
  };
}
