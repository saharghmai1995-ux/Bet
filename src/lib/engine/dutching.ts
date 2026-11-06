// ─────────────────────────────────────────────────────────────────────────────
// ایجنت مدیریت ریسک: ریاضیات داچینگ (Dutching) و تشخیص تله باخت همزمان
// Risk & Hedging Agent: Dutching math + Middle Trap detection
// ─────────────────────────────────────────────────────────────────────────────

export type DutchStrategy = "EQUAL_PROFIT" | "HEDGE_MAIN" | "AGGRESSIVE";

export interface DutchLeg {
  label: string; // نام تیپ
  odds: number; // ضریب کل تیپ
  prob?: number; // احتمال وقوع سناریوی این تیپ (اختیاری، برای EV)
}

export interface DutchResult {
  impliedSum: number; // S = Σ 1/Oi
  arbitrageFree: boolean; // S < 1 → پوشش تضمینی سودآور
  guaranteedMargin: number; // 1 − S (سود تضمینی در صورت برد یکی از تیپ‌ها)
  stakes: number[]; // مبلغ هر تیپ
  returns: number[]; // بازگشت وجه در صورت برد هر تیپ
  profits: number[]; // سود خالص در صورت برد هر تیپ
  bothLoseProb: number | null; // احتمال باخت همزمان (در صورت داشتن احتمالات)
  expectedValue: number | null; // EV کل ترکیب
}

/**
 * تخصیص سرمایه بین تیپ‌های مکمل بر اساس استراتژی
 *
 * EQUAL_PROFIT: stake_i ∝ (1/o_i) / S → سود برابر در همه سناریوها
 *   مثال ضرایب ۲ و ۳ با سرمایه ۱۰۰: ۶۰ و ۴۰ → سود +۲۰ در هر دو حالت
 *
 * HEDGE_MAIN: اگر تیپ اصلی (اولین) برد → سود کامل؛ اگر تیپ دوم برد → برگشت کل سرمایه
 *   stake_cover = T / o_cover ، stake_main = T − stake_cover
 *   مثال: ۶۶.۷ و ۳۳.۳ → +۳۳.۴ یا ۰
 *
 * AGGRESSIVE: اگر تیپ اصلی برد → برگشت کل سرمایه؛ اگر تیپ دوم برد → سود حداکثری
 *   stake_main = T / o_main ، stake_cover = T − stake_main
 *   مثال: ۵۰ و ۵۰ → ۰ یا +۵۰
 */
export function dutchAllocate(
  legs: DutchLeg[],
  totalStake: number,
  strategy: DutchStrategy
): DutchResult {
  const n = legs.length;
  const impliedSum = legs.reduce((s, l) => s + 1 / l.odds, 0);
  const arbitrageFree = impliedSum < 1;
  const guaranteedMargin = 1 - impliedSum;

  let stakes: number[];

  if (strategy === "EQUAL_PROFIT" || n !== 2) {
    // سود برابر: سازگار با هر تعداد تیپ
    stakes = legs.map((l) => (totalStake * (1 / l.odds)) / impliedSum);
  } else if (strategy === "HEDGE_MAIN") {
    // تیپ اصلی پرریسک‌تر (ضریب بالاتر معمولاً) → تیپ دوم بیمه می‌شود
    const stakeCover = totalStake / legs[1].odds;
    const stakeMain = totalStake - stakeCover;
    stakes = [stakeMain, stakeCover];
  } else {
    // AGGRESSIVE: تیپ اصلی بیمه می‌شود (بردش فقط برگشت سرمایه)
    const stakeMain = totalStake / legs[0].odds;
    const stakeCover = totalStake - stakeMain;
    stakes = [stakeMain, stakeCover];
  }

  const returns = stakes.map((s, i) => s * legs[i].odds);
  const profits = returns.map((r) => r - totalStake);

  let bothLoseProb: number | null = null;
  let expectedValue: number | null = null;

  const hasProbs = legs.every((l) => typeof l.prob === "number" && l.prob >= 0);
  if (hasProbs) {
    // با فرض استقلال سناریوها: احتمال باخت همزمان = Π(1 − p_i)
    const pAllLose = legs.reduce((acc, l) => acc * (1 - l.prob), 1);
    bothLoseProb = pAllLose;
    // EV = Σ p_i × profit_i − p_loseAll × stakeTotal
    expectedValue = legs.reduce((acc, l, i) => acc + l.prob * profits[i], 0) - pAllLose * totalStake;
  }

  return {
    impliedSum,
    arbitrageFree,
    guaranteedMargin,
    stakes,
    returns,
    profits,
    bothLoseProb,
    expectedValue,
  };
}

// ─────────────────────────────────────────────
// تشخیص «تله باخت همزمان» (The Middle Trap)
// مدل‌سازی کامل فضای نتیجه: (نتیجه × گل × BTTS) و بررسی منطقی دو تیپ
// ─────────────────────────────────────────────

export type SelectionKind =
  | "HOME_WIN"
  | "DRAW"
  | "AWAY_WIN"
  | "HOME_OR_DRAW" // 1X
  | "AWAY_OR_DRAW" // X2
  | "HOME_OR_AWAY" // 12
  | "OVER_2_5"
  | "UNDER_2_5"
  | "BTTS_YES"
  | "BTTS_NO";

export interface TrapLeg {
  match: string;
  selection: SelectionKind;
}

export type TrapVerdict = "NONE" | "WARNING" | "CRITICAL";

export interface TrapCheck {
  verdict: TrapVerdict;
  title: string;
  message: string;
  canBothLose: boolean;
  canBothWin: boolean;
}

interface Outcome {
  result: "H" | "D" | "A";
  goals: "O" | "U";
  btts: "Y" | "N";
}

function legWins(sel: SelectionKind, o: Outcome): boolean {
  switch (sel) {
    case "HOME_WIN":
      return o.result === "H";
    case "DRAW":
      return o.result === "D";
    case "AWAY_WIN":
      return o.result === "A";
    case "HOME_OR_DRAW":
      return o.result === "H" || o.result === "D";
    case "AWAY_OR_DRAW":
      return o.result === "A" || o.result === "D";
    case "HOME_OR_AWAY":
      return o.result !== "D";
    case "OVER_2_5":
      return o.goals === "O";
    case "UNDER_2_5":
      return o.goals === "U";
    case "BTTS_YES":
      return o.btts === "Y";
    case "BTTS_NO":
      return o.btts === "N";
  }
}

/** آیا تیپ (مجموع پاهای یک بازی) در نتیجه o می‌برد؟ */
function tipWinsOnMatch(tip: TrapLeg[], match: string, o: Outcome): boolean {
  const legs = tip.filter((l) => l.match === match);
  if (legs.length === 0) return true; // این بازی در تیپ نیست
  return legs.every((l) => legWins(l.selection, o));
}

function outcomeFa(o: Outcome): string {
  const r = o.result === "H" ? "برد میزبان" : o.result === "D" ? "مساوی" : "برد میهمان";
  const g = o.goals === "O" ? "بالای ۲.۵" : "زیر ۲.۵";
  const b = o.btts === "Y" ? "هر دو گل زدند" : "گل نزدند";
  return `${r} + ${g} + ${b}`;
}

/**
 * بررسی دو تیپ از نظر همپوشانی:
 * - اگر فضای «باخت هر دو» خالی باشد → پوشش کامل (NONE)
 * - اگر باخت همزمان فقط با شکست «پایه مشترک» (پاهای یکسان در هر دو تیپ) رخ دهد → قابل قبول (NONE با هشدار پایه)
 * - اگر فضای باخت همزمان خارج از شکست پایه وجود داشته باشد → تله (CRITICAL)
 */
export function checkMiddleTrap(tipA: TrapLeg[], tipB: TrapLeg[]): TrapCheck {
  const matchesA = new Set(tipA.map((l) => l.match));
  const shared = [...new Set(tipB.filter((l) => matchesA.has(l.match)).map(l => l.match))];

  if (shared.length === 0) {
    return {
      verdict: "WARNING",
      title: "بازی مشترک وجود ندارد",
      message:
        "دو تیپ روی بازی‌های کاملاً جدا هستند؛ ریسک باخت همزمان = حاصل‌ضرب ریسک مستقل هر تیپ. برای پوشش تضمینی از پایه مشترک (Banker) + متغیر دوگانه استفاده کنید.",
      canBothLose: true,
      canBothWin: true,
    };
  }

  // فضای کامل نتیجه هر بازی
  const outcomes: Outcome[] = [];
  for (const r of ["H", "D", "A"] as const)
    for (const g of ["O", "U"] as const)
      for (const b of ["Y", "N"] as const) outcomes.push({ result: r, goals: g, btts: b });

  let hasCritical = false;
  let hasBaseRiskOnly = false;
  let hasPerfect = false;
  const criticalDetails: string[] = [];

  for (const match of shared) {
    const bothLose = outcomes.filter((o) => !tipWinsOnMatch(tipA, match, o) && !tipWinsOnMatch(tipB, match, o));
    const bothWin = outcomes.filter((o) => tipWinsOnMatch(tipA, match, o) && tipWinsOnMatch(tipB, match, o));

    // پایه مشترک: انتخاب‌های یکسان در هر دو تیپ روی این بازی
    const selA = tipA.filter((l) => l.match === match).map((l) => l.selection);
    const commonSels = tipB.filter((l) => l.match === match && selA.includes(l.selection)).map((l) => l.selection);

    // نتایجی که پایه مشترک را می‌شکند (پایه ببازد → هر دو تیپ می‌بازند)
    const baseFail = outcomes.filter((o) => commonSels.some((s) => !legWins(s, o)));

    // باخت‌های همزمان «غیرقابل توضیح با شکست پایه» = تله واقعی
    const unexplained = bothLose.filter((o) => !baseFail.includes(o));

    if (bothLose.length === 0) {
      hasPerfect = true;
    } else if (unexplained.length === 0) {
      hasBaseRiskOnly = true;
    } else {
      hasCritical = true;
      const sample = unexplained.slice(0, 2).map(outcomeFa).join(" یا ");
      criticalDetails.push(`در بازی «${match}» نتایجی مثل ${sample} هر دو تیپ را می‌سوزانند بدون آنکه پایه مشترک مسئول باشد.`);
    }
  }

  if (hasCritical) {
    return {
      verdict: "CRITICAL",
      title: "تله باخت همزمان شناسایی شد!",
      message: criticalDetails.join(" ") + " برای رفع: پایه مشترک امن (مثل 1X) بگذارید و فقط بازار دوگانه (بالای/زیر یک خط) را بین دو تیپ تغییر دهید.",
      canBothLose: true,
      canBothWin: true,
    };
  }

  if (hasPerfect || hasBaseRiskOnly) {
    const baseMsg = hasBaseRiskOnly
      ? "تنها ریسک، شکست «پایه مشترک» است (پایه ببازد → هر دو می‌بازند)؛ تا وقتی پایه ببرد، در هر نتیجه دقیقاً یکی از دو تیپ برنده است."
      : "با هر نتیجه‌ای حداقل یکی از دو تیپ برنده است.";
    return {
      verdict: "NONE",
      title: "تیپ‌های مکمل واقعی (Mutually Covering) ✓",
      message: baseMsg,
      canBothLose: hasBaseRiskOnly,
      canBothWin: true,
    };
  }

  return {
    verdict: "WARNING",
    title: "پوشش نسبی",
    message: "پوشش دو تیپ کامل نیست؛ فضایی از نتایج وجود دارد که هر دو تیپ را می‌سوزاند.",
    canBothLose: true,
    canBothWin: true,
  };
}

export function faSelection(s: SelectionKind): string {
  const map: Record<SelectionKind, string> = {
    HOME_WIN: "برد میزبان",
    DRAW: "مساوی",
    AWAY_WIN: "برد میهمان",
    HOME_OR_DRAW: "برد میزبان یا مساوی (1X)",
    AWAY_OR_DRAW: "برد میهمان یا مساوی (X2)",
    HOME_OR_AWAY: "بدون مساوی (12)",
    OVER_2_5: "بالای ۲.۵ گل",
    UNDER_2_5: "زیر ۲.۵ گل",
    BTTS_YES: "هر دو تیم گل می‌زنند",
    BTTS_NO: "نمی‌زنند",
  };
  return map[s];
}
