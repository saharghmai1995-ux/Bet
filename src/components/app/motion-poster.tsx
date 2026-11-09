"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 🎬 پیش‌نمایش موشن پوسترهای خودساز (Motion Card Preview) — v13.0
// نسخه متحرک ۶۰fps از ۵ پوستر استادیومی: نورافکن‌های متحرک، پالس رادار،
// شمارشگر صعودی سود (rAF)، موج نوری دور باکس برنده — کاملاً سمت کلاینت.
// پوسترهای ثابت سمت سرور با همان هندسه در card-render.ts رندر می‌شوند.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from "react";
import { Film, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { faNum } from "@/lib/format";

type PosterKind = "PRE_MATCH" | "COMBO" | "SNIPER" | "SETTLEMENT" | "DAILY_PNL";

const KINDS: { key: PosterKind; label: string; hint: string }[] = [
  { key: "PRE_MATCH", label: "۱. کارت تیپ بازی", hint: "استادیوم شبانه + SLIP A آبی / SLIP B سبز" },
  { key: "COMBO", label: "۲. میکس ۲/۳ تایی", hint: "ردیفی لِگ‌ها + TOTAL COMBO ODDS" },
  { key: "SNIPER", label: "۳. تک‌تیرانداز", hint: "تم بنفش/طلایی + رادار هدف‌گیری" },
  { key: "SETTLEMENT", label: "۴. نتیجه FT", hint: "تور دروازه / جام طلایی / باران قرمز" },
  { key: "DAILY_PNL", label: "۵. برآیند روزانه", hint: "نمای هوایی چمن + ۴ باکس KPI" },
];

/** شمارشگر صعودی با requestAnimationFrame — ۶۰fps واقعی */
function useRisingNumber(target: number, durationMs = 2200, playing = true) {
  const [v, setV] = useState(0);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    if (!playing) return;
    let start: number | null = null;
    const step = (t: number) => {
      if (start === null) start = t;
      const p = Math.min(1, (t - start) / durationMs);
      setV(target * (1 - Math.pow(1 - p, 3))); // easeOutCubic
      if (p < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [target, durationMs, playing]);
  return v;
}

export function MotionPosterPreview() {
  const [kind, setKind] = useState<PosterKind>("PRE_MATCH");
  const [playing, setPlaying] = useState(true);

  const profitTarget = kind === "COMBO" ? 21.4 : kind === "SNIPER" ? 16.2 : kind === "SETTLEMENT" ? 34.5 : 19.4;
  const profit = useRisingNumber(profitTarget, 2400, playing);

  const accent =
    kind === "SNIPER" ? "#a78bfa" : kind === "SETTLEMENT" ? "#f5c542" : kind === "DAILY_PNL" ? "#3ddc97" : "#38d6f5";

  const rows = useMemo(() => (kind === "COMBO" ? [0, 1, 2] : kind === "DAILY_PNL" ? [0, 1, 2, 3] : []), [kind]);

  return (
    <div className="space-y-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.05] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-300">
          <Film className="size-4" />
          🎬 موتور خودساز گرافیک استادیوم و موشن — صفر آپلود (v13.0)
        </p>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-[10px] text-muted-foreground"
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? "توقف انیمیشن موشن" : "پخش انیمیشن موشن"}
          >
            {playing ? <Pause className="size-3" /> : <Play className="size-3" />}
            {playing ? "توقف موشن" : "پخش موشن"}
          </Button>
          <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold text-emerald-300" dir="ltr">
            1080×1440 · 3:4 · 60fps
          </span>
        </div>
      </div>
      <p className="text-[10px] leading-4 text-muted-foreground">
        هر ۵ پوستر کانال <b dir="ltr">@AINEOBET</b> کاملاً در کد تولید می‌شود (نورافکن‌های radialGradient، چمن پرسپکتیو با محوطه جریمه و دایره وسط،
        ذرات بوکه، آتش‌بازی، باران و تور دروازه) — هیچ فایل قالبی آپلود نمی‌شود. نسخه موشن متحرک هر پوستر اینجا زنده اجرا می‌شود.
      </p>

      {/* سوییچ ۵ پوستر */}
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="انتخاب پوستر موشن">
        {KINDS.map((k) => (
          <Button
            key={k.key}
            size="sm"
            variant="outline"
            role="tab"
            aria-selected={kind === k.key}
            className={cn(
              "h-7 gap-1 whitespace-nowrap rounded-full border-white/10 px-2.5 text-[10px]",
              kind === k.key ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-200" : "text-muted-foreground"
            )}
            onClick={() => setKind(k.key)}
          >
            {k.label}
          </Button>
        ))}
      </div>

      {/* ═══ بوم موشن — نسخه متحرک ۶۰fps همان پوستر ═══ */}
      <div className="flex justify-center">
        <div
          className={cn("relative aspect-[3/4] w-full max-w-[280px] overflow-hidden rounded-xl border-2", playing && "motion-glow")}
          style={{ borderColor: accent, background: "linear-gradient(180deg,#070d18 0%,#0b1526 46%,#0a4a20 100%)" }}
          role="img"
          aria-label={`نمایش موشن متحرک پوستر ${KINDS.find((k) => k.key === kind)?.label}`}
        >
          {/* نورافکن‌های چرخان */}
          <div className="absolute inset-x-0 top-0 h-1/2">
            <div className={cn("absolute -top-10 left-4 size-40 rounded-full blur-2xl", playing && "motion-sweep-a")} style={{ background: accent, opacity: 0.35 }} />
            <div className={cn("absolute -top-10 right-4 size-40 rounded-full blur-2xl", playing && "motion-sweep-b")} style={{ background: accent, opacity: 0.3 }} />
          </div>
          {/* ذرات بوکه */}
          {playing &&
            Array.from({ length: 14 }).map((_, i) => (
              <span
                key={i}
                className="absolute rounded-full"
                style={{
                  left: `${(i * 37) % 90 + 4}%`,
                  top: `${(i * 53) % 55 + 3}%`,
                  width: `${3 + (i % 4) * 2}px`,
                  height: `${3 + (i % 4) * 2}px`,
                  background: i % 3 === 0 ? "#f5c542" : accent,
                  opacity: 0.25,
                  animation: `motion-float ${5 + (i % 5)}s ease-in-out ${i * 0.4}s infinite`,
                }}
              />
            ))}

          {/* هدر برند */}
          <div className="relative z-10 flex items-center justify-between border-b px-3 py-2" style={{ borderColor: `${accent}55` }}>
            <span className="text-[8px] font-black tracking-widest text-amber-300" dir="ltr">NEOBET QUANT PRO</span>
            <span className="text-[8px] font-bold" style={{ color: accent }} dir="ltr">@AINEOBET</span>
          </div>

          {/* بدنه هر پوستر */}
          <div className="relative z-10 space-y-2 p-3">
            {kind === "PRE_MATCH" && (
              <>
                <div className="flex items-center justify-between px-2 pt-1">
                  <span className="flex size-12 items-center justify-center rounded-full border-2 border-cyan-400 bg-white/90 text-[9px] font-black text-slate-800">H</span>
                  <span className="text-[9px] font-black text-amber-300" dir="ltr">VS</span>
                  <span className="flex size-12 items-center justify-center rounded-full border-2 border-emerald-400 bg-white/90 text-[9px] font-black text-slate-800">A</span>
                </div>
                <div className="rounded-lg border border-cyan-400/60 bg-black/60 p-2">
                  <p className="text-[8px] font-bold text-cyan-300" dir="ltr">SLIP A · JUDGE SIDE</p>
                  <div className={cn("mt-1 rounded", playing && "motion-wave")} style={{ padding: 2 }}>
                    <p className="text-[9px] text-white/90" dir="ltr">Anchor selection @2.05</p>
                  </div>
                </div>
                <div className="rounded-lg border border-emerald-400/60 bg-black/60 p-2">
                  <p className="text-[8px] font-bold text-emerald-300" dir="ltr">SLIP B · COMPLEMENT</p>
                  <p className="text-[9px] text-white/90" dir="ltr">Orthogonal cover @3.10</p>
                </div>
              </>
            )}
            {kind === "COMBO" &&
              rows.map((i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-emerald-400/50 bg-black/60 px-2 py-1.5">
                  <span className="text-[8px] font-bold text-emerald-300" dir="ltr">LEG {i + 1}</span>
                  <span className="text-[8px] text-white/80" dir="ltr">anchor @1.7{i + 2}</span>
                </div>
              ))}
            {kind === "SNIPER" && (
              <div className="flex justify-center py-2">
                <div className="relative size-28 rounded-full border-2 border-violet-400/70 bg-violet-500/10">
                  <span className="absolute inset-2 rounded-full border border-violet-400/40" />
                  <span className="absolute inset-5 rounded-full border border-violet-400/30" />
                  {playing && <span className="motion-radar absolute inset-0 rounded-full" style={{ background: "conic-gradient(from 0deg, rgba(167,139,250,0.5), transparent 70deg)" }} />}
                  <span className="absolute left-1/2 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-300" />
                </div>
              </div>
            )}
            {kind === "SETTLEMENT" && (
              <div className={cn("rounded-lg border-2 border-amber-400/70 bg-black/60 p-3 text-center", playing && "motion-wave")}>
                <p className="text-[9px] font-bold text-amber-300" dir="ltr">WIN CONFIRMED · ESPN-GRADED</p>
                <p className="mt-1 font-mono text-lg font-black text-amber-300" dir="ltr">+{profit.toFixed(1)}u</p>
              </div>
            )}
            {kind === "DAILY_PNL" && (
              <div className="grid grid-cols-2 gap-1.5">
                {["SETTLED", "WIN-RATE", "JACKPOTS", "NET UNITS"].map((l, i) => (
                  <div key={l} className="rounded-md border border-white/15 bg-black/60 p-1.5 text-center">
                    <p className="font-mono text-[10px] font-black text-emerald-300" dir="ltr">{i === 1 ? "100%" : i === 3 ? `+${profit.toFixed(1)}` : faNum([4, 3, 1, 0][i], 0)}</p>
                    <p className="text-[6.5px] text-white/60" dir="ltr">{l}</p>
                  </div>
                ))}
              </div>
            )}

            {/* شمارشگر صعودی سود — پایین همه پوسترها */}
            <div className="rounded-lg border border-amber-400/50 bg-black/70 px-2 py-1.5 text-center">
              <p className="text-[7.5px] font-bold text-amber-200/90" dir="ltr">GUARANTEED COVER PROFIT</p>
              <p className="font-mono text-sm font-black text-amber-300" dir="ltr">+{profit.toFixed(1)}%</p>
            </div>
          </div>
        </div>
      </div>

      <p className="text-center text-[9px] text-muted-foreground">
        {KINDS.find((k) => k.key === kind)?.hint} — رندر ثابت سمت سرور (sharp + SVG برداری) و نسخه موشن زنده سمت کلاینت
      </p>

      <style jsx global>{`
        @keyframes motion-sweep-a {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.35; }
          50% { transform: translate(46px, 20px) scale(1.25); opacity: 0.5; }
        }
        @keyframes motion-sweep-b {
          0%, 100% { transform: translate(0, 0) scale(1.2); opacity: 0.3; }
          50% { transform: translate(-46px, 24px) scale(0.95); opacity: 0.45; }
        }
        @keyframes motion-float {
          0%, 100% { transform: translateY(0); opacity: 0.18; }
          50% { transform: translateY(-14px); opacity: 0.4; }
        }
        @keyframes motion-radar {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes motion-wave {
          0%, 100% { box-shadow: 0 0 0 0 rgba(245,197,66,0.35); }
          50% { box-shadow: 0 0 0 6px rgba(245,197,66,0); }
        }
        @keyframes motion-glow-kf {
          0%, 100% { box-shadow: 0 0 14px ${accent}33; }
          50% { box-shadow: 0 0 30px ${accent}55; }
        }
        .motion-sweep-a { animation: motion-sweep-a 5s ease-in-out infinite; }
        .motion-sweep-b { animation: motion-sweep-b 6s ease-in-out infinite; }
        .motion-radar { animation: motion-radar 3.2s linear infinite; }
        .motion-wave { animation: motion-wave 1.8s ease-in-out infinite; }
        .motion-glow { animation: motion-glow-kf 2.6s ease-in-out infinite; }
      `}</style>
    </div>
  );
}
