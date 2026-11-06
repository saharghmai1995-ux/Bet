"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  BrainCircuit,
  Calculator,
  Database,
  LineChart,
  ShieldCheck,
  Target,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { DashboardTab } from "@/components/app/dashboard-tab";
import { EngineTab } from "@/components/app/engine-tab";
import { AnalystTab } from "@/components/app/analyst-tab";
import { RiskTab } from "@/components/app/risk-tab";
import { BacktestTab } from "@/components/app/backtest-tab";
import type { AnalysisResultDTO, MatchDTO } from "@/lib/types";

const TABS = [
  { value: "dashboard", label: "داشبورد", icon: Activity },
  { value: "engine", label: "موتور احتمالات", icon: Calculator },
  { value: "analyst", label: "ایجنت تحلیلگر", icon: BrainCircuit },
  { value: "risk", label: "مدیریت ریسک و داچینگ", icon: ShieldCheck },
  { value: "backtest", label: "بک‌تستینگ و CLV", icon: LineChart },
];

export default function Home() {
  const [matches, setMatches] = useState<MatchDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("dashboard");
  const [analyses, setAnalyses] = useState<Record<string, AnalysisResultDTO>>({});
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);

  const loadMatches = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/matches", { cache: "no-store" });
      const data = await res.json();
      if (data.success) {
        setMatches(data.matches);
        setSelectedMatchId((prev) => prev ?? data.matches[0]?.id ?? null);
      }
    } catch {
      // خطا در بارگذاری — نمایش در داشبورد
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMatches();
  }, [loadMatches]);

  const handleAnalyzed = useCallback((result: AnalysisResultDTO) => {
    setAnalyses((prev) => ({ ...prev, [result.match.id]: result }));
    setMatches((prev) =>
      prev.map((m) =>
        m.id === result.match.id
          ? {
              ...m,
              status: "ANALYZED",
              latestAnalysis: {
                id: result.analysis.id,
                bestMarket: result.analysis.bestMarket,
                bestEv: result.analysis.bestEv,
                confidence: result.analysis.confidence,
                source: result.analysis.source ?? "LLM",
              },
            }
          : m
      )
    );
  }, []);

  const goToAnalyst = useCallback((matchId: string) => {
    setSelectedMatchId(matchId);
    setTab("analyst");
  }, []);

  const analyzedCount = Object.keys(analyses).length + matches.filter((m) => m.latestAnalysis).length;

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-background via-background to-emerald-950/5 dark:to-emerald-950/15">
      {/* ─── هدر ─── */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center size-10 rounded-xl bg-emerald-600/15 border border-emerald-600/30">
              <Target className="size-5 text-emerald-600 dark:text-emerald-400" />
              <span className="absolute -top-0.5 -left-0.5 size-2.5 rounded-full bg-emerald-500 agent-live-dot" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold leading-tight">فوتبال‌کوانت</h1>
              <p className="text-[11px] sm:text-xs text-muted-foreground">
                سیستم چندایجنتی پیش‌بینی و مدیریت سرمایه فوتبال
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="outline" className="hidden sm:inline-flex gap-1.5 items-center border-emerald-600/40 text-emerald-600 dark:text-emerald-400">
              <span className="size-1.5 rounded-full bg-emerald-500 agent-live-dot" />
              ۴ ایجنت فعال
            </Badge>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* ─── محتوا ─── */}
      <main className="flex-1 mx-auto w-full max-w-7xl px-4 py-6">
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="w-full h-auto flex-wrap justify-start gap-1 mb-4">
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="gap-1.5 px-3 py-2 text-xs sm:text-sm">
                <t.icon className="size-4" />
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="dashboard">
            <DashboardTab
              matches={matches}
              loading={loading}
              analyzedCount={analyzedCount}
              onAnalyze={goToAnalyst}
              onRefresh={loadMatches}
            />
          </TabsContent>

          <TabsContent value="engine">
            <EngineTab />
          </TabsContent>

          <TabsContent value="analyst">
            <AnalystTab
              matches={matches}
              selectedMatchId={selectedMatchId}
              onSelectMatch={setSelectedMatchId}
              analyses={analyses}
              onAnalyzed={handleAnalyzed}
            />
          </TabsContent>

          <TabsContent value="risk">
            <RiskTab matches={matches} analyses={analyses} onGoToAnalyst={goToAnalyst} />
          </TabsContent>

          <TabsContent value="backtest">
            <BacktestTab />
          </TabsContent>
        </Tabs>
      </main>

      {/* ─── فوتر چسبیده ─── */}
      <footer className="mt-auto border-t border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
          <p>
            فوتبال‌کوانت — معماری چندایجنتی: داده‌کاوی ← موتور کمّی ← تحلیلگر ارشد ← مدیریت ریسک ← بک‌تست CLV
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
