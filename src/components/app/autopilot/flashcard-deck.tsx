"use client";

// ─────────────────────────────────────────────────────────────────────────────
// دک فلش‌کارت‌های تیپ آماده (3D Flashcard Deck) — v17.0 Bet-Type Router Edition
// هر بازی با «استراتژی منتخب سوپروایزر» از مسیریاب غیرخطی ۵ رژیمی نمایش داده می‌شود:
// 🏦 BANKER · 🧩 COMBO · 🎯 CORRECT SCORE CLUSTER · ⚖️ DUAL-HEDGE · 🔗 ACCUMULATOR
// + نوار انتخاب استراتژی (Bet-Type Filter Bar) در بالای فلش‌کارت‌ها
// + v13.4 — تفکیک فلش‌کارت‌های «بازی امروز» از «بازی‌های روزهای آینده» (منطقه زمانی تهران)
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import { BrainCircuit, ChevronLeft, ChevronRight, Crosshair, Flame, Grid3X3, Landmark, Layers, Link2, Loader2, Puzzle, Scale, ShieldOff, Sparkles, Store, TriangleAlert, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuantStore } from "@/lib/store";
import { useFlashcards } from "@/lib/autopilot-derive";
import { FlashCard, type DeepLlmState } from "./flash-card";
import { AccumulatorCards } from "./accumulator-cards";
import { faNum } from "@/lib/format";
import { getCachedDebate, setCachedDebate } from "@/lib/llm-cache";
import type { DebateResultDTO } from "@/lib/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ═══ v17.0 — نوار انتخاب استراتژی (Bet-Type Filter Bar) ═══
type FilterKey = "ALL_APPROVED" | "COMBO" | "DUAL_HEDGE" | "CORRECT_SCORE" | "BANKER" | "ACCUMULATOR" | "VETOED";

const FILTERS: { key: FilterKey; label: string; icon: typeof Layers; golden?: boolean }[] = [
  { key: "ALL_APPROVED", label: "🔥 همه سیگنال‌های تاییدشده سوپروایزر (بهترین Bet-Type هر بازی)", icon: Flame, golden: true },
  { key: "COMBO", label: "🧩 کمبوهای رسمی (Official Combos)", icon: Puzzle },
  { key: "DUAL_HEDGE", label: "⚖️ زوج‌تیپ‌های دوقلو (Dual-Hedge)", icon: Scale },
  { key: "CORRECT_SCORE", label: "🎯 خوشه نتیجه دقیق (Correct Score Dutching)", icon: Crosshair },
  { key: "BANKER", label: "🏦 بنکرهای امن (Single Bankers)", icon: Landmark },
  { key: "ACCUMULATOR", label: "🔗 آکومولاتورها (Smart Accumulators)", icon: Link2 },
  { key: "VETOED", label: "🛡️ وتو شده", icon: ShieldOff },
];

/** فاصله حداقل بین درخواست‌های LLM در اجرای توالی ۳ بازی برتر (سپر سمت کلاینت) */
const LLM_GAP_MS = 15_000;

// ═══ v13.4 — تفکیک «بازی امروز» از «روزهای آینده» بر اساس کیک‌آف در منطقه زمانی تهران (UTC+3:30 ثابت، بدون DST) ═══

/** شروع روز تقویمی تهران */
function tehranDayStart(d = new Date()): Date {
  const OFFSET = 3.5 * 3600_000;
  const shifted = d.getTime() + OFFSET;
  return new Date(Math.floor(shifted / 86_400_000) * 86_400_000 - OFFSET);
}

type DayKind = "TODAY" | "UPCOMING" | "PAST";

/** دسته روز کارت بر اساس کیک‌آف: پنجره امروز تهران (شروع تا ۲۴ ساعت بعد) vs آینده vs در جریان/گذشته */
function tehranDayKind(kickoff: string | Date, now = new Date()): DayKind {
  const start = tehranDayStart(now).getTime();
  const t = new Date(kickoff).getTime();
  if (t >= start + 86_400_000) return "UPCOMING";
  if (t >= start) return "TODAY";
  return "PAST";
}

/** ترتیب کاروسل: بازی‌های امروز اول، سپس آینده، سپس در جریان/گذشته (درون هر دسته صعودی کیک‌آف) */
const DAY_RANK: Record<DayKind, number> = { TODAY: 0, UPCOMING: 1, PAST: 2 };

/** نشان قرصی بالای کارت در نمای کاروسل — دسته روز بازی جاری */
const DAY_PILL: Record<DayKind, { label: string; cls: string }> = {
  TODAY: { label: "⚽ بازی امروز", cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" },
  UPCOMING: { label: "📅 روزهای آینده", cls: "border-amber-500/40 bg-amber-500/10 text-amber-300" },
  PAST: { label: "🕐 در جریان/گذشته", cls: "border-white/10 bg-white/[0.03] text-zinc-400" },
};

/** ساعت محلی تهران برای خط کیک‌آف (ارقام فارسی با fa-IR) */
const TEHRAN_TIME = new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tehran" });

export function FlashcardDeck({
  compact = false,
  title = "فلش‌کارت‌های تیپ آماده",
  defaultView = "carousel",
}: {
  compact?: boolean;
  title?: string;
  defaultView?: "carousel" | "grid";
}) {
  const cards = useFlashcards();
  const cart = useQuantStore((s) => s.cart);
  const toggleCart = useQuantStore((s) => s.toggleCart);
  const scanning = useQuantStore((s) => s.scanning);
  const matchesCount = useQuantStore((s) => s.matches.length);
  const bumpLlmShield = useQuantStore((s) => s.bumpLlmShield);
  const executionMode = useQuantStore((s) => s.config.executionMode);
  const patchConfig = useQuantStore((s) => s.patchConfig);

  const [view, setView] = useState<"carousel" | "grid">(defaultView);
  const [filter, setFilter] = useState<FilterKey>("ALL_APPROVED");
  const [index, setIndex] = useState(0);
  const activeMatchId = useQuantStore((s) => s.activeMatchId);

  // ═══ v8.0 — وضعیت تحلیل عمیق LLM هر بازی ═══
  const [deepLlm, setDeepLlm] = useState<Record<string, DeepLlmState>>({});
  const [bulkRunning, setBulkRunning] = useState(false);

  // ═══ v17.0 — شمارش استراتژی‌های منتخب برای نشان‌های نوار Bet-Type ═══
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = { COMBO: 0, DUAL_HEDGE: 0, CORRECT_SCORE: 0, BANKER: 0 };
    for (const c of cards) {
      if (c.routerVeto) continue;
      const k = c.betType?.key;
      if (k && k in counts) counts[k] += 1;
    }
    return counts;
  }, [cards]);

  const approvedCount = useMemo(() => cards.filter((c) => !c.routerVeto).length, [cards]);
  const vetoedCount = cards.length - approvedCount;

  const filtered = useMemo(() => {
    switch (filter) {
      case "ALL_APPROVED":
        return cards.filter((c) => !c.routerVeto);
      case "COMBO":
        return cards.filter((c) => !c.routerVeto && c.betType?.key === "COMBO");
      case "DUAL_HEDGE":
        return cards.filter((c) => !c.routerVeto && c.betType?.key === "DUAL_HEDGE");
      case "CORRECT_SCORE":
        return cards.filter((c) => !c.routerVeto && c.betType?.key === "CORRECT_SCORE");
      case "BANKER":
        return cards.filter((c) => !c.routerVeto && c.betType?.key === "BANKER");
      case "VETOED":
        return cards.filter((c) => c.routerVeto);
      default:
        return cards;
    }
  }, [cards, filter]);

  // ═══ v13.4 — ترتیب تفکیک‌شده روی «لیست فیلترشده» (بدون دور زدن فیلترها): امروز → آینده → در جریان/گذشته ═══
  const ordered = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const ra = DAY_RANK[tehranDayKind(a.match.kickoff)];
      const rb = DAY_RANK[tehranDayKind(b.match.kickoff)];
      if (ra !== rb) return ra - rb;
      return new Date(a.match.kickoff).getTime() - new Date(b.match.kickoff).getTime();
    });
    return arr;
  }, [filtered]);

  // سطل‌بندی نمای گرید: پنجره امروز تهران (۰..۲۴ ساعت) در برابر بقیه (روزهای آینده + در جریان/گذشته)
  const todayCards = useMemo(() => ordered.filter((c) => tehranDayKind(c.match.kickoff) === "TODAY"), [ordered]);
  const laterCards = useMemo(() => ordered.filter((c) => tehranDayKind(c.match.kickoff) !== "TODAY"), [ordered]);

  // ═══ v8.0 — تحلیل عمیق LLM تقاضامحور (کش ۶۰ دقیقه‌ای + صف سرور ۱۵ ثانیه‌ای) ═══
  const deepLlmFor = useCallback(
    async (matchId: string, lambdaHome: number, silent = false): Promise<boolean> => {
      if (deepLlm[matchId] === "RUNNING") return false;
      // ۱) کش هوشمند با اثر انگشت λ — اگر معتبر، صفر توکن
      const cached = getCachedDebate(matchId, lambdaHome);
      if (cached) {
        const store = useQuantStore.getState();
        store.setDebate(matchId, cached.result);
        store.patchAutopilot(matchId, { debate: cached.result });
        bumpLlmShield("cacheHits");
        setDeepLlm((m) => ({ ...m, [matchId]: "CACHED" }));
        if (!silent) {
          toast.success("⚡ بارگذاری از کش هوشمند (صرفه‌جویی در نرخ API)", {
            description: "پاسخ LLM این بازی با همان امید گل در ۶۰ دقیقه اخیر قبلاً گرفته شده است",
          });
        }
        return true;
      }
      // ۲) فراخوان LLM فقط با تقاضای کاربر — سرور صف ۱۵ ثانیه‌ای دارد
      setDeepLlm((m) => ({ ...m, [matchId]: "RUNNING" }));
      try {
        const res = await fetch("/api/agent/debate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ matchId, mode: "LLM" }),
        });
        const data = (await res.json()) as DebateResultDTO & { error?: string };
        if (!data.success) throw new Error(data.error ?? "LLM failed");
        const store = useQuantStore.getState();
        store.setDebate(matchId, data);
        store.patchAutopilot(matchId, { debate: data });
        setCachedDebate(matchId, lambdaHome, data);
        if (data.rateLimited) {
          bumpLlmShield("rateLimited");
          setDeepLlm((m) => ({ ...m, [matchId]: "RATELIMITED" }));
          toast.warning("⚠️ صف Rate-Limit — نتیجه موتور کمّی محلی نمایش داده شد", {
            description: data.notice ?? "حداکثر ۱ درخواست LLM در هر ۱۵ ثانیه مجاز است",
          });
          return false;
        }
        bumpLlmShield("llmCalls");
        setDeepLlm((m) => ({ ...m, [matchId]: "IDLE" }));
        if (!silent) {
          toast.success("🧠 تحلیل عمیق LLM کامل شد و در کش ۶۰ دقیقه‌ای ذخیره شد", {
            description: "حکم قاضی LLM در پنجره ±۸ واحد درصدی مرجع کمّی قفل شده است",
          });
        }
        return true;
      } catch {
        bumpLlmShield("llmCalls");
        setDeepLlm((m) => ({ ...m, [matchId]: "IDLE" }));
        if (!silent) toast.error("تحلیل عمیق LLM ناموفق بود — موتور کمّی محلی معتبر است");
        return false;
      }
    },
    [deepLlm, bumpLlmShield]
  );

  // ─── تحلیل عمیق ۳ بازی برتر +EV با فاصله ۱۵ ثانیه ───
  const runTop3DeepLlm = useCallback(async () => {
    if (bulkRunning) return;
    const top3 = [...cards].filter((c) => !c.routerVeto).sort((a, b) => b.pair.selectionA.evPct - a.pair.selectionA.evPct).slice(0, 3);
    if (top3.length === 0) return;
    setBulkRunning(true);
    try {
      for (let i = 0; i < top3.length; i++) {
        const c = top3[i];
        if (i > 0) {
          toast.info(`⏳ سپر Rate-Limit: ${LLM_GAP_MS / 1000} ثانیه صبر برای بازی بعدی (${i}/${top3.length - 1})`, {
            description: `${c.match.homeTeam} - ${c.match.awayTeam}`,
          });
          await new Promise((r) => setTimeout(r, LLM_GAP_MS));
        }
        await deepLlmFor(c.match.id, c.lambdaHome, true);
      }
      toast.success("🧠 تحلیل عمیق ۳ بازی برتر +EV کامل شد", {
        description: "نتایج در کش ۶۰ دقیقه‌ای localStorage ذخیره شدند — اسکن پس‌زمینه همچنان صفر توکن است",
      });
    } finally {
      setBulkRunning(false);
    }
  }, [bulkRunning, cards, deepLlmFor]);

  // ایندکس امن بدون افکت — هنگام رندر نرمال می‌شود
  const safeIndex = ordered.length === 0 ? 0 : index % ordered.length;
  let effectiveIndex = safeIndex;

  // «باز کردن فلش‌کارت بازی» از رادار → کاروسل به کارت همان بازی می‌رود
  const [lastWanted, setLastWanted] = useState<string | null>(null);
  if (activeMatchId && activeMatchId !== lastWanted) {
    const wi = ordered.findIndex((c) => c.match.id === activeMatchId);
    if (wi >= 0) {
      setLastWanted(activeMatchId);
      setIndex(wi);
      effectiveIndex = wi;
    }
  }
  const activeKey = ordered.length > 0 ? ordered[effectiveIndex].key : "";

  const go = useCallback(
    (dir: 1 | -1) => setIndex((i) => (ordered.length === 0 ? 0 : (i + dir + ordered.length) % ordered.length)),
    [ordered.length]
  );

  // کلیدهای جهت‌نما برای کاروسل
  useEffect(() => {
    if (view !== "carousel" || filter === "ACCUMULATOR") return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "ArrowLeft") go(1); // در RTL چپ = بعدی
      else if (e.key === "ArrowRight") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, go, filter]);

  const loading = matchesCount > 0 && cards.length < matchesCount;

  // v13.4 — رندر مشترک فلش‌کارت در سکشن‌های گرید (همه رفتارها حفظ شده)
  const cardNode = (c: (typeof ordered)[number]) => (
    <FlashCard
      key={c.key}
      view={c}
      inCart={cart.includes(c.key)}
      onToggleCart={() => toggleCart(c.key)}
      compact={compact}
      onDeepLlm={() => void deepLlmFor(c.match.id, c.lambdaHome)}
      deepLlmState={deepLlm[c.match.id] ?? "IDLE"}
    />
  );

  return (
    <section className="space-y-3" aria-label={title}>
      {/* هدر و فیلترها */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold sm:text-base">
          <span aria-hidden>👑</span>
          {title}
          {cards.length > 0 && (
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300" dir="ltr">
              {faNum(cards.length, 0)}
            </span>
          )}
        </h2>
        <div className="flex flex-wrap items-center gap-1.5">
          {/* v8.0 — سوییچ استراتژی اجرایی ضد گوبینگ (Anti-Gubbing Compliance) */}
          <div
            className="flex items-center gap-0.5 rounded-lg border border-amber-500/30 bg-amber-500/[0.05] p-0.5"
            role="tablist"
            aria-label="استراتژی اجرایی ثبت شرط (انطباق با قوانین سایت‌های شرط‌بندی)"
            title="طبق قوانین ضد آربیتراژ سایت‌های شرط‌بندی، ثبت دو شرط متضاد یک بازی در یک اکانت می‌تواند حساس‌ساز باشد"
          >
            <Button
              size="sm"
              variant="ghost"
              role="tab"
              aria-selected={executionMode === "DUAL_BOOK"}
              className={cn("h-7 gap-1 px-2 text-[10px] sm:text-[11px]", executionMode === "DUAL_BOOK" && "bg-emerald-500/15 text-emerald-300")}
              onClick={() => patchConfig({ executionMode: "DUAL_BOOK" })}
              title="هر تیپ در یک سایت مجزا ثبت می‌شود (تک‌بازی) — صفر ریسک محدودیت حساب"
            >
              <Users className="size-3.5" /> دو سایت مجزا
            </Button>
            <Button
              size="sm"
              variant="ghost"
              role="tab"
              aria-selected={executionMode === "SINGLE_BOOK"}
              className={cn("h-7 gap-1 px-2 text-[10px] sm:text-[11px]", executionMode === "SINGLE_BOOK" && "bg-cyan-500/15 text-cyan-300")}
              onClick={() => patchConfig({ executionMode: "SINGLE_BOOK" })}
              title="پایه امن بازی اول + متغیر دوگانه بازی دوم در دو برگه میکس مجزا — ۱۰۰٪ مجاز در همه سایت‌ها"
            >
              <Store className="size-3.5" /> سایت واحد (میکس ۲ بازی)
            </Button>
          </div>

          {/* v5.0 — تحلیل عمیق ۳ بازی برتر +EV (فقط تقاضای کاربر، با فاصله ۱۵ ثانیه) */}
          {cards.length > 0 && approvedCount > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 border-cyan-500/40 bg-cyan-500/5 px-2 text-[10px] text-cyan-300 hover:bg-cyan-500/15 sm:text-[11px]"
              onClick={runTop3DeepLlm}
              disabled={bulkRunning}
              aria-label="تحلیل عمیق LLM برای ۳ بازی برتر دارای بالاترین ارزش"
            >
              {bulkRunning ? <Loader2 className="size-3 animate-spin" /> : <BrainCircuit className="size-3" />}
              🧠 تحلیل عمیق ۳ بازی برتر +EV
            </Button>
          )}
          <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-0.5" role="tablist" aria-label="نمای دک فلش‌کارت">
            <Button
              size="sm"
              variant="ghost"
              role="tab"
              aria-selected={view === "carousel"}
              className={cn("h-7 gap-1 px-2 text-[11px]", view === "carousel" && "bg-emerald-500/15 text-emerald-300")}
              onClick={() => setView("carousel")}
            >
              <Layers className="size-3.5" /> ورق زدن تکی
            </Button>
            <Button
              size="sm"
              variant="ghost"
              role="tab"
              aria-selected={view === "grid"}
              className={cn("h-7 gap-1 px-2 text-[11px]", view === "grid" && "bg-emerald-500/15 text-emerald-300")}
              onClick={() => setView("grid")}
            >
              <Grid3X3 className="size-3.5" /> گرید وال
            </Button>
          </div>
        </div>
      </div>

      {/* ═══ v17.0 — نوار انتخاب استراتژی (Bet-Type Filter Bar) ═══ */}
      <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="نوار انتخاب استراتژی Bet-Type">
        {FILTERS.map((f) => (
          <Button
            key={f.key}
            size="sm"
            variant="outline"
            role="tab"
            aria-selected={filter === f.key}
            className={cn(
              "h-7 gap-1 rounded-full border-white/10 px-2.5 text-[10px] sm:text-[11px]",
              filter === f.key
                ? f.golden
                  ? "border-amber-500/50 bg-amber-500/15 text-amber-200"
                  : "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                : f.golden
                  ? "border-amber-500/20 text-amber-200/70 hover:bg-amber-500/10"
                  : "text-muted-foreground",
              f.key === "ALL_APPROVED" && filter !== f.key && "border-emerald-500/25 text-emerald-300/80"
            )}
            onClick={() => {
              setFilter(f.key);
              setIndex(0);
            }}
          >
            <f.icon className="size-3" />
            {f.label}
            {f.key in typeCounts && typeCounts[f.key] > 0 && (
              <span className="rounded-full bg-white/10 px-1.5 text-[9px] font-bold" dir="ltr">
                {faNum(typeCounts[f.key], 0)}
              </span>
            )}
          </Button>
        ))}
      </div>

      {/* توضیح حالت اجرایی فعال */}
      <p className="text-[10px] leading-4 text-muted-foreground" role="note">
        {filter === "ACCUMULATOR" ? (
          <>
            📍 فعال: <b className="text-violet-300">🔗 آکومولاتورهای هوشمند روز</b> — میکس زنجیره‌ای ۲ و ۳ پایه‌ای از بهترین بنکرها/کمبوهای تاییدشده در ساعت‌های مختلف + فرمول پوشش زنده پای آخر (Time-Staggered Hedge).
          </>
        ) : executionMode === "DUAL_BOOK" ? (
          <>
            📍 حالت فعال: <b className="text-emerald-300">ثبت در دو سایت مجزا (Dual-Bookmaker Split)</b> — تیپ A در سایت اول و تیپ B در سایت دوم/صرافی ثبت می‌شود تا هرگز دو طرف یک بازی در یک اکانت ثبت نشود.
          </>
        ) : (
          <>
            📍 حالت فعال: <b className="text-cyan-300">ثبت امن در یک سایت واحد (Single-Bookmaker Safe 2-Match Combo)</b> — سوپروایزر پایه امن بازی اول + متغیر دوگانه بازی دوم را در دو برگه میکس مجزا جفت می‌کند؛ طبق قوانین ۱۰۰٪ مجاز.
          </>
        )}
      </p>

      {/* بدنه */}
      {filter === "ACCUMULATOR" ? (
        <AccumulatorCards />
      ) : ordered.length === 0 ? (
        <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-6 text-center">
          {loading || scanning ? (
            <>
              <div className="flex items-center gap-1.5" aria-hidden>
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="size-2 animate-bounce rounded-full bg-emerald-500"
                    style={{ animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                خلبان خودکار در حال اجرای مسیریاب غیرخطی ۵ رژیمی (۱۰٬۰۰۰ شبیه‌سازی مونت‌کارلو × ۴ روش Bet-Type) است…
              </p>
              <div className="grid w-full max-w-md grid-cols-3 gap-2" aria-hidden>
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-24 rounded-xl bg-white/5" />
                ))}
              </div>
            </>
          ) : filter === "ALL_APPROVED" && cards.length > 0 ? (
            <>
              <ShieldOff className="size-6 text-rose-400" />
              <p className="text-xs leading-5 text-muted-foreground">
                🛡️ در اسکن جاری <b className="text-foreground">{faNum(vetoedCount, 0)}</b> بازی ممیزی شد و همه توسط گیت غیرخطی سوپروایزر وتو شدند
                (شارپ منفی در هر ۴ روش Bet-Type) — <b className="text-emerald-300">عدم پیشنهاد شرط</b>. فیلتر «وتو شده» را ببینید.
              </p>
            </>
          ) : (
            <>
              <Sparkles className="size-6 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                هنوز فلش‌کارتی با این استراتژی ساخته نشده — نوار Bet-Type دیگری را امتحان کنید یا صبر کنید اسکن بعدی کامل شود.
              </p>
            </>
          )}
        </div>
      ) : view === "carousel" ? (
        <div className="relative" tabIndex={0} aria-label="کاروسل فلش‌کارت — با کلیدهای جهت‌نما جابه‌جا شوید">
          <div className="flex justify-center px-8">
            <div className="w-full max-w-md">
              {activeKey && (
                <>
                  {/* v13.4 — نشان قرصی دسته روز: بازی امروز / روزهای آینده / در جریان (فقط نمای کاروسل) */}
                  <div className="mb-2 flex justify-center">
                    <span
                      className={cn(
                        "inline-flex h-7 items-center gap-1 rounded-full border px-3 text-[10px] font-semibold sm:text-[11px]",
                        DAY_PILL[tehranDayKind(ordered[effectiveIndex].match.kickoff)].cls
                      )}
                      aria-label={DAY_PILL[tehranDayKind(ordered[effectiveIndex].match.kickoff)].label}
                    >
                      {DAY_PILL[tehranDayKind(ordered[effectiveIndex].match.kickoff)].label}
                    </span>
                  </div>
                  <FlashCard
                    key={activeKey}
                    view={ordered[effectiveIndex]}
                    inCart={cart.includes(activeKey)}
                    onToggleCart={() => toggleCart(activeKey)}
                    compact={compact}
                    onDeepLlm={() => void deepLlmFor(ordered[effectiveIndex].match.id, ordered[effectiveIndex].lambdaHome)}
                    deepLlmState={deepLlm[ordered[effectiveIndex].match.id] ?? "IDLE"}
                  />
                </>
              )}
            </div>
          </div>
          <Button
            size="icon"
            variant="outline"
            className="absolute right-1 top-1/2 size-9 -translate-y-1/2 rounded-full border-white/15 bg-black/40"
            onClick={() => go(-1)}
            aria-label="کارت قبلی"
          >
            <ChevronRight className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            className="absolute left-1 top-1/2 size-9 -translate-y-1/2 rounded-full border-white/15 bg-black/40"
            onClick={() => go(1)}
            aria-label="کارت بعدی"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <p className="mt-2 text-center text-[11px] text-muted-foreground" aria-live="polite">
            کارت <b className="font-num" dir="ltr">{index + 1}</b> از <b className="font-num" dir="ltr">{ordered.length}</b> · با کلیدهای جهت‌نما هم می‌توانید ورق بزنید
          </p>
          {/* v13.4 — ساعت محلی کیک‌آف با برچسب تهران */}
          {activeKey && (
            <p className="mt-0.5 text-center text-[10px] text-muted-foreground" dir="rtl">
              ⏰ کیک‌آف: <b className="font-num text-foreground/80">{TEHRAN_TIME.format(new Date(ordered[effectiveIndex].match.kickoff))}</b> تهران
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {/* v13.4 — گرید دو‌سکشنی: فلش‌کارت‌های بازی‌های امروز جدا از روزهای آینده */}
          {todayCards.length > 0 && (
            <section className="space-y-2" aria-label="فلش‌کارت‌های بازی‌های امروز">
              <div className="flex items-center gap-2">
                <h3 className="flex items-center gap-1.5 text-xs font-bold text-emerald-300">
                  <span aria-hidden>⚽</span>
                  فلش‌کارت‌های بازی‌های امروز
                </h3>
                <span
                  className="inline-flex h-7 items-center rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 text-[10px] font-semibold text-emerald-300"
                  dir="ltr"
                >
                  {faNum(todayCards.length, 0)}
                </span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{todayCards.map(cardNode)}</div>
            </section>
          )}
          {laterCards.length > 0 && (
            <section className="space-y-2" aria-label="فلش‌کارت‌های بازی‌های روزهای آینده">
              <div className="flex items-center gap-2">
                <h3 className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
                  <span aria-hidden>📅</span>
                  فلش‌کارت‌های بازی‌های روزهای آینده
                </h3>
                <span
                  className="inline-flex h-7 items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 text-[10px] font-semibold text-amber-300"
                  dir="ltr"
                >
                  {faNum(laterCards.length, 0)}
                </span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{laterCards.map(cardNode)}</div>
            </section>
          )}
        </div>
      )}
    </section>
  );
}
