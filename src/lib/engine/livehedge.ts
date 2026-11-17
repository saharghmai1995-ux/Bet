// ─────────────────────────────────────────────
// ایجنت پوشش زنده (Dynamic In-Play Hedge Trigger)
// مدل شرطی در حین بازی: λ باقیمانده بر اساس دقیقه، نتیجه فعلی و رویدادها
// + ریاضیات پوشش: قفل سود قطعی با شرط مقابل در ضریب جهش‌یافته
// ─────────────────────────────────────────────

export type LiveEvent = "GOAL_HOME" | "GOAL_AWAY" | "RED_HOME" | "RED_AWAY" | "NONE";
export type PreSelection = "HOME" | "AWAY" | "O25";

export interface InPlayInput {
  lambdaHome: number; // امید گل پیش‌بازی (۹۰ دقیقه)
  lambdaAway: number;
  minute: number; // دقیقه رویداد
  event: LiveEvent;
  preSelection: PreSelection;
  preOdds: number;
  preStake: number;
  // ─── v6.1 — نتیجه واقعی لحظه‌ای از فید ESPN (بعد از رویداد) ───
  // وقتی ارائه شود، وضعیت بازی واقعی است (نه سناریوی فرضی ۰-۰)
  scoreHome?: number;
  scoreAway?: number;
}

export interface InPlayResult {
  homeGoals: number;
  awayGoals: number;
  scoreLabel: string;
  scenarioLabel: string;
  remainingLambdas: { home: number; away: number };
  probs: { home: number; draw: number; away: number; over25: number };
  fairOdds: { home: number; draw: number; away: number };
  marketOdds: { home: number; draw: number; away: number }; // با حاشیه ۵٪ در حین بازی
  preWinProb: number; // احتمال فعلی برد تیپ پیش‌بازی
  hedge: {
    targetOdds: number;
    targetLabel: string;
    stake: number;
    profitIfPre: number;
    profitIfHedge: number;
  } | null;
  holdEV: number;
  recommendation: "HEDGE" | "HOLD";
  message: string;
}

const EVENT_LABELS: Record<LiveEvent, string> = {
  GOAL_HOME: "گل میزبان",
  GOAL_AWAY: "گل میهمان",
  RED_HOME: "کارت قرمز میزبان",
  RED_AWAY: "کارت قرمز میهمان",
  NONE: "بدون رویداد",
};

/**
 * λ باقیمانده: تابع توانی استاندارد شدت گلزنی در دقایق پایانی (نمای توانی ۰.۸۵)
 *   lambdaRem = lambdaPre × ((90 − minute) / 90) ^ 0.85
 * (کاهش خطی λ واقعیت دقایق پایانی را دست‌کم می‌گیرد؛ بازی‌های پایانی بازترند)
 * تعدیل وضعیت بازی (Game State در حین بازی):
 * - تیم جلوبوده حمله را آرام می‌کند (×۰.۸۵)، تیم عقب‌بوده باز می‌کند (×۱.۱۸)
 * - کارت قرمز: حمله تیم ۱۰نفره ×۰.۶۸، حریف ×۱.۲۸ (ضرایب تجربی اخراج)
 */
export function inPlayAnalysis(input: InPlayInput): InPlayResult {
  const { minute, event } = input;
  // تابع توانی استاندارد — به‌جای کاهش خطی (90 − minute) / 90
  const fracRaw = Math.max(0.03, Math.min(0.95, (90 - minute) / 90));
  const frac = Math.pow(fracRaw, 0.85);

  // نتیجه فعلی — v6.1: امتیاز واقعی ESPN در اولویت؛ سناریوی فرضی فقط برای تست دستی موتور
  let homeGoals: number;
  let awayGoals: number;
  if (input.scoreHome !== undefined && input.scoreAway !== undefined && Number.isFinite(input.scoreHome) && Number.isFinite(input.scoreAway)) {
    homeGoals = Math.max(0, Math.floor(input.scoreHome));
    awayGoals = Math.max(0, Math.floor(input.scoreAway));
  } else {
    homeGoals = 0;
    awayGoals = 0;
    if (event === "GOAL_HOME") homeGoals = 1;
    if (event === "GOAL_AWAY") awayGoals = 1;
  }

  let lamH = input.lambdaHome * frac;
  let lamA = input.lambdaAway * frac;

  if (homeGoals > awayGoals) {
    lamH *= 0.85;
    lamA *= 1.18;
  } else if (awayGoals > homeGoals) {
    lamA *= 0.85;
    lamH *= 1.18;
  }
  if (event === "RED_HOME") {
    lamH *= 0.68; // تیم ۱۰نفره: افت شدید حمله
    lamA *= 1.28; // حریف: باز شدن فضا
  }
  if (event === "RED_AWAY") {
    lamA *= 0.68;
    lamH *= 1.28;
  }

  lamH = Math.max(0.02, Math.min(4, lamH));
  lamA = Math.max(0.02, Math.min(4, lamA));

  // ماتریس نمره باقیمانده با تصحیح دیکسون-کولز برای λ دلخواه
  const MAX = 9;
  const matrix: number[][] = [];
  let total = 0;
  for (let h = 0; h <= MAX; h++) {
    matrix[h] = [];
    for (let a = 0; a <= MAX; a++) {
      const ph = poisson(h, lamH);
      const pa = poisson(a, lamA);
      // tau دیکسون-کولز با ρ = −۰.۰۵
      const tau =
        h === 0 && a === 0 ? 1 - lamH * lamA * -0.05
        : h === 0 && a === 1 ? 1 + lamH * -0.05
        : h === 1 && a === 0 ? 1 + lamA * -0.05
        : h === 1 && a === 1 ? 1 - -0.05
        : 1;
      const p = Math.max(0, ph * pa * tau);
      matrix[h][a] = p;
      total += p;
    }
  }

  let pH = 0, pD = 0, pA2 = 0, pOver = 0;
  for (let h = 0; h <= MAX; h++) {
    for (let a = 0; a <= MAX; a++) {
      const p = matrix[h][a] / total;
      const remainingH = h; // گل‌های باقیمانده
      const remainingA = a;
      const finalH = homeGoals + remainingH;
      const finalA = awayGoals + remainingA;
      if (finalH > finalA) pH += p;
      else if (finalH === finalA) pD += p;
      else pA2 += p;
      if (finalH + finalA > 2.5) pOver += p;
    }
  }

  const fair = { home: 1 / Math.max(pH, 0.001), draw: 1 / Math.max(pD, 0.001), away: 1 / Math.max(pA2, 0.001) };
  const market = {
    home: fair.home / 1.05,
    draw: fair.draw / 1.05,
    away: fair.away / 1.05,
  };

  // تیپ پیش‌بازی
  const preWinProb = input.preSelection === "HOME" ? pH : input.preSelection === "AWAY" ? pA2 : pOver;
  const preLabel = input.preSelection === "HOME" ? "برد میزبان" : input.preSelection === "AWAY" ? "برد میهمان" : "بالای ۲.۵ گل";

  // هدف پوشش: انتخاب مقابل (برای HOME → X2 بازار = 1 − pH)؛ ساده: ضدِ همان انتخاب
  let hedgeOdds = 0;
  let hedgeLabel = "";
  let hedgeWinProb = 0;
  if (input.preSelection === "HOME") {
    hedgeWinProb = 1 - pH;
    hedgeOdds = 1 / Math.max(hedgeWinProb, 0.001) / 1.05;
    hedgeLabel = "عدم برد میزبان (X2)";
  } else if (input.preSelection === "AWAY") {
    hedgeWinProb = 1 - pA2;
    hedgeOdds = 1 / Math.max(hedgeWinProb, 0.001) / 1.05;
    hedgeLabel = "عدم برد میهمان (1X)";
  } else {
    hedgeWinProb = 1 - pOver;
    hedgeOdds = 1 / Math.max(hedgeWinProb, 0.001) / 1.05;
    hedgeLabel = "زیر ۲.۵ گل";
  }

  // پوشش سود برابر: stake_hedge = preStake × preOdds / hedgeOdds
  const hedgeStake = (input.preStake * input.preOdds) / hedgeOdds;
  const profitIfPre = input.preStake * input.preOdds - input.preStake - hedgeStake;
  const profitIfHedge = hedgeStake * hedgeOdds - hedgeStake - input.preStake;
  const canLockProfit = profitIfPre > 0 && profitIfHedge > 0;

  // EV نگه‌داری (بدون پوشش)
  const holdEV = preWinProb * (input.preOdds - 1) * input.preStake - (1 - preWinProb) * input.preStake;

  // محرک: اگر EV نگه‌داری منفی یا نزدیک صفر شد ولی پوشش سود قطعی می‌دهد
  const recommend: "HEDGE" | "HOLD" = holdEV < 0.08 * input.preStake && canLockProfit ? "HEDGE" : "HOLD";

  let message: string;
  if (recommend === "HEDGE") {
    message = `در دقیقه ${minute} با «${EVENT_LABELS[event]}»، احتمال ${preLabel} شما به ${(preWinProb * 100).toFixed(0)}٪ افت/رسید و ضریب مقابل به ${hedgeOdds.toFixed(2)} جهش کرد. با شرط ${hedgeStake.toFixed(0)} واحدی روی «${hedgeLabel}» در هر دو سناریو ${Math.max(profitIfPre, profitIfHedge).toFixed(1)} واحد سود قطعی قفل می‌شود — بالاتر از EV نگه‌داری (${holdEV.toFixed(1)}).`;
  } else if (canLockProfit) {
    message = `پوشش ممکن است (${Math.max(profitIfPre, profitIfHedge).toFixed(1)} واحد) اما EV نگه‌داری هنوز مثبت و بالاتر است (${holdEV.toFixed(1)} واحد) — صبر کن؛ ایجنت رصدگر ادامه می‌دهد.`;
  } else {
    message = `در این حالت پوشش سود قطعی نمی‌دهد (margin منفی)؛ بهترین کار ادامه مسیر فعلی یا کش‌اوت در آستانه است.`;
  }

  return {
    homeGoals,
    awayGoals,
    scoreLabel: `${homeGoals} - ${awayGoals}`,
    scenarioLabel: `${EVENT_LABELS[event]} در دقیقه ${minute}`,
    remainingLambdas: { home: lamH, away: lamA },
    probs: { home: pH, draw: pD, away: pA2, over25: pOver },
    fairOdds: fair,
    marketOdds: market,
    preWinProb,
    hedge: {
      targetOdds: Math.round(hedgeOdds * 100) / 100,
      targetLabel: hedgeLabel,
      stake: Math.round(hedgeStake * 10) / 10,
      profitIfPre: Math.round(profitIfPre * 10) / 10,
      profitIfHedge: Math.round(profitIfHedge * 10) / 10,
    },
    holdEV: Math.round(holdEV * 10) / 10,
    recommendation: recommend,
    message,
  };
}

function poisson(k: number, lambda: number): number {
  let fact = 1;
  for (let i = 2; i <= k; i++) fact *= i;
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / fact;
}

// ═════════════════════════════════════════════════════════════════════════════
// v19.0-restore — سپر استاپ‌لاس زنده دقیقه ۶۵ (Minute-65 Live Stop-Loss Shield)
//
// سند بازگشت v19.0: «سپر استاپ‌لاس زنده دقیقه ۶۵ (−۴۵.۰u در تله میانی) دقیقاً مثل
// نسخه ۱۹.۰ فعال بماند». منطق سپر:
//   · تله میانی (Middle Trap) = وضعیتی که هیچ‌یک از دو تیپ در حال بردن نیستند و
//     اگر همین وضعیت تا پایان بماند هر دو تیپ می‌بازند (−۱۰۰u کامل).
//   · از دقیقه ۶۵ به بعد، اگر مسابقه در تله میانی باشد، سپر فعال می‌شود:
//     خروج زنده (کش‌اوت/شرط متقابل) با کف بازگشت ۵۵u → زیان سقف‌دار −۴۵.۰u
//     به‌جای ریسک −۱۰۰u کامل.
//   · اگر احتمال فرار از تله (وقوع حداقل یک سناریوی برد تا پایان) بالای ۳۵٪ باشد
//     سپر به‌جای خروج فوری «نگه‌داری مسلح» اعلام می‌کند؛ از دقیقه ۷۵ خروج اجباری است.
// ═════════════════════════════════════════════════════════════════════════════

/** ثابت سند v19.0 — استیک تیپ A (بال اصلی) */
export const SHIELD_STAKE_A_UNITS = 65;
/** ثابت سند v19.0 — استیک تیپ B (بال پوششی) */
export const SHIELD_STAKE_B_UNITS = 35;
/** آستانه فعال‌سازی سپر (دقیقه) */
export const SHIELD_TRIGGER_MINUTE = 65;
/** خروج اجباری بی‌قید (دقیقه) */
export const SHIELD_HARD_EXIT_MINUTE = 75;
/** سقف زیان سپر — بازگشت تضمینی ۵۵u از ۱۰۰u استیک کل */
export const SHIELD_LOSS_CAP_UNITS = 45.0;
/** آستانه احتمال فرار از تله برای نگه‌داری مسلح (به‌جای خروج فوری) */
export const SHIELD_ESCAPE_PROB_HOLD = 0.35;

/** بازارهای تیپ (از الگوهای طلایی G1/G2/G3) — پیش‌بازِ تسویه روی نتیجه نهایی */
export type TipMarketKind =
  | { kind: "OVER_TEAM"; team: "HOME" | "AWAY"; line: number } // مجموع گل تیم X بالای N
  | { kind: "TOTAL_OVER"; line: number } // کل گل مسابقه بالای N
  | { kind: "TOTAL_UNDER"; line: number } // کل گل مسابقه زیر N
  | { kind: "RESULT"; side: "HOME" | "AWAY" } // برد مستقیم
  | { kind: "BTTS"; yes: boolean } // گلزنی هر دو تیم
  | { kind: "WIN_NIL"; team: "HOME" | "AWAY" }; // برد بدون گل خورده

/** آیا این تیپ روی نتیجه نهایی (finalH, finalA) برنده می‌شود؟ */
export function tipSettles(tip: TipMarketKind, finalH: number, finalA: number): boolean {
  const total = finalH + finalA;
  switch (tip.kind) {
    case "OVER_TEAM":
      return (tip.team === "HOME" ? finalH : finalA) > tip.line;
    case "TOTAL_OVER":
      return total > tip.line;
    case "TOTAL_UNDER":
      return total < tip.line;
    case "RESULT":
      return tip.side === "HOME" ? finalH > finalA : finalA > finalH;
    case "BTTS":
      return tip.yes ? finalH > 0 && finalA > 0 : finalH === 0 || finalA === 0;
    case "WIN_NIL":
      return tip.team === "HOME" ? finalH > finalA && finalA === 0 : finalA > finalH && finalH === 0;
  }
}

export type ShieldState = "INACTIVE" | "TRAP_ARMED" | "SHIELD_HOLD" | "EXIT_NOW" | "SAFE_ZONE";

export interface Minute65ShieldInput {
  minute: number;
  scoreHome: number;
  scoreAway: number;
  lambdaHome: number;
  lambdaAway: number;
  tipA: TipMarketKind;
  tipB: TipMarketKind;
  oddsA: number;
  oddsB: number;
  stakeA?: number;
  stakeB?: number;
}

export interface Minute65ShieldResult {
  /** فعال بودن سپر در این لحظه (ورودی‌های تیپ معتبر + بازی در جریان) */
  active: boolean;
  /** وضعیت سپر */
  state: ShieldState;
  /** وضعیت زنده فعلی دو تیپ با نتیجه لحظه‌ای */
  liveZone: "DOUBLE_WIN" | "A_ONLY" | "B_ONLY" | "MIDDLE_TRAP";
  /** احتمال فرار از تله تا پایان بازی (حداقل یک سناریوی برد) — فقط در تله */
  escapeProb: number | null;
  /** زیان سقف‌دار سپر — همیشه −۴۵.۰u در تله میانی */
  cappedLossUnits: number | null;
  /** زیان کامل بدون سپر (−۱۰۰u) برای مقایسه */
  uncappedLossUnits: number | null;
  /** بازگشت تضمینی خروج زنده (۵۵u) */
  recoveryUnits: number | null;
  /** برنامه خروج: شرط متقابل زنده یا کش‌اوت */
  exitPlan: string | null;
  /** پیام فارسی ایجنت سپر */
  message: string;
}

/** طبقه‌بندی زنده وضعیت دو تیپ با نتیجه فعلی (اگر همین وضعیت تا پایان بماند) */
function liveZoneOf(tipA: TipMarketKind, tipB: TipMarketKind, h: number, a: number): Minute65ShieldResult["liveZone"] {
  const wa = tipSettles(tipA, h, a);
  const wb = tipSettles(tipB, h, a);
  if (wa && wb) return "DOUBLE_WIN";
  if (wa) return "A_ONLY";
  if (wb) return "B_ONLY";
  return "MIDDLE_TRAP";
}

/**
 * سپر استاپ‌لاس زنده دقیقه ۶۵ — قلب مدیریت ریسک نسخه ۱۹.۰:
 * در تله میانی از دقیقه ۶۵، زیان روی −۴۵.۰u سقف‌دار می‌شود (بازگشت تضمینی ۵۵u)
 * به‌جای ریسک باخت کامل −۱۰۰u؛ خروج اجباری از دقیقه ۷۵.
 */
export function minute65Shield(input: Minute65ShieldInput): Minute65ShieldResult {
  const stakeA = Math.max(1, input.stakeA ?? SHIELD_STAKE_A_UNITS);
  const stakeB = Math.max(1, input.stakeB ?? SHIELD_STAKE_B_UNITS);
  const totalStake = stakeA + stakeB;
  const zone = liveZoneOf(input.tipA, input.tipB, input.scoreHome, input.scoreAway);
  const base: Minute65ShieldResult = {
    active: true,
    state: "INACTIVE",
    liveZone: zone,
    escapeProb: null,
    cappedLossUnits: null,
    uncappedLossUnits: null,
    recoveryUnits: null,
    exitPlan: null,
    message: "",
  };

  if (zone !== "MIDDLE_TRAP") {
    return {
      ...base,
      state: "SAFE_ZONE",
      message:
        zone === "DOUBLE_WIN"
          ? `ناحیه برد طلایی همزمان (${input.scoreHome}-${input.scoreAway}) — هر دو تیپ در حال بردن‌اند؛ سپر دقیقه ۶۵ غیرفعال (جک‌پات در راه).`
          : `وضعیت امن (${input.scoreHome}-${input.scoreAway}) — یکی از دو تیپ برنده است؛ سپر دقیقه ۶۵ غیرفعال.`,
    };
  }

  // ═══ تله میانی — ماتریس باقیمانده برای احتمال فرار ═══
  const fracRaw = Math.max(0.03, Math.min(0.95, (90 - input.minute) / 90));
  const frac = Math.pow(fracRaw, 0.85);
  let lamH = Math.max(0.02, Math.min(4, input.lambdaHome * frac));
  let lamA = Math.max(0.02, Math.min(4, input.lambdaAway * frac));
  if (input.scoreHome > input.scoreAway) {
    lamH *= 0.85;
    lamA *= 1.18;
  } else if (input.scoreAway > input.scoreHome) {
    lamA *= 0.85;
    lamH *= 1.18;
  }

  // احتمال فرار از تله = احتمال حداقل یک سناریوی پایان که تیپ A یا تیپ B (یا هر دو) ببرند
  const MAX = 9;
  let escapeProb = 0;
  let pSum = 0;
  for (let h = 0; h <= MAX; h++) {
    for (let a = 0; a <= MAX; a++) {
      const p = poisson(h, lamH) * poisson(a, lamA);
      pSum += p;
      const finalH = input.scoreHome + h;
      const finalA = input.scoreAway + a;
      const wa = tipSettles(input.tipA, finalH, finalA);
      const wb = tipSettles(input.tipB, finalH, finalA);
      if (wa || wb) escapeProb += p;
    }
  }
  escapeProb = pSum > 0 ? escapeProb / pSum : 0;

  const uncappedLoss = -totalStake;
  const recovery = Math.round((totalStake - SHIELD_LOSS_CAP_UNITS) * 10) / 10;
  const cappedLoss = -SHIELD_LOSS_CAP_UNITS;
  const exitPlan = `خروج زنده (کش‌اوت/شرط متقابل) با بازگشت تضمینی ${recovery.toFixed(1)}u از ${totalStake}u استیک — زیان سقف‌دار ${cappedLoss.toFixed(1)}u`;

  // دقیقه ۷۵+ یا فرار کم‌احتمال → خروج فوری؛ فرار پراحتمال → نگه‌داری مسلح
  const hardExit = input.minute >= SHIELD_HARD_EXIT_MINUTE;
  const shouldExit = hardExit || escapeProb < SHIELD_ESCAPE_PROB_HOLD;
  const state: ShieldState = shouldExit ? "EXIT_NOW" : "SHIELD_HOLD";

  const message = shouldExit
    ? `🛡️ سپر استاپ‌لاس دقیقه ${SHIELD_TRIGGER_MINUTE}+ فعال شد — نتیجه ${input.scoreHome}-${input.scoreAway} در تله میانی است (هیچ تیپی نمی‌برد) و احتمال فرار تا پایان فقط ${(escapeProb * 100).toFixed(1)}٪ است. خروج ${hardExit ? "اجباری (دقیقه ۷۵+)" : "فوری"} با زیان سقف‌دار −۴۵.۰u به‌جای ریسک −۱۰۰u کامل — ${recovery.toFixed(1)}u اصل سرمایه نجات داده می‌شود.`
    : `🛡️ سپر دقیقه ۶۵ مسلح شد — تله میانی (${input.scoreHome}-${input.scoreAway}) اما احتمال فرار ${(escapeProb * 100).toFixed(1)}٪ بالای آستانه ۳۵٪ است. برنامه خروج با زیان سقف‌دار −۴۵.۰u آماده است؛ اگر تا دقیقه ۷۵ وضعیت تله پایدار بماند، خروج اجباری اجرا می‌شود.`;

  return {
    ...base,
    state,
    escapeProb: Math.round(escapeProb * 1000) / 1000,
    cappedLossUnits: cappedLoss,
    uncappedLossUnits: uncappedLoss,
    recoveryUnits: recovery,
    exitPlan,
    message,
  };
}
