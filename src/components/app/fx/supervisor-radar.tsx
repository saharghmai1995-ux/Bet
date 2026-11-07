"use client";

// ─────────────────────────────────────────────────────────────────────────────
// رادار چرخان مونت‌کارلو و سوپروایزر در هدر (Animated SVG Radar Scanner) — v8.0
// عقربه نوری چرخان + حلقه‌های پالس‌دار — اسکن زنده مسابقات
// ─────────────────────────────────────────────────────────────────────────────

import { useQuantStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export function SupervisorRadar({ size = 34, className }: { size?: number; className?: string }) {
  const scanning = useQuantStore((s) => s.scanning);
  const matches = useQuantStore((s) => s.matches.length);

  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`رادار اسکن زنده مونت‌کارلو و سوپروایزر — ${scanning ? "در حال اسکن" : "آماده"}`}
      title={`رادار سوپروایزر — ${matches} مسابقه در محدوده اسکن ${scanning ? "· در حال اسکن زنده" : ""}`}
    >
      <svg viewBox="0 0 100 100" width={size} height={size}>
        <defs>
          <linearGradient id="radar-sweep" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#34d399" stopOpacity="0.05" />
          </linearGradient>
        </defs>

        {/* حلقه‌های پالس‌دار */}
        <circle cx="50" cy="50" r="46" fill="none" stroke="#34d399" strokeOpacity="0.25" strokeWidth="1.5">
          <animate attributeName="r" values="40;47;40" dur="2.4s" repeatCount="indefinite" />
          <animate attributeName="stroke-opacity" values="0.45;0.08;0.45" dur="2.4s" repeatCount="indefinite" />
        </circle>
        <circle cx="50" cy="50" r="34" fill="none" stroke="#22d3ee" strokeOpacity="0.3" strokeWidth="1.2" strokeDasharray="5 7" />
        <circle cx="50" cy="50" r="22" fill="none" stroke="#34d399" strokeOpacity="0.4" strokeWidth="1" />
        <line x1="6" y1="50" x2="94" y2="50" stroke="#34d399" strokeOpacity="0.18" strokeWidth="1" />
        <line x1="50" y1="6" x2="50" y2="94" stroke="#34d399" strokeOpacity="0.18" strokeWidth="1" />

        {/* بخش جاروب‌شده چرخان */}
        <g style={{ transformOrigin: "50px 50px", animation: "hdr-radar-spin 2.6s linear infinite" }}>
          <path d="M50 50 L50 6 A44 44 0 0 1 81 19 Z" fill="url(#radar-sweep)" />
          <circle cx="50" cy="6" r="3.2" fill="#6ee7b7">
            <animate attributeName="opacity" values="1;0.4;1" dur="1s" repeatCount="indefinite" />
          </circle>
        </g>

        {/* مرکز */}
        <circle cx="50" cy="50" r="4.5" fill="#34d399" />
      </svg>
      <style jsx>{`
        @keyframes hdr-radar-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </span>
  );
}
