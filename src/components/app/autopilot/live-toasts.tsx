"use client";

// ─────────────────────────────────────────────────────────────────────────────
// ویجت هشدار پوشش زنده (Live In-Play Auto-Trigger Toast) — v5.0 (رابط ۳)
// هنگام گل / حرکت تند ضریب، توست شیشه‌ای «کوچک» بالای صفحه با مبلغ دقیق پوشش
// زنده — v5.0: ابعاد فشرده + حذف خودکار پس از ۱۰ ثانیه با نوار شمارش معکوس.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { Check, Radio, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuantStore } from "@/lib/store";
import { faNum } from "@/lib/format";
import { cn } from "@/lib/utils";

const EVENT_LABELS: Record<string, string> = {
  GOAL_HOME: "گل میزبان!",
  GOAL_AWAY: "گل میهمان!",
  RED_HOME: "کارت قرمز میزبان!",
  RED_AWAY: "کارت قرمز میهمان!",
};

/** v5.0 — حذف خودکار توست پس از ۱۰ ثانیه */
const AUTO_DISMISS_MS = 10_000;

function ToastItem({ id }: { id: string }) {
  const toast = useQuantStore((s) => s.liveToasts.find((t) => t.id === id));
  const actionLiveToast = useQuantStore((s) => s.actionLiveToast);
  const dismissLiveToast = useQuantStore((s) => s.dismissLiveToast);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // v5.0: حذف خودکار توست بی‌پاسخ پس از ۱۰ ثانیه (قبلاً ۹۰ ثانیه)
  useEffect(() => {
    if (!toast || toast.actioned) return;
    const timer = setTimeout(() => dismissLiveToast(toast.id), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [toast, dismissLiveToast]);

  if (!toast) return null;

  const hedge = toast.hedge;
  const isHedge = toast.recommendation === "HEDGE" && hedge;
  const remainPct = Math.max(0, 100 - (elapsed * 1000 * 100) / AUTO_DISMISS_MS);
  const remainSec = Math.max(0, Math.ceil((AUTO_DISMISS_MS - elapsed * 1000) / 1000));

  return (
    <div
      role="alert"
      className={cn(
        "pointer-events-auto w-[min(84vw,272px)] overflow-hidden rounded-xl border shadow-xl backdrop-blur-xl animate-in slide-in-from-top-3 fade-in",
        isHedge ? "border-emerald-400/40 bg-[rgba(7,20,16,0.92)] shadow-emerald-900/40" : "border-amber-400/30 bg-[rgba(20,16,7,0.92)]"
      )}
    >
      {/* نوار شمارش معکوس حذف خودکار (۱۰ ثانیه) */}
      <div className="h-0.5 w-full bg-white/10" aria-hidden>
        <div
          className={cn("h-0.5 transition-all duration-1000 ease-linear", isHedge ? "bg-emerald-400" : "bg-amber-400")}
          style={{ width: `${remainPct}%` }}
        />
      </div>

      <div className="p-2">
        <div className="flex items-start justify-between gap-1.5">
          <p className="flex flex-wrap items-center gap-1 text-[10px] font-bold">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500/60" />
              <span className="relative inline-flex size-1.5 rounded-full bg-rose-500" />
            </span>
            <Radio className="size-3 text-rose-400" />
            {EVENT_LABELS[toast.event] ?? "رویداد زنده"}
            {/* v6.1 — نشان منبع دیتا: ESPN زنده (واقعی) یا تست دستی موتور */}
            {toast.source === "MANUAL" ? (
              <span className="rounded bg-amber-500/15 px-1 py-px text-[8px] font-bold text-amber-300">تست دستی</span>
            ) : (
              <span className="rounded bg-emerald-500/15 px-1 py-px text-[8px] font-bold text-emerald-300" title="فید رسمی ESPN">ESPN زنده</span>
            )}
            · دقیقه <b dir="ltr">{faNum(toast.minute, 0)}</b>
            {toast.clock && <span className="font-num text-[9px] text-muted-foreground" dir="ltr">({toast.clock})</span>}
            <span className="font-num text-muted-foreground" dir="ltr">({toast.score})</span>
          </p>
          <div className="flex shrink-0 items-center gap-1">
            <span className="font-num text-[9px] text-white/30" dir="ltr" aria-label="ثانیه تا حذف خودکار">-{remainSec}s</span>
            <Button size="icon" variant="ghost" className="size-5 text-muted-foreground hover:text-foreground" onClick={() => dismissLiveToast(toast.id)} aria-label="بستن هشدار">
              <X className="size-3" />
            </Button>
          </div>
        </div>

        <p className="mt-0.5 truncate text-[9px] text-muted-foreground">
          {toast.matchLabel} · سناریو: {toast.scenarioLabel}
        </p>

        {isHedge && hedge ? (
          <div className="mt-1 rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-1.5 text-[9px]">
            <p className="font-semibold text-emerald-300">فرصت پوشش زنده:</p>
            <p className="mt-0.5 leading-3.5 text-foreground/90">
              الان روی <b>{hedge.targetLabel}</b> ×<b className="font-num" dir="ltr">{hedge.targetOdds.toFixed(2)}</b> مبلغ{" "}
              <b className="font-num text-emerald-300" dir="ltr">{faNum(hedge.stake, 1)}</b> واحد — سود تضمینی:{" "}
              <b dir="ltr" className="text-emerald-300">+{faNum(hedge.profitIfHedge, 1)}</b>
            </p>
            <p className="mt-0.5 truncate text-[8px] text-muted-foreground">
              (پیش‌بازی: {toast.preBet.label} ×{faNum(toast.preBet.stake, 1)} · سود آن سناریو: +{faNum(hedge.profitIfPre, 1)})
            </p>
          </div>
        ) : (
          <p className="mt-1 line-clamp-2 rounded-lg border border-white/10 bg-white/[0.04] p-1.5 text-[9px] leading-3.5 text-foreground/85">
            {toast.message}
          </p>
        )}

        <div className="mt-1 flex items-center gap-1.5">
          {isHedge ? (
            <Button
              size="sm"
              className={cn(
                "h-6 flex-1 gap-1 bg-emerald-600 text-[9px] hover:bg-emerald-500",
                toast.actioned && "bg-emerald-800/60"
              )}
              disabled={toast.actioned}
              onClick={() => actionLiveToast(toast.id)}
            >
              {toast.actioned ? (
                <>
                  <Check className="size-3" /> پوشش ثبت شد
                </>
              ) : (
                <>تایید و ثبت پوشش زنده</>
              )}
            </Button>
          ) : (
            <span className="flex-1 truncate text-[9px] text-muted-foreground">توصیه موتور: نگهداشتن تیپ (HOLD)</span>
          )}
        </div>
      </div>
    </div>
  );
}

export function LiveHedgeToasts() {
  const liveToasts = useQuantStore((s) => s.liveToasts);
  if (liveToasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-24 z-50 flex flex-col items-center gap-1.5 px-4" aria-live="polite" aria-label="هشدارهای پوشش زنده">
      {liveToasts.map((t) => (
        <ToastItem key={t.id} id={t.id} />
      ))}
    </div>
  );
}
