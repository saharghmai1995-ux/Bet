"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  Calculator,
  CheckCircle2,
  Gavel,
  Link2,
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
import { faNum } from "@/lib/format";
import { PulseFlow, type FlowNode } from "@/components/app/fx/pulse-flow";
import { AnimNum } from "@/components/app/fx/anim-num";
import { useQuantStore } from "@/lib/store";
import type { AgentBriefDTO, DebateResultDTO } from "@/lib/types";

const STEPS = [
  "۱. اجرای موتور دیکسون-کولز + تعدیل باخبری/سفر/داور...",
  "۲. موتور شین: حذف حاشیه از خط Sharp پیناکل (۲۰ گام Bisection)...",
  "۳. ایجنت گاو و ایجنت خرس در حال مناظره...",
  "۴. قاضی کمّی ارشد در حال وزن‌دهی نهایی...",
];

const DEBATE_FLOW: FlowNode[] = [
  { icon: Calculator, label: "پایه کمّی (تب ۶)", color: "text-cyan-300", glow: "#06b6d4" },
  { icon: TrendingUp, label: "ایجنت گاو", color: "text-emerald-300", glow: "#10b981" },
  { icon: TrendingDown, label: "ایجنت خرس", color: "text-rose-300", glow: "#f43f5e" },
  { icon: Scale, label: "قاضی کمّی ارشد", color: "text-violet-300", glow: "#8b5cf6" },
];

const AGENT_CONFIG = {
  BULL: {
    title: "ایجنت گاو (Bull)",
    badge: "سناریوی صعودی",
    box: "border-emerald-500/25",
    iconColor: "text-emerald-400",
    badgeClass: "border-emerald-500/40 text-emerald-400",
    dot: "text-emerald-500",
  },
  BEAR: {
    title: "ایجنت خرس (Bear)",
    badge: "سناریوی نزولی",
    box: "border-rose-500/25",
    iconColor: "text-rose-400",
    badgeClass: "border-rose-500/40 text-rose-400",
    dot: "text-rose-500",
  },
  JUDGE: {
    title: "قاضی کمّی ارشد",
    badge: "رأی نهایی",
    box: "border-violet-500/25",
    iconColor: "text-violet-300",
    badgeClass: "border-violet-500/40 text-violet-300",
    dot: "text-violet-500",
  },
} as const;

function AgentCard({ agent }: { agent: AgentBriefDTO }) {
  const c = AGENT_CONFIG[agent.role];
  const Icon = agent.role === "BULL" ? TrendingUp : agent.role === "BEAR" ? TrendingDown : Scale;
  return (
    <Card className={`glass ${c.box}`}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Icon className={`size-4 ${c.iconColor}`} />
          {c.title}
        </CardTitle>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className={`text-[10px] ${c.badgeClass}`}>
            {c.badge}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            اطمینان: <span dir="ltr" className="tabular-nums">{Math.round(agent.confidence * 100)}</span>٪
          </Badge>
          {agent.source === "ENGINE_FALLBACK" && (
            <Badge variant="outline" className="border-amber-500/40 text-[10px] text-amber-300">
              موتور کمّی (fallback)
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs leading-relaxed">{agent.thesis}</p>
        <ul className="space-y-1">
          {agent.arguments.map((arg, i) => (
            <li key={`${i}-${arg.slice(0, 16)}`} className="flex gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
              <span className={`${c.dot} mt-1.5 inline-block size-1.5 shrink-0 rounded-full bg-current`} />
              <span>{arg}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

interface Props {
  onDebated: (r: DebateResultDTO) => void;
  onGoToTab: (tab: string) => void;
}

export function DebateTab({ onDebated, onGoToTab }: Props) {
  // از استور سراسری — بازی فعال و پایه کمّی تب ۶
  const matches = useQuantStore((s) => s.matches);
  const selectedMatchId = useQuantStore((s) => s.activeMatchId);
  const onSelectMatch = useQuantStore((s) => s.setActiveMatchId);
  const debates = useQuantStore((s) => s.debates);
  const enginePub = useQuantStore((s) => (selectedMatchId ? s.engineByMatch[selectedMatchId] : undefined));
  const shock = useQuantStore((s) => (selectedMatchId ? s.shockByMatch[selectedMatchId] : undefined));

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
            description: "حکم قاضی به تب ۳ (پرتفوی مکمل) منتقل شد",
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
        { label: "λ میزبان (گل مورد انتظار)", value: q.lambdaHome },
        { label: "λ میهمان (گل مورد انتظار)", value: q.lambdaAway },
        { label: "برد میزبان (موتور)", value: null, pct: q.pHome },
        { label: "مساوی (موتور)", value: null, pct: q.pDraw },
        { label: "برد میهمان (موتور)", value: null, pct: q.pAway },
        { label: "بالای ۲.۵ گل (موتور)", value: null, pct: q.pOver25 },
      ]
    : [];

  const notes = q
    ? [
        { icon: Activity, color: "text-emerald-400", text: q.gamestateNote },
        { icon: Plane, color: "text-amber-300", text: q.fatigueNote },
        { icon: Gavel, color: "text-violet-300", text: q.refereeNote },
        { icon: Zap, color: "text-rose-400", text: q.lineupShockNote },
      ].filter((n) => n.text)
    : [];

  return (
    <div className="space-y-4">
      {/* کنترل اجرا */}
      <Card className="glass">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <BrainCircuit className="size-4 text-emerald-400" />
            مناظره چندایجنتی — گاو در برابر خرس
          </CardTitle>
          <CardDescription className="text-xs leading-relaxed">
            ایجنت گاو سناریوی صعودی و ایجنت خرس سناریوی نزولی می‌سازند؛{" "}
            <span className="font-bold text-violet-300">قاضی کمّی ارشد</span> با تکیه بر خط مرجع Sharp توزیع نهایی را
            رأی می‌دهد و به تب ۳ (پرتفوی) منتقل می‌کند.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
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
            className="gap-2 bg-emerald-600 text-white hover:bg-emerald-500"
          >
            {running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            {running ? "در حال مناظره..." : "اجرای مناظره"}
          </Button>
          {result && !running && (
            <Badge variant="outline" className="w-fit gap-1.5 border-emerald-500/40 text-[11px] text-emerald-400">
              <CheckCircle2 className="size-3" />
              مناظره آماده — اطمینان نهایی: <span dir="ltr" className="tabular-nums">{Math.round((f?.confidence ?? 0) * 100)}</span>٪
            </Badge>
          )}
        </CardContent>
        {running && (
          <CardContent className="pt-0">
            <div className="space-y-1.5 rounded-lg bg-white/5 p-3">
              {STEPS.map((s, i) => (
                <p
                  key={s}
                  className={`flex items-center gap-2 text-xs ${i <= stepIdx ? "text-foreground" : "text-muted-foreground/50"}`}
                >
                  {i < stepIdx ? (
                    <CheckCircle2 className="size-3.5 text-emerald-500" />
                  ) : i === stepIdx ? (
                    <Loader2 className="size-3.5 animate-spin text-emerald-500" />
                  ) : (
                    <span className="size-3.5 rounded-full border border-white/15" />
                  )}
                  {s}
                </p>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      {/* پایه کمّی منتقل‌شده از تب ۶ (زنجیره واکنشی) */}
      {enginePub && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-cyan-500/25 bg-cyan-500/5 px-3 py-2 text-[11px]">
          <Link2 className="size-3.5 text-cyan-400" />
          <span className="text-cyan-200">پایه کمّی زنده از تب ۶:</span>
          <span className="text-cyan-100" dir="ltr">
            λH <span className="tabular-nums">{enginePub.lambdaHome.toFixed(2)}</span> · λA{" "}
            <span className="tabular-nums">{enginePub.lambdaAway.toFixed(2)}</span> · P(H){" "}
            <span className="tabular-nums">{(enginePub.pHome * 100).toFixed(1)}%</span>
          </span>
          {enginePub.shockApplied && (enginePub.shockApplied.home !== 0 || enginePub.shockApplied.away !== 0) ? (
            <Badge className="border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-300" variant="outline">
              <Zap className="size-3" />
              شوک T-60 لحاظ شد
            </Badge>
          ) : shock ? (
            <button className="text-amber-300 underline" onClick={() => onGoToTab("engine")}>
              شوک T-60 اعلام شده — ماتریس را در تب ۶ بروزرسانی کنید
            </button>
          ) : (
            <button className="text-cyan-300/80 underline" onClick={() => onGoToTab("engine")}>
              رفتن به موتور کمّی
            </button>
          )}
        </div>
      )}

      {/* نتیجه */}
      {result && q && f && (
        <div className="space-y-4">
          {/* جریان مناظره با پالس نوری */}
          <Card className="glass">
            <CardContent className="py-3">
              <PulseFlow nodes={DEBATE_FLOW} />
            </CardContent>
          </Card>

          {/* سه ایجنت */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <AgentCard agent={result.bull} />
            <AgentCard agent={result.bear} />
            <AgentCard agent={result.judge} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* حکم نهایی قاضی */}
            <Card className="glass">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Scale className="size-4 text-violet-300" />
                  حکم نهایی قاضی — توزیع اصلاح‌شده
                </CardTitle>
                <CardDescription className="text-xs">
                  {result.match.homeTeam} در برابر {result.match.awayTeam} — {result.match.league}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex h-3 overflow-hidden rounded-full bg-white/8" dir="ltr">
                    <div className="bg-emerald-500 transition-all duration-700" style={{ width: seg(f.pHome) }} />
                    <div className="bg-slate-500 transition-all duration-700" style={{ width: seg(f.pDraw) }} />
                    <div className="bg-rose-500 transition-all duration-700" style={{ width: seg(f.pAway) }} />
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                    <span className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-emerald-500" />
                      برد {result.match.homeTeam}: <b><span dir="ltr" className="tabular-nums">{(f.pHome * 100).toFixed(1)}</span>٪</b>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-slate-500" />
                      مساوی: <b><span dir="ltr" className="tabular-nums">{(f.pDraw * 100).toFixed(1)}</span>٪</b>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-rose-500" />
                      برد {result.match.awayTeam}: <b><span dir="ltr" className="tabular-nums">{(f.pAway * 100).toFixed(1)}</span>٪</b>
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex h-3 overflow-hidden rounded-full bg-white/8" dir="ltr">
                    <div className="bg-emerald-500 transition-all duration-700" style={{ width: seg(f.pOver25) }} />
                    <div className="bg-slate-600 transition-all duration-700" style={{ width: seg(1 - f.pOver25) }} />
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                    <span className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-emerald-500" />
                      بالای ۲.۵ گل: <b><span dir="ltr" className="tabular-nums">{(f.pOver25 * 100).toFixed(1)}</span>٪</b>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-slate-600" />
                      زیر ۲.۵ گل: <b><span dir="ltr" className="tabular-nums">{((1 - f.pOver25) * 100).toFixed(1)}</span>٪</b>
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="border-violet-500/40 text-[11px] text-violet-300">
                    اطمینان نهایی: <span dir="ltr" className="tabular-nums">{Math.round(f.confidence * 100)}</span>٪
                  </Badge>
                  <Badge variant="outline" className="text-[11px]">
                    منبع: {result.source === "LLM" ? "مناظره LLM" : "موتور کمّی (fallback)"}
                  </Badge>
                </div>
                {f.calibrationApplied && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-400" />
                    <p className="text-[11px] leading-relaxed">
                      تعدیل کالیبراسیون سیستمی روی توزیع نهایی اعمال شد: {f.calibrationApplied}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* پایه کمّی */}
            <Card className="glass">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Sigma className="size-4 text-emerald-400" />
                  پایه کمّی و تعدیل‌های زمینه‌ای
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                  {quantStats.map((s) => (
                    <div key={s.label} className="space-y-1 rounded-lg border border-white/10 p-2.5">
                      <p className="text-[10px] leading-tight text-muted-foreground">{s.label}</p>
                      {s.value !== null && s.value !== undefined ? (
                        <AnimNum value={s.value} decimals={2} className="text-sm font-bold text-cyan-300" />
                      ) : (
                        <AnimNum value={(s.pct ?? 0) * 100} decimals={1} suffix="%" className="text-sm font-bold text-emerald-300" />
                      )}
                    </div>
                  ))}
                </div>
                {notes.length > 0 && (
                  <>
                    <Separator className="bg-white/8" />
                    <div className="space-y-1.5">
                      {notes.map((n) => (
                        <div key={n.text} className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
                          <n.icon className={`mt-0.5 size-3.5 shrink-0 ${n.color}`} />
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
          <Card className="glass">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Calculator className="size-4 text-cyan-300" />
                موتور شین — حذف حاشیه بوک‌میکرها (z با ۲۰ گام Bisection برای هر خط)
              </CardTitle>
              <CardDescription className="text-xs">
                پارامتر z هر بوک‌میکر جداگانه حل می‌شود تا مجموع احتمالات شین دقیقاً 1.000 شود
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-white/8 hover:bg-transparent">
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
                    <TableRow key={row.bookmaker} className={row.sharp ? "border-cyan-500/20 bg-cyan-500/5" : "border-white/6"}>
                      <TableCell className="text-xs font-medium">
                        <span className="flex items-center gap-1.5">
                          {row.bookmakerLabel}
                          {row.sharp && <Badge className="bg-cyan-600 px-1 py-0 text-[9px] text-white">خط مرجع Sharp</Badge>}
                        </span>
                      </TableCell>
                      <TableCell className="font-num text-xs" dir="ltr">{(row.marginPct * 100).toFixed(2)}%</TableCell>
                      <TableCell className="font-num text-xs" dir="ltr">{(row.shinProbs.home * 100).toFixed(1)}%</TableCell>
                      <TableCell className="font-num text-xs" dir="ltr">{(row.shinProbs.draw * 100).toFixed(1)}%</TableCell>
                      <TableCell className="font-num text-xs" dir="ltr">{(row.shinProbs.away * 100).toFixed(1)}%</TableCell>
                      <TableCell className="font-num text-xs text-cyan-300" dir="ltr">{row.shinZ.toFixed(4)}</TableCell>
                      <TableCell className="font-num text-xs" dir="ltr">{row.powerK.toFixed(3)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
                تقسیم ساده احتمالات سوگیری Favorite-Longshot دارد؛ مدل شین سهم معامله‌گران آگاه (z) را جدا می‌کند.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {!result && !running && (
        <Card className="glass border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            یک بازی انتخاب کنید و «اجرای مناظره» را بزنید تا ایجنت گاو و ایجنت خرس مناظره کنند و قاضی کمّی رأی نهایی را صادر کند.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
