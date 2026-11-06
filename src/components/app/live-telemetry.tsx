"use client";

// ─────────────────────────────────────────────────────────────────────────────
// تلهمتری زنده v4.0 — نشانگر اتصال به سرورهای زنده + رادار اخبار و مصدومیت‌ها
//   LiveSyncBadge : بج سبز «متصل به فید زنده» + شمارش بازی‌های واقعی + دکمه همگام‌سازی
//   NewsRadar     : پنل «رادار اخبار و مصدومیت‌های زنده» از اندپوینت خبری ESPN
//                   + پنل سلامت منابع (ESPN / TheSportsDB / Open-Meteo / The Odds API)
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CloudRain,
  Newspaper,
  RadioTower,
  RefreshCcw,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQuantStore } from "@/lib/store";
import { syncLive, agoLabel } from "@/lib/live-client";
import { faNum } from "@/lib/format";
import { cn } from "@/lib/utils";

/** تطبیق تیتر خبر با نام تیم‌های بازی‌های فعلی — برای چیپ «تاثیر بر مناظره» */
function matchTeams(headlinePlusDesc: string, teamPairs: { id: string; label: string; teams: string[] }[]): string[] {
  const text = headlinePlusDesc.toLowerCase();
  const out: string[] = [];
  for (const p of teamPairs) {
    if (p.teams.some((t) => t.length > 3 && text.includes(t.toLowerCase()))) out.push(p.label);
  }
  return out.slice(0, 3);
}

/** بج سراسری اتصال زنده در هدر — v4.0 */
export function LiveSyncBadge() {
  const liveFeed = useQuantStore((s) => s.liveFeed);
  const liveSyncing = useQuantStore((s) => s.liveSyncing);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  const isLive = liveFeed?.mode === "LIVE" && (liveFeed?.matchesLive ?? 0) > 0;
  const syncedAt = liveFeed?.lastSyncAt ?? null;

  return (
    <Button
      size="sm"
      variant="outline"
      className={cn(
        "h-8 gap-1.5 border text-[10px] sm:text-[11px]",
        isLive
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
          : "border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
      )}
      onClick={() => void syncLive(true)}
      disabled={liveSyncing}
      aria-label="همگام‌سازی مجدد با سرورهای زنده"
      title={
        isLive
          ? `متصل به فید زنده ESPN & TheSportsDB — آخرین همگام‌سازی ${agoLabel(syncedAt, now)}`
          : "اتصال به سرورهای زنده برقرار نشد — دیتای داخلی"
      }
    >
      {isLive ? <Wifi className="size-3.5" /> : <WifiOff className="size-3.5" />}
      <span className="hidden sm:inline">
        {isLive ? "متصل به فید زنده ESPN & TheSportsDB" : "دیتای داخلی (آفلاین)"}
      </span>
      {isLive && (
        <span className="flex items-center gap-1 rounded-full bg-emerald-500/20 px-1.5 py-0 font-num" dir="ltr">
          <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" aria-hidden />
          {faNum(liveFeed?.matchesLive ?? 0, 0)} بازی
        </span>
      )}
      <RefreshCcw className={cn("size-3", liveSyncing && "animate-spin")} aria-hidden />
    </Button>
  );
}

/** نوار اخبار فشرده برای حالت داشبورد سریع */
export function NewsTickerStrip() {
  const liveFeed = useQuantStore((s) => s.liveFeed);
  const news = liveFeed?.news ?? [];
  if (news.length === 0) return null;
  return (
    <div className="flex items-center gap-2 overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2" aria-label="اخبار زنده">
      <Badge className="shrink-0 gap-1 border-rose-500/40 bg-rose-500/15 px-1.5 text-[9px] text-rose-300" variant="outline">
        <Newspaper className="size-2.5" /> زنده
      </Badge>
      <div className="flex min-w-0 gap-6 overflow-x-auto text-[11px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {news.slice(0, 6).map((n) => (
          <a
            key={n.headline}
            href={n.url}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground"
          >
            <span className="text-rose-400" aria-hidden>◆</span> {n.headline}
          </a>
        ))}
      </div>
    </div>
  );
}

/** پنل کامل رادار اخبار و مصدومیت‌های زنده — تب مستقل در آزمایشگاه کوانت */
export function NewsRadar() {
  const liveFeed = useQuantStore((s) => s.liveFeed);
  const liveSyncing = useQuantStore((s) => s.liveSyncing);
  const matches = useQuantStore((s) => s.matches);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);

  const news = liveFeed?.news ?? [];
  const sources = liveFeed?.sources ?? [];
  const isLive = liveFeed?.mode === "LIVE";

  const teamPairs = useMemo(
    () =>
      matches.map((m) => ({
        id: m.id,
        label: `${m.homeTeam} × ${m.awayTeam}`,
        teams: [m.homeTeam, m.awayTeam],
      })),
    [matches]
  );

  return (
    <div className="space-y-4">
      {/* هدر + دکمه همگام‌سازی */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold sm:text-base">
            <Newspaper className="size-4 text-rose-400" />
            رادار اخبار و مصدومیت‌های زنده
            <Badge className="gap-1 border-violet-500/40 bg-violet-500/15 px-1.5 text-[9px] text-violet-300" variant="outline">
              Live News & Injury Feed
            </Badge>
          </h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            تیترهای واقعی اندپوینت خبری ESPN · اخبار مرتبط با هر بازی به‌عنوان مستند واقعی به استدلال ایجنت گاو/خرس الصاق می‌شود · آخرین همگام‌سازی: {agoLabel(liveFeed?.lastSyncAt, now)}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 border-emerald-500/30 text-xs text-emerald-300 hover:bg-emerald-500/10"
          onClick={() => void syncLive(true)}
          disabled={liveSyncing}
        >
          <RefreshCcw className={cn("size-3.5", liveSyncing && "animate-spin")} />
          {liveSyncing ? "در حال همگام‌سازی…" : "همگام‌سازی مجدد با سرورهای زنده"}
        </Button>
      </div>

      {/* سلامت منابع */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {(sources.length > 0
          ? sources
          : [
              { key: "espn", label: "ESPN Scoreboard", ok: false, detail: "همگام‌سازی انجام نشده", latencyMs: 0 },
              { key: "sportsdb", label: "TheSportsDB", ok: false, detail: "همگام‌سازی انجام نشده", latencyMs: 0 },
              { key: "odds", label: "The Odds API v4", ok: false, detail: "همگام‌سازی انجام نشده", latencyMs: 0 },
              { key: "news", label: "ESPN Live News", ok: false, detail: "همگام‌سازی انجام نشده", latencyMs: 0 },
              { key: "weather", label: "Open-Meteo", ok: false, detail: "همگام‌سازی انجام نشده", latencyMs: 0 },
            ]
        ).map((s) => (
          <div
            key={s.key}
            className={cn(
              "flex items-center gap-2.5 rounded-xl border p-3",
              s.ok ? "border-emerald-500/25 bg-emerald-500/[0.05]" : "border-amber-500/25 bg-amber-500/[0.05]"
            )}
          >
            <RadioTower className={cn("size-4 shrink-0", s.ok ? "text-emerald-400" : "text-amber-400")} />
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-xs font-semibold">
                {s.label}
                <span className={cn("text-[9px]", s.ok ? "text-emerald-400" : "text-amber-400")}>{s.ok ? "● متصل" : "● محدود"}</span>
              </p>
              <p className="truncate text-[10px] text-muted-foreground" dir="auto">{s.detail}</p>
            </div>
          </div>
        ))}
        {liveFeed?.odds.creditsRemaining != null && (
          <div className="flex items-center gap-2.5 rounded-xl border border-cyan-500/25 bg-cyan-500/[0.05] p-3">
            <Activity className="size-4 shrink-0 text-cyan-400" />
            <div>
              <p className="text-xs font-semibold">اعتبار The Odds API</p>
              <p className="text-[10px] text-muted-foreground">
                <span className="font-num" dir="ltr">{faNum(liveFeed.odds.creditsRemaining, 0)}</span> درخواست باقی‌مانده از پلن رایگان
              </p>
            </div>
          </div>
        )}
        {(liveFeed?.weatherAdjusted ?? 0) > 0 && (
          <div className="flex items-center gap-2.5 rounded-xl border border-sky-500/25 bg-sky-500/[0.05] p-3">
            <CloudRain className="size-4 shrink-0 text-sky-400" />
            <div>
              <p className="text-xs font-semibold">تعدیل جوی زنده</p>
              <p className="text-[10px] text-muted-foreground">
                λ موتور دیکسون-کولز برای <span className="font-num" dir="ltr">{faNum(liveFeed?.weatherAdjusted ?? 0, 0)}</span> بازی −۸٪ اصلاح شد
              </p>
            </div>
          </div>
        )}
      </div>

      {/* فهرست اخبار */}
      {news.length === 0 ? (
        <div className="flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 p-6 text-center">
          <AlertTriangle className="size-6 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            {isLive ? "هیچ تیتری دریافت نشد — دکمه همگام‌سازی را بزنید." : "اتصال به فید خبری ESPN برقرار نشد — دیتای زنده در دسترس نیست."}
          </p>
        </div>
      ) : (
        <ScrollArea className="max-h-[52vh]">
          <div className="grid gap-2 pr-1 lg:grid-cols-2">
            {news.map((n) => {
              const affected = matchTeams(`${n.headline} ${n.description}`, teamPairs);
              return (
                <a
                  key={n.headline}
                  href={n.url}
                  target="_blank"
                  rel="noreferrer"
                  className="group rounded-xl border border-white/10 bg-white/[0.03] p-3 transition-colors hover:border-white/25 hover:bg-white/[0.05]"
                >
                  <p className="flex items-start justify-between gap-2 text-xs font-semibold leading-5">
                    <span className="line-clamp-2">{n.headline}</span>
                    <ArrowUpRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-emerald-400" />
                  </p>
                  {n.description && (
                    <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-muted-foreground">{n.description}</p>
                  )}
                  <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span className="rounded bg-white/10 px-1.5 py-0.5" dir="ltr">
                      {n.leagueSlug.replace(".", "·")}
                    </span>
                    <span dir="ltr">{agoLabel(Date.parse(n.published) || null, now)}</span>
                    {affected.map((label) => (
                      <span key={label} className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] text-emerald-300" dir="auto">
                        ⚡ {label}
                      </span>
                    ))}
                  </p>
                </a>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
