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
