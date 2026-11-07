"use client";

// ─────────────────────────────────────────────────────────────────────────────
// نوار تیکر زنده سیگنال‌های کمّی (Live Quant Signal Ticker Bar) — v6.0 Zero-Mock
// فقط سیگنال‌های قابل راستی‌آزمایی از داده واقعی: لبه مدل نسبت به خط شارپ،
// حاشیه بازار اجماعی و z شین — بدون هیچ نوسان ساختگی/Telemetry جعلی.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from "react";
import { Zap } from "lucide-react";
import { runDixonColes } from "@/lib/engine/poisson";
import { shinDevig } from "@/lib/engine/devig";
import type { MatchDTO } from "@/lib/types";

interface TickItem {
  id: string;
  kind: "EV" | "MARGIN" | "SHARP";
  /** نام بازی (فارسی) — با فونت فارسی رندر می‌شود */
  matchLabel: string;
  /** برچسب فارسی — فقط با فونت فارسی صفحه رندر می‌شود (هرگز داخل font-num) */
  label: string;
  /** مقدار عددی لاتین (خروجی toFixed) — با tabular-nums و dir=ltr رندر می‌شود */
  value: string;
  /** برچسب فارسی مکمل برای z (فقط آیتم حاشیه بازار) */
  zLabel?: string;
  /** مقدار z خالصاً ASCII — تنها رشته‌ای که با font-num رندر می‌شود */
  zAscii?: string;
  tone: string;
}

function buildItems(matches: MatchDTO[]): TickItem[] {
  const items: TickItem[] = [];
  for (const m of matches) {
    const matchLabel = `${m.homeTeam} × ${m.awayTeam}`;

    // ۱) مدل کمّی سبک از قدرت‌های واقعی جدول فصل → احتمالات واقعی
    let pHome = 0;
    let pAway = 0;
    try {
      const dc = runDixonColes({
        homeAttack: m.homeAttack,
        awayAttack: m.awayAttack,
        homeDefense: m.homeDefense,
        awayDefense: m.awayDefense,
        leagueAvg: m.leagueTeamAvg ?? 1.35,
        homeAdvantage: 1.12,
        rho: -0.08,
        eloDiff: m.homeElo - m.awayElo,
        eloWeight: 0.35,
        homeAbsenceImpact: m.homeAbsence ? 0.08 : 0,
        awayAbsenceImpact: m.awayAbsence ? 0.08 : 0,
        timeDecayXi: 0.0065,
        daysAgo: 60,
      });
      pHome = dc.pHome;
      pAway = dc.pAway;
    } catch {
      // مدل در دسترس نیست — فقط تیکر حاشیه بازار
    }

    // ۲) حذف حاشیه شین خط اجماعی واقعی → فاصله با خط Sharp
    const shin = shinDevig([m.oddsHome, m.oddsDraw, m.oddsAway]);

    // ۳) حاشیه بازار اجماعی (داده واقعی ضرایب)
    items.push({
      id: `${m.id}-margin`,
      kind: "MARGIN",
      matchLabel,
      label: "حاشیه بازار",
      value: (shin.margin * 100).toFixed(1),
      zLabel: "z شین",
      zAscii: shin.z.toFixed(3),
      tone: "text-cyan-300",
    });

    // ۴) هشدار +EV واقعی: فاصله مدل (از جدول فصل) با خط شین — فقط وقتی معنادار
    if (pHome > 0) {
      const evHome = pHome * m.oddsHome - 1;
      const evAway = pAway * m.oddsAway - 1;
      const best = evHome >= evAway ? { ev: evHome } : { ev: evAway };
      if (best.ev > 0.02) {
        items.push({
          id: `${m.id}-ev`,
          kind: "SHARP",
          matchLabel,
          label: "لبه بالاتر از خط شارپ",
          value: `+${(best.ev * 100).toFixed(1)}`,
          tone: "text-emerald-400",
        });
      }
    }
  }
  return items;
}

export function TickerBar({ matches }: { matches: MatchDTO[] }) {
  const items = useMemo(() => buildItems(matches), [matches]);

  if (matches.length === 0 || items.length === 0) return null;

  const strip = (keyPrefix: string) => (
    <div className="flex shrink-0 items-center gap-8 px-4" key={keyPrefix} aria-hidden={keyPrefix === "b"}>
      {items.map((it) => (
        <span key={`${keyPrefix}-${it.id}`} className="flex items-center gap-1.5 whitespace-nowrap text-[11px] leading-6">
          <Zap className={`size-3 ${it.tone}`} />
          <span className="text-foreground/60">{it.matchLabel}</span>
          <span className="text-muted-foreground">{it.label}</span>
          <span dir="ltr" className={`tabular-nums font-semibold ${it.tone}`}>
            {it.value}
          </span>
          {it.zAscii !== undefined && (
            <span className="text-[10px] text-muted-foreground/70">
              {it.zLabel} <span dir="ltr" className="font-num">{it.zAscii}</span>
            </span>
          )}
          <span className="mx-1 inline-block size-1 rounded-full bg-white/15" />
        </span>
      ))}
    </div>
  );

  return (
    <div
      className="relative overflow-hidden border-b border-white/5 bg-[rgba(6,9,17,0.85)] backdrop-blur-md"
      role="marquee"
      aria-label="تیکر زنده سیگنال‌های کمّی قابل راستی‌آزمایی"
    >
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-14 bg-gradient-to-l from-[#060911] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-14 bg-gradient-to-r from-[#060911] to-transparent" />
      <div className="ticker-track py-1.5">
        {strip("a")}
        {strip("b")}
      </div>
    </div>
  );
}
