"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  Loader2,
  Play,
  Sparkles,
  Swords,
  Target,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { faNum, faOdds, faPct, faPctSigned } from "@/lib/format";
import type { AnalysisResultDTO, MatchDTO } from "@/lib/types";

const STEPS = [
  "دریافت آمار پیشرفته از پایپ‌لاین داده (xG، PPDA، Field Tilt)...",
  "اجرای موتور کمّی دیکسون-کولز و کالیبره‌سازی...",
  "ایجنت LLM در حال تحلیل تاکتیکی و ساخت سناریوها...",
  "محاسبه ارزش مورد انتظار (+EV) در برابر ضرایب سایت...",
];

interface Props {
  matches: MatchDTO[];
  selectedMatchId: string | null;
  onSelectMatch: (id: string) => void;
  analyses: Record<string, AnalysisResultDTO>;
  onAnalyzed: (result: AnalysisResultDTO) => void;
}

export function AnalystTab({ matches, selectedMatchId, onSelectMatch, analyses, onAnalyzed }: Props) {
  const [running, setRunning] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [result, setResult] = useState<AnalysisResultDTO | null>(null);
  const stepTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // اگر تحلیل کش‌شده برای بازی انتخابی هست، نمایش بده
  useEffect(() => {
    if (selectedMatchId && analyses[selectedMatchId]) {
      setResult(analyses[selectedMatchId]);
    }
  }, [selectedMatchId, analyses]);

  useEffect(() => {
    return () => {
      if (stepTimer.current) clearInterval(stepTimer.current);
    };
  }, []);

  const runAnalysis = useCallback(async () => {
    if (!selectedMatchId || running) return;
    setRunning(true);
    setStepIdx(0);
    stepTimer.current = setInterval(() => {
      setStepIdx((i) => Math.min(i + 1, STEPS.length - 1));
    }, 2600);

    try {
      const res = await fetch("/api/agent/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId: selectedMatchId }),
      });
      const data = await res.json();
      if (data.success) {
        setResult(data);
        onAnalyzed(data);
        if (data.source === "LLM") {
          toast.success("تحلیل ایجنت ارشد کامل شد", { description: "خروجی ساختاریافته JSON + محاسبه EV" });
        } else {
          toast.warning("پاسخ LLM معتبر نبود — از موتور کمّی استفاده شد (fallback)");
        }
      } else {
        toast.error(data.error ?? "خطا در اجرای ایجنت");
      }
    } catch {
      toast.error("ارتباط با سرور برقرار نشد");
    } finally {
      if (stepTimer.current) clearInterval(stepTimer.current);
      setRunning(false);
    }
  }, [selectedMatchId, running, onAnalyzed]);

  const selected = matches.find((m) => m.id === selectedMatchId);
  const a = result?.analysis;

  const evRows = result
    ? [
        { market: `برد ${result.match.homeTeam}`, prob: a!.probabilities.home, odds: result.match.oddsHome, ev: a!.evs.home },
        { market: "مساوی", prob: a!.probabilities.draw, odds: result.match.oddsDraw, ev: a!.evs.draw },
        { market: `برد ${result.match.awayTeam}`, prob: a!.probabilities.away, odds: result.match.oddsAway, ev: a!.evs.away },
        { market: "بالای ۲.۵ گل", prob: a!.probabilities.over25, odds: result.match.oddsOver25, ev: a!.evs.over25 },
        { market: "زیر ۲.۵ گل", prob: a!.probabilities.under25, odds: result.match.oddsUnder25, ev: a!.evs.under25 },
      ]
    : [];

  return (
    <div className="space-y-4">
      {/* کنترل اجرا */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <BrainCircuit className="size-4 text-emerald-600 dark:text-emerald-400" />
            ایجنت «تحلیلگر ارشد فوتبال»
          </CardTitle>
          <CardDescription className="text-xs leading-relaxed">
            تلفیق آمار کمّی (خروجی دیکسون-کولز) با تحلیل کیفی تاکتیکی → توزیع احتمالاتی سناریوها + احتمال واقعی هر بازار
            + کشف <span className="font-bold text-emerald-600 dark:text-emerald-400">ارزش مورد انتظار مثبت (+EV)</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <Select value={selectedMatchId ?? ""} onValueChange={onSelectMatch} disabled={running}>
            <SelectTrigger className="w-full sm:w-80" aria-label="انتخاب بازی">
              <SelectValue placeholder="بازی را انتخاب کنید..." />
            </SelectTrigger>
            <SelectContent>
              {matches.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.homeTeam} — {m.awayTeam} ({m.league})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={runAnalysis} disabled={running || !selectedMatchId} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
            {running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            {running ? "در حال تحلیل..." : "اجرای ایجنت تحلیلگر"}
          </Button>
          {result && !running && (
            <Badge variant="outline" className="gap-1.5 text-[11px] border-emerald-600/40 text-emerald-600 dark:text-emerald-400 w-fit">
              <CheckCircle2 className="size-3" />
              تحلیل آماده — اطمینان: {faPct(result.analysis.confidence, 0)}
            </Badge>
          )}
        </CardContent>
        {running && (
          <CardContent className="pt-0">
            <div className="rounded-lg bg-muted/60 p-3 space-y-1.5">
              {STEPS.map((s, i) => (
                <p key={s} className={`text-xs flex items-center gap-2 ${i <= stepIdx ? "text-foreground" : "text-muted-foreground/50"}`}>
                  {i < stepIdx ? (
                    <CheckCircle2 className="size-3.5 text-emerald-500" />
                  ) : i === stepIdx ? (
                    <Loader2 className="size-3.5 animate-spin text-emerald-500" />
                  ) : (
                    <span className="size-3.5 rounded-full border border-border" />
                  )}
                  {s}
                </p>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      {/* نتیجه */}
      {result && a && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* سناریوها */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Sparkles className="size-4 text-amber-500" />
                توزیع احتمالاتی سناریوهای بازی
              </CardTitle>
              <CardDescription className="text-xs">
                {selected?.homeTeam} در برابر {selected?.awayTeam} — منبع: {result.source === "LLM" ? "ایجنت LLM" : "موتور کمّی (fallback)"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {a.scenarios.map((s) => (
                <div key={s.name} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-xs font-medium">{s.name}</p>
                    <p className="text-xs font-bold tabular-nums">{faPct(s.probability, 0)}</p>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-l from-amber-400 to-emerald-500 transition-all duration-700"
                      style={{ width: `${Math.max(2, Math.min(100, s.probability * 100))}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">{s.description}</p>
                </div>
              ))}
              <Separator />
              <p className="text-[11px] leading-relaxed text-muted-foreground">{a.narrative}</p>
            </CardContent>
          </Card>

          {/* احتمال واقعی و EV */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Target className="size-4 text-emerald-600 dark:text-emerald-400" />
                احتمال واقعی در برابر ضرایب سایت
              </CardTitle>
              <CardDescription className="text-xs">
                EV = احتمال واقعی × ضریب − ۱ — مقدار مثبت یعنی ارزش یافت شد
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">بازار</TableHead>
                    <TableHead className="text-xs">احتمال واقعی</TableHead>
                    <TableHead className="text-xs">ضریب</TableHead>
                    <TableHead className="text-xs">+EV</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {evRows.map((r) => (
                    <TableRow key={r.market} className={r.market === result.analysis.bestMarket ? "bg-emerald-600/5" : ""}>
                      <TableCell className="text-xs font-medium">
                        <span className="flex items-center gap-1.5">
                          {r.market}
                          {r.market === result.analysis.bestMarket && (
                            <Badge className="text-[9px] px-1 py-0 bg-emerald-600 text-white">بهترین</Badge>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs tabular-nums">{faPct(r.prob, 1)}</TableCell>
                      <TableCell className="text-xs tabular-nums" dir="ltr">{faOdds(r.odds)}</TableCell>
                      <TableCell>
                        <span
                          className={`text-xs font-bold tabular-nums ${r.ev > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"}`}
                          dir="ltr"
                        >
                          {faPctSigned(r.ev)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="mt-3 rounded-lg bg-emerald-600/10 border border-emerald-600/25 p-3">
                <p className="text-xs">
                  <b>پیشنهاد ایجنت:</b> {a.bestMarket} با ضریب{" "}
                  <span dir="ltr" className="tabular-nums">
                    {faOdds(
                      result.match[
                        a.bestKey === "home" ? "oddsHome" : a.bestKey === "draw" ? "oddsDraw" : a.bestKey === "away" ? "oddsAway" : a.bestKey === "over25" ? "oddsOver25" : "oddsUnder25"
                      ]
                    )}
                  </span>{" "}
                  — ارزش: <b className="text-emerald-600 dark:text-emerald-400">{faPctSigned(a.bestEv)}</b>
                  {" "}· احتمال پایه 1X: <b className="tabular-nums">{faPct(a.p1x, 0)}</b>
                  {a.riskFlag === "MIDDLE_TRAP_RISK" && (
                    <span className="text-amber-600 dark:text-amber-400"> (زیر آستانه امنیت ۷۲٪ برای تیپ مکمل)</span>
                  )}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* تاکتیک */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Swords className="size-4 text-violet-600 dark:text-violet-400" />
                تطابق تاکتیکی دو تیم (Tactical Matchup)
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="rounded-lg border border-border p-3 space-y-1.5">
                <p className="font-semibold text-emerald-600 dark:text-emerald-400">{result.match.homeTeam}</p>
                <p className="text-muted-foreground leading-relaxed">{a.tacticalMatchup.homeStyle}</p>
              </div>
              <div className="rounded-lg border border-border p-3 space-y-1.5">
                <p className="font-semibold text-amber-600 dark:text-amber-400">{result.match.awayTeam}</p>
                <p className="text-muted-foreground leading-relaxed">{a.tacticalMatchup.awayStyle}</p>
              </div>
              <div className="rounded-lg border border-border p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">تمپوی بازی</span>
                  <Badge variant="outline" className="text-[10px]">
                    {a.tacticalMatchup.tempo === "HIGH" ? "سریع و باز" : a.tacticalMatchup.tempo === "LOW" ? "آهسته و بسته" : "متوسط"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">امید گل ایجنت</span>
                  <span className="tabular-nums" dir="ltr">
                    {a.goalsExpectation.home.toFixed(2)} — {a.goalsExpectation.away.toFixed(2)}
                  </span>
                </div>
                {a.tacticalMatchup.keyBattles.length > 0 && (
                  <ul className="pt-1 space-y-1">
                    {a.tacticalMatchup.keyBattles.slice(0, 3).map((k) => (
                      <li key={k} className="text-[11px] text-muted-foreground flex gap-1">
                        <span className="text-violet-500">◆</span> {k}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {a.riskFlags.length > 0 && (
                <div className="md:col-span-3 rounded-lg border border-amber-600/30 bg-amber-600/5 p-3 flex items-start gap-2">
                  <AlertTriangle className="size-4 text-amber-500 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    {a.riskFlags.map((f) => (
                      <p key={f} className="text-[11px] leading-relaxed">{f}</p>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {!result && !running && (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            یک بازی انتخاب کنید و «اجرای ایجنت تحلیلگر» را بزنید تا تحلیل احتمالاتی و ارزش‌یابی بازارها انجام شود.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
