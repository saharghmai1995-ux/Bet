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
import { faNum, faOdds, faPctSigned } from "@/lib/format";
import type { MatchDTO } from "@/lib/types";

const PIPELINE = [
  {
    icon: Database,
    layer: "لایه ۱",
    title: "پایپ‌لاین گردآوری داده‌ها",
    desc: "اسکرپرهای FBref / Understat / SofaScore + RSS اخبار + ردیاب ضرایب زنده",
    color: "text-sky-600 dark:text-sky-400",
    bg: "bg-sky-600/10 border-sky-600/25",
    sources: ["آمار پیشرفته xG / xGOT", "اخبار و مصدومیت‌ها", "Odds Tracker"],
  },
  {
    icon: Calculator,
    layer: "لایه ۲",
    title: "موتور کمّی",
    desc: "دیکسون-کولز + پواسون دو متغیره + الو پویا با وزن‌دهی زمانی بازی‌های اخیر",
    color: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-600/10 border-violet-600/25",
    sources: ["ماتریس نمره کامل", "توزیع وزنی exp(−ξt)", "تعدیل غیبت ستاره‌ها"],
  },
  {
    icon: BrainCircuit,
    layer: "لایه ۳",
    title: "ایجنت تحلیلگر ارشد",
    desc: "تلفیق آمار کمّی با تحلیل کیفی تاکتیکی → سناریوهای احتمالاتی +EV",
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-600/10 border-emerald-600/25",
    sources: ["Tactical Matchup", "خروجی JSON ساختاریافته", "کشف ارزش +EV"],
  },
  {
    icon: ShieldCheck,
    layer: "لایه ۴",
    title: "ایجنت مدیریت ریسک",
    desc: "ساخت تیپ‌های مکمل (داچینگ) با تخصیص بهینه سرمایه و کنترل تله باخت همزمان",
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-600/10 border-amber-600/25",
    sources: ["سود برابر / بیمه / تهاجمی", "پایه مشترک + متغیر دوگانه", "Middle Trap Guard"],
  },
  {
    icon: LineChart,
    layer: "لایه ۵",
    title: "بک‌تستینگ و CLV",
    desc: "تست روی ۵۰۰+ بازی تاریخی؛ معیار موفقیت: مثبت بودن Closing Line Value",
    color: "text-rose-600 dark:text-rose-400",
    bg: "bg-rose-600/10 border-rose-600/25",
    sources: ["ROI و نرخ برد", "میانگین CLV", "منحنی رشد سرمایه"],
  },
];

interface Props {
  matches: MatchDTO[];
  loading: boolean;
  analyzedCount: number;
  onAnalyze: (matchId: string) => void;
  onRefresh: () => void;
}

export function DashboardTab({ matches, loading, analyzedCount, onAnalyze, onRefresh }: Props) {
  const bestEvMatch = matches
    .filter((m) => m.latestAnalysis)
    .sort((a, b) => (b.latestAnalysis?.bestEv ?? -1) - (a.latestAnalysis?.bestEv ?? -1))[0];

  return (
    <div className="space-y-6">
      {/* آمار کلی */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <Globe className="size-3.5" /> بازی‌های ردیابی‌شده
          </div>
          <p className="text-2xl font-bold">{loading ? "—" : faNum(matches.length, 0)}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">از ۵ لیگ بزرگ اروپا</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <BrainCircuit className="size-3.5" /> تحلیل‌های ایجنت
          </div>
          <p className="text-2xl font-bold">{loading ? "—" : faNum(analyzedCount, 0)}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">توزیع احتمالاتی + +EV</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <TrendingUp className="size-3.5" /> بهترین ارزش فعلی
          </div>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {bestEvMatch?.latestAnalysis ? faPctSigned(bestEvMatch.latestAnalysis.bestEv) : "—"}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
            {bestEvMatch?.latestAnalysis ? bestEvMatch.latestAnalysis.bestMarket : "هنوز تحلیلی اجرا نشده"}
          </p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
            <Radar className="size-3.5" /> حاشیه تضمینی داچینگ
          </div>
          <p className="text-2xl font-bold">{faPctSigned(0.2)}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">با ضرایب ۲.۰ و ۳.۰ مکمل</p>
        </Card>
      </div>

      {/* پایپ‌لاین ۵ لایه */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted-foreground">معماری چندایجنتی — ۵ لایه اصلی</h2>
          <Button variant="ghost" size="sm" onClick={onRefresh} className="gap-1.5 text-xs">
            <RefreshCw className="size-3.5" /> بروزرسانی
          </Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
          {PIPELINE.map((p, i) => (
            <Card key={p.layer} className={`${p.bg} relative overflow-hidden`}>
              <CardHeader className="p-4 pb-2">
                <div className="flex items-center justify-between">
                  <p.icon className={`size-5 ${p.color}`} />
                  <Badge variant="secondary" className="text-[10px]">
                    {p.layer}
                  </Badge>
                </div>
                <CardTitle className="text-sm mt-2">{p.title}</CardTitle>
                <CardDescription className="text-[11px] leading-relaxed">{p.desc}</CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <Separator className="mb-2 opacity-50" />
                <ul className="space-y-1">
                  {p.sources.map((s) => (
                    <li key={s} className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                      <span className={`size-1 rounded-full ${p.color.replace("text-", "bg-")}`} />
                      {s}
                    </li>
                  ))}
                </ul>
                {i < PIPELINE.length - 1 && (
                  <ArrowLeft className="hidden xl:block absolute top-1/2 -left-3.5 size-4 text-muted-foreground/50 -translate-y-1/2 z-10" />
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* فید بازی‌ها */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Radar className="size-4 text-emerald-600 dark:text-emerald-400" />
              فید زنده بازی‌ها (Data Ingestion)
            </CardTitle>
            <CardDescription className="text-xs">
              ضرایب از موتور کمّی با حاشیه ۵٪ سایت شبیه‌سازی شده‌اند — برای تحلیل روی «ایجنت تحلیلگر» کلیک کنید
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (
              <ScrollArea className="max-h-96 -mx-2 px-2">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">بازی</TableHead>
                      <TableHead className="text-xs">۱ / × / ۲</TableHead>
                      <TableHead className="text-xs">بالای ۲.۵</TableHead>
                      <TableHead className="text-xs">وضعیت</TableHead>
                      <TableHead className="text-xs"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {matches.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell>
                          <p className="text-xs font-medium">{m.homeTeam} — {m.awayTeam}</p>
                          <p className="text-[10px] text-muted-foreground">{m.league}</p>
                        </TableCell>
                        <TableCell className="tabular-nums text-xs">
                          {faOdds(m.oddsHome)} / {faOdds(m.oddsDraw)} / {faOdds(m.oddsAway)}
                        </TableCell>
                        <TableCell className="tabular-nums text-xs">{faOdds(m.oddsOver25)}</TableCell>
                        <TableCell>
                          {m.latestAnalysis ? (
                            <Badge className="text-[10px] bg-emerald-600/15 text-emerald-600 dark:text-emerald-400 border-emerald-600/30" variant="outline">
                              تحلیل‌شده
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">در انتظار</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button size="sm" variant="ghost" className="h-7 text-[11px] gap-1" onClick={() => onAnalyze(m.id)}>
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

        {/* فرمول طلایی داچینگ */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <ShieldCheck className="size-4 text-amber-600 dark:text-amber-400" />
              فرمول طلایی تیپ‌های مکمل
            </CardTitle>
            <CardDescription className="text-xs">
              شرط پوشش تضمینی: مجموع معکوس ضرایب کمتر از ۱
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="rounded-lg bg-muted/60 p-3 text-center font-medium" dir="ltr">
              1/2.0 + 1/3.0 = 0.50 + 0.333 = 0.833 &lt; 1
            </div>
            <p className="leading-relaxed text-muted-foreground">
              با ضرایب <b>۲.۰</b> و <b>۳.۰</b> که سناریوهای مکمل را پوشش دهند، تقسیم دقیق سرمایه در هر دو حالت{" "}
              <b className="text-emerald-600 dark:text-emerald-400">۲۰٪ سود خالص</b> می‌دهد.
            </p>
            <div className="rounded-lg border border-border p-3 space-y-2">
              <p className="font-medium">تخصیص (بودجه ۱۰۰ واحد):</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-[10px] text-muted-foreground">تیپ ۲.۰</p>
                  <p className="font-bold">{faNum(60, 0)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">تیپ ۳.۰</p>
                  <p className="font-bold">{faNum(40, 0)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">سود هر حالت</p>
                  <p className="font-bold text-emerald-600 dark:text-emerald-400">+{faNum(20, 0)}</p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-rose-600/30 bg-rose-600/5 p-3">
              <p className="font-medium text-rose-600 dark:text-rose-400 mb-1">⚠ تله باخت همزمان</p>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                برد A (۱.۴) + برد B (۲.۸) مکمل نیستند؛ مساوی شدن هر دو تیپ را می‌سوزاند.
                راه‌حل: پایه مشترک (1X) + متغیر دوگانه بالای/زیر ۲.۵.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* منابع داده */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5"><Database className="size-3.5" /> FBref / Understat / SofaScore — آمار xG، xGOT، PPDA، Field Tilt</span>
          <span className="flex items-center gap-1.5"><Newspaper className="size-3.5" /> RSS و APIهای خبری — مصدومیت، محرومیت، سرمربی، آب‌وهوا</span>
          <span className="flex items-center gap-1.5"><TrendingUp className="size-3.5" /> Odds Tracker — Opening/Closing Odds و Sharp Money</span>
        </CardContent>
      </Card>
    </div>
  );
}
