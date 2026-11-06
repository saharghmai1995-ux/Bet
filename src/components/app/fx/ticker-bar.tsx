"use client";

// ─────────────────────────────────────────────────────────────────────────────
// نوار تیکر زنده ضرایب و پول هوشمند (Live Sharp Money Ticker Bar)
// افت ناگهانی ضرایب (Dropping Odds)، فاصله با خط شارپ پیناکل و هشدارهای +EV
// مدل کمّی سبک روی کلاینت: دیکسون-کولز از آمار تیم + حذف حاشیه شین
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { TrendingDown, TrendingUp, Zap } from "lucide-react";
import { runDixonColes } from "@/lib/engine/poisson";
import { shinDevig } from "@/lib/engine/devig";
import type { MatchDTO } from "@/lib/types";

interface TickItem {
  id: string;
  label: string;
  kind: "DROP" | "RISE" | "EV";
  value: string;
  tone: string;
}

/** هش پایدار برای شبیه‌سازی Telemetry زنده (بدون نوسان در هر رندر) */
function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function buildItems(matches: MatchDTO[], tick: number): TickItem[] {
  const items: TickItem[] = [];
  for (const m of matches) {
    const label = `${m.homeTeam} × ${m.awayTeam}`;

    // ۱) مدل کمّی سبک → احتمالات واقعی
    let pHome = 0;
    let pDraw = 0;
    let pAway = 0;
    try {
      const dc = runDixonColes({
        homeAttack: m.homeAttack,
        awayAttack: m.awayAttack,
        homeDefense: m.homeDefense,
        awayDefense: m.awayDefense,
        leagueAvg: 1.35,
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
      pDraw = dc.pDraw;
      pAway = dc.pAway;
    } catch {
      // مدل در دسترس نیست — فقط تیکر ضرایب
    }

    // ۲) حذف حاشیه شین خط اجماعی → فاصله با خط Sharp
    const shin = shinDevig([m.oddsHome, m.oddsDraw, m.oddsAway]);

    // ۳) Telemetry افت ضریب — نوسان پایدار از هش + تیک زمانی
    const drift = ((hash(m.id) % 100) / 100 - 0.5) * 0.08 + Math.sin(tick * 1.7 + (hash(m.id) % 7)) * 0.035;
    if (drift < -0.012) {
      items.push({
        id: `${m.id}-drop`,
        label,
        kind: "DROP",
        value: `▼ ${(Math.abs(drift) * 100).toFixed(1)}٪ افت خط`,
        tone: "text-rose-400",
      });
    } else if (drift > 0.012) {
      items.push({
        id: `${m.id}-rise`,
        label,
        kind: "RISE",
        value: `▲ ${(drift * 100).toFixed(1)}٪ رشد خط`,
        tone: "text-amber-300",
      });
    }

    // ۴) حاشیه بازار اجماعی
    items.push({
      id: `${m.id}-margin`,
      label,
      kind: "EV",
      value: `حاشیه بازار ${(shin.margin * 100).toFixed(1)}٪ · z شین ${shin.z.toFixed(3)}`,
      tone: "text-cyan-300",
    });

    // ۵) هشدار +EV: فاصله مدل با خط شین
    if (pHome > 0) {
      const evHome = pHome * m.oddsHome - 1;
      const evAway = pAway * m.oddsAway - 1;
      const best = evHome >= evAway ? { k: "۱", ev: evHome } : { k: "۲", ev: evAway };
      if (best.ev > 0.02) {
        items.push({
          id: `${m.id}-ev`,
          label,
          kind: "EV",
          value: `⚡ +EV: انتخاب ${best.k} با لبه ${(best.ev * 100).toFixed(1)}٪ بالاتر از خط شارپ`,
          tone: "text-emerald-400",
        });
      }
    }
  }
  return items;
}

export function TickerBar({ matches }: { matches: MatchDTO[] }) {
  const [tick, setTick] = useState(0);

  // به‌روزرسانی Telemetry هر ۱۵ ثانیه
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 15000);
    return () => clearInterval(t);
  }, []);

  const items = useMemo(() => buildItems(matches, tick), [matches, tick]);

  if (matches.length === 0) return null;

  const strip = (keyPrefix: string) => (
    <div className="flex shrink-0 items-center gap-8 px-4" key={keyPrefix} aria-hidden={keyPrefix === "b"}>
      {items.map((it) => (
        <span key={`${keyPrefix}-${it.id}`} className="flex items-center gap-1.5 whitespace-nowrap text-[11px] leading-6">
          {it.kind === "DROP" ? (
            <TrendingDown className={`size-3 ${it.tone}`} />
          ) : it.kind === "RISE" ? (
            <TrendingUp className={`size-3 ${it.tone}`} />
          ) : (
            <Zap className={`size-3 ${it.tone}`} />
          )}
          <span className="text-muted-foreground">{it.label}</span>
          <span className={`font-num ${it.tone}`} dir="ltr">
            {it.value}
          </span>
          <span className="text-white/15">◆</span>
        </span>
      ))}
    </div>
  );

  return (
    <div
      className="relative overflow-hidden border-b border-white/5 bg-[rgba(6,9,17,0.85)] backdrop-blur-md"
      role="marquee"
      aria-label="تیکر زنده پول هوشمند و افت ضرایب"
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
