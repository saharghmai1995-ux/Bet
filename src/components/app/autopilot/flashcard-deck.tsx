"use client";

// ─────────────────────────────────────────────────────────────────────────────
// دک فلش‌کارت‌های تیپ آماده (3D Flashcard Deck) — v5.0
// دو نما: کاروسل ۳بعدی با کلیدهای جهت‌نما ↔ گرید وال | فیلترهای سریع
// v5.0: سوییچر ۵ الگوی متعامد + تحلیل عمیق LLM تقاضامحور (کش ۶۰ دقیقه +
// صف ۱۵ ثانیه‌ای) + دکمه «تحلیل عمیق ۳ بازی برتر +EV»
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import { BrainCircuit, ChevronLeft, ChevronRight, Grid3X3, Layers, Loader2, Sparkles, TriangleAlert, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuantStore } from "@/lib/store";
import { buildFlashcard, useFlashcards } from "@/lib/autopilot-derive";
import { FlashCard, type DeepLlmState } from "./flash-card";
import { faNum } from "@/lib/format";
import { getCachedDebate, setCachedDebate } from "@/lib/llm-cache";
import type { DebateResultDTO, PortfolioPairDTO } from "@/lib/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type FilterKey = "ALL" | "PROFIT15" | "RISK10" | "DOUBLE";

const FILTERS: { key: FilterKey; label: string; icon: typeof Layers }[] = [
  { key: "ALL", label: "همه بازی‌ها", icon: Layers },
  { key: "PROFIT15", label: "سود تضمینی بالای ۱۵٪", icon: Wallet },
  { key: "RISK10", label: "ریسک باخت همزمان زیر ۱۰٪", icon: TriangleAlert },
  { key: "DOUBLE", label: "فرصت‌های Double-Win", icon: Sparkles },
];

/** فاصله حداقل بین درخواست‌های LLM در اجرای توالی ۳ بازی برتر (سپر سمت کلاینت) */
const LLM_GAP_MS = 15_000;

interface OrthoState {
  pairs: PortfolioPairDTO[];
  idx: number;
  loading: boolean;
  loaded: boolean;
}

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
  const autopilot = useQuantStore((s) => s.autopilot);
  const bumpLlmShield = useQuantStore((s) => s.bumpLlmShield);

  const [view, setView] = useState<"carousel" | "grid">(defaultView);
  const [filter, setFilter] = useState<FilterKey>("ALL");
  const [index, setIndex] = useState(0);
  const activeMatchId = useQuantStore((s) => s.activeMatchId);

  // ═══ v5.0 — سوییچر الگوهای متعامد ═══
  const [ortho, setOrtho] = useState<Record<string, OrthoState>>({});
  // ═══ v5.0 — وضعیت تحلیل عمیق LLM هر بازی ═══
  const [deepLlm, setDeepLlm] = useState<Record<string, DeepLlmState>>({});
  const [bulkRunning, setBulkRunning] = useState(false);

  const filtered = useMemo(() => {
    switch (filter) {
      case "PROFIT15":
        return cards.filter((c) => c.pair.guaranteedMarginPct > 15);
      case "RISK10":
        return cards.filter((c) => c.pair.jointStates.bothLose < 0.1);
      case "DOUBLE":
        return cards.filter((c) => c.pair.structure.doubleWin);
      default:
        return cards;
    }
  }, [cards, filter]);

  const counts = useMemo(
    () => ({
      ALL: cards.length,
      PROFIT15: cards.filter((c) => c.pair.guaranteedMarginPct > 15).length,
      RISK10: cards.filter((c) => c.pair.jointStates.bothLose < 0.1).length,
      DOUBLE: cards.filter((c) => c.pair.structure.doubleWin).length,
    }),
    [cards]
  );

  /** نمای نهایی هر کارت: اگر کاربر الگو عوض کرده، زوج متعامد جایگزین می‌شود */
  const viewOf = useCallback(
    (base: (typeof cards)[number]) => {
      const st = ortho[base.match.id];
      if (!st || st.idx === 0 || !st.pairs[st.idx]) return base;
      const pair = st.pairs[st.idx];
      const ap = autopilot[base.match.id];
      return buildFlashcard(base.match, pair, ap?.debate ?? null, ap?.lineup ?? null, ap?.portfolio ?? null);
    },
    [ortho, autopilot]
  );

  const fetchArchetypes = useCallback(async (matchId: string): Promise<PortfolioPairDTO[]> => {
    const res = await fetch("/api/agent/orthogonal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchId }),
    });
    const data = (await res.json()) as { success: boolean; pairs?: PortfolioPairDTO[] };
    return data.success && data.pairs ? data.pairs : [];
  }, []);

  const switchArchetype = useCallback(
    async (matchId: string) => {
      const cur = ortho[matchId];
      if (cur?.loading) return;
      if (cur?.loaded && cur.pairs.length > 0) {
        setOrtho((m) => ({ ...m, [matchId]: { ...cur, idx: (cur.idx + 1) % cur.pairs.length } }));
        return;
      }
      setOrtho((m) => ({ ...m, [matchId]: { pairs: [], idx: 0, loading: true, loaded: false } }));
      try {
        const pairs = await fetchArchetypes(matchId);
        if (pairs.length === 0) {
          toast.error("الگوی متعامد برای این بازی ساخته نشد");
          setOrtho((m) => ({ ...m, [matchId]: { pairs: [], idx: 0, loading: false, loaded: true } }));
          return;
        }
        // پیشنهاد رسمی (الگوی اول) از قبل روی کارت است — اولین کلیک مستقیم به الگوی دوم می‌رود
        const startIdx = pairs.length > 1 ? 1 : 0;
        setOrtho((m) => ({ ...m, [matchId]: { pairs, idx: startIdx, loading: false, loaded: true } }));
        toast.success(`۵ الگوی متعامد از ۱۵ بازار ساخته شد — الگوی «${pairs[startIdx].archetype?.short ?? ""}» فعال شد`, {
          description: "با دکمه «الگوی بعدی» بین ۵ روایت متضاد همان بازی سوییچ کنید",
        });
      } catch {
        toast.error("خطا در ساخت الگوهای متعامد");
        setOrtho((m) => ({ ...m, [matchId]: { pairs: [], idx: 0, loading: false, loaded: true } }));
      }
    },
    [ortho, fetchArchetypes]
  );

  // ═══ v5.0 — تحلیل عمیق LLM تقاضامحور (کش ۶۰ دقیقه‌ای + صف سرور ۱۵ ثانیه‌ای) ═══
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
    const top3 = [...cards].sort((a, b) => b.pair.selectionA.evPct - a.pair.selectionA.evPct).slice(0, 3);
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
  const safeIndex = filtered.length === 0 ? 0 : index % filtered.length;
  let effectiveIndex = safeIndex;

  // «باز کردن فلش‌کارت بازی» از رادار → کاروسل به کارت همان بازی می‌رود
  // (الگوی رسمی «تنظیم وضعیت هنگام رندر» — بدون افکت)
  const [lastWanted, setLastWanted] = useState<string | null>(null);
  if (activeMatchId && activeMatchId !== lastWanted) {
    const wi = filtered.findIndex((c) => c.match.id === activeMatchId);
    if (wi >= 0) {
      setLastWanted(activeMatchId);
      setIndex(wi);
      effectiveIndex = wi;
    }
  }
  const activeKey = filtered.length > 0 ? viewOf(filtered[effectiveIndex]).key : "";

  const go = useCallback(
    (dir: 1 | -1) => setIndex((i) => (filtered.length === 0 ? 0 : (i + dir + filtered.length) % filtered.length)),
    [filtered.length]
  );

  // کلیدهای جهت‌نما برای کاروسل
  useEffect(() => {
    if (view !== "carousel") return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "ArrowLeft") go(1); // در RTL چپ = بعدی
      else if (e.key === "ArrowRight") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, go]);

  const loading = matchesCount > 0 && cards.length < matchesCount;

  return (
    <section className="space-y-3" aria-label={title}>
      {/* هدر و فیلترها */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold sm:text-base">
          <span aria-hidden>🎴</span>
          {title}
          {cards.length > 0 && (
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300" dir="ltr">
              {faNum(cards.length, 0)}
            </span>
          )}
        </h2>
        <div className="flex flex-wrap items-center gap-1.5">
          {/* v5.0 — تحلیل عمیق ۳ بازی برتر +EV (فقط تقاضای کاربر، با فاصله ۱۵ ثانیه) */}
          {cards.length > 0 && (
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

      {/* فیلترهای سریع */}
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="فیلتر سریع فلش‌کارت‌ها">
        {FILTERS.map((f) => (
          <Button
            key={f.key}
            size="sm"
            variant="outline"
            className={cn(
              "h-7 gap-1 rounded-full border-white/10 px-2.5 text-[10px] sm:text-[11px]",
              filter === f.key ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300" : "text-muted-foreground"
            )}
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
          >
            <f.icon className="size-3" />
            {f.label}
            <span className="rounded-full bg-white/10 px-1 text-[9px]" dir="ltr">{faNum(counts[f.key], 0)}</span>
          </Button>
        ))}
      </div>

      {/* بدنه */}
      {filtered.length === 0 ? (
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
                خلبان خودکار در حال اسکن با موتور کمّی محلی (صفر توکن) و ساخت زوج‌تیپ‌های متعامد است…
              </p>
              <div className="grid w-full max-w-md grid-cols-3 gap-2" aria-hidden>
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-24 rounded-xl bg-white/5" />
                ))}
              </div>
            </>
          ) : (
            <>
              <Sparkles className="size-6 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                هنوز فلش‌کارتی با این فیلتر ساخته نشده — فیلتر دیگری را امتحان کنید یا صبر کنید اسکن بعدی کامل شود.
              </p>
            </>
          )}
        </div>
      ) : view === "carousel" ? (
        <div className="relative" tabIndex={0} aria-label="کاروسل فلش‌کارت — با کلیدهای جهت‌نما جابه‌جا شوید">
          <div className="flex justify-center px-8">
            <div className="w-full max-w-md">
              {activeKey && (
                <FlashCard
                  key={activeKey}
                  view={viewOf(filtered[effectiveIndex])}
                  inCart={cart.includes(activeKey)}
                  onToggleCart={() => toggleCart(activeKey)}
                  compact={compact}
                  onSwitchArchetype={() => void switchArchetype(filtered[effectiveIndex].match.id)}
                  archetypeLoading={ortho[filtered[effectiveIndex].match.id]?.loading ?? false}
                  hasArchetypes
                  onDeepLlm={() => void deepLlmFor(filtered[effectiveIndex].match.id, filtered[effectiveIndex].lambdaHome)}
                  deepLlmState={deepLlm[filtered[effectiveIndex].match.id] ?? "IDLE"}
                />
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
            کارت <b className="font-num" dir="ltr">{index + 1}</b> از <b className="font-num" dir="ltr">{filtered.length}</b> · با کلیدهای جهت‌نما هم می‌توانید ورق بزنید
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c) => {
            const v = viewOf(c);
            return (
              <FlashCard
                key={c.key}
                view={v}
                inCart={cart.includes(v.key)}
                onToggleCart={() => toggleCart(v.key)}
                compact={compact}
                onSwitchArchetype={() => void switchArchetype(c.match.id)}
                archetypeLoading={ortho[c.match.id]?.loading ?? false}
                hasArchetypes
                onDeepLlm={() => void deepLlmFor(c.match.id, c.lambdaHome)}
                deepLlmState={deepLlm[c.match.id] ?? "IDLE"}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}
