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
import { faNum, faPct, signed } from "@/lib/format";
import { TacticalPitch, type PitchNode } from "@/components/app/fx/tactical-pitch";
import { useQuantStore } from "@/lib/store";
import type { LineupShockDTO, LiveHedgeDTO } from "@/lib/types";

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
      return { label: "آماده", className: "border-emerald-500/40 text-emerald-400" };
    case "INJURED":
      return { label: "مصدوم", className: "border-rose-500/40 text-rose-400" };
    case "SUSPENDED":
      return { label: "محروم", className: "border-rose-500/40 text-rose-400" };
    case "DOUBTFUL":
      return { label: "مشکوک", className: "border-amber-500/40 text-amber-300" };
    default:
      return { label: status, className: "" };
  }
}

const profitColor = (v: number) => (v >= 0 ? "text-emerald-400" : "text-rose-400");

/** نودهای زمین از بازیکنان (T-60) — غایبان با نود قرمز چشمک‌زن */
function pitchNodes(topPlayers: LineupShockDTO["topPlayers"], side: "HOME" | "AWAY"): PitchNode[] {
  const HOME_FORMATION: PitchNode[] = [
    { x: 7, y: 50 }, { x: 22, y: 18 }, { x: 20, y: 39 }, { x: 20, y: 61 }, { x: 22, y: 82 },
    { x: 40, y: 30 }, { x: 37, y: 50 }, { x: 40, y: 70 },
    { x: 62, y: 22 }, { x: 66, y: 50 }, { x: 62, y: 78 },
  ];
  const AWAY_FORMATION: PitchNode[] = [
    { x: 93, y: 50 }, { x: 78, y: 18 }, { x: 80, y: 39 }, { x: 80, y: 61 }, { x: 78, y: 82 },
    { x: 60, y: 30 }, { x: 63, y: 50 }, { x: 60, y: 70 },
    { x: 38, y: 22 }, { x: 34, y: 50 }, { x: 38, y: 78 },
  ];
  const players = topPlayers.filter((p) => p.side === side);
  const formation = side === "HOME" ? HOME_FORMATION : AWAY_FORMATION;
  return formation.map((slot, i) => {
    const p = players[i];
    if (!p) return slot;
    const status: PitchNode["status"] =
      p.status === "INJURED" || p.status === "SUSPENDED" ? "MISSING" : p.status === "DOUBTFUL" ? "DOUBTFUL" : "FIT";
    return { ...slot, status, label: `${p.name} (${posLabel(p.position)}) — ${statusBadge(p.status).label}` };
  });
}

/* ─────────────── Card A: شوک ترکیب T-60 ─────────────── */

function TeamShockBlock({ block }: { block: LineupShockDTO["home"] }) {
  const deltaCls =
    block.shockDelta < -0.02
      ? "border-rose-500/40 text-rose-400"
      : block.shockDelta > 0.02
        ? "border-emerald-500/40 text-emerald-400"
        : "";
  return (
    <div className="space-y-2 rounded-lg border border-white/10 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold">{block.team}</p>
        <Badge variant="outline" className={`font-num text-[10px] ${deltaCls}`} dir="ltr">
          {(block.shockDelta * 100).toFixed(1)}%
        </Badge>
      </div>
      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <div className="space-y-0.5">
          <p className="text-muted-foreground">VAEP ترکیب</p>
          <p className="font-num font-bold" dir="ltr">{block.xiVaep.toFixed(2)}</p>
        </div>
        <div className="space-y-0.5">
          <p className="text-muted-foreground">VAEP کامل</p>
          <p className="font-num font-bold" dir="ltr">{block.fullStrengthVaep.toFixed(2)}</p>
        </div>
        <div className="space-y-0.5">
          <p className="text-muted-foreground">xT ترکیب</p>
          <p className="font-num font-bold" dir="ltr">{block.xiXt.toFixed(2)}</p>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        تعداد غایبان: <b className="font-num" dir="ltr">{block.unavailableCount}</b>
      </p>
      {block.missingKeyPlayers.length > 0 && (
        <ul className="space-y-1">
          {block.missingKeyPlayers.map((p, i) => {
            const st = statusBadge(p.status);
            const bad = p.status === "INJURED" || p.status === "SUSPENDED";
            return (
              <li key={`${p.name}-${i}`} className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="font-medium">{p.name}</span>
                <span className="text-muted-foreground">({posLabel(p.position)})</span>
                <Badge variant="outline" className={`px-1 py-0 text-[9px] ${bad ? st.className : ""}`}>
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

function LineupShockCard() {
  const matches = useQuantStore((s) => s.matches);
  const activeMatchId = useQuantStore((s) => s.activeMatchId);
  const setActiveMatchId = useQuantStore((s) => s.setActiveMatchId);
  const setShock = useQuantStore((s) => s.setShock);

  const [matchId, setMatchId] = useState("");
  const [running, setRunning] = useState(false);
  const [shock, setShockLocal] = useState<LineupShockDTO | null>(null);

  // بازی فعال از هدر → پیش‌فرض این کارت
  useEffect(() => {
    if (activeMatchId) setMatchId(activeMatchId);
  }, [activeMatchId]);

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
        setShockLocal(data);
        // زنجیره واکنشی تب ۴ → تب ۶: دلتای VAEP/xT در استور منتشر می‌شود
        setShock(matchId, data.home.shockDelta, data.away.shockDelta);
        toast.success("ترکیب رسمی اعلام شد — دلتای VAEP به موتور کمّی (تب ۶) منتقل شد", {
          description: "λ و Elo در تب ۶ بازمحاسبه می‌شوند",
        });
      } else {
        toast.error(data.error ?? "خطا در اعلام ترکیب");
      }
    } catch {
      toast.error("ارتباط با سرور برقرار نشد");
    } finally {
      setRunning(false);
    }
  }, [matchId, running, setShock]);

  const teamName = (side: "HOME" | "AWAY") =>
    side === "HOME" ? shock?.home.team ?? "میزبان" : shock?.away.team ?? "میهمان";

  const activeMatch = matches.find((m) => m.id === matchId) ?? null;

  return (
    <Card className="glass">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Shirt className="size-4 text-amber-300" />
          شوک ترکیب T-60 — ارزش‌گذاری VAEP/xT بازیکنان
        </CardTitle>
        <CardDescription className="text-xs leading-relaxed">
          اعلام رسمی ترکیب ۶۰ دقیقه قبل از بازی؛ بزرگ‌ترین ناکارآمدی بازار همین‌جاست. دلتای قدرت مستقیماً روی λ و
          الو در تب ۶ اعمال می‌شود.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          <Select
            value={matchId}
            onValueChange={(v) => {
              setMatchId(v);
              setActiveMatchId(v);
              setShockLocal(null);
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
            className="gap-2 bg-amber-600 text-white hover:bg-amber-500"
          >
            {running ? <Loader2 className="size-4 animate-spin" /> : <Megaphone className="size-4" />}
            {running ? "در حال بازمحاسبه..." : "اعلام رسمی ترکیب (شبیه‌سازی)"}
          </Button>
        </div>

        {shock?.isShock && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" />
            <p className="text-[11px] leading-relaxed">{shock.message}</p>
          </div>
        )}
        {shock && !shock.isShock && (
          <div className="flex items-start gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
            <p className="text-[11px] leading-relaxed">{shock.message}</p>
          </div>
        )}

        {activeMatch && (
          <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
            <p className="mb-2 text-[11px] text-muted-foreground">
              زمین تاکتیکی سه‌بعدی — نودهای تپنده حاضر، نودهای قرمز غایبان کلیدی
            </p>
            <TacticalPitch
              homeTeam={activeMatch.homeTeam}
              awayTeam={activeMatch.awayTeam}
              homeFieldTilt={activeMatch.homeFieldTilt}
              awayFieldTilt={activeMatch.awayFieldTilt}
              homeXg={activeMatch.homeXg}
              awayXg={activeMatch.awayXg}
              homeNodes={shock ? pitchNodes(shock.topPlayers, "HOME") : undefined}
              awayNodes={shock ? pitchNodes(shock.topPlayers, "AWAY") : undefined}
              compact
            />
          </div>
        )}

        {shock && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <TeamShockBlock block={shock.home} />
              <TeamShockBlock block={shock.away} />
            </div>
            <div className="max-h-96 overflow-y-auto rounded-md border border-white/10">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/8 hover:bg-transparent">
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
                      <TableRow key={`${p.name}-${i}`} className="border-white/6">
                        <TableCell className="text-xs font-medium">{p.name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{teamName(p.side)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{posLabel(p.position)}</TableCell>
                        <TableCell className="font-num text-xs" dir="ltr">{p.xT.toFixed(2)}</TableCell>
                        <TableCell className="font-num text-xs" dir="ltr">{p.vaep.toFixed(2)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] ${st.className}`}>{st.label}</Badge>
                        </TableCell>
                        <TableCell>
                          {p.isKey ? (
                            <Star className="size-3.5 fill-amber-400 text-amber-400" aria-label="بازیکن کلیدی" />
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

function LiveHedgeCard() {
  const matches = useQuantStore((s) => s.matches);
  const activeMatchId = useQuantStore((s) => s.activeMatchId);
  const setActiveMatchId = useQuantStore((s) => s.setActiveMatchId);
  const debates = useQuantStore((s) => s.debates);
  const analyses = debates;

  const [matchId, setMatchId] = useState("");
  const [selection, setSelection] = useState<"HOME" | "OVER25" | "AWAY">("HOME");
  const [odds, setOdds] = useState("2.10");
  const [stake, setStake] = useState("100");
  const [minute, setMinute] = useState(25);
  const [running, setRunning] = useState(false);
  const [pendingEvent, setPendingEvent] = useState<string | null>(null);
  const [result, setResult] = useState<LiveHedgeDTO | null>(null);

  useEffect(() => {
    if (activeMatchId) setMatchId(activeMatchId);
  }, [activeMatchId]);

  const hasBase = Boolean(matchId && analyses[matchId]);

  // پیشنهاد ضریب عادلانه از حکم قاضی همین بازی (زنجیره تب ۲ → تب ۴)
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
          toast.success("سناریوی زنده شبیه‌سازی شد — λ با تابع توانی ۰.۸۵ بازمحاسبه شد");
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
        { label: "مساوی", v: result.updatedProbs.draw, bar: "bg-slate-500" },
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
    <Card className="glass">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Shield className="size-4 text-emerald-400" />
          ایجنت پوشش زنده — In-Play Hedge Trigger
        </CardTitle>
        <CardDescription className="text-xs leading-relaxed">
          λ باقی‌مانده با تابع توانی استاندارد{" "}
          <span className="font-num text-cyan-300" dir="ltr">λ×((90−min)/90)^0.85</span> و اثر کارت قرمز{" "}
          <span className="font-num text-rose-300" dir="ltr">×0.68 / ×1.28</span> محاسبه می‌شود؛ سپس سیگنال{" "}
          <span className="font-bold text-emerald-400">پوشش (Hedge)</span> یا{" "}
          <span className="font-bold text-amber-300">نگه‌داری (Hold)</span> صادر می‌گردد.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Select
          value={matchId}
          onValueChange={(v) => {
            setMatchId(v);
            setActiveMatchId(v);
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

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
              className="font-num border-white/15 bg-white/5"
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
              className="font-num border-white/15 bg-white/5"
              disabled={running}
            />
          </div>
        </div>
        {hasBase && (
          <p className="text-[10px] text-muted-foreground">
            ضریب عادلانه از حکم قاضی همین بازی (تب ۲) پیشنهاد شد — می‌توانید دستی تغییرش دهید.
          </p>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">دقیقه رویداد</Label>
            <span className="font-num text-xs font-bold" dir="ltr">{minute}′</span>
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

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Button
            onClick={() => fire("GOAL_HOME")}
            disabled={running || !matchId}
            className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-500"
          >
            {pendingEvent === "GOAL_HOME" && <Loader2 className="size-4 animate-spin" />}
            گل میزبان
          </Button>
          <Button
            onClick={() => fire("GOAL_AWAY")}
            disabled={running || !matchId}
            className="gap-1.5 bg-rose-600 text-white hover:bg-rose-500"
          >
            {pendingEvent === "GOAL_AWAY" && <Loader2 className="size-4 animate-spin" />}
            گل میهمان
          </Button>
          <Button
            onClick={() => fire("RED_HOME")}
            disabled={running || !matchId}
            className="gap-1.5 bg-amber-600 text-white hover:bg-amber-500"
          >
            {pendingEvent === "RED_HOME" && <Loader2 className="size-4 animate-spin" />}
            کارت قرمز میزبان
          </Button>
        </div>

        {result && (
          <div className="space-y-3 rounded-lg border border-white/10 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold">
                نتیجه زنده: <span className="font-num" dir="ltr">{result.score}</span>
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="outline" className="text-[10px]">{result.scenarioLabel}</Badge>
                <Badge variant="outline" className="text-[10px]">دقیقه {faNum(result.minute, 0)}</Badge>
              </div>
            </div>

            <p className="text-[11px] leading-relaxed text-muted-foreground">
              پیش‌بازی شما: {result.preBet.label} با ضریب{" "}
              <span className="font-num" dir="ltr">{result.preBet.odds.toFixed(2)}</span> به مبلغ{" "}
              <b className="font-num" dir="ltr">{result.preBet.stake.toFixed(1)}</b> · گل مورد انتظار باقی‌مانده (λ):{" "}
              <span className="font-num" dir="ltr">
                {result.remainingLambdas.home.toFixed(2)} — {result.remainingLambdas.away.toFixed(2)}
              </span>
            </p>

            {/* احتمالات به‌روزشده */}
            <div className="space-y-1.5">
              {probRows.map((row) => (
                <div key={row.label} className="space-y-0.5">
                  <div className="flex items-baseline justify-between text-[11px]">
                    <span>{row.label}</span>
                    <b className="font-num">{(row.v * 100).toFixed(1)}%</b>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
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
                  <TableRow className="border-white/8 hover:bg-transparent">
                    <TableHead className="text-xs">بازار</TableHead>
                    <TableHead className="text-xs">عادلانه (مدل)</TableHead>
                    <TableHead className="text-xs">بازار</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {liveOddsRows.map((r) => (
                    <TableRow key={r.label} className="border-white/6">
                      <TableCell className="text-xs font-medium">{r.label}</TableCell>
                      <TableCell className="font-num text-xs" dir="ltr">{r.fair.toFixed(2)}</TableCell>
                      <TableCell className="font-num text-xs" dir="ltr">{r.market.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* سناریوی پوشش */}
            {result.hedge && (
              <div className="space-y-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3">
                <p className="text-xs font-semibold">
                  سناریوی پوشش: {result.hedge.targetLabel} با ضریب{" "}
                  <span className="font-num" dir="ltr">{result.hedge.targetOdds.toFixed(2)}</span>
                </p>
                <div className="grid grid-cols-1 gap-2 text-[11px] sm:grid-cols-3">
                  <div className="space-y-0.5">
                    <p className="text-muted-foreground">مبلغ شرط مقابل</p>
                    <p className="font-num font-bold" dir="ltr">{result.hedge.stake.toFixed(1)}</p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-muted-foreground">سود اگر پیش‌بازی ببرد</p>
                    <p className={`font-num font-bold ${profitColor(result.hedge.profitIfPre)}`} dir="ltr">
                      {signed(result.hedge.profitIfPre)}{Math.abs(result.hedge.profitIfPre).toFixed(1)}
                    </p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-muted-foreground">سود پس از پوشش</p>
                    <p className={`font-num font-bold ${profitColor(result.hedge.profitIfHedge)}`} dir="ltr">
                      {signed(result.hedge.profitIfHedge)}{Math.abs(result.hedge.profitIfHedge).toFixed(1)}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge
                className={`px-3 py-1 text-[11px] text-white ${
                  result.recommendation === "HEDGE" ? "bg-emerald-600 hover:bg-emerald-500" : "bg-amber-500 hover:bg-amber-600"
                }`}
              >
                {result.recommendation === "HEDGE" ? "سیگنال پوشش: شرط مقابل ببند" : "نگه‌داری — پوشش به‌صرفه نیست"}
              </Badge>
              <span className="text-[11px]">
                EV نگه‌داری:{" "}
                <b dir="ltr" className={`font-num ${profitColor(result.holdEV)}`}>
                  {signed(result.holdEV)}{Math.abs(result.holdEV).toFixed(1)}
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
  onGoToTab: (tab: string) => void;
}

export function LiveTab(_props: Props) {
  return (
    <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
      <LineupShockCard />
      <LiveHedgeCard />
    </div>
  );
}
