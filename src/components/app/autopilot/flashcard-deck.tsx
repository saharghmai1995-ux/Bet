"use client";

// ─────────────────────────────────────────────────────────────────────────────
// دک فلش‌کارت‌های تیپ آماده (3D Flashcard Deck) — v3.0
// دو نما: کاروسل ۳بعدی با کلیدهای جهت‌نما ↔ گرید وال | فیلترهای سریع
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Grid3X3, Layers, Sparkles, TriangleAlert, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuantStore } from "@/lib/store";
import { useFlashcards } from "@/lib/autopilot-derive";
import { FlashCard } from "./flash-card";
import { faNum } from "@/lib/format";
import { cn } from "@/lib/utils";

type FilterKey = "ALL" | "PROFIT15" | "RISK10" | "DOUBLE";

const FILTERS: { key: FilterKey; label: string; icon: typeof Layers }[] = [
  { key: "ALL", label: "همه بازی‌ها", icon: Layers },
  { key: "PROFIT15", label: "سود تضمینی بالای ۱۵٪", icon: Wallet },
  { key: "RISK10", label: "ریسک باخت همزمان زیر ۱۰٪", icon: TriangleAlert },
  { key: "DOUBLE", label: "فرصت‌های Double-Win", icon: Sparkles },
];

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

  const [view, setView] = useState<"carousel" | "grid">(defaultView);
  const [filter, setFilter] = useState<FilterKey>("ALL");
  const [index, setIndex] = useState(0);
  const activeMatchId = useQuantStore((s) => s.activeMatchId);

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
          <span aria-hidden>🎴</span>
          {title}
          {cards.length > 0 && (
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300" dir="ltr">
              {faNum(cards.length, 0)}
            </span>
          )}
        </h2>
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
                خلبان خودکار در حال اسکن و ساخت زوج‌تیپ‌های مکمل است…
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
                  view={filtered[effectiveIndex]}
                  inCart={cart.includes(activeKey)}
                  onToggleCart={() => toggleCart(activeKey)}
                  compact={compact}
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
            />
          ))}
        </div>
      )}
    </section>
  );
}
