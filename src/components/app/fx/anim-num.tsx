"use client";

// ─────────────────────────────────────────────────────────────────────────────
// شمارنده متحرک اعداد — Spring Physics Interpolation + Flash Tick
// هنگام تغییر مقدار: شمارش نرم + پس‌زمینه سبز/قرمز ۰.۴ ثانیه‌ای
// اعداد با فونت Monospace و tabular-nums تا ستون‌ها هنگام آپدیت زنده نلرزند
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface AnimNumProps {
  value: number;
  decimals?: number;
  className?: string;
  /** فلش سبز/قرمز هنگام افزایش/کاهش (پیش‌فرض فعال) */
  flash?: boolean;
  suffix?: string;
  prefix?: string;
  title?: string;
}

export function AnimNum({ value, decimals = 2, className, flash = true, suffix, prefix, title }: AnimNumProps) {
  const [display, setDisplay] = useState(value);
  const [flashCls, setFlashCls] = useState("");
  // الگوی رسمی React: تنظیم وضعیت هنگام رندر برای مقایسه با مقدار قبلی
  const [prev, setPrev] = useState(value);
  const rafRef = useRef<number | null>(null);
  const currentRef = useRef(value);

  if (value !== prev) {
    setPrev(value);
    if (flash) setFlashCls(value > prev ? "flash-up" : "flash-down");
  }

  useEffect(() => {
    // پاکسازی فلش بعد از ۰.۴ ثانیه (در callback — مجاز)
    if (flashCls) {
      const t = setTimeout(() => setFlashCls(""), 420);
      return () => clearTimeout(t);
    }
  }, [flashCls]);

  useEffect(() => {
    const from = currentRef.current;
    const to = value;
    if (Math.abs(to - from) < 1e-9) return;

    // درون‌یابی فنری با easeOutCubic در rAF callback (خارج از بدنه همگام)
    const start = performance.now();
    const duration = 340;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const v = from + (to - from) * eased;
      currentRef.current = v;
      setDisplay(v);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        currentRef.current = to;
        setDisplay(to);
      }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value]);

  const formatted =
    Math.abs(display) >= 1000 ? Math.round(display).toLocaleString("en-US") : display.toFixed(decimals);

  return (
    <span
      title={title}
      dir="ltr"
      className={cn("font-num inline-block rounded px-1 transition-colors", flashCls, className)}
    >
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}
