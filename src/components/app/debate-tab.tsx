"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  Calculator,
  CheckCircle2,
  Gavel,
  Loader2,
  Plane,
  Play,
  Scale,
  Sigma,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { faNum, faPct } from "@/lib/format";
import type { AgentBriefDTO, DebateResultDTO, MatchDTO } from "@/lib/types";

const STEPS = [
  "۱. اجرای موتور دیکسون-کولز + تعدیل باخبری/سفر/داور...",
  "۲. موتور شین: حذف حاشیه از خط Sharp پیناکل...",
  "۳. ایجنت گاو و ایجنت خرس در حال مناظره...",
  "۴. قاضی کمّی ارشد در حال وزن‌دهی نهایی...",
];

const AGENT_CONFIG = {
  BULL: {
    title: "ایجنت گاو (Bull)",
    badge: "سناریوی صعودی",
    box: "border-emerald-600/30 bg-emerald-600/5",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    badgeClass: "border-emerald-600/40 text-emerald-600 dark:text-emerald-400",
    dot: "text-emerald-500",
  },
  BEAR: {
    title: "ایجنت خرس (Bear)",
    badge: "سناریوی نزولی",
    box: "border-rose-600/30 bg-rose-600/5",
    iconColor: "text-rose-600 dark:text-rose-400",
    badgeClass: "border-rose-600/40 text-rose-600 dark:text-rose-400",
    dot: "text-rose-500",
  },
  JUDGE: {
    title: "قاضی کمّی ارشد",
    badge: "رأی نهایی",
    box: "border-violet-600/30 bg-violet-600/5",
    iconColor: "text-violet-600 dark:text-violet-400",
    badgeClass: "border-violet-600/40 text-violet-600 dark:text-violet-400",
    dot: "text-violet-500",
  },
} as const;

function AgentCard({ agent }: { agent: AgentBriefDTO }) {
  const c = AGENT_CONFIG[agent.role];
  const Icon = agent.role === "BULL" ? TrendingUp : agent.role === "BEAR" ? TrendingDown : Scale;
  return (
    <Card className={c.box}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Icon className={`size-4 ${c.iconColor}`} />
          {c.title}
        </CardTitle>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge variant="outline" className={`text-[10px] ${c.badgeClass}`}>
            {c.badge}
          </Badge>
          <Badge variant="outline" className="text-[10px] tabular-nums">
            اطمینان: {faPct(agent.confidence, 0)}
          </Badge>
          {agent.source === "ENGINE_FALLBACK" && (
            <Badge variant="outline" className="text-[10px] border-amber-600/40 text-amber-600 dark:text-amber-400">
              موتور کمّی (fallback)
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs leading-relaxed">{agent.thesis}</p>
        <ul className="space-y-1">
          {agent.arguments.map((arg, i) => (
            <li key={`${i}-${arg.slice(0, 16)}`} className="text-[11px] text-muted-foreground leading-relaxed flex gap-1.5">
              <span className={c.dot}>◆</span>
              <span>{arg}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

interface Props {
  matches: MatchDTO[];
  selectedMatchId: string | null;
  onSelectMatch: (id: string) => void;
  debates: Record<string, DebateResultDTO>;
  onDebated: (r: DebateResultDTO) => void;
}

export function DebateTab({ matches, selectedMatchId, onSelectMatch, debates, onDebated }: Props) {
  const [running, setRunning] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [result, setResult] = useState<DebateResultDTO | null>(null);
  const stepTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // اگر مناظره کش‌شده برای بازی انتخابی هست، نمایش بده
  useEffect(() => {
    if (selectedMatchId && debates[selectedMatchId]) {
      setResult(debates[selectedMatchId]);
    }
  }, [selectedMatchId, debates]);

  useEffect(() => {
    return () => {
      if (stepTimer.current) clearInterval(stepTimer.current);
    };
  }, []);

  const runDebate = useCallback(async () => {
    if (!selectedMatchId || running) return;
    setRunning(true);
    setStepIdx(0);
    stepTimer.current = setInterval(() => {
      setStepIdx((i) => Math.min(i + 1, STEPS.length - 1));
    }, 2600);

    try {
      const res = await fetch("/api/agent/debate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId: selectedMatchId }),
      });
      const data = (await res.json()) as DebateResultDTO & { error?: string };
      if (data.success) {
        setResult(data);
        onDebated(data);
        if (data.source === "ENGINE_FALLBACK") {
          toast.warning("پاسخ LLM معتبر نبود — مناظره با موتور کمّی بازسازی شد (fallback)");
        } else {
          toast.success("مناظره کامل شد و قاضی رأی نهایی را صادر کرد", {
            description: "توزیع اصلاح‌شده + حذف حاشیه شین روی خط مرجع",
          });
        }
      } else {
        toast.error(data.error ?? "خطا در اجرای مناظره");
      }
    } catch {
      toast.error("ارتباط با سرور برقرار نشد");
    } finally {
      if (stepTimer.current) clearInterval(stepTimer.current);
      setRunning(false);
    }
  }, [selectedMatchId, running, onDebated]);

  const q = result?.quantitative;
  const f = result?.final;
  const seg = (v: number) => `${Math.max(0, Math.min(100, v * 100))}%`;

  const quantStats = q
    ? [
        { label: "λ میزبان (گل مورد انتظار)", value: faNum(q.lambdaHome, 2) },
        { label: "λ میهمان (گل مورد انتظار)", value: faNum(q.lambdaAway, 2) },
        { label: "برد میزبان (موتور)", value: faPct(q.pHome, 1) },
        { label: "مساوی (موتور)", value: faPct(q.pDraw, 1) },
        { label: "برد میهمان (موتور)", value: faPct(q.pAway, 1) },
        { label: "بالای ۲.۵ گل (موتور)", value: faPct(q.pOver25, 1) },
      ]
    : [];

  const notes = q
    ? [
        { icon: Activity, color: "text-emerald-500", text: q.gamestateNote },
        { icon: Plane, color: "text-amber-500", text: q.fatigueNote },
        { icon: Gavel, color: "text-violet-500", text: q.refereeNote },
        { icon: Zap, color: "text-rose-500", text: q.lineupShockNote },
      ].filter((n) => n.text)
    : [];

  return (
    <div className="space-y-4">
      {/* کنترل اجرا */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <BrainCircuit className="size-4 text-emerald-600 dark:text-emerald-400" />
            مناظره چندایجنتی — گاو در برابر خرس
          </CardTitle>
          <CardDescription className="text-xs leading-relaxed">
            ایجنت گاو سناریوی صعودی و ایجنت خرس سناریوی نزولی می‌سازند، مناظره می‌کنند و{" "}
            <span className="font-bold text-violet-600 dark:text-violet-400">قاضی کمّی ارشد</span> با تکیه بر خط مرجع
            Sharp توزیع احتمالات نهایی را رأی می‌دهد.
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
          <Button
            onClick={runDebate}
            disabled={running || !selectedMatchId}
            className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            {running ? "در حال مناظره..." : "اجرای مناظره"}
          </Button>
          {result && !running && (
            <Badge
              variant="outline"
              className="gap-1.5 text-[11px] border-emerald-600/40 text-emerald-600 dark:text-emerald-400 w-fit"
            >
              <CheckCircle2 className="size-3" />
              مناظره آماده — اطمینان نهایی: {faPct(result.final.confidence, 0)}
            </Badge>
          )}
        </CardContent>
        {running && (
          <CardContent className="pt-0">
            <div className="rounded-lg bg-muted/60 p-3 space-y-1.5">
              {STEPS.map((s, i) => (
                <p
                  key={s}
                  className={`text-xs flex items-center gap-2 ${i <= stepIdx ? "text-foreground" : "text-muted-foreground/50"}`}
                >
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
      {result && q && f && (
        <div className="space-y-4">
          {/* سه ایجنت */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <AgentCard agent={result.bull} />
            <AgentCard agent={result.bear} />
            <AgentCard agent={result.judge} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* حکم نهایی قاضی */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Scale className="size-4 text-violet-600 dark:text-violet-400" />
                  حکم نهایی قاضی — توزیع احتمالات اصلاح‌شده (corrected)
                </CardTitle>
                <CardDescription className="text-xs">
                  {result.match.homeTeam} در برابر {result.match.awayTeam} — {result.match.league}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* نوار 1X2 */}
                <div className="space-y-2">
                  <div className="flex h-3 rounded-full overflow-hidden bg-muted" dir="ltr">
                    <div className="bg-emerald-500 transition-all duration-700" style={{ width: seg(f.pHome) }} />
                    <div className="bg-neutral-400 dark:bg-neutral-600 transition-all duration-700" style={{ width: seg(f.pDraw) }} />
                    <div className="bg-rose-500 transition-all duration-700" style={{ width: seg(f.pAway) }} />
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                    <span className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-emerald-500" />
                      برد {result.match.homeTeam}: <b className="tabular-nums">{faPct(f.pHome, 0)}</b>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-neutral-400 dark:bg-neutral-600" />
                      مساوی: <b className="tabular-nums">{faPct(f.pDraw, 0)}</b>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-rose-500" />
                      برد {result.match.awayTeam}: <b className="tabular-nums">{faPct(f.pAway, 0)}</b>
                    </span>
                  </div>
                </div>
                {/* نوار گل‌ها */}
                <div className="space-y-2">
                  <div className="flex h-3 rounded-full overflow-hidden bg-muted" dir="ltr">
                    <div className="bg-emerald-500 transition-all duration-700" style={{ width: seg(f.pOver25) }} />
                    <div className="bg-neutral-300 dark:bg-neutral-700 transition-all duration-700" style={{ width: seg(1 - f.pOver25) }} />
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                    <span className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-emerald-500" />
                      بالای ۲.۵ گل: <b className="tabular-nums">{faPct(f.pOver25, 0)}</b>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-neutral-300 dark:bg-neutral-700" />
                      زیر ۲.۵ گل: <b className="tabular-nums">{faPct(1 - f.pOver25, 0)}</b>
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-[11px] border-violet-600/40 text-violet-600 dark:text-violet-400">
                    اطمینان نهایی: {faPct(f.confidence, 0)}
                  </Badge>
                  <Badge variant="outline" className="text-[11px]">
                    منبع: {result.source === "LLM" ? "مناظره LLM" : "موتور کمّی (fallback)"}
                  </Badge>
                </div>
                {f.calibrationApplied && (
                  <div className="rounded-lg border border-amber-600/30 bg-amber-600/5 p-2.5 flex items-start gap-2">
                    <AlertTriangle className="size-3.5 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-[11px] leading-relaxed">
                      تعدیل کالیبراسیون سیستمی روی توزیع نهایی اعمال شد: {f.calibrationApplied}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* پایه کمّی */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Sigma className="size-4 text-emerald-600 dark:text-emerald-400" />
                  پایه کمّی و تعدیل‌های زمینه‌ای
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {quantStats.map((s) => (
                    <div key={s.label} className="rounded-lg border border-border p-2.5 space-y-1">
                      <p className="text-[10px] text-muted-foreground leading-tight">{s.label}</p>
                      <p className="text-sm font-bold tabular-nums" dir="ltr">
                        {s.value}
                      </p>
                    </div>
                  ))}
                </div>
                {notes.length > 0 && (
                  <>
                    <Separator />
                    <div className="space-y-1.5">
                      {notes.map((n) => (
                        <div key={n.text} className="flex items-start gap-2 text-[11px] text-muted-foreground leading-relaxed">
                          <n.icon className={`size-3.5 shrink-0 mt-0.5 ${n.color}`} />
                          <span>{n.text}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* موتور شین */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Calculator className="size-4 text-emerald-600 dark:text-emerald-400" />
                موتور شین — حذف حاشیه بوک‌میکرها (De-Vig)
              </CardTitle>
              <CardDescription className="text-xs">
                خط مرجع Sharp مبنای کالیبره‌سازی توزیع نهایی قاضی است
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">بوک‌میکر</TableHead>
                    <TableHead className="text-xs">حاشیه</TableHead>
                    <TableHead className="text-xs">برد</TableHead>
                    <TableHead className="text-xs">مساوی</TableHead>
                    <TableHead className="text-xs">برد میهمان</TableHead>
                    <TableHead className="text-xs">z شین</TableHead>
                    <TableHead className="text-xs">k توان</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.devig.map((row) => (
                    <TableRow key={row.bookmaker} className={row.sharp ? "bg-emerald-600/5" : ""}>
                      <TableCell className="text-xs font-medium">
                        <span className="flex items-center gap-1.5">
                          {row.bookmakerLabel}
                          {row.sharp && <Badge className="text-[9px] px-1 py-0 bg-emerald-600 text-white">خط مرجع Sharp</Badge>}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs tabular-nums" dir="ltr">
                        {faPct(row.marginPct / 100, 1)}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums" dir="ltr">
                        {faPct(row.shinProbs.home, 1)}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums" dir="ltr">
                        {faPct(row.shinProbs.draw, 1)}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums" dir="ltr">
                        {faPct(row.shinProbs.away, 1)}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums" dir="ltr">
                        {faNum(row.shinZ, 3)}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums" dir="ltr">
                        {faNum(row.powerK, 3)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="mt-3 text-[10px] text-muted-foreground leading-relaxed">
                تقسیم ساده احتمالات سوگیری Favorite-Longshot دارد؛ مدل شین سهم معامله‌گران آگاه (z) را جدا می‌کند.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {!result && !running && (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            یک بازی انتخاب کنید و «اجرای مناظره» را بزنید تا ایجنت گاو و ایجنت خرس مناظره کنند و قاضی کمّی رأی نهایی را صادر کند.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
