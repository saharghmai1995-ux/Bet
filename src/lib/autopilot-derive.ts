// ─────────────────────────────────────────────────────────────────────────────
// مشتق‌سازهای خلبان خودکار (Autopilot Derivations) — v8.0
// ساخت FlashcardView از تلاقی مناظره + پرتفوی + T-60 + ایجنت سوپروایزر ارشد
// v8.0: به‌جای نمایش ۵ الگو و سردرگمی کاربر، «ایجنت سوپروایزر ارشد» از میان
// کاندیدهای مونت‌کارلو تنها یک «تک‌تیپ طلایی» برای هر بازی انتخاب می‌کند.
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import { useMemo } from "react";
import { useQuantStore } from "./store";
import type { FlashcardView } from "./autopilot-types";
import type { ActiveRuleDTO } from "./types";
import { pickCrownPair, type SupervisorDecision } from "./supervisor";
import type { DebateResultDTO, LineupShockDTO, MatchDTO, PortfolioPairDTO, PortfolioResultDTO } from "./types";

/** بریدن جمله اول یک استدلال برای نمای خلاصه فلش‌کارت */
function firstSentence(text: string | null | undefined, maxLen = 130): string {
  if (!text) return "—";
  const clean = text.replace(/\s+/g, " ").trim();
  const m = clean.match(/^(.{10,160}?[.!.؟?])\s/);
  if (m) return m[1];
  return clean.length > maxLen ? `${clean.slice(0, maxLen)}…` : clean;
}

/** تصمیم سوپروایزر از پرتفوی یک بازی (با در نظر گرفتن حالت اجرایی + قانون فعال لیگ) */
export function supervisorFor(
  portfolio: PortfolioResultDTO | null,
  executionMode: "DUAL_BOOK" | "SINGLE_BOOK",
  rule?: ActiveRuleDTO | null
): SupervisorDecision | null {
  if (!portfolio?.pairs?.length) return null;
  return pickCrownPair(portfolio.pairs, executionMode, rule);
}

/** ساخت کارت از ورودی‌های خام — زوج = تک‌تیپ طلایی سوپروایزر */
export function buildFlashcard(
  match: MatchDTO,
  pair: PortfolioPairDTO,
  debate: DebateResultDTO | null,
  lineup: LineupShockDTO | null,
  portfolio: PortfolioResultDTO | null,
  supervisor: SupervisorDecision | null = null
): FlashcardView {
  const confidence = debate?.final?.confidence ?? Math.max(pair.selectionA.modelProb, pair.selectionB.modelProb) * 0.9;
  const margin = pair.guaranteedMarginPct;
  const bothLose = pair.jointStates.bothLose;

  let trust: FlashcardView["trust"] = { kind: "SILVER", label: "پوشش استاندارد" };
  if (supervisor && !supervisor.veto && supervisor.score.score100 >= 80) {
    trust = { kind: "GOLD", label: `👑 تایید سوپروایزر ${supervisor.score.score100}/۱۰۰` };
  } else if (supervisor && !supervisor.veto) {
    trust = { kind: "T60", label: `تایید سوپروایزر ${supervisor.score.score100}/۱۰۰` };
  } else if (lineup?.isShock || match.lineupAnnounced) {
    trust = { kind: "T60", label: "شوک ترکیب T-60" };
  }

  return {
    key: `${match.id}::${pair.id}`,
    match,
    pair,
    confidence,
    trust,
    lineup,
    bullLine: firstSentence(debate?.bull?.thesis ?? null),
    bearLine: firstSentence(debate?.bear?.thesis ?? null),
    judgeLine: firstSentence(debate?.judge?.thesis ?? null),
    lambdaHome: portfolio?.primary?.lambdaHome ?? 1.35,
    lambdaAway: portfolio?.primary?.lambdaAway ?? 1.25,
    // ─── v9.0 — شفافیت کامل λ + درس کالیبراسیون اعمال‌شده ───
    lambdaMarketHome: portfolio?.primary?.lambdaMarketHome ?? null,
    lambdaMarketAway: portfolio?.primary?.lambdaMarketAway ?? null,
    lambdaStatsHome: portfolio?.primary?.lambdaStatsHome ?? portfolio?.primary?.lambdaHome ?? 1.35,
    lambdaStatsAway: portfolio?.primary?.lambdaStatsAway ?? portfolio?.primary?.lambdaAway ?? 1.25,
    lambdaFitError: portfolio?.primary?.lambdaFitError ?? null,
    calibrationRule: portfolio?.calibrationRule ?? [],
    isArchetype: Boolean(pair.archetype),
    supervisor: supervisor
      ? {
          raw: supervisor.score.raw,
          score100: supervisor.score.score100,
          veto: supervisor.veto,
          vetoReason: supervisor.vetoReason,
          guaranteedProfitPct: supervisor.score.guaranteedProfitPct,
          coveragePct: supervisor.score.coveragePct,
          doubleWinProbPct: supervisor.score.doubleWinProbPct,
          jointLossRiskPct: supervisor.score.jointLossRiskPct,
          fortress: supervisor.score.fortress,
          executionMode: supervisor.executionMode,
          rejected: supervisor.rejected,
        }
      : null,
  };
}

/** همه فلش‌کارت‌های آماده — هر بازی فقط و فقط با «تک‌تیپ طلایی سوپروایزر» */
export function useFlashcards(): FlashcardView[] {
  const matches = useQuantStore((s) => s.matches);
  const autopilot = useQuantStore((s) => s.autopilot);
  const executionMode = useQuantStore((s) => s.config.executionMode);
  const activeRules = useQuantStore((s) => s.activeRules);
  return useMemo(() => {
    const out: FlashcardView[] = [];
    for (const m of matches) {
      const st = autopilot[m.id];
      if (!st?.portfolio?.pairs?.length) continue;
      const sup = supervisorFor(st.portfolio, executionMode, activeRules.find((r) => r.league === m.league) ?? null);
      if (!sup) continue;
      out.push(buildFlashcard(m, sup.crown, st.debate, st.lineup, st.portfolio, sup));
    }
    return out;
  }, [matches, autopilot, executionMode, activeRules]);
}

/** آمار کارایی سوپروایزر برای ویجت هیرو (تایید / وتو) */
export function useSupervisorStats(): { scanned: number; approved: number; vetoed: number } {
  const matches = useQuantStore((s) => s.matches);
  const autopilot = useQuantStore((s) => s.autopilot);
  const executionMode = useQuantStore((s) => s.config.executionMode);
  const activeRules = useQuantStore((s) => s.activeRules);
  return useMemo(() => {
    let approved = 0;
    let vetoed = 0;
    for (const m of matches) {
      const st = autopilot[m.id];
      if (!st?.portfolio?.pairs?.length) continue;
      const sup = supervisorFor(st.portfolio, executionMode, activeRules.find((r) => r.league === m.league) ?? null);
      if (!sup) continue;
      if (sup.veto) vetoed += 1;
      else approved += 1;
    }
    return { scanned: matches.length, approved, vetoed };
  }, [matches, autopilot, executionMode, activeRules]);
}

/** آیتم‌های سبد انتخابی — حل کلید matchId::pairId به کارت کامل */
export function useCartItems(): { key: string; view: FlashcardView; pair: PortfolioPairDTO }[] {
  const matches = useQuantStore((s) => s.matches);
  const autopilot = useQuantStore((s) => s.autopilot);
  const executionMode = useQuantStore((s) => s.config.executionMode);
  const activeRules = useQuantStore((s) => s.activeRules);
  const cart = useQuantStore((s) => s.cart);
  return useMemo(() => {
    const out: { key: string; view: FlashcardView; pair: PortfolioPairDTO }[] = [];
    for (const key of cart) {
      const [matchId, pairId] = key.split("::");
      const st = autopilot[matchId];
      const match = matches.find((m) => m.id === matchId);
      const pair = st?.portfolio?.pairs.find((p) => p.id === pairId);
      if (!st || !match || !pair) continue;
      const sup = supervisorFor(st.portfolio, executionMode, activeRules.find((r) => r.league === match.league) ?? null);
      out.push({ key, pair, view: buildFlashcard(match, pair, st.debate, st.lineup, st.portfolio, sup) });
    }
    return out;
  }, [cart, autopilot, matches, executionMode, activeRules]);
}

/** خروجی متنی سبد برای تلگرام / برگه‌ساز — v9.0 */
export function buildTelegramText(
  items: { view: FlashcardView; stakeA: number; stakeB: number; profit: number }[],
  budget: number,
  strategyLabel: string
): string {
  const lines: string[] = [];
  lines.push("⚽ فوتبال‌کوانت v9.0 Supervisor Quant — سبد تک‌تیپ‌های طلایی مونت‌کارلو");
  lines.push(`💰 کل بودجه روزانه: ${budget} واحد | استراتژی: ${strategyLabel}`);
  lines.push("─────────────────────");
  for (const it of items) {
    const p = it.view.pair;
    lines.push(`🏆 ${it.view.match.homeTeam} مقابل ${it.view.match.awayTeam} (${it.view.match.league})`);
    if (p.archetype) lines.push(`👑 تک‌تیپ تاییدشده سوپروایزر: ${p.archetype.short}${it.view.supervisor ? ` — امتیاز ${it.view.supervisor.score100}/۱۰۰` : ""}`);
    lines.push(`🔹 تیپ A (ضریب ${p.totalOddsA.toFixed(2)}): ${p.labelA} ⬅️ مبلغ شرط: ${it.stakeA} واحد`);
    lines.push(`🟢 تیپ B مکمل (ضریب ${p.totalOddsB.toFixed(2)}): ${p.labelB} ⬅️ مبلغ شرط: ${it.stakeB} واحد`);
    lines.push(
      `✅ پوشش سناریوها: ${(it.view.pair.archetype ? it.view.pair.archetype.coveragePct * 100 : (1 - p.jointStates.bothLose) * 100).toFixed(0)}٪ | ریسک باخت همزمان: ${(p.jointStates.bothLose * 100).toFixed(1)}%`
    );
    lines.push("─────────────────────");
  }
  lines.push("⚖️ ابزار آموزشی تحلیل کمّی — مسئولیت استفاده با کاربر است.");
  return lines.join("\n");
}
