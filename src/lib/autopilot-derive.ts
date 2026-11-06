// ─────────────────────────────────────────────────────────────────────────────
// مشتق‌سازهای خلبان خودکار (Autopilot Derivations) — v3.0
// ساخت FlashcardView از تلاقی مناظره + پرتفوی + T-60 و حل سبد انتخابی
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import { useMemo } from "react";
import { useQuantStore } from "./store";
import type { FlashcardView } from "./autopilot-types";
import type { DebateResultDTO, LineupShockDTO, MatchDTO, PortfolioPairDTO, PortfolioResultDTO } from "./types";

/** بهترین زوج یک خروجی پرتفوی — اولویت با زوج‌های باندی دو-برد باکیفیت (محصول پرچمدار v3.0) */
export function pickBestPair(p: PortfolioResultDTO | null): PortfolioPairDTO | null {
  if (!p || !p.pairs || p.pairs.length === 0) return null;
  // ۱) زوج باندی/دو-برد با حاشیه معتبر (ناحیه طلایی روی فلش‌کارت)
  const golden = p.pairs.find((x) => x.structure.doubleWin && x.guaranteedMarginPct >= 4);
  if (golden) return golden;
  // ۲) پیشنهاد رسمی موتور
  return p.pairs.find((x) => x.id === p.recommendedId) ?? p.pairs[0];
}

/** بریدن جمله اول یک استدلال برای نمای خلاصه فلش‌کارت */
function firstSentence(text: string | null | undefined, maxLen = 130): string {
  if (!text) return "—";
  const clean = text.replace(/\s+/g, " ").trim();
  const m = clean.match(/^(.{10,160}?[.!.؟?])\s/);
  if (m) return m[1];
  return clean.length > maxLen ? `${clean.slice(0, maxLen)}…` : clean;
}

/** ساخت کارت از ورودی‌های خام */
export function buildFlashcard(
  match: MatchDTO,
  pair: PortfolioPairDTO,
  debate: DebateResultDTO | null,
  lineup: LineupShockDTO | null,
  portfolio: PortfolioResultDTO | null
): FlashcardView {
  const confidence = debate?.final?.confidence ?? Math.max(pair.selectionA.modelProb, pair.selectionB.modelProb) * 0.9;
  const margin = pair.guaranteedMarginPct;
  const bothLose = pair.jointStates.bothLose;

  let trust: FlashcardView["trust"] = { kind: "SILVER", label: "پوشش استاندارد" };
  if (margin >= 4 && bothLose <= 0.08 && confidence >= 0.72) {
    trust = { kind: "GOLD", label: "سیگنال طلایی قاضی" };
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
  };
}

/** همه فلش‌کارت‌های آماده (به ترتیب بازی‌ها) */
export function useFlashcards(): FlashcardView[] {
  const matches = useQuantStore((s) => s.matches);
  const autopilot = useQuantStore((s) => s.autopilot);
  return useMemo(() => {
    const out: FlashcardView[] = [];
    for (const m of matches) {
      const st = autopilot[m.id];
      if (!st) continue;
      const pair = pickBestPair(st.portfolio);
      if (!pair) continue;
      out.push(buildFlashcard(m, pair, st.debate, st.lineup, st.portfolio));
    }
    return out;
  }, [matches, autopilot]);
}

/** آیتم‌های سبد انتخابی — حل کلید matchId::pairId به کارت کامل */
export function useCartItems(): { key: string; view: FlashcardView; pair: PortfolioPairDTO }[] {
  const matches = useQuantStore((s) => s.matches);
  const autopilot = useQuantStore((s) => s.autopilot);
  const cart = useQuantStore((s) => s.cart);
  return useMemo(() => {
    const out: { key: string; view: FlashcardView; pair: PortfolioPairDTO }[] = [];
    for (const key of cart) {
      const [matchId, pairId] = key.split("::");
      const st = autopilot[matchId];
      const match = matches.find((m) => m.id === matchId);
      const pair = st?.portfolio?.pairs.find((p) => p.id === pairId);
      if (!st || !match || !pair) continue;
      out.push({ key, pair, view: buildFlashcard(match, pair, st.debate, st.lineup, st.portfolio) });
    }
    return out;
  }, [cart, autopilot, matches]);
}

/**
 * خروجی متنی سبد برای تلگرام / برگه‌ساز — v4.0
 * اصلاح کامل باگ کاراکترهای شکسته (ٱٱٱ): تمام رشته‌ها با متن فارسی استاندارد UTF-8
 */
export function buildTelegramText(
  items: { view: FlashcardView; stakeA: number; stakeB: number; profit: number }[],
  budget: number,
  strategyLabel: string
): string {
  const lines: string[] = [];
  lines.push("⚽ فوتبال‌کوانت v4.0 — سبد هوشمند تیپ‌های مکمل روزانه");
  lines.push(`💰 کل بودجه روزانه: ${budget} واحد | استراتژی: ${strategyLabel}`);
  lines.push("─────────────────────");
  for (const it of items) {
    const p = it.view.pair;
    lines.push(`🏆 ${it.view.match.homeTeam} مقابل ${it.view.match.awayTeam} (${it.view.match.league})`);
    lines.push(`🔹 تیپ A (ضریب ${p.totalOddsA.toFixed(2)}): ${p.labelA} ⬅️ مبلغ شرط: ${it.stakeA} واحد`);
    lines.push(`🟢 تیپ B مکمل (ضریب ${p.totalOddsB.toFixed(2)}): ${p.labelB} ⬅️ مبلغ شرط: ${it.stakeB} واحد`);
    lines.push(
      `✅ سود خالص تضمینی: +${p.guaranteedMarginPct.toFixed(1)}% | ریسک باخت همزمان: ${(p.jointStates.bothLose * 100).toFixed(1)}%`
    );
    lines.push("─────────────────────");
  }
  lines.push("⚖️ ابزار آموزشی تحلیل کمّی — مسئولیت استفاده با کاربر است.");
  return lines.join("\n");
}
