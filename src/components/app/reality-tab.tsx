"use client";

// ─────────────────────────────────────────────────────────────────────────────
// راستی‌آزمایی بازار واقعی (Market Reality-Check) — v24.0
//
// پاسخ مستند به سه پرسش حیاتی:
//   ۱) عملکرد روزهای گذشته قابل راستی‌آزمایی است؟ → تفکیک دفتر REALTIME از PAPER
//   ۲) ضرایب کارت با betforward / 1xbet چقدر اختلاف دارد؟ → گپ٪ هر پای با
//      خط اجماعی واقعی چندبوکمیکر + دسترس‌پذیری بازار (تکی / BetBuilder)
//   ۳) اگر فقط تیپ A ورود می‌شد؟ → ROI با ضرایب کارت در برابر ROI با قیمت واقعی
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, BadgeCheck, CheckCircle2, Crown, Landmark, RefreshCw, Scale, TrendingDown, TrendingUp, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// ─── تایپ گزارش ───
interface LegAudit {
  key: string;
  tip: "A" | "B";
  cardOdds: number | null;
  realFairOdds: number | null;
  realBookOdds: number | null;
  modelProb: number | null;
  realProb: number | null;
  gapPct: number | null;
  availability: "DIRECT" | "BETBUILDER" | "MATCH_ONLY" | "OFF_BOARD";
  verdict: "OK" | "INFLATED" | "CHEAPER" | "NO_REAL_LINE";
}
interface CardAudit {
  slipId: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  kickoff: string;
  status: string;
  crownTier: string | null;
  archetype: string | null;
  oddsSource: string;
  hasRealLine: boolean;
  legs: LegAudit[];
  worstGapPct: number | null;
  verdict: "REAL_OK" | "GAP" | "NO_REAL_LINE";
  guaranteedProfitOnCard: number;
  guaranteedProfitAtRealOdds: number;
}
interface Report {
  generatedAt: string;
  ledgerIntegrity: {
    totalSettled: number; realtimeIssued: number; paperIssued: number; realtimeSharePct: number;
    realtimeWinRate: number; paperWinRate: number; realtimeNetProfit: number; paperNetProfit: number;
  };
  tipACounterfactual: {
    n: number; winRatePct: number; roiAtCardOddsPct: number; roiAtRealOddsPct: number;
    roiDeltaPct: number; avgClaimedEdgePct: number; note: string;
  };
  categoryLedger: Array<{
    bucket: string;
    realtime: { n: number; winRatePct: number; net: number };
    paper: { n: number; winRatePct: number; net: number };
  }>;
  pendingAudits: CardAudit[];
  summary: {
    cardsAudited: number; legsAudited: number; legsRealOk: number; legsInflated: number;
    legsBetbuilderOnly: number; legsNoRealLine: number; medianGapPct: number | null; verdict: string;
  };
  consensusCreditsRemaining: number | null;
  consensusEvents: number;
}

const fmt1 = (x: number | null | undefined) => (x == null ? "—" : x.toFixed(1));
const fmtSign = (x: number | null | undefined) => (x == null ? "—" : `${x > 0 ? "+" : ""}${x.toFixed(1)}`);

function gapBadge(gap: number | null, verdict: string) {
  if (verdict === "NO_REAL_LINE") return <Badge variant="outline" className="border-white/15 text-white/50">بدون خط واقعی</Badge>;
  if (gap == null) return <Badge variant="outline" className="border-white/15 text-white/50">—</Badge>;
  if (verdict === "INFLATED") return <Badge className="bg-red-500/15 text-red-300 border border-red-500/40">گران‌تر {fmt1(gap)}٪+</Badge>;
  if (verdict === "CHEAPER") return <Badge className="bg-amber-500/15 text-amber-300 border border-amber-500/40">ارزان‌تر {fmt1(Math.abs(gap))}٪</Badge>;
  return <Badge className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/40">هم‌خوان {fmtSign(gap)}٪</Badge>;
}

function availBadge(a: LegAudit["availability"]) {
  if (a === "DIRECT") return <Badge variant="outline" className="border-emerald-500/30 text-emerald-300/80">تکی رسمی سایت</Badge>;
  if (a === "BETBUILDER") return <Badge variant="outline" className="border-amber-500/30 text-amber-300/80">فقط Bet Builder</Badge>;
  if (a === "OFF_BOARD") return <Badge variant="outline" className="border-red-500/30 text-red-300/80">خارج از تابلو</Badge>;
  return <Badge variant="outline" className="border-white/15 text-white/50">{a}</Badge>;
}

export function RealityTab() {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/reality-check?limit=40", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setReport(await res.json());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const li = report?.ledgerIntegrity;
  const tf = report?.tipACounterfactual;
  const su = report?.summary;

  return (
    <div className="space-y-4" dir="rtl">
      {/* ─── هدر ─── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-white">
            <Scale className="size-5 text-amber-300" />
            راستی‌آزمایی بازار واقعی
            <Badge variant="outline" className="border-amber-500/40 text-amber-300">v24.0</Badge>
          </h2>
          <p className="mt-1 text-xs text-white/50">
            مقایسه هر پایِ هر کارت با خط اجماعی واقعی چندبوکمیکر (همان کلاس قیمتی betforward و 1xbet) · ساختار دفتر REALTIME/PAPER · سناریوی.counterfactual تیپ A
            {report?.consensusCreditsRemaining != null && (
              <span className="ms-2 text-emerald-300/70">(اعتبار فید: {report.consensusCreditsRemaining} · {report.consensusEvents} رخداد واقعی)</span>
            )}
          </p>
        </div>
        <Button onClick={load} disabled={loading} size="sm" className="bg-emerald-600 text-white hover:bg-emerald-500">
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          {loading ? "در حال سنجش…" : "راستی‌آزمایی مجدد"}
        </Button>
      </div>

      {error && (
        <Card className="border-red-500/40 bg-red-500/10">
          <CardContent className="p-4 text-sm text-red-200">خطا در دریافت گزارش: {error}</CardContent>
        </Card>
      )}

      {!report && !error && (
        <Card className="border-white/10 bg-white/5"><CardContent className="p-6 text-center text-sm text-white/60">در حال بارگذاری گزارش…</CardContent></Card>
      )}

      {report && (
        <>
          {/* ─── ۱) درستی دفتر کارنامه ─── */}
          <Card className="border-white/10 bg-white/5">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm text-white">
                <Landmark className="size-4 text-sky-300" />
                ۱) عملکرد گذشته چقدر راستی‌آزمایی‌پذیر است؟ — دفتر REALTIME در برابر کاغذی PAPER
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
                <div className="text-xs text-emerald-200/80">کارنامه واقعی‌پذیر (قبل از شروع بازی صادر شده)</div>
                <div className="mt-1 text-2xl font-bold text-emerald-300">{li?.realtimeIssued ?? 0} <span className="text-sm font-normal">کارت</span></div>
                <div className="text-xs text-white/60">وین‌ریت {fmt1(li?.realtimeWinRate)}٪ · خالص {fmtSign(li?.realtimeNetProfit)}u · {fmt1(li?.realtimeSharePct)}٪ کل دفتر</div>
              </div>
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                <div className="text-xs text-amber-200/80">کارنامه کاغذی (بعد از پایان بازی صادر شده — تحلیلی، غیرقابل‌اتکا به‌عنوان پیش‌بینی)</div>
                <div className="mt-1 text-2xl font-bold text-amber-300">{li?.paperIssued ?? 0} <span className="text-sm font-normal">کارت</span></div>
                <div className="text-xs text-white/60">وین‌ریت {fmt1(li?.paperWinRate)}٪ · خالص {fmtSign(li?.paperNetProfit)}u</div>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                <div className="text-xs text-white/60">کل کارت‌های تسویه‌شده</div>
                <div className="mt-1 text-2xl font-bold text-white">{li?.totalSettled ?? 0}</div>
                <div className="text-xs text-white/60">
                  {li && li.realtimeSharePct < 30
                    ? <span className="text-amber-300">هشدار: بیش از ۷۰٪ دفتر کاغذی است — آمار تبلیغاتی وین‌ریت از این بخش می‌آید</span>
                    : <span className="text-emerald-300">سهم دفتر واقعی قابل‌قبول است</span>}
                </div>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                <div className="text-xs text-white/60">حکم نهایی راستی‌آزمایی دفتر</div>
                <div className="mt-1 text-sm font-bold leading-6 text-white">
                  {li && li.realtimeIssued >= 25
                    ? <>بخش واقعی به‌اندازه کافی بزرگ است (≥۲۵ کارت) اما <span className="text-amber-300">هیچ سودِ تسویه‌شده‌ای با قیمت سایت واقعی بازحساب نشده بود</span> — از این‌به‌بعد هر دو عدد کنار هم ثبت می‌شود.</>
                    : "نمونه واقعی کوچک است — وین‌ریت تبلیغاتی هنوز قابل ادعا نیست."}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ─── ۲) سناریوی.counterfactual تیپ A ─── */}
          <Card className="border-white/10 bg-white/5">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm text-white">
                <TrendingUp className="size-4 text-emerald-300" />
                ۲) اگر فقط روی تیپ A ورود می‌شد؟ — ROI با ضرایب کارت در برابر قیمت واقعی بازار
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-center">
                  <div className="text-xs text-white/60">تعداد</div>
                  <div className="text-xl font-bold text-white">{tf?.n ?? 0}</div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-center">
                  <div className="text-xs text-white/60">وین‌ریت تیپ A</div>
                  <div className="text-xl font-bold text-white">{fmt1(tf?.winRatePct)}٪</div>
                </div>
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-center">
                  <div className="text-xs text-emerald-200/80">ROI با ضرایب کارت (نمایشی)</div>
                  <div className={`text-xl font-bold ${tf && tf.roiAtCardOddsPct >= 0 ? "text-emerald-300" : "text-red-300"}`}>{fmtSign(tf?.roiAtCardOddsPct)}٪</div>
                </div>
                <div className={`rounded-lg border p-3 text-center ${tf && tf.roiAtRealOddsPct >= 0 ? "border-emerald-500/30 bg-emerald-500/10" : "border-red-500/40 bg-red-500/10"}`}>
                  <div className="text-xs text-white/70">ROI با قیمت واقعی سایت (payout ۰.۹۴۵)</div>
                  <div className={`text-xl font-bold ${tf && tf.roiAtRealOddsPct >= 0 ? "text-emerald-300" : "text-red-300"}`}>{fmtSign(tf?.roiAtRealOddsPct)}٪</div>
                </div>
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-center">
                  <div className="text-xs text-amber-200/80">ادعای میانگین ارزش (+EV)</div>
                  <div className="text-xl font-bold text-amber-300">{fmt1(tf?.avgClaimedEdgePct)}٪</div>
                </div>
              </div>
              <p className="rounded-lg border border-white/10 bg-white/5 p-3 text-xs leading-6 text-white/70">
                <AlertTriangle className="me-1 inline size-3.5 text-amber-300" />
                {tf?.note} فاصله {fmtSign(tf?.roiDeltaPct)} درصدی یعنی بخش بزرگِ «بازدهی موتور» محصول قیمت‌گذاری داخلی است، نه لبه واقعی نسبت به بوکمیکر.
              </p>
            </CardContent>
          </Card>

          {/* ─── ۳) ممیزی کارت‌های پیش‌رو با سایت واقعی ─── */}
          <Card className="border-white/10 bg-white/5">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between gap-2 text-sm text-white">
                <span className="flex items-center gap-2">
                  <BadgeCheck className="size-4 text-sky-300" />
                  ۳) کارت‌های پیش‌رو در برابر تابلوی واقعی (اجماع {su?.legsAudited ?? 0} پای · گپ میانه {fmt1(su?.medianGapPct)}٪)
                </span>
                {su && su.legsInflated > 0 && (
                  <Badge className="border border-red-500/40 bg-red-500/15 text-red-300">{su.legsInflated} پای گران‌تر از سایت واقعی</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="max-h-96 overflow-y-auto">
                <div className="space-y-3 pe-2">
                  {report.pendingAudits.map((c) => (
                    <div key={c.slipId} className={`rounded-lg border p-3 ${c.verdict === "GAP" ? "border-red-500/40 bg-red-500/5" : c.verdict === "REAL_OK" ? "border-emerald-500/25 bg-emerald-500/5" : "border-white/10 bg-white/5"}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-bold text-white">
                          {c.homeTeam} <span className="text-white/40">در برابر</span> {c.awayTeam}
                          <span className="ms-2 text-xs font-normal text-white/50">{c.league}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {c.crownTier === "GOLD" && <Crown className="size-4 text-amber-300" />}
                          {c.crownTier === "SILVER_SHADOW" && <Badge variant="outline" className="border-slate-400/40 text-slate-300">نقره‌ای</Badge>}
                          {c.verdict === "REAL_OK" ? <CheckCircle2 className="size-4 text-emerald-300" /> : c.verdict === "GAP" ? <XCircle className="size-4 text-red-300" /> : <AlertTriangle className="size-4 text-amber-300" />}
                          <span className="text-xs text-white/60">{new Date(c.kickoff).toLocaleString("fa-IR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                        </div>
                      </div>
                      <div className="mt-2 space-y-1.5">
                        {c.legs.map((l, i) => (
                          <div key={i} className="flex flex-wrap items-center gap-2 rounded border border-white/8 bg-black/20 px-2 py-1.5 text-xs">
                            <Badge variant="outline" className={l.tip === "A" ? "border-sky-500/40 text-sky-300" : "border-violet-500/40 text-violet-300"}>تیپ {l.tip === "A" ? "A" : "B"}</Badge>
                            <span className="font-mono text-white">{l.key}</span>
                            <span className="text-white/50">کارت:</span>
                            <span className="font-mono font-bold text-white">{l.cardOdds ?? "—"}</span>
                            <span className="text-white/50">سایت واقعی:</span>
                            <span className="font-mono font-bold text-emerald-300">{l.realBookOdds ?? "—"}</span>
                            <span className="text-white/50">منصفانه:</span>
                            <span className="font-mono text-white/70">{l.realFairOdds ?? "—"}</span>
                            {gapBadge(l.gapPct, l.verdict)}
                            {availBadge(l.availability)}
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                        <span className="text-white/60">
                          سود تضمینی روی کارت: <span className="font-mono font-bold text-emerald-300">{fmtSign(c.guaranteedProfitOnCard)}u</span>
                        </span>
                        <span className="text-white/60">
                          با قیمت واقعی سایت:{" "}
                          <span className={`font-mono font-bold ${c.guaranteedProfitAtRealOdds >= 0 ? "text-emerald-300" : "text-red-300"}`}>{fmtSign(c.guaranteedProfitAtRealOdds)}u</span>
                        </span>
                        {c.guaranteedProfitAtRealOdds < 0 && (
                          <span className="text-red-300">← «سود تضمینی پوششی» با ضرایب سایت واقعی منفی می‌شود؛ پوشش باید با قیمت واقعی بازطراحی شود</span>
                        )}
                        <span className="text-white/40">منبع خط: {c.oddsSource.length > 60 ? c.oddsSource.slice(0, 60) + "…" : c.oddsSource}</span>
                      </div>
                    </div>
                  ))}
                  {!report.pendingAudits.length && (
                    <div className="rounded-lg border border-white/10 bg-white/5 p-6 text-center text-sm text-white/60">کارت پیش‌رویی برای ممیزی نیست.</div>
                  )}
                </div>
              </ScrollArea>
              {su && (
                <p className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3 text-xs leading-6 text-white/70">
                  <Scale className="me-1 inline size-3.5 text-amber-300" />
                  حکم: {su.verdict}. پای‌های «فقط Bet Builder» در betforward/1xbet به‌صورت ترکیب دستی ساخته می‌شوند (قیمت نهایی سایت می‌تواند کمتر باشد)؛ پای‌های «خارج از تابلو» اصلاً قابل ثبت نیستند و در گزارش تسویه MANUAL_REVIEW می‌شوند.
                </p>
              )}
            </CardContent>
          </Card>

          {/* ─── ۴) کارنامه هر دسته فلش‌کارت ─── */}
          <Card className="border-white/10 bg-white/5">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm text-white">
                <TrendingDown className="size-4 text-violet-300" />
                ۴) کارنامه کامل هر دسته فلش‌کارت — با تفکیک دفتر واقعی از کاغذی
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-white/10">
                    <TableHead className="text-right text-white/70">دسته</TableHead>
                    <TableHead className="text-center text-emerald-300/80">واقعی — n</TableHead>
                    <TableHead className="text-center text-emerald-300/80">واقعی — وین‌ریت</TableHead>
                    <TableHead className="text-center text-emerald-300/80">واقعی — خالص</TableHead>
                    <TableHead className="text-center text-amber-300/80">کاغذی — n</TableHead>
                    <TableHead className="text-center text-amber-300/80">کاغذی — وین‌ریت</TableHead>
                    <TableHead className="text-center text-amber-300/80">کاغذی — خالص</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(report.categoryLedger ?? []).map((r) => (
                    <TableRow key={r.bucket} className="border-white/8">
                      <TableCell className="text-right font-bold text-white">
                        {r.bucket === "GOLD" ? "👑 تاج طلایی" : r.bucket === "SILVER_SHADOW" ? "🥈 تاج نقره‌ای" : "دفتر قدیمی"}
                      </TableCell>
                      <TableCell className="text-center text-white">{r.realtime.n}</TableCell>
                      <TableCell className="text-center text-emerald-300">{fmt1(r.realtime.winRatePct)}٪</TableCell>
                      <TableCell className={`text-center font-mono ${r.realtime.net >= 0 ? "text-emerald-300" : "text-red-300"}`}>{fmtSign(r.realtime.net)}u</TableCell>
                      <TableCell className="text-center text-white">{r.paper.n}</TableCell>
                      <TableCell className="text-center text-amber-300">{fmt1(r.paper.winRatePct)}٪</TableCell>
                      <TableCell className={`text-center font-mono ${r.paper.net >= 0 ? "text-amber-300" : "text-red-300"}`}>{fmtSign(r.paper.net)}u</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
