"use client";

// ─────────────────────────────────────────────────────────────────────────────
// زمین فوتبال هولوگرافیک سه‌بعدی (3D Isometric Tactical Pitch)
// CSS 3D Perspective: rotateX(48deg) rotateZ(-12deg) — مناطق فشار (Field Tilt)،
// بردارهای تهدید مورد انتظار (xT/VAEP) و نودهای تپنده بازیکنان کلیدی
// در تب ۱ (تحلیل تاکتیکی) و تب ۴ (شوک ترکیب T-60)
// ─────────────────────────────────────────────────────────────────────────────

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface PitchNode {
  /** موقعیت روی زمین ۰..۱۰۰ (x از چپ، y از بالا — حمله به سمت راست) */
  x: number;
  y: number;
  status?: "FIT" | "MISSING" | "DOUBTFUL";
  label?: string;
}

interface TacticalPitchProps {
  homeTeam: string;
  awayTeam: string;
  /** سهم توپ/فشار میزبان ۰..۱ */
  homeFieldTilt: number;
  awayFieldTilt: number;
  homeXg: number;
  awayXg: number;
  /** نودهای بازیکنان (اختیاری — برای تب ۴) */
  homeNodes?: PitchNode[];
  awayNodes?: PitchNode[];
  className?: string;
  compact?: boolean;
}

/** چیدمان پیش‌فرض ۴-۳-۳ برای هر تیم (مختصات درصدی روی نیمه خودی) */
const HOME_FORMATION: PitchNode[] = [
  { x: 7, y: 50 },
  { x: 22, y: 18 }, { x: 20, y: 39 }, { x: 20, y: 61 }, { x: 22, y: 82 },
  { x: 40, y: 30 }, { x: 37, y: 50 }, { x: 40, y: 70 },
  { x: 62, y: 22 }, { x: 66, y: 50 }, { x: 62, y: 78 },
];
const AWAY_FORMATION: PitchNode[] = [
  { x: 93, y: 50 },
  { x: 78, y: 18 }, { x: 80, y: 39 }, { x: 80, y: 61 }, { x: 78, y: 82 },
  { x: 60, y: 30 }, { x: 63, y: 50 }, { x: 60, y: 70 },
  { x: 38, y: 22 }, { x: 34, y: 50 }, { x: 38, y: 78 },
];

export function TacticalPitch({
  homeTeam,
  awayTeam,
  homeFieldTilt,
  awayFieldTilt,
  homeXg,
  awayXg,
  homeNodes,
  awayNodes,
  className,
  compact,
}: TacticalPitchProps) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ rx: 48, rz: -12 });

  const onMouseMove = (e: React.MouseEvent) => {
    const el = sceneRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / rect.width;
    const my = (e.clientY - rect.top) / rect.height;
    setTilt({ rx: 48 + (0.5 - my) * 8, rz: -12 + (mx - 0.5) * 12 });
  };

  const total = homeFieldTilt + awayFieldTilt || 1;
  const homeShare = homeFieldTilt / total;
  const hNodes = homeNodes ?? HOME_FORMATION;
  const aNodes = awayNodes ?? AWAY_FORMATION;

  return (
    <div className={cn("space-y-3", className)}>
      {/* هدر تیم‌ها */}
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 font-medium text-emerald-400">
          <span className="size-2 rounded-full bg-emerald-400 pitch-node" />
          {homeTeam}
          <b className="font-num text-emerald-300" dir="ltr">xG {homeXg.toFixed(2)}</b>
        </span>
        <span className="text-[10px] text-muted-foreground">Field Tilt {(homeShare * 100).toFixed(0)}٪ / {((1 - homeShare) * 100).toFixed(0)}٪</span>
        <span className="flex items-center gap-1.5 font-medium text-amber-300">
          <b className="font-num text-amber-200" dir="ltr">xG {awayXg.toFixed(2)}</b>
          {awayTeam}
          <span className="size-2 rounded-full bg-amber-300" />
        </span>
      </div>

      {/* صحنه سه‌بعدی */}
      <div
        ref={sceneRef}
        onMouseMove={onMouseMove}
        onMouseLeave={() => setTilt({ rx: 48, rz: -12 })}
        className={cn("relative select-none", compact ? "h-56" : "h-64 sm:h-72")}
        style={{ perspective: "1000px" }}
        role="img"
        aria-label={`نمای سه‌بعدی زمین فوتبال — فشار میدانی ${homeTeam} ${Math.round(homeShare * 100)} درصد`}
      >
        <div
          className="absolute inset-x-2 inset-y-0 transition-transform duration-200 ease-out"
          style={{
            transform: `rotateX(${tilt.rx}deg) rotateZ(${tilt.rz}deg)`,
            transformStyle: "preserve-3d",
          }}
        >
          {/* چمن هولوگرافیک */}
          <div
            className="absolute inset-0 rounded-lg border border-emerald-400/25"
            style={{
              background:
                "repeating-linear-gradient(90deg, rgba(16,185,129,0.10) 0 8%, rgba(16,185,129,0.045) 8% 16%), radial-gradient(ellipse at 50% 50%, rgba(16,185,129,0.08), rgba(6,20,14,0.5))",
              boxShadow: "0 0 40px rgba(16,185,129,0.12), inset 0 0 60px rgba(0,0,0,0.5)",
            }}
          >
            {/* خطوط زمین */}
            <div className="absolute inset-2 rounded border border-emerald-300/25" />
            <div className="absolute inset-y-2 left-1/2 w-px bg-emerald-300/25" />
            <div className="absolute left-1/2 top-1/2 size-[14%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-300/25" />
            <div className="absolute left-1/2 top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-300/60" />
            {/* محوطه‌ها */}
            <div className="absolute inset-y-[26%] left-2 w-[13%] border border-emerald-300/25" />
            <div className="absolute inset-y-[38%] left-2 w-[5.5%] border border-emerald-300/25" />
            <div className="absolute inset-y-[26%] right-2 w-[13%] border border-emerald-300/25" />
            <div className="absolute inset-y-[38%] right-2 w-[5.5%] border border-emerald-300/25" />

            {/* منطقه فشار Field Tilt — گرادیان مالکیت */}
            <div
              className="absolute inset-0 rounded-lg transition-opacity duration-700"
              style={{
                background: `linear-gradient(90deg, rgba(16,185,129,${0.16 * homeShare}) 0%, transparent ${Math.max(30, homeShare * 80)}%, rgba(245,158,11,${0.16 * (1 - homeShare)}) 100%)`,
              }}
            />

            {/* بردارهای تهدید مورد انتظار (xT) — منحنی‌های نوری */}
            <svg className="absolute inset-0 size-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              <defs>
                <linearGradient id="xt-grad-h" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="rgba(16,185,129,0.05)" />
                  <stop offset="100%" stopColor="rgba(16,185,129,0.75)" />
                </linearGradient>
                <linearGradient id="xt-grad-a" x1="1" y1="0" x2="0" y2="0">
                  <stop offset="0%" stopColor="rgba(245,158,11,0.05)" />
                  <stop offset="100%" stopColor="rgba(245,158,11,0.75)" />
                </linearGradient>
              </defs>
              {/* مسیرهای xT میزبان (به سمت دروازه راست) */}
              <path d="M 40 50 C 55 42, 68 38, 84 46" fill="none" stroke="url(#xt-grad-h)" strokeWidth="0.9" className="dataflow-line" />
              <path d="M 37 50 C 52 60, 66 64, 84 56" fill="none" stroke="url(#xt-grad-h)" strokeWidth="0.9" className="dataflow-line" style={{ animationDelay: "0.4s" }} />
              <path d="M 66 50 C 74 50, 80 49, 88 50" fill="none" stroke="rgba(16,185,129,0.9)" strokeWidth="1.1" className="dataflow-line" style={{ animationDelay: "0.8s" }} />
              {/* مسیرهای xT میهمان (به سمت دروازه چپ) */}
              <path d="M 60 50 C 45 40, 32 36, 16 44" fill="none" stroke="url(#xt-grad-a)" strokeWidth="0.9" className="dataflow-line" style={{ animationDelay: "0.2s" }} />
              <path d="M 63 50 C 48 62, 34 66, 16 58" fill="none" stroke="url(#xt-grad-a)" strokeWidth="0.9" className="dataflow-line" style={{ animationDelay: "0.6s" }} />
            </svg>

            {/* نودهای بازیکن میزبان */}
            {hNodes.map((n, i) => (
              <div
                key={`h-${i}`}
                className={cn(
                  "absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full",
                  n.status === "MISSING"
                    ? "pitch-node-red border border-rose-300/70 bg-rose-500/40"
                    : n.status === "DOUBTFUL"
                      ? "border border-amber-300/70 bg-amber-400/40"
                      : "pitch-node border border-emerald-200/60 bg-emerald-400/70"
                )}
                style={{ left: `${n.x}%`, top: `${n.y}%`, animationDelay: `${i * 0.18}s` }}
                title={n.label ?? `${homeTeam} — بازیکن ${i + 1}`}
              />
            ))}
            {/* نودهای بازیکن میهمان */}
            {aNodes.map((n, i) => (
              <div
                key={`a-${i}`}
                className={cn(
                  "absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full",
                  n.status === "MISSING"
                    ? "pitch-node-red border border-rose-300/70 bg-rose-500/40"
                    : n.status === "DOUBTFUL"
                      ? "border border-amber-300/70 bg-amber-400/40"
                      : "border border-amber-200/60 bg-amber-400/70"
                )}
                style={{ left: `${n.x}%`, top: `${n.y}%`, animationDelay: `${i * 0.18 + 0.5}s` }}
                title={n.label ?? `${awayTeam} — بازیکن ${i + 1}`}
              />
            ))}
          </div>
        </div>

        {/* راهنما */}
        <div className="absolute bottom-1 left-2 flex items-center gap-3 text-[9px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-emerald-400/80" /> حاضر</span>
          <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-rose-500/80" /> غایب (T-60)</span>
          <span className="flex items-center gap-1"><span className="h-px w-4 bg-emerald-400/70" /> بردار xT</span>
        </div>
      </div>
    </div>
  );
}
