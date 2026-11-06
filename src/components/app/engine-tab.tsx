"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Calculator, Goal, Info, Link2, Send, Zap } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { runDixonColes } from "@/lib/engine/poisson";
import {
  basketProb,
  fairOddsFrom,
  jointLossProb,
  p1xOver25Cells,
  P1X_UNDER25_CELLS,
  defaultCoveringBaskets,
} from "@/lib/engine/betbuilder";
import { Matrix3D, type MatrixView, type SelectMode } from "@/components/app/fx/matrix3d";
import { AnimNum } from "@/components/app/fx/anim-num";
import { useQuantStore } from "@/lib/store";
import { toast } from "sonner";

interface ParamDef {
  key: keyof Params;
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
}

interface Params {
  homeAttack: number;
  awayAttack: number;
  homeDefense: number;
  awayDefense: number;
  leagueAvg: number;
  homeAdvantage: number;
  rho: number;
  eloDiff: number;
  eloWeight: number;
  homeAbsenceImpact: number;
  awayAbsenceImpact: number;
}

const PARAMS: ParamDef[] = [
  { key: "homeAttack", label: "قدرت تهاجمی میزبان", hint: "ضریب گلزنی نسبت به میانگین لیگ (۱ = میانگین)", min: 0.5, max: 2.2, step: 0.01 },
  { key: "awayAttack", label: "قدرت تهاجمی میهمان", hint: "ضریب گلزنی نسبت به میانگین لیگ", min: 0.5, max: 2.2, step: 0.01 },
  { key: "homeDefense", label: "ضعف تدافعی میزبان", hint: "کمتر = دفاع بهتر", min: 0.5, max: 1.8, step: 0.01 },
  { key: "awayDefense", label: "ضعف تدافعی میهمان", hint: "کمتر = دفاع بهتر", min: 0.5, max: 1.8, step: 0.01 },
  { key: "leagueAvg", label: "میانگین گل لیگ", hint: "میانگین گل هر تیم در هر بازی", min: 0.9, max: 2.2, step: 0.01 },
  { key: "homeAdvantage", label: "ضریب میزبانی", hint: "اثر استادیوم، سفر و هوادار", min: 1, max: 1.35, step: 0.005 },
  { key: "rho", label: "پارامتر ρ دیکسون-کولز", hint: "همبستگی نتایج کم‌گل (۰-۰، ۱-۰، ۰-۱، ۱-۱)", min: -0.2, max: 0.2, step: 0.01 },
  { key: "eloDiff", label: "اختلاف الو (تعدیل‌شده با T-60)", hint: "الوی میزبان منهای میهمان — شوک ترکیب روی الو هم اثر می‌گذارد", min: -400, max: 400, step: 5 },
  { key: "eloWeight", label: "وزن اثر الو", hint: "چقدر اختلاف الو روی امید گل اثر بگذارد", min: 0, max: 1, step: 0.05 },
  { key: "homeAbsenceImpact", label: "غیبت کلیدی میزبان", hint: "کسر خلاقیت در صورت غیبت پلی‌میکر/مهاجم اصلی", min: 0, max: 0.5, step: 0.05 },
  { key: "awayAbsenceImpact", label: "غیبت کلیدی میهمان", hint: "کسر خلاقیت میهمان", min: 0, max: 0.5, step: 0.05 },
];

const MATRIX_N = 6;

function paramsFromMatch(match: DEFAULT_SOURCE, shock: { home: number; away: number } | null): Params {
  // شوک T-60 → دلتای VAEP/xT روی حمله و الو اعمال می‌شود (زنجیره واکنشی تب ۴ → تب ۶)
  const clampShock = (s: number) => Math.max(-0.5, Math.min(0.15, s));
  const sh = shock ? clampShock(shock.home) : 0;
  const sa = shock ? clampShock(shock.away) : 0;
  return {
    homeAttack: match.homeAttack * (1 + sh),
    awayAttack: match.awayAttack * (1 + sa),
    homeDefense: match.homeDefense,
    awayDefense: match.awayDefense,
    leagueAvg: 1.35,
    homeAdvantage: 1.12,
    rho: -0.08,
    eloDiff: Math.max(-400, Math.min(400, match.homeElo - match.awayElo - (sh - sa) * 300)),
    eloWeight: 0.35,
    homeAbsenceImpact: match.homeAbsence ? 0.08 : 0,
    awayAbsenceImpact: match.awayAbsence ? 0.08 : 0,
  };
}

// نوع کمکی — فقط فیلدهای لازم از MatchDTO
type DEFAULT_SOURCE = {
  homeAttack: number;
  awayAttack: number;
  homeDefense: number;
  awayDefense: number;
  homeElo: number;
  awayElo: number;
  homeAbsence: string | null;
  awayAbsence: string | null;
};

interface Props {
  onGoToTab: (tab: string) => void;
}

export function EngineTab({ onGoToTab }: Props) {
  const matches = useQuantStore((s) => s.matches);
  const activeMatchId = useQuantStore((s) => s.activeMatchId);
  const publishEngine = useQuantStore((s) => s.publishEngine);
  const sendToDutching = useQuantStore((s) => s.sendToDutching);
  const activeMatch = matches.find((m) => m.id === activeMatchId) ?? null;
  const shock = useQuantStore((s) => (activeMatchId ? s.shockByMatch[activeMatchId] : undefined));

  const [params, setParams] = useState<Params>(() =>
    paramsFromMatch(
      {
        homeAttack: 1.62,
        awayAttack: 1.28,
        homeDefense: 0.84,
        awayDefense: 0.98,
        homeElo: 1750,
        awayElo: 1630,
        homeAbsence: null,
        awayAbsence: null,
      },
      null
    )
  );
  const [view, setView] = useState<MatrixView>("3D");
  const [selectMode, setSelectMode] = useState<SelectMode>("a");
  const [slips, setSlips] = useState<{ a: Set<string>; b: Set<string> }>({ a: new Set(), b: new Set() });

  // زنجیره واکنشی: تغییر بازی فعال یا اعلام شوک T-60 → بازنشانی پارامترها با دلتای VAEP
  const matchKey = `${activeMatchId}-${shock?.announcedAt ?? 0}`;
  useEffect(() => {
    if (!activeMatch) return;
    setParams(paramsFromMatch(activeMatch, shock ? { home: shock.home, away: shock.away } : null));
    setSlips({ a: new Set(), b: new Set() });
  }, [matchKey]);

  const result = useMemo(() => {
    return runDixonColes({
      ...params,
      timeDecayXi: 0.0065,
      daysAgo: 60,
    });
  }, [params]);

  // انتشار موتور به استور — مبنای تب ۲ و ۳ (زنجیره واکنشی تب ۶ → تب ۲)
  useEffect(() => {
    if (!activeMatchId) return;
    publishEngine({
      matchId: activeMatchId,
      lambdaHome: result.lambdaHome,
      lambdaAway: result.lambdaAway,
      pHome: result.pHome,
      pDraw: result.pDraw,
      pAway: result.pAway,
      pOver25: result.pOver25,
      pUnder25: result.pUnder25,
      pBtts: result.pBtts,
      matrix6: result.matrix.slice(0, MATRIX_N).map((row) => row.slice(0, MATRIX_N)),
      shockApplied: shock ? { home: shock.home, away: shock.away } : null,
      updatedAt: Date.now(),
    });
  }, [result, activeMatchId, shock?.announcedAt]);

  const setParam = (key: keyof Params, value: number) => setParams((p) => ({ ...p, [key]: value }));

  const onCellClick = useCallback(
    (key: string) => {
      if (!selectMode) {
        toast.info("اول حالت انتخاب را مشخص کنید: تیپ اول (آبی) یا تیپ دوم (سبز)");
        return;
      }
      setSlips((prev) => {
        const other = selectMode === "a" ? prev.b : prev.a;
        const current = selectMode === "a" ? prev.a : prev.b;
        const next = new Set(current);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return selectMode === "a" ? { a: next, b: other } : { a: other, b: next };
      });
    },
    [selectMode]
  );

  // ─── محاسبات زنده سازنده تیپ مکمل از خانه‌های ماتریس ───
  const cellsA = useMemo(() => [...slips.a], [slips.a]);
  const cellsB = useMemo(() => [...slips.b], [slips.b]);
  const pA = useMemo(() => basketProb(result.matrix, cellsA), [result, cellsA]);
  const pB = useMemo(() => basketProb(result.matrix, cellsB), [result, cellsB]);
  const pLose = useMemo(() => jointLossProb(result.matrix, cellsA, cellsB), [result, cellsA, cellsB]);
  const oddsA = pA > 0 ? fairOddsFrom(pA) : 0;
  const oddsB = pB > 0 ? fairOddsFrom(pB) : 0;
  const impliedSum = oddsA > 0 && oddsB > 0 ? 1 / oddsA + 1 / oddsB : 0;

  const fillDefault = () => {
    const def = defaultCoveringBaskets();
    setSlips({ a: new Set(def.a), b: new Set(def.b) });
    toast.success("سبد مکمل پیش‌فرض پر شد: 1X + بالای ۲.۵ در برابر 1X + زیر ۲.۵", {
      description: "تا وقتی میزبان نبازد دقیقاً یکی از دو تیپ برنده است",
    });
  };

  const sendToCalc = () => {
    if (!activeMatchId || pA <= 0 || pB <= 0) {
      toast.error("اول حداقل یک خانه برای هر تیپ انتخاب کنید");
      return;
    }
    if (pLose > 0.999) {
      toast.warning("احتمال باخت همزمان تقریباً صددرصد است — سبد مکمل نیست");
      return;
    }
    sendToDutching({
      matchId: activeMatchId,
      matchLabel: activeMatch ? `${activeMatch.homeTeam} — ${activeMatch.awayTeam}` : "",
      labelA: `تیپ ۱ ماتریس (${cellsA.length} خانه · ${oddsA.toFixed(2)})`,
      labelB: `تیپ ۲ ماتریس (${cellsB.length} خانه · ${oddsB.toFixed(2)})`,
      probA: pA,
      probB: pB,
      cellsA,
      cellsB,
      sentAt: Date.now(),
    });
    toast.success("سبد به ماشین‌حساب داچینگ (تب ۳) ارسال شد", {
      description: `ضرایب عادلانه ${oddsA.toFixed(2)} و ${oddsB.toFixed(2)} — باخت همزمان ${(pLose * 100).toFixed(1)}%`,
    });
    onGoToTab("risk");
  };

  const market = [
    { name: "برد میزبان", p: result.pHome, fair: 1 / result.pHome },
    { name: "مساوی", p: result.pDraw, fair: 1 / result.pDraw },
    { name: "برد میهمان", p: result.pAway, fair: 1 / result.pAway },
    { name: "بالای ۲.۵ گل", p: result.pOver25, fair: 1 / result.pOver25 },
    { name: "زیر ۲.۵ گل", p: result.pUnder25, fair: 1 / result.pUnder25 },
    { name: "هر دو گل می‌زنند", p: result.pBtts, fair: 1 / result.pBtts },
  ];

  const shockActive = shock && (shock.home !== 0 || shock.away !== 0);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* کنترل‌ها */}
        <Card className="glass lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Calculator className="size-4 text-cyan-300" />
              پارامترهای موتور کمّی
            </CardTitle>
            <CardDescription className="text-xs">
              {activeMatch ? (
                <>مقداردهی اولیه از «{activeMatch.homeTeam} — {activeMatch.awayTeam}» + شوک T-60</>
              ) : (
                <>مدل دیکسون-کولز — بازی فعالی از هدر انتخاب کنید تا پارامترها خودکار پر شوند</>
              )}
            </CardDescription>
            {shockActive && (
              <div className="flex items-center gap-2 rounded-lg border border-amber-500/35 bg-amber-500/8 p-2">
                <Zap className="size-4 shrink-0 text-amber-400" />
                <div className="text-[11px] leading-relaxed">
                  <b className="text-amber-300">شوک ترکیب T-60 فعال:</b>{" "}
                  دلتای VAEP میزبان{" "}
                  <b className="font-num text-amber-200" dir="ltr">{(shock!.home * 100).toFixed(0)}%</b> / میهمان{" "}
                  <b className="font-num text-amber-200" dir="ltr">{(shock!.away * 100).toFixed(0)}%</b> — روی حمله و
                  الو لحاظ شد.{" "}
                  <button className="underline" onClick={() => onGoToTab("live")}>
                    مدیریت در تب ۴
                  </button>
                </div>
              </div>
            )}
          </CardHeader>
          <CardContent className="max-h-[560px] space-y-4 overflow-y-auto">
            {PARAMS.map((p) => (
              <div key={p.key} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <Label className="text-xs">{p.label}</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="size-3 cursor-help text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-52 text-xs">
                        {p.hint}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <AnimNum
                    value={params[p.key] as number}
                    decimals={p.key === "eloDiff" ? 0 : 2}
                    className="text-xs font-semibold text-cyan-300"
                  />
                </div>
                <Slider
                  value={[params[p.key] as number]}
                  min={p.min}
                  max={p.max}
                  step={p.step}
                  onValueChange={(v) => setParam(p.key, v[0])}
                  aria-label={p.label}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* نتایج */}
        <div className="space-y-4 lg:col-span-3">
          {/* امید گل */}
          <div className="grid grid-cols-2 gap-3">
            <Card className="glass border-emerald-500/20 p-4">
              <p className="mb-1 text-xs text-muted-foreground">امید گل (λ) میزبان</p>
              <AnimNum value={result.lambdaHome} decimals={2} className="text-3xl font-bold text-emerald-400" />
            </Card>
            <Card className="glass border-amber-500/20 p-4">
              <p className="mb-1 text-xs text-muted-foreground">امید گل (λ) میهمان</p>
              <AnimNum value={result.lambdaAway} decimals={2} className="text-3xl font-bold text-amber-300" />
            </Card>
          </div>

          {/* ماتریس سه‌بعدی + سازنده تعاملی */}
          <Card className="glass">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Goal className="size-4 text-emerald-400" />
                ماتریس نمره احتمالاتی ۶×۶ — نمای برجسته سه‌بعدی
              </CardTitle>
              <CardDescription className="text-xs">
                ارتفاع هر ستون کریستالی = احتمال آن نتیجه — خانه‌ها را برای ساخت دو تیپ مکمل انتخاب کنید
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Matrix3D
                matrix={result.matrix}
                n={MATRIX_N}
                view={view}
                onViewChange={setView}
                selectMode={selectMode}
                onSelectModeChange={setSelectMode}
                selectedA={slips.a}
                selectedB={slips.b}
                onCellClick={onCellClick}
              />

              {/* خروجی زنده سازنده تیپ مکمل */}
              <div className="mt-4 space-y-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-lg border border-cyan-500/25 bg-cyan-500/5 p-2.5 text-center">
                    <p className="text-[10px] text-muted-foreground">احتمال تیپ اول</p>
                    <p className="font-num text-base font-bold text-cyan-300" dir="ltr">
                      {(pA * 100).toFixed(1)}%
                    </p>
                  </div>
                  <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-2.5 text-center">
                    <p className="text-[10px] text-muted-foreground">احتمال تیپ دوم</p>
                    <p className="font-num text-base font-bold text-emerald-300" dir="ltr">
                      {(pB * 100).toFixed(1)}%
                    </p>
                  </div>
                  <div className="rounded-lg border border-white/10 p-2.5 text-center">
                    <p className="text-[10px] text-muted-foreground">ضریب عادلانه</p>
                    <p className="font-num text-base font-bold" dir="ltr">
                      {oddsA > 0 ? oddsA.toFixed(2) : "—"} / {oddsB > 0 ? oddsB.toFixed(2) : "—"}
                    </p>
                  </div>
                  <div className={`rounded-lg border p-2.5 text-center ${pLose < 0.02 && slips.a.size > 0 && slips.b.size > 0 ? "border-emerald-500/40 bg-emerald-500/10" : "border-rose-500/30 bg-rose-500/5"}`}>
                    <p className="text-[10px] text-muted-foreground">احتمال باخت همزمان</p>
                    <p className={`font-num text-base font-bold ${pLose < 0.02 ? "text-emerald-300" : "text-rose-400"}`} dir="ltr">
                      {(pLose * 100).toFixed(1)}%
                    </p>
                  </div>
                </div>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  احتمال هر تیپ = جمع دقیق خانه‌های انتخابی ماتریس (بدون فرض استقلال) · باخت همزمان = مجموع خانه‌های
                  انتخاب‌نشده · مجموع معکوس ضرایب:{" "}
                  <span className="font-num" dir="ltr">{impliedSum > 0 ? impliedSum.toFixed(3) : "—"}</span>
                  {impliedSum > 0 && impliedSum < 1 ? (
                    <b className="text-emerald-400"> &lt; 1 ✓ سود تضمینی {((1 - impliedSum) * 100).toFixed(1)}%</b>
                  ) : impliedSum >= 1 ? (
                    <b className="text-rose-400"> ≥ 1 ✗</b>
                  ) : null}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" className="h-8 gap-1.5 border-white/15 text-[11px]" onClick={fillDefault}>
                    <Goal className="size-3.5" /> پرکردن خودکار مکمل (1X × بالای/زیر ۲.۵)
                  </Button>
                  <Button
                    size="sm"
                    className="h-8 gap-1.5 bg-cyan-600 text-[11px] text-white hover:bg-cyan-500"
                    onClick={sendToCalc}
                    disabled={!activeMatchId}
                  >
                    <Send className="size-3.5" /> ارسال به ماشین‌حساب داچینگ (تب ۳)
                    <ArrowLeft className="size-3.5" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* بازارها */}
          <Card className="glass">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">احتمالات بازارها و ضرایب عادلانه</CardTitle>
              <CardDescription className="text-xs">
                اگر ضریب سایت بالاتر از ضریب عادلانه باشد، +EV داریم — این توزیع به تب ۲ (مناظره) منتقل می‌شود
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {market.map((m) => (
                <div key={m.name} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">{m.name}</span>
                    <span className="font-num text-muted-foreground" dir="ltr">
                      {(m.p * 100).toFixed(1)}% · Fair {m.fair.toFixed(2)}
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-white/8">
                    <div
                      className="h-full rounded-full bg-gradient-to-l from-emerald-500 to-cyan-500 transition-all duration-300"
                      style={{ width: `${Math.min(100, m.p * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* سناریوها */}
          <Card className="glass">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Link2 className="size-4 text-violet-300" />
                توزیع سناریوهای بازی
              </CardTitle>
              <CardDescription className="text-xs">سناریوهای متقابل مستثنی — مجموع ۱۰۰٪</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { name: "بازی بسته کم‌گل", p: result.scenarioClosed },
                { name: "برد پرگل میزبان", p: result.scenarioOpenHome },
                { name: "برد پرگل میهمان", p: result.scenarioOpenAway },
                { name: "تساوی پرگل و سایر", p: result.scenarioOther },
              ].map((s) => (
                <div key={s.name} className="rounded-lg border border-white/10 p-3 text-center">
                  <AnimNum value={s.p * 100} decimals={1} suffix="%" className="text-lg font-bold" />
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{s.name}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </TooltipProvider>
  );
}
