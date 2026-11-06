"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BadgeCheck, FlaskConical, Gauge, Loader2, Play, TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { faNum } from "@/lib/format";
import type { BacktestResultDTO } from "@/lib/types";

const VERDICT_STYLES: Record<string, { label: string; cls: string }> = {
  EXCELLENT: { label: "عالی — لبه واقعی تأیید شد", cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" },
  GOOD: { label: "خوب — لبه مثبت", cls: "border-emerald-500/30 bg-emerald-500/5 text-emerald-300" },
  MARGINAL: { label: "مرزی — در محدوده نویز", cls: "border-amber-500/40 bg-amber-500/10 text-amber-300" },
  FAIL: { label: "ناموفق — EV منفی", cls: "border-rose-500/40 bg-rose-500/10 text-rose-300" },
};

type StrategyKey = "FIXED" | "KELLY25" | "DUTCH2";

const STRATEGY_META: Record<StrategyKey, { label: string; short: string; color: string; desc: string }> = {
  FIXED: {
    label: "Fixed Stake (۲٪ ثابت)",
    short: "استیک ثابت",
    color: "#f59e0b",
    desc: "هر شرط ۲٪ بانک جاری — ساده و مقاوم، اما Drawdown عمیق‌تر",
  },
  KELLY25: {
    label: "Fractional Kelly (۰.۲۵×)",
    short: "کلِی کسری",
    color: "#06b6d4",
    desc: "یک‌چهارم کلِی کامل — رشد هوشمند با سقف ۵٪ بانک در هر شرط",
  },
  DUTCH2: {
    label: "Dual-Slip Dutching (تیپ مکمل)",
    short: "داچینگ دوتیپی",
    color: "#10b981",
    desc: "بهترین بازار 1X2 + بهترین بازار گل با تخصیص سود برابر — کاهش چشمگیر Max Drawdown (کلِی همزمان)",
  },
};

export function BacktestTab() {
  const [totalMatches, setTotalMatches] = useState(500);
  const [minEdge, setMinEdge] = useState(3);
  const [strategy, setStrategy] = useState<StrategyKey>("FIXED");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BacktestResultDTO | null>(null);

  const runBacktest = useCallback(async () => {
    setRunning(true);
    try {
      const res = await fetch("/api/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ totalMatches, minEdge: minEdge / 100, strategy }),
      });
      const data = await res.json();
      if (data.success) {
        setResult(data.result);
        toast.success(`بک‌تست ${totalMatches} بازی کامل شد — ۳ استراتژی مقایسه شد`, {
          description: data.result.verdictMessage.slice(0, 90) + "...",
        });
      } else {
        toast.error(data.error ?? "خطا در اجرای بک‌تست");
      }
    } catch {
      toast.error("ارتباط با سرور برقرار نشد");
    } finally {
      setRunning(false);
    }
  }, [totalMatches, minEdge, strategy]);

  // اجرای اولیه هنگام ورود به تب (با گارد برای جلوگیری از اجرای دوباره در StrictMode)
  const autoRan = useRef(false);
  useEffect(() => {
    if (!autoRan.current) {
      autoRan.current = true;
      runBacktest();
    }
  }, [runBacktest]);

  const active = result?.strategies.find((s) => s.key === strategy);
  const curve = result?.bets ?? [];

  // نمودار سه منحنی همزمان — نقاط i مشترک از استراتژی فعال (نمونه‌برداری یکسان)
  const mergedCurves = result
    ? result.strategies[0].curve.map((pt, idx) => {
        const row: Record<string, number> = { i: pt.i };
        for (const s of result.strategies) {
          const p = s.curve[idx];
          if (p) row[s.key] = p.equity;
        }
        return row;
      })
    : [];

  const metrics = active
    ? [
        { label: "رویدادهای شرط", value: faNum(active.totalBets, 0), mono: false, icon: FlaskConical, tone: "" },
        { label: "نرخ سودآوری رویداد", value: `${(active.strikeRate * 100).toFixed(1)}%`, mono: true, icon: BadgeCheck, tone: "" },
        { label: "ROI", value: `${active.roi > 0 ? "+" : ""}${(active.roi * 100).toFixed(2)}%`, mono: true, icon: active.roi > 0 ? TrendingUp : TrendingDown, tone: active.roi > 0 ? "text-emerald-400" : "text-rose-400" },
        { label: "میانگین CLV", value: `${active.avgClv > 0 ? "+" : ""}${(active.avgClv * 100).toFixed(2)}%`, mono: true, icon: Gauge, tone: active.avgClv > 0 ? "text-emerald-400" : "text-rose-400" },
        { label: "CLV مثبت", value: `${(active.positiveClvRate * 100).toFixed(0)}%`, mono: true, icon: TrendingUp, tone: active.positiveClvRate > 0.5 ? "text-emerald-400" : "" },
        { label: "بیشترین افت سرمایه", value: `${(active.maxDrawdown * 100).toFixed(1)}%`, mono: true, icon: TrendingDown, tone: "text-amber-300" },
        { label: "سرمایه نهایی", value: faNum(active.finalEquity, 0), mono: false, icon: TrendingUp, tone: active.finalEquity >= 1000 ? "text-emerald-400" : "text-rose-400" },
      ]
    : [];

  return (
    <div className="space-y-4">
      {/* تنظیمات */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <FlaskConical className="size-4 text-rose-400" />
            آزمایشگاه بک‌تست — تست قبل از ورود سرمایه واقعی
          </CardTitle>
          <CardDescription className="text-xs leading-relaxed">
            شبیه‌سازی ۵۰۰+ بازی با خطای برآورد واقع‌گرایانه؛ معیار اصلی موفقیت: <b>CLV مثبت</b> — سه استراتژی مدیریت
            سرمایه روی همان شرط‌ها مقایسه می‌شوند.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <span className="text-xs">تعداد بازی</span>
              <span className="tabular-nums text-xs font-bold">{faNum(totalMatches, 0)}</span>
            </div>
            <Slider value={[totalMatches]} min={100} max={2000} step={100} onValueChange={(v) => setTotalMatches(v[0])} aria-label="تعداد بازی" />
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between">
              <span className="text-xs">آستانه +EV</span>
              <span className="text-xs font-bold">
                <span dir="ltr" className="tabular-nums">{faNum(minEdge, 0)}</span>٪
              </span>
            </div>
            <Slider value={[minEdge]} min={0} max={15} step={1} onValueChange={(v) => setMinEdge(v[0])} aria-label="آستانه ارزش" />
          </div>

          {/* کلید ۳ حالته استراتژی مدیریت سرمایه */}
          <div className="space-y-1.5 sm:col-span-2">
            <span className="text-xs text-muted-foreground">استراتژی مدیریت سرمایه (نمای جزئیات)</span>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(STRATEGY_META) as StrategyKey[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setStrategy(k)}
                  aria-pressed={strategy === k}
                  className={`rounded-md border px-2.5 py-1.5 text-[11px] transition-all ${
                    strategy === k
                      ? "border-white/25 bg-white/10 text-foreground"
                      : "border-white/10 bg-white/4 text-muted-foreground hover:text-foreground"
                  }`}
                  style={strategy === k ? { borderColor: `${STRATEGY_META[k].color}88`, boxShadow: `0 0 12px ${STRATEGY_META[k].color}33` } : undefined}
                >
                  <span className="mr-1.5 inline-block size-2 rounded-full align-middle" style={{ background: STRATEGY_META[k].color }} />
                  {STRATEGY_META[k].label}
                </button>
              ))}
            </div>
          </div>

          <Button onClick={runBacktest} disabled={running} className="gap-2 bg-rose-600 text-white hover:bg-rose-500">
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

          {/* متریک‌های استراتژی فعال */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {metrics.map((m) => (
              <Card key={m.label} className="p-3">
                <div className="mb-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <m.icon className={`size-3 ${m.tone}`} />
                  {m.label}
                </div>
                <p className={`${m.mono ? "font-num" : "tabular-nums"} text-lg font-bold ${m.tone}`}>{m.value}</p>
              </Card>
            ))}
          </div>

          {/* منحنی رشد سرمایه — هر سه استراتژی همزمان */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">منحنی رشد سرمایه — مقایسه همزمان ۳ استراتژی</CardTitle>
              <CardDescription className="text-xs">
                بانک اولیه ۱٬۰۰۰ واحد · روی همان شرط‌ها؛{" "}
                <b className="text-emerald-400">افت سرمایه داچینگ دوتیپی {(result.drawdownReduction * 100).toFixed(0)}٪ کمتر از استیک ثابت</b> —
                خط پهن‌تر = استراتژی انتخابی شما
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-72" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={mergedCurves} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                    <XAxis dataKey="i" tick={{ fontSize: 10, fill: "#8a97af" }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "#8a97af" }} tickLine={false} axisLine={false} domain={["auto", "auto"]} />
                    <RTooltip
                      contentStyle={{
                        fontSize: 11,
                        borderRadius: 8,
                        background: "rgba(10,14,24,0.95)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        fontFamily: "Vazirmatn",
                      }}
                      labelFormatter={(l) => `بازی #${l}`}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <ReferenceLine y={result.config.bankroll} stroke="#64748b" strokeDasharray="4 4" />
                    {(Object.keys(STRATEGY_META) as StrategyKey[]).map((k) => (
                      <Line
                        key={k}
                        type="monotone"
                        dataKey={k}
                        name={STRATEGY_META[k].label}
                        stroke={STRATEGY_META[k].color}
                        strokeWidth={strategy === k ? 3 : 1.5}
                        strokeOpacity={strategy === k ? 1 : 0.65}
                        dot={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* جدول مقایسه استراتژی‌ها */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">مقایسه استراتژی‌های مدیریت سرمایه</CardTitle>
              <CardDescription className="text-xs">
                هر سه روی یک دنباله شرط‌ها — تفاوت صرفاً در تخصیص سرمایه (Simultaneous Kelly)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-white/8 hover:bg-transparent">
                    <TableHead className="text-xs">استراتژی</TableHead>
                    <TableHead className="text-xs">ROI</TableHead>
                    <TableHead className="text-xs">سودآوری رویداد</TableHead>
                    <TableHead className="text-xs">میانگین CLV</TableHead>
                    <TableHead className="text-xs">Max Drawdown</TableHead>
                    <TableHead className="text-xs">سرمایه نهایی</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.strategies.map((s) => (
                    <TableRow
                      key={s.key}
                      className={`cursor-pointer border-white/6 ${strategy === s.key ? "bg-white/5" : ""}`}
                      onClick={() => setStrategy(s.key)}
                    >
                      <TableCell className="text-xs font-medium">
                        <span className="mr-1.5 inline-block size-2 rounded-full align-middle" style={{ background: STRATEGY_META[s.key].color }} />
                        {STRATEGY_META[s.key].label}
                        {s.key === "DUTCH2" && (
                          <Badge className="mr-2 border-emerald-500/40 bg-emerald-500/10 px-1 py-0 text-[9px] text-emerald-300" variant="outline">
                            −{(result.drawdownReduction * 100).toFixed(0)}٪ Drawdown
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className={`font-num text-xs ${s.roi > 0 ? "text-emerald-400" : "text-rose-400"}`} dir="ltr">
                        {s.roi > 0 ? "+" : ""}{(s.roi * 100).toFixed(2)}%
                      </TableCell>
                      <TableCell className="font-num text-xs" dir="ltr">{(s.strikeRate * 100).toFixed(1)}%</TableCell>
                      <TableCell className={`font-num text-xs ${s.avgClv > 0 ? "text-emerald-400" : "text-rose-400"}`} dir="ltr">
                        {s.avgClv > 0 ? "+" : ""}{(s.avgClv * 100).toFixed(2)}%
                      </TableCell>
                      <TableCell className="font-num text-xs text-amber-300" dir="ltr">{(s.maxDrawdown * 100).toFixed(1)}%</TableCell>
                      <TableCell className="tabular-nums text-xs font-bold" dir="ltr">{faNum(s.finalEquity, 0)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="mt-2 text-[11px] text-muted-foreground">{STRATEGY_META[strategy].desc}</p>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* CLV هر شرط */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">CLV هر شرط (۶۰ شرط اخیر — استراتژی ثابت)</CardTitle>
                <CardDescription className="text-xs">
                  CLV = (ضریب گرفته‌شده − ضریب پایانی) ÷ ضریب پایانی — سبز = جلوتر از بازار
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64" dir="ltr">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={curve} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                      <XAxis dataKey="i" tick={{ fontSize: 10, fill: "#8a97af" }} tickLine={false} axisLine={false} />
                      <YAxis
                        tick={{ fontSize: 10, fill: "#8a97af" }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
                      />
                      <RTooltip
                        contentStyle={{
                          fontSize: 11,
                          borderRadius: 8,
                          background: "rgba(10,14,24,0.95)",
                          border: "1px solid rgba(255,255,255,0.1)",
                        }}
                        formatter={(value: number | string) => [`${((Number(value)) * 100).toFixed(2)}%`, "CLV"]}
                        labelFormatter={(l) => `شرط #${l}`}
                      />
                      <ReferenceLine y={0} stroke="#64748b" />
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

            {/* جدول آخرین شرط‌ها */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">پایان‌نامه شرط‌های اخیر</CardTitle>
                <CardDescription className="text-xs">مقایسه ضریب لحظه انتخاب با ضریب پایانی — شاخص Sharp Money</CardDescription>
              </CardHeader>
              <CardContent className="max-h-64 overflow-auto">
                <table className="w-full min-w-[520px] text-xs">
                  <thead className="sticky top-0 bg-[rgba(13,18,30,0.95)]">
                    <tr className="border-b border-white/10 text-muted-foreground">
                      <th className="py-2 text-right font-medium">#</th>
                      <th className="py-2 text-right font-medium">بازار</th>
                      <th className="py-2 text-right font-medium">P مدل</th>
                      <th className="py-2 text-right font-medium">ضریب گرفته</th>
                      <th className="py-2 text-right font-medium">ضریب پایانی</th>
                      <th className="py-2 text-right font-medium">نتیجه</th>
                      <th className="py-2 text-right font-medium">CLV</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...result.bets].reverse().map((b) => (
                      <tr key={b.i} className="border-b border-white/6">
                        <td className="py-1.5 text-muted-foreground font-num">{b.i}</td>
                        <td className="py-1.5">
                          <Badge variant="outline" className="text-[10px]">
                            {b.market === "1" ? "برد میزبان" : b.market === "X" ? "مساوی" : b.market === "2" ? "برد میهمان" : b.market === "OVER_2_5" ? "بالای ۲.۵" : "زیر ۲.۵"}
                          </Badge>
                        </td>
                        <td className="font-num py-1.5">{(b.modelProb * 100).toFixed(0)}%</td>
                        <td className="font-num py-1.5" dir="ltr">{b.oddsTaken.toFixed(2)}</td>
                        <td className="font-num py-1.5 text-muted-foreground" dir="ltr">{b.oddsClosing.toFixed(2)}</td>
                        <td className="py-1.5">
                          {b.won ? (
                            <Badge className="border-emerald-500/30 bg-emerald-500/15 text-[10px] text-emerald-400" variant="outline">برد</Badge>
                          ) : (
                            <Badge variant="outline" className="border-rose-500/30 text-[10px] text-rose-400">باخت</Badge>
                          )}
                        </td>
                        <td className={`font-num py-1.5 font-medium ${b.clv > 0 ? "text-emerald-400" : "text-rose-400"}`} dir="ltr">
                          {(b.clv * 100).toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
