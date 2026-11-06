"use client";

// ─────────────────────────────────────────────────────────────────────────────
// انیمیشن جریان داده — خطوط اتصال با پالس‌های نوری متحرک (stroke-dashoffset)
// برای پایپ‌لاین ۵ لایه و مسیر داده‌کاوی ← موتور کمّی ← مناظره ← قاضی ارشد
// ─────────────────────────────────────────────────────────────────────────────

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FlowNode {
  icon: LucideIcon;
  label: string;
  color: string; // کلاس رنگ متن
  glow: string; // رنگ هگز برای هاله
}

/**
 * نوار جریان داده: نودها با خطوط SVG زنده بین آن‌ها.
 * در موبایل عمودی و در دسکتاپ افقی می‌شود.
 */
export function PulseFlow({ nodes, className }: { nodes: FlowNode[]; className?: string }) {
  if (nodes.length === 0) return null;

  // چیدمان افقی: خطوط بین نودها با SVG
  const W = 1000;
  const H = 120;
  const step = W / nodes.length;
  const centers = nodes.map((_, i) => step * i + step / 2);

  return (
    <div
      className={cn("relative w-full overflow-x-auto", className)}
      role="img"
      aria-label="جریان داده بین لایه‌های سیستم با پالس نوری متحرک"
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="min-w-[760px] w-full"
        style={{ direction: "ltr" }}
      >
        <defs>
          {nodes.map((n, i) => (
            <linearGradient key={`g-${i}`} id={`node-glow-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={n.glow} stopOpacity="0.22" />
              <stop offset="100%" stopColor={n.glow} stopOpacity="0.04" />
            </linearGradient>
          ))}
        </defs>

        {/* خطوط اتصال زنده */}
        {centers.slice(0, -1).map((x, i) => {
          const x1 = x + 44;
          const x2 = centers[i + 1] - 44;
          const color = nodes[i].glow;
          return (
            <g key={`line-${i}`}>
              {/* پایه کم‌رنگ */}
              <line x1={x1} y1={H / 2} x2={x2} y2={H / 2} stroke="rgba(148,163,184,0.18)" strokeWidth="1.5" />
              {/* پالس جریان داده */}
              <line
                x1={x1}
                y1={H / 2}
                x2={x2}
                y2={H / 2}
                stroke={color}
                strokeWidth="2"
                className="dataflow-line"
                style={{ filter: `drop-shadow(0 0 4px ${color})` }}
              />
              {/* نقطه متحرک روی مسیر داده */}
              <circle r="3.5" fill={color} opacity="0.9">
                <animate
                  attributeName="cx"
                  from={x1}
                  to={x2}
                  dur={`${1.6 + i * 0.2}s`}
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="cy"
                  values={`${H / 2};${H / 2 - 5};${H / 2}`}
                  dur={`${1.6 + i * 0.2}s`}
                  repeatCount="indefinite"
                />
                <animate attributeName="opacity" values="0;1;0" dur={`${1.6 + i * 0.2}s`} repeatCount="indefinite" />
              </circle>
            </g>
          );
        })}

        {/* نودها */}
        {nodes.map((n, i) => (
          <g key={`node-${i}`}>
            <rect
              x={centers[i] - 44}
              y={H / 2 - 44}
              width="88"
              height="88"
              rx="22"
              fill={`url(#node-glow-${i})`}
              stroke={n.glow}
              strokeOpacity="0.4"
              strokeWidth="1"
            />
            {/* آیکن به صورت متن وکتوری از خود کامپوننت رندر نمی‌شود؛ در لایه HTML روبان قرار می‌گیرد */}
          </g>
        ))}
      </svg>

      {/* لایه HTML روی SVG برای آیکن و برچسب */}
      <div className="pointer-events-none absolute inset-0 min-w-[760px]" style={{ direction: "ltr" }}>
        {nodes.map((n, i) => (
          <div
            key={`overlay-${i}`}
            className="absolute flex w-[88px] flex-col items-center gap-1.5"
            style={{
              left: `${(centers[i] / W) * 100}%`,
              top: "50%",
              transform: "translate(-50%, -50%)",
            }}
          >
            <div
              className="flex size-10 items-center justify-center rounded-xl border backdrop-blur-sm"
              style={{
                borderColor: `${n.glow}55`,
                background: `radial-gradient(circle at 50% 30%, ${n.glow}22, transparent 70%)`,
                boxShadow: `0 0 16px ${n.glow}33`,
              }}
            >
              <n.icon className={cn("size-5", n.color)} />
            </div>
            <span className={cn("text-center text-[10px] font-medium leading-tight", n.color)}>{n.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
