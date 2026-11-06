"use client";

// ─────────────────────────────────────────────────────────────────────────────
// کارت سه‌بعدی تیپ مکمل (3D Parallax Betting Slip)
// چرخش سه‌بعدی حساس به ماوس (3D Tilt) + نوار نوری چرخان conic-gradient
// برای تیپ دارای بالاترین ارزش مورد انتظار (+EV) در تب ۳
// ─────────────────────────────────────────────────────────────────────────────

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface TiltSlipProps {
  children: React.ReactNode;
  /** نوار نوری چرخان فعال (تیپ با بالاترین +EV) */
  beam?: boolean;
  /** رنگ نوار نوری */
  beamColor?: string;
  className?: string;
  ariaLabel?: string;
}

export function TiltSlip({ children, beam, beamColor = "#10b981", className, ariaLabel }: TiltSlipProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [t, setT] = useState({ rx: 0, ry: 0 });
  const [active, setActive] = useState(false);

  const onMouseMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / rect.width;
    const my = (e.clientY - rect.top) / rect.height;
    setT({ rx: (0.5 - my) * 12, ry: (mx - 0.5) * 14 });
    el.style.setProperty("--glare-x", `${mx * 100}%`);
    el.style.setProperty("--glare-y", `${my * 100}%`);
  };

  const reset = () => {
    setT({ rx: 0, ry: 0 });
    setActive(false);
  };

  return (
    <div style={{ perspective: "900px" }} className={className}>
      <div
        ref={ref}
        onMouseMove={onMouseMove}
        onMouseEnter={() => setActive(true)}
        onMouseLeave={reset}
        className={cn(
          "glass tilt-card relative h-full rounded-xl p-4 transition-transform duration-200 ease-out",
          beam && "beam-border",
          active && "shadow-[0_18px_45px_rgba(0,0,0,0.45)]"
        )}
        style={{
          transform: `rotateX(${t.rx}deg) rotateY(${t.ry}deg)`,
          transformStyle: "preserve-3d",
          ...(beam ? ({ "--beam-color": beamColor } as React.CSSProperties) : {}),
        }}
        aria-label={ariaLabel}
      >
        <div className="tilt-glare" />
        {children}
      </div>
    </div>
  );
}
