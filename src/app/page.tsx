"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  Bot,
  Calculator,
  Database,
  FlaskConical,
  Gauge,
  Layers,
  LayoutDashboard,
  LineChart,
  Newspaper,
  Radio,
  Megaphone,
  Settings,
  ClipboardCheck,
  Sparkles,
  Swords,
  Target,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TickerBar } from "@/components/app/fx/ticker-bar";
import { DashboardTab } from "@/components/app/dashboard-tab";
import { EngineTab } from "@/components/app/engine-tab";
import { DebateTab } from "@/components/app/debate-tab";
import { RiskTab } from "@/components/app/risk-tab";
import { LiveTab } from "@/components/app/live-tab";
import { SettlementTab } from "@/components/app/settlement-tab";
import { ChannelDirectorTab } from "@/components/app/channel-director";
import { VipBotTab } from "@/components/app/vip-bot-tab";
import { CalibrationTab } from "@/components/app/calibration-tab";
import { BacktestTab } from "@/components/app/backtest-tab";
import { HeroPerformance } from "@/components/app/hero-performance";
import { RolloverLadder } from "@/components/app/autopilot/rollover-ladder";
import { SupervisorRadar } from "@/components/app/fx/supervisor-radar";
import { useQuantStore } from "@/lib/store";
import { useAutopilot } from "@/lib/use-autopilot";
import { AutopilotConfigModal } from "@/components/app/autopilot/config-modal";
import { AutopilotStatusBar } from "@/components/app/autopilot/status-bar";
import { FlashcardDeck } from "@/components/app/autopilot/flashcard-deck";
import { ProductionLines } from "@/components/app/production-lines";
import { DailyProgramBoard } from "@/components/app/daily-program-board";
import { PipelineRadar } from "@/components/app/autopilot/radar";
import { SmartCartDrawer } from "@/components/app/autopilot/cart-drawer";
import { LiveHedgeToasts } from "@/components/app/autopilot/live-toasts";
import { LiveSyncBadge, NewsRadar, NewsTickerStrip } from "@/components/app/live-telemetry";
import { syncLive } from "@/lib/live-client";
import type { DebateResultDTO } from "@/lib/types";
import { cn } from "@/lib/utils";

const PRO_TABS = [
  { value: "dashboard", label: "داشبورد", icon: LayoutDashboard },
  { value: "flashcards", label: "فلش‌کارت‌های تیپ آماده", icon: Sparkles },
  { value: "debate", label: "مناظره ایجنت‌ها", icon: Swords },
  { value: "risk", label: "پرتفوی مکمل", icon: Layers },
  { value: "live", label: "زنده و T-60", icon: Radio },
  { value: "settlement", label: "کارنامه و تسویه", icon: ClipboardCheck },
  { value: "channel", label: "📣 مدیر کانال و قیف VIP", icon: Megaphone },
  { value: "vipbot", label: "🤖 ربات اشتراک VIP", icon: Bot },
  { value: "news", label: "رادار اخبار زنده", icon: Newspaper },
  { value: "calibration", label: "کالیبراسیون", icon: Gauge },
  { value: "engine", label: "موتور احتمالات", icon: Calculator },
  { value: "backtest", label: "بک‌تست و CLV", icon: LineChart },
];

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("dashboard");
  const [configOpen, setConfigOpen] = useState(false);

  // ─── استور سراسری — تمام تب‌ها به همین وضعیت متصل‌اند ───
  const matches = useQuantStore((s) => s.matches);
  const activeMatchId = useQuantStore((s) => s.activeMatchId);
  const setMatches = useQuantStore((s) => s.setMatches);
  const setActiveMatchId = useQuantStore((s) => s.setActiveMatchId);
  const debates = useQuantStore((s) => s.debates);
  const setDebate = useQuantStore((s) => s.setDebate);
  const mode = useQuantStore((s) => s.config.mode);
  const patchConfig = useQuantStore((s) => s.patchConfig);

  // ─── خلبان خودکار — فقط یک‌بار در روت mount می‌شود ───
  const { rescanAll } = useAutopilot();

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
    // v4.0: به محض باز شدن سایت اتصال خودکار به سرورهای زنده — پس از ingest، فید تازه می‌شود
    void (async () => {
      const feed = await syncLive(false);
      if (feed && feed.mode === "LIVE") await loadMatches();
    })();
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
  const openFlashcardsFor = useCallback(
    (_matchId: string) => {
      if (mode === "PRO") setTab("flashcards");
      else window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [mode]
  );

  /** v8.0 — دسترسی ۱ کلیکی به جدول SHA-256 کارنامه */
  const openShaTable = useCallback(() => {
    if (mode === "PRO") {
      setTab("settlement");
    } else {
      document.getElementById("settlement-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [mode]);

  const analyzedCount = Object.keys(debates).length + matches.filter((m) => m.latestAnalysis).length;
  const isSimple = mode === "SIMPLE";

  return (
    <div className="flex min-h-screen flex-col">
      {/* ─── هدر v3.0 — سوییچ دو حالته + مودال تنظیمات ─── */}
      <header className="sticky top-0 z-40 border-b border-white/8 bg-[rgba(6,9,17,0.82)] backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center size-10 rounded-xl border border-emerald-500/30 bg-emerald-500/10 shadow-[0_0_18px_rgba(16,185,129,0.25)]">
              <Target className="size-5 text-emerald-400" />
              <span className="agent-live-dot absolute -top-0.5 -left-0.5 size-2.5 rounded-full bg-emerald-500" />
            </div>
            <div className="min-w-0">
              <h1 className="flex items-center gap-2 text-base font-bold leading-tight sm:text-lg">
                <span dir="ltr">NEOBET QUANT PRO</span>
                <Badge className="gap-1 border-amber-500/40 bg-amber-500/15 px-1.5 py-0 text-[9px] text-amber-300" variant="outline">
                  <Sparkles className="size-2.5" /> v21.0 1xBet Real-Market Calibration & Zero-Blind-Stats @AINEOBET
                </Badge>
              </h1>
              <p className="text-[11px] text-muted-foreground sm:text-xs">
                حسابداری صادقانه کارنامه (منبع واحد حقیقت) + تسویه درست میزبان/میهمان + حلقه کالیبراسیون خودکار دسته‌ها + مسیریاب غیرخطی ۵ رژیمی (🏦 بنکر · 🧩 کمبو · 🎯 خوشه نتیجه دقیق · ⚖️ زوج‌تیپ · 🔗 آکومولاتور) + بلک‌لیست لیگ‌های سمّی + ایجنت مدیر کانال عمومی/VIP · <span dir="ltr">@aineobet</span>
              </p>
            </div>
            {/* v8.0 — رادار چرخان مونت‌کارلو و سوپروایزر */}
            <SupervisorRadar className="hidden sm:inline-flex" />
          </div>

          <div className="flex items-center gap-2">
            {/* نشانگر زنده فید چند-API + دکمه همگام‌سازی */}
            <LiveSyncBadge />

            {/* v13.0-② — بج Rate-Limit فقط در نوار وضعیت (حذف تکرار از هدر) */}

            {/* سوییچ دو حالته: Smart Autopilot ↔ Pro Quant Terminal */}
            <div
              className="flex items-center gap-0.5 rounded-lg border border-white/10 bg-white/[0.03] p-0.5"
              role="tablist"
              aria-label="حالت رابط کاربری"
            >
              <Button
                size="sm"
                variant="ghost"
                role="tab"
                aria-selected={isSimple}
                className={cn("h-7 gap-1 px-2 text-[10px] sm:text-[11px]", isSimple && "bg-emerald-500/15 text-emerald-300")}
                onClick={() => patchConfig({ mode: "SIMPLE" })}
              >
                <Bot className="size-3.5" />
                <span className="hidden sm:inline">داشبورد سریع</span>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                role="tab"
                aria-selected={!isSimple}
                className={cn("h-7 gap-1 px-2 text-[10px] sm:text-[11px]", !isSimple && "bg-cyan-500/15 text-cyan-300")}
                onClick={() => patchConfig({ mode: "PRO" })}
              >
                <FlaskConical className="size-3.5" />
                <span className="hidden sm:inline">آزمایشگاه کوانت</span>
              </Button>
            </div>

            {/* دکمه مودال تنظیمات اتصال و خلبان خودکار */}
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 border-emerald-500/30 bg-emerald-500/5 text-[11px] text-emerald-300 hover:bg-emerald-500/15"
              onClick={() => setConfigOpen(true)}
              aria-label="اتصال API و خلبان خودکار ⚙️"
            >
              <Settings className="size-3.5" />
              <span className="hidden md:inline">اتصال API و خلبان خودکار</span>
              ⚙️
            </Button>

            {/* انتخابگر سراسری مسابقه — فقط در حالت پرو */}
            {!isSimple && (
              <Select
                value={activeMatchId ?? ""}
                onValueChange={setActiveMatchId}
              >
                <SelectTrigger
                  // v13.0-④ — عرض منو افزایش یافت تا «...بازی فعال» بریده نشود
                  className="w-[260px] max-w-[340px] min-w-[260px] gap-2 border-cyan-500/30 bg-cyan-500/5 text-xs sm:w-[340px]"
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
            )}
          </div>
        </div>
      </header>

      {/* ─── نوار وضعیت خلبان خودکار ─── */}
      <AutopilotStatusBar onOpenConfig={() => setConfigOpen(true)} />

      {/* ─── نوار تیکر زنده پول هوشمند ─── */}
      <TickerBar matches={matches} />

      {/* ─── محتوا ─── */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 pb-28">
        {isSimple ? (
          /* ═══ حالت ۱: داشبورد سریع و فلش‌کارت‌ها (Smart Autopilot) ═══ */
          <div className="space-y-4">
            <HeroPerformance onOpenSha={openShaTable} />
            {/* 🏭 v13.0 — ۳ خط تولید مجزا: تک‌بازی / میکس ۲/۳ تایی / تک‌تیرانداز */}
            <ProductionLines />
            <FlashcardDeck />
            {/* 🪜 v11.0 — نردبان سود مرکب ۳ پله‌ای (بالای داشبورد سریع) */}
            <RolloverLadder startBank={100} />
            {/* 📅 v21.0 — برنامه روزانه حرفه‌ای پخش (زمان‌بندی مشخص عمومی + خصوصی) */}
            <DailyProgramBoard />
            <NewsTickerStrip />
            <PipelineRadar onOpenCard={openFlashcardsFor} />
            <div id="settlement-section">
              <SettlementTab />
            </div>
          </div>
        ) : (
          /* ═══ حالت ۲: آزمایشگاه مهندسی کوانت (Pro Quant Terminal) ═══ */
          <Tabs value={tab} onValueChange={setTab} className="w-full">
            <TabsList className="mb-4 flex h-auto w-full flex-wrap justify-start gap-1 border border-white/8 bg-white/4">
              {PRO_TABS.map((t) => (
                <TabsTrigger
                  key={t.value}
                  value={t.value}
                  // v13.0-① — رفع بریدگی متن تب: whitespace-nowrap + flex-none (بدون overflow-hidden/truncate)
                  className="w-auto flex-none gap-1.5 whitespace-nowrap px-3 py-2 text-xs sm:text-sm data-[state=active]:border-emerald-500/40 data-[state=active]:bg-emerald-500/15 data-[state=active]:text-emerald-300"
                >
                  <t.icon className="size-4" />
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="dashboard">
              <div className="space-y-4">
                <HeroPerformance onOpenSha={openShaTable} />
                {/* 🏭 v13.0 — ۳ خط تولید مجزا */}
                <ProductionLines />
                {/* 📅 v21.0 — برنامه روزانه حرفه‌ای پخش */}
                <DailyProgramBoard compact />
                <DashboardTab
                loading={loading}
                analyzedCount={analyzedCount}
                onAnalyze={(matchId) => {
                  setActiveMatchId(matchId);
                  goToTab("debate");
                }}
                onRefresh={() => void rescanAll()}
                onGoToTab={goToTab}
                autopilotRadar={
                  <PipelineRadar
                    onOpenCard={(matchId) => {
                      setActiveMatchId(matchId);
                      goToTab("flashcards");
                    }}
                  />
                }
                autopilotDeck={
                  <FlashcardDeck
                    compact
                    title="فلش‌کارت‌های آماده بهره‌برداری"
                    defaultView="grid"
                  />
                }
                />
              </div>
            </TabsContent>

            <TabsContent value="flashcards">
              <FlashcardDeck />
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

            <TabsContent value="settlement">
              <SettlementTab />
            </TabsContent>

            <TabsContent value="channel">
              <ChannelDirectorTab />
            </TabsContent>

            <TabsContent value="vipbot">
              <VipBotTab />
            </TabsContent>

            <TabsContent value="news">
              <NewsRadar />
            </TabsContent>

            <TabsContent value="calibration">
              <CalibrationTab />
            </TabsContent>

            <TabsContent value="backtest">
              <BacktestTab />
            </TabsContent>
          </Tabs>
        )}
      </main>

      {/* ─── رابط‌های شناور سراسری ─── */}
      <SmartCartDrawer />
      <LiveHedgeToasts />
      <AutopilotConfigModal open={configOpen} onOpenChange={setConfigOpen} />

      {/* ─── فوتر چسبیده ─── */}
      <footer className="mt-auto border-t border-white/8 bg-[rgba(6,9,17,0.82)] backdrop-blur-md pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-3 text-xs text-muted-foreground sm:flex-row">
          <p>
            <b className="text-amber-300" dir="ltr">NEOBET QUANT PRO • @AINEOBET</b> — v21.0 1xBet Real-Market Calibration & Zero-Blind-Stats Edition · حسابداری صادقانه کارنامه (منبع واحد حقیقت — بدون حذف رژیم زیان‌ده، باخت کامل −۱۰۰u/−۵۰u واقعی) + تسویه درست میزبان/میهمان (فیکس Tenerife) + حذف ردیف‌های ساختگی ACC و ضریب تکراری ۳.۹۵/۱.۸۲ + حلقه کالیبراسیون خودکار دسته‌ها (تعلیق خودکار ROI منفی) + بلک‌لیست قطعی دوستانه‌ها + مسیریاب غیرخطی ۵ رژیم + ضرایب ارزش‌محور یکتای هر بازی + سیستم دو‌سطحی تاج (👑 طلایی ۱۰۰u · 🥈 نقره‌ای ۵۰u Half-Kelly) + قیف کانال عمومی↔VIP (@aineobet) + پنجره T-60m Lineup Verified + تسویه خودکار ESPN + هسته موتور مستقل از مرورگر (دیمن همیشه‌گرم)
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
