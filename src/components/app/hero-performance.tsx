"use client";

// ─────────────────────────────────────────────────────────────────────────────
// مرکز فرماندهی عملکرد و وین‌ریت تاییدشده (Live Verified Win-Rate & ROI Hub)
// ماژول برجسته بالای داشبورد — v8.0
//
//   ۱) گیج نیم‌دایره‌ای متحرک SVG — وین‌ریت ترکیبی «واقعی» کارت‌های تسویه‌شده
//      با تفکیک برد تیپ A / برد تیپ B / دو-برد طلایی / باخت (دیتای واقعی
//      کارنامه از موتور تسویه ESPN — صفر عدد جعلی)
//   ۲) منحنی رشد سرمایه ۳۰ رویداد اخیر (SVG متحرک با گرادیان سبز)
//   ۳) شاخص کارایی سوپروایزر (Approved / Filtered Out امروز)
//   ۴) سوییچ اشتراک Free / Pro / VIP + مودال پرداخت USDT + دسترسی ۱ کلیکی
//      به جدول SHA-256
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, Copy, Crown, Database, Loader2, ScanLine, ShieldCheck, Sparkles, TrendingUp, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useQuantStore } from "@/lib/store";
import { useSupervisorStats } from "@/lib/autopilot-derive";
import { faNum } from "@/lib/format";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { LedgerDTO } from "@/lib/types";
import { ParticlePipeline } from "@/components/app/fx/particle-pipeline";

const START_BANK = 1000; // بانک مرجع ۱۰۰۰ واحدی — استیک فلت ۱۰۰ واحدی هر کارت

/** گیج نیم‌دایره‌ای متحرک وین‌ریت (SVG با انیمیشن stroke-dashoffset) */
function WinRateGauge({ winPct, breakdown }: { winPct: number; breakdown: { aWin: number; bWin: number; double: number; loss: number } | null }) {
  const [drawn, setDrawn] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setDrawn(Math.max(0, Math.min(100, winPct))), 150);
    return () => clearTimeout(t);
  }, [winPct]);

  const R = 70;
  const CIRC = Math.PI * R; // نیم‌دایره
  const offset = CIRC * (1 - drawn / 100);
  const tone = winPct >= 60 ? "#34d399" : winPct >= 45 ? "#fbbf24" : winPct > 0 ? "#fb7185" : "#64748b";

  return (
    <div className="flex items-center gap-3">
      <svg viewBox="0 0 180 100" className="h-[86px] w-[150px] shrink-0" role="img" aria-label={`گیج وین‌ریت ترکیبی: ${faNum(winPct, 1)} درصد`}>
        <defs>
          <linearGradient id="gauge-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="60%" stopColor="#34d399" />
            <stop offset="100%" stopColor="#fbbf24" />
          </linearGradient>
        </defs>
        {/* مسیر خاکستری پایه */}
        <path d={`M 20 90 A ${R} ${R} 0 0 1 160 90`} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="13" strokeLinecap="round" />
        {/* کمان وین‌ریت متحرک */}
        <path
          d={`M 20 90 A ${R} ${R} 0 0 1 160 90`}
          fill="none"
          stroke="url(#gauge-grad)"
          strokeWidth="13"
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 1.6s cubic-bezier(0.22,1,0.36,1)" }}
        />
        <text x="90" y="72" textAnchor="middle" fontSize="26" fontWeight="800" fill={tone} className="font-num">
          {faNum(winPct, 1)}٪
        </text>
        <text x="90" y="90" textAnchor="middle" fontSize="9.5" fill="#94a3b8">
          Combined Win Rate
        </text>
      </svg>
      <div className="min-w-0 flex-1 space-y-1 text-[10px] leading-4">
        {breakdown ? (
          <>
            <LegendRow color="bg-sky-400" label="برد تیپ A" value={`${faNum(breakdown.aWin, 1)}٪`} />
            <LegendRow color="bg-emerald-400" label="برد تیپ B" value={`${faNum(breakdown.bWin, 1)}٪`} />
            <LegendRow color="bg-amber-400" label="برد طلایی همزمان (Double-Win)" value={`${faNum(breakdown.double, 1)}٪`} />
            <LegendRow color="bg-rose-400" label="باخت (تله میانی)" value={`${faNum(breakdown.loss, 1)}٪`} />
          </>
        ) : (
          <p className="text-muted-foreground">
            هنوز کارت تسویه‌شده‌ای وجود ندارد — پس از اولین FT، وین‌ریت «واقعی» از نتایج رسمی ESPN اینجا محاسبه می‌شود (صفر عدد جعلی).
          </p>
        )}
      </div>
    </div>
  );
}

function LegendRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <p className="flex items-center justify-between gap-2">
      <span className="flex min-w-0 items-center gap-1 text-muted-foreground">
        <span className={cn("inline-block size-2 shrink-0 rounded-sm", color)} />
        <span className="truncate">{label}</span>
      </span>
      <b className="font-num shrink-0 text-foreground" dir="ltr">{value}</b>
    </p>
  );
}

/** نمونه‌برداری یکنواخت — همیشه نقطه اول و آخر حفظ می‌شود (رفع اعوجاج منحنی) */
function downsampleEvenly(arr: number[], maxPts: number): number[] {
  if (arr.length <= maxPts) return arr;
  const out: number[] = [];
  for (let i = 0; i < maxPts - 1; i++) {
    out.push(arr[Math.round((i * (arr.length - 1)) / (maxPts - 1))]);
  }
  out.push(arr[arr.length - 1]);
  return out;
}

/** منحنی اسپارک‌لاین رشد سرمایه (SVG متحرک با draw-in) */
function EquitySparkline({ curve, roi, finalBank }: { curve: number[]; roi: number; finalBank: number }) {
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDrawn(true), 200);
    return () => clearTimeout(t);
  }, []);

  const W = 220;
  const H = 84;
  const pts = curve.length >= 2 ? curve : [START_BANK, START_BANK];
  const min = Math.min(...pts, START_BANK);
  const max = Math.max(...pts, START_BANK);
  const span = Math.max(1, max - min);
  const step = W / Math.max(1, pts.length - 1);
  const coords = pts.map((v, i) => [i * step, H - 8 - ((v - min) / span) * (H - 20)] as const);
  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;
  const up = roi >= 0;

  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <TrendingUp className={cn("size-3.5", up ? "text-emerald-400" : "text-rose-400")} />
          منحنی رشد بانک ۱۰۰۰ واحدی
        </p>
        <p className="font-num text-xs font-bold" dir="ltr">
          <span className={up ? "text-emerald-300" : "text-rose-300"}>
            {faNum(Math.round(finalBank), 0)}
          </span>{" "}
          <span className={up ? "text-emerald-400" : "text-rose-400"}>
            ({up ? "+" : ""}{faNum(roi, 1)}% ROI)
          </span>
        </p>
      </div>
      <p className="mb-0.5 text-[9px] leading-3 text-muted-foreground/80">
        مبنای منحنی: فقط کارت‌های تایید سوپروایزر (پول واقعی) — وتوهای دفتر سایه در این منحنی لحاظ نمی‌شوند.
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[70px] w-full" role="img" aria-label="نمودار رشد سرمایه بر پایه سود واقعی کارت‌های تاییدشده">
        <defs>
          <linearGradient id="eq-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#34d399" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#eq-fill)" style={{ opacity: drawn ? 1 : 0, transition: "opacity 1.2s ease 0.5s" }} />
        <path
          d={line}
          fill="none"
          stroke={up ? "#34d399" : "#fb7185"}
          strokeWidth="2.4"
          strokeLinecap="round"
          style={{
            strokeDasharray: 600,
            strokeDashoffset: drawn ? 0 : 600,
            transition: "stroke-dashoffset 1.8s cubic-bezier(0.22,1,0.36,1)",
            filter: "drop-shadow(0 0 5px rgba(52,211,153,0.55))",
          }}
        />
        <circle cx={coords[coords.length - 1][0]} cy={coords[coords.length - 1][1]} r="3.4" fill={up ? "#6ee7b7" : "#fda4af"}>
          <animate attributeName="r" values="3;4.4;3" dur="1.6s" repeatCount="indefinite" />
        </circle>
      </svg>
    </div>
  );
}

/** ویجت کارایی سوپروایزر */
function VetoEfficiency({ approved, vetoed, scanned, savedByVeto }: { approved: number; vetoed: number; scanned: number; savedByVeto: number }) {
  const total = approved + vetoed;
  const pct = total > 0 ? Math.round((approved / total) * 100) : 0;
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <ScanLine className="size-3.5 text-cyan-400" />
        شاخص کیفیت انتخاب سوپروایزر
      </p>
      <div className="flex items-end gap-3">
        <p className="font-num text-2xl font-extrabold text-emerald-300" dir="ltr">{faNum(approved, 0)}</p>
        <p className="pb-1 text-[10px] text-muted-foreground">تایید (Approved)</p>
        <p className="font-num text-2xl font-extrabold text-rose-300" dir="ltr">{faNum(vetoed, 0)}</p>
        <p className="pb-1 text-[10px] text-muted-foreground">وتو (Filtered Out)</p>
      </div>
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-white/8" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="نسبت تایید به وتو">
        <div className="h-1.5 bg-gradient-to-l from-emerald-500 to-emerald-400 transition-all duration-700" style={{ width: `${pct}%` }} />
        <div className="h-1.5 flex-1 bg-rose-500/50" />
      </div>
      <p className="text-[10px] leading-4 text-muted-foreground">
        از <b className="font-num text-foreground" dir="ltr">{faNum(scanned, 0)}</b> بازی اسکن‌شده — بازی‌های پرریسک با آستانه باخت همزمان ۹.۸٪ وتو شده‌اند.
      </p>
      {savedByVeto > 0 && (
        <p
          className="flex items-center gap-1 rounded-lg border border-amber-500/40 bg-gradient-to-l from-amber-500/[0.12] to-emerald-500/[0.06] px-2 py-1 text-[10px] font-bold text-amber-200"
          role="status"
          aria-label="سرمایه نجات‌یافته توسط وتوی سوپروایزر"
        >
          <ShieldCheck className="size-3.5 shrink-0 text-amber-300" />
          🛡️ سرمایه نجات‌یافته توسط وتو:
          <b className="font-num text-amber-300" dir="ltr">+{faNum(savedByVeto, 1)} واحد</b>
        </p>
      )}
    </div>
  );
}

/** سوییچ اشتراک + مودال USDT */
function TierSwitch() {
  const tier = useQuantStore((s) => s.config.tier);
  const patchConfig = useQuantStore((s) => s.patchConfig);
  const open = useQuantStore((s) => s.usdtModalOpen);
  const setOpen = useQuantStore((s) => s.setUsdtModalOpen);
  const [txid, setTxid] = useState("");
  const [copied, setCopied] = useState(false);
  const [activating, setActivating] = useState(false);

  const WALLET = "TQ8fYr2vNk4mP9xLwD7cHs3EaB6uQzVgRt"; // آدرس شبیه‌ساز TRC-20 (دمو)
  const isVip = tier !== "FREE";

  const activate = () => {
    if (txid.trim().length < 8) {
      toast.warning("شناسه تراکنش (TXID) را وارد کنید — حداقل ۸ کاراکتر");
      return;
    }
    setActivating(true);
    setTimeout(() => {
      patchConfig({ tier: "VIP" });
      setActivating(false);
      setOpen(false);
      setTxid("");
      toast.success("👑 اشتراک VIP فعال شد — همه فلش‌کارت‌های ویژه باز شدند", {
        description: `TXID ثبت‌شده: ${txid.slice(0, 18)}… (شبیه‌ساز اشتراک — دمو)`,
        duration: 6000,
      });
    }, 900);
  };

  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <Crown className="size-3.5 text-amber-400" />
        سطح اشتراک
      </p>
      <div className="flex items-center gap-0.5 rounded-lg border border-white/10 bg-white/[0.03] p-0.5" role="tablist" aria-label="شبیه‌ساز سطح اشتراک">
        {(["FREE", "PRO", "VIP"] as const).map((t) => (
          <Button
            key={t}
            size="sm"
            variant="ghost"
            role="tab"
            aria-selected={tier === t}
            className={cn(
              "h-7 px-2.5 text-[10px] font-bold sm:text-[11px]",
              tier === t
                ? t === "VIP"
                  ? "bg-amber-500/20 text-amber-300"
                  : t === "PRO"
                    ? "bg-cyan-500/20 text-cyan-300"
                    : "bg-emerald-500/20 text-emerald-300"
                : "text-muted-foreground"
            )}
            onClick={() => {
              patchConfig({ tier: t });
              toast.info(t === "FREE" ? "حالت Free — کارت‌های ویژه تار می‌شوند (تیپ B قفل VIP)" : t === "PRO" ? "حالت Pro — کارت‌ها باز شدند" : "حالت VIP — دسترسی کامل", {
                description: "شبیه‌ساز اشتراک برای نمایش تفاوت سطوح",
              });
            }}
          >
            {t === "VIP" && <Crown className="size-3" />}
            {t === "FREE" ? "Free" : t === "PRO" ? "Pro" : "👑 VIP"}
          </Button>
        ))}
      </div>
      {!isVip && (
        <Button
          size="sm"
          className="h-8 w-full gap-1 bg-gradient-to-l from-amber-500 to-amber-400 text-[11px] font-bold text-black hover:from-amber-400 hover:to-amber-300"
          onClick={() => setOpen(true)}
          aria-label="پرداخت رمزارزی USDT و ارتقا به VIP"
        >
          <Wallet className="size-3.5" /> ارتقا با USDT (TRC-20)
        </Button>
      )}

      {/* ═══ مودال پرداخت USDT ═══ */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="border-amber-500/30 bg-[rgba(10,14,24,0.97)] sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-300">
              <Crown className="size-5" /> اشتراک VIP کانال تلگرام — پرداخت USDT
            </DialogTitle>
            <DialogDescription className="text-[11px] leading-5 text-muted-foreground">
              باز کردن تیپ B (پوشش ضریب ~۳) در همه فلش‌کارت‌ها + دریافت خودکار نتیجه تسویه‌شده در کانال VIP.
              این بخش «شبیه‌ساز اشتراک» است — پس از ثبت TXID، فعال‌سازی به‌صورت دمو انجام می‌شود.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2">
                <p className="text-[9px] text-muted-foreground">یک‌ماهه</p>
                <p className="font-num text-sm font-bold text-emerald-300" dir="ltr">25 USDT</p>
              </div>
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 ring-1 ring-amber-500/40">
                <p className="text-[9px] text-amber-200/80">مادام‌العمر ⭐</p>
                <p className="font-num text-sm font-bold text-amber-300" dir="ltr">50 USDT</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.04] p-2">
                <p className="text-[9px] text-muted-foreground">سه‌ماهه</p>
                <p className="font-num text-sm font-bold text-foreground" dir="ltr">60 USDT</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold text-muted-foreground">آدرس کیف پول (شبکه TRC-20):</p>
              <div className="flex items-center gap-1.5">
                <code className="min-w-0 flex-1 truncate rounded-lg border border-white/10 bg-black/40 px-2 py-2 text-[10px] text-amber-200" dir="ltr">
                  {WALLET}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 w-9 shrink-0 border-white/15 p-0"
                  onClick={() => {
                    void navigator.clipboard?.writeText(WALLET);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                  aria-label="کپی آدرس کیف پول"
                >
                  {copied ? <BadgeCheck className="size-4 text-emerald-400" /> : <Copy className="size-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold text-muted-foreground">شناسه تراکنش (TXID) پس از واریز:</p>
              <Input
                dir="ltr"
                placeholder="tx hash از کیف پول شما..."
                value={txid}
                onChange={(e) => setTxid(e.target.value)}
                className="h-9 border-white/10 bg-black/30 text-[11px]"
              />
            </div>
            <Button
              className="h-9 w-full gap-1 bg-gradient-to-l from-amber-500 to-amber-400 text-xs font-bold text-black hover:from-amber-400 hover:to-amber-300"
              onClick={activate}
              disabled={activating}
            >
              {activating ? <Loader2 className="size-4 animate-spin" /> : <Crown className="size-4" />}
              فعال‌سازی اشتراک VIP
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** ═══ ماژول اصلی هیرو ═══ */
export function HeroPerformance({ onOpenSha }: { onOpenSha: () => void }) {
  const [ledger, setLedger] = useState<LedgerDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const { approved, vetoed, scanned } = useSupervisorStats();
  // v11.0-④ — سرمایه نجات‌یافته توسط وتو (زیان کاغذی سایه که واقعی نشد)
  const savedByVeto = Math.max(0, -(ledger?.shadow?.netProfit ?? 0));

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch("/api/settlement/ledger", { cache: "no-store" });
        const data = (await res.json()) as LedgerDTO;
        if (alive && data.success) setLedger(data);
      } catch {
        // خطای شبکه — ویجت با حالت خالی صادقانه رندر می‌شود
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const { winPct, breakdown, curve, roi, settledCount, finalBank } = useMemo(() => {
    const stats = ledger?.stats;
    const settled = stats?.settled ?? 0;
    const wins = (stats?.wonA ?? 0) + (stats?.wonB ?? 0) + (stats?.doubleWin ?? 0);
    const winPct = settled > 0 ? (wins / settled) * 100 : 0;
    const breakdown =
      settled > 0
        ? {
            aWin: ((stats?.wonA ?? 0) / settled) * 100,
            bWin: ((stats?.wonB ?? 0) / settled) * 100,
            double: ((stats?.doubleWin ?? 0) / settled) * 100,
            loss: ((stats?.middleTrap ?? 0) / settled) * 100,
          }
        : null;

    // منحنی واقعی «فقط کارت‌های تایید سوپروایزر» (پول واقعی) — هم‌مبنا با «سود خالص مجموع» کارنامه
    // وتوهای دفتر سایه (تسویه کاغذی) عمداً حذف شده‌اند تا انتهای منحنی با سود خالص تیتر برابر باشد
    const settledSlips = (ledger?.slips ?? [])
      .filter((s) => s.supervisorApproved && s.netProfit !== null && s.settledAt)
      .sort((a, b) => new Date(a.settledAt!).getTime() - new Date(b.settledAt!).getTime());
    let acc = START_BANK;
    const fullCurve = [acc];
    for (const s of settledSlips) {
      acc += s.netProfit ?? 0;
      fullCurve.push(acc);
    }
    const curve = downsampleEvenly(fullCurve, 31);
    const roi = ((acc - START_BANK) / START_BANK) * 100;
    return { winPct, breakdown, curve, roi, settledCount: settled, finalBank: acc };
  }, [ledger]);

  return (
    <section
      className="glass overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-l from-emerald-500/[0.06] via-transparent to-cyan-500/[0.05]"
      aria-label="مرکز فرماندهی عملکرد و وین‌ریت تاییدشده"
    >
      {/* هدر ماژول */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/8 px-4 py-2.5">
        <h2 className="flex items-center gap-2 text-sm font-bold sm:text-base">
          <span aria-hidden>📊</span>
          مرکز فرماندهی عملکرد و وین‌ریت تاییدشده
          <span className="hidden rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-semibold text-emerald-300 sm:inline" dir="ltr">
            Live Verified Win-Rate & ROI Hub
          </span>
        </h2>
        <div className="flex items-center gap-1.5">
          {loading && <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-label="در حال بارگذاری آمار واقعی" />}
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[9px] text-muted-foreground" title="مبنای آمار: کارنامه تسویه خودکار ESPN">
            {settledCount > 0 ? `${faNum(settledCount, 0)} کارت تسویه‌شده ESPN` : "در انتظار اولین تسویه ESPN"}
          </span>
        </div>
      </div>

      {/* چهار ویجت */}
      <div className="grid gap-4 p-4 lg:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
          <WinRateGauge winPct={winPct} breakdown={breakdown} />
        </div>
        <div className="flex flex-col rounded-xl border border-white/8 bg-white/[0.02] p-3">
          <EquitySparkline curve={curve} roi={roi} finalBank={finalBank} />
        </div>
        <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
          <VetoEfficiency approved={approved} vetoed={vetoed} scanned={scanned} savedByVeto={savedByVeto} />
        </div>
        <div className="flex flex-col justify-between gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-3">
          <TierSwitch />
          <Button
            size="sm"
            variant="outline"
            className="h-8 w-full gap-1.5 border-cyan-500/30 text-[10px] text-cyan-300 hover:bg-cyan-500/10"
            onClick={onOpenSha}
            aria-label="دسترسی یک کلیکی به جدول SHA-256 کارنامه"
          >
            <Database className="size-3.5" /> جدول راستی‌آزمایی SHA-256
          </Button>
        </div>
      </div>

      {/* خط لوله جریان داده با ذرات نوری */}
      <div className="border-t border-white/8 px-4 py-3">
        <p className="mb-1 flex items-center gap-1 text-[10px] text-muted-foreground">
          <ShieldCheck className="size-3.5 text-emerald-400" />
          مسیر داده تا تک‌تیپ طلایی — همه اجزا زنده و بدون واسطه انسانی:
        </p>
        <ParticlePipeline />
      </div>
    </section>
  );
}
