"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Megaphone,
  Shield,
  Shirt,
  Star,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { faNum, faOdds, faPct, faPctSigned, signed } from "@/lib/format";
import type { DebateResultDTO, LineupShockDTO, LiveHedgeDTO, MatchDTO } from "@/lib/types";

const POSITIONS: Record<string, string> = {
  GK: "دروازه‌بان",
  DEF: "مدافع",
  MID: "هافبک",
  FW: "مهاجم",
};

const posLabel = (p: string) => POSITIONS[p] ?? p;

function statusBadge(status: string): { label: string; className: string } {
  switch (status) {
    case "FIT":
      return { label: "آماده", className: "border-emerald-600/40 text-emerald-600 dark:text-emerald-400" };
    case "INJURED":
      return { label: "مصدوم", className: "border-rose-600/40 text-rose-600 dark:text-rose-400" };
    case "SUSPENDED":
      return { label: "محروم", className: "border-rose-600/40 text-rose-600 dark:text-rose-400" };
    case "DOUBTFUL":
      return { label: "مشکوک", className: "border-amber-600/40 text-amber-600 dark:text-amber-400" };
    default:
      return { label: status, className: "" };
  }
}

const profitColor = (v: number) =>
  v >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500";

/* ─────────────── Card A: شوک ترکیب T-60 ─────────────── */

function TeamShockBlock({ block }: { block: LineupShockDTO["home"] }) {
  const deltaCls =
    block.shockDelta < -0.02
      ? "border-rose-600/40 text-rose-600 dark:text-rose-400"
      : block.shockDelta > 0.02
        ? "border-emerald-600/40 text-emerald-600 dark:text-emerald-400"
        : "";
  return (
    <div className="rounded-lg border border-border p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold">{block.team}</p>
        <Badge variant="outline" className={`text-[10px] tabular-nums ${deltaCls}`} dir="ltr">
          {faPctSigned(block.shockDelta, 1)}
        </Badge>
      </div>
      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <div className="space-y-0.5">
          <p className="text-muted-foreground">VAEP ترکیب</p>
          <p className="font-bold tabular-nums" dir="ltr">{faNum(block.xiVaep, 2)}</p>
        </div>
        <div className="space-y-0.5">
          <p className="text-muted-foreground">VAEP کامل</p>
          <p className="font-bold tabular-nums" dir="ltr">{faNum(block.fullStrengthVaep, 2)}</p>
        </div>
        <div className="space-y-0.5">
          <p className="text-muted-foreground">xT ترکیب</p>
          <p className="font-bold tabular-nums" dir="ltr">{faNum(block.xiXt, 2)}</p>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        تعداد غایبان: <b className="tabular-nums">{faNum(block.unavailableCount, 0)}</b>
      </p>
      {block.missingKeyPlayers.length > 0 && (
        <ul className="space-y-1">
          {block.missingKeyPlayers.map((p, i) => {
            const st = statusBadge(p.status);
            const bad = p.status === "INJURED" || p.status === "SUSPENDED";
            return (
              <li key={`${p.name}-${i}`} className="text-[11px] flex items-center gap-1.5 flex-wrap">
                <span className="font-medium">{p.name}</span>
                <span className="text-muted-foreground">({posLabel(p.position)})</span>
                <Badge variant="outline" className={`text-[9px] px-1 py-0 ${bad ? st.className : ""}`}>
                  {st.label}
                </Badge>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function LineupShockCard({ matches }: { matches: MatchDTO[] }) {
  const [matchId, setMatchId] = useState(matches[0]?.id ?? "");
  const [running, setRunning] = useState(false);
  const [shock, setShock] = useState<LineupShockDTO | null>(null);

  const announce = useCallback(async () => {
    if (!matchId || running) return;
    setRunning(true);
    try {
      const res = await fetch("/api/lineup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId }),
      });
      const data = (await res.json()) as LineupShockDTO & { error?: string };
      if (data.success) {
        setShock(data);
        toast.success("ترکیب رسمی اعلام شد — ارزش‌گذاری VAEP/xT بازمحاسبه شد");
      } else {
        toast.error(data.error ?? "خطا در اعلام ترکیب");
      }
    } catch {
      toast.error("ارتباط با سرور برقرار نشد");
    } finally {
      setRunning(false);
    }
  }, [matchId, running]);

  const teamName = (side: "HOME" | "AWAY") =>
    side === "HOME" ? shock?.home.team ?? "میزبان" : shock?.away.team ?? "میهمان";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Shirt className="size-4 text-emerald-600 dark:text-emerald-400" />
          شوک ترکیب T-60 — ارزش‌گذاری VAEP/xT بازیکنان
        </CardTitle>
        <CardDescription className="text-xs leading-relaxed">
          اعلام رسمی ترکیب ۶۰ دقیقه قبل از بازی: غایبان کلیدی شناسایی و قدرت تیم‌ها با VAEP و xT بازیکنان بازمحاسبه می‌شود.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <Select
            value={matchId}
            onValueChange={(v) => {
              setMatchId(v);
              setShock(null);
            }}
            disabled={running}
          >
            <SelectTrigger className="w-full sm:w-72" aria-label="انتخاب بازی">
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
          <Button
            onClick={announce}
            disabled={running || !matchId}
            className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {running ? <Loader2 className="size-4 animate-spin" /> : <Megaphone className="size-4" />}
            {running ? "در حال بازمحاسبه..." : "اعلام رسمی ترکیب (شبیه‌سازی)"}
          </Button>
        </div>

        {shock?.isShock && (
          <div className="rounded-lg border border-amber-600/30 bg-amber-600/5 p-3 flex items-start gap-2">
            <AlertTriangle className="size-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed">{shock.message}</p>
          </div>
        )}
        {shock && !shock.isShock && (
          <div className="rounded-lg border border-emerald-600/25 bg-emerald-600/5 p-3 flex items-start gap-2">
            <CheckCircle2 className="size-4 text-emerald-500 shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed">{shock.message}</p>
          </div>
        )}

        {shock && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <TeamShockBlock block={shock.home} />
              <TeamShockBlock block={shock.away} />
            </div>
            <div className="max-h-96 overflow-y-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">بازیکن</TableHead>
                    <TableHead className="text-xs">تیم</TableHead>
                    <TableHead className="text-xs">پست</TableHead>
                    <TableHead className="text-xs">xT</TableHead>
                    <TableHead className="text-xs">VAEP</TableHead>
                    <TableHead className="text-xs">وضعیت</TableHead>
                    <TableHead className="text-xs">کلیدی</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shock.topPlayers.map((p, i) => {
                    const st = statusBadge(p.status);
                    return (
                      <TableRow key={`${p.name}-${i}`}>
                        <TableCell className="text-xs font-medium">{p.name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{teamName(p.side)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{posLabel(p.position)}</TableCell>
                        <TableCell className="text-xs tabular-nums" dir="ltr">{faNum(p.xT, 2)}</TableCell>
                        <TableCell className="text-xs tabular-nums" dir="ltr">{faNum(p.vaep, 2)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] ${st.className}`}>{st.label}</Badge>
                        </TableCell>
                        <TableCell>
                          {p.isKey ? (
                            <Star className="size-3.5 text-amber-500 fill-amber-500" aria-label="بازیکن کلیدی" />
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ─────────────── Card B: ایجنت پوشش زنده ─────────────── */

function LiveHedgeCard({ matches, analyses }: { matches: MatchDTO[]; analyses: Record<string, DebateResultDTO> }) {
  const [matchId, setMatchId] = useState(matches[0]?.id ?? "");
  const [selection, setSelection] = useState<"HOME" | "OVER25" | "AWAY">("HOME");
  const [odds, setOdds] = useState("2.10");
  const [stake, setStake] = useState("100");
  const [minute, setMinute] = useState(25);
  const [running, setRunning] = useState(false);
  const [pendingEvent, setPendingEvent] = useState<string | null>(null);
  const [result, setResult] = useState<LiveHedgeDTO | null>(null);

  const hasBase = Boolean(matchId && analyses[matchId]);

  // پیشنهاد ضریب عادلانه از پیش‌بینی پایه همین بازی
  useEffect(() => {
    const base = matchId ? analyses[matchId] : undefined;
    if (!base) return;
    const p = selection === "HOME" ? base.final.pHome : selection === "AWAY" ? base.final.pAway : base.final.pOver25;
    if (p > 0.01) setOdds((1 / p).toFixed(2));
  }, [matchId, selection, analyses]);

  const fire = useCallback(
    async (event: "GOAL_HOME" | "GOAL_AWAY" | "RED_HOME") => {
      if (!matchId || running) return;
      const oddsNum = parseFloat(odds);
      const stakeNum = parseFloat(stake);
      if (Number.isNaN(oddsNum) || Number.isNaN(stakeNum) || oddsNum <= 1 || stakeNum <= 0) {
        toast.error("ضریب (بیش از ۱) و مبلغ پیش‌بازی را درست وارد کنید");
        return;
      }
      setRunning(true);
      setPendingEvent(event);
      try {
        const res = await fetch("/api/live", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ matchId, minute, event, selection, odds: oddsNum, stake: stakeNum }),
        });
        const data = (await res.json()) as LiveHedgeDTO & { error?: string };
        if (data.success) {
          setResult(data);
          toast.success("سناریوی زنده شبیه‌سازی شد — احتمالات و ضرایب به‌روزرسانی شد");
        } else {
          toast.error(data.error ?? "خطا در شبیه‌سازی رویداد زنده");
        }
      } catch {
        toast.error("ارتباط با سرور برقرار نشد");
      } finally {
        setRunning(false);
        setPendingEvent(null);
      }
    },
    [matchId, running, odds, stake, minute, selection]
  );

  const probRows = result
    ? [
        { label: "برد میزبان", v: result.updatedProbs.home, bar: "bg-emerald-500" },
        { label: "مساوی", v: result.updatedProbs.draw, bar: "bg-neutral-400 dark:bg-neutral-600" },
        { label: "برد میهمان", v: result.updatedProbs.away, bar: "bg-rose-500" },
      ]
    : [];

  const liveOddsRows = result
    ? [
        { label: "برد میزبان", fair: result.fairLiveOdds.home, market: result.marketLiveOdds.home },
        { label: "مساوی", fair: result.fairLiveOdds.draw, market: result.marketLiveOdds.draw },
        { label: "برد میهمان", fair: result.fairLiveOdds.away, market: result.marketLiveOdds.away },
      ]
    : [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Shield className="size-4 text-emerald-600 dark:text-emerald-400" />
          ایجنت پوشش زنده — In-Play Hedge Trigger
        </CardTitle>
        <CardDescription className="text-xs leading-relaxed">
          رویداد زنده را شبیه‌سازی کنید؛ مدل با λ باقی‌مانده احتمالات را بازمحاسبه و سیگنال{" "}
          <span className="font-bold text-emerald-600 dark:text-emerald-400">پوشش (Hedge)</span> یا{" "}
          <span className="font-bold text-amber-600 dark:text-amber-400">نگه‌داری (Hold)</span> می‌دهد.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Select
          value={matchId}
          onValueChange={(v) => {
            setMatchId(v);
            setResult(null);
          }}
          disabled={running}
        >
          <SelectTrigger className="w-full" aria-label="انتخاب بازی">
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

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">تیپ پیش‌بازی شما</Label>
            <Select value={selection} onValueChange={(v) => setSelection(v as "HOME" | "OVER25" | "AWAY")} disabled={running}>
              <SelectTrigger className="w-full" aria-label="تیپ پیش‌بازی">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="HOME">برد میزبان</SelectItem>
                <SelectItem value="OVER25">بالای ۲.۵ گل</SelectItem>
                <SelectItem value="AWAY">برد میهمان</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="pre-odds">ضریب پیش‌بازی</Label>
            <Input
              id="pre-odds"
              value={odds}
              onChange={(e) => setOdds(e.target.value)}
              inputMode="decimal"
              dir="ltr"
              className="tabular-nums"
              disabled={running}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="pre-stake">مبلغ پیش‌بازی</Label>
            <Input
              id="pre-stake"
              value={stake}
              onChange={(e) => setStake(e.target.value)}
              inputMode="numeric"
              dir="ltr"
              className="tabular-nums"
              disabled={running}
            />
          </div>
        </div>
        {hasBase && (
          <p className="text-[10px] text-muted-foreground">
            ضریب عادلانه از پیش‌بینی پایه همین بازی پیشنهاد شد — می‌توانید دستی تغییرش دهید.
          </p>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">دقیقه رویداد</Label>
            <span className="text-xs font-bold tabular-nums" dir="ltr">{faNum(minute, 0)}′</span>
          </div>
          <Slider
            value={[minute]}
            onValueChange={(v) => setMinute(v[0] ?? 25)}
            min={5}
            max={85}
            step={1}
            disabled={running}
            aria-label="دقیقه رویداد"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Button
            onClick={() => fire("GOAL_HOME")}
            disabled={running || !matchId}
            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {pendingEvent === "GOAL_HOME" && <Loader2 className="size-4 animate-spin" />}
            گل میزبان
          </Button>
          <Button
            onClick={() => fire("GOAL_AWAY")}
            disabled={running || !matchId}
            className="gap-1.5 bg-rose-600 hover:bg-rose-700 text-white"
          >
            {pendingEvent === "GOAL_AWAY" && <Loader2 className="size-4 animate-spin" />}
            گل میهمان
          </Button>
          <Button
            onClick={() => fire("RED_HOME")}
            disabled={running || !matchId}
            className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white"
          >
            {pendingEvent === "RED_HOME" && <Loader2 className="size-4 animate-spin" />}
            کارت قرمز میزبان
          </Button>
        </div>

        {result && (
          <div className="space-y-3 rounded-lg border border-border p-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-xs font-semibold">
                نتیجه زنده: <span dir="ltr" className="tabular-nums">{result.score}</span>
              </p>
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge variant="outline" className="text-[10px]">{result.scenarioLabel}</Badge>
                <Badge variant="outline" className="text-[10px]">دقیقه {faNum(result.minute, 0)}</Badge>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground leading-relaxed">
              پیش‌بازی شما: {result.preBet.label} با ضریب{" "}
              <span dir="ltr" className="tabular-nums">{faOdds(result.preBet.odds)}</span> به مبلغ{" "}
              <b className="tabular-nums">{faNum(result.preBet.stake, 1)}</b> · گل مورد انتظار باقی‌مانده (λ):{" "}
              <span dir="ltr" className="tabular-nums">
                {faNum(result.remainingLambdas.home, 2)} — {faNum(result.remainingLambdas.away, 2)}
              </span>
            </p>

            {/* احتمالات به‌روزشده */}
            <div className="space-y-1.5">
              {probRows.map((row) => (
                <div key={row.label} className="space-y-0.5">
                  <div className="flex items-baseline justify-between text-[11px]">
                    <span>{row.label}</span>
                    <b className="tabular-nums">{faPct(row.v, 0)}</b>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full ${row.bar} transition-all duration-500`}
                      style={{ width: `${Math.max(1, Math.min(100, row.v * 100))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* ضرایب زنده */}
            <div className="space-y-1.5">
              <p className="text-xs font-semibold">ضرایب زنده</p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">بازار</TableHead>
                    <TableHead className="text-xs">عادلانه (مدل)</TableHead>
                    <TableHead className="text-xs">بازار</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {liveOddsRows.map((r) => (
                    <TableRow key={r.label}>
                      <TableCell className="text-xs font-medium">{r.label}</TableCell>
                      <TableCell className="text-xs tabular-nums" dir="ltr">{faOdds(r.fair)}</TableCell>
                      <TableCell className="text-xs tabular-nums" dir="ltr">{faOdds(r.market)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* سناریوی پوشش */}
            {result.hedge && (
              <div className="rounded-lg border border-emerald-600/25 bg-emerald-600/5 p-3 space-y-1.5">
                <p className="text-xs font-semibold">
                  سناریوی پوشش: {result.hedge.targetLabel} با ضریب{" "}
                  <span dir="ltr" className="tabular-nums">{faOdds(result.hedge.targetOdds)}</span>
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
                  <div className="space-y-0.5">
                    <p className="text-muted-foreground">مبلغ شرط مقابل</p>
                    <p className="font-bold tabular-nums" dir="ltr">{faNum(result.hedge.stake, 1)}</p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-muted-foreground">سود اگر پیش‌بازی ببرد</p>
                    <p className={`font-bold tabular-nums ${profitColor(result.hedge.profitIfPre)}`} dir="ltr">
                      {signed(result.hedge.profitIfPre)}
                      {faNum(result.hedge.profitIfPre, 1)}
                    </p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-muted-foreground">سود پس از پوشش</p>
                    <p className={`font-bold tabular-nums ${profitColor(result.hedge.profitIfHedge)}`} dir="ltr">
                      {signed(result.hedge.profitIfHedge)}
                      {faNum(result.hedge.profitIfHedge, 1)}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-2 flex-wrap">
              <Badge
                className={`text-[11px] px-3 py-1 text-white ${
                  result.recommendation === "HEDGE" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-amber-500 hover:bg-amber-600"
                }`}
              >
                {result.recommendation === "HEDGE" ? "سیگنال پوشش: شرط مقابل ببند" : "نگه‌داری — پوشش به‌صرفه نیست"}
              </Badge>
              <span className="text-[11px]">
                EV نگه‌داری:{" "}
                <b dir="ltr" className={`tabular-nums ${profitColor(result.holdEV)}`}>
                  {faPctSigned(result.holdEV)}
                </b>
              </span>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">{result.message}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ─────────────── تب اصلی ─────────────── */

interface Props {
  matches: MatchDTO[];
  analyses: Record<string, DebateResultDTO>;
}

export function LiveTab({ matches, analyses }: Props) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
      <LineupShockCard matches={matches} />
      <LiveHedgeCard matches={matches} analyses={analyses} />
    </div>
  );
}
