"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  Calculator,
  Database,
  Gauge,
  Layers,
  LineChart,
  Radio,
  Sparkles,
  Swords,
  Target,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TickerBar } from "@/components/app/fx/ticker-bar";
import { DashboardTab } from "@/components/app/dashboard-tab";
import { EngineTab } from "@/components/app/engine-tab";
import { DebateTab } from "@/components/app/debate-tab";
import { RiskTab } from "@/components/app/risk-tab";
import { LiveTab } from "@/components/app/live-tab";
import { CalibrationTab } from "@/components/app/calibration-tab";
import { BacktestTab } from "@/components/app/backtest-tab";
import { useQuantStore } from "@/lib/store";
import type { DebateResultDTO } from "@/lib/types";

const TABS = [
  { value: "dashboard", label: "داشبورد", icon: Activity },
  { value: "debate", label: "مناظره ایجنت‌ها", icon: Swords },
  { value: "risk", label: "پرتفوی مکمل", icon: Layers },
  { value: "live", label: "زنده و T-60", icon: Radio },
  { value: "calibration", label: "کالیبراسیون", icon: Gauge },
  { value: "engine", label: "موتور احتمالات", icon: Calculator },
  { value: "backtest", label: "بک‌تست و CLV", icon: LineChart },
];

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("dashboard");

  // ─── استور سراسری — تمام تب‌ها به همین وضعیت متصل‌اند ───
  const matches = useQuantStore((s) => s.matches);
  const activeMatchId = useQuantStore((s) => s.activeMatchId);
  const setMatches = useQuantStore((s) => s.setMatches);
  const setActiveMatchId = useQuantStore((s) => s.setActiveMatchId);
  const debates = useQuantStore((s) => s.debates);
  const setDebate = useQuantStore((s) => s.setDebate);

  const activeMatch = matches.find((m) => m.id === activeMatchId) ?? null;

  const loadMatches = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/matches", { cache: "no-store" });
      const data = await res.json();
      if (data.success) setMatches(data.matches);
    } catch {
      // خطا در بارگذاری — نمایش در داشبورد
    } finally {
      setLoading(false);
    }
  }, [setMatches]);

  useEffect(() => {
    loadMatches();
  }, [loadMatches]);

  // ─── Spotlight Cursor Border سراسری: ردیابی مختصات ماوس با CSS Variables ───
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.(
        ".glass, [data-slot='card']"
      ) as HTMLElement | null;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      el.style.setProperty("--mouse-x", `${e.clientX - rect.left}px`);
      el.style.setProperty("--mouse-y", `${e.clientY - rect.top}px`);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  const handleDebated = useCallback(
    (result: DebateResultDTO) => {
      setDebate(result.match.id, result);
      setMatches(
        matches.map((m) =>
          m.id === result.match.id
            ? {
                ...m,
                status: "ANALYZED",
                latestAnalysis: {
                  id: result.final.analysisId,
                  bestMarket: "مناظره چندایجنتی",
                  bestEv: 0,
                  confidence: result.final.confidence,
                  source: result.source,
                },
              }
            : m
        )
      );
    },
    [setDebate, setMatches, matches]
  );

  const goToTab = useCallback((t: string) => setTab(t), []);

  const analyzedCount = Object.keys(debates).length + matches.filter((m) => m.latestAnalysis).length;

  return (
    <div className="flex min-h-screen flex-col">
      {/* ─── هدر با انتخابگر سراسری مسابقه ─── */}
      <header className="sticky top-0 z-40 border-b border-white/8 bg-[rgba(6,9,17,0.82)] backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center size-10 rounded-xl border border-emerald-500/30 bg-emerald-500/10 shadow-[0_0_18px_rgba(16,185,129,0.25)]">
              <Target className="size-5 text-emerald-400" />
              <span className="agent-live-dot absolute -top-0.5 -left-0.5 size-2.5 rounded-full bg-emerald-500" />
            </div>
            <div>
              <h1 className="flex items-center gap-2 text-base font-bold leading-tight sm:text-lg">
                فوتبال‌کوانت
                <Badge className="gap-1 border-violet-500/40 bg-violet-500/15 px-1.5 py-0 text-[9px] text-violet-300" variant="outline">
                  <Sparkles className="size-2.5" /> v2.0 Institutional
                </Badge>
              </h1>
              <p className="text-[11px] text-muted-foreground sm:text-xs">
                موتور کمّی نهادی پیش‌بینی و مدیریت سرمایه فوتبال
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* انتخابگر سراسری مسابقه — تغییر آن کل زنجیره ۷ تب را عوض می‌کند */}
            <Select value={activeMatchId ?? ""} onValueChange={setActiveMatchId}>
              <SelectTrigger
                className="w-[190px] gap-2 border-cyan-500/30 bg-cyan-500/5 text-xs sm:w-[300px]"
                aria-label="انتخابگر سراسری مسابقه فعال"
              >
                <Activity className="size-3.5 shrink-0 text-cyan-400" />
                <SelectValue placeholder="بازی فعال..." />
              </SelectTrigger>
              <SelectContent className="border-white/10 bg-popover">
                {matches.map((m) => (
                  <SelectItem key={m.id} value={m.id} className="text-xs">
                    {m.homeTeam} — {m.awayTeam}
                    <span className="mr-1 text-[10px] text-muted-foreground">({m.league})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Badge variant="outline" className="hidden items-center gap-1.5 border-emerald-500/40 text-emerald-400 sm:inline-flex">
              <span className="agent-live-dot size-1.5 rounded-full bg-emerald-500" />
              ۶ ماژول نهادی فعال
            </Badge>
          </div>
        </div>
      </header>

      {/* ─── نوار تیکر زنده پول هوشمند ─── */}
      <TickerBar matches={matches} />

      {/* ─── محتوا ─── */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="mb-4 flex h-auto w-full flex-wrap justify-start gap-1 border border-white/8 bg-white/4">
            {TABS.map((t) => (
              <TabsTrigger
                key={t.value}
                value={t.value}
                className="gap-1.5 px-3 py-2 text-xs sm:text-sm data-[state=active]:border-emerald-500/40 data-[state=active]:bg-emerald-500/15 data-[state=active]:text-emerald-300"
              >
                <t.icon className="size-4" />
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="dashboard">
            <DashboardTab
              loading={loading}
              analyzedCount={analyzedCount}
              onAnalyze={(matchId) => {
                setActiveMatchId(matchId);
                goToTab("debate");
              }}
              onRefresh={loadMatches}
              onGoToTab={goToTab}
            />
          </TabsContent>

          <TabsContent value="debate">
            <DebateTab onDebated={handleDebated} onGoToTab={goToTab} />
          </TabsContent>

          <TabsContent value="engine">
            <EngineTab onGoToTab={goToTab} />
          </TabsContent>

          <TabsContent value="risk">
            <RiskTab onGoToTab={goToTab} />
          </TabsContent>

          <TabsContent value="live">
            <LiveTab onGoToTab={goToTab} />
          </TabsContent>

          <TabsContent value="calibration">
            <CalibrationTab />
          </TabsContent>

          <TabsContent value="backtest">
            <BacktestTab />
          </TabsContent>
        </Tabs>
      </main>

      {/* ─── فوتر چسبیده ─── */}
      <footer className="mt-auto border-t border-white/8 bg-[rgba(6,9,17,0.82)] backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-3 text-xs text-muted-foreground sm:flex-row">
          <p>
            فوتبال‌کوانت ۲.۰ — خط لوله نهادی: داده‌کاوی ← دیکسون-کولز + شین ← مناظره گاو/خرس ← قاضی کمّی ← کلِی همزمان ← پوشش زنده
          </p>
          <p className="flex items-center gap-1.5">
            <Database className="size-3.5" />
            ابزار آموزشی تحلیل کمّی — ورود سرمایه واقعی بدون بک‌تست کافی توصیه نمی‌شود
          </p>
        </div>
      </footer>
    </div>
  );
}
