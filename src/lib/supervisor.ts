// ─────────────────────────────────────────────────────────────────────────────
// ایجنت سوپروایزر ارشد (Chief Risk Supervisor Agent) — v19.0 High-ROI
// «Loosened Veto Gates — Jackpot Liberation & 5-Regime ROI Activation»
//
// v19.0 (سند جراحی مستقیم): گیت‌های وتو v18 که بازی‌های جکپات بزرگ را
// «وتو - تسویه کاغذی» می‌کردند آزاد شدند:
//   · ریسک باخت همزمان: ۱۰.۵٪ → ۱۵.۸٪ (در عمل سقف موثر = وتوی قرمز ۱۵٪)
//   · گیت فاوریت ثابت: λ_Fav ≥ ۱.۵۰ → ≥ ۱.۱۰ | λ_Dog ≤ ۱.۰۵ → ≤ ۱.۳۵
//   · گیت سود ضعیف: ۱.۵٪ → ۰.۵٪
//   · کف شارپ رژیم‌ها با APPROVE_SHARPE_MIN v19 (۰.۱۴) هم‌تراز شد
// خروجی: بازی‌هایی مثل Andorra×Gibraltar (+۱۱۶u) / San Marino×Belarus (+۱۳۹u)
// وارد کارت‌های تاییدشده بانک اصلی می‌شوند و هر ۵ رژیم ویترین سودآوری پر می‌شود.
//
// بازطراحی v18.0 (سند ارتقا): سه شرط ثابت نسخه ۱۶ (λ_Fav < ۱.۵۰ / λ_Dog > ۱.۰۵ /
// ریسک ۱۰.۵٪) که «قبل از مسیریاب ۵ رژیم» اعمال می‌شدند، ۱۵۰ کارت ۹۰.۷٪-برد را
// در دفتر سایه حبس کرده بودند. v18.0 ترتیب اجرا را معکوس می‌کند:
//
//   ۱) ابتدا betrouter هر ۵ رژیم (BANKER / COMBO / CORRECT_SCORE / DUAL_HEDGE /
//      ACCUMULATOR) را برای مسابقه محاسبه می‌کند؛
//   ۲) سپس سوپروایزر بر اساس رژیمی که بالاترین شارپ را آورده، «گیت اختصاصی همان
//      رژیم» را اعمال می‌کند (جدول سند v18.0):
//
//      🎯 CORRECT_SCORE → λ_Fav ∈ [1.15, 1.85] و λ_Dog ≤ 1.15 | Top4 ≥ ۵۴٪ و H ≤ ۲.۴۸
//      🧩 COMBO         → λ_Fav ≥ 1.35 و λ_Dog ≤ 1.25 | پوشش ≥ ۷۸٪ و شارپ ≥ ۰.۲۲
//      🏦 BANKER        → Rλ ≥ 1.65 و احتمال پایه ≥ ۸۰٪
//      ⚖️ DUAL_HEDGE    → ریسک ≤ ۱۱.۲٪ و شارپ ≥ ۰.۲۴ (شتاب‌دهنده نامتقارن معاف از گیت سود)
//
//   ۳) سیستم دو‌سطحی تاج (Two-Tier Crown System):
//      👑 سطح ۱ — تاج طلایی: همه شروط سخت جدول + ریسک < ۱۱.۲٪ + شارپ ≥ ۰.۲۴ → استیک کامل ۱۰۰u
//      🥈 سطح ۲ — تاج نقره‌ای (شکارچی آلفای سایه): winProb ≥ ۸۴٪ + شارپ ≥ ۰.۱۶
//         در لیگ معتبر → استیک نصف ۵۰u به روش Half-Kelly
//      🚫 سطح ۳ — وتوی قرمز مطلق: لیگ سمّی یا ریسک > ۱۵٪ → فقط تسویه کاغذی دفتر سایه
//
// بلک‌لیست لیگ‌های سمّی (esp.2 / usa.1 / fifa.friendly) همچنان ۱۰۰٪ برقرار است.
// ─────────────────────────────────────────────────────────────────────────────

import type { PortfolioPairDTO } from "./types";
import type { ActiveLeagueRule } from "./engine/calibration";
import type { BetTypeKey } from "./engine/betrouter";

/** v8.0 — حالت اجرایی ثبت شرط (سوییچ انطباق با قوانین سایت‌های شرط‌بندی) */
export type ExecutionMode = "DUAL_BOOK" | "SINGLE_BOOK";

/**
 * v19.0 — گیت‌های رژیم‌محور سوپروایزر (سند جراحی High-ROI):
 *  · ریسک باخت همزمان: ۱۰.۵٪ → ۱۵.۸٪ — رهایی بازی‌های جکپات از «تسویه کاغذی»
 *    (در عمل سقف موثر همان وتوی قرمز مطلق ۱۵٪ است).
 *  · وتوی قرمز مطلق سطح ۳: ریسک بالای ۱۵٪ همیشه وتو است (فقط دفتر کاغذی).
 */
export const VETO_JOINT_LOSS_PCT_ATOMIC = 15.8;
/** v19.0 — سقف ریسک رژیم DUAL_HEDGE — با گیت اتمیک هم‌تراز شد */
export const VETO_JOINT_LOSS_PCT_DUAL_HEDGE = 15.8;
/** v18.0 — وتوی قرمز مطلق سطح ۳ (Hard Red Veto — ریسک > ۱۵٪ فقط تسویه کاغذی) */
export const VETO_JOINT_LOSS_PCT_HARD_RED = 15;
/**
 * v19.0 — گیت ثابت فاوریت فقط برای رژیم‌های بدون پنجره λ اختصاصی (BANKER و کارت بدون
 * زمینه رژیم) برقرار است؛ CORRECT_SCORE/COMBO/DUAL_HEDGE پنجره λ خودشان را دارند.
 * v19.0 — λ_Fav ≥ ۱.۱۰ و λ_Dog ≤ ۱.۳۵: بازی‌های کم‌گل سودده و هجومی دیگر وتو نمی‌شوند.
 */
export const VETO_FAV_LAMBDA_MIN = 1.1;
export const VETO_DOG_LAMBDA_MAX = 1.35;
/**
 * v11.0 — آستانه طلایی گیت سخت ایمنی سوپروایزر (دوره پیش‌از v15 — جفت‌های متعامد گسسته):
 * ریسک باخت همزمان بالاتر از ۹.۸٪ = وتو خودکار و بی‌قیدوشرط.
 */
export const VETO_JOINT_LOSS_PCT = 9.8;
/** v19.0 — آستانه وتو — سود تضمینی ضعیف‌تر از ۰.۵٪ */
export const VETO_WEAK_PROFIT_PCT = 0.5;
/** v11.0 — آستانه «دژ نفوذناپذیر»: ریسک زیر ۷٪ + تایید سوپروایزر */
export const FORTRESS_RISK_PCT = 7;

/** خروجی امتیازدهی یک کاندید */
export interface SupervisorScore {
  /** فرمول خام v11.0 — بدون نرمال‌سازی */
  raw: number;
  /** نمایش استاندارد ۰..۱۰۰ (کالیبراسیون خطی روی بازه واقعی −۲۸۰..+۲۰۰) */
  score100: number;
  guaranteedProfitPct: number;
  /** v11.0 — پهنای پوشش متعامد (درصد سناریوهای پوشش‌داده‌شده A∪B) */
  coveragePct: number;
  doubleWinProbPct: number;
  jointLossRiskPct: number;
  /** v9.0 — پاداش/جریمه عددی درس کالیبراسیون روی این الگو (۰ = بدون قانون) */
  calibrationBoost: number;
  /** v11.0 — این الگو «دژ نفوذناپذیر» است؟ (ریسک < ۷٪ و بدون وتو) */
  fortress: boolean;
  veto: boolean;
  vetoReason: string | null;
  /** v18.0 — سطح تاج: GOLD (استیک کامل ۱۰۰u) / SILVER (استیک نصف ۵۰u Half-Kelly) / null */
  tier: "GOLD" | "SILVER" | null;
}

/** جریمه توانی v11.0 — دقیقاً Math.pow(risk, 1.75) طبق سند ارتقا */
function riskPenalty(jointLossRiskPct: number): number {
  return Math.pow(Math.max(0, jointLossRiskPct), 1.75);
}

/**
 * v14.0 → v16.0 — پاداش الگوی اختصاصی دسته رقابت (اسکنر چهارفصل):
 * بازی‌های ملی → +۱۵ به الگوی طلایی ۲ (برد میزبان + زیر ۲.۵ گل)
 * لیگ قهرمانان زنان → +۱۸ به الگوی طلایی ۱ (فاوریت بالای ۱.۵ تیمی)
 */
export interface CategoryBoost {
  code: "G1" | "G2" | "G3";
  points: number;
  label: string;
}

/**
 * v16.0 — نرمال‌سازی نمایش امتیاز روی بازه واقعی الگوهای طلایی [−۴۸۰..+۱۲۰].
 * مرجع واحد score100 — مشترک بین supervisor و بلوک داده پوستر (slip-images).
 */
export function score100Of(raw: number): number {
  return Math.max(0, Math.min(100, Math.round(((raw + 480) / 600) * 100)));
}

/** زمینه λ بازی برای گیت برتری واضح فاوریت (v16.0) */
export interface SupervisorLambdaContext {
  lambdaHome: number;
  lambdaAway: number;
  /**
   * v21.0 — خط واقعی بازار (ESPN / Polymarket / Odds Feed) در دسترس بود؟
   * false = مسیر STATS_ONLY کور → گیت «No Blind Card» فعال می‌شود.
   * undefined = اطلاعات مسیر موجود نیست (سازگاری با داده‌های قدیمی — گیت بسته نمی‌شود)
   */
  hasMarketOdds?: boolean;
}

/**
 * v21.0 — No Blind Card Gate (وتوی داده ناقص):
 * اگر برای مسابقه‌ای نه ضریب واقعی بازار وجود داشت و λ_H و λ_A هر دو در
 * بازه کور ۰.۹۰–۱.۰۵ باقی مانده باشند (یعنی هیچ‌یک از دو تیم در جدول Elo
 * شناخته نشده و همه ورودی‌ها پیش‌فرض شده‌اند)، سوپروایزر آن بازی را وتو می‌کند
 * و هرگز کارت کور صادر نمی‌شود.
 */
export const BLIND_LAMBDA_LO = 0.9;
export const BLIND_LAMBDA_HI = 1.05;

export function isBlindData(lambdaCtx: SupervisorLambdaContext | null | undefined): boolean {
  if (!lambdaCtx) return false;
  if (lambdaCtx.hasMarketOdds === true) return false;
  if (lambdaCtx.hasMarketOdds === undefined) return false; // داده مسیر نامشخص — گیت نمی‌بندد
  const fav = Math.max(lambdaCtx.lambdaHome, lambdaCtx.lambdaAway);
  const dog = Math.min(lambdaCtx.lambdaHome, lambdaCtx.lambdaAway);
  return fav <= BLIND_LAMBDA_HI && dog >= BLIND_LAMBDA_LO;
}

/**
 * v18.0 — زمینه رژیم منتخب مسیریاب Bet-Type (خروجی routeBetTypes):
 * سوپروایزر بر اساس همین رژیم، گیت اختصاصی همان رژیم را به‌جای گیت ثابت λ اعمال می‌کند.
 */
export interface SupervisorRegimeContext {
  /** رژیم برنده مسیریاب با بالاترین شارپ (null = بدون زمینه → گیت ثابت v16) */
  regime: BetTypeKey | null;
  /** شارپ کاندید برنده مسیریاب (برای سطح‌بندی تاج طلایی/نقره‌ای) */
  sharpe?: number | null;
  /** احتمال برد کل استراتژی منتخب مسیریاب (برای سطح‌بندی نقره‌ای) */
  winProb?: number | null;
  /** ریسک باخت همزمان استراتژی منتخب (٪) */
  jointLossRiskPct?: number | null;
  /** سطح تاج اعلام‌شده مسیریاب (GOLD/SILVER/null) */
  tier?: "GOLD" | "SILVER" | null;
}

/** امتیاز کیفیت سوپروایزر برای یک زوج کاندید — فرمول v16 + گیت‌های رژیم‌محور v18.0 */
export function scorePair(
  p: PortfolioPairDTO,
  rule?: ActiveLeagueRule | null,
  categoryBoost?: CategoryBoost | null,
  lambdaCtx?: SupervisorLambdaContext | null,
  regimeCtx?: SupervisorRegimeContext | null
): SupervisorScore {
  const guaranteedProfitPct = p.guaranteedMarginPct; // ٪ سود تضمینی داچینگ
  const doubleWinProbPct = p.jointStates.bothWin * 100; // ٪ برد طلایی همزمان (فقط نمایش — بدون پاداش)
  const jointLossRiskPct = p.jointStates.bothLose * 100; // ٪ باخت همزمان
  // v11.0 — پهنای پوشش متعامد (۰..۱ → ۰..۱۰۰). اگر الگو متادیتا نداشت، از مکمل ریسک تخمین زده می‌شود
  const coveragePct = p.archetype?.coveragePct != null ? p.archetype.coveragePct * 100 : Math.min(100, (1 - p.jointStates.bothLose) * 100);

  // v9.0 — بردار قانون فعال کالیبراسیون: پاداش/جریمه عددی الگو (G1..G3 + کدهای قدیمی A1..A5)
  const code = p.archetype?.code ?? null;
  let boost = code && rule ? (rule.archetypeBoosts[code] ?? 0) : 0;
  // v14.0 — پاداش قاعده دسته رقابت (NATIONAL/WOMEN_ELITE) روی الگوی هدف
  const categoryBoostPts = code && categoryBoost && categoryBoost.code === code ? categoryBoost.points : 0;
  boost += categoryBoostPts;

  // ═══ فرمول v16.0 — پهنای پوشش عامل غالب (وزن ۳.۰) + حاشیه تضمینی (وزن ۱.۰) + جریمه توانی ریسک ═══
  const raw = coveragePct * 3.0 + guaranteedProfitPct * 1.0 - riskPenalty(jointLossRiskPct) + boost;

  // نرمال‌سازی نمایش v16.0 — بازه خام واقعی الگوهای طلایی [−۴۸۰..+۱۲۰] → [۰..۱۰۰]
  const score100 = score100Of(raw);

  // ═══ v18.0 — گیت سخت ایمنی — گیت‌های رژیم‌محور (به‌جای گیت ثابت v16) ═══
  //  ۱) سقف ریسک: DUAL_HEDGE → ۱۱.۲٪ | سایر رژیم‌ها → ۱۰.۵٪ | وتوی قرمز مطلق → > ۱۵٪
  //  ۲) پنجره λ اختصاصی رژیم (CORRECT_SCORE / COMBO) یا گیت ثابت فاوریت برای BANKER/بدون زمینه
  //  ۳) کف شارپ اختصاصی رژیم (جدول سند): DUAL_HEDGE ≥ ۰.۲۴ | COMBO ≥ ۰.۲۲
  //  ۴) حاشیه داچینگ (فقط حالت سود-برابر — شتاب‌دهنده نامتقارن معاف)
  const regime = regimeCtx?.regime ?? null;
  const regimeSharpe = regimeCtx?.sharpe ?? null;
  const riskCapPct = regime === "DUAL_HEDGE" ? VETO_JOINT_LOSS_PCT_DUAL_HEDGE : VETO_JOINT_LOSS_PCT_ATOMIC;
  let veto = false;
  let vetoReason: string | null = null;
  let tier: "GOLD" | "SILVER" | null = null;
  // ═══ v21.0 — گیت صفر: No Blind Card (وتوی داده ناقص — مقدم بر همه گیت‌های دیگر) ═══
  // بدون خط ضریب بازار + λ کور ۰.۹۰–۱.۰۵ = هیچ کارتی صادر نمی‌شود؛
  // همچنین قانون بلک‌لیست بازی‌های دوستانه (fifa.friendly) در TOXIC_LEAGUE_SLUGS
  // و POISON_LEAGUES مسیریاب همچنان مقدم بر همه الگوها برقرار است.
  if (isBlindData(lambdaCtx)) {
    veto = true;
    const fav = Math.max(lambdaCtx?.lambdaHome ?? 0, lambdaCtx?.lambdaAway ?? 0);
    const dog = Math.min(lambdaCtx?.lambdaHome ?? 0, lambdaCtx?.lambdaAway ?? 0);
    vetoReason = `⏸️ وتوی داده ناقص v21.0 — عدم وجود خط ضریب بازار و عدم شناسایی تیم‌ها در جدول Elo جهانی (λ کور ${dog.toFixed(2)}–${fav.toFixed(2)} در بازه ۰.۹۰–۱.۰۵) — صدور کارت کور ممنوع`;
  } else if (jointLossRiskPct > VETO_JOINT_LOSS_PCT_HARD_RED) {
    veto = true;
    vetoReason = `🚫 وتوی قرمز مطلق v18.0 (سطح ۳): ریسک باخت همزمان دقیق ${jointLossRiskPct.toFixed(1)}٪ بالای سقف ۱۵٪ — بازی واقعاً خطرناک؛ فقط تسویه کاغذی دفتر سایه`;
  } else if (jointLossRiskPct > riskCapPct) {
    veto = true;
    vetoReason =
      regime === "DUAL_HEDGE"
        ? `🛡️ گیت رژیم‌محور v19.0: ریسک باخت همزمان ${jointLossRiskPct.toFixed(1)}٪ بالای سقف رژیم DUAL_HEDGE — وتو و انتقال به دفتر سایه`
        : `🛡️ گیت سخت v19.0: ریسک باخت همزمان دقیق ${jointLossRiskPct.toFixed(1)}٪ بالای آستانه مجاز — وتو خودکار و انتقال به دفتر سایه`;
  }
  if (!veto && lambdaCtx) {
    const fav = Math.max(lambdaCtx.lambdaHome, lambdaCtx.lambdaAway);
    const dog = Math.min(lambdaCtx.lambdaHome, lambdaCtx.lambdaAway);
    // v18.0 — پنجره λ اختصاصی هر رژیم (جدول سند)؛ گیت ثابت فقط برای BANKER/بدون زمینه.
    // DUAL_HEDGE پنجره λ ندارد (سند: فقط ریسک ≤ ۱۱.۲٪ و شارپ ≥ ۰.۲۴).
    if (regime === "CORRECT_SCORE") {
      if (fav < 1.15 || fav > 1.85 || dog > 1.15) {
        veto = true;
        vetoReason = `🛡️ گیت خوشه نتیجه دقیق v18.0: λ_Fav=${fav.toFixed(2)} باید ∈ [1.15, 1.85] و λ_Dog=${dog.toFixed(2)} ≤ 1.15 — خوشه ۱-۰/۲-۰/۱-۱/۰-۰ فقط روی بازی‌های کم‌گل تاکتیکی صادر می‌شود`;
      }
    } else if (regime === "COMBO") {
      if (fav < 1.35 || dog > 1.25) {
        veto = true;
        vetoReason = `🛡️ گیت کمبو v18.0: λ_Fav=${fav.toFixed(2)} باید ≥ 1.35 و λ_Dog=${dog.toFixed(2)} ≤ 1.25 — کمبو 1X&U3.5 / 1&O1.5 فقط روی فاوریت کنترل‌گر/هجومی صادر می‌شود`;
      }
    } else if (regime !== "DUAL_HEDGE" && (fav < VETO_FAV_LAMBDA_MIN || dog > VETO_DOG_LAMBDA_MAX)) {
      veto = true;
      vetoReason = `🛡️ گیت فاوریت قاطع v19.0: برتری واضح وجود ندارد (λ_Fav = ${fav.toFixed(2)} < ۱.۱۰ یا λ_Dog = ${dog.toFixed(2)} > ۱.۳۵) — رژیم ${regime ?? "پیش‌فرض"} فقط روی فاوریت‌های قاطع صادر می‌شود — وتو و انتقال به دفتر سایه`;
    }
  }
  if (!veto && regimeCtx && regimeSharpe != null) {
    // v19.0 — کف شارپ اختصاصی رژیم با APPROVE_SHARPE_MIN v19 (۰.۱۴) هم‌تراز شد —
    // رژیمِ بالاترین شارپ مسیریاب تعیین‌کننده است
    if (regime === "DUAL_HEDGE" && regimeSharpe < 0.14) {
      veto = true;
      vetoReason = `🛡️ گیت رژیم DUAL_HEDGE v19.0: شارپ ${regimeSharpe.toFixed(2)} زیر کف ۰.۱۴ رژیم زوج‌تیپ — نسبت بازده/نوسان کافی نیست؛ انتقال به دفتر سایه`;
    } else if (regime === "COMBO" && regimeSharpe < 0.14) {
      veto = true;
      vetoReason = `🛡️ گیت رژیم COMBO v19.0: شارپ ${regimeSharpe.toFixed(2)} زیر کف ۰.۱۴ رژیم کمبو — انتقال به دفتر سایه`;
    }
  }
  if (!veto && guaranteedProfitPct < VETO_WEAK_PROFIT_PCT && !p.accelerator?.active) {
    // حاشیه داچینگ ضعیف — فقط در حالت سود-برابر کلاسیک وتو می‌شود؛
    // زوج‌های شتاب‌دهنده نامتقارن از این گیت معاف‌اند (سود از تجمیس تیپ A +
    // پاداش Double-Win می‌آید و اصل سرمایه با قفل تیپ B محافظت می‌شود)
    veto = true;
    vetoReason =
      guaranteedProfitPct <= 0
        ? "بازار فاقد حاشیه تضمینی (S ≥ 1) — حالت بیمه سرمایه؛ سود ضعیف"
        : `سود تضمینی ${guaranteedProfitPct.toFixed(1)}٪ ضعیف‌تر از آستانه ۰.۵٪ v19.0`;
  }

  // ═══ v18.0 — سطح‌بندی تاج (Two-Tier Crown System) ═══
  if (!veto) {
    const goldOK =
      jointLossRiskPct < VETO_JOINT_LOSS_PCT_DUAL_HEDGE &&
      (regimeCtx?.sharpe == null || regimeCtx.sharpe >= 0.24);
    const silverOK =
      !goldOK &&
      (regimeCtx?.winProb != null
        ? regimeCtx.winProb >= 0.84 && (regimeCtx.sharpe ?? 0) >= 0.16
        : coveragePct / 100 >= 0.84 && (regimeCtx?.sharpe ?? 0) >= 0.16);
    tier = goldOK ? "GOLD" : silverOK ? "SILVER" : null;
  }

  const fortress = !veto && jointLossRiskPct < FORTRESS_RISK_PCT;

  return {
    raw: Math.round(raw * 10) / 10,
    score100,
    guaranteedProfitPct: Math.round(guaranteedProfitPct * 10) / 10,
    coveragePct: Math.round(coveragePct * 10) / 10,
    doubleWinProbPct: Math.round(doubleWinProbPct * 10) / 10,
    jointLossRiskPct: Math.round(jointLossRiskPct * 10) / 10,
    calibrationBoost: Math.round(boost * 10) / 10,
    fortress,
    veto,
    vetoReason,
    tier,
  };
}

/** کاندید امتیازگرفته */
export interface ScoredCandidate {
  pair: PortfolioPairDTO;
  score: SupervisorScore;
}

/** الگوی رد‌شده (پشت فلش‌کارت — شفافیت کامل تصمیم سوپروایزر) */
export interface RejectedCandidate {
  id: string;
  short: string;
  raw: number;
  score100: number;
  veto: boolean;
  reason: string;
}

/** تصمیم نهایی سوپروایزر برای یک بازی */
export interface SupervisorDecision {
  /** 👑 زوج برنده — تنها تیپ نمایش‌داده‌شده روی فلش‌کارت */
  crown: PortfolioPairDTO;
  score: SupervisorScore;
  /** بازی کل (بهترین الگو هم) وتو شده است؟ */
  veto: boolean;
  vetoReason: string | null;
  /** الگوهای بازرسی‌شده که رد شدند — با امتیاز و دلیل */
  rejected: RejectedCandidate[];
  executionMode: ExecutionMode;
}

function shortOf(p: PortfolioPairDTO): string {
  return p.archetype?.short ?? (p.kind === "TWO_MATCH_MIX" ? "میکس امن دو بازی" : "بت‌بیلدر تک‌بازی");
}

/**
 * pickCrownPair — انتخاب «تک‌تیپ طلایی مونت‌کارلو» از میان کاندیدهای یک بازی.
 * استخر کاندید بر اساس حالت اجرایی (ضد گوبینگ) فیلتر می‌شود؛ اگر استخر
 * حالت فعال خالی بود، برای قطع‌کردن تجربه کاربر کل کاندیدها بازرسی می‌شوند.
 * v9.0 — بردار قانون فعال کالیبراسیون (درس‌های سیستمی لیگ) مستقیماً روی
 * امتیاز الگوها اعمال می‌شود: rule.archetypeBoosts[code].
 * v11.0 — تساوئی‌ها با ریسک کمتر حل می‌شوند (اولویت کمینه‌سازی ریسک).
 * v16.0 — زمینه λ بازی برای گیت برتری واضح فاوریت (پارامتر lambdaCtx).
 * v18.0 — زمینه رژیم منتخب مسیریاب Bet-Type (پارامتر regimeCtx): گیت اختصاصی
 * همان رژیم جایگزین گیت ثابت λ می‌شود + سطح‌بندی تاج طلایی/نقره‌ای.
 */
export function pickCrownPair(
  pairs: PortfolioPairDTO[],
  executionMode: ExecutionMode,
  rule?: ActiveLeagueRule | null,
  categoryBoost?: CategoryBoost | null,
  lambdaCtx?: SupervisorLambdaContext | null,
  regimeCtx?: SupervisorRegimeContext | null
): SupervisorDecision | null {
  if (!pairs || pairs.length === 0) return null;

  const modePool = pairs.filter((p) =>
    executionMode === "SINGLE_BOOK" ? p.kind === "TWO_MATCH_MIX" : p.kind !== "TWO_MATCH_MIX"
  );
  const pool = modePool.length > 0 ? modePool : pairs;

  const scored: ScoredCandidate[] = pool.map((pair) => ({
    pair,
    score: scorePair(pair, rule, categoryBoost, lambdaCtx, regimeCtx),
  }));

  // برنده = بالاترین امتیاز خام میان «غیر وتو شده»؛ تساوئی → ریسک کمتر.
  // اگر همه وتو شدند → کم‌ریسک‌ترین (بالاترین امتیاز) به‌عنوان کارت وتو شده نمایش داده می‌شود
  const clean = scored.filter((s) => !s.score.veto);
  const better = (a: ScoredCandidate, b: ScoredCandidate): ScoredCandidate =>
    b.score.raw > a.score.raw ||
    (b.score.raw === a.score.raw && b.score.jointLossRiskPct < a.score.jointLossRiskPct)
      ? b
      : a;
  const winner = (clean.length > 0 ? clean : scored).reduce(better);

  const rejected: RejectedCandidate[] = scored
    .filter((s) => s.pair.id !== winner.pair.id)
    .map((s) => ({
      id: s.pair.id,
      short: shortOf(s.pair),
      raw: s.score.raw,
      score100: s.score.score100,
      veto: s.score.veto,
      reason:
        s.score.vetoReason ??
        (s.score.raw < winner.score.raw
          ? `امتیاز پایین‌تر از برنده (${s.score.raw} در برابر ${winner.score.raw})${s.score.calibrationBoost ? ` · درس کالیبراسیون: ${s.score.calibrationBoost > 0 ? "+" : ""}${s.score.calibrationBoost}` : ""}`
          : "کاندید برتر نبود"),
    }))
    .sort((a, b) => b.raw - a.raw);

  return {
    crown: winner.pair,
    score: winner.score,
    veto: winner.score.veto,
    vetoReason: winner.score.vetoReason,
    rejected,
    executionMode: modePool.length > 0 ? executionMode : executionMode,
  };
}
