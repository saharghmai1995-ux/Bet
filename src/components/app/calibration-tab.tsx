"use client";

import { useEffect, useState } from "react";
import {
  BarChart3,
  BrainCircuit,
  Gauge,
  GraduationCap,
  Lightbulb,
  RefreshCw,
  ScrollText,
  Zap,
} from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { faNum, faPct } from "@/lib/format";
import type { ActiveRuleDTO, CalibrationDTO } from "@/lib/types";

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  label?: string | number;
  payload?: { name?: string | number; value?: string | number | (string | number)[] }[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-border bg-background p-2.5 shadow-sm space-y-1 text-xs" dir="rtl">
      <p className="font-medium">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-2">
          <span
            className="size-2 rounded-full shrink-0"
            style={{ background: p.name === "پیش‌بینی‌شده" ? "#d97706" : "#059669" }}
          />
          {p.name}: <span dir="ltr" className="tabular-nums">{faNum(Number(p.value), 1)}٪</span>
        </p>
      ))}
    </div>
  );
}

/** تبدیل مقدار باکت به درصد — هم کسر ۰..۱ و هم درصد خام پشتیبانی می‌شود */
const toPct = (v: number) => (v <= 1 ? Math.round(v * 1000) / 10 : Math.round(v * 10) / 10);

function factorBadge(f: number): { label: string; className: string } {
  if (f > 1.001) return { label: `تقویت ×${faNum(f, 2)}`, className: "border-emerald-600/40 text-emerald-600 dark:text-emerald-400" };
  if (f < 0.999) return { label: `کاهش ×${faNum(f, 2)}`, className: "border-amber-600/40 text-amber-600 dark:text-amber-400" };
  return { label: `خنثی ×${faNum(f, 2)}`, className: "" };
}

function outcomeBadge(outcome: string): { label: string; className: string } {
  switch (outcome) {
    case "WIN":
      return { label: "برد", className: "border-emerald-600/40 text-emerald-600 dark:text-emerald-400" };
    case "LOSS":
      return { label: "باخت", className: "border-rose-600/40 text-rose-600 dark:text-rose-400" };
    case "PUSH":
      return { label: "بی‌اثر", className: "" };
    default:
      return { label: outcome, className: "" };
  }
}

export function CalibrationTab() {
  const [data, setData] = useState<CalibrationDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  // ─── v9.0 — بردار قانون فعال کالیبراسیون (درس سیستمی → عدد) ───
  const [rules, setRules] = useState<ActiveRuleDTO[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/calibration", { cache: "no-store" })
      .then((res) => res.json())
      .then((json: CalibrationDTO) => {
        if (cancelled) return;
        if (json?.success) {
          setData(json);
        } else {
          toast.error("داده کالیبراسیون معتبر نیست");
          setData(null);
        }
      })
      .catch(() => {
        if (!cancelled) toast.error("دریافت داده کالیبراسیون ناموفق بود");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    fetch("/api/calibration/rules", { cache: "no-store" })
      .then((res) => res.json())
      .then((json: { success: boolean; rules?: ActiveRuleDTO[] }) => {
        if (cancelled) return;
        if (json?.success && Array.isArray(json.rules)) setRules(json.rules);
      })
      .catch(() => {
        // قوانین اختیاری‌اند — خطا بی‌صدا
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="در حال بارگذاری کالیبراسیون">
        <Skeleton className="h-36 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  if (!data) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          دریافت داده کالیبراسیون ناموفق بود — دوباره تلاش کنید.
        </CardContent>
      </Card>
    );
  }

  const chartData = data.buckets.map((b) => ({
    bucket: b.bucket,
    predicted: toPct(b.predicted),
    observed: toPct(b.observed),
  }));

  return (
    <div className="space-y-4">
      {/* هدر */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1.5">
              <CardTitle className="text-sm flex items-center gap-2">
                <Gauge className="size-4 text-emerald-600 dark:text-emerald-400" />
                سیستم خوداصلاحی — امتیاز بریر و کالیبراسیون
              </CardTitle>
              <CardDescription className="text-xs leading-relaxed">
                امتیاز بریر میانگین مربعات خط احتمال‌های پیش‌بینی‌شده است:{" "}
                <span dir="ltr" className="font-num font-bold">Brier = (p − نتیجه)²</span> — صفر یعنی پیش‌بینی بی‌نقص و{" "}
                <span className="font-num">0.25</span> معادل حدس تصادفی. مهارت استاندارد:{" "}
                <span dir="ltr" className="font-num font-bold text-emerald-400">BSS = (1 − Brier/0.25) × 100</span> — سیستم بر اساس همین امتیاز، ضریب اصلاحی هر
                لیگ را در تحلیل‌های بعدی اعمال می‌کند (حافظه برداری).
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setLoading(true);
                setReloadKey((k) => k + 1);
              }}
              className="gap-1.5 shrink-0"
              aria-label="بروزرسانی داده کالیبراسیون"
            >
              <RefreshCw className="size-3.5" />
              بروزرسانی
            </Button>
          </div>
        </CardHeader>
      </Card>

          {/* ═══ v9.0 — بردار قانون فعال کالیبراسیون (حلقه زنده به مغز سوپروایزر) ═══ */}
          <Card className="border-violet-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex flex-wrap items-center gap-2">
                <BrainCircuit className="size-4 text-violet-400" />
                بردار قانون فعال کالیبراسیون (Active Rule Vector)
                <Badge variant="outline" className="gap-1 border-violet-400/40 text-[10px] text-violet-300">
                  <Zap className="size-3" /> اعمال‌شده در فرمول سوپروایزر
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs leading-relaxed">
                درس‌های سیستمی دیگر فقط متن نیستند — هر درس یک ضریب عددی دارد که مستقیماً امید گل (λ) موتور و امتیاز
                UtilityScore الگوها در ایجنت سوپروایزر را تغییر می‌دهد. فلش‌کارت‌های همان لیگ این قوانین را با سطر
                «🧠 درس کالیبراسیون اعمال‌شده» نمایش می‌دهند.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {rules.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  هنوز قانون فعالی برای هیچ لیگی فعال نشده — پس از تسویه خودکار حداقل ۳ بازی در هر لیگ، بردار قانون همان لیگ فعال می‌شود.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {rules.map((r) => (
                    <div key={r.league} className="space-y-2 rounded-xl border border-violet-500/25 bg-violet-500/[0.05] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="flex items-center gap-1.5 text-xs font-bold text-violet-200">
                          <Zap className="size-3.5 text-violet-400" /> {r.league}
                        </p>
                        <div className="flex flex-wrap items-center gap-1">
                          <Badge variant="outline" className="text-[9px] text-muted-foreground">مبنای قانون: {faNum(r.sample, 0)} کارت تسویه‌شده</Badge>
                          {r.goalBiasPct !== null && (
                            <Badge
                              variant="outline"
                              className={`text-[9px] ${r.goalBiasPct < 0 ? "border-sky-400/40 text-sky-300" : "border-amber-400/40 text-amber-300"}`}
                            >
                              انحراف گلزنی: {r.goalBiasPct > 0 ? "+" : ""}{faNum(r.goalBiasPct, 1)}٪
                            </Badge>
                          )}
                          {Math.abs(r.lambdaMultiplier - 1) > 0.001 && (
                            <Badge variant="outline" className={`text-[9px] ${r.lambdaMultiplier < 1 ? "border-sky-400/40 text-sky-300" : "border-emerald-400/40 text-emerald-300"}`}>
                              λ × {faNum(r.lambdaMultiplier, 2)}
                            </Badge>
                          )}
                          {Object.entries(r.archetypeBoosts).map(([code, b]) => (
                            <Badge key={code} variant="outline" className={`text-[9px] ${b > 0 ? "border-emerald-400/40 text-emerald-300" : "border-rose-400/40 text-rose-300"}`}>
                              {code}: {b > 0 ? "+" : ""}{faNum(b, 0)} امتیاز
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <ul className="space-y-1 text-[11px] leading-5 text-muted-foreground">
                        {r.rules.map((rule, i) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <Lightbulb className="mt-0.5 size-3 shrink-0 text-violet-400" />
                            <span>{rule}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        
      {data.overall.count === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            هنوز داده کالیبراسیون ثبت نشده است — پس از ثبت چند پیش‌بینی و نتیجه، این داشبورد خودکار پر می‌شود.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* آمار کلی */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-lg glass border-white/10 p-3 space-y-1">
              <p className="text-[11px] text-muted-foreground">میانگین بریر</p>
              <p className="font-num text-lg font-bold" dir="ltr">{data.overall.avgBrier.toFixed(3)}</p>
              <p className="text-[10px] text-muted-foreground">کمتر بهتر — صفر بی‌نقص</p>
            </div>
            <div className="rounded-lg glass border-white/10 p-3 space-y-1">
              <p className="text-[11px] text-muted-foreground">نرخ اصابت</p>
              <p className="font-num text-lg font-bold" dir="ltr">{(data.overall.hitRate * 100).toFixed(0)}%</p>
              <p className="text-[10px] text-muted-foreground">سهم پیش‌بینی‌های درست</p>
            </div>
            <div className="rounded-lg glass border-emerald-500/25 p-3 space-y-1">
              <p className="text-[11px] text-muted-foreground">Brier Skill Score (BSS)</p>
              <p
                className={`font-num text-lg font-bold ${data.overall.brierSkillScore > 0 ? "text-emerald-400" : "text-rose-400"}`}
                dir="ltr"
              >
                {data.overall.brierSkillScore > 0 ? "+" : ""}{data.overall.brierSkillScore.toFixed(1)}%
              </p>
              <p className="font-num text-[10px] text-muted-foreground" dir="ltr">BSS = (1 − Brier/0.25) × 100</p>
            </div>
            <div className="rounded-lg glass border-white/10 p-3 space-y-1">
              <p className="text-[11px] text-muted-foreground">تعداد پیش‌بینی‌ها</p>
              <p className="font-num text-lg font-bold" dir="ltr">{data.overall.count}</p>
              <p className="text-[10px] text-muted-foreground">رکوردهای ثبت‌شده</p>
            </div>
          </div>

          {/* مقایسه با خط مرجع پیناکل */}
          <div className="rounded-lg glass border-cyan-500/25 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-cyan-200">
                <Gauge className="size-4 text-cyan-400" />
                مقایسه با خط مرجع پیناکل (Sharp Benchmark)
              </p>
              <Badge
                variant="outline"
                className={`text-[10px] ${data.overall.vsPinnacleDelta <= 0 ? "border-emerald-500/40 text-emerald-400" : "border-amber-500/40 text-amber-300"}`}
              >
                {data.overall.vsPinnacleDelta <= 0
                  ? `مدل ${(Math.abs(data.overall.vsPinnacleDelta) * 100).toFixed(1)} نقطه بهتر از پیناکل`
                  : `مدل ${(data.overall.vsPinnacleDelta * 100).toFixed(1)} نقطه ضعیف‌تر از پیناکل`}
              </Badge>
            </div>
            <div className="space-y-2">
              {[
                { label: "بریر مدل شما", value: data.overall.avgBrier, color: "#10b981" },
                { label: "بریر خط پایانی پیناکل (مرجع)", value: data.overall.pinnacleBrier, color: "#06b6d4" },
              ].map((row) => (
                <div key={row.label} className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">{row.label}</span>
                    <b className="font-num" dir="ltr" style={{ color: row.color }}>{row.value.toFixed(3)}</b>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-white/8">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${Math.min(100, (row.value / 0.25) * 100)}%`, backgroundColor: row.color }}
                    />
                  </div>
                </div>
              ))}
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                بریر ۰.۲۵ = حدس تصادفی | خط پایانی پیناکل به‌طور تاریخی حدود <span className="font-num" dir="ltr">0.192</span> است —
                اگر نوار سبز شما کوتاه‌تر از نوار سیان باشد، مدل از خط شارپ بازار دقیق‌تر عمل کرده است.
              </p>
            </div>
          </div>

          {/* نمودار پایایی */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart3 className="size-4 text-emerald-600 dark:text-emerald-400" />
                نمودار پایایی (Reliability)
              </CardTitle>
              <CardDescription className="text-xs leading-relaxed">
                در یک سیستم کالیبره، احتمال پیش‌بینی‌شده و نرخ مشاهده‌شده در هر باکت باید به هم نزدیک باشند.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div dir="ltr" className="w-full">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="bucket" tick={{ fontSize: 10 }} />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fontSize: 10 }}
                      width={36}
                      tickFormatter={(v: number) => faNum(v, 0)}
                    />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="predicted" name="پیش‌بینی‌شده" fill="#d97706" radius={[4, 4, 0, 0]} maxBarSize={36} />
                    <Bar dataKey="observed" name="مشاهده‌شده" fill="#059669" radius={[4, 4, 0, 0]} maxBarSize={36} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            {/* کالیبراسیون در هر لیگ */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">کالیبراسیون در هر لیگ (حافظه برداری)</CardTitle>
                <CardDescription className="text-xs">
                  ضریب اصلاحی به‌صورت خودکار روی تحلیل‌های بعدی همان لیگ اعمال می‌شود.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="max-h-96 overflow-y-auto rounded-md border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">لیگ</TableHead>
                        <TableHead className="text-xs">تعداد</TableHead>
                        <TableHead className="text-xs">بریر</TableHead>
                        <TableHead className="text-xs">اصابت</TableHead>
                        <TableHead className="text-xs">ضریب اصلاحی</TableHead>
                        <TableHead className="text-xs">یادداشت</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.byLeague.map((l) => {
                        const fb = factorBadge(l.calibrationFactor);
                        return (
                          <TableRow key={l.league}>
                            <TableCell className="text-xs font-medium">{l.league}</TableCell>
                            <TableCell className="text-xs tabular-nums" dir="ltr">{faNum(l.count, 0)}</TableCell>
                            <TableCell className="text-xs tabular-nums" dir="ltr">{faNum(l.avgBrier, 3)}</TableCell>
                            <TableCell className="text-xs tabular-nums" dir="ltr">{faPct(l.hitRate, 0)}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={`text-[10px] whitespace-nowrap ${fb.className}`}>
                                {fb.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-[11px] text-muted-foreground leading-relaxed">{l.note}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* گزارش بازرس */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ScrollText className="size-4 text-amber-500" />
                  گزارش بازرس پس از بازی
                </CardTitle>
                <CardDescription className="text-xs">
                  هر پیش‌بینی پس از پایان بازی با امتیاز بریر بازرسی و درس استخراج می‌شود.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="max-h-96 overflow-y-auto space-y-2">
                  {data.logs.map((log) => {
                    const ob = outcomeBadge(log.outcome);
                    return (
                      <div key={log.id} className="rounded-lg border border-border p-2.5 space-y-1">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <p className="text-xs font-medium">{log.matchLabel}</p>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Badge variant="outline" className="text-[10px]">{log.pick}</Badge>
                            <Badge variant="outline" className={`text-[10px] ${ob.className}`}>{ob.label}</Badge>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                          <span>
                            احتمال پیش‌بینی: <b className="tabular-nums text-foreground">{faPct(log.predictedProb, 0)}</b>
                          </span>
                          <span>
                            بریر: <b className="tabular-nums text-foreground" dir="ltr">{faNum(log.brier, 3)}</b>
                          </span>
                          <span>{log.league}</span>
                        </div>
                        {log.lesson && (
                          <p className="text-[11px] text-muted-foreground leading-relaxed">{log.lesson}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* درس‌های سیستمی */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <GraduationCap className="size-4 text-emerald-600 dark:text-emerald-400" />
                درس‌های سیستمی
              </CardTitle>
              <CardDescription className="text-xs">
                جمع‌بندی خودکار بازرس از الگوهای خطا برای اصلاح مدل.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {data.lessons.map((lesson, i) => (
                  <li key={`${i}-${lesson.slice(0, 16)}`} className="flex items-start gap-2 text-xs leading-relaxed">
                    <Lightbulb className="size-3.5 text-amber-500 shrink-0 mt-0.5" />
                    <span>{lesson}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
</>
      )}
    </div>
  );
}
