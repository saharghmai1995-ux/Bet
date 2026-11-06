"use client";

import { useCallback, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Coins,
  Grid2x2,
  Inbox,
  Loader2,
  Scale,
  ShieldCheck,
  Sparkles,
  Wand2,
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
import { dutchAllocate, type DutchStrategy } from "@/lib/engine/dutching";
import { equalProfitSplit } from "@/lib/engine/betbuilder";
import { TiltSlip } from "@/components/app/fx/tilt-slip";
import { useQuantStore } from "@/lib/store";
import type { PortfolioResultDTO, RiskResultDTO } from "@/lib/types";
import { PortfolioCard } from "@/components/app/portfolio-card";

const STRATEGY_INFO: Record<DutchStrategy, { label: string; desc: string }> = {
  EQUAL_PROFIT: { label: "سود برابر", desc: "برد هر تیپ → سود یکسان (مثال جدول: ۶۰/۴۰ ← +۲۰)" },
  HEDGE_MAIN: { label: "بیمه سرمایه", desc: "برد تیپ اصلی → سود بیشتر؛ برد تیپ دوم → برگشت کل پول" },
  AGGRESSIVE: { label: "تهاجمی", desc: "برد تیپ اصلی → برگشت پول؛ برد تیپ دوم → سود حداکثری" },
};

interface Props {
  onGoToTab: (tab: string) => void;
}

export function RiskTab({ onGoToTab }: Props) {
  // ─── استور سراسری ───
  const matches = useQuantStore((s) => s.matches);
  const debates = useQuantStore((s) => s.debates);
  const activeMatchId = useQuantStore((s) => s.activeMatchId);
  const dutchingPayload = useQuantStore((s) => s.dutchingPayload);
  const bankroll = useQuantStore((s) => s.bankroll);
  const setBankroll = useQuantStore((s) => s.setBankroll);

  // ─── الف: ماشین‌حساب داچینگ (پیش‌فرض از ارسال تب ۶) ───
  const [odds1, setOdds1] = useState(2.0);
  const [odds2, setOdds2] = useState(3.0);
  const [calcStrategy, setCalcStrategy] = useState<DutchStrategy>("EQUAL_PROFIT");

  // پیش‌فرض‌های ۲.۰/۳.۰ — نمونه استاندارد تیپ مکمل
  const calc = useMemo(() => {
    if (odds1 < 1.01 || odds2 < 1.01 || bankroll <= 0) return null;
    return dutchAllocate(
      [
        { label: "تیپ اول", odds: odds1 },
        { label: "تیپ دوم", odds: odds2 },
      ],
      bankroll,
      calcStrategy
    );
  }, [odds1, odds2, bankroll, calcStrategy]);

  // تحلیل +EV برای انتخاب تیپ دارای نوار نوری
  const ev1 = dutchingPayload ? dutchingPayload.probA * odds1 - 1 : 0;
  const ev2 = dutchingPayload ? dutchingPayload.probB * odds2 - 1 : 0;
  const slip1Better = ev1 >= ev2;

  // ─── ب: سازنده تیپ مکمل (API) ───
  const [matchId, setMatchId] = useState<string | null>(null);
  const [secondMatchId, setSecondMatchId] = useState<string | null>(null);
  const [mode, setMode] = useState<"SINGLE_MATCH" | "TWO_MATCH">("SINGLE_MATCH");
  const [strategy, setStrategy] = useState<DutchStrategy>("EQUAL_PROFIT");
  const [building, setBuilding] = useState(false);
  const [riskResult, setRiskResult] = useState<RiskResultDTO | null>(null);

  const buildTips = useCallback(async () => {
    const target = matchId ?? activeMatchId;
    if (!target) {
      toast.error("اول یک بازی انتخاب کنید");
      return;
    }
    setBuilding(true);
    try {
      // تحلیل از حکم مناظره (تب ۲) یا اجرای خودکار ایجنت تحلیلگر
      const debate = debates[target];
      let analysisId: string | undefined;
      if (debate) {
        // مناظره موجود است — تحلیل آن در DB ذخیره شده
        const res = await fetch("/api/agent/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ matchId: target }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error ?? "تحلیل ناموفق بود");
        analysisId = data.analysis.id;
      } else {
        const res = await fetch("/api/agent/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ matchId: target }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error ?? "تحلیل ناموفق بود");
        analysisId = data.analysis.id;
      }

      const res = await fetch("/api/agent/risk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisId, bankroll, strategy, mode, secondMatchId }),
      });
      const data = await res.json();
      if (data.success) {
        setRiskResult(data);
        toast.success("دو تیپ مکمل ساخته شد", { description: data.trap.title });
      } else {
        toast.error(data.error ?? "خطا در ساخت تیپ‌ها");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ارتباط با سرور برقرار نشد");
    } finally {
      setBuilding(false);
    }
  }, [matchId, activeMatchId, debates, bankroll, strategy, mode, secondMatchId]);

  const payload = dutchingPayload;
  const split = useMemo(() => {
    if (!payload || odds1 < 1.01 || odds2 < 1.01 || bankroll <= 0) return null;
    return equalProfitSplit(odds1, odds2, bankroll);
  }, [payload, odds1, odds2, bankroll]);

  return (
    <div className="space-y-4">
      {/* ─── موتور پرتفوی: مونت‌کارلو کاپولا + کلِی همزمان ─── */}
      <PortfolioCard onGoToDebate={() => onGoToTab("debate")} />

      {/* ─── سبد ارسالی از ماتریس تب ۶ (زنجیره واکنشی) ─── */}
      {payload && split ? (
        <Card className="glass">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Inbox className="size-4 text-cyan-300" />
              سبد دریافتی از ماتریس تب ۶ — {payload.matchLabel}
            </CardTitle>
            <CardDescription className="text-xs">
              احتمال‌ها با جمع دقیق خانه‌های ماتریس دیکسون-کولز محاسبه شده‌اند (همبستگی درون‌بازی لحاظ شد)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* تیپ اول — 3D Tilt */}
              <TiltSlip beam={slip1Better} beamColor="#06b6d4" ariaLabel="تیپ اول">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-cyan-300">{payload.labelA}</p>
                    {slip1Better && (
                      <Badge className="border-cyan-400/50 bg-cyan-500/15 text-[9px] text-cyan-300" variant="outline">
                        <Sparkles className="mr-1 inline size-2.5" /> بالاترین +EV
                      </Badge>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground" dir="ltr">{payload.cellsA.slice(0, 8).join(" · ")}{payload.cellsA.length > 8 ? " …" : ""}</p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-white/5 p-2">
                      <p className="text-[9px] text-muted-foreground">احتمال</p>
                      <p className="font-num text-sm font-bold text-cyan-300" dir="ltr">{(payload.probA * 100).toFixed(1)}%</p>
                    </div>
                    <div className="rounded-lg bg-white/5 p-2">
                      <p className="text-[9px] text-muted-foreground">ضریب</p>
                      <Input
                        type="number"
                        step="0.05"
                        min="1.01"
                        value={odds1}
                        onChange={(e) => setOdds1(parseFloat(e.target.value) || 0)}
                        className="h-7 border-white/15 bg-white/5 text-center font-num text-sm"
                        dir="ltr"
                        aria-label="ضریب تیپ اول"
                      />
                    </div>
                    <div className="rounded-lg bg-white/5 p-2">
                      <p className="text-[9px] text-muted-foreground">EV</p>
                      <p className={`font-num text-sm font-bold ${ev1 > 0 ? "text-emerald-400" : "text-rose-400"}`} dir="ltr">
                        {(ev1 * 100).toFixed(1)}%
                      </p>
                    </div>
                  </div>
                </div>
              </TiltSlip>

              {/* تیپ دوم — 3D Tilt */}
              <TiltSlip beam={!slip1Better} beamColor="#10b981" ariaLabel="تیپ دوم">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-emerald-300">{payload.labelB}</p>
                    {!slip1Better && (
                      <Badge className="border-emerald-400/50 bg-emerald-500/15 text-[9px] text-emerald-300" variant="outline">
                        <Sparkles className="mr-1 inline size-2.5" /> بالاترین +EV
                      </Badge>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground" dir="ltr">{payload.cellsB.slice(0, 8).join(" · ")}{payload.cellsB.length > 8 ? " …" : ""}</p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-white/5 p-2">
                      <p className="text-[9px] text-muted-foreground">احتمال</p>
                      <p className="font-num text-sm font-bold text-emerald-300" dir="ltr">{(payload.probB * 100).toFixed(1)}%</p>
                    </div>
                    <div className="rounded-lg bg-white/5 p-2">
                      <p className="text-[9px] text-muted-foreground">ضریب</p>
                      <Input
                        type="number"
                        step="0.05"
                        min="1.01"
                        value={odds2}
                        onChange={(e) => setOdds2(parseFloat(e.target.value) || 0)}
                        className="h-7 border-white/15 bg-white/5 text-center font-num text-sm"
                        dir="ltr"
                        aria-label="ضریب تیپ دوم"
                      />
                    </div>
                    <div className="rounded-lg bg-white/5 p-2">
                      <p className="text-[9px] text-muted-foreground">EV</p>
                      <p className={`font-num text-sm font-bold ${ev2 > 0 ? "text-emerald-400" : "text-rose-400"}`} dir="ltr">
                        {(ev2 * 100).toFixed(1)}%
                      </p>
                    </div>
                  </div>
                </div>
              </TiltSlip>
            </div>

            {/* تخصیص سود برابر */}
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3" dir="ltr">
              <p className="font-num text-[11px] leading-relaxed text-cyan-100">
                S = 1/{odds1.toFixed(2)} + 1/{odds2.toFixed(2)} = {split.impliedSum.toFixed(3)}{" "}
                {split.impliedSum < 1 ? (
                  <span className="font-bold text-emerald-400">&lt; 1 ✓ guaranteed +{(split.guaranteedMargin * 100).toFixed(1)}%</span>
                ) : (
                  <span className="font-bold text-rose-400">&gt; 1 ✗ no lock</span>
                )}
              </p>
              <p className="font-num mt-1 text-[11px] leading-relaxed text-emerald-200">
                Stake: {split.stakeA.toFixed(1)} + {split.stakeB.toFixed(1)} of {bankroll} → profit each{" "}
                {split.profitEach > 0 ? "+" : ""}
                {split.profitEach.toFixed(1)}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="glass border-dashed">
          <CardContent className="flex items-center gap-3 py-5 text-xs text-muted-foreground">
            <Inbox className="size-4 text-cyan-400" />
            در تب ۶ (موتور احتمالات) خانه‌های ماتریس را برای دو تیپ انتخاب و «ارسال به ماشین‌حساب داچینگ» را بزنید — سبد اینجا با کارت سه‌بعدی ظاهر می‌شود.
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* ─── الف: ماشین‌حساب داچینگ ─── */}
        <Card className="glass">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Scale className="size-4 text-amber-300" />
              ماشین‌حساب داچینگ (Dutching)
            </CardTitle>
            <CardDescription className="text-xs">
              تقسیم سرمایه بین دو تیپ مکمل — نمونه پیش‌فرض: ضرایب ۲.۰ و ۳.۰
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">ضریب تیپ اول</Label>
                <Input
                  type="number"
                  step="0.05"
                  min="1.01"
                  value={odds1}
                  onChange={(e) => setOdds1(parseFloat(e.target.value) || 0)}
                  className="border-white/15 bg-white/5 font-num"
                  dir="ltr"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">ضریب تیپ دوم</Label>
                <Input
                  type="number"
                  step="0.05"
                  min="1.01"
                  value={odds2}
                  onChange={(e) => setOdds2(parseFloat(e.target.value) || 0)}
                  className="border-white/15 bg-white/5 font-num"
                  dir="ltr"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">کل بودجه</Label>
                <Input
                  type="number"
                  min="1"
                  value={bankroll}
                  onChange={(e) => setBankroll(parseFloat(e.target.value) || 0)}
                  className="border-white/15 bg-white/5 font-num"
                  dir="ltr"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {(Object.keys(STRATEGY_INFO) as DutchStrategy[]).map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={calcStrategy === s ? "default" : "outline"}
                  className={`h-8 text-[11px] ${calcStrategy === s ? "bg-amber-600 text-white hover:bg-amber-500" : "border-white/15"}`}
                  onClick={() => setCalcStrategy(s)}
                >
                  {STRATEGY_INFO[s].label}
                </Button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">{STRATEGY_INFO[calcStrategy].desc}</p>

            {calc && (
              <>
                <div
                  className={`flex items-start gap-2 rounded-lg border p-3 text-xs ${
                    calc.arbitrageFree ? "border-emerald-500/30 bg-emerald-500/5" : "border-rose-500/30 bg-rose-500/5"
                  }`}
                >
                  {calc.arbitrageFree ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                  ) : (
                    <XCircle className="mt-0.5 size-4 shrink-0 text-rose-500" />
                  )}
                  <div className="font-num text-[11px] leading-relaxed" dir="ltr">
                    1/{odds1.toFixed(2)} + 1/{odds2.toFixed(2)} = {calc.impliedSum.toFixed(3)}{" "}
                    {calc.arbitrageFree ? (
                      <span className="font-bold text-emerald-400">
                        &lt; 1 ✓ lock {calc.guaranteedMargin ? (calc.guaranteedMargin * 100).toFixed(1) : 0}%
                      </span>
                    ) : (
                      <span className="font-bold text-rose-400">&gt; 1 ✗</span>
                    )}
                  </div>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow className="border-white/8 hover:bg-transparent">
                      <TableHead className="text-xs">سناریو</TableHead>
                      <TableHead className="text-xs">مبلغ شرط</TableHead>
                      <TableHead className="text-xs">بازگشت</TableHead>
                      <TableHead className="text-xs">سود خالص</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow className="border-white/6">
                      <TableCell className="text-xs">برد تیپ اول ({odds1.toFixed(2)})</TableCell>
                      <TableCell className="font-num text-xs" dir="ltr">{calc.stakes[0].toFixed(1)}</TableCell>
                      <TableCell className="font-num text-xs" dir="ltr">{calc.returns[0].toFixed(1)}</TableCell>
                      <TableCell className={`font-num text-xs font-bold ${calc.profits[0] > 0 ? "text-emerald-400" : "text-muted-foreground"}`} dir="ltr">
                        {calc.profits[0] >= 0 ? "+" : "−"}{Math.abs(calc.profits[0]).toFixed(1)}
                      </TableCell>
                    </TableRow>
                    <TableRow className="border-white/6">
                      <TableCell className="text-xs">برد تیپ دوم ({odds2.toFixed(2)})</TableCell>
                      <TableCell className="font-num text-xs" dir="ltr">{calc.stakes[1].toFixed(1)}</TableCell>
                      <TableCell className="font-num text-xs" dir="ltr">{calc.returns[1].toFixed(1)}</TableCell>
                      <TableCell className={`font-num text-xs font-bold ${calc.profits[1] > 0 ? "text-emerald-400" : "text-muted-foreground"}`} dir="ltr">
                        {calc.profits[1] >= 0 ? "+" : "−"}{Math.abs(calc.profits[1]).toFixed(1)}
                      </TableCell>
                    </TableRow>
                    <TableRow className="border-white/6">
                      <TableCell className="text-xs text-muted-foreground">باخت هر دو</TableCell>
                      <TableCell className="font-num text-xs text-rose-400" dir="ltr">−{bankroll.toFixed(0)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">0</TableCell>
                      <TableCell className="font-num text-xs font-bold text-rose-400" dir="ltr">−{bankroll.toFixed(0)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
                <p className="text-[10px] text-muted-foreground">
                  ⚠ سود تضمینی فقط وقتی معنا دارد که دو تیپ «مکمل واقعی» باشند و حداقل یکی حتماً ببرد (بخش ب ↓)
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* ─── ب: سازنده تیپ مکمل ─── */}
        <Card className="glass">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Wand2 className="size-4 text-emerald-400" />
              ایجنت ریسک — سازنده تیپ‌های مکمل
            </CardTitle>
            <CardDescription className="text-xs leading-relaxed">
              پایه مشترک امن (Banker: 1X) + متغیر دوگانه (بالای/زیر ۲.۵) → تا وقتی میزبان نبازد،{" "}
              <b className="text-emerald-400">هر دو تیپ نمی‌بازند</b> — در حالت تک‌بازی احتمال‌ها از ماتریس
              دیکسون-کولز محاسبه می‌شوند
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">بازی پایه (Banker — پیش‌فرض: بازی فعال)</Label>
              <Select value={matchId ?? activeMatchId ?? ""} onValueChange={setMatchId}>
                <SelectTrigger aria-label="انتخاب بازی پایه" className="w-full">
                  <SelectValue placeholder="بازی پایه را انتخاب کنید..." />
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

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">حالت ساخت</Label>
                <Select value={mode} onValueChange={(v) => setMode(v as "SINGLE_MATCH" | "TWO_MATCH")}>
                  <SelectTrigger aria-label="حالت ساخت" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SINGLE_MATCH">تک‌بازی (Bet Builder همبسته)</SelectItem>
                    <SelectItem value="TWO_MATCH">میکس دو بازی (Cross-Hedge)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {mode === "TWO_MATCH" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">بازی متغیر (گل)</Label>
                  <Select value={secondMatchId ?? ""} onValueChange={setSecondMatchId}>
                    <SelectTrigger aria-label="بازی دوم" className="w-full">
                      <SelectValue placeholder="بازی دوم..." />
                    </SelectTrigger>
                    <SelectContent>
                      {matches
                        .filter((m) => m.id !== (matchId ?? activeMatchId))
                        .map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.homeTeam} — {m.awayTeam}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">کل بودجه این دور</Label>
                <Input
                  type="number"
                  min="1"
                  value={bankroll}
                  onChange={(e) => setBankroll(parseFloat(e.target.value) || 0)}
                  className="border-white/15 bg-white/5 font-num"
                  dir="ltr"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">استراتژی تخصیص</Label>
                <Select value={strategy} onValueChange={(v) => setStrategy(v as DutchStrategy)}>
                  <SelectTrigger aria-label="استراتژی" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(STRATEGY_INFO) as DutchStrategy[]).map((s) => (
                      <SelectItem key={s} value={s}>
                        {STRATEGY_INFO[s].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button
              onClick={buildTips}
              disabled={building || !(matchId ?? activeMatchId)}
              className="w-full gap-2 bg-emerald-600 text-white hover:bg-emerald-500"
            >
              {building ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
              {building ? "ایجنت ریسک در حال ساخت..." : "ساخت دو تیپ مکمل + تخصیص سرمایه"}
            </Button>

            {riskResult && (
              <div className="space-y-3 pt-1">
                <Separator className="bg-white/8" />
                {/* banker */}
                <div className="space-y-1 rounded-lg border border-white/10 p-3">
                  <div className="flex items-center justify-between">
                    <p className="flex items-center gap-1.5 text-xs font-semibold">
                      <Grid2x2 className="size-3.5 text-violet-400" /> شرط پایه مشترک (Banker)
                    </p>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${riskResult.banker.baseSafe ? "border-emerald-500/40 text-emerald-400" : "text-amber-300"}`}
                    >
                      {riskResult.banker.baseSafe ? "امن (≥۷۲٪)" : "پرریسک (<۷۲٪)"}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {riskResult.banker.match} — {riskResult.banker.marketName} با ضریب{" "}
                    <b className="font-num" dir="ltr">{riskResult.banker.odds.toFixed(2)}</b> · احتمال{" "}
                    <b className="font-num" dir="ltr">{(riskResult.banker.prob * 100).toFixed(1)}%</b>
                  </p>
                </div>

                {/* تیپ‌ها — کارت سه‌بعدی */}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {riskResult.tips.map((t, idx) => (
                    <TiltSlip
                      key={t.id}
                      beam={idx === 0}
                      beamColor={idx === 0 ? "#06b6d4" : "#f59e0b"}
                      ariaLabel={t.label}
                    >
                      <div className="space-y-1.5">
                        <p className={`text-xs font-bold ${idx === 0 ? "text-cyan-300" : "text-amber-300"}`}>{t.label}</p>
                        {t.legs.map((l) => (
                          <p key={l.selection + l.market} className="text-[11px] text-muted-foreground">
                            • {l.match}:{" "}
                            <b className="text-foreground">
                              {l.selection === "HOME_OR_DRAW" ? "1X" : l.selection === "OVER_2_5" ? "بالای ۲.۵" : "زیر ۲.۵"}
                            </b>{" "}
                            (<span className="font-num" dir="ltr">{l.odds.toFixed(2)}</span>)
                          </p>
                        ))}
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-muted-foreground">ضریب کل</span>
                          <b className="font-num" dir="ltr">{t.totalOdds.toFixed(2)}</b>
                        </div>
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-muted-foreground">مبلغ شرط</span>
                          <b className="font-num" dir="ltr">{t.stake.toFixed(1)}</b>
                        </div>
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-muted-foreground">برد →</span>
                          <b className={`font-num ${t.profitIfWin > 0 ? "text-emerald-400" : "text-muted-foreground"}`} dir="ltr">
                            {t.profitIfWin > 0 ? "+" : ""}{t.profitIfWin.toFixed(1)}
                          </b>
                        </div>
                        <p className="text-[9px] text-muted-foreground">
                          P(برد) دقیق ماتریس: <span className="font-num" dir="ltr">{((t.prob ?? 0) * 100).toFixed(1)}%</span>
                        </p>
                      </div>
                    </TiltSlip>
                  ))}
                </div>

                {/* یادداشت ماتریس دقیق */}
                {(riskResult as { exactMatrixNote?: string }).exactMatrixNote && (
                  <div className="flex items-start gap-2 rounded-lg border border-cyan-500/25 bg-cyan-500/5 p-2.5">
                    <Sparkles className="mt-0.5 size-3.5 shrink-0 text-cyan-400" />
                    <p className="text-[11px] leading-relaxed text-cyan-100">
                      {(riskResult as { exactMatrixNote?: string }).exactMatrixNote}
                    </p>
                  </div>
                )}

                {/* ریاضیات پوشش */}
                <div className="space-y-1.5 rounded-lg border border-white/10 bg-white/[0.03] p-3" dir="ltr">
                  <p className="font-num text-[11px] leading-relaxed">
                    S = 1/{riskResult.tips[0].totalOdds.toFixed(2)} + 1/{riskResult.tips[1].totalOdds.toFixed(2)} ={" "}
                    {riskResult.dutching.impliedSum.toFixed(3)} {riskResult.dutching.arbitrageFree ? "< 1 ✓" : "> 1 ✗"}
                  </p>
                  <p className="font-num text-[11px] leading-relaxed">
                    P(both lose) = {riskResult.dutching.bothLoseProb.toFixed(3)} · margin ={" "}
                    {(riskResult.dutching.guaranteedMargin * 100).toFixed(1)}%
                  </p>
                </div>

                {/* حکم تله */}
                <div
                  className={`flex items-start gap-2 rounded-lg border p-3 ${
                    riskResult.trap.verdict === "NONE"
                      ? "border-emerald-500/30 bg-emerald-500/5"
                      : riskResult.trap.verdict === "WARNING"
                        ? "border-amber-500/30 bg-amber-500/5"
                        : "border-rose-500/30 bg-rose-500/5"
                  }`}
                >
                  {riskResult.trap.verdict === "NONE" ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                  ) : (
                    <AlertTriangle className={`mt-0.5 size-4 shrink-0 ${riskResult.trap.verdict === "WARNING" ? "text-amber-400" : "text-rose-500"}`} />
                  )}
                  <div>
                    <p className="text-xs font-bold">{riskResult.trap.title}</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{riskResult.trap.message}</p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* کارت آموزشی: مثال اشتباه در برابر درست */}
      <Card className="glass">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Coins className="size-4 text-rose-400" />
            جلوگیری از «تله باخت همزمان» — اشتباه در برابر درست
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 text-xs md:grid-cols-2">
          <div className="space-y-2 rounded-lg border border-rose-500/30 bg-rose-500/5 p-3">
            <p className="font-bold text-rose-400">✗ مثال اشتباه (تله)</p>
            <p className="leading-relaxed text-muted-foreground">
              بازی اول: برد تیم A (۱.۴) در برابر برد تیم B (۲.۸) → اگر مساوی شود، هر دو می‌سوزند. ترکیب ۲–۳ بازی در
              میکس بدون پوشش حالات میانی = باخت یک بازی، سوزاندن هر دو تیپ.
            </p>
            <p className="font-num text-[11px] text-rose-300/90" dir="ltr">1/1.4 + 1/2.8 = 0.714 + 0.357 = 1.071 &gt; 1</p>
          </div>
          <div className="space-y-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
            <p className="font-bold text-emerald-400">✓ مثال درست (Correlated Hedging)</p>
            <p className="leading-relaxed text-muted-foreground">
              تیپ اول: 1X + بالای ۲.۵ (بازی باز) — تیپ دوم: 1X + زیر ۲.۵ (بازی بسته)؛ تعداد گل یا بالای ۲.۵ است یا
              زیر. احتمال دقیق هر تیپ از جمع خانه‌های ماتریس ۶×۶ محاسبه می‌شود.
            </p>
            <p className="font-num text-[11px] text-emerald-300/90" dir="ltr">Coverage = P(1X) — goals market exhausts all outcomes</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
