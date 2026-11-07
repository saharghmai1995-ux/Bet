"use client";

// ─────────────────────────────────────────────────────────────────────────────
// خط لوله جریان داده با ذرات نوری متحرک (Animated SVG Particle Pipeline) — v8.0
// ESPN Live API ← ۱۰,۰۰۰ مونت‌کارلو ← دروازه سوپروایزر (وتو/تایید) ← فلش‌کارت تاج‌دار
// حرکت نور با انیمیشن stroke-dashoffset + ذرات در حال حرکت
// ─────────────────────────────────────────────────────────────────────────────

import { cn } from "@/lib/utils";

const NODES = [
  { label: "ESPN Live API", sub: "فید رسمی زنده", icon: "📡" },
  { label: "۱۰,۰۰۰ مونت‌کارلو", sub: "کاپولا دیکسون-کولز", icon: "🎲" },
  { label: "دروازه سوپروایزر", sub: "وتو / تایید", icon: "🛡️" },
  { label: "تک‌تیپ طلایی", sub: "فلش‌کارت تاج‌دار", icon: "👑" },
] as const;

export function ParticlePipeline({ className }: { className?: string }) {
  return (
    <div className={cn("w-full", className)} role="img" aria-label="خط لوله جریان داده: ESPN ← مونت‌کارلو ← سوپروایزر ← فلش‌کارت">
      <svg viewBox="0 0 800 120" className="w-full" aria-hidden>
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

        {/* سیم‌های انتقال با جریان نوری متحرک (RTL — از راست به چپ) */}
        {[0, 1, 2].map((i) => {
          const x1 = 690 - i * 200;
          const x2 = x1 - 120;
          return (
            <g key={i}>
              <line x1={x1} y1="60" x2={x2} y2="60" stroke="url(#pp-wire)" strokeWidth="2.5" strokeDasharray="12 8" className="pp-flow" />
              {/* ذره نورانی متحرک روی سیم */}
              <circle r="5" fill="url(#pp-particle)">
                <animate attributeName="cx" values={`${x1};${x2}`} dur={`${2.2 + i * 0.35}s`} repeatCount="indefinite" />
                <animate attributeName="cy" values="60;60" dur={`${2.2 + i * 0.35}s`} repeatCount="indefinite" />
                <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.15;0.85;1" dur={`${2.2 + i * 0.35}s`} repeatCount="indefinite" />
              </circle>
            </g>
          );
        })}

        {/* گره‌ها */}
        {NODES.map((n, i) => {
          const cx = 750 - i * 200;
          return (
            <g key={n.label}>
              {/* حلقه پالس */}
              <circle cx={cx} cy="60" r="34" fill="rgba(10,16,28,0.9)" stroke={i === 2 ? "#fbbf24" : i === 3 ? "#34d399" : "#22d3ee"} strokeOpacity="0.55" strokeWidth="2">
                <animate attributeName="r" values="32;36;32" dur="3s" begin={`${i * 0.4}s`} repeatCount="indefinite" />
                <animate attributeName="stroke-opacity" values="0.6;0.18;0.6" dur="3s" begin={`${i * 0.4}s`} repeatCount="indefinite" />
              </circle>
              <text x={cx} y="66" textAnchor="middle" fontSize="22">{n.icon}</text>
              <text x={cx} y="106" textAnchor="middle" fontSize="13" fontWeight="700" fill="#e2e8f0">{n.label}</text>
              <text x={cx} y="22" textAnchor="middle" fontSize="10.5" fill="#94a3b8">{n.sub}</text>
            </g>
          );
        })}
      </svg>
      <style jsx>{`
        .pp-flow {
          animation: pp-dash 1.1s linear infinite;
        }
        @keyframes pp-dash {
          to { stroke-dashoffset: -20; }
        }
      `}</style>
    </div>
  );
}
