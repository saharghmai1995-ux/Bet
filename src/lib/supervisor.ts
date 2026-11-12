// ─────────────────────────────────────────────────────────────────────────────
// ایجنت سوپروایزر ارشد (Chief Risk Supervisor Agent) — v16.0
// «Hard 10.5% True-Union Risk Gate — 93% Matrix-Partition Atomic Pairs»
//
// بازطراحی کامل بر اساس کالبدشکافی ۱۰۵ کارت تسویه‌شده نسخه ۱۵.۰ (سند ارتقا v16.0):
//   · وین‌ریت نسخه ۱۵ به ۷۷.۱٪ افت کرد و بانک به −۴۷۸.۳ واحد رسید
//   · ۴ باگ ریاضی شناسایی شد: شکاف ۰-۰/۰-۱ الگوهای A1/A2، سمّ لیگ‌های esp.2 و usa.1،
//     شل شدن گیت سوپروایزر به میانگین ریسک ۲۴.۸٪ و سقف مصنوعی ضرایب min(2.35)
//
// فرمول v16.0 (حفظ ساختار + سخت‌گیری گیت):
//
//   SupervisorScore = (CoveragePct × 3.0)
//                   + (GuaranteedProfitPct × 1.0)
//                   − Math.pow(JointLossRiskPct, 1.75)
//
// قانون طلایی تایید (Hard Safety Gate v16.0):
//   · trueJointLossRiskPct > 10.5٪ (اجتماع دقیق خانه‌های ماتریس ۶×۶) → وتو خودکار
//   · فاوریت برتری واضح ندارد (λ_Fav < 1.50 یا λ_Dog > 1.05) → وتو خودکار
//   · لیگ سمّی (esp.2 / usa.1 / fifa.friendly) یا خارج لیگ‌های ساختاریافته → وتو خودکار
//   · سود تضمینی < ۱.۵٪ → وتو
//
// هدف سند: فقط ۲۵ تا ۳۵ بازی تراز اول که واقعاً ریسک زیر ۱۰.۵٪ دارند تایید شوند؛
// بقیه به «دفتر سایه» (Shadow Office) منتقل می‌شوند — 🛡️ وتوشده.
//
// انطباق ضد گوبینگ (Anti-Gubbing):
//   DUAL_BOOK   → استخر کاندید = زوج‌های تک‌بازی (هر تیپ در یک سایت مجزا)
//   SINGLE_BOOK → استخر کاندید = میکس امن دو بازی (پایه بازی ۱ + متغیر بازی ۲)
// ─────────────────────────────────────────────────────────────────────────────

import type { PortfolioPairDTO } from "./types";
import type { ActiveLeagueRule } from "./engine/calibration";

/** v8.0 — حالت اجرایی ثبت شرط (سوییچ انطباق با قوانین سایت‌های شرط‌بندی) */
export type ExecutionMode = "DUAL_BOOK" | "SINGLE_BOOK";

/**
 * v16.0 — گیت سخت وتوی سوپروایزر (Hard Risk Ceiling):
 * ریسک باخت همزمان دقیق از اجتماع خانه‌های ماتریس ۶×۶ بالاتر از ۱۰.۵٪ = وتو خودکار.
 * (نسخه ۱۵ با آستانه افسرنده ۴۵٪، ۱۰۵ بازی پرریسک با میانگین ریسک ۲۴.۸٪ را تایید فله‌ای کرد
 * و بانک را به −۴۷۸.۳ واحد رساند — سند v16.0 گیت را به ۱۰.۵٪ بازگرداند.)
 */
export const VETO_JOINT_LOSS_PCT_ATOMIC = 10.5;
/**
 * v16.0 — گیت برتری واضح فاوریت (Clear Favorite Advantage):
 * λ_Fav < 1.50 یا λ_Dog > 1.05 → بازی فاقد فاوریت قاطع = وتو خودکار.
 */
export const VETO_FAV_LAMBDA_MIN = 1.5;
export const VETO_DOG_LAMBDA_MAX = 1.05;
/**
 * v11.0 — آستانه طلایی گیت سخت ایمنی سوپروایزر (دوره پیش‌از v15 — جفت‌های متعامد گسسته):
 * ریسک باخت همزمان بالاتر از ۹.۸٪ = وتو خودکار و بی‌قیدوشرط.
 */
export const VETO_JOINT_LOSS_PCT = 9.8;
/** آستانه وتو — سود تضمینی ضعیف‌تر از ۱.۵٪ */
export const VETO_WEAK_PROFIT_PCT = 1.5;
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
}

/** امتیاز کیفیت سوپروایزر برای یک زوج کاندید — فرمول v16.0 + گیت‌های سند + پاداش دسته */
export function scorePair(
  p: PortfolioPairDTO,
  rule?: ActiveLeagueRule | null,
  categoryBoost?: CategoryBoost | null,
  lambdaCtx?: SupervisorLambdaContext | null
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

  // ═══ گیت سخت ایمنی v16.0 — قفل آهنین سوپروایزر (سه گیت مستقل سند) ═══
  //  ۱) ریسک باخت همزمان دقیق ≤ ۱۰.۵٪  ۲) برتری واضح فاوریت  ۳) حاشیه داچینگ (فقط حالت سود-برابر)
  let veto = false;
  let vetoReason: string | null = null;
  if (jointLossRiskPct > VETO_JOINT_LOSS_PCT_ATOMIC) {
    veto = true;
    vetoReason = `🛡️ گیت سخت v16.0: ریسک باخت همزمان دقیق ${jointLossRiskPct.toFixed(1)}٪ بالای آستانه ۱۰.۵٪ — وتو خودکار و انتقال به دفتر سایه (فقط بازی‌های تراز اول با پوشش ماتریس بالای ۹۲٪ تایید می‌شوند)`;
  }
  if (!veto && lambdaCtx) {
    // v16.0 — گیت برتری واضح فاوریت: λ_Fav < 1.50 یا λ_Dog > 1.05 → وتو
    const fav = Math.max(lambdaCtx.lambdaHome, lambdaCtx.lambdaAway);
    const dog = Math.min(lambdaCtx.lambdaHome, lambdaCtx.lambdaAway);
    if (fav < VETO_FAV_LAMBDA_MIN || dog > VETO_DOG_LAMBDA_MAX) {
      veto = true;
      vetoReason = `🛡️ گیت فاوریت قاطع v16.0: برتری واضح وجود ندارد (λ_Fav = ${fav.toFixed(2)} < ۱.۵۰ یا λ_Dog = ${dog.toFixed(2)} > ۱.۰۵) — الگوهای طلایی فقط روی فاوریت‌های قاطع صادر می‌شوند — وتو و انتقال به دفتر سایه`;
    }
  }
  if (!veto && guaranteedProfitPct < VETO_WEAK_PROFIT_PCT && !p.accelerator?.active) {
    // حاشیه داچینگ ضعیف — فقط در حالت سود-برابر کلاسیک وتو می‌شود؛
    // v16.0 — زوج‌های شتاب‌دهنده نامتقارن از این گیت معاف‌اند (سود از تجمیس تیپ A +
    // پاداش Double-Win می‌آید و اصل سرمایه با قفل تیپ B محافظت می‌شود — بخش ۲ سند v16.0)
    veto = true;
    vetoReason =
      guaranteedProfitPct <= 0
        ? "بازار فاقد حاشیه تضمینی (S ≥ 1) — حالت بیمه سرمایه؛ سود ضعیف"
        : `سود تضمینی ${guaranteedProfitPct.toFixed(1)}٪ ضعیف‌تر از آستانه ۱.۵٪`;
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
 */
export function pickCrownPair(
  pairs: PortfolioPairDTO[],
  executionMode: ExecutionMode,
  rule?: ActiveLeagueRule | null,
  categoryBoost?: CategoryBoost | null,
  lambdaCtx?: SupervisorLambdaContext | null
): SupervisorDecision | null {
  if (!pairs || pairs.length === 0) return null;

  const modePool = pairs.filter((p) =>
    executionMode === "SINGLE_BOOK" ? p.kind === "TWO_MATCH_MIX" : p.kind !== "TWO_MATCH_MIX"
  );
  const pool = modePool.length > 0 ? modePool : pairs;

  const scored: ScoredCandidate[] = pool.map((pair) => ({ pair, score: scorePair(pair, rule, categoryBoost, lambdaCtx) }));

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
