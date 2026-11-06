"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BadgeCheck, FlaskConical, Gauge, Loader2, Play, TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { faNum, faPct, faPctSigned } from "@/lib/format";
import type { BacktestResultDTO } from "@/lib/types";

const VERDICT_STYLES: Record<string, { label: string; cls: string }> = {
  EXCELLENT: { label: "عالی — لبه واقعی تأیید شد", cls: "border-emerald-600/40 bg-emerald-600/10 text-emerald-700 dark:text-emerald-300" },
  GOOD: { label: "خوب — لبه مثبت", cls: "border-emerald-600/30 bg-emerald-600/5 text-emerald-700 dark:text-emerald-300" },
  MARGINAL: { label: "مرزی — در محدوده نویز", cls: "border-amber-600/40 bg-amber-600/10 text-amber-700 dark:text-amber-300" },
  FAIL: { label: "ناموفق — EV منفی", cls: "border-rose-600/40 bg-rose-600/10 text-rose-700 dark:text-rose-300" },
};

export function BacktestTab() {
  const [totalMatches, setTotalMatches] = useState(500);
  const [minEdge, setMinEdge] = useState(3);
  const [stakePercent, setStakePercent] = useState(2);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BacktestResultDTO | null>(null);

  const runBacktest = useCallback(async () => {
    setRunning(true);
    try {
      const res = await fetch("/api/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ totalMatches, minEdge: minEdge / 100, stakePercent }),
      });
      const data = await res.json();
      if (data.success) {
        setResult(data.result);
        toast.success(`بک‌تست ${totalMatches} بازی کامل شد`, { description: data.result.verdictMessage.slice(0, 60) + "..." });
      } else {
        toast.error(data.error ?? "خطا در اجرای بک‌تست");
      }
    } catch {
      toast.error("ارتباط با سرور برقرار نشد");
    } finally {
      setRunning(false);
    }
  }, [totalMatches, minEdge, stakePercent]);

  // اجرای اولیه هنگام ورود به تب (با گارد برای جلوگیری از اجرای دوباره در StrictMode)
  const autoRan = useRef(false);
  useEffect(() => {
    if (!autoRan.current) {
      autoRan.current = true;
      runBacktest();
    }
  }, [runBacktest]);

  const curve = result?.bets ?? [];

  const metrics = result
    ? [
        { label: "تعداد شرط", value: faNum(result.totalBets, 0), icon: FlaskConical, tone: "" },
        { label: "نرخ برد", value: faPct(result.strikeRate, 1), icon: BadgeCheck, tone: "" },
        { label: "ROI", value: faPctSigned(result.roi), icon: result.roi > 0 ? TrendingUp : TrendingDown, tone: result.roi > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500" },
        { label: "میانگین CLV", value: faPctSigned(result.avgClv), icon: Gauge, tone: result.avgClv > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500" },
        { label: "CLV مثبت", value: faPct(result.positiveClvRate, 0), icon: TrendingUp, tone: result.positiveClvRate > 0.5 ? "text-emerald-600 dark:text-emerald-400" : "" },
        { label: "بیشترین افت سرمایه", value: faPct(result.maxDrawdown, 1), icon: TrendingDown, tone: "text-amber-600 dark:text-amber-400" },
        { label: "سرمایه نهایی", value: faNum(result.finalEquity, 0), icon: TrendingUp, tone: result.finalEquity >= result.config.bankroll ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500" },
      ]
    : [];

  return (
    <div className="space-y-4">
      {/* تنظیمات */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <FlaskConical className="size-4 text-rose-600 dark:text-rose-400" />
            آزمایشگاه بک‌تست — تست قبل از ورود سرمایه واقعی
          </CardTitle>
          <CardDescription className="text-xs leading-relaxed">
            شبیه‌سازی ۵۰۰+ بازی تاریخی با خطای برآورد واقع‌گرایانه؛ معیار اصلی موفقیت:{" "}
            <b>CLV مثبت</b> یعنی ضریب انتخابی شما بالاتر از ضریب نهایی (Closing Line) بسته شود.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <Label className="text-xs">تعداد بازی</Label>
              <span className="text-xs font-bold tabular-nums">{faNum(totalMatches, 0)}</span>
            </div>
            <Slider value={[totalMatches]} min={100} max={2000} step={100} onValueChange={(v) => setTotalMatches(v[0])} aria-label="تعداد بازی" />
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <Label className="text-xs">آستانه +EV</Label>
              <span className="text-xs font-bold tabular-nums">{faNum(minEdge, 0)}٪</span>
            </div>
            <Slider value={[minEdge]} min={0} max={15} step={1} onValueChange={(v) => setMinEdge(v[0])} aria-label="آستانه ارزش" />
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <Label className="text-xs">استیک هر شرط</Label>
              <span className="text-xs font-bold tabular-nums">{faNum(stakePercent, 0)}٪ بانک</span>
            </div>
            <Slider value={[stakePercent]} min={0.5} max={5} step={0.5} onValueChange={(v) => setStakePercent(v[0])} aria-label="استیک" />
          </div>
          <Button onClick={runBacktest} disabled={running} className="gap-2 bg-rose-600 hover:bg-rose-700 text-white">
            {running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            {running ? "در حال شبیه‌سازی..." : "اجرای بک‌تست"}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <>
          {/* حکم */}
          <Alert className={VERDICT_STYLES[result.verdict].cls}>
            <BadgeCheck className="size-4" />
            <AlertTitle className="text-sm font-bold">نتیجه ارزیابی: {VERDICT_STYLES[result.verdict].label}</AlertTitle>
            <AlertDescription className="text-xs leading-relaxed">{result.verdictMessage}</AlertDescription>
          </Alert>

          {/* متریک‌ها */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {metrics.map((m) => (
              <Card key={m.label} className="p-3">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-1">
                  <m.icon className={`size-3 ${m.tone}`} />
                  {m.label}
                </div>
                <p className={`text-lg font-bold tabular-nums ${m.tone}`}>{m.value}</p>
              </Card>
            ))}
          </div>

          {/* نمودارها */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">منحنی رشد سرمایه (Equity Curve)</CardTitle>
                <CardDescription className="text-xs">بانک اولیه: {faNum(result.config.bankroll, 0)} واحد — استیک ثابت {faNum(result.config.stakePercent, 1)}٪</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64" dir="ltr">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={curve} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                      <defs>
                        <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10b981" stopOpacity={0.45} />
                          <stop offset="100%" stopColor="#10b981" stopOpacity={0.03} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.2)" />
                      <XAxis dataKey="i" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} domain={["auto", "auto"]} />
                      <RTooltip
                        contentStyle={{ fontSize: 11, borderRadius: 8, fontFamily: "Vazirmatn" }}
                        formatter={(value: number | string, name: string) => [typeof value === "number" ? value.toFixed(2) : value, name === "equity" ? "سرمایه" : name]}
                        labelFormatter={(l) => `شرط #${l}`}
                      />
                      <ReferenceLine y={result.config.bankroll} stroke="#888" strokeDasharray="4 4" />
                      <Area type="monotone" dataKey="equity" stroke="#10b981" strokeWidth={2} fill="url(#eq)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">CLV هر شرط (۶۰ شرط اخیر)</CardTitle>
                <CardDescription className="text-xs">
                  CLV = (ضریب گرفته‌شده − ضریب پایانی) ÷ ضریب پایانی — سبز = جلوتر از بازار
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64" dir="ltr">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={curve} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.2)" />
                      <XAxis dataKey="i" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`} />
                      <RTooltip
                        contentStyle={{ fontSize: 11, borderRadius: 8, fontFamily: "Vazirmatn" }}
                        formatter={(value: number | string) => [`${((Number(value)) * 100).toFixed(2)}%`, "CLV"]}
                        labelFormatter={(l) => `شرط #${l}`}
                      />
                      <ReferenceLine y={0} stroke="#888" />
                      <Bar dataKey="clv" radius={[2, 2, 0, 0]}>
                        {curve.map((b) => (
                          <Cell key={b.i} fill={b.clv > 0 ? "#10b981" : "#f43f5e"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* جدول آخرین شرط‌ها */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">پایان‌نامه شرط‌های اخیر</CardTitle>
              <CardDescription className="text-xs">
                مقایسه ضریب لحظه انتخاب با ضریب پایانی — شاخص Sharp Money
              </CardDescription>
            </CardHeader>
            <CardContent className="max-h-72 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="py-2 text-right font-medium">#</th>
                    <th className="py-2 text-right font-medium">بازار</th>
                    <th className="py-2 text-right font-medium">احتمال مدل</th>
                    <th className="py-2 text-right font-medium">ضریب گرفته</th>
                    <th className="py-2 text-right font-medium">ضریب پایانی</th>
                    <th className="py-2 text-right font-medium">نتیجه</th>
                    <th className="py-2 text-right font-medium">سود</th>
                    <th className="py-2 text-right font-medium">CLV</th>
                  </tr>
                </thead>
                <tbody>
                  {[...result.bets].reverse().map((b) => (
                    <tr key={b.i} className="border-b border-border/50">
                      <td className="py-1.5 tabular-nums text-muted-foreground">{faNum(b.i, 0)}</td>
                      <td className="py-1.5">
                        <Badge variant="outline" className="text-[10px]">
                          {b.market === "1" ? "برد میزبان" : b.market === "X" ? "مساوی" : b.market === "2" ? "برد میهمان" : b.market === "OVER_2_5" ? "بالای ۲.۵" : "زیر ۲.۵"}
                        </Badge>
                      </td>
                      <td className="py-1.5 tabular-nums">{faPct(b.modelProb, 0)}</td>
                      <td className="py-1.5 tabular-nums" dir="ltr">{b.oddsTaken.toFixed(2)}</td>
                      <td className="py-1.5 tabular-nums text-muted-foreground" dir="ltr">{b.oddsClosing.toFixed(2)}</td>
                      <td className="py-1.5">
                        {b.won ? (
                          <Badge className="text-[10px] bg-emerald-600/15 text-emerald-600 dark:text-emerald-400 border-emerald-600/30" variant="outline">برد</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-rose-500 border-rose-500/30">باخت</Badge>
                        )}
                      </td>
                      <td className={`py-1.5 tabular-nums font-medium ${b.profit > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"}`} dir="ltr">
                        {b.profit > 0 ? "+" : ""}{b.profit.toFixed(2)}
                      </td>
                      <td className={`py-1.5 tabular-nums font-medium ${b.clv > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"}`} dir="ltr">
                        {(b.clv * 100).toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
