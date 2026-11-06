"use client";

// ─────────────────────────────────────────────────────────────────────────────
// ماتریس ۶×۶ ارتفاع‌دار سه‌بعدی (3D Extruded Score Probability Grid)
// کلید تغییر نما: «نمای دوبعدی (Heatmap)» ↔ «نمای برجسته سه‌بعدی (Isometric Towers)»
// هر خانه متناسب با درصد احتمالش به صورت ستون کریستالی به بالا ارتفاع می‌گیرد.
// + انتخابگر تعاملی خانه‌ها: سبد تیپ اول (آبی) و تیپ دوم (سبز) برای Bet Builder
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useRef, useState } from "react";
import { Boxes, Grid2x2, MousePointerClick } from "lucide-react";
import { cn } from "@/lib/utils";

export type MatrixView = "2D" | "3D";
export type SelectMode = "a" | "b" | null;

interface Matrix3DProps {
  matrix: number[][];
  n?: number;
  view: MatrixView;
  onViewChange: (v: MatrixView) => void;
  selectMode: SelectMode;
  onSelectModeChange: (m: SelectMode) => void;
  selectedA: Set<string>;
  selectedB: Set<string>;
  onCellClick: (key: string) => void;
  className?: string;
}

const CELL = 42;
const GAP = 5;
const STEP = CELL + GAP;
const MAX_TOWER_H = 82;

function cellColor(h: number, a: number, p: number, maxP: number): string {
  const intensity = maxP > 0 ? p / maxP : 0;
  if (h > a) return `rgba(16, 185, 129, ${0.10 + intensity * 0.72})`;
  if (h === a) return `rgba(148, 163, 184, ${0.10 + intensity * 0.55})`;
  return `rgba(245, 158, 11, ${0.10 + intensity * 0.72})`;
}

const SLIP_A_COLOR = "6, 182, 212"; // آبی سیان
const SLIP_B_COLOR = "16, 185, 129"; // سبز زمردی

export function Matrix3D({
  matrix,
  n = 6,
  view,
  onViewChange,
  selectMode,
  onSelectModeChange,
  selectedA,
  selectedB,
  onCellClick,
  className,
}: Matrix3DProps) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ rx: 48, rz: -12 });
  const [hover, setHover] = useState<{ key: string; p: number } | null>(null);

  const maxP = useMemo(() => {
    let m = 0;
    for (let h = 0; h < n; h++) for (let a = 0; a < n; a++) m = Math.max(m, matrix[h]?.[a] ?? 0);
    return m || 1;
  }, [matrix, n]);

  const planeSize = n * STEP - GAP;

  const onMouseMove = (e: React.MouseEvent) => {
    const el = sceneRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / rect.width;
    const my = (e.clientY - rect.top) / rect.height;
    setTilt({ rx: 48 + (0.5 - my) * 10, rz: -12 + (mx - 0.5) * 16 });
  };

  const isSelA = (h: number, a: number) => selectedA.has(`${h}-${a}`);
  const isSelB = (h: number, a: number) => selectedB.has(`${h}-${a}`);

  return (
    <div className={cn("space-y-3", className)}>
      {/* نوار کنترل: تغییر نما + انتخابگر سبد */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-white/10 bg-white/5 p-0.5" role="tablist" aria-label="حالت نمایش ماتریس">
          <button
            role="tab"
            aria-selected={view === "2D"}
            onClick={() => onViewChange("2D")}
            className={cn(
              "flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] transition-colors",
              view === "2D" ? "bg-cyan-500/20 text-cyan-300" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Grid2x2 className="size-3.5" /> نمای دوبعدی
          </button>
          <button
            role="tab"
            aria-selected={view === "3D"}
            onClick={() => onViewChange("3D")}
            className={cn(
              "flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] transition-colors",
              view === "3D" ? "bg-violet-500/20 text-violet-300" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Boxes className="size-3.5" /> برجسته سه‌بعدی
          </button>
        </div>

        <div className="mr-auto flex items-center gap-1.5">
          <MousePointerClick className="size-3.5 text-muted-foreground" />
          <button
            onClick={() => onSelectModeChange(selectMode === "a" ? null : "a")}
            aria-pressed={selectMode === "a"}
            className={cn(
              "rounded-md border px-2.5 py-1 text-[11px] transition-all",
              selectMode === "a"
                ? "border-cyan-400/60 bg-cyan-500/20 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.35)]"
                : "border-white/10 bg-white/5 text-muted-foreground hover:text-foreground"
            )}
          >
            انتخاب خانه‌های تیپ اول (آبی)
          </button>
          <button
            onClick={() => onSelectModeChange(selectMode === "b" ? null : "b")}
            aria-pressed={selectMode === "b"}
            className={cn(
              "rounded-md border px-2.5 py-1 text-[11px] transition-all",
              selectMode === "b"
                ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.35)]"
                : "border-white/10 bg-white/5 text-muted-foreground hover:text-foreground"
            )}
          >
            انتخاب خانه‌های تیپ دوم (سبز)
          </button>
        </div>
      </div>

      {view === "2D" ? (
        /* ─── نمای دوبعدی: Heatmap با انتخاب تعاملی ─── */
        <div className="overflow-x-auto pb-1">
          <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${n + 1}, minmax(0, 1fr))`, minWidth: 300 }}>
            <div />
            {Array.from({ length: n }).map((_, a) => (
              <div key={`hh-${a}`} className="text-center text-[10px] text-muted-foreground">
                {a}
              </div>
            ))}
            {Array.from({ length: n }).map((_, h) => (
              <div key={`rr-${h}`} className="contents">
                <div className="flex items-center justify-center text-[10px] text-muted-foreground">{h}</div>
                {Array.from({ length: n }).map((_, a) => {
                  const key = `${h}-${a}`;
                  const p = matrix[h]?.[a] ?? 0;
                  const inA = selectedA.has(key);
                  const inB = selectedB.has(key);
                  return (
                    <button
                      key={`c-${key}`}
                      onClick={() => onCellClick(key)}
                      onMouseEnter={() => setHover({ key, p })}
                      onMouseLeave={() => setHover(null)}
                      className={cn(
                        "aspect-square rounded flex items-center justify-center text-[10px] font-num border transition-all duration-200 cursor-pointer",
                        inA
                          ? "border-cyan-400/80 ring-1 ring-cyan-400/60 shadow-[0_0_10px_rgba(6,182,212,0.3)]"
                          : inB
                            ? "border-emerald-400/80 ring-1 ring-emerald-400/60 shadow-[0_0_10px_rgba(16,185,129,0.3)]"
                            : "border-white/8 hover:border-white/25",
                        selectMode && "hover:scale-[1.06]"
                      )}
                      style={{
                        backgroundColor:
                          inA
                            ? `rgba(${SLIP_A_COLOR}, ${0.22 + (maxP ? p / maxP : 0) * 0.5})`
                            : inB
                              ? `rgba(${SLIP_B_COLOR}, ${0.22 + (maxP ? p / maxP : 0) * 0.5})`
                              : cellColor(h, a, p, maxP),
                      }}
                      title={`نتیجه ${h}-${a}: احتمال ${(p * 100).toFixed(1)}٪`}
                    >
                      {p > 0.012 ? (p * 100).toFixed(1) : ""}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* ─── نمای سه‌بعدی: برج‌های کریستالی ─── */
        <div
          ref={sceneRef}
          onMouseMove={onMouseMove}
          onMouseLeave={() => {
            setTilt({ rx: 48, rz: -12 });
            setHover(null);
          }}
          className="relative h-[330px] select-none"
          style={{ perspective: "1100px" }}
          role="img"
          aria-label="ماتریس سه‌بعدی احتمالات نتیجه — ارتفاع هر برج متناسب با احتمال"
        >
          <div
            className="absolute left-1/2 top-1/2 transition-transform duration-200 ease-out"
            style={{
              width: planeSize,
              height: planeSize,
              transform: `translate(-50%, -46%) rotateX(${tilt.rx}deg) rotateZ(${tilt.rz}deg)`,
              transformStyle: "preserve-3d",
            }}
          >
            {/* کف ماتریس */}
            <div
              className="absolute inset-0 rounded-md border border-white/10"
              style={{
                background:
                  "repeating-linear-gradient(0deg, rgba(148,163,184,0.05) 0 1px, transparent 1px 47px), repeating-linear-gradient(90deg, rgba(148,163,184,0.05) 0 1px, transparent 1px 47px), rgba(8,12,22,0.5)",
                boxShadow: "0 0 50px rgba(6,182,212,0.08) inset",
              }}
            />

            {/* برج‌ها */}
            {Array.from({ length: n }).flatMap((_, h) =>
              Array.from({ length: n }).map((_, a) => {
                const p = matrix[h]?.[a] ?? 0;
                const towerH = Math.max(4, (maxP ? p / maxP : 0) * MAX_TOWER_H);
                const inA = isSelA(h, a);
                const inB = isSelB(h, a);
                const base = cellColor(h, a, p, maxP);
                const x = a * STEP;
                const y = h * STEP;
                const rgb = inA ? SLIP_A_COLOR : inB ? SLIP_B_COLOR : h > a ? "16,185,129" : h === a ? "148,163,184" : "245,158,11";
                const alpha = inA || inB ? 0.85 : 0.55;
                return (
                  <div
                    key={`t-${h}-${a}`}
                    className="absolute"
                    style={{ left: x, top: y, width: CELL, height: CELL, transformStyle: "preserve-3d" }}
                  >
                    {/* رویه بالایی */}
                    <button
                      className="absolute inset-0 rounded-[3px] border cursor-pointer transition-all duration-500"
                      onClick={() => onCellClick(`${h}-${a}`)}
                      onMouseEnter={() => setHover({ key: `${h}-${a}`, p })}
                      onMouseLeave={() => setHover(null)}
                      style={{
                        transform: `translateZ(${towerH}px)`,
                        borderColor: inA || inB ? `rgba(${rgb},0.95)` : `rgba(${rgb},0.55)`,
                        background: `rgba(${rgb}, ${alpha})`,
                        boxShadow:
                          inA || inB
                            ? `0 0 14px rgba(${rgb},0.55), inset 0 0 8px rgba(255,255,255,0.25)`
                            : `inset 0 0 6px rgba(255,255,255,0.12)`,
                      }}
                      title={`نتیجه ${h}-${a}: ${(p * 100).toFixed(1)}٪`}
                    >
                      <span className="font-num text-[8.5px] text-white/90 pointer-events-none">
                        {p > 0.015 ? (p * 100).toFixed(0) : ""}
                      </span>
                    </button>
                    {/* رویه جنوبی */}
                    <div
                      className="absolute left-0 w-full rounded-b-[2px] pointer-events-none"
                      style={{
                        top: "100%",
                        height: towerH,
                        transformOrigin: "top",
                        transform: "rotateX(90deg)",
                        background: `linear-gradient(to bottom, rgba(${rgb},${alpha * 0.9}), rgba(${rgb},${alpha * 0.25}))`,
                        transition: "height .5s cubic-bezier(.22,1,.36,1)",
                      }}
                    />
                    {/* رویه شرقی */}
                    <div
                      className="absolute pointer-events-none"
                      style={{
                        left: "100%",
                        top: 0,
                        width: towerH,
                        height: "100%",
                        transformOrigin: "left",
                        transform: "rotateY(-90deg)",
                        background: `linear-gradient(to right, rgba(${rgb},${alpha * 0.75}), rgba(${rgb},${alpha * 0.2}))`,
                        transition: "width .5s cubic-bezier(.22,1,.36,1)",
                      }}
                    />
                  </div>
                );
              })
            )}
          </div>

          {/* برچسب محورها (خارج از صفحه چرخیده) */}
          <div className="absolute bottom-0 right-4 flex gap-[38px] text-[10px] text-muted-foreground" dir="ltr">
            {Array.from({ length: n }).map((_, a) => (
              <span key={`xl-${a}`} className="font-num">{a}</span>
            ))}
            <span className="text-cyan-300/80">گل میهمان →</span>
          </div>
          <div className="absolute left-2 top-6 flex flex-col gap-[34px] text-[10px] text-muted-foreground" dir="ltr">
            {Array.from({ length: n }).map((_, h) => (
              <span key={`yl-${h}`} className="font-num">{h}</span>
            ))}
            <span className="text-emerald-300/80">↑ میزبان</span>
          </div>
        </div>
      )}

      {/* نوار وضعیت هاور + راهنما */}
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-emerald-500" /> برد میزبان</span>
          <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-slate-400" /> مساوی</span>
          <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-amber-500" /> برد میهمان</span>
          <span className="flex items-center gap-1"><span className="size-2 rounded-sm border border-cyan-400 bg-cyan-500/30" /> تیپ ۱</span>
          <span className="flex items-center gap-1"><span className="size-2 rounded-sm border border-emerald-400 bg-emerald-500/30" /> تیپ ۲</span>
        </div>
        <span className="font-num" dir="ltr">
          {hover ? `Cell ${hover.key} · P = ${(hover.p * 100).toFixed(2)}%` : "—"}
        </span>
      </div>
    </div>
  );
}
