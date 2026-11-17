// ─────────────────────────────────────────────────────────────────────────────
// مشتق‌سازهای خلبان خودکار (Autopilot Derivations) — v17.0
// ساخت FlashcardView از تلاقی مناظره + پرتفوی + T-60 + مسیریاب غیرخطی Bet-Type
//
// v8.0: ایجنت سوپروایزر ارشد از میان کاندیدهای مونت‌کارلو یک «تک‌تیپ طلایی» انتخاب می‌کرد.
// v17.0: مسیریاب غیرخطی ۵ رژیمی جایگزین فیلتر خطی شد — برای هر بازی، هر ۴ روش تک‌بازی
// (Banker / Combo / Correct Score Cluster / Dual-Hedge) با تابع مطلوبیت
// «Non-Linear Sharpe & Kelly Utility» امتیاز می‌گیرند و بهترین Bet-Type منتخب می‌شود.
// 🔗 ACCUMULATORها سطح پرتفوی روز از بنکرها/کمبوهای تاییدشده ساخته می‌شوند (useAccumulators).
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import { useMemo } from "react";
import { useQuantStore } from "./store";
import type { FlashcardView } from "./autopilot-types";
import type { ActiveRuleDTO, MatchDTO, PortfolioPairDTO, PortfolioResultDTO } from "./types";
import type { BetTypeRouteResult } from "./engine/betrouter";
import { pickCrownPair, type SupervisorDecision } from "./supervisor";
import { categoryForLeagueName, patternBoostForCategory } from "./leagues-catalog";
import type { DebateResultDTO, LineupShockDTO } from "./types";
import { buildAccumulators, type AccumulatorSlip } from "./engine/betrouter";

/** بریدن جمله اول یک استدلال برای نمای خلاصه فلش‌کارت */
function firstSentence(text: string | null | undefined, maxLen = 130): string {
  if (!text) return "—";
  const clean = text.replace(/\s+/g, " ").trim();
  const m = clean.match(/^(.{10,160}?[.!.؟?])\s/);
  if (m) return m[1];
  return clean.length > maxLen ? `${clean.slice(0, maxLen)}…` : clean;
}

/** مسیریاب Bet-Type از پرتفوی بازی (v17.0) */
export function routerFor(portfolio: PortfolioResultDTO | null): BetTypeRouteResult | null {
  return portfolio?.betTypeRouter ?? null;
}

/**
 * تصمیم سوپروایزر از پرتفوی یک بازی (با در نظر گرفتن حالت اجرایی + قانون فعال لیگ
 * + v14.0: پاداش الگوی اختصاصی دسته رقابت — ملی/زنان
 * + v16.0: گیت برتری واضح فاوریت با زمینه λ بازی
 * + v17.0: گیت غیرخطی برای نمایش زوج‌تیپ — وتوی مطلق فقط از مسیریاب Bet-Type می‌آید)
 */
export function supervisorFor(
  portfolio: PortfolioResultDTO | null,
  executionMode: "DUAL_BOOK" | "SINGLE_BOOK",
  rule?: ActiveRuleDTO | null,
  leagueName?: string | null
): SupervisorDecision | null {
  if (!portfolio?.pairs?.length) return null;
  const categoryBoost = leagueName ? patternBoostForCategory(categoryForLeagueName(leagueName)) : null;
  const lambdaCtx =
    portfolio.primary?.lambdaHome && portfolio.primary?.lambdaAway
      ? {
          lambdaHome: portfolio.primary.lambdaHome,
          lambdaAway: portfolio.primary.lambdaAway,
          // v21.0 — No Blind Card Gate: خط واقعی بازار در دسترس بود؟ (λ_Market وجود دارد؟)
          hasMarketOdds:
            portfolio.primary.lambdaMarketHome != null && portfolio.primary.lambdaMarketAway != null,
        }
      : null;
  // v18.0 — زمینه رژیم منتخب مسیریاب: گیت اختصاصی همان رژیم جایگزین گیت ثابت λ می‌شود.
  // سند v18.0: رژیمِ «بالاترین شارپ» تعیین‌کننده گیت است — حتی وقتی رأی نهایی مسیریاب وتو است.
  const router = routerFor(portfolio);
  const bestSharpe = router?.candidates?.length
    ? router.candidates.reduce((a, b) => (b.sharpe > a.sharpe ? b : a))
    : null;
  const regimeCtx = bestSharpe
    ? {
        regime: bestSharpe.key,
        sharpe: bestSharpe.sharpe,
        winProb: bestSharpe.winProb,
        jointLossRiskPct: bestSharpe.jointLossProb * 100,
        tier: bestSharpe.tier,
      }
    : null;
  return pickCrownPair(portfolio.pairs, executionMode, rule, categoryBoost, lambdaCtx, regimeCtx);
}

/**
 * v17.0 — ساخت زوج نمایشی از کاندید Bet-Type غیر زوج‌تیپ (BANKER / COMBO / CORRECT_SCORE)
 * زوج نمایشی فقط برای پل زدن UI فلش‌کارت به مدل داده pair است؛
 * ریاضی استیک/ضریب از خود کاندید مسیریاب می‌آید.
 */
function pairFromCandidate(match: MatchDTO, portfolio: PortfolioResultDTO | null): PortfolioPairDTO {
  const router = routerFor(portfolio);
  const c = router?.winner;
  if (!c) throw new Error("no winner candidate");
  const joint = {
    bothWin: c.doubleWinProb,
    aOnly: Math.max(0, c.winProb - c.doubleWinProb),
    bOnly: 0,
    bothLose: c.jointLossProb,
  };
  return {
    id: `${match.id}::${c.variantId}`,
    kind: "SINGLE_MATCH_BUILDER",
    labelA: c.mainLabel,
    labelB: c.coverLabel ?? "—",
    marketAEn: c.mainLabelEn,
    marketBEn: c.coverLabelEn,
    settlementRule: "90 Minutes Regular Time Only",
    structure: {
      baseKey: "ORTHO",
      varAKey: "BTTS_Y",
      varBKey: "BTTS_N",
      varAMatchId: match.id,
      varBMatchId: match.id,
      band: null,
      synthetic: true,
      doubleWin: c.doubleWinProb > 0.02,
      // v17.0 — پاهای واقعی ماتریسی برای مینی‌مپ پوشش ۶×۶ (کلیدهای C1XU35/CBTTS25/CS_…)
      legsA: c.mainLegs,
      legsB: c.coverLegs ?? [],
    },
    selectionA: {
      key: "HOME",
      label: c.mainLabel,
      matchId: match.id,
      matchLabel: `${match.homeTeam} - ${match.awayTeam}`,
      modelProb: c.mainProb,
      bestOdds: c.mainOdds,
      bestBook: "ماتریس موتور v17",
      sharpOdds: null,
      evPct: c.ev,
    },
    selectionB: {
      key: "AWAY",
      label: c.coverLabel ?? "—",
      matchId: match.id,
      matchLabel: `${match.homeTeam} - ${match.awayTeam}`,
      modelProb: c.coverProb ?? 0,
      bestOdds: c.coverOdds ?? 1.01,
      bestBook: "ماتریس موتور v17",
      sharpOdds: null,
      evPct: 0,
    },
    totalOddsA: c.mainOdds,
    totalOddsB: c.coverOdds ?? 1.01,
    jointStates: joint,
    impliedSum: 1 / c.mainOdds + (c.coverOdds ? 1 / c.coverOdds : 0),
    guaranteedMarginPct: c.key === "DUAL_HEDGE" ? Math.round((c.effectiveOdds - 1) * 1000) / 10 : Math.round(c.guaranteedProfitUnits),
    equalProfit: { stakeA: c.stakeMain, stakeB: c.stakeCover, profit: c.guaranteedProfitUnits },
    kelly: { fA: 0, fB: 0, growth: 0 },
    sharpEdgePct: null,
    archetype: {
      code: c.key,
      name: c.labelFa,
      short: `${c.icon} ${c.labelFa}`,
      rationale: c.rationale,
      orthogonalityPct: 0,
      coveragePct: c.matrixCoveragePct / 100,
      overlapPct: 0,
    },
    trap: { verdict: "NONE", title: "—", message: "—" },
    verdict: c.rationale,
  };
}

/** ساخت کارت از ورودی‌های خام — v17.0: تیپ = استراتژی منتخب مسیریاب Bet-Type */
export function buildFlashcard(
  match: MatchDTO,
  pair: PortfolioPairDTO,
  debate: DebateResultDTO | null,
  lineup: LineupShockDTO | null,
  portfolio: PortfolioResultDTO | null,
  supervisor: SupervisorDecision | null = null
): FlashcardView {
  const router = routerFor(portfolio);
  const winner = router?.winner ?? null;
  // v17.0 — برنده زوج‌تیپ مسیریاب باید دقیقاً همان زوج نمایش‌داده‌شده روی کارت باشد
  const hedgePair = winner?.pairId ? (portfolio?.pairs.find((p) => p.id === winner.pairId) ?? null) : null;
  // اگر برنده مسیریاب زوج‌تیپ نبود، زوج نمایشی از کاندید Bet-Type ساخته می‌شود
  const effectivePair =
    hedgePair ??
    (winner && winner.key !== "DUAL_HEDGE" ? pairFromCandidate(match, portfolio) : pair);

  const confidence = debate?.final?.confidence ?? Math.max(effectivePair.selectionA.modelProb, effectivePair.selectionB.modelProb) * 0.9;
  const marginPct = effectivePair.guaranteedMarginPct;
  const bothLose = effectivePair.jointStates.bothLose;

  // v17.0 — وتوی مطلق فقط از مسیریاب غیرخطی می‌آید (گیت ۱۰.۵٪ خطی نسخه ۱۶ بازنشسته شد —
  // سند v17.0: مسابقه با ریسک ۱۱-۱۳٪ در Dual-Hedge اگر در Banker/Combo/CS درست باشد تایید می‌شود)
  // اگر پرتفوی از API نسخه v17 نیامده باشد (کش قدیمی)، به وتوی قدیمی fallback می‌کنیم.
  const routerVeto = router ? router.veto : (supervisor?.veto ?? false);
  const vetoReason = router ? router.vetoReason : (supervisor?.vetoReason ?? null);

  // ═══ v18.0 — سطح‌بندی تاج کارت (Two-Tier Crown System) ═══
  const crownTier = routerVeto ? null : ((router?.tier ?? supervisor?.score.tier ?? null) as "GOLD" | "SILVER" | null);

  let trust: FlashcardView["trust"] = { kind: "SILVER", label: "پوشش استاندارد" };
  if (!routerVeto && winner && crownTier === "SILVER") {
    trust = { kind: "SILVER", label: `🥈 تاج نقره‌ای سطح ۲ — شکارچی آلفای سایه · استیک نصف ۵۰ واحدی Half-Kelly` };
  } else if (!routerVeto && winner) {
    const sc = winner.score;
    trust =
      sc >= 60
        ? { kind: "GOLD", label: `👑 تایید سوپروایزر ${winner.icon} ${Math.round(Math.min(100, sc))}` }
        : { kind: "T60", label: `تایید سوپروایزر ${winner.icon} ${Math.round(Math.min(100, sc))}` };
  } else if (!routerVeto && supervisor && supervisor.score.score100 >= 80) {
    trust = { kind: "GOLD", label: `👑 تایید سوپروایزر ${supervisor.score.score100}/۱۰۰` };
  } else if (!routerVeto && supervisor) {
    trust = { kind: "T60", label: `تایید سوپروایزر ${supervisor.score.score100}/۱۰۰` };
  } else if (lineup?.isShock || match.lineupAnnounced) {
    trust = { kind: "T60", label: "شوک ترکیب T-60" };
  }

  return {
    key: `${match.id}::${effectivePair.id}`,
    match,
    pair: effectivePair,
    confidence,
    trust,
    lineup,
    bullLine: firstSentence(debate?.bull?.thesis ?? null),
    bearLine: firstSentence(debate?.bear?.thesis ?? null),
    judgeLine: firstSentence(debate?.judge?.thesis ?? null),
    lambdaHome: portfolio?.primary?.lambdaHome ?? 1.35,
    lambdaAway: portfolio?.primary?.lambdaAway ?? 1.25,
    lambdaMarketHome: portfolio?.primary?.lambdaMarketHome ?? null,
    lambdaMarketAway: portfolio?.primary?.lambdaMarketAway ?? null,
    lambdaStatsHome: portfolio?.primary?.lambdaStatsHome ?? portfolio?.primary?.lambdaHome ?? 1.35,
    lambdaStatsAway: portfolio?.primary?.lambdaStatsAway ?? portfolio?.primary?.lambdaAway ?? 1.25,
    lambdaFitError: portfolio?.primary?.lambdaFitError ?? null,
    calibrationRule: portfolio?.calibrationRule ?? [],
    isArchetype: Boolean(effectivePair.archetype),
    supervisor: supervisor
      ? {
          raw: supervisor.score.raw,
          score100: supervisor.score.score100,
          veto: routerVeto,
          vetoReason,
          guaranteedProfitPct: supervisor.score.guaranteedProfitPct,
          coveragePct: supervisor.score.coveragePct,
          doubleWinProbPct: supervisor.score.doubleWinProbPct,
          jointLossRiskPct: supervisor.score.jointLossRiskPct,
          fortress: supervisor.score.fortress,
          executionMode: supervisor.executionMode,
          rejected: supervisor.rejected,
        }
      : null,
    betType: winner
      ? {
          ...winner,
          entropy: router?.structure.entropy ?? 0,
          rLambda: router?.structure.rLambda ?? 1,
          top4Sum: router?.structure.top4Sum ?? 0,
        }
      : null,
    routerVeto,
    crownTier,
  };
}

/** همه فلش‌کارت‌های آماده — هر بازی با «استراتژی منتخب سوپروایزر (Bet-Type برنده غیرخطی)»
 *  v18.0 — سوییچ تاج نقره‌ای: وقتی shadowHarvestOn خاموش باشد، کارت‌های سطح ۲ (نقره‌ای)
 *  از دک حذف می‌شوند و فقط تاج‌های طلایی سطح ۱ نمایش داده می‌شوند. */
export function useFlashcards(): FlashcardView[] {
  const matches = useQuantStore((s) => s.matches);
  const autopilot = useQuantStore((s) => s.autopilot);
  const executionMode = useQuantStore((s) => s.config.executionMode);
  const activeRules = useQuantStore((s) => s.activeRules);
  const shadowHarvestOn = useQuantStore((s) => s.config.shadowHarvestOn);
  return useMemo(() => {
    const out: FlashcardView[] = [];
    for (const m of matches) {
      const st = autopilot[m.id];
      if (!st?.portfolio?.pairs?.length) continue;
      const sup = supervisorFor(st.portfolio, executionMode, activeRules.find((r) => r.league === m.league) ?? null, m.league);
      if (!sup) continue;
      const card = buildFlashcard(m, sup.crown, st.debate, st.lineup, st.portfolio, sup);
      // v18.0 — فیلتر تاج نقره‌ای: خاموشی سوییچ = فقط تاج‌های طلایی
      if (!shadowHarvestOn && card.crownTier === "SILVER") continue;
      out.push(card);
    }
    return out;
  }, [matches, autopilot, executionMode, activeRules, shadowHarvestOn]);
}

/** آمار کارایی سوپروایزر برای ویجت هیرو (تایید / وتو) — v17.0 با گیت غیرخطی */
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
      const sup = supervisorFor(st.portfolio, executionMode, activeRules.find((r) => r.league === m.league) ?? null, m.league);
      if (!sup) continue;
      const router = routerFor(st.portfolio);
      if (router ? router.veto : sup.veto) vetoed += 1;
      else approved += 1;
    }
    return { scanned: matches.length, approved, vetoed };
  }, [matches, autopilot, executionMode, activeRules]);
}

/** آیتم‌های سبد انتخابی — حل کلید از فلش‌کارت‌های کامل (v17.0: سازگار با کارت‌های Bet-Type) */
export function useCartItems(): { key: string; view: FlashcardView; pair: PortfolioPairDTO }[] {
  const cart = useQuantStore((s) => s.cart);
  const cards = useFlashcards();
  return useMemo(() => {
    const out: { key: string; view: FlashcardView; pair: PortfolioPairDTO }[] = [];
    for (const key of cart) {
      const c = cards.find((x) => x.key === key);
      if (c) out.push({ key, pair: c.pair, view: c });
    }
    return out;
  }, [cart, cards]);
}

/**
 * v17.0 — 🔗 سازنده آکومولاتورهای روز از بنکرها/کمبوهای تاییدشده:
 *  ۱) 2-Fold Banker Accumulator  ۲) 3-Fold Pro Combo Accumulator
 *  ۳) Time-Staggered Hedged Accumulator (با فرمول پوشش زنده پای آخر)
 */
export function useAccumulators(): AccumulatorSlip[] {
  const cards = useFlashcards();
  return useMemo(() => {
    const approved = cards
      .filter((c) => !c.routerVeto && c.betType)
      .sort((a, b) => (b.betType!.score ?? 0) - (a.betType!.score ?? 0));
    // سند v17.0: پایه‌های Accumulator از بنکرها/کمبوهای تاییدشده؛ اگر امروز پایه‌ای
    // وجود نداشت، قوی‌ترین استراتژی‌های منتخب تاییدشده هر Bet-Type به‌عنوان پایه به کار می‌روند
    const preferred = approved.filter((c) => c.betType!.key === "BANKER" || c.betType!.key === "COMBO");
    const winners = (preferred.length >= 2 ? preferred : approved).slice(0, 6).map((c) => ({
      matchId: c.match.id,
      matchLabel: `${c.match.homeTeam} - ${c.match.awayTeam}`,
      league: c.match.league,
      kickoff: c.match.kickoff,
      candidate: c.betType!,
    }));
    return buildAccumulators(winners);
  }, [cards]);
}

/** خروجی متنی سبد برای تلگرام / برگه‌ساز — v17.0 Bet-Type Router Edition */
export function buildTelegramText(
  items: { view: FlashcardView; stakeA: number; stakeB: number; profit: number }[],
  budget: number,
  strategyLabel: string
): string {
  const lines: string[] = [];
  lines.push("⚽ فوتبال‌کوانت v17.0 Bet-Type Router — سبد استراتژی‌های منتخب سوپروایزر");
  lines.push(`💰 کل بودجه روزانه: ${budget} واحد | استراتژی: ${strategyLabel}`);
  lines.push("─────────────────────");
  for (const it of items) {
    const p = it.view.pair;
    const bt = it.view.betType;
    lines.push(`🏆 ${it.view.match.homeTeam} مقابل ${it.view.match.awayTeam} (${it.view.match.league})`);
    if (bt) {
      lines.push(`${bt.icon} استراتژی منتخب سوپروایزر: ${bt.labelFa} — امتیاز غیرخطی ${Math.round(bt.score)}`);
      lines.push(`📊 آنتروپی ماتریس: ${bt.entropy.toFixed(2)} | عدم تقارن قدرت Rλ: ${bt.rLambda.toFixed(2)} | شارپ: ${bt.sharpe.toFixed(2)}`);
    }
    if (bt?.key === "BANKER") {
      lines.push(`🏦 تیپ امن (ضریب ${p.totalOddsA.toFixed(2)}): ${p.labelA} ⬅️ استیک: ${it.stakeA} واحد`);
    } else if (bt?.cluster) {
      lines.push(`🎯 خوشه نتیجه دقیق (ضریب موثر ${bt.effectiveOdds.toFixed(2)}x):`);
      for (const c of bt.cluster) {
        lines.push(`   ${c.score} @ ${c.odds.toFixed(2)}x ⬅️ استیک ${c.stake} واحد | سود در صورت وقوع: +${c.profit} واحد`);
      }
    } else {
      lines.push(`🔹 تیپ A (ضریب ${p.totalOddsA.toFixed(2)}): ${p.labelA} ⬅️ مبلغ شرط: ${it.stakeA} واحد`);
      lines.push(`🟢 تیپ B مکمل (ضریب ${p.totalOddsB.toFixed(2)}): ${p.labelB} ⬅️ مبلغ شرط: ${it.stakeB} واحد`);
    }
    lines.push(
      `✅ پوشش سناریوها: ${bt ? bt.matrixCoveragePct.toFixed(0) : ((1 - p.jointStates.bothLose) * 100).toFixed(0)}٪ | ریسک باخت: ${((bt?.jointLossProb ?? p.jointStates.bothLose) * 100).toFixed(1)}%`
    );
    lines.push("─────────────────────");
  }
  lines.push("⚖️ ابزار آموزشی تحلیل کمّی — مسئولیت استفاده با کاربر است.");
  return lines.join("\n");
}
