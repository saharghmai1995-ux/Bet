// ─────────────────────────────────────────────────────────────────────────────
// ایجنت سوپروایزر ارشد (Chief Risk Supervisor Agent) — v8.0
//
// دروازه‌بان نهایی خط لوله: هر ۵ الگوی متعامد + زوج‌های بت‌بیلدر/میکس روی
// ۱۰,۰۰۰ شبیه‌سازی مونت‌کارلو آزمایش می‌شوند و به هر کاندید یک
// «امتیاز کیفیت سوپروایزر (Supervisor Utility Score)» داده می‌شود:
//
//   UtilityScore = (GuaranteedProfitPct × 1.4)
//                + (DoubleWinProbPct  × 1.8)
//                − (JointLossRiskPct  × 2.5)
//
// الگوی برنده = بالاترین امتیاز میان کاندیدهای غیر وتو شده →
// «👑 تنها تیپ تاییدشده سوپروایزر (Monte-Carlo Winner)»
//
// وتو (Supervisor Veto / No-Bet Filter):
//   اگر حتی بهترین الگو ریسک باخت همزمان > ۱۲٪ یا سود تضمینی ضعیف (< ۱.۵٪)
//   داشته باشد → «🛡️ وتو شده: ریسک نامتقارن — عدم پیشنهاد شرط»
//
// انطباق ضد گوبینگ (Anti-Gubbing):
//   DUAL_BOOK   → استخر کاندید = زوج‌های تک‌بازی (هر تیپ در یک سایت مجزا)
//   SINGLE_BOOK → استخر کاندید = میکس امن دو بازی (پایه بازی ۱ + متغیر بازی ۲)
// ─────────────────────────────────────────────────────────────────────────────

import type { PortfolioPairDTO } from "./types";

/** v8.0 — حالت اجرایی ثبت شرط (سوییچ انطباق با قوانین سایت‌های شرط‌بندی) */
export type ExecutionMode = "DUAL_BOOK" | "SINGLE_BOOK";

/** آستانه وتو سوپروایزر — ریسک باخت همزمان بالای ۱۲٪ */
export const VETO_JOINT_LOSS_PCT = 12;
/** آستانه وتو — سود تضمینی ضعیف‌تر از ۱.۵٪ */
export const VETO_WEAK_PROFIT_PCT = 1.5;

/** خروجی امتیازدهی یک کاندید */
export interface SupervisorScore {
  /** فرمول خام سند ارتقا — بدون نرمال‌سازی */
  raw: number;
  /** نمایش استاندارد ۰..۱۰۰ (کالیبراسیون خطی روی بازه واقعی −۱۲۰..+۴۰) */
  score100: number;
  guaranteedProfitPct: number;
  doubleWinProbPct: number;
  jointLossRiskPct: number;
  veto: boolean;
  vetoReason: string | null;
}

/** امتیاز کیفیت سوپروایزر برای یک زوج کاندید — دقیقاً طبق فرمول سند ارتقا */
export function scorePair(p: PortfolioPairDTO): SupervisorScore {
  const guaranteedProfitPct = p.guaranteedMarginPct; // ٪ سود تضمینی داچینگ
  const doubleWinProbPct = p.jointStates.bothWin * 100; // ٪ برد طلایی همزمان
  const jointLossRiskPct = p.jointStates.bothLose * 100; // ٪ باخت همزمان

  const raw =
    guaranteedProfitPct * 1.4 + doubleWinProbPct * 1.8 - jointLossRiskPct * 2.5;

  // نرمال‌سازی نمایش: بازه خام واقعی [−۱۲۰ .. +۴۰] → [۰ .. ۱۰۰]
  const score100 = Math.max(0, Math.min(100, Math.round(((raw + 120) / 160) * 100)));

  let veto = false;
  let vetoReason: string | null = null;
  if (jointLossRiskPct > VETO_JOINT_LOSS_PCT) {
    veto = true;
    vetoReason = `ریسک باخت همزمان ${jointLossRiskPct.toFixed(1)}٪ بالای آستانه ۱۲٪ — عدم پیشنهاد شرط`;
  } else if (guaranteedProfitPct < VETO_WEAK_PROFIT_PCT) {
    veto = true;
    vetoReason =
      guaranteedProfitPct <= 0
        ? "بازار فاقد حاشیه تضمینی (S ≥ 1) — حالت بیمه سرمایه؛ سود ضعیف"
        : `سود تضمینی ${guaranteedProfitPct.toFixed(1)}٪ ضعیف‌تر از آستانه ۱.۵٪`;
  }

  return {
    raw: Math.round(raw * 10) / 10,
    score100,
    guaranteedProfitPct: Math.round(guaranteedProfitPct * 10) / 10,
    doubleWinProbPct: Math.round(doubleWinProbPct * 10) / 10,
    jointLossRiskPct: Math.round(jointLossRiskPct * 10) / 10,
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
 */
export function pickCrownPair(pairs: PortfolioPairDTO[], executionMode: ExecutionMode): SupervisorDecision | null {
  if (!pairs || pairs.length === 0) return null;

  const modePool = pairs.filter((p) =>
    executionMode === "SINGLE_BOOK" ? p.kind === "TWO_MATCH_MIX" : p.kind !== "TWO_MATCH_MIX"
  );
  const pool = modePool.length > 0 ? modePool : pairs;

  const scored: ScoredCandidate[] = pool.map((pair) => ({ pair, score: scorePair(pair) }));

  // برنده = بالاترین امتیاز خام میان «غیر وتو شده»؛ اگر همه وتو شدند →
  // کم‌ریسک‌ترین (بالاترین امتیاز) به‌عنوان کارت وتو شده نمایش داده می‌شود
  const clean = scored.filter((s) => !s.score.veto);
  const winner = (clean.length > 0 ? clean : scored).reduce((a, b) => (b.score.raw > a.score.raw ? b : a));

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
          ? `امتیاز پایین‌تر از برنده (${s.score.raw} در برابر ${winner.score.raw})`
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
