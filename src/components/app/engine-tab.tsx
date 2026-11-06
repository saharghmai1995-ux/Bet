"use client";

import { useMemo, useState } from "react";
import { Calculator, Goal, Info } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { runDixonColes } from "@/lib/engine/poisson";
import { faNum, faOdds, faPct } from "@/lib/format";

interface ParamDef {
  key: keyof Params;
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  fmt?: (v: number) => string;
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
  { key: "homeDefense", label: "ضعف تدافعی میزبان", hint: "کمتر = دفاع بهتر (برابر ضریب گل خورده نسبت به میانگین)", min: 0.5, max: 1.8, step: 0.01 },
  { key: "awayDefense", label: "ضعف تدافعی میهمان", hint: "کمتر = دفاع بهتر", min: 0.5, max: 1.8, step: 0.01 },
  { key: "leagueAvg", label: "میانگین گل لیگ", hint: "میانگین گل هر تیم در هر بازی", min: 0.9, max: 2.2, step: 0.01 },
  { key: "homeAdvantage", label: "ضریب میزبانی", hint: "اثر استادیوم، سفر و هوادار", min: 1, max: 1.35, step: 0.005 },
  { key: "rho", label: "پارامتر ρ دیکسون-کولز", hint: "همبستگی نتایج کم‌گل (۰-۰، ۱-۰، ۰-۱، ۱-۱)", min: -0.2, max: 0.2, step: 0.01 },
  { key: "eloDiff", label: "اختلاف الو", hint: "الوی میزبان منهای میهمان (بعد از تعدیل غیبت‌ها)", min: -400, max: 400, step: 5 },
  { key: "eloWeight", label: "وزن اثر الو", hint: "چقدر اختلاف الو روی امید گل اثر بگذارد", min: 0, max: 1, step: 0.05 },
  { key: "homeAbsenceImpact", label: "غیبت کلیدی میزبان", hint: "کسر خلاقیت در صورت غیبت پلی‌میکر/مهاجم اصلی", min: 0, max: 0.5, step: 0.05 },
  { key: "awayAbsenceImpact", label: "غیبت کلیدی میهمان", hint: "کسر خلاقیت میهمان", min: 0, max: 0.5, step: 0.05 },
];

const DEFAULTS: Params = {
  homeAttack: 1.62,
  awayAttack: 1.28,
  homeDefense: 0.84,
  awayDefense: 0.98,
  leagueAvg: 1.35,
  homeAdvantage: 1.12,
  rho: -0.08,
  eloDiff: 120,
  eloWeight: 0.35,
  homeAbsenceImpact: 0,
  awayAbsenceImpact: 0.1,
};

const MATRIX_N = 6; // نمایش ۰ تا ۵ گل

export function EngineTab() {
  const [params, setParams] = useState<Params>(DEFAULTS);

  const result = useMemo(() => {
    return runDixonColes({
      ...params,
      timeDecayXi: 0.0065,
      daysAgo: 60,
    });
  }, [params]);

  const maxCell = useMemo(() => {
    let m = 0;
    for (let h = 0; h < MATRIX_N; h++) for (let a = 0; a < MATRIX_N; a++) m = Math.max(m, result.matrix[h][a]);
    return m;
  }, [result]);

  const setParam = (key: keyof Params, value: number) => setParams((p) => ({ ...p, [key]: value }));

  const market = [
    { name: `برد میزبان`, p: result.pHome, fair: 1 / result.pHome },
    { name: "مساوی", p: result.pDraw, fair: 1 / result.pDraw },
    { name: "برد میهمان", p: result.pAway, fair: 1 / result.pAway },
    { name: "بالای ۲.۵ گل", p: result.pOver25, fair: 1 / result.pOver25 },
    { name: "زیر ۲.۵ گل", p: result.pUnder25, fair: 1 / result.pUnder25 },
    { name: "هر دو گل می‌زنند", p: result.pBtts, fair: 1 / result.pBtts },
  ];

  return (
    <TooltipProvider delayDuration={200}>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* کنترل‌ها */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Calculator className="size-4 text-violet-600 dark:text-violet-400" />
              پارامترهای موتور کمّی
            </CardTitle>
            <CardDescription className="text-xs">
              مدل دیکسون-کولز + پواسون دو متغیره — تغییر زنده پارامترها
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 max-h-[560px] overflow-y-auto">
            {PARAMS.map((p) => (
              <div key={p.key} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <Label className="text-xs">{p.label}</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="size-3 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs max-w-52">
                        {p.hint}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <span className="text-xs font-semibold tabular-nums text-violet-600 dark:text-violet-400" dir="ltr">
                    {p.key === "eloDiff" ? faNum(params.eloDiff, 0) : faNum(params[p.key] as number, 2)}
                  </span>
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
        <div className="lg:col-span-3 space-y-4">
          {/* امید گل */}
          <div className="grid grid-cols-2 gap-3">
            <Card className="p-4 border-emerald-600/25 bg-emerald-600/5">
              <p className="text-xs text-muted-foreground mb-1">امید گل (λ) میزبان</p>
              <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums" dir="ltr">
                {result.lambdaHome.toFixed(2)}
              </p>
            </Card>
            <Card className="p-4 border-amber-600/25 bg-amber-600/5">
              <p className="text-xs text-muted-foreground mb-1">امید گل (λ) میهمان</p>
              <p className="text-3xl font-bold text-amber-600 dark:text-amber-400 tabular-nums" dir="ltr">
                {result.lambdaAway.toFixed(2)}
              </p>
            </Card>
          </div>

          {/* بازارها */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">احتمالات بازارها و ضرایب عادلانه</CardTitle>
              <CardDescription className="text-xs">
                احتمال واقعی مدل در برابر ضریب بدون حاشیه — اگر ضریب سایت بالاتر از ضریب عادلانه باشد، +EV داریم
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {market.map((m) => (
                <div key={m.name} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">{m.name}</span>
                    <span className="text-muted-foreground tabular-nums" dir="ltr">
                      {faPct(m.p)} · عادلانه: {faOdds(m.fair)}
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-l from-emerald-500 to-emerald-600 transition-all duration-300"
                      style={{ width: `${Math.min(100, m.p * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* ماتریس نمره */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Goal className="size-4 text-emerald-600 dark:text-emerald-400" />
                ماتریس نمره احتمالاتی
              </CardTitle>
              <CardDescription className="text-xs">
                احتمال دقیق هر نتیجه با تصحیح دیکسون-کولز — رنگ تیره‌تر = احتمال بیشتر
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${MATRIX_N + 1}, minmax(0, 1fr))` }}>
                <div></div>
                {Array.from({ length: MATRIX_N }).map((_, a) => (
                  <div key={`h-${a}`} className="text-center text-[10px] text-muted-foreground">
                    {faNum(a, 0)}
                  </div>
                ))}
                {Array.from({ length: MATRIX_N }).map((_, h) => (
                  <div key={`r-${h}`} className="contents">
                    <div className="flex items-center justify-center text-[10px] text-muted-foreground">
                      {faNum(h, 0)}
                    </div>
                    {Array.from({ length: MATRIX_N }).map((_, a) => {
                      const p = result.matrix[h][a];
                      const intensity = p / maxCell;
                      return (
                        <div
                          key={`c-${h}-${a}`}
                          className="aspect-square rounded flex items-center justify-center text-[10px] font-medium tabular-nums border border-border/40"
                          style={{
                            backgroundColor:
                              h > a
                                ? `rgba(16, 185, 129, ${0.08 + intensity * 0.75})`
                                : h === a
                                  ? `rgba(168, 162, 158, ${0.08 + intensity * 0.6})`
                                  : `rgba(245, 158, 11, ${0.08 + intensity * 0.75})`,
                          }}
                          title={`احتمال نتیجه ${h}-${a}: ${(p * 100).toFixed(1)}٪`}
                        >
                          {p > 0.012 ? faPct(p, 1).replace("٪", "") : ""}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-3 mt-3 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-emerald-500" /> برد میزبان</span>
                <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-stone-400" /> مساوی</span>
                <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-amber-500" /> برد میهمان</span>
                <span className="mr-auto flex items-center gap-1"><Badge variant="outline" className="text-[10px]">{faNum(result.lambdaHome + result.lambdaAway, 2)} گل مورد انتظار کل</Badge></span>
              </div>
            </CardContent>
          </Card>

          {/* سناریوها */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">توزیع سناریوهای بازی</CardTitle>
              <CardDescription className="text-xs">سناریوهای متقابل مستثنی — مجموع ۱۰۰٪</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { name: "بازی بسته کم‌گل", p: result.scenarioClosed },
                { name: "برد پرگل میزبان", p: result.scenarioOpenHome },
                { name: "برد پرگل میهمان", p: result.scenarioOpenAway },
                { name: "تساوی پرگل و سایر", p: result.scenarioOther },
              ].map((s) => (
                <div key={s.name} className="rounded-lg border border-border p-3 text-center">
                  <p className="text-lg font-bold tabular-nums">{faPct(s.p, 1)}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{s.name}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </TooltipProvider>
  );
}
