"use client";

// ─────────────────────────────────────────────────────────────────────────────
// تابلوی رصد زنده واقعی ESPN (Real In-Play Scoreboard Strip) — v6.1
// نمایش بازی‌های In-Play واقعی (نتیجه/دقیقه از ساعت رسمی ESPN) + لاگ رویدادهای
// واقعی ۸ دقیقه اخیر — صفر شبیه‌سازی، صفر عدد ساختگی.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import { Activity, Loader2, RadioTower } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { faNum } from "@/lib/format";
import { cn } from "@/lib/utils";

interface LiveMatchState {
  externalId: string;
  leagueName: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  clock: string;
  minute: number;
  statusDetail: string;
}

interface LiveDetectedEvent {
  eventId: string;
  type: "GOAL_HOME" | "GOAL_AWAY" | "RED_HOME" | "RED_AWAY";
  leagueName: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  minute: number;
  clock: string;
  detectedAt: number;
}

const EVENT_FA: Record<string, string> = {
  GOAL_HOME: "گل میزبان",
  GOAL_AWAY: "گل میهمان",
  RED_HOME: "کارت قرمز میزبان",
  RED_AWAY: "کارت قرمز میهمان",
};

export function LiveEspnStrip() {
  const [loading, setLoading] = useState(true);
  const [liveMatches, setLiveMatches] = useState<LiveMatchState[]>([]);
  const [events, setEvents] = useState<LiveDetectedEvent[]>([]);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const poll = useCallback(async () => {
    if (typeof document !== "undefined" && document.hidden) return;
    try {
      const res = await fetch("/api/live/events", { cache: "no-store" });
      const data = (await res.json()) as {
        success: boolean;
        liveMatches?: LiveMatchState[];
        events?: LiveDetectedEvent[];
        checkedAt?: number;
      };
      if (!data.success) throw new Error("failed");
      setLiveMatches(data.liveMatches ?? []);
      setEvents(data.events ?? []);
      setCheckedAt(data.checkedAt ?? Date.now());
      setError(null);
    } catch {
      setError("اتصال به فید ESPN برقرار نشد — تلاش مجدد خودکار");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void poll();
    const t = setInterval(() => void poll(), 30_000);
    const onVis = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [poll]);

  const checkedStr =
    checkedAt != null
      ? new Date(checkedAt).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
      : "—";

  return (
    <Card className="glass xl:col-span-2" data-testid="live-espn-strip">
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
          <RadioTower className="size-4 text-emerald-400" />
          رصد زنده واقعی ESPN — In-Play
          <Badge variant="outline" className="border-emerald-500/40 text-[9px] text-emerald-300">
            REAL_ESPN · بدون شبیه‌سازی
          </Badge>
          {loading && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
        </CardTitle>
        <CardDescription className="text-xs leading-relaxed">
          بازی‌های در جریان ۶ لیگ مستقیماً از اسکوربورد رسمی ESPN — گل‌ها با اختلاف امتیاز دو پول متوالی، کارت قرمز از
          keyEvents رسمی و دقیقه از ساعت بازی ESPN تشخیص داده می‌شود. توست پوشش فقط برای همین رویدادهای واقعی صادر می‌شود.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-300">{error}</p>
        )}

        {/* بازی‌های زنده واقعی */}
        {liveMatches.length === 0 ? (
          <p className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-[11px] text-muted-foreground">
            هم‌اکنون بازی In-Play در ۶ لیگ رصدشده وجود ندارد — آخرین بررسی: <span className="font-num">{checkedStr}</span>.
            با شروع بازی‌ها، نتیجه و دقیقه واقعی اینجا و در توست‌ها ظاهر می‌شود.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {liveMatches.map((m) => (
              <div
                key={m.externalId}
                className="flex items-center justify-between gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-[10px] text-muted-foreground">{m.leagueName}</p>
                  <p className="truncate text-xs font-bold">
                    {m.homeTeam} <span className="font-num text-emerald-300" dir="ltr">{faNum(m.homeScore, 0)} - {faNum(m.awayScore, 0)}</span> {m.awayTeam}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <span className="relative flex size-1.5" aria-hidden>
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500/60" />
                    <span className="relative inline-flex size-1.5 rounded-full bg-rose-500" />
                  </span>
                  <span className="font-num text-[11px] font-bold text-rose-300" dir="ltr">
                    {m.clock || `${faNum(m.minute, 0)}'`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* لاگ رویدادهای واقعی اخیر */}
        {events.length > 0 && (
          <div className="max-h-36 space-y-1.5 overflow-y-auto pr-1">
            {events.map((e) => (
              <div
                key={e.eventId}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-[10px]",
                  e.type.startsWith("GOAL") ? "border-emerald-500/25 bg-emerald-500/[0.07]" : "border-amber-500/25 bg-amber-500/[0.07]"
                )}
              >
                <span className="flex items-center gap-1.5 font-semibold">
                  <Activity className={cn("size-3", e.type.startsWith("GOAL") ? "text-emerald-400" : "text-amber-400")} />
                  {EVENT_FA[e.type] ?? e.type} — {e.homeTeam} × {e.awayTeam}
                </span>
                <span className="shrink-0 font-num text-muted-foreground" dir="ltr">
                  {e.minute}&prime; · {faNum(e.homeScore, 0)}-{faNum(e.awayScore, 0)}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
