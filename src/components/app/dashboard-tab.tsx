"use client";

import {
  ArrowLeft,
  BrainCircuit,
  Calculator,
  Database,
  Globe,
  LineChart,
  Newspaper,
  Radar,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ReactNode } from "react";
import { faNum, faPctSigned } from "@/lib/format";
import { TacticalPitch } from "@/components/app/fx/tactical-pitch";
import { PulseFlow, type FlowNode } from "@/components/app/fx/pulse-flow";
import { AnimNum } from "@/components/app/fx/anim-num";
import { useQuantStore } from "@/lib/store";

const PIPELINE: FlowNode[] = [
  { icon: Database, label: "لایه ۱ — داده‌کاوی", color: "text-sky-400", glow: "#0ea5e9" },
  { icon: Calculator, label: "لایه ۲ — موتور کمّی", color: "text-cyan-300", glow: "#06b6d4" },
  { icon: BrainCircuit, label: "لایه ۳ — مناظره گاو/خرس", color: "text-violet-300", glow: "#8b5cf6" },
  { icon: ShieldCheck, label: "لایه ۴ — مدیریت ریسک", color: "text-amber-300", glow: "#f59e0b" },
  { icon: LineChart, label: "لایه ۵ — بک‌تست CLV", color: "text-rose-300", glow: "#f43f5e" },
];

const PIPELINE_DETAILS = [
  {
    desc: "اسکرپرهای FBref / Understat / SofaScore + RSS اخبار + ردیاب ضرایب زنده",
    sources: ["آمار پیشرفته xG / xGOT", "اخبار و مصدومیت‌ها", "Odds Tracker + Webhook"],
  },
  {
    desc: "دیکسون-کولز + پواسون دو متغیره + شین De-Vig با وزن‌دهی زمانی",
    sources: ["ماتریس نمره کامل", "خط مرجع Sharp پیناکل", "تعدیل شوک T-60"],
  },
  {
    desc: "مناظره adversarial ایجنت گاو و ایجنت خرس با قضاوت کمّی ارشد",
    sources: ["Tactical Matchup", "خروجی JSON ساختاریافته", "کشف ارزش +EV"],
  },
  {
    desc: "مونت‌کارلو کاپولا + کلِی همزمان + کنترل تله باخت همزمان",
    sources: ["سود برابر / بیمه / تهاجمی", "پایه مشترک + متغیر دوگانه", "Middle Trap Guard"],
  },
  {
    desc: "تست روی ۵۰۰+ بازی؛ سه استراتژی سرمایه و مقایسه Drawdown",
    sources: ["Fixed / Kelly / Dutching", "میانگین CLV", "منحنی رشد سرمایه"],
  },
];

interface Props {
  loading: boolean;
  analyzedCount: number;
  onAnalyze: (matchId: string) => void;
  onRefresh: () => void;
  onGoToTab: (tab: string) => void;
  /** رادار خط لوله اتوماتیک v3.0 */
  autopilotRadar?: ReactNode;
  /** دک فشرده فلش‌کارت‌های آماده v3.0 */
  autopilotDeck?: ReactNode;
}

export function DashboardTab({ loading, analyzedCount, onAnalyze, onRefresh, onGoToTab, autopilotRadar, autopilotDeck }: Props) {
  // داده‌ها از استور سراسری — بدون prop drilling
  const matches = useQuantStore((s) => s.matches);
  const activeMatchId = useQuantStore((s) => s.activeMatchId);
  const setActiveMatchId = useQuantStore((s) => s.setActiveMatchId);
  const activeMatch = matches.find((m) => m.id === activeMatchId) ?? null;

  const bestEvMatch = matches
    .filter((m) => m.latestAnalysis)
    .sort((a, b) => (b.latestAnalysis?.bestEv ?? -1) - (a.latestAnalysis?.bestEv ?? -1))[0];

  return (
    <div className="space-y-6">
      {/* آمار کلی */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="glass p-4">
          <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
            <Globe className="size-3.5" /> بازی‌های ردیابی‌شده
          </div>
          <AnimNum value={loading ? 0 : matches.length} decimals={0} className="text-2xl font-bold" />
          <p className="mt-0.5 text-[11px] text-muted-foreground">از ۵ لیگ بزرگ اروپا</p>
        </Card>
        <Card className="glass p-4">
          <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
            <BrainCircuit className="size-3.5" /> تحلیل‌های ایجنت
          </div>
          <AnimNum value={loading ? 0 : analyzedCount} decimals={0} className="text-2xl font-bold" />
          <p className="mt-0.5 text-[11px] text-muted-foreground">توزیع احتمالاتی + +EV</p>
        </Card>
        <Card className="glass p-4">
          <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
            <TrendingUp className="size-3.5" /> بهترین ارزش فعلی
          </div>
          <p className="text-2xl font-bold text-emerald-400">
            {bestEvMatch?.latestAnalysis ? faPctSigned(bestEvMatch.latestAnalysis.bestEv) : "—"}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {bestEvMatch?.latestAnalysis ? bestEvMatch.latestAnalysis.bestMarket : "هنوز تحلیلی اجرا نشده"}
          </p>
        </Card>
        <Card className="glass p-4">
          <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
            <Radar className="size-3.5" /> بازی فعال (زنجیره ۷ تب)
          </div>
          <p className="truncate text-sm font-bold text-cyan-300">
            {activeMatch ? `${activeMatch.homeTeam} — ${activeMatch.awayTeam}` : "—"}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">از هدر یا کلیک روی جدول تغییر دهید</p>
        </Card>
      </div>

      {/* دک فشرده فلش‌کارت‌های آماده (v3.0) */}
      {autopilotDeck}

      {/* رادار اسکنر خودکار زنده (v3.0) */}
      {autopilotRadar}

      {/* پایپ‌لاین ۵ لایه با پالس جریان داده */}
      <Card className="glass">
        <CardHeader className="pb-0">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm text-muted-foreground">
              معماری چندایجنتی — جریان زنده داده بین ۵ لایه
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={onRefresh} className="gap-1.5 text-xs">
              <RefreshCw className="size-3.5" /> بروزرسانی
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          <PulseFlow nodes={PIPELINE} />
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
            {PIPELINE_DETAILS.map((p, i) => (
              <div key={i} className="rounded-lg border border-white/6 bg-white/[0.03] p-2.5">
                <p className="text-[10px] leading-relaxed text-muted-foreground">{p.desc}</p>
                <ul className="mt-1.5 space-y-0.5">
                  {p.sources.map((s) => (
                    <li key={s} className="flex items-center gap-1 text-[10px] text-muted-foreground/80">
                      <span className={`size-1 rounded-full ${PIPELINE[i].color.replace("text-", "bg-")}`} />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* فید بازی‌ها */}
        <Card className="glass lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Radar className="size-4 text-emerald-400" />
              فید زنده بازی‌ها (Data Ingestion)
            </CardTitle>
            <CardDescription className="text-xs">
              کلیک روی هر بازی، آن را به «بازی فعال» کل زنجیره ۷ تب تبدیل می‌کند
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full bg-white/5" />
                ))}
              </div>
            ) : (
              <ScrollArea className="max-h-96 -mx-2 px-2">
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/8 hover:bg-transparent">
                      <TableHead className="text-xs">بازی</TableHead>
                      <TableHead className="text-xs">۱ / × / ۲</TableHead>
                      <TableHead className="text-xs">بالای ۲.۵</TableHead>
                      <TableHead className="text-xs">وضعیت</TableHead>
                      <TableHead className="text-xs"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {matches.map((m) => (
                      <TableRow
                        key={m.id}
                        onClick={() => setActiveMatchId(m.id)}
                        className={`cursor-pointer border-white/6 transition-colors ${
                          m.id === activeMatchId ? "bg-cyan-500/10" : "hover:bg-white/4"
                        }`}
                        aria-selected={m.id === activeMatchId}
                      >
                        <TableCell>
                          <p className="flex items-center gap-1.5 text-xs font-medium">
                            {m.id === activeMatchId && <span className="agent-live-dot size-1.5 rounded-full bg-cyan-400" />}
                            {m.homeTeam} — {m.awayTeam}
                          </p>
                          <p className="text-[10px] text-muted-foreground">{m.league}</p>
                        </TableCell>
                        <TableCell className="font-num text-xs" dir="ltr">
                          {m.oddsHome.toFixed(2)} / {m.oddsDraw.toFixed(2)} / {m.oddsAway.toFixed(2)}
                        </TableCell>
                        <TableCell className="font-num text-xs" dir="ltr">{m.oddsOver25.toFixed(2)}</TableCell>
                        <TableCell>
                          {m.latestAnalysis ? (
                            <Badge className="border-emerald-500/30 bg-emerald-500/15 text-[10px] text-emerald-400" variant="outline">
                              تحلیل‌شده
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">در انتظار</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 gap-1 text-[11px]"
                            onClick={(e) => {
                              e.stopPropagation();
                              onAnalyze(m.id);
                            }}
                          >
                            تحلیل <ArrowLeft className="size-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* زمین سه‌بعدی بازی فعال */}
        <Card className="glass">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Globe className="size-4 text-emerald-400" />
              نمای تاکتیکی سه‌بعدی — بازی فعال
            </CardTitle>
            <CardDescription className="text-xs">
              Field Tilt، بردارهای xT و چیدمان کلیدی — با حرکت ماوس بچرخانید
            </CardDescription>
          </CardHeader>
          <CardContent>
            {activeMatch ? (
              <>
                <TacticalPitch
                  homeTeam={activeMatch.homeTeam}
                  awayTeam={activeMatch.awayTeam}
                  homeFieldTilt={activeMatch.homeFieldTilt}
                  awayFieldTilt={activeMatch.awayFieldTilt}
                  homeXg={activeMatch.homeXg}
                  awayXg={activeMatch.awayXg}
                />
                <div className="mt-2 flex items-center justify-between rounded-lg border border-white/8 bg-white/[0.03] p-2 text-[11px]">
                  <span className="text-muted-foreground">فرم: {activeMatch.homeForm} / {activeMatch.awayForm}</span>
                  <button
                    className="flex items-center gap-1 text-cyan-300 hover:underline"
                    onClick={() => onGoToTab("engine")}
                  >
                    تحلیل در موتور کمّی <ArrowLeft className="size-3" />
                  </button>
                </div>
              </>
            ) : (
              <div className="py-14 text-center text-xs text-muted-foreground">بازی فعال انتخاب نشده</div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* فرمول طلایی داچینگ */}
        <Card className="glass">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <ShieldCheck className="size-4 text-amber-300" />
              فرمول طلایی تیپ‌های مکمل
            </CardTitle>
            <CardDescription className="text-xs">شرط پوشش تضمینی: مجموع معکوس ضرایب کمتر از ۱</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="font-num rounded-lg bg-white/5 p-3 text-center text-cyan-200" dir="ltr">
              1/2.0 + 1/3.0 = 0.50 + 0.333 = 0.833 &lt; 1
            </div>
            <p className="leading-relaxed text-muted-foreground">
              با ضرایب <b>۲.۰</b> و <b>۳.۰</b> که سناریوهای مکمل را پوشش دهند، تقسیم دقیق سرمایه در هر دو حالت{" "}
              <b className="text-emerald-400">۲۰٪ سود خالص</b> می‌دهد.
            </p>
            <div className="rounded-lg border border-white/10 p-3">
              <p className="mb-2 font-medium">تخصیص (بودجه ۱۰۰ واحد):</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-[10px] text-muted-foreground">تیپ ۲.۰</p>
                  <p className="font-num font-bold" dir="ltr">60</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">تیپ ۳.۰</p>
                  <p className="font-num font-bold" dir="ltr">40</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">سود هر حالت</p>
                  <p className="font-num font-bold text-emerald-400" dir="ltr">+20</p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3">
              <p className="mb-1 font-medium text-rose-400">⚠ تله باخت همزمان</p>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                برد A (۱.۴) + برد B (۲.۸) مکمل نیستند؛ مساوی شدن هر دو تیپ را می‌سوزاند. راه‌حل: پایه مشترک (1X) +
                متغیر دوگانه بالای/زیر ۲.۵.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* منابع داده */}
        <Card className="glass lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">منابع داده و اتصال زنده</CardTitle>
            <CardDescription className="text-xs">
              وب‌هوک ضرایب فعال است: <span className="font-num" dir="ltr">POST /api/webhook/odds</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5"><Database className="size-3.5" /> FBref / Understat / SofaScore — xG، xGOT، PPDA، Field Tilt</span>
            <span className="flex items-center gap-1.5"><Newspaper className="size-3.5" /> RSS و APIهای خبری — مصدومیت، محرومیت، آب‌وهوا</span>
            <span className="flex items-center gap-1.5"><TrendingUp className="size-3.5" /> Odds Tracker — Opening/Closing و Sharp Money</span>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
