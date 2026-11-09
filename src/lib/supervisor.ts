// ─────────────────────────────────────────────────────────────────────────────
// ایجنت سوپروایزر ارشد (Chief Risk Supervisor Agent) — v11.0
// «بهینه‌ساز نامتقارن ریسک زیر ۱۰٪ — Sub-10% Risk Asymmetric Optimizer»
//
// بازنویسی کامل فرمول بر اساس کالیبراسیون تجربی ۴۸ مسابقه تسویه‌شده:
//   · دسته «تاییدشده سوپروایزر» ۳۰/۳۰ برد (+۳۵۱.۸ واحد)
//   · دسته «ریسک باخت همزمان زیر ۱۰٪» ۳۹/۳۹ برد (+۳۱۶.۱ واحد)
//   · دسته «فرصت‌های Double-Win» صفر برد طلایی و −۴۹.۰ واحد ضرر!
//
// یافته: پاداش DoubleWinProbPct × ۱.۸ در فرمول قدیمی، سوپروایزر را به طمع
// برد همزمان فریب می‌داد و پهنای پوشش را فدا می‌کرد (تله Double-Win).
//
// فرمول جدید v11.0 — ۱۰۰٪ بر پایه پهنای پوشش متعامد و کمینه‌سازی ریسک:
//
//   SupervisorScore = (CoveragePct × 1.5)
//                   + (GuaranteedProfitPct × 1.3)
//                   − Math.pow(JointLossRiskPct, 1.75)
//
// قانون طلایی تایید (Hard Safety Gate):
//   هر الگویی با JointLossRiskPct > 9.8% به‌صورت خودکار وتو می‌شود.
//
// وتو (Supervisor Veto / No-Bet Filter):
//   · ریسک باخت همزمان > ۹.۸٪  → وتو خودکار (گیت سخت ایمنی)
//   · سود تضمینی < ۱.۵٪        → وتو (بازار فاقد ارزش)
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
 * v11.0 — آستانه طلایی گیت سخت ایمنی سوپروایزر:
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

/** امتیاز کیفیت سوپروایزر برای یک زوج کاندید — دقیقاً طبق فرمول v11.0 */
export function scorePair(p: PortfolioPairDTO, rule?: ActiveLeagueRule | null): SupervisorScore {
  const guaranteedProfitPct = p.guaranteedMarginPct; // ٪ سود تضمینی داچینگ
  const doubleWinProbPct = p.jointStates.bothWin * 100; // ٪ برد طلایی همزمان (فقط نمایش — بدون پاداش)
  const jointLossRiskPct = p.jointStates.bothLose * 100; // ٪ باخت همزمان
  // v11.0 — پهنای پوشش متعامد (۰..۱ → ۰..۱۰۰). اگر الگو متادیتا نداشت، از مکمل ریسک تخمین زده می‌شود
  const coveragePct = p.archetype?.coveragePct != null ? p.archetype.coveragePct * 100 : Math.min(100, (1 - p.jointStates.bothLose) * 100);

  // v9.0 — بردار قانون فعال کالیبراسیون: پاداش/جریمه عددی الگو (A1..A5)
  const code = p.archetype?.code ?? null;
  const boost = code && rule ? (rule.archetypeBoosts[code] ?? 0) : 0;

  // ═══ فرمول v11.0 — حذف کامل پاداش فریبنده Double-Win ═══
  const raw = coveragePct * 1.5 + guaranteedProfitPct * 1.3 - riskPenalty(jointLossRiskPct) + boost;

  // نرمال‌سازی نمایش: بازه خام واقعی [−۲۸۰ .. +۲۰۰] → [۰ .. ۱۰۰]
  const score100 = Math.max(0, Math.min(100, Math.round(((raw + 280) / 480) * 100)));

  // ═══ گیت سخت ایمنی v11.0 — ریسک > ۹.۸٪ = وتو خودکار ═══
  let veto = false;
  let vetoReason: string | null = null;
  if (jointLossRiskPct > VETO_JOINT_LOSS_PCT) {
    veto = true;
    vetoReason = `🛡️ گیت سخت v11.0: ریسک باخت همزمان ${jointLossRiskPct.toFixed(1)}٪ بالای آستانه طلایی ۹.۸٪ — وتو خودکار`;
  } else if (guaranteedProfitPct < VETO_WEAK_PROFIT_PCT) {
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
 */
export function pickCrownPair(
  pairs: PortfolioPairDTO[],
  executionMode: ExecutionMode,
  rule?: ActiveLeagueRule | null
): SupervisorDecision | null {
  if (!pairs || pairs.length === 0) return null;

  const modePool = pairs.filter((p) =>
    executionMode === "SINGLE_BOOK" ? p.kind === "TWO_MATCH_MIX" : p.kind !== "TWO_MATCH_MIX"
  );
  const pool = modePool.length > 0 ? modePool : pairs;

  const scored: ScoredCandidate[] = pool.map((pair) => ({ pair, score: scorePair(pair, rule) }));

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
