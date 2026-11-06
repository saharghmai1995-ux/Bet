"use client";

import { useCallback, useState } from "react";
import {
  Boxes,
  CheckCircle2,
  Dices,
  Loader2,
  Sigma,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { faNum, faOdds, faPct, faPctSigned } from "@/lib/format";
import type { DebateResultDTO, MatchDTO, PortfolioPairDTO, PortfolioResultDTO } from "@/lib/types";

interface Props {
  matches: MatchDTO[];
  debates: Record<string, DebateResultDTO>;
  onGoToDebate: (matchId: string) => void;
}

const KIND_LABEL: Record<PortfolioPairDTO["kind"], string> = {
  SINGLE_MATCH_BUILDER: "بت‌بیلدر تک‌بازی",
  TWO_MATCH_MIX: "میکس دو بازی",
};

export function PortfolioCard({ matches, debates, onGoToDebate }: Props) {
  const [matchId, setMatchId] = useState<string | null>(null);
  const [bankroll, setBankroll] = useState(100);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<PortfolioResultDTO | null>(null);

  const run = useCallback(async () => {
    if (!matchId) {
      toast.error("بازی اصلی را انتخاب کنید");
      return;
    }
    setRunning(true);
    try {
      const res = await fetch("/api/agent/portfolio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, bankroll }),
      });
      const data = await res.json();
      if (data.success) {
        setResult(data);
        toast.success(`۱۰٬۰۰۰ شبیه‌سازی مونت‌کارلو کامل شد — ${data.pairs.length} زوج مکمل کشف شد`, {
          description: `همبستگی گل×کرنر: ${data.monteCarlo.corrGoalsCorners.toFixed(2)}`,
        });
      } else {
        toast.error(data.error ?? "خطا در اجرای موتور پرتفوی");
      }
    } catch {
      toast.error("ارتباط با سرور برقرار نشد");
    } finally {
      setRunning(false);
    }
  }, [matchId, bankroll]);

  const mc = result?.monteCarlo;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Dices className="size-4 text-emerald-600 dark:text-emerald-400" />
          موتور پرتفوی — مونت‌کارلو کاپولا + کلِی همزمان
        </CardTitle>
        <CardDescription className="text-xs leading-relaxed">
          هر بازی ۱۰٬۰۰۰ بار شبیه‌سازی می‌شود (نمره از ماتریس دیکسون-کولز + کرنر با عامل نهان همبسته)؛ سپس از میان هزاران ترکیب،
          زوج‌هایی با <b className="text-emerald-600 dark:text-emerald-400">کمترین نرخ باخت همزمان</b> انتخاب و سرمایه با کلِی همزمان تخصیص می‌یابد.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
          <div className="space-y-1.5 flex-1">
            <Label className="text-xs">بازی اصلی</Label>
            <Select value={matchId ?? ""} onValueChange={setMatchId} disabled={running}>
              <SelectTrigger aria-label="انتخاب بازی اصلی" className="w-full">
                <SelectValue placeholder="بازی را انتخاب کنید..." />
              </SelectTrigger>
              <SelectContent>
                {matches.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.homeTeam} — {m.awayTeam} {debates[m.id] ? "✓ مناظره‌شده" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 w-full sm:w-32">
            <Label className="text-xs">بودجه (واحد)</Label>
            <Input
              type="number"
              min="1"
              value={bankroll}
              onChange={(e) => setBankroll(parseFloat(e.target.value) || 0)}
              className="tabular-nums"
              dir="ltr"
            />
          </div>
          <Button
            onClick={run}
            disabled={running || !matchId}
            className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {running ? <Loader2 className="size-4 animate-spin" /> : <Dices className="size-4" />}
            {running ? "شبیه‌سازی..." : "اجرای مونت‌کارلو + کلِی"}
          </Button>
        </div>

        {matchId && !debates[matchId] && !running && (
          <p className="text-[10px] text-amber-600 dark:text-amber-400">
            این بازی هنوز مناظره نشده — برای احتمالات قاضی، اول مناظره را اجرا کنید.
            <button className="underline mr-1" onClick={() => onGoToDebate(matchId)}>
              رفتن به مناظره
            </button>
          </p>
        )}

        {/* ─── خلاصه مونت‌کارلو ─── */}
        {mc && result && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
              <div className="rounded-lg border border-border p-2.5">
                <p className="text-[10px] text-muted-foreground">تکرار شبیه‌سازی</p>
                <p className="font-bold tabular-nums" dir="ltr">{faNum(mc.sims, 0)}</p>
              </div>
              <div className="rounded-lg border border-border p-2.5">
                <p className="text-[10px] text-muted-foreground">میانگین کرنر / کارت</p>
                <p className="font-bold tabular-nums" dir="ltr">{faNum(mc.avgCorners, 1)} / {faNum(mc.avgCards, 1)}</p>
              </div>
              <div className="rounded-lg border border-border p-2.5">
                <p className="text-[10px] text-muted-foreground">همبستگی گل×کرنر (کاپولا)</p>
                <p className="font-bold tabular-nums" dir="ltr">{faNum(mc.corrGoalsCorners, 2)}</p>
              </div>
              <div className="rounded-lg border border-border p-2.5">
                <p className="text-[10px] text-muted-foreground">بالای ۹.۵ کرنر</p>
                <p className="font-bold tabular-nums">{faPct(mc.cornersOver95, 0)}</p>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Sigma className="size-3" />
              توزیع مونت‌کارلو: برد میزبان {faPct(mc.pHome, 0)} · مساوی {faPct(mc.pDraw, 0)} · میهمان {faPct(mc.pAway, 0)} · بالای ۲.۵ {faPct(mc.pOver25, 0)}
            </p>
            <Separator />

            {/* ─── زوج‌های مکمل ─── */}
            <div className="space-y-3">
              {result.pairs.map((pair, idx) => (
                <div
                  key={pair.id}
                  className={`rounded-lg border p-3 space-y-2.5 ${
                    idx === 0 ? "border-emerald-600/40 bg-emerald-600/5" : "border-border"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-bold flex items-center gap-1.5">
                      <Boxes className="size-3.5 text-emerald-500" />
                      {KIND_LABEL[pair.kind]} — {pair.labelA} ↔ {pair.labelB}
                      {result.recommendedId && idx === 0 && (
                        <Badge className="text-[9px] px-1.5 py-0 bg-emerald-600 text-white">پیشنهاد اول</Badge>
                      )}
                    </p>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${
                        pair.trap.verdict === "NONE"
                          ? "border-emerald-600/40 text-emerald-600 dark:text-emerald-400"
                          : "border-amber-600/40 text-amber-600 dark:text-amber-400"
                      }`}
                    >
                      {pair.trap.verdict === "NONE" ? "مکمل واقعی ✓" : pair.trap.verdict === "WARNING" ? "پوشش نسبی" : "تله!"}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                    <div className="rounded-md bg-muted/50 p-2">
                      <p className="text-muted-foreground">ضریب کل تیپ A / B</p>
                      <p className="font-bold tabular-nums" dir="ltr">{faOdds(pair.totalOddsA)} / {faOdds(pair.totalOddsB)}</p>
                    </div>
                    <div className="rounded-md bg-muted/50 p-2">
                      <p className="text-muted-foreground">P(باخت همزمان)</p>
                      <p className={`font-bold tabular-nums ${pair.jointStates.bothLose < 0.05 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600"}`}>
                        {faPct(pair.jointStates.bothLose, 1)}
                      </p>
                    </div>
                    <div className="rounded-md bg-muted/50 p-2">
                      <p className="text-muted-foreground">S = Σ 1/O</p>
                      <p className={`font-bold tabular-nums ${pair.impliedSum < 1 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"}`} dir="ltr">
                        {pair.impliedSum.toFixed(3)} {pair.impliedSum < 1 ? "✓" : "✗"}
                      </p>
                    </div>
                    <div className="rounded-md bg-muted/50 p-2">
                      <p className="text-muted-foreground">سود تضمینی</p>
                      <p className={`font-bold tabular-nums ${pair.guaranteedMarginPct > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                        {faPctSigned(pair.guaranteedMarginPct / 100, 1)}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                    <div className="rounded-md border border-border p-2 space-y-1">
                      <p className="font-semibold flex items-center gap-1">
                        <TrendingUp className="size-3 text-amber-500" /> داچینگ سود برابر (بودجه {faNum(result.bankroll, 0)})
                      </p>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">تیپ A / تیپ B</span>
                        <span className="tabular-nums" dir="ltr">{faNum(pair.equalProfit.stakeA)} / {faNum(pair.equalProfit.stakeB)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">سود در برد هر یک</span>
                        <span className="tabular-nums text-emerald-600 dark:text-emerald-400" dir="ltr">{faNum(pair.equalProfit.profit)}</span>
                      </div>
                    </div>
                    <div className="rounded-md border border-border p-2 space-y-1">
                      <p className="font-semibold flex items-center gap-1">
                        <Sigma className="size-3 text-violet-500" /> کلِی همزمان (پرتفوی هم‌بسته)
                      </p>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">f<sub>A</sub> / f<sub>B</sub></span>
                        <span className="tabular-nums" dir="ltr">{faPct(pair.kelly.fA, 1)} / {faPct(pair.kelly.fB, 1)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">مبلغ پیشنهادی A / B</span>
                        <span className="tabular-nums" dir="ltr">{faNum(pair.kelly.fA * result.bankroll)} / {faNum(pair.kelly.fB * result.bankroll)}</span>
                      </div>
                    </div>
                  </div>

                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    <CheckCircle2 className="inline size-3 text-emerald-500" /> {pair.verdict} — {pair.trap.message}
                  </p>
                </div>
              ))}
              {result.pairs.length === 0 && (
                <div className="rounded-lg border border-amber-600/30 bg-amber-600/5 p-3 text-xs flex items-start gap-2">
                  <XCircle className="size-4 text-amber-500 shrink-0 mt-0.5" />
                  <p>هیچ زوجی با آستانه ریسک (باخت همزمان زیر ۱۶٪) روی این بازی ساخته نشد — بازی دیگری امتحان کنید.</p>
                </div>
              )}
            </div>

            {/* ─── جدول انتخاب‌ها با بهترین قیمت ─── */}
            <Separator />
            <div className="rounded-lg border border-border max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">انتخاب</TableHead>
                    <TableHead className="text-xs">P(مدل)</TableHead>
                    <TableHead className="text-xs">بهترین ضریب</TableHead>
                    <TableHead className="text-xs">+EV</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.selections.map((s) => (
                    <TableRow key={`${s.matchId}-${s.key}`}>
                      <TableCell className="text-xs">
                        {s.label}
                        <span className="text-[9px] text-muted-foreground block">{s.matchLabel}</span>
                      </TableCell>
                      <TableCell className="text-xs tabular-nums">{faPct(s.modelProb, 1)}</TableCell>
                      <TableCell className="text-xs tabular-nums" dir="ltr">
                        {faOdds(s.bestOdds)} <span className="text-[9px] text-muted-foreground">({s.bestBook})</span>
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs font-bold tabular-nums ${s.evPct > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`} dir="ltr">
                          {faPctSigned(s.evPct, 1)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
