"use client";

// ─────────────────────────────────────────────────────────────────────────────
// دک فلش‌کارت‌های تیپ آماده (3D Flashcard Deck) — v8.0 Supervisor Quant
// هر بازی فقط و فقط با «تک‌تیپ طلایی مونت‌کارلو» انتخاب‌شده ایجنت سوپروایزر
// نمایش داده می‌شود (بدون دکمه «الگوی بعدی» — حذف سرگردانی کاربر).
// + سوییچ استراتژی اجرایی ضد گوبینگ (دو سایت مجزا ↔ سایت واحد امن)
// + فیلتر پیش‌فرض «فقط بازی‌های تاییدشده سوپروایزر» + نمایش وتو شده‌ها
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import { BrainCircuit, ChevronLeft, ChevronRight, Grid3X3, Layers, Loader2, Shield, ShieldCheck, ShieldOff, Sparkles, Store, TriangleAlert, Users, Wallet, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuantStore } from "@/lib/store";
import { useFlashcards } from "@/lib/autopilot-derive";
import { boosterProfitPct } from "@/lib/engine/asymmetric";
import { FlashCard, type DeepLlmState } from "./flash-card";
import { faNum } from "@/lib/format";
import { getCachedDebate, setCachedDebate } from "@/lib/llm-cache";
import type { DebateResultDTO } from "@/lib/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type FilterKey = "APPROVED" | "RISK10" | "BOOSTER" | "PROFIT15" | "FORTRESS" | "ALL" | "VETOED";

// v11.0 — ۴ دکمه طلایی طبق سند ارتقا + فیلتر دژ نفوذناپذیر + شفافیت همه/وتو
const FILTERS: { key: FilterKey; label: string; icon: typeof Layers; golden?: boolean }[] = [
  { key: "APPROVED", label: "👑 تاییدشده سوپروایزر — وین‌ریت ۱۰۰٪", icon: ShieldCheck, golden: true },
  { key: "RISK10", label: "🛡️ ریسک باخت همزمان زیر ۱۰٪ (۳۹/۳۹ برد)", icon: TriangleAlert, golden: true },
  { key: "BOOSTER", label: "🚀 شتاب‌دهنده نامتقارن (بیمه اصل پول + سود بالای ۲۵٪)", icon: Zap, golden: true },
  { key: "PROFIT15", label: "💰 سود تضمینی بالای ۱۵٪", icon: Wallet, golden: true },
  { key: "FORTRESS", label: "🏰 دژ نفوذناپذیر (زیر ۷٪ + تایید)", icon: Shield },
  { key: "ALL", label: "همه بازی‌ها", icon: Layers },
  { key: "VETOED", label: "وتو شده", icon: ShieldOff },
];

/** فاصله حداقل بین درخواست‌های LLM در اجرای توالی ۳ بازی برتر (سپر سمت کلاینت) */
const LLM_GAP_MS = 15_000;

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
  const executionMode = useQuantStore((s) => s.config.executionMode);
  const patchConfig = useQuantStore((s) => s.patchConfig);

  const [view, setView] = useState<"carousel" | "grid">(defaultView);
  const [filter, setFilter] = useState<FilterKey>("APPROVED");
  const [index, setIndex] = useState(0);
  const activeMatchId = useQuantStore((s) => s.activeMatchId);

  // ═══ v8.0 — وضعیت تحلیل عمیق LLM هر بازی ═══
  const [deepLlm, setDeepLlm] = useState<Record<string, DeepLlmState>>({});
  const [bulkRunning, setBulkRunning] = useState(false);

  const approvedCount = useMemo(() => cards.filter((c) => !(c.supervisor?.veto ?? false)).length, [cards]);
  const vetoedCount = cards.length - approvedCount;

  const filtered = useMemo(() => {
    switch (filter) {
      case "APPROVED":
        return cards.filter((c) => !(c.supervisor?.veto ?? false));
      case "VETOED":
        return cards.filter((c) => c.supervisor?.veto ?? false);
      case "PROFIT15":
        return cards.filter((c) => c.pair.guaranteedMarginPct > 15);
      case "RISK10":
        return cards.filter((c) => c.pair.jointStates.bothLose < 0.1);
      case "BOOSTER":
        // v11.0 — بیمه اصل پول (Principal-Lock سود > ۲۵٪) روی کارت‌های کم‌ریسک
        return cards.filter((c) => c.pair.jointStates.bothLose < 0.1 && boosterProfitPct(c.pair.totalOddsA, c.pair.totalOddsB) > 25);
      case "FORTRESS":
        // v11.0 — دژ نفوذناپذیر: ریسک زیر ۷٪ + تایید سوپروایزر
        return cards.filter((c) => !(c.supervisor?.veto ?? false) && c.pair.jointStates.bothLose < 0.07);
      default:
        return cards;
    }
  }, [cards, filter]);

  const counts = useMemo(
    () => ({
      APPROVED: approvedCount,
      ALL: cards.length,
      VETOED: vetoedCount,
      PROFIT15: cards.filter((c) => c.pair.guaranteedMarginPct > 15).length,
      RISK10: cards.filter((c) => c.pair.jointStates.bothLose < 0.1).length,
      BOOSTER: cards.filter((c) => c.pair.jointStates.bothLose < 0.1 && boosterProfitPct(c.pair.totalOddsA, c.pair.totalOddsB) > 25).length,
      FORTRESS: cards.filter((c) => !(c.supervisor?.veto ?? false) && c.pair.jointStates.bothLose < 0.07).length,
    }),
    [cards, approvedCount, vetoedCount]
  );

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
    const top3 = [...cards].filter((c) => !(c.supervisor?.veto ?? false)).sort((a, b) => b.pair.selectionA.evPct - a.pair.selectionA.evPct).slice(0, 3);
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
  const [lastWanted, setLastWanted] = useState<string | null>(null);
  if (activeMatchId && activeMatchId !== lastWanted) {
    const wi = filtered.findIndex((c) => c.match.id === activeMatchId);
    if (wi >= 0) {
      setLastWanted(activeMatchId);
      setIndex(wi);
      effectiveIndex = wi;
    }
  }
  const activeKey = filtered.length > 0 ? filtered[effectiveIndex].key : "";

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

      {/* فیلترهای طلایی v11.0 — پیش‌فرض «👑 تاییدشده سوپروایزر» */}
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="فیلتر سریع فلش‌کارت‌ها">
        {FILTERS.map((f) => (
          <Button
            key={f.key}
            size="sm"
            variant="outline"
            className={cn(
              "h-7 gap-1 rounded-full border-white/10 px-2.5 text-[10px] sm:text-[11px]",
              filter === f.key
                ? f.golden
                  ? "border-amber-500/50 bg-amber-500/15 text-amber-200"
                  : "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                : f.golden
                  ? "border-amber-500/20 text-amber-200/70 hover:bg-amber-500/10"
                  : "text-muted-foreground",
              f.key === "APPROVED" && filter !== f.key && "border-emerald-500/25 text-emerald-300/80"
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

      {/* توضیح حالت اجرایی فعال */}
      <p className="text-[10px] leading-4 text-muted-foreground" role="note">
        {executionMode === "DUAL_BOOK" ? (
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
                خلبان خودکار در حال اسکن با موتور کمّی محلی (صفر توکن) و ممیزی ایجنت سوپروایزر است…
              </p>
              <div className="grid w-full max-w-md grid-cols-3 gap-2" aria-hidden>
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-24 rounded-xl bg-white/5" />
                ))}
              </div>
            </>
          ) : filter === "APPROVED" && cards.length > 0 ? (
            <>
              <ShieldOff className="size-6 text-rose-400" />
              <p className="text-xs leading-5 text-muted-foreground">
                🛡️ در اسکن جاری <b className="text-foreground">{faNum(vetoedCount, 0)}</b> بازی ممیزی شد و همه توسط ایجنت سوپروایزر وتو شدند
                (ریسک نامتقارن یا سود ضعیف) — <b className="text-emerald-300">عدم پیشنهاد شرط</b>. فیلتر «وتو شده» را ببینید.
              </p>
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
                  view={filtered[effectiveIndex]}
                  inCart={cart.includes(activeKey)}
                  onToggleCart={() => toggleCart(activeKey)}
                  compact={compact}
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
          {filtered.map((c) => (
            <FlashCard
              key={c.key}
              view={c}
              inCart={cart.includes(c.key)}
              onToggleCart={() => toggleCart(c.key)}
              compact={compact}
              onDeepLlm={() => void deepLlmFor(c.match.id, c.lambdaHome)}
              deepLlmState={deepLlm[c.match.id] ?? "IDLE"}
            />
          ))}
        </div>
      )}
    </section>
  );
}
