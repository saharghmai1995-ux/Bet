"use client";

// ─────────────────────────────────────────────────────────────────────────────
// خط لوله جریان داده با ذرات نوری متحرک (Animated SVG Particle Pipeline) — v13.0
// ESPN Live API ← ۱۰,۰۰۰ مونت‌کارلو ← دروازه سوپروایزر (وتو/تایید) ← فلش‌کارت تاج‌دار
// v13.0-⑩ — گره‌ها به ردیف HTML با items-center justify-between منتقل شدند تا
// مراکز هر ۴ دایره «دقیقاً» روی یک خط افقی تراز شوند + سیم‌های نوری در پس‌زمینه SVG.
// ─────────────────────────────────────────────────────────────────────────────

import { cn } from "@/lib/utils";

const NODES = [
  { label: "ESPN Live API", sub: "فید رسمی زنده", icon: "📡", ring: "#22d3ee" },
  { label: "۱۰,۰۰۰ مونت‌کارلو", sub: "کاپولا دیکسون-کولز", icon: "🎲", ring: "#22d3ee" },
  { label: "دروازه سوپروایزر", sub: "وتو / تایید", icon: "🛡️", ring: "#fbbf24" },
  { label: "تک‌تیپ طلایی", sub: "فلش‌کارت تاج‌دار", icon: "👑", ring: "#34d399" },
] as const;

export function ParticlePipeline({ className }: { className?: string }) {
  return (
    <div className={cn("w-full", className)} role="img" aria-label="خط لوله جریان داده: ESPN ← مونت‌کارلو ← سوپروایزر ← فلش‌کارت">
      <div className="relative">
        {/* سیم‌های انتقال با جریان نوری متحرک (RTL — از راست به چپ) — لایه پس‌زمینه */}
        <svg viewBox="0 0 800 120" className="absolute inset-0 h-full w-full" preserveAspectRatio="none" aria-hidden>
          <defs>
            <linearGradient id="pp-wire" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.7" />
              <stop offset="50%" stopColor="#34d399" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#fbbf24" stopOpacity="0.9" />
            </linearGradient>
            <radialGradient id="pp-particle" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#a7f3d0" />
              <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
            </radialGradient>
          </defs>
          {[0, 1, 2].map((i) => {
            const x1 = 690 - i * 200;
            const x2 = x1 - 120;
            return (
              <g key={i}>
                <line x1={x1} y1="60" x2={x2} y2="60" stroke="url(#pp-wire)" strokeWidth="2.5" strokeDasharray="12 8" className="pp-flow" />
                <circle r="5" fill="url(#pp-particle)">
                  <animate attributeName="cx" values={`${x1};${x2}`} dur={`${2.2 + i * 0.35}s`} repeatCount="indefinite" />
                  <animate attributeName="cy" values="60;60" dur={`${2.2 + i * 0.35}s`} repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.15;0.85;1" dur={`${2.2 + i * 0.35}s`} repeatCount="indefinite" />
                </circle>
              </g>
            );
          })}
        </svg>

        {/* ═══ v13.0-⑩ — ردیف گره‌ها: flex items-center justify-between — تراز کامل مراکز ═══ */}
        <div className="relative z-10 flex items-center justify-between" aria-hidden>
          {NODES.map((n, i) => (
            <div key={n.label} className="flex min-w-0 flex-col items-center gap-1 px-1">
              <span className="text-[10.5px] text-muted-foreground">{n.sub}</span>
              <span
                className="flex size-[68px] items-center justify-center rounded-full border-2 bg-[rgba(10,16,28,0.9)] text-2xl shadow-[0_0_18px_rgba(16,185,129,0.12)]"
                style={{ borderColor: n.ring, borderOpacity: 0.55 }}
              >
                <span className="pp-pulse" style={{ animationDelay: `${i * 0.4}s` }}>
                  {n.icon}
                </span>
              </span>
              <span className="whitespace-nowrap text-center text-[12.5px] font-bold text-foreground/90">{n.label}</span>
            </div>
          ))}
        </div>
      </div>
      <style jsx>{`
        .pp-flow {
          animation: pp-dash 1.1s linear infinite;
        }
        @keyframes pp-dash {
          to { stroke-dashoffset: -20; }
        }
        .pp-pulse {
          display: inline-block;
          animation: pp-node 3s ease-in-out infinite;
        }
        @keyframes pp-node {
          0%, 100% { transform: scale(1); opacity: 0.92; }
          50% { transform: scale(1.12); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
