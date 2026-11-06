"use client";

// ─────────────────────────────────────────────────────────────────────────────
// ویجت هشدار پوشش زنده (Live In-Play Auto-Trigger Toast) — v3.0 (رابط ۳)
// هنگام گل / حرکت تند ضریب، توست شیشه‌ای بالای صفحه با مبلغ دقیق پوشش
// زنده و دکمه تایید — بدون نیاز به رفتن به تب زنده.
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

function ToastItem({ id }: { id: string }) {
  const toast = useQuantStore((s) => s.liveToasts.find((t) => t.id === id));
  const actionLiveToast = useQuantStore((s) => s.actionLiveToast);
  const dismissLiveToast = useQuantStore((s) => s.dismissLiveToast);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // حذف خودکار توست بی‌پاسخ پس از ۹۰ ثانیه
  useEffect(() => {
    if (!toast || toast.actioned) return;
    const timer = setTimeout(() => dismissLiveToast(toast.id), 90_000);
    return () => clearTimeout(timer);
  }, [toast, dismissLiveToast]);

  if (!toast) return null;

  const hedge = toast.hedge;
  const isHedge = toast.recommendation === "HEDGE" && hedge;

  return (
    <div
      role="alert"
      className={cn(
        "pointer-events-auto w-[min(92vw,420px)] overflow-hidden rounded-2xl border p-3 shadow-2xl backdrop-blur-xl animate-in slide-in-from-top-4 fade-in",
        isHedge ? "border-emerald-400/40 bg-[rgba(7,20,16,0.92)] shadow-emerald-900/40" : "border-amber-400/30 bg-[rgba(20,16,7,0.92)]"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-bold">
          <span className="relative flex size-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500/60" />
            <span className="relative inline-flex size-2 rounded-full bg-rose-500" />
          </span>
          <Radio className="size-3.5 text-rose-400" />
          {EVENT_LABELS[toast.event] ?? "رویداد زنده"} · دقیقه <b dir="ltr">{faNum(toast.minute, 0)}</b>
          <span className="font-num text-muted-foreground" dir="ltr">({toast.score})</span>
        </p>
        <Button size="icon" variant="ghost" className="size-6 text-muted-foreground hover:text-foreground" onClick={() => dismissLiveToast(toast.id)} aria-label="بستن هشدار">
          <X className="size-3.5" />
        </Button>
      </div>

      <p className="mt-1 text-[11px] text-muted-foreground">
        {toast.matchLabel} · سناریوی موتور: {toast.scenarioLabel}
      </p>

      {isHedge && hedge ? (
        <div className="mt-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-2.5 text-[11px]">
          <p className="font-semibold text-emerald-300">فرصت پوشش زنده شناسایی شد:</p>
          <p className="mt-1 leading-5 text-foreground/90">
            الان روی <b>{hedge.targetLabel}</b> با ضریب <b className="font-num" dir="ltr">{hedge.targetOdds.toFixed(2)}</b> مبلغ{" "}
            <b className="font-num text-emerald-300" dir="ltr">{faNum(hedge.stake, 1)}</b> واحد ببند —
            سود تضمینی در هر دو سناریو:{" "}
            <b dir="ltr" className="text-emerald-300">+{faNum(hedge.profitIfHedge, 1)}</b>
          </p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            (تیپ پیش‌بازی: {toast.preBet.label} با استیک {faNum(toast.preBet.stake, 1)} · سود آن سناریو: +{faNum(hedge.profitIfPre, 1)})
          </p>
        </div>
      ) : (
        <p className="mt-2 rounded-xl border border-white/10 bg-white/[0.04] p-2.5 text-[11px] leading-5 text-foreground/85">
          {toast.message}
        </p>
      )}

      <div className="mt-2 flex items-center gap-2">
        {isHedge ? (
          <Button
            size="sm"
            className={cn(
              "h-8 flex-1 gap-1 bg-emerald-600 text-xs hover:bg-emerald-500",
              toast.actioned && "bg-emerald-800/60"
            )}
            disabled={toast.actioned}
            onClick={() => actionLiveToast(toast.id)}
          >
            {toast.actioned ? (
              <>
                <Check className="size-3.5" /> پوشش ثبت شد
              </>
            ) : (
              <>تایید و ثبت پوشش زنده</>
            )}
          </Button>
        ) : (
          <span className="flex-1 text-[10px] text-muted-foreground">توصیه موتور: نگهداشتن تیپ (HOLD) — پوشش لازم نیست.</span>
        )}
        <span className="text-[10px] text-white/30" dir="ltr">{elapsed}s</span>
      </div>
    </div>
  );
}

export function LiveHedgeToasts() {
  const liveToasts = useQuantStore((s) => s.liveToasts);
  if (liveToasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-24 z-50 flex flex-col items-center gap-2 px-4" aria-live="polite" aria-label="هشدارهای پوشش زنده">
      {liveToasts.map((t) => (
        <ToastItem key={t.id} id={t.id} />
      ))}
    </div>
  );
}
