"use client";

// ─────────────────────────────────────────────────────────────────────────────
// مهر تایید هولوگرافیک سوپروایزر (Animated SVG Supervisor Seal) — v8.0
// حلقه چرخان طلایی/زمردی + تاج مرکزی؛ نشان می‌دهد این تک‌تیپ از فیلتر
// ۱۰,۰۰۰ شبیه‌سازی مونت‌کارلو و ممیزی ایجنت سوپروایزر عبور کرده است.
// ─────────────────────────────────────────────────────────────────────────────

import { cn } from "@/lib/utils";

export function SupervisorSeal({
  size = 44,
  approved = true,
  score,
  className,
  title,
}: {
  size?: number;
  approved?: boolean;
  /** امتیاز ۰..۱۰۰ در مرکز مهر */
  score?: number;
  className?: string;
  title?: string;
}) {
  const ring = approved ? "#34d399" : "#fb7185";
  const glow = approved ? "rgba(52,211,153,0.35)" : "rgba(251,113,133,0.35)";

  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={title ?? (approved ? "مهر تایید سوپروایزر" : "مهر وتو سوپروایزر")}
      title={title ?? (approved ? "عبور از فیلتر ۱۰,۰۰۰ شبیه‌سازی مونت‌کارلو + ممیزی سوپروایزر" : "وتو ایجنت سوپروایزر")}
    >
      <svg viewBox="0 0 100 100" width={size} height={size} className="drop-shadow-[0_0_10px_rgba(16,185,129,0.25)]">
        <defs>
          <linearGradient id={`seal-g-${approved ? "a" : "r"}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={ring} stopOpacity="0.95" />
            <stop offset="100%" stopColor={approved ? "#fbbf24" : "#f43f5e"} stopOpacity="0.9" />
          </linearGradient>
        </defs>

        {/* هاله پالس‌دار */}
        <circle cx="50" cy="50" r="44" fill="none" stroke={glow} strokeWidth="2">
          <animate attributeName="r" values="40;46;40" dur="2.6s" repeatCount="indefinite" />
          <animate attributeName="stroke-opacity" values="0.55;0.12;0.55" dur="2.6s" repeatCount="indefinite" />
        </circle>

        {/* حلقه چرخان بیرونی (خط‌چین) */}
        <g style={{ transformOrigin: "50px 50px", animation: "seal-spin 9s linear infinite" }}>
          <circle
            cx="50"
            cy="50"
            r="38"
            fill="none"
            stroke={`url(#seal-g-${approved ? "a" : "r"})`}
            strokeWidth="3.5"
            strokeDasharray="10 6"
            strokeLinecap="round"
          />
        </g>

        {/* حلقه داخلی معکوس */}
        <g style={{ transformOrigin: "50px 50px", animation: "seal-spin-rev 6s linear infinite" }}>
          <circle cx="50" cy="50" r="30" fill="none" stroke={ring} strokeOpacity="0.55" strokeWidth="1.6" strokeDasharray="4 5" />
        </g>

        {/* هسته شیشه‌ای */}
        <circle cx="50" cy="50" r="24" fill="rgba(8,14,24,0.85)" stroke={ring} strokeOpacity="0.5" strokeWidth="1" />

        {/* تاج یا سپر */}
        {approved ? (
          <path
            d="M35 60 L38 42 L45 51 L50 38 L55 51 L62 42 L65 60 Z"
            fill={approved ? "#fbbf24" : "#fb7185"}
            stroke={approved ? "#fde68a" : "#fecdd3"}
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        ) : (
          <path
            d="M50 34 L64 39 V51 C64 60 58 65 50 68 C42 65 36 60 36 51 V39 Z"
            fill="none"
            stroke="#fb7185"
            strokeWidth="3"
            strokeLinejoin="round"
          />
          )}

        {/* امتیاز */}
        {typeof score === "number" && (
          <text x="50" y="80" textAnchor="middle" fontSize="13" fontWeight="700" fill={ring} className="font-num">
            {score}
          </text>
        )}
      </svg>
      <style jsx>{`
        @keyframes seal-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes seal-spin-rev {
          to { transform: rotate(-360deg); }
        }
      `}</style>
    </span>
  );
}
