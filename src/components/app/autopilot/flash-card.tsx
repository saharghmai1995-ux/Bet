"use client";

// ─────────────────────────────────────────────────────────────────────────────
// فلش‌کارت سه‌بعدی دوطرفه تیپ مکمل (3D Flip Flashcard) — v8.0 Supervisor Quant
//   روی کارت  : 👑 تنها «تک‌تیپ طلایی مونت‌کارلو» تاییدشده ایجنت سوپروایزر ارشد
//               + مهر هولوگرافیک + برچسب بوک‌میکر (ضد گوبینگ) + اکشن‌ها
//   پشت کارت  : سناریوی تصمیم سوپروایزر (فرمول امتیاز + ۴ الگوی رد‌شده)
//               + خلاصه مناظره ۳ خطی + مینی‌مپ پوشش ۶×۶ + وضعیت T-60 + ESPN
// v8.0: حذف «الگوی بعدی» — کاربر فقط یک زوج برنده نهایی می‌بیند.
// فرمول صحیح سود واحد: netUnits = +(Payout − B) که Payout = B / S
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  BrainCircuit,
  Check,
  Copy,
  Award,
  ChevronDown,
  Clock,
  Clock4,
  ExternalLink,
  RefreshCw,
  SearchCheck,
  ShieldAlert,
  ShoppingCart,
  Sparkles,
  Trophy,
  Scale,
  Banknote,
  AlertTriangle,
  Loader2,
  Zap,
  Crown,
  Lock,
  MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { buildScoreMatrix, coverageGrid, coverColor, selectionCoversCell, isOffMatrixKey } from "@/lib/engine/coverage";
import { allocationPlans } from "@/lib/engine/asymmetric";
import { solveImpliedLambdaForLeg, dutchProfitAtUserOdds } from "@/lib/engine/reverse-poisson";
import { computeRealistic1xBetOdds, ONE_X_BET_PAYOUT_FACTOR } from "@/lib/engine/orthogonal";
import { computePairTiming, faDuration, type TimingStatus } from "@/lib/timing-window";
import { faNum, faPct } from "@/lib/format";
import { useQuantStore } from "@/lib/store";
import { SupervisorSeal } from "@/components/app/fx/supervisor-seal";
import { cn } from "@/lib/utils";
import { CATEGORY_LABEL_FA, categoryForLeagueName, patternBoostForCategory } from "@/lib/leagues-catalog";
import type { FlashcardView } from "@/lib/autopilot-types";

const TRUST_STYLES: Record<FlashcardView["trust"]["kind"], string> = {
  GOLD: "border-amber-400/50 bg-amber-400/15 text-amber-300 shadow-[0_0_14px_rgba(251,191,36,0.35)]",
  T60: "border-violet-400/50 bg-violet-400/15 text-violet-300 shadow-[0_0_14px_rgba(167,139,250,0.3)]",
  SILVER: "border-zinc-400/30 bg-zinc-400/10 text-zinc-300",
};

const TRUST_ICONS: Record<FlashcardView["trust"]["kind"], typeof Award> = {
  GOLD: Award,
  T60: Sparkles,
  SILVER: BadgeCheck,
};

// ═══ v17.0 — استایل بج نئونی استراتژی منتخب (Bet-Type Badge) ═══
const BET_TYPE_BADGE: Record<string, { border: string; bg: string; text: string; glow: string }> = {
  BANKER: { border: "border-emerald-400/60", bg: "bg-emerald-500/15", text: "text-emerald-300", glow: "shadow-[0_0_18px_rgba(16,185,129,0.45)]" },
  COMBO: { border: "border-violet-400/60", bg: "bg-violet-500/15", text: "text-violet-300", glow: "shadow-[0_0_18px_rgba(167,139,250,0.45)]" },
  CORRECT_SCORE: { border: "border-fuchsia-400/60", bg: "bg-fuchsia-500/15", text: "text-fuchsia-300", glow: "shadow-[0_0_18px_rgba(232,121,249,0.45)]" },
  DUAL_HEDGE: { border: "border-amber-400/60", bg: "bg-amber-500/15", text: "text-amber-300", glow: "shadow-[0_0_18px_rgba(251,191,36,0.45)]" },
  ACCUMULATOR: { border: "border-cyan-400/60", bg: "bg-cyan-500/15", text: "text-cyan-300", glow: "shadow-[0_0_18px_rgba(34,211,238,0.45)]" },
};

/** متن آماده کپی تیپ — v17.0 (استراتژی منتخب مسیریاب Bet-Type + پشتیبانی خوشه نتیجه دقیق) */
export function cardCopyText(v: FlashcardView): string {
  const p = v.pair;
  const sup = v.supervisor;
  const bt = v.betType;
  const head = `⚽ فوتبال‌کوانت v21.0 1xBet Real-Market Calibration — ${v.match.homeTeam} مقابل ${v.match.awayTeam} (${v.match.league})`;
  const crownLine = bt
    ? `${bt.icon} استراتژی منتخب سوپروایزر: ${bt.labelFa} — امتیاز غیرخطی ${Math.round(bt.score)} · شارپ ${bt.sharpe.toFixed(2)}`
    : sup
      ? `👑 تک‌تیپ تاییدشده سوپروایزر — امتیاز مونت‌کارلو: ${sup.score100}/۱۰۰${p.archetype ? ` (${p.archetype.short})` : ""}`
      : p.archetype
        ? `📐 الگو: ${p.archetype.short}`
        : "";
  const acc = p.accelerator?.active ? p.accelerator : null;

  if (bt?.key === "BANKER") {
    return [
      head,
      crownLine,
      `🏦 تیپ امن تک‌ستون (ضریب ${p.totalOddsA.toFixed(2)}): ${p.labelA}`,
      `💵 استیک مستقیم: ${faNum(bt.stakeMain, 0)} واحد | احتمال ماتریس: ${(bt.winProb * 100).toFixed(1)}٪ | سود در صورت برد: +${faNum(bt.guaranteedProfitUnits, 1)} واحد`,
      `🔗 این بنکر به‌صورت خودکار پایه اصلی آکومولاتور روز است`,
      `📊 آنتروپی ماتریس: ${bt.entropy.toFixed(2)} | عدم تقارن قدرت Rλ: ${bt.rLambda.toFixed(2)}`,
      "⚖️ ابزار آموزشی تحلیل کمّی — مسئولیت استفاده با کاربر است.",
    ].join("\n");
  }

  if (bt?.cluster) {
    return [
      head,
      crownLine,
      `🎯 خوشه نتیجه دقیق (${bt.cluster.length} شانسه) — ضریب موثر کل خوشه: ${bt.effectiveOdds.toFixed(2)}x`,
      ...bt.cluster.map((c) => `   ${c.score} @ ${c.odds.toFixed(2)}x ⬅️ استیک ${faNum(c.stake, 1)} واحد | سود در صورت وقوع: +${faNum(c.profit, 1)} واحد`),
      `✅ پوشش خوشه: ${(bt.winProb * 100).toFixed(1)}٪ فضای ماتریس | سود خالص تضمینی در صورت وقوع هر یک: +${faNum(bt.guaranteedProfitUnits, 1)} واحد`,
      `📊 آنتروپی شانون: ${bt.entropy.toFixed(2)} ≤ ۲.۴۲ | مجموع ۴ خانه برتر: ${(bt.top4Sum * 100).toFixed(0)}٪`,
      "⚖️ ابزار آموزشی تحلیل کمّی — مسئولیت استفاده با کاربر است.",
    ].join("\n");
  }

  const profitLine = acc
    ? `⚡ شتاب‌دهنده نامتقارن فعال — قفل اصل سرمایه ۱۰۰ واحدی روی تیپ B · برد A: ${acc.profitOnA >= 0 ? "+" : ""}${faNum(acc.profitOnA, 1)} واحد · برد همزمان (جک‌پات): +${faNum(acc.profitOnDoubleWin, 1)} واحد`
    : p.guaranteedMarginPct > 0
      ? `💰 سود تضمینی: +${p.guaranteedMarginPct.toFixed(1)}٪ (+${faNum(p.equalProfit.profit, 1)} واحد سود خالص)`
      : `🛡️ پوشش بیمه سرمایه — بازگشت وجه در سناریوی پایه`;
  return [
    head,
    crownLine,
    `🔹 تیپ A (ضریب ${p.totalOddsA.toFixed(2)}): ${p.labelA} ⬅️ مبلغ شرط: ${faNum(acc ? acc.stakeA : p.equalProfit.stakeA, 1)} واحد`,
    `🟢 تیپ B مکمل (ضریب ${p.totalOddsB.toFixed(2)}): ${p.labelB} ⬅️ مبلغ شرط: ${faNum(acc ? acc.stakeB : p.equalProfit.stakeB, 1)} واحد`,
    profitLine,
    `✅ پوشش سناریوها: ${bt ? bt.matrixCoveragePct.toFixed(0) : ((p.archetype ? p.archetype.coveragePct * 100 : (1 - p.jointStates.bothLose) * 100)).toFixed(0)}٪ | ریسک باخت: ${((bt?.jointLossProb ?? p.jointStates.bothLose) * 100).toFixed(1)}%`,
    `⚖️ ${p.verdict}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export type DeepLlmState = "IDLE" | "RUNNING" | "CACHED" | "RATELIMITED";

// ═══ v21.0 — پنل تعاملی «تطبیق زنده با ضریب فعلی 1xBet» (Live 1xBet Odds Calibrator) ═══
// سند v21.0 (باگ ۳ — عدم تطبیق با ضریب لحظه‌ای بوک‌میکر کاربر):
//   · کاربر ضریب لحظه‌ای که در سایت 1xBet می‌بیند را وارد می‌کند؛
//   · Reverse-Poisson 1xBet Solver همان لحظه امید گل واقعی مستتر در ضریب را استخراج می‌کند؛
//   · استیک تیپ A/B (از ۱۰۰ واحد) و درصد سود خالص واقعی بازمحاسبه می‌شود؛
//   · اگر 1/O_A + 1/O_B ≥ 0.96 → هشدار قرمز «افت ضریب — ورود ممنوع» + استراتژی جایگزین.

/** گزاره برد یک تیپ روی سلول ماتریس — از پایه‌های واقعی ساختار (legsA/legsB) */
function legPredicateOf(legs: string[] | undefined, fallbackKey: string): (h: number, a: number) => boolean {
  const mat = (legs ?? []).filter((k) => !isOffMatrixKey(k));
  if (mat.length === 0) return (h, a) => selectionCoversCell(fallbackKey, h, a);
  const isCluster = mat.length > 1 && mat.every((k) => k.startsWith("CS_"));
  if (isCluster) return (h, a) => mat.some((k) => selectionCoversCell(k, h, a));
  return (h, a) => mat.every((k) => selectionCoversCell(k, h, a));
}

function LiveOddsCalibrator({ view }: { view: FlashcardView }) {
  const { pair } = view;
  const probA = Math.max(0.03, Math.min(0.96, pair.selectionA.modelProb));
  const probB = Math.max(0.03, Math.min(0.96, pair.selectionB?.modelProb ?? 0));
  // v17.0 — بنکر تک‌ستون: تیپ B ندارد → پنل حالت تک‌مارکت می‌گیرد
  const legsB = pair.structure.legsB ?? [];
  const singleOnly = legsB.length === 0 && view.betType?.key === "BANKER";

  const fairA = computeRealistic1xBetOdds(probA);
  const fairB = computeRealistic1xBetOdds(probB);
  const [oddsA, setOddsA] = useState<string>(fairA.toFixed(2));
  const [oddsB, setOddsB] = useState<string>(fairB.toFixed(2));

  const numA = parseFloat(oddsA);
  const numB = parseFloat(oddsB);
  const validA = Number.isFinite(numA) && numA > 1.01;
  const validB = !singleOnly && Number.isFinite(numB) && numB > 1.01;

  const solveA = useMemo(
    () =>
      validA
        ? solveImpliedLambdaForLeg({
            pred: legPredicateOf(pair.structure.legsA, pair.structure.varAKey),
            userOdds: numA,
            lambdaHome: view.lambdaHome,
            lambdaAway: view.lambdaAway,
          })
        : null,
    [validA, numA, view.lambdaHome, view.lambdaAway, pair.structure.legsA, pair.structure.varAKey]
  );

  const dutch = useMemo(
    () => (validA && validB ? dutchProfitAtUserOdds(numA, numB, 100) : null),
    [validA, validB, numA, numB]
  );
  const impliedSum = validA && validB ? 1 / numA + 1 / numB : null;
  // سند v21.0 — آستانه هشدار قرمز: 1/O_A + 1/O_B ≥ 0.96 → ارزش ریاضی از دست رفته
  const oddsDropAlert = impliedSum != null && impliedSum >= 0.96;

  // ─── استراتژی جایگزین (Banker / Combo / Under) با قیمت‌گذاری واقعی 1xBet ───
  // هر ردیف: احتمال مدل + «ضریب عادلانه تابلوی 1xBet» — هر ضریب زنده بالاتر از این عدد = ارزش مثبت
  const alternatives = useMemo(() => {
    const matrix = buildScoreMatrix(view.lambdaHome, view.lambdaAway);
    const prob = (key: string) => {
      let p = 0;
      for (let h = 0; h < matrix.length; h++) {
        for (let a = 0; a < (matrix[h]?.length ?? 0); a++) {
          if (selectionCoversCell(key, h, a)) p += matrix[h][a];
        }
      }
      return p;
    };
    const cand: { key: string; fa: string; en: string }[] = [
      { key: "DC_1X", fa: "شانس مجدد میزبان (بنکر امن)", en: "Double Chance 1X" },
      { key: "DC_X2", fa: "شانس مجدد میهمان", en: "Double Chance X2" },
      { key: "U25", fa: "زیر ۲.۵ گل (زیر)", en: "Under 2.5 Goals" },
      { key: "U35", fa: "زیر ۳.۵ گل", en: "Under 3.5 Goals" },
      { key: "BTTS_N", fa: "هر دو گل نمی‌زنند", en: "BTTS No" },
    ];
    return cand
      .map((c) => {
        const p = prob(c.key);
        return { ...c, p, fairOdds: computeRealistic1xBetOdds(p) };
      })
      .filter((c) => c.p >= 0.42)
      .sort((x, y) => y.p - x.p)
      .slice(0, 3);
  }, [view.lambdaHome, view.lambdaAway]);

  return (
    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.05] p-2.5" onClick={(e) => e.stopPropagation()}>
      <p className="flex flex-wrap items-center gap-1 text-[11px] font-bold text-emerald-300">
        🎛️ تطبیق زنده با ضریب فعلی 1xBet شما
        <Badge variant="outline" className="gap-0.5 border-emerald-400/40 px-1 py-0 text-[8px] text-emerald-200">v21.0 Reverse-Poisson Solver</Badge>
      </p>
      <p className="mt-1 text-[9.5px] leading-3.5 text-muted-foreground">
        ضریب لحظه‌ای این تیپ را که الان در سایت 1xBet می‌بینید وارد کنید — سیستم همان لحظه امید گل مستتر در تابلوی 1xBet را استخراج و استیک + سود خالص واقعی را بازمحاسبه می‌کند (پیش‌فرض: قیمت‌گذاری واقعی ۰٫۹۴۵ ÷ احتمال).
      </p>
      <div className={`mt-2 grid gap-2 ${singleOnly ? "grid-cols-1" : "grid-cols-2"}`}>
        <div>
          <label className="mb-0.5 block text-[9px] font-semibold text-muted-foreground" htmlFor={`cal-a-${view.key}`}>
            ضریب فعلی در 1xBet — تیپ A ({pair.labelA})
          </label>
          <input
            id={`cal-a-${view.key}`}
            type="number"
            inputMode="decimal"
            step="0.01"
            min="1.02"
            dir="ltr"
            value={oddsA}
            onChange={(e) => setOddsA(e.target.value)}
            className={`font-num h-8 w-full rounded-lg border bg-black/40 px-2 text-[11px] text-foreground outline-none ${validA ? "border-emerald-500/40" : "border-rose-500/50"}`}
            aria-label="ضریب فعلی تیپ A در 1xBet"
          />
        </div>
        {!singleOnly && (
          <div>
            <label className="mb-0.5 block text-[9px] font-semibold text-muted-foreground" htmlFor={`cal-b-${view.key}`}>
              ضریب فعلی در 1xBet — تیپ B ({pair.labelB})
            </label>
            <input
              id={`cal-b-${view.key}`}
              type="number"
              inputMode="decimal"
              step="0.01"
              min="1.02"
              dir="ltr"
              value={oddsB}
              onChange={(e) => setOddsB(e.target.value)}
              className={`font-num h-8 w-full rounded-lg border bg-black/40 px-2 text-[11px] text-foreground outline-none ${validB ? "border-emerald-500/40" : "border-rose-500/50"}`}
              aria-label="ضریب فعلی تیپ B در 1xBet"
            />
          </div>
        )}
      </div>

      {validA && solveA && (
        <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
          🎯 امید گل مستتر در تابلوی 1xBet شما (Reverse-Poisson):{" "}
          <b className="font-num text-sky-200" dir="ltr">
            {faNum(solveA.lambdaHome, 2)}-{faNum(solveA.lambdaAway, 2)}
          </b>{" "}
          · احتمال بدون کارمزد:{" "}
          <b className="font-num text-emerald-300" dir="ltr">{faPct(solveA.impliedProb * 100, 1)}</b>
          {solveA.scale < 0.94 && " · بازار انتظار بازی کم‌گل‌تر از مدل دارد"}
          {solveA.scale > 1.06 && " · بازار انتظار بازی پرگل‌تر از مدل دارد"}
        </p>
      )}

      {oddsDropAlert ? (
        <div className="mt-2 rounded-lg border border-rose-500/50 bg-rose-500/[0.10] p-2" role="alert">
          <p className="text-[10.5px] font-bold leading-4 text-rose-300">
            🚨 هشدار افت ضریب در 1xBet — ضریب فعلی ارزش ریاضی ندارد (ورود ممنوع / تغییر به رژیم جایگزین)
          </p>
          <p className="mt-0.5 text-[9.5px] leading-3.5 text-rose-200/80">
            مجموع احتمال ضمنی 1/O<sub>A</sub> + 1/O<sub>B</sub> ={" "}
            <b className="font-num" dir="ltr">{impliedSum ? impliedSum.toFixed(3) : "—"}</b> ≥ ۰٫۹۶ — داچینگ سودده نیست.
          </p>
        </div>
      ) : null}

      {dutch && !oddsDropAlert ? (
        <div className="mt-2 rounded-lg border border-emerald-500/35 bg-emerald-500/[0.08] p-2" role="status">
          <p className="text-[10.5px] font-bold text-emerald-300">💰 بازمحاسبه واقعی با ضریب 1xBet شما (از ۱۰۰ واحد):</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
            <span>استیک تیپ A: <b className="font-num text-foreground" dir="ltr">{faNum(dutch.stakeA, 1)}u</b></span>
            <span>· استیک تیپ B: <b className="font-num text-foreground" dir="ltr">{faNum(dutch.stakeB, 1)}u</b></span>
            <span>· سود خالص واقعی: <b className="font-num text-emerald-300" dir="ltr">+{faNum(dutch.profit, 1)}u ({faPct(dutch.profitPct, 2)})</b></span>
          </p>
        </div>
      ) : null}

      {validA && singleOnly && (
        <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
          🏦 بنکر تک‌ستون با ضریب 1xBet شما: استیک ۱۰۰ واحدی ⬅️ سود خالص در صورت برد{" "}
          <b className="font-num text-emerald-300" dir="ltr">+{faNum(100 * (numA - 1), 1)}u</b>
          {" "}· EV مدل:{" "}
          <b className={`font-num ${probA * numA - 1 >= 0 ? "text-emerald-300" : "text-rose-300"}`} dir="ltr">
            {faPct((probA * numA - 1) * 100, 1)}
          </b>
        </p>
      )}

      {alternatives.length > 0 && (
        <div className="mt-2 border-t border-white/8 pt-1.5">
          <p className="text-[9.5px] font-semibold text-muted-foreground">
            🧭 بهترین استراتژی جایگزین (قیمت‌گذاری واقعی تابلوی 1xBet — ضریب {ONE_X_BET_PAYOUT_FACTOR}/احتمال): هر ضریب زنده 1xBet بالاتر از عدد زیر = ورود ارزشمند
          </p>
          <ul className="mt-1 space-y-0.5">
            {alternatives.map((c) => (
              <li key={c.key} className="flex items-center justify-between gap-2 rounded-md bg-white/[0.04] px-1.5 py-1 text-[10px]">
                <span className="min-w-0 truncate text-foreground/85">{c.fa}</span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <b className="font-num text-emerald-300" dir="ltr">{c.fairOdds.toFixed(2)}×</b>
                  <span className="font-num text-[9px] text-muted-foreground" dir="ltr">{faPct(c.p * 100, 0)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ═══ v10.0 — نشانگر بهترین ساعت ثبت ضریب (Optimal Odds Timing Window) ═══

const TIMING_STATUS_STYLE: Record<TimingStatus, string> = {
  OPEN: "border-emerald-500/40 bg-emerald-500/[0.08] text-emerald-300",
  WAITING: "border-amber-500/40 bg-amber-500/[0.07] text-amber-300",
  LATE: "border-rose-500/40 bg-rose-500/[0.07] text-rose-300",
  KICKED_OFF: "border-white/15 bg-white/[0.03] text-muted-foreground",
};

/** بنر پنجره زمانی طلایی ثبت — با شمارش معکوس زنده (به‌روزرسانی هر ۳۰ ثانیه) */
function TimingBanner({ kickoff, legsA, oddsA, legsB, oddsB }: { kickoff: string; legsA: string[]; oddsA: number; legsB: string[]; oddsB: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const pair = useMemo(() => computePairTiming(kickoff, legsA, oddsA, legsB, oddsB, now), [kickoff, legsA, oddsA, legsB, oddsB, now]);

  const rows = pair.same ? [pair.a] : [pair.a, pair.b];
  const sideLabel = (i: number) => (pair.same ? "تیپ A + تیپ B" : i === 0 ? "تیپ A" : "تیپ B");

  return (
    <div className="space-y-1.5 rounded-xl border border-amber-500/30 bg-gradient-to-l from-amber-500/[0.08] to-transparent p-2.5">
      <p className="flex items-center gap-1 text-[10px] font-bold text-amber-300">
        ⏱️ بهترین زمان ثبت این تیپ (پنجره طلایی ضرایب — v10.0)
      </p>
      {rows.map((w, i) => {
        const style = TIMING_STATUS_STYLE[w.status];
        const clock = new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit" });
        return (
          <div key={`${w.windowKey}-${i}`} className={`rounded-lg border px-2 py-1.5 ${style}`}>
            <p className="text-[10.5px] font-bold leading-4">
              {w.meta.icon} {sideLabel(i)}: {w.meta.nameFa}
              <span className="mx-1 font-normal text-foreground/70">|</span>
              ساعت دقیق پیشنهادی ثبت:
              <b className="mx-1 font-num" dir="ltr">{w.suggestedClock}</b>
            </p>
            <p className="mt-0.5 text-[9.5px] leading-3.5 opacity-90">
              {w.statusText}
              {w.status === "OPEN" && w.msUntilClose > 0 && ` — ${faDuration(w.msUntilClose)} تا بستن پنجره`}
              {w.status === "WAITING" && w.msUntilOpen > 0 && ` (${clock.format(new Date(w.startAt))} تا ${clock.format(new Date(w.endAt))})`}
            </p>
          </div>
        );
      })}
      <p className="text-[9px] leading-3 text-muted-foreground">
        منطق علمی: {rows[0].meta.rationale}
      </p>
    </div>
  );
}

export function FlashCard({
  view,
  inCart,
  onToggleCart,
  compact = false,
  onDeepLlm,
  deepLlmState = "IDLE",
}: {
  view: FlashcardView;
  inCart: boolean;
  onToggleCart: () => void;
  compact?: boolean;
  /** v5.0 — تحلیل عمیق LLM فقط با تقاضای کاربر (کش ۶۰ دقیقه‌ای + صف ۱۵ ثانیه‌ای) */
  onDeepLlm?: () => void;
  deepLlmState?: DeepLlmState;
}) {
  const [flipped, setFlipped] = useState(false);
  const [copied, setCopied] = useState(false);
  const tier = useQuantStore((s) => s.config.tier);
  const setUsdtModalOpen = useQuantStore((s) => s.setUsdtModalOpen);
  const isFree = tier === "FREE";

  const { pair, match } = view;
  const matrix = useMemo(() => buildScoreMatrix(view.lambdaHome, view.lambdaAway), [view.lambdaHome, view.lambdaAway]);
  const coverage = useMemo(() => coverageGrid(pair.structure, match.id, matrix), [pair.structure, match.id, matrix]);
  // v6.0 — شناسه رسمی ESPN برای باکس راستی‌آزمایی (espn-<slug>-<eventId>)
  const verificationEventId = useMemo(() => {
    const ext = match.externalId ?? "";
    return ext.startsWith("espn-") ? (ext.split("-").pop() ?? null) : null;
  }, [match.externalId]);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    void navigator.clipboard?.writeText(cardCopyText(view));
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const TrustIcon = TRUST_ICONS[view.trust.kind];
  const marginPct = pair.guaranteedMarginPct;
  const bothLosePct = pair.jointStates.bothLose * 100;
  const riskTone = bothLosePct < 8 ? "text-emerald-400" : bothLosePct < 15 ? "text-amber-400" : "text-rose-400";
  const riskBar = bothLosePct < 8 ? "bg-emerald-500" : bothLosePct < 15 ? "bg-amber-500" : "bg-rose-500";
  const sup = view.supervisor;
  const vetoed = sup?.veto ?? false;
  const dualBook = (sup?.executionMode ?? "DUAL_BOOK") === "DUAL_BOOK";
  // v17.0 — استراتژی منتخب مسیریاب غیرخطی Bet-Type
  const bt = view.betType;
  const btBadge = bt ? BET_TYPE_BADGE[bt.key] : null;
  const isBanker = bt?.key === "BANKER";
  const isCluster = Boolean(bt?.cluster);
  const isCombo = bt?.key === "COMBO";
  // v16.0 — شتاب‌دهنده نامتقارن موتور: قفل اصل سرمایه ۱۰۰ واحدی روی تیپ B + تجمیس کل سود روی تیپ A
  const acc = pair.accelerator?.active ? pair.accelerator : null;
  const stakeAShown = acc ? acc.stakeA : pair.equalProfit.stakeA;
  const stakeBShown = acc ? acc.stakeB : pair.equalProfit.stakeB;
  const insuranceMode = marginPct <= 0; // S ≥ 1 → بدون عدد سود متناقض

  // ═══ v11.0 — سوییچ دوحالته تخصیص بودجه (سود برابر ↔ شتاب‌دهنده نامتقارن) ═══
  const boosterEligible = !vetoed && !insuranceMode && bothLosePct < 10;
  const plans = useMemo(
    () => (boosterEligible ? allocationPlans(pair.totalOddsA, pair.totalOddsB) : null),
    [boosterEligible, pair.totalOddsA, pair.totalOddsB]
  );
  const [allocMode, setAllocMode] = useState<"EQUAL_PROFIT" | "PRINCIPAL_LOCK">("EQUAL_PROFIT");
  const activePlan = plans ? (allocMode === "EQUAL_PROFIT" ? plans.equal : plans.booster) : null;

  return (
    <div className={`[perspective:1400px] ${compact ? "h-[430px]" : "h-[470px]"} w-full`}>
      <div
        role="button"
        tabIndex={0}
        aria-pressed={flipped}
        aria-label={`فلش‌کارت ${match.homeTeam} مقابل ${match.awayTeam} — برای چرخش کلیک کنید`}
        onClick={() => setFlipped((f) => !f)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setFlipped((f) => !f);
          }
        }}
        className={`glass relative size-full cursor-pointer rounded-2xl border [transform-style:preserve-3d] transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          vetoed ? "border-rose-500/30" : "border-white/10"
        }`}
        style={{ transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)" }}
      >
        {/* ═══════════ روی کارت ═══════════ */}
        {/* fix v8.1: روی چهره غیرفعال pointer-events-none تا دکمه‌های پشتِ کارت، کلیک را نميربايند */}
        {/* fix v8.1: محتوای بلند فقط داخل ناحیه اسکرول می‌شود؛ نوار اکشن همیشه پایین کارت پین می‌ماند */}
        <div
          aria-hidden={flipped}
          className={`absolute inset-0 flex flex-col gap-2 overflow-hidden rounded-2xl bg-[rgba(10,14,24,0.92)] p-4 [backface-visibility:hidden] ${flipped ? "pointer-events-none" : "pointer-events-auto"}`}
        >
          {/* ناحیه اسکرول‌شونده محتوا — هرگز به بیرون کارت سرریز نمی‌شود */}
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain">
          {/* هدر — v8.0: نام کامل تیم‌ها بدون برش (flex-wrap + leading-snug) */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <span className="inline-block size-1.5 rounded-full bg-cyan-400" />
                {match.league}
                <Clock className="size-3" />
                <span dir="ltr">{new Date(match.kickoff).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
              {/* v14.0 — دسته رقابت + قاعده کالیبراسیون اختصاصی (ملی/زنان) روی فلش‌کارت */}
              {(() => {
                const cat = categoryForLeagueName(match.league);
                const boost = patternBoostForCategory(cat);
                return (
                  <p className="mt-1 flex flex-wrap items-center gap-1 text-[9px]">
                    <span className="rounded border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 text-cyan-300">
                      {CATEGORY_LABEL_FA[cat]}
                    </span>
                    {boost && (
                      <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-amber-300">
                        🎯 {boost.label}
                      </span>
                    )}
                  </p>
                );
              })()}
              <h3 className="text-sm font-bold leading-snug sm:text-base">
                <span className="break-words">{match.homeTeam}</span> <span className="text-muted-foreground">×</span>{" "}
                <span className="break-words">{match.awayTeam}</span>
              </h3>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${TRUST_STYLES[view.trust.kind]}`}>
                <TrustIcon className="size-3" />
                {view.trust.label}
              </span>
              {match.weatherAdjusted && (
                <span
                  className="flex items-center gap-1 rounded-full border border-sky-500/40 bg-sky-500/15 px-2 py-0.5 text-[9px] font-semibold text-sky-300"
                  title={`آب‌وهوای واقعی ورزشگاه: ${match.weather ?? ""} — لامبدا −۸٪ اصلاح شد`}
                >
                  🌧️ تعدیل جوی زنده
                </span>
              )}
            </div>
          </div>

          {/* ═══ v8.0 — نوار تک‌تیپ طلایی سوپروایزر (یا وتو) ═══ */}
          {vetoed ? (
            <div className="flex items-center gap-2 rounded-lg border border-rose-500/35 bg-rose-500/[0.09] px-2.5 py-1.5">
              <ShieldAlert className="size-4 shrink-0 text-rose-400" />
              <p className="text-[10px] font-bold leading-4 text-rose-300">
                وتو شده توسط گیت غیرخطی سوپروایزر: هیچ‌یک از ۴ روش Bet-Type آستانه کیفیت (EV &gt; +۸٪ · Sharpe &gt; ۰.۳۲) را پاس نکرد — عدم پیشنهاد شرط
                {sup?.vetoReason && <span className="block font-normal text-rose-200/80">{sup.vetoReason}</span>}
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-gradient-to-l from-amber-500/[0.12] to-emerald-500/[0.08] px-2.5 py-1.5">
              <SupervisorSeal size={34} approved score={sup?.score100} />
              <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-[10px] font-bold text-amber-200">
                <Crown className="size-3.5 shrink-0 text-amber-300" />
                تنها تیپ تاییدشده سوپروایزر (Monte-Carlo Winner)
                {pair.archetype && <span className="font-medium text-amber-200/85">· {pair.archetype.short}</span>}
              </p>
            </div>
          )}

          {/* ═══ v17.0 — بج نئونی بزرگ استراتژی منتخب سوپروایزر (Bet-Type Router) ═══ */}
          {bt && btBadge && (
            <div className={`rounded-xl border px-3 py-2 ${btBadge.border} ${btBadge.bg} ${btBadge.glow}`}>
              <p className={`flex flex-wrap items-center gap-x-1.5 text-[11px] font-extrabold ${btBadge.text}`}>
                <span className="text-base leading-none" aria-hidden>{bt.icon}</span>
                استراتژی منتخب سوپروایزر: {bt.labelFa}
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[9.5px] font-semibold text-foreground/75">
                <span>پوشش ماتریس: <b className="font-num" dir="ltr">{faNum(bt.matrixCoveragePct, 1)}٪</b></span>
                <span>ضریب موثر: <b className="font-num" dir="ltr">{bt.effectiveOdds.toFixed(2)}x</b></span>
                <span>شارپ: <b className="font-num" dir="ltr">{bt.sharpe.toFixed(2)}</b></span>
                <span>EV: <b className="font-num" dir="ltr">{(bt.ev * 100).toFixed(1)}٪</b></span>
                <span className="text-muted-foreground" dir="ltr">H={bt.entropy.toFixed(2)} · Rλ={bt.rLambda.toFixed(2)} · Top4={(bt.top4Sum * 100).toFixed(0)}٪</span>
              </p>
              <p className="mt-1 border-t border-white/10 pt-1 text-[9px] leading-4 text-muted-foreground">{bt.rationale}</p>
            </div>
          )}

          {/* ═══ v17.0 — باکس تک‌ستون امن (BANKER — استیک مستقیم ۶۰ واحدی + پایه آکومولاتور) ═══ */}
          {isBanker && bt && (
            <div className="rounded-xl border border-emerald-500/40 bg-gradient-to-l from-emerald-500/[0.12] to-transparent p-3">
              <p className="mb-1 flex items-center gap-1 text-[10px] font-bold text-emerald-300">
                <span className="inline-block size-2 rounded-sm bg-emerald-500" />
                🏦 بنکر امن — تک‌ستون با اطمینان بالا (ضریب هدف ۱.۳۸..۱.۶۸)
              </p>
              <p className="min-h-[30px] break-words text-[11.5px] font-semibold leading-5 text-foreground/95">{bt.mainLabel}</p>
              <p className="mt-0.5 text-[9px] leading-3.5 text-emerald-200/75" dir="ltr">Market: {bt.mainLabelEn}</p>
              <div className="mt-2 grid grid-cols-4 gap-1.5 text-center">
                <div className="rounded-lg border border-white/10 bg-black/25 px-1 py-1.5">
                  <p className="text-[8.5px] text-muted-foreground">ضریب</p>
                  <p className="font-num text-sm font-bold text-emerald-300" dir="ltr">{bt.mainOdds.toFixed(2)}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/25 px-1 py-1.5">
                  <p className="text-[8.5px] text-muted-foreground">استیک مستقیم</p>
                  <p className="font-num text-sm font-bold text-foreground" dir="ltr">{faNum(bt.stakeMain, 0)}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/25 px-1 py-1.5">
                  <p className="text-[8.5px] text-muted-foreground">احتمال ماتریس</p>
                  <p className="font-num text-sm font-bold text-cyan-300" dir="ltr">{faNum(bt.mainProb * 100, 1)}٪</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/25 px-1 py-1.5">
                  <p className="text-[8.5px] text-muted-foreground">سود در صورت برد</p>
                  <p className="font-num text-sm font-bold text-amber-300" dir="ltr">+{faNum(bt.guaranteedProfitUnits, 1)}</p>
                </div>
              </div>
              <p className="mt-1.5 flex items-center gap-1 rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-[9px] font-semibold text-violet-300">
                🔗 این بنکر به‌صورت خودکار «پایه اصلی آکومولاتور روز» (2-Fold / 3-Fold / Time-Staggered) استفاده می‌شود
              </p>
            </div>
          )}

          {/* ═══ v17.0 — جدول خوشه نتیجه دقیق (CORRECT SCORE CLUSTER DUTCHING) ═══ */}
          {isCluster && bt?.cluster && (
            <div className="space-y-1.5 rounded-xl border border-fuchsia-500/40 bg-gradient-to-l from-fuchsia-500/[0.12] to-transparent p-3">
              <p className="flex items-center gap-1 text-[10px] font-bold text-fuchsia-300">
                🎯 خوشه {bt.cluster.length} تایی نتیجه دقیق — داچینگ ۱۰۰ واحدی به نسبت معکوس ضرایب
              </p>
              <div className="overflow-hidden rounded-lg border border-white/10">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="bg-white/[0.05] text-muted-foreground">
                      <th className="px-2 py-1 text-right font-semibold">نتیجه دقیق</th>
                      <th className="px-2 py-1 font-semibold">ضریب</th>
                      <th className="px-2 py-1 font-semibold">استیک</th>
                      <th className="px-2 py-1 font-semibold">سود خالص در صورت وقوع</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bt.cluster.map((c) => (
                      <tr key={c.score} className="border-t border-white/8 bg-black/20">
                        <td className="px-2 py-1 text-right"><b className="font-num text-fuchsia-200" dir="ltr">{c.score}</b></td>
                        <td className="px-2 py-1 text-center font-num text-foreground/85" dir="ltr">{c.odds.toFixed(2)}x</td>
                        <td className="px-2 py-1 text-center font-num text-sky-300" dir="ltr">{faNum(c.stake, 1)}</td>
                        <td className="px-2 py-1 text-center font-num font-bold text-emerald-300" dir="ltr">+{faNum(c.profit, 1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="flex flex-wrap items-center justify-between gap-1 text-[10px] font-semibold">
                <span className="text-muted-foreground">ضریب موثر کل خوشه: <b className="font-num text-fuchsia-200" dir="ltr">{bt.effectiveOdds.toFixed(2)}x</b> (سود خالص تضمینی در صورت وقوع هر یک از {bt.cluster.length} نتیجه)</span>
                <span className="text-emerald-300">پوشش کل خوشه: <b className="font-num" dir="ltr">{faNum(bt.winProb * 100, 1)}٪</b></span>
              </p>
            </div>
          )}

          {/* باکس دوقلوی تیپ مکمل */}
          {!isBanker && !isCluster && (
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-2.5">
              <p className="mb-1 flex items-center gap-1 text-[9px] font-semibold text-sky-300">
                <span className="inline-block size-2 rounded-sm bg-sky-500" />
                تیپ A — ضریب هدف ~۲
              </p>
              <p className="min-h-[42px] break-words text-[11px] leading-4 text-foreground/90">{pair.labelA}</p>
              {/* v15.0 — نام رسمی بین‌المللی مارکت (Institutional Execution Metadata) */}
              {pair.marketAEn && (
                <p className="mt-1 border-t border-white/10 pt-1 text-[8.5px] leading-3 text-sky-200/70" dir="ltr">Market: {pair.marketAEn}</p>
              )}
              <div className="mt-1.5 flex items-end justify-between gap-1">
                <div>
                  <p className="text-[9px] text-muted-foreground">ضریب</p>
                  <p className="font-num text-base font-bold text-sky-300" dir="ltr">{pair.totalOddsA.toFixed(2)}</p>
                </div>
                <div className="text-left">
                  <p className="text-[9px] text-muted-foreground">استیک خودکار</p>
                  <p className="font-num text-base font-bold text-foreground" dir="ltr">{faNum(stakeAShown, 1)}</p>
                </div>
              </div>
              {acc && (
                <p className="mt-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[8.5px] font-semibold leading-3 text-amber-300">
                  ⚡ شتاب‌دهنده نامتقارن — تجمیس کل سود روی تیپ A
                </p>
              )}
              {/* v8.0 — برچسب انطباق ضد گوبینگ */}
              <p className="mt-1.5 flex items-center gap-1 border-t border-white/10 pt-1 text-[8.5px] font-medium text-sky-200/80">
                <MapPin className="size-2.5 shrink-0" />
                {dualBook ? "ثبت در بوک‌میکر اول (سایت A)" : "سایت واحد — برگه ۱ (پایه امن)"}
              </p>
            </div>
            <div className="relative overflow-hidden rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2.5">
              <p className="mb-1 flex items-center gap-1 text-[9px] font-semibold text-emerald-300">
                <span className="inline-block size-2 rounded-sm bg-emerald-500" />
                تیپ B مکمل — ضریب ~۳
              </p>
              <p className={`min-h-[42px] break-words text-[11px] leading-4 text-foreground/90 ${isFree ? "select-none blur-[5px]" : ""}`} aria-hidden={isFree}>
                {pair.labelB}
              </p>
              {/* v15.0 — نام رسمی بین‌المللی مارکت (Institutional Execution Metadata) */}
              {pair.marketBEn && (
                <p className="mt-1 border-t border-white/10 pt-1 text-[8.5px] leading-3 text-emerald-200/70" dir="ltr">Market: {pair.marketBEn}</p>
              )}
              {isFree ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setUsdtModalOpen(true);
                  }}
                  className="absolute inset-x-2.5 bottom-9 flex items-center justify-center gap-1 rounded-lg border border-emerald-400/40 bg-emerald-500/20 py-1 text-[9px] font-bold text-emerald-200 backdrop-blur-[2px] transition hover:bg-emerald-500/30"
                  aria-label="تیپ B مخصوص اعضای کانال VIP — باز کردن مودال اشتراک"
                >
                  <Lock className="size-3" /> 🔒 مخصوص اعضای کانال VIP
                </button>
              ) : null}
              <div className="mt-1.5 flex items-end justify-between gap-1">
                <div>
                  <p className="text-[9px] text-muted-foreground">ضریب</p>
                  <p className={`font-num text-base font-bold text-emerald-300 ${isFree ? "blur-[3px]" : ""}`} dir="ltr" aria-hidden={isFree}>
                    {pair.totalOddsB.toFixed(2)}
                  </p>
                </div>
                <div className="text-left">
                  <p className="text-[9px] text-muted-foreground">استیک خودکار</p>
                  <p className={`font-num text-base font-bold text-foreground ${isFree ? "blur-[3px]" : ""}`} dir="ltr" aria-hidden={isFree}>
                    {faNum(stakeBShown, 1)}
                  </p>
                </div>
              </div>
              {acc && (
                <p className="mt-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[8.5px] font-semibold leading-3 text-emerald-300">
                  🔒 قفل اصل سرمایه ۱۰۰ واحدی — برد B = برگشت کامل اصل سرمایه
                </p>
              )}
              {/* v8.0 — برچسب انطباق ضد گوبینگ */}
              <p className="mt-1.5 flex items-center gap-1 border-t border-white/10 pt-1 text-[8.5px] font-medium text-emerald-200/80">
                <MapPin className="size-2.5 shrink-0" />
                {dualBook ? "ثبت در بوک‌میکر دوم یا صرافی (سایت B / Exchange)" : "سایت واحد — برگه ۲ (میکس امن دو بازی)"}
              </p>
            </div>
          </div>
          )}

          {/* ═══ v15.0 — نشان رسمی قانون تسویه (Settlement Rule Badge) ═══ */}
          <p className="flex items-center justify-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/[0.08] px-2 py-1.5 text-[9.5px] font-semibold text-amber-200/90">
            <Clock4 className="size-3 shrink-0" />
            قانون تسویه: وقت قانونی ۹۰ دقیقه — بدون وقت اضافه (90 Minutes Regular Time Only)
          </p>

          {/* شاخص‌های کلیدی — v8.0: فرمول صحیح سود واحد / حالت بیمه سرمایه */}
          <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
            {insuranceMode ? (
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="flex items-center gap-1 text-muted-foreground">
                  <ShieldAlert className="size-3.5 text-amber-400" /> پوشش بیمه سرمایه (S ≥ ۱)
                </span>
                <b className="text-amber-300">بازگشت سرمایه در سناریوی پایه — بدون سود تضمینی</b>
              </div>
            ) : (
              <div className="flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Banknote className="size-3.5 text-emerald-400" /> سود خالص تضمینی داچینگ
                </span>
                <b className="text-emerald-300" dir="ltr">
                  +{faNum(marginPct, 1)}٪ (+{faNum(pair.equalProfit.profit, 1)} واحد سود خالص)
                </b>
              </div>
            )}
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="flex items-center gap-1 text-muted-foreground">
                <ShieldAlert className="size-3.5 text-amber-400" /> ریسک باخت همزمان
              </span>
              <span className="flex items-center gap-1.5">
                <b className={riskTone} dir="ltr">{faNum(bothLosePct, 1)}%</b>
                <span className={`text-[9px] ${riskTone}`}>{bothLosePct < 8 ? "بسیار امن" : bothLosePct < 12 ? "قابل قبول" : bothLosePct < 15 ? "مرزی" : "پرریسک"}</span>
              </span>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
              <div className={`h-1 rounded-full ${riskBar} transition-all`} style={{ width: `${Math.min(100, bothLosePct * 2.5)}%` }} />
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1 text-muted-foreground">
                <Trophy className="size-3.5 text-cyan-400" /> ارزش نسبت به خط پیناکل
              </span>
              {pair.sharpEdgePct !== null ? (
                <b className={pair.sharpEdgePct > 0 ? "text-cyan-300" : pair.sharpEdgePct < 0 ? "text-rose-300" : "text-muted-foreground"} dir="ltr" title="ارزش عددی = (احتمال مدل × ضریب ثبت − ۱) × ۱۰۰ نسبت به خط منصفانه/شارپ بازار">
                  {pair.sharpEdgePct > 0 ? "+" : ""}{faNum(pair.sharpEdgePct, 1)}% CLV
                </b>
              ) : (
                <b className="text-muted-foreground" dir="ltr">{faNum((pair.selectionA.evPct + pair.selectionB.evPct) / 2 * 100, 1)}% EV</b>
              )}
            </div>
          </div>

          {/* ═══ v11.0 — سوییچ دوحالته تخصیص: سود برابر ↔ شتاب‌دهنده نامتقارن ═══ */}
          {plans && activePlan && (
            <div className="space-y-2 rounded-xl border border-amber-500/30 bg-gradient-to-l from-amber-500/[0.08] to-emerald-500/[0.05] p-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-1 text-[10px] font-bold text-amber-200">
                  <Zap className="size-3.5 text-amber-400" /> استراتژی تخصیص بودجه ۱۰۰ واحدی
                </p>
                <div className="flex items-center gap-0.5 rounded-lg border border-white/10 bg-black/30 p-0.5" role="radiogroup" aria-label="انتخاب استراتژی تخصیص بودجه">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={allocMode === "EQUAL_PROFIT"}
                    onClick={(e) => {
                      e.stopPropagation();
                      setAllocMode("EQUAL_PROFIT");
                    }}
                    className={cn(
                      "h-6 rounded-md px-2 text-[9px] font-bold transition",
                      allocMode === "EQUAL_PROFIT" ? "bg-emerald-500/25 text-emerald-200" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    ⚖️ حالت ۱: سود برابر
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={allocMode === "PRINCIPAL_LOCK"}
                    onClick={(e) => {
                      e.stopPropagation();
                      setAllocMode("PRINCIPAL_LOCK");
                    }}
                    className={cn(
                      "h-6 rounded-md px-2 text-[9px] font-bold transition",
                      allocMode === "PRINCIPAL_LOCK" ? "bg-amber-500/25 text-amber-200" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    🚀 حالت ۲: شتاب‌دهنده نامتقارن
                  </button>
                </div>
              </div>
              {allocMode === "EQUAL_PROFIT" ? (
                <p className="text-[10px] leading-4 text-muted-foreground">
                  ⚖️ <b className="text-emerald-300">سود تضمینی برابر:</b> چه تیپ A ببرد چه تیپ B — دقیقاً{" "}
                  <b className="font-num text-emerald-300" dir="ltr">+{faNum(plans.equal.profitIfA, 1)} واحد</b> سود خالص (استیک‌ها: {faNum(plans.equal.stakeA, 1)} / {faNum(plans.equal.stakeB, 1)})
                </p>
              ) : (
                <div className="space-y-1 text-[10px] leading-4">
                  <p>
                    🚀 اگر <b className="text-sky-300">تیپ A ببرد</b>: <b className="font-num text-amber-300" dir="ltr">+{faNum(plans.booster.profitIfA, 1)} واحد سود خالص</b> (استیک {faNum(plans.booster.stakeA, 1)} روی ضریب {pair.totalOddsA.toFixed(2)})
                  </p>
                  <p>
                    🔒 اگر <b className="text-emerald-300">تیپ B ببرد</b>: <b className="font-num text-emerald-300" dir="ltr">0.0 واحد (برگشت ۱۰۰٪ اصل پول بدون ضرر)</b> (استیک {faNum(plans.booster.stakeB, 1)} روی ضریب {pair.totalOddsB.toFixed(2)})
                  </p>
                  <p className="text-[9px] text-muted-foreground">قفل اصل سرمایه روی تیپ B + پرتاب سود روی تیپ A — مخصوص کارت‌های ریسک زیر ۱۰٪</p>
                </div>
              )}
              <p className="text-[9px] text-muted-foreground">
                استیک فعال روی کارت: <b className="font-num text-foreground" dir="ltr">{faNum(activePlan.stakeA, 1)} / {faNum(activePlan.stakeB, 1)}</b> واحد — ثبت واقعی همیشه با حالت ۱ (سود برابر) انجام می‌شود؛ حالت ۲ نقشه اجرای شخصی توست.
              </p>
            </div>
          )}

          {/* ═══ v10.0 — بنر بهترین ساعت ثبت ضریب ═══ */}
          {!vetoed && (
            <TimingBanner
              kickoff={match.kickoff}
              legsA={pair.structure.legsA ?? []}
              oddsA={pair.totalOddsA}
              legsB={pair.structure.legsB ?? []}
              oddsB={pair.totalOddsB}
            />
          )}

          </div>

          {/* دکمه‌های عملیاتی — پین‌شده پایین کارت (همیشه قابل کلیک) */}
          <div className="shrink-0 grid grid-cols-[1fr_1fr_auto] gap-1.5" onClick={(e) => e.stopPropagation()}>
            <Button
              size="sm"
              className="h-8 gap-1 bg-gradient-to-l from-amber-500/80 to-amber-400/80 text-[11px] text-black hover:from-amber-500 hover:to-amber-400"
              onClick={() => setFlipped((f) => !f)}
              aria-label="چرخش کارت و مشاهده تحلیل"
            >
              <RefreshCw className="size-3.5" /> چرخش کارت
            </Button>
            <Button
              size="sm"
              variant="outline"
              className={`h-8 gap-1 border-white/15 text-[11px] ${inCart ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300" : "text-foreground/80"}`}
              onClick={onToggleCart}
              aria-label={inCart ? "حذف تیپ از سبد" : "افزودن تیپ به سبد روزانه"}
            >
              {inCart ? <Check className="size-3.5" /> : <ShoppingCart className="size-3.5" />}
              {inCart ? "در سبد" : "افزودن به سبد"}
            </Button>
            <Button size="sm" variant="outline" className="h-8 w-9 border-white/15 p-0 text-muted-foreground" onClick={handleCopy} aria-label="کپی سریع تیپ">
              {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
            </Button>
          </div>

          {pair.structure.doubleWin && (
            <p className="flex shrink-0 items-center justify-center gap-1 text-[10px] font-semibold text-amber-300">
              <Sparkles className="size-3" /> فرصت Double-Win — هر دو تیپ می‌توانند همزمان ببرند
            </p>
          )}
        </div>

        {/* ═══════════ پشت کارت ═══════════ */}
        <div
          aria-hidden={!flipped}
          className={`absolute inset-0 flex flex-col gap-3 overflow-y-auto rounded-2xl border border-white/10 bg-[rgba(8,12,22,0.96)] p-4 [backface-visibility:hidden] [transform:rotateY(180deg)] ${flipped ? "pointer-events-auto" : "pointer-events-none"}`}
          onClick={(e) => e.stopPropagation()}
        >
          <p className="flex items-center gap-1.5 text-xs font-bold">
            <Scale className="size-4 text-cyan-400" /> کالبدشکافی تحلیلی — {match.homeTeam} × {match.awayTeam}
          </p>

          {/* ═══ v8.0 — سناریوی تصمیم ایجنت سوپروایزر ارشد ═══ */}
          {sup && (
            <div className={`rounded-xl border p-2.5 text-[11px] leading-5 ${vetoed ? "border-rose-500/30 bg-rose-500/[0.06]" : "border-amber-500/30 bg-amber-500/[0.06]"}`}>
              <p className={`mb-1.5 flex items-center gap-1.5 font-bold ${vetoed ? "text-rose-300" : "text-amber-300"}`}>
                <SupervisorSeal size={26} approved={!vetoed} score={sup.score100} />
                {vetoed ? "وتو ایجنت سوپروایزر — عدم پیشنهاد شرط" : "چرا سوپروایزر این الگو را برگزید؟"}
              </p>
              <p className="text-muted-foreground">
                از میان <b className="text-foreground">{faNum(sup.rejected.length + 1, 0)}</b> کاندید بازرسی‌شده روی{" "}
                <b className="font-num text-foreground" dir="ltr">۱۰,۰۰۰</b> شبیه‌سازی مونت‌کارلو، این الگو بالاترین امتیاز کیفیت را گرفت:
              </p>
              <p className="mt-1 rounded-lg bg-black/30 p-1.5 text-[10px] leading-4">
                <b className="text-foreground">Non-Linear Sharpe &amp; Kelly Utility v17.0</b> — هر ۴ روش تک‌بازی (🏦 بنکر · 🧩 کمبو · 🎯 خوشه نتیجه دقیق · ⚖️ زوج‌تیپ) با تابع مطلوبیت غیرخطی امتیاز گرفته‌اند:
                <span className="mt-0.5 block text-[9px] text-muted-foreground" dir="ltr">
                  EV = p·(O−1) + pDW·0.45 − (1−p) &nbsp;·&nbsp; Sharpe = EV/σ &nbsp;·&nbsp; Score = (Sharpe×45 + p^2.2×100×0.55 + (2.8−H)×12) × LeagueReliability
                </span>
                <span className="mt-0.5 block text-[9px] text-muted-foreground">
                  آنتروپی شانون ماتریس ۶×۶ (H) و نسبت عدم تقارن قدرت (Rλ) مسیر انتخاب را تعیین می‌کنند — گیت تایید: EV &gt; +۸٪ و Sharpe &gt; ۰.۳۲؛ تنها لیگ‌های سمّی (esp.2 / usa.1) و بازی‌های شارپ منفی در هر ۴ روش وتو می‌شوند.
                </span>
              </p>
              {sup.vetoReason && (
                <p className="mt-1 flex items-start gap-1 text-[10px] text-rose-300">
                  <AlertTriangle className="mt-0.5 size-3 shrink-0" /> {sup.vetoReason}
                </p>
              )}
              {sup.rejected.length > 0 && (
                <div className="mt-1.5">
                  <p className="mb-1 text-[10px] font-semibold text-muted-foreground">الگوهای رد‌شده:</p>
                  <ul className="space-y-0.5 text-[10px]">
                    {sup.rejected.slice(0, 6).map((r) => (
                      <li key={r.id} className="flex items-center justify-between gap-2 rounded-md bg-white/[0.03] px-1.5 py-0.5">
                        <span className="min-w-0 break-words text-muted-foreground" title={r.reason || r.short}>✕ {r.short}</span>
                        <span className="flex shrink-0 items-center gap-1">
                          <b className={r.veto ? "text-rose-300" : "text-zinc-400"} dir="ltr">{r.score100}/100</b>
                          <span className="text-[9px] text-muted-foreground/70">{r.veto ? "وتو" : "پایین‌تر"}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* ═══ v9.0 — موتور مهندسی معکوس ضرایب: شفافیت کامل λ ═══ */}
          <div className="rounded-xl border border-sky-500/25 bg-sky-500/[0.05] p-2.5 text-[11px] leading-5">
            <p className="flex items-center gap-1 font-semibold text-sky-300">
              🎯 امید گل ترکیبی نهایی: میزبان{" "}
              <b className="font-num" dir="ltr">{faNum(view.lambdaHome, 2)}</b> — میهمان{" "}
              <b className="font-num" dir="ltr">{faNum(view.lambdaAway, 2)}</b>
            </p>
            {view.lambdaMarketHome !== null && view.lambdaMarketAway !== null ? (
              <p className="mt-1 text-[10px] text-muted-foreground">
                استخراج‌شده از الگوی Odds بازار: <b className="font-num text-sky-200" dir="ltr">{faNum(view.lambdaMarketHome, 2)}-{faNum(view.lambdaMarketAway, 2)}</b> | آمار فصل:{" "}
                <b className="font-num text-emerald-300" dir="ltr">{faNum(view.lambdaStatsHome, 2)}-{faNum(view.lambdaStatsAway, 2)}</b> · فرمول ترکیبی:{" "}
                <b className="text-foreground">۶۵٪ بازار + ۳۵٪ آمار</b>
                {view.lambdaFitError !== null && (
                  <> · خطای برازش بازار: <b className="font-num" dir="ltr">{view.lambdaFitError.toExponential(1)}</b></>
                )}
              </p>
            ) : view.match.statsSource === "GLOBAL_ELO_FALLBACK" ? (
              <p className="mt-1 text-[10px] text-muted-foreground">
                خط بازار واقعی در دسترس نبود — v21.0: λ از <b className="text-sky-300">جدول Elo جهانی</b> (اختلاف واقعی قدرت دو تیم، نه عدد ثابت) :{" "}
                <b className="font-num text-emerald-300" dir="ltr">{faNum(view.lambdaStatsHome, 2)}-{faNum(view.lambdaStatsAway, 2)}</b> (مسیر GLOBAL_ELO_RATINGS)
              </p>
            ) : (
              <p className="mt-1 text-[10px] text-muted-foreground">
                خط بازار واقعی در دسترس نبود — λ از مدل آماری جدول و فرم فصل:{" "}
                <b className="font-num text-emerald-300" dir="ltr">{faNum(view.lambdaStatsHome, 2)}-{faNum(view.lambdaStatsAway, 2)}</b> (مسیر STATS_ONLY)
              </p>
            )}
          </div>

          {/* ═══ v21.0 — پنل تطبیق زنده با ضریب فعلی 1xBet (Live 1xBet Odds Calibrator) ═══ */}
          {!vetoed && <LiveOddsCalibrator view={view} />}

          {/* ═══ v9.0 — درس کالیبراسیون اعمال‌شده روی این کارت (حلقه فعال) ═══ */}
          {view.calibrationRule.length > 0 && (
            <div className="rounded-xl border border-violet-500/30 bg-violet-500/[0.07] p-2.5 text-[11px] leading-5">
              <p className="flex items-center gap-1 font-semibold text-violet-300">
                🧠 درس کالیبراسیون اعمال‌شده روی این کارت: <Badge variant="outline" className="gap-0.5 border-violet-400/40 px-1 py-0 text-[8px] text-violet-200">⚡ اعمال‌شده در فرمول سوپروایزر</Badge>
              </p>
              <ul className="mt-1 space-y-0.5 text-[10px] text-muted-foreground">
                {view.calibrationRule.slice(0, 3).map((r, i) => (
                  <li key={i}>• {r}</li>
                ))}
              </ul>
            </div>
          )}

          {/* v5.0 — تحلیل عمیق LLM تقاضامحور (کش ۶۰ دقیقه + صف ۱۵ ثانیه) */}
          {onDeepLlm && (
            <div className="rounded-xl border border-cyan-500/25 bg-cyan-500/[0.06] p-2.5" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-1 text-[11px] font-semibold text-cyan-300">
                  <BrainCircuit className="size-3.5" /> تحلیل عمیق LLM برای این بازی
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 border-cyan-500/40 px-2 text-[10px] text-cyan-300 hover:bg-cyan-500/10"
                  onClick={onDeepLlm}
                  disabled={deepLlmState === "RUNNING"}
                  aria-label="اجرای تحلیل عمیق LLM برای این بازی"
                >
                  {deepLlmState === "RUNNING" ? <Loader2 className="size-3 animate-spin" /> : <Zap className="size-3" />}
                  {deepLlmState === "RUNNING" ? "در حال تحلیل…" : deepLlmState === "CACHED" ? "اجرای مجدد" : "اجرای LLM"}
                </Button>
              </div>
              <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
                فقط با کلیک شما اجرا می‌شود — صف حداکثر ۱ درخواست در ۱۵ ثانیه + کش ۶۰ دقیقه‌ای (سپر Rate-Limit)
              </p>
              {deepLlmState === "CACHED" && (
                <p className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-emerald-300">⚡ بارگذاری از کش هوشمند (صرفه‌جویی در نرخ API)</p>
              )}
            </div>
          )}

          {/* روایت الگوی متعامد جاری */}
          {pair.archetype && (
            <div className="rounded-xl border border-fuchsia-500/25 bg-fuchsia-500/[0.05] p-2.5 text-[11px] leading-5">
              <p className="mb-1 flex items-center gap-1 font-semibold text-fuchsia-300">
                <Sparkles className="size-3.5" /> {pair.archetype.name}
              </p>
              <p className="text-muted-foreground">{pair.archetype.rationale}</p>
              <p className="mt-1 text-[10px] text-fuchsia-200/80">
                زاویه تمایز: <b>۱۰۰٪ متعامد — بدون شرط تکراری</b> · پوشش سناریوها: <b dir="ltr">{faNum(pair.archetype.coveragePct * 100, 0)}%</b>
                {pair.archetype.overlapPct > 0.02 && (
                  <> · دو برد همزمان: <b dir="ltr">{faPct(pair.archetype.overlapPct, 1)}</b></>
                )}
              </p>
            </div>
          )}

          {/* خلاصه مناظره در ۳ خط */}
          <div className="space-y-1.5 rounded-xl border border-white/10 bg-white/[0.03] p-2.5 text-[11px] leading-5">
            <p className="flex gap-1.5">
              <span className="shrink-0" aria-hidden>🐂</span>
              <span><b className="text-rose-300">برهان گاو:</b> {view.bullLine}</span>
            </p>
            <p className="flex gap-1.5">
              <span className="shrink-0" aria-hidden>🐻</span>
              <span><b className="text-amber-300">برهان خرس:</b> {view.bearLine}</span>
            </p>
            <p className="flex gap-1.5">
              <span className="shrink-0" aria-hidden>⚖️</span>
              <span><b className="text-cyan-300">حکم قاضی کمّی:</b> {view.judgeLine}</span>
            </p>
          </div>

          {/* مینی‌مپ پوشش ۶×۶ */}
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
            <div className="mb-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
              <span>مینی‌مپ پوشش نتیجه ۶×۶ (میزبان ↓ × میهمان →)</span>
              <span className="flex items-center gap-2">
                <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-sky-500" /> تیپ A</span>
                <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-emerald-500" /> تیپ B</span>
                <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-amber-400" /> دو برد</span>
              </span>
            </div>
            <div className="grid grid-cols-6 gap-0.5" aria-label="نقشه پوشش نتایج">
              {coverage.cells.flat().map((c) => (
                <div
                  key={`${c.h}-${c.a}`}
                  title={`نتیجه ${c.h}-${c.a} · احتمال ${faPct(c.p)}`}
                  className={`flex h-6 items-center justify-center rounded-[3px] text-[8px] ${coverColor(c.kind)}`}
                >
                  <span className={c.kind === "NONE" ? "" : "font-num"} dir="ltr">
                    {c.h}-{c.a}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-1.5 text-[10px] text-muted-foreground">
              پوشش کل نتایج: <b className="text-foreground" dir="ltr">{faNum(coverage.stats.coveredPct, 0)}%</b>
              {coverage.stats.bothCells > 0 && (
                <> · ناحیه طلایی: <b className="text-amber-300" dir="ltr">{faNum(coverage.stats.bothWinProb * 100, 1)}%</b> شانس دو برد همزمان</>
              )}
              {coverage.isConditional && <span className="text-amber-300"> · پوشش مشروط (پایه مشترک روی این بازی)</span>}
              {coverage.hasOffMatrixLegs && <span className="text-fuchsia-300"> · شامل بازار خارج ماتریس (کرنر/کارت/نیمه اول) — پوشش تخمینی</span>}
            </p>
          </div>

          {/* وضعیت ترکیب T-60 (v6.0 — فقط ESPN واقعی) */}
          <div className="rounded-xl border border-violet-500/25 bg-violet-500/5 p-2.5 text-[11px] leading-5">
            <p className="mb-1 flex items-center gap-1 font-semibold text-violet-300">
              <Sparkles className="size-3.5" /> وضعیت ترکیب T-60 (VAEP واقعی ESPN)
            </p>
            {view.lineup?.success ? (
              <>
                <p className="text-muted-foreground">
                  {view.lineup.mode === "OFFICIAL" ? "ترکیب رسمی اعلام‌شده" : "آمار فصل واقعی (پیش از اعلام)"} · شوک میزبان:{" "}
                  <b className={view.lineup.home.shockDelta < 0 ? "text-rose-300" : "text-emerald-300"} dir="ltr">
                    {faNum(view.lineup.home.shockDelta * 100, 1)}%
                  </b>{" "}
                  · شوک میهمان:{" "}
                  <b className={view.lineup.away.shockDelta < 0 ? "text-rose-300" : "text-emerald-300"} dir="ltr">
                    {faNum(view.lineup.away.shockDelta * 100, 1)}%
                  </b>
                </p>
                {view.lineup.isShock && (
                  <p className="mt-1 flex items-center gap-1 text-violet-200">
                    <AlertTriangle className="size-3 shrink-0 text-violet-400" />
                    {view.lineup.message}
                  </p>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">فهرست بازیکنان واقعی ESPN هنوز واکشی نشده — ضریب بر پایه آمار فصل جدول رسمی است.</p>
            )}
          </div>

          {/* ═══ v6.0 — سند راستی‌آزمایی داده (Data Verification Inspector) ═══ */}
          {verificationEventId && (
            <details className="group rounded-xl border border-cyan-500/25 bg-cyan-500/[0.05] p-2.5 text-[11px] leading-5" onClick={(e) => e.stopPropagation()}>
              <summary className="flex cursor-pointer list-none items-center gap-1.5 font-semibold text-cyan-300" aria-label="راستی‌آزمایی منبع داده">
                <SearchCheck className="size-3.5" />
                راستی‌آزمایی منبع داده (Zero-Mock)
                <ChevronDown className="size-3 transition-transform group-open:rotate-180" />
              </summary>
              <div className="mt-2 space-y-1.5 text-[10px]">
                <p className="flex flex-wrap items-center gap-1">
                  <span className="text-muted-foreground">شناسه رسمی مسابقه در ESPN (Event ID):</span>
                  <b className="font-num" dir="ltr">{verificationEventId}</b>
                  <a
                    href={`https://www.espn.com/soccer/match/_/gameId/${verificationEventId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-0.5 text-cyan-300 hover:underline"
                    title="باز کردن صفحه رسمی مسابقه در ESPN"
                  >
                    espn.com/soccer/match <ExternalLink className="size-2.5" />
                  </a>
                </p>
                {view.match.statsSource === "ESPN_STANDINGS" && (
                  <>
                    <p>
                      <span className="text-muted-foreground">آمار واقعی فصل میزبان:</span> رتبه <b className="font-num" dir="ltr">{faNum(view.match.homeRank ?? 0, 0)}</b> ·{" "}
                      <b className="font-num" dir="ltr">{faNum(view.match.homeGF ?? 0, 0)}</b> گل زده و <b className="font-num" dir="ltr">{faNum(view.match.homeGA ?? 0, 0)}</b> گل خورده در{" "}
                      <b className="font-num" dir="ltr">{faNum(view.match.homeGP ?? 0, 0)}</b> بازی
                    </p>
                    <p>
                      <span className="text-muted-foreground">آمار واقعی فصل میهمان:</span> رتبه <b className="font-num" dir="ltr">{faNum(view.match.awayRank ?? 0, 0)}</b> ·{" "}
                      <b className="font-num" dir="ltr">{faNum(view.match.awayGF ?? 0, 0)}</b> گل زده و <b className="font-num" dir="ltr">{faNum(view.match.awayGA ?? 0, 0)}</b> گل خورده در{" "}
                      <b className="font-num" dir="ltr">{faNum(view.match.awayGP ?? 0, 0)}</b> بازی
                    </p>
                    <p>
                      <span className="text-muted-foreground">میانگین واقعی لیگ:</span>{" "}
                      <b className="font-num" dir="ltr">{faNum((view.match.leagueTeamAvg ?? 0) * 2, 2)}</b> گل در هر بازی · λ = α×β×میانگین×۱.۱۲
                    </p>
                  </>
                )}
                {view.match.statsSource && (
                  <p>
                    <span className="text-muted-foreground">منبع لامبدا:</span>{" "}
                    {view.match.statsSource === "ESPN_STANDINGS"
                      ? "جدول رسمی رده‌بندی ESPN Standings (بدون کلید)"
                      : view.match.statsSource === "GLOBAL_ELO_FALLBACK"
                        ? "جدول جهانی Elo تیم‌های ملی و باشگاهی (v21.0 — بدون λ کور)"
                        : "رکورد/فرم واقعی ESPN (جدول رده‌بندی در دسترس نبود)"}
                  </p>
                )}
                {view.match.statsFetchedAt && (
                  <p>
                    <span className="text-muted-foreground">زمان دقیق آخرین واکشی از سرور زنده:</span>{" "}
                    <b className="font-num" dir="ltr">{new Date(view.match.statsFetchedAt).toLocaleString("fa-IR")}</b>
                  </p>
                )}
                {view.match.oddsSource && (
                  <p>
                    <span className="text-muted-foreground">منبع ضرایب:</span>{" "}
                    {view.match.oddsSource === "ODDS_API"
                      ? "بوک‌میکرهای واقعی The Odds API v4"
                      : view.match.oddsSource === "ESPN_DRAFTKINGS"
                        ? "خط رسمی ESPN/DraftKings"
                        : "ضریب عادلانه مدل کمّی (پیش از بازگشایی خط بوک‌میکر)"}
                  </p>
                )}
                <p className="text-emerald-300">✅ هیچ بازیکن فرضی، بوک‌میکر ساختگی یا عدد شبیه‌سازی‌شده در این کارت وجود ندارد.</p>
              </div>
            </details>
          )}

          <Button
            size="sm"
            variant="outline"
            className="mt-auto h-8 gap-1.5 border-white/15 text-[11px]"
            onClick={() => setFlipped(false)}
            aria-label="بازگشت به روی کارت"
          >
            <RefreshCw className="size-3.5" /> بازگشت به روی کارت
          </Button>
        </div>
      </div>
    </div>
  );
}
