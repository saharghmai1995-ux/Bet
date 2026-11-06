"use client";

import { useCallback, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Coins,
  Grid2x2,
  Loader2,
  Scale,
  ShieldCheck,
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
import { faNum, faOdds, faPct, faPctSigned } from "@/lib/format";
import type { AnalysisResultDTO, DebateResultDTO, MatchDTO, RiskResultDTO } from "@/lib/types";
import { PortfolioCard } from "@/components/app/portfolio-card";

const STRATEGY_INFO: Record<DutchStrategy, { label: string; desc: string }> = {
  EQUAL_PROFIT: { label: "سود برابر", desc: "برد هر تیپ → سود یکسان (مثال جدول: ۶۰/۴۰ ← +۲۰)" },
  HEDGE_MAIN: { label: "بیمه سرمایه", desc: "برد تیپ اصلی → سود بیشتر؛ برد تیپ دوم → برگشت کل پول" },
  AGGRESSIVE: { label: "تهاجمی", desc: "برد تیپ اصلی → برگشت پول؛ برد تیپ دوم → سود حداکثری" },
};

interface Props {
  matches: MatchDTO[];
  analyses: Record<string, AnalysisResultDTO>;
  debates?: Record<string, DebateResultDTO>;
  onGoToAnalyst: (matchId: string) => void;
}

export function RiskTab({ matches, analyses, debates, onGoToAnalyst }: Props) {
  // ─── بخش الف: ماشین‌حساب داچینگ ───
  const [odds1, setOdds1] = useState(2.0);
  const [odds2, setOdds2] = useState(3.0);
  const [calcBankroll, setCalcBankroll] = useState(100);
  const [calcStrategy, setCalcStrategy] = useState<DutchStrategy>("EQUAL_PROFIT");

  const calc = useMemo(() => {
    if (odds1 < 1.01 || odds2 < 1.01 || calcBankroll <= 0) return null;
    return dutchAllocate(
      [
        { label: "تیپ اول", odds: odds1 },
        { label: "تیپ دوم", odds: odds2 },
      ],
      calcBankroll,
      calcStrategy
    );
  }, [odds1, odds2, calcBankroll, calcStrategy]);

  // ─── بخش ب: سازنده تیپ مکمل (API) ───
  const [matchId, setMatchId] = useState<string | null>(null);
  const [secondMatchId, setSecondMatchId] = useState<string | null>(null);
  const [mode, setMode] = useState<"SINGLE_MATCH" | "TWO_MATCH">("SINGLE_MATCH");
  const [bankroll, setBankroll] = useState(100);
  const [strategy, setStrategy] = useState<DutchStrategy>("EQUAL_PROFIT");
  const [building, setBuilding] = useState(false);
  const [riskResult, setRiskResult] = useState<RiskResultDTO | null>(null);

  const buildTips = useCallback(async () => {
    if (!matchId) {
      toast.error("اول یک بازی انتخاب کنید");
      return;
    }
    setBuilding(true);
    try {
      let analysisId = analyses[matchId]?.analysis.id;
      if (!analysisId) {
        // اگر تحلیل وجود ندارد، اول ایجنت تحلیلگر را اجرا کن
        const res = await fetch("/api/agent/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ matchId }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error ?? "تحلیل ناموفق بود");
        analysisId = data.analysis.id;
        toast.info("بازی هنوز تحلیل نشده بود — ایجنت تحلیلگر اجرا شد");
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
  }, [matchId, analyses, bankroll, strategy, mode, secondMatchId]);

  return (
    <div className="space-y-4">
      {/* ─── موتور پرتفوی: مونت‌کارلو کاپولا + کلِی همزمان (لایه سطح اول) ─── */}
      <PortfolioCard
        matches={matches}
        debates={debates ?? {}}
        onGoToDebate={onGoToAnalyst}
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* ─── الف: ماشین‌حساب داچینگ ─── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Scale className="size-4 text-amber-600 dark:text-amber-400" />
              ماشین‌حساب داچینگ (Dutching)
            </CardTitle>
            <CardDescription className="text-xs">
              تقسیم سرمایه بین دو تیپ مکمل — نمونه پیش‌فرض: ضرایب ۲.۰ و ۳.۰ با بودجه ۱۰۰
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
                  className="tabular-nums"
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
                  className="tabular-nums"
                  dir="ltr"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">کل بودجه</Label>
                <Input
                  type="number"
                  min="1"
                  value={calcBankroll}
                  onChange={(e) => setCalcBankroll(parseFloat(e.target.value) || 0)}
                  className="tabular-nums"
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
                  className={`h-8 text-[11px] ${calcStrategy === s ? "bg-amber-600 hover:bg-amber-700 text-white" : ""}`}
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
                  className={`rounded-lg border p-3 text-xs flex items-start gap-2 ${
                    calc.arbitrageFree
                      ? "border-emerald-600/30 bg-emerald-600/5"
                      : "border-rose-600/30 bg-rose-600/5"
                  }`}
                >
                  {calc.arbitrageFree ? (
                    <CheckCircle2 className="size-4 text-emerald-500 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="size-4 text-rose-500 shrink-0 mt-0.5" />
                  )}
                  <div dir="ltr" className="font-mono text-[11px] leading-relaxed">
                    1/{odds1.toFixed(2)} + 1/{odds2.toFixed(2)} = {calc.impliedSum.toFixed(3)}{" "}
                    {calc.arbitrageFree ? (
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                        &lt; 1 ✓ سود تضمینی {calc.guaranteedMargin ? (calc.guaranteedMargin * 100).toFixed(1) : 0}%
                      </span>
                    ) : (
                      <span className="text-rose-500 font-bold">&gt; 1 ✗ پوشش تضمینی ممکن نیست</span>
                    )}
                  </div>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">سناریو</TableHead>
                      <TableHead className="text-xs">مبلغ شرط</TableHead>
                      <TableHead className="text-xs">بازگشت</TableHead>
                      <TableHead className="text-xs">سود خالص</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="text-xs">برد تیپ اول ({faOdds(odds1)})</TableCell>
                      <TableCell className="text-xs tabular-nums">{faNum(calc.stakes[0])}</TableCell>
                      <TableCell className="text-xs tabular-nums">{faNum(calc.returns[0])}</TableCell>
                      <TableCell className={`text-xs font-bold tabular-nums ${calc.profits[0] > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`} dir="ltr">
                        {calc.profits[0] >= 0 ? "" : "−"}
                        {faNum(Math.abs(calc.profits[0]))}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="text-xs">برد تیپ دوم ({faOdds(odds2)})</TableCell>
                      <TableCell className="text-xs tabular-nums">{faNum(calc.stakes[1])}</TableCell>
                      <TableCell className="text-xs tabular-nums">{faNum(calc.returns[1])}</TableCell>
                      <TableCell className={`text-xs font-bold tabular-nums ${calc.profits[1] > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`} dir="ltr">
                        {calc.profits[1] >= 0 ? "" : "−"}
                        {faNum(Math.abs(calc.profits[1]))}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="text-xs text-muted-foreground">باخت هر دو</TableCell>
                      <TableCell className="text-xs tabular-nums text-rose-500">−{faNum(calcBankroll, 0)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">۰</TableCell>
                      <TableCell className="text-xs font-bold text-rose-500 tabular-nums" dir="ltr">−{faNum(calcBankroll, 0)}</TableCell>
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
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Wand2 className="size-4 text-emerald-600 dark:text-emerald-400" />
              ایجنت ریسک — سازنده تیپ‌های مکمل
            </CardTitle>
            <CardDescription className="text-xs leading-relaxed">
              پایه مشترک امن (Banker: شانس مجدد 1X) + متغیر دوگانه (بالای/زیر ۲.۵ گل) → تا وقتی میزبان نبازد،
              <b className="text-emerald-600 dark:text-emerald-400"> غیرممکن است هر دو تیپ ببازند</b>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">بازی پایه (Banker — از خروجی تحلیلگر)</Label>
              <Select value={matchId ?? ""} onValueChange={setMatchId}>
                <SelectTrigger aria-label="انتخاب بازی پایه" className="w-full">
                  <SelectValue placeholder="بازی پایه را انتخاب کنید..." />
                </SelectTrigger>
                <SelectContent>
                  {matches.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.homeTeam} — {m.awayTeam} {m.latestAnalysis ? "✓ تحلیل‌شده" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {matchId && !analyses[matchId] && (
                <p className="text-[10px] text-amber-600 dark:text-amber-400">
                  این بازی هنوز تحلیل نشده — هنگام ساخت، ایجنت تحلیلگر خودکار اجرا می‌شود.
                  <button className="underline mr-1" onClick={() => onGoToAnalyst(matchId)}>
                    رفتن به تب تحلیلگر
                  </button>
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">حالت ساخت</Label>
                <Select value={mode} onValueChange={(v) => setMode(v as "SINGLE_MATCH" | "TWO_MATCH")}>
                  <SelectTrigger aria-label="حالت ساخت" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SINGLE_MATCH">تک‌بازی (Bet Builder)</SelectItem>
                    <SelectItem value="TWO_MATCH">میکس دو بازی</SelectItem>
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
                        .filter((m) => m.id !== matchId)
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
                  className="tabular-nums"
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

            <Button onClick={buildTips} disabled={building || !matchId} className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
              {building ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
              {building ? "ایجنت ریسک در حال ساخت..." : "ساخت دو تیپ مکمل + تخصیص سرمایه"}
            </Button>

            {riskResult && (
              <div className="space-y-3 pt-1">
                <Separator />
                {/* banker */}
                <div className="rounded-lg border border-border p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold flex items-center gap-1.5">
                      <Grid2x2 className="size-3.5 text-violet-500" /> شرط پایه مشترک (Banker)
                    </p>
                    <Badge variant={riskResult.banker.baseSafe ? "outline" : "secondary"} className={`text-[10px] ${riskResult.banker.baseSafe ? "border-emerald-600/40 text-emerald-600 dark:text-emerald-400" : "text-amber-600"}`}>
                      {riskResult.banker.baseSafe ? "امن (≥۷۲٪)" : "پرریسک (<۷۲٪)"}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {riskResult.banker.match} — {riskResult.banker.marketName} با ضریب {faOdds(riskResult.banker.odds)} · احتمال {faPct(riskResult.banker.prob, 1)}
                  </p>
                </div>

                {/* تیپ‌ها */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {riskResult.tips.map((t, idx) => (
                    <div key={t.id} className={`rounded-lg border p-3 space-y-1.5 ${idx === 0 ? "border-emerald-600/30 bg-emerald-600/5" : "border-amber-600/30 bg-amber-600/5"}`}>
                      <p className="text-xs font-bold">{t.label}</p>
                      {t.legs.map((l) => (
                        <p key={l.selection + l.market} className="text-[11px] text-muted-foreground">
                          • {l.match}: <b className="text-foreground">{l.selection === "HOME_OR_DRAW" ? "1X" : l.selection === "OVER_2_5" ? "بالای ۲.۵" : "زیر ۲.۵"}</b> ({faOdds(l.odds)})
                        </p>
                      ))}
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground">ضریب کل</span>
                        <b className="tabular-nums" dir="ltr">{faOdds(t.totalOdds)}</b>
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground">مبلغ شرط</span>
                        <b className="tabular-nums">{faNum(t.stake)}</b>
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground">برد →</span>
                        <b className={`tabular-nums ${t.profitIfWin > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`} dir="ltr">
                          {t.profitIfWin > 0 ? "+" : ""}{faNum(t.profitIfWin)}
                        </b>
                      </div>
                    </div>
                  ))}
                </div>

                {/* ریاضیات پوشش */}
                <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-1.5" dir="ltr">
                  <p className="text-[11px] font-mono leading-relaxed">
                    S = 1/{riskResult.tips[0].totalOdds.toFixed(2)} + 1/{riskResult.tips[1].totalOdds.toFixed(2)} ={" "}
                    {riskResult.dutching.impliedSum.toFixed(3)} {riskResult.dutching.arbitrageFree ? "< 1 ✓" : "> 1 ✗"}
                  </p>
                  <p className="text-[11px] font-mono leading-relaxed">
                    P(both lose) = 1 − P(banker) = {(1 - riskResult.dutching.bothLoseProb).toFixed(3) === "0.000" ? "—" : riskResult.dutching.bothLoseProb.toFixed(3)} · margin ={" "}
                    {(riskResult.dutching.guaranteedMargin * 100).toFixed(1)}%
                  </p>
                </div>

                {/* حکم تله */}
                <div
                  className={`rounded-lg border p-3 flex items-start gap-2 ${
                    riskResult.trap.verdict === "NONE"
                      ? "border-emerald-600/30 bg-emerald-600/5"
                      : riskResult.trap.verdict === "WARNING"
                        ? "border-amber-600/30 bg-amber-600/5"
                        : "border-rose-600/30 bg-rose-600/5"
                  }`}
                >
                  {riskResult.trap.verdict === "NONE" ? (
                    <CheckCircle2 className="size-4 text-emerald-500 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className={`size-4 shrink-0 mt-0.5 ${riskResult.trap.verdict === "WARNING" ? "text-amber-500" : "text-rose-500"}`} />
                  )}
                  <div>
                    <p className="text-xs font-bold">{riskResult.trap.title}</p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">{riskResult.trap.message}</p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* کارت آموزشی: مثال اشتباه در برابر درست */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Coins className="size-4 text-rose-500" />
            جلوگیری از «تله باخت همزمان» — اشتباه در برابر درست
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="rounded-lg border border-rose-600/30 bg-rose-600/5 p-3 space-y-2">
            <p className="font-bold text-rose-600 dark:text-rose-400">✗ مثال اشتباه (تله)</p>
            <p className="text-muted-foreground leading-relaxed">
              بازی اول: برد تیم A (۱.۴) در برابر برد تیم B (۲.۸) → اگر مساوی شود، هر دو می‌سوزند.
              ترکیب ۲–۳ بازی در میکس بدون پوشش حالات میانی = باخت یک بازی، سوزاندن هر دو تیپ.
            </p>
            <p className="font-mono text-[11px]" dir="ltr">1/1.4 + 1/2.8 = 0.714 + 0.357 = 1.071 &gt; 1</p>
          </div>
          <div className="rounded-lg border border-emerald-600/30 bg-emerald-600/5 p-3 space-y-2">
            <p className="font-bold text-emerald-600 dark:text-emerald-400">✓ مثال درست (Correlated Hedging)</p>
            <p className="text-muted-foreground leading-relaxed">
              تیپ اول: 1X + بالای ۲.۵ (بازی باز) — تیپ دوم: 1X + زیر ۲.۵ (بازی بسته)؛ تعداد گل یا بالای ۲.۵ است یا زیر.
              یا میکس دو بازی: پایه امن ۱.۳۵ × (۱.۵۰ بالای ۲.۵ ≈ ۲.۰۲) و پایه × (۲.۲۰ زیر ۲.۵ ≈ ۲.۹۷).
            </p>
            <p className="font-mono text-[11px]" dir="ltr">Coverage = P(1X) — goals market exhausts all outcomes</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
