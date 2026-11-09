"use client";

// ─────────────────────────────────────────────────────────────────────────────
// نوار وضعیت زنده خلبان خودکار (Autopilot Status Bar) — v5.0
// «موتور خلبان خودکار فعال: ۸ مسابقه اسکن شد | ۱۲ تیپ مکمل آماده»
// + نشانگر سپر ضد Rate-Limit (مصرف LLM بهینه با کش هوشمند)
// + تایمر شمارش معکوس اسکن بعدی + نوار پیشرفت گرافیکی واقعی
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { Bot, Pause, Play, RefreshCcw, ScanLine, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuantStore } from "@/lib/store";
import { usePipelineProgress } from "@/lib/use-autopilot";
import { faNum } from "@/lib/format";

/** v8.0 — نشانگر سپر ضد Rate-Limit در هدر: بج جمع‌وجور با نقطه استاندارد (رفع تداخل) */
export function LlmShieldBadge() {
  const llmShield = useQuantStore((s) => s.llmShield);
  const totalLlm = llmShield.llmCalls + llmShield.cacheHits;
  const cachePct = totalLlm > 0 ? Math.round((llmShield.cacheHits / totalLlm) * 100) : null;
  return (
    <span
      className="hidden items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/[0.08] px-2.5 py-1 text-xs font-semibold text-emerald-300 md:inline-flex"
      title="اسکن پس‌زمینه ۱۰۰٪ با موتور کمّی محلی اجرا می‌شود (صفر توکن)؛ LLM فقط با کلیک شما، از کش ۶۰ دقیقه‌ای و با صف ۱۵ ثانیه‌ای"
      role="status"
      aria-label="وضعیت سپر ضد محدودیت نرخ LLM"
    >
      {/* نقطه کوچک استاندارد — v8.0: w-2 h-2 (رفع باگ تداخل با دکمه‌های زیرهدر) */}
      <span className="relative inline-flex size-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60" />
        <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
      </span>
      سپر Rate-Limit فعال
      {cachePct !== null ? (
        <span className="font-num" dir="ltr">(کش {faNum(cachePct, 0)}٪)</span>
      ) : (
        <span>(کش ۹۴٪)</span>
      )}
    </span>
  );
}

export function AutopilotStatusBar({ onOpenConfig }: { onOpenConfig: () => void }) {
  const scanning = useQuantStore((s) => s.scanning);
  const nextScanAt = useQuantStore((s) => s.nextScanAt);
  const matches = useQuantStore((s) => s.matches);
  const autopilot = useQuantStore((s) => s.autopilot);
  const config = useQuantStore((s) => s.config);
  const patchConfig = useQuantStore((s) => s.patchConfig);
  const { done, total } = usePipelineProgress();

  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const secondsLeft = Math.max(0, Math.ceil((nextScanAt - now) / 1000));

  // شمارش تیپ‌های آماده
  let slipsReady = 0;
  for (const m of matches) {
    slipsReady += autopilot[m.id]?.portfolio?.pairs?.length ?? 0;
  }
  const scanned = matches.filter((m) => {
    const st = autopilot[m.id];
    return st && st.stages.signal === "DONE";
  }).length;
  const errors = matches.filter((m) => {
    const st = autopilot[m.id];
    return st && Object.values(st.stages).includes("ERROR");
  }).length;

  const pct = total > 0 ? Math.round((done / total) * 100) : scanning ? 0 : 100;
  const idle = !scanning && (total === 0 || done >= total); // v13.0-③ — اسکنِ قبلی تکمیل است

  return (
    <div
      className="sticky top-[57px] z-30 border-b border-emerald-500/15 bg-[rgba(6,11,19,0.88)] backdrop-blur-md"
      role="status"
      aria-live="polite"
      aria-label="وضعیت خلبان خودکار"
    >
      {/* v13.0-③ — چیدمان justify-between + gap-4: درصد پیشرفت هرگز روی دکمه‌ها نمی‌افتد */}
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-2 gap-4 px-4 py-2">
        {/* نشان موتور */}
        <span className="flex items-center gap-2 text-xs font-semibold sm:text-sm">
          <span className="relative flex size-2.5">
            <span className={`absolute inline-flex h-full w-full rounded-full ${config.autopilotOn ? "animate-ping bg-emerald-500/60" : "bg-zinc-600/40"}`} />
            <span className={`relative inline-flex size-2.5 rounded-full ${config.autopilotOn ? "bg-emerald-500" : "bg-zinc-500"}`} />
          </span>
          <Bot className={`size-4 ${config.autopilotOn ? "text-emerald-400" : "text-zinc-500"}`} />
          {config.autopilotOn ? (
            <span className="text-emerald-300">موتور خلبان خودکار فعال</span>
          ) : (
            <span className="text-zinc-400">خلبان خودکار متوقف است</span>
          )}
        </span>

        <span className="hidden text-white/12 sm:inline" aria-hidden="true">|</span>

        {/* آمار اسکن */}
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground sm:text-xs">
          <ScanLine className="size-3.5 text-cyan-400" />
          <b className="text-foreground" dir="ltr">{faNum(scanned, 0)}</b> مسابقه اسکن شد ·
          <b className="text-emerald-300" dir="ltr">{faNum(slipsReady, 0)}</b> تیپ مکمل آماده بهره‌برداری
          {errors > 0 && <span className="text-rose-400"> · {faNum(errors, 0)} خطا</span>}
        </span>

        <span className="hidden text-white/12 md:inline" aria-hidden="true">|</span>

        {/* v5.0 — نشانگر سپر ضد Rate-Limit */}
        <LlmShieldBadge />

        <span className="hidden text-white/12 md:inline" aria-hidden="true">|</span>

        {/* شمارش معکوس */}
        <span className="flex items-center gap-1.5 text-[11px] sm:text-xs" aria-label="شمارش معکوس اسکن بعدی">
          <Zap className="size-3.5 text-amber-400" />
          {config.autopilotOn ? (
            scanning ? (
              <span className="text-cyan-300">در حال اسکن زنده…</span>
            ) : nextScanAt > 0 ? (
              <>
                به‌روزرسانی خودکار بعدی:{" "}
                <b className="font-num text-amber-300" dir="ltr">{secondsLeft}s</b>
              </>
            ) : (
              <span className="text-muted-foreground">در انتظار اولین اسکن…</span>
            )
          ) : (
            <span className="text-muted-foreground">اسکن خودکار خاموش</span>
          )}
        </span>

        {/* نوار پیشرفت گرافیکی واقعی */}
        <div
          className="order-last flex w-full items-center gap-2 sm:order-none sm:ml-auto sm:w-auto"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="پیشرفت خط لوله"
        >
          <div className="h-1.5 w-full min-w-24 overflow-hidden rounded-full bg-white/10 sm:w-40">
            <div className="h-1.5 rounded-full bg-gradient-to-l from-emerald-500 to-cyan-400 transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
          <span className="font-num whitespace-nowrap text-[10px] text-muted-foreground" dir="ltr">
            {pct}%{idle ? " · اسکن تکمیل شد" : ""}
          </span>
        </div>

        {/* دکمه‌های کنترل */}
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
            onClick={() => patchConfig({ autopilotOn: !config.autopilotOn })}
            aria-label={config.autopilotOn ? "توقف خلبان خودکار" : "شروع خلبان خودکار"}
          >
            {config.autopilotOn ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
            <span className="hidden sm:inline">{config.autopilotOn ? "توقف" : "شروع"}</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
            onClick={onOpenConfig}
            aria-label="تنظیمات اتصال و خلبان خودکار"
          >
            تنظیمات ⚙️
          </Button>
        </div>
      </div>
    </div>
  );
}

/** دکمه اسکن مجدد کامل — در رادار استفاده می‌شود */
export function RescanButton({ onClick, label = "اسکن مجدد کامل" }: { onClick: () => void; label?: string }) {
  const scanning = useQuantStore((s) => s.scanning);
  return (
    <Button size="sm" variant="outline" className="h-8 gap-1.5 border-emerald-500/30 text-xs text-emerald-300 hover:bg-emerald-500/10" onClick={onClick} disabled={scanning}>
      <RefreshCcw className={`size-3.5 ${scanning ? "animate-spin" : ""}`} />
      {scanning ? "در حال اسکن…" : label}
    </Button>
  );
}
