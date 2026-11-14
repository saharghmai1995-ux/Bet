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
import { Activity, BadgeCheck, Copy, Crown, Database, Loader2, ScanLine, ShieldCheck, Sparkles, TrendingUp, Wallet, Medal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
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
    // v13.0-⑨ — flex-wrap + عرض ثابت راهنما: متن‌های «برد طلایی همزمان» و «باخت همزمان» هرگز قطع نمی‌شوند
    <div className="flex flex-wrap items-center gap-3">
      <div className="min-w-[150px] shrink-0">
        <svg viewBox="0 0 180 100" className="h-[86px] w-[150px]" role="img" aria-label={`گیج وین‌ریت ترکیبی: ${faNum(winPct, 1)} درصد`}>
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
      </div>
      <div className="min-w-[240px] shrink-0 flex-1 space-y-1 text-[10px] leading-4">
        {breakdown ? (
          <>
            <LegendRow color="bg-sky-400" label="برد تیپ A" value={`${faNum(breakdown.aWin, 1)}٪`} />
            <LegendRow color="bg-emerald-400" label="برد تیپ B" value={`${faNum(breakdown.bWin, 1)}٪`} />
            <LegendRow color="bg-amber-400" label={<span>برد طلایی همزمان <b dir="ltr">(Double-Win)</b></span>} value={`${faNum(breakdown.double, 1)}٪`} />
            <LegendRow color="bg-rose-400" label="باخت همزمان (تله میانی)" value={`${faNum(breakdown.loss, 1)}٪`} />
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

function LegendRow({ color, label, value }: { color: string; label: React.ReactNode; value: string }) {
  return (
    <p className="flex items-center justify-between gap-2">
      <span className="flex min-w-0 items-center gap-1 text-muted-foreground">
        <span className={cn("inline-block size-2 shrink-0 rounded-sm", color)} />
        <span className="whitespace-nowrap">{label}</span>
      </span>
      <b className="font-num shrink-0 text-foreground" dir="ltr">{value}</b>
    </p>
  );
}

// ═══ v19.0 — کارت ویترین اثبات سودآوری ۵ رژیم (5-Regime ROI Breakdown Banner) ═══
// جدول/نوار افرازی بالای مرکز فرماندهی: سود خالص هر استراتژی به‌صورت شفاف —
// افراز مجزا (هر کارت فقط در خط تولید خودش) · اعداد فقط از کارنامه واقعی ESPN.
type RegimeItem = NonNullable<LedgerDTO["regimes"]>[number];

const REGIME_TONES: Record<string, string> = {
  DUAL_HEDGE: "border-cyan-500/25 bg-cyan-500/[0.05] text-cyan-300",
  COMBO: "border-emerald-500/25 bg-emerald-500/[0.05] text-emerald-300",
  CORRECT_SCORE: "border-amber-500/25 bg-amber-500/[0.05] text-amber-300",
  BANKER: "border-sky-500/25 bg-sky-500/[0.05] text-sky-300",
  ACCUMULATOR: "border-fuchsia-500/25 bg-fuchsia-500/[0.05] text-fuchsia-300",
  SNIPER: "border-rose-500/25 bg-rose-500/[0.05] text-rose-300",
};

function RegimeRoiBanner({ regimes }: { regimes: RegimeItem[] | null }) {
  if (!regimes || regimes.length === 0) return null;
  const totalNet = regimes.reduce((a, r) => a + r.netProfit, 0);
  return (
    <div
      className="border-b border-white/8 bg-white/[0.015] px-4 py-3"
      role="table"
      aria-label="افراز سودآوری ۵ رژیم تولید کارت"
    >
      <p className="mb-2 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold text-muted-foreground">
        <Medal className="size-3.5 text-amber-400" aria-hidden />
        ویترین سودآوری ۵ رژیم (افراز مجزا — فقط کارت‌های تاییدشده و تسویه ESPN)
        <b className="font-num text-foreground" dir="ltr">
          {totalNet >= 0 ? "+" : "−"}{faNum(Math.abs(totalNet), 1)}u
        </b>
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        {regimes.map((r) => {
          const tone = REGIME_TONES[r.key] ?? "border-white/10 bg-white/[0.03]";
          return (
            <div key={r.key} className={cn("rounded-lg border px-2.5 py-2", tone)}>
              <p className="flex items-center gap-1 text-[10px] font-bold">
                <span aria-hidden>{r.icon}</span>
                {r.labelFa}
              </p>
              <p className="mt-1 font-num text-sm font-extrabold" dir="ltr">
                {r.netProfit >= 0 ? "+" : "−"}{faNum(Math.abs(r.netProfit), 1)}u
              </p>
              <p className="mt-0.5 text-[9px] leading-3 text-muted-foreground">
                {r.settled > 0 ? (
                  <>
                    وین‌ریت <b className="font-num" dir="ltr">{faNum(r.winRatePct ?? 0, 0)}٪</b>
                    {" · "}میانگین هر برد{" "}
                    <b className="font-num" dir="ltr">
                      {r.avgProfitPerWin != null ? (r.avgProfitPerWin >= 0 ? "+" : "−") + faNum(Math.abs(r.avgProfitPerWin), 1) : "—"}
                    </b>
                    {" · "}{faNum(r.settled, 0)} کارت
                  </>
                ) : (
                  "هنوز کارت تسویه‌شده‌ای در این رژیم نیست"
                )}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * نمونه‌برداری یکنواخت — همیشه نقطه اول و آخر حفظ می‌شود.
 * v13.5.1 — رفع باگ نمایش: فیلتر «حذف تکراری‌های مجاور» حذف شد؛ آن فیلتر
 * ۱) لبه‌های فلات را نگه می‌داشت و ۲) بعد از حذف نقاط میانی، فاصله‌گذاری افقی را به‌هم
 * می‌ریخت (اعوجاج منحنی). اکنون فقط نمونه‌برداری مساوی با حفظ دو سر انجام می‌شود.
 */
function downsampleEvenly(arr: number[], maxPts: number): number[] {
  if (arr.length <= maxPts) return arr;
  const out: number[] = [];
  for (let i = 0; i < maxPts - 1; i++) {
    out.push(arr[Math.round((i * (arr.length - 1)) / (maxPts - 1))]);
  }
  out.push(arr[arr.length - 1]);
  return out;
}

/** منحنی اسپارک‌لاین رشد سرمایه (SVG متحرک با draw-in) — v13.5.1 با خط مرجع ۱۰۰۰ + محور تاریخ */
function EquitySparkline({
  curve,
  roi,
  finalBank,
  basis,
  firstSettledAt,
  lastSettledAt,
}: {
  curve: number[];
  roi: number;
  finalBank: number;
  basis: number;
  firstSettledAt: string | null;
  lastSettledAt: string | null;
}) {
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
  const yOf = (v: number) => H - 8 - ((v - min) / span) * (H - 20);
  const coords = pts.map((v, i) => [i * step, yOf(v)] as const);
  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;
  const baseY = yOf(START_BANK);
  const up = roi >= 0;
  // v13.5.1 — برچسب محور زمان: اولین و آخرین تسویه واقعی منحنی (شمسی/میلادی کوتاه)
  const dateLbl = (iso: string | null) =>
    iso
      ? new Intl.DateTimeFormat("fa-IR", { month: "short", day: "numeric" }).format(new Date(iso))
      : null;
  const fromLbl = dateLbl(firstSettledAt);
  const toLbl = dateLbl(lastSettledAt);

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
        {/* خط مرجع بانک ۱۰۰۰ واحدی — مبنا همیشه دیده می‌شود حتی وقتی منحنی تخت است */}
        <line x1="0" y1={baseY} x2={W} y2={baseY} stroke="rgba(255,255,255,0.22)" strokeWidth="1" strokeDasharray="4 4" />
        <text x="2" y={baseY - 3} fontSize="7.5" fill="rgba(255,255,255,0.45)">1000</text>
        <path d={area} fill="url(#eq-fill)" style={{ opacity: drawn ? 1 : 0, transition: "opacity 1.2s ease 0.5s" }} />
        {/** v13.5 — رفع باگ نمایش: dasharray ثابت ۶۰۰ بعد از طول مسیر بیش از ۶۰۰، بخش‌هایی از خط را نامرئی می‌کرد؛ با pathLength=1 نرمال شد */}
        <path
          d={line}
          fill="none"
          stroke={up ? "#34d399" : "#fb7185"}
          strokeWidth="2.4"
          strokeLinecap="round"
          pathLength={1}
          style={{
            strokeDasharray: 1,
            strokeDashoffset: drawn ? 0 : 1,
            transition: "stroke-dashoffset 1.8s cubic-bezier(0.22,1,0.36,1)",
            filter: "drop-shadow(0 0 5px rgba(52,211,153,0.55))",
          }}
        />
        <circle cx={coords[coords.length - 1][0]} cy={coords[coords.length - 1][1]} r="3.4" fill={up ? "#6ee7b7" : "#fda4af"}>
          <animate attributeName="r" values="3;4.4;3" dur="1.6s" repeatCount="indefinite" />
        </circle>
      </svg>
      <p className="mt-0.5 flex items-center justify-between gap-2 text-[9px] text-muted-foreground/70" dir="ltr">
        <span>START 1,000u → END {faNum(Math.round(finalBank), 0)}u · {faNum(basis, 0)} real settled cards</span>
        {fromLbl && toLbl && (
          <span className="shrink-0 tabular-nums" dir="rtl">
            {fromLbl} ← {toLbl}
          </span>
        )}
      </p>
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
        از <b className="font-num text-foreground" dir="ltr">{faNum(scanned, 0)}</b> بازی اسکن‌شده — بازی‌های پرریسک با گیت سخت v16.0 (۱۰.۵٪) وتو شده‌اند.
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
              // v13.0-⑤ — تاج VIP از کادر بیرون نمی‌زند
              "h-7 whitespace-nowrap px-3 py-1.5 text-[10px] font-bold sm:text-[11px]",
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

/**
 * v18.0 — 🥈 سوییچ تاج نقره‌ای (شکارچی آلفای دفتر سایه — Tier-2 Shadow Alpha Harvester):
 * روشن = کارت‌های سطح ۲ (winProb ≥ ۸۴٪ و شارپ ≥ ۰.۱۶ لیگ معتبر) با استیک نصف ۵۰ واحدی
 * Half-Kelly در دک فلش‌کارت ظاهر می‌شوند و سود واقعی تسویه‌شده‌شان («تزریق از دفتر سایه»)
 * روی منحنی/تیتر بانک اضافه می‌شود. خاموش = فقط تاج‌های طلایی سطح ۱ (استیک کامل ۱۰۰u).
 */
function SilverCrownSwitch() {
  const shadowHarvestOn = useQuantStore((s) => s.config.shadowHarvestOn);
  const patchConfig = useQuantStore((s) => s.patchConfig);

  return (
    <div className="space-y-2 rounded-xl border border-zinc-500/25 bg-zinc-500/[0.06] p-3" dir="rtl">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1 text-[10px] text-zinc-300">
          <Medal className="size-3.5 text-zinc-400" />
          تاج نقره‌ای سطح ۲ (استیک نصف)
        </p>
        <Switch
          checked={shadowHarvestOn}
          onCheckedChange={(v) => {
            patchConfig({ shadowHarvestOn: v });
            toast.info(
              v
                ? "🥈 تاج نقره‌ای فعال شد — کارت‌های شکارچی آلفای سایه (استیک ۵۰ واحدی) به دک و منحنی بانک اضافه شدند"
                : "فقط تاج‌های طلایی سطح ۱ نمایش داده می‌شود — کتاب نقره‌ای مخفی شد",
              { description: "سیستم دو‌سطحی تاج v18.0 — استیک نقره‌ای = نصف کلِی (Half-Kelly)" }
            );
          }}
          aria-label="سوییچ فعال‌سازی تاج نقره‌ای سطح ۲"
        />
      </div>
      <p className="text-[9px] leading-4 text-muted-foreground">
        کارت‌های نزدیک-به-وتو با winProb ≥ ۸۴٪ و شارپ ≥ ۰.۱۶ به‌جای حبس در دفتر کاغذی، با نشان 🥈 و استیک نصف‌شده ۵۰ واحدی منتشر می‌شوند.
      </p>
    </div>
  );
}

/**
 * v18.0 — نبض کارنامه (Ledger Pulse):
 * پاسخ صادقانه و مهندسی‌شده به «چرا عملکرد/وین‌ریت/منحنی تغییری نکرده؟»:
 *   ۱) آمار رسمی فقط از کارت‌های تاییدشده سوپروایزر ساخته می‌شود (پول واقعی).
 *   ۲) اگر گیت v16 همه کارت‌های تازه را وتو کند، منحنی تخت می‌ماند — اینجا عددی
 *      شفاف می‌شود (وتوها، کارت در انتظار FT، آخرین تسویه رسمی).
 *   ۳) دفتر سایه (تسویه کاغذی وتوها) کنارش نمایش داده می‌شود تا همیشه عدد زنده باشد.
 *   ۴) خود ماژول هر ۹۰ ثانیه رفرش می‌شود تا تسویه‌های تازه فوری ظاهر شوند.
 */
function LedgerPulse({ ledger, savedByVeto }: { ledger: LedgerDTO | null; savedByVeto: number }) {
  const pulse = ledger?.pulse;
  const shadow = ledger?.shadow;
  const silver = ledger?.silverHarvest;
  if (!pulse) return null;

  const rel = (iso: string | null) => {
    if (!iso) return null;
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.round(diffMs / 60_000);
    if (mins < 1) return "همین حالا";
    if (mins < 60) return `${faNum(mins, 0)} دقیقه پیش`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${faNum(hours, 0)} ساعت پیش`;
    const days = Math.round(hours / 24);
    return `${faNum(days, 0)} روز پیش`;
  };
  const lastSettled = rel(pulse.lastSettledAt);
  const frozen = pulse.settled7d === 0;

  const chip = (label: string, value: string, tone: string) => (
    <span className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/25 px-2 py-1 text-[10px]" title={label}>
      <span className="text-muted-foreground">{label}</span>
      <b className={cn("font-num", tone)} dir="ltr">{value}</b>
    </span>
  );

  return (
    <div className="space-y-2 border-b border-white/8 bg-gradient-to-l from-cyan-500/[0.05] to-transparent px-4 py-2.5" role="status" aria-label="نبض کارنامه">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="flex items-center gap-1 text-[10px] font-bold text-cyan-300">
          <Activity className="size-3.5" aria-hidden /> نبض کارنامه:
        </span>
        {chip("آخرین تسویه رسمی", lastSettled ?? "—", "text-foreground/90")}
        {chip("تسویه ۷ روز اخیر", faNum(pulse.settled7d, 0), pulse.settled7d > 0 ? "text-emerald-300" : "text-amber-300")}
        {chip("در انتظار FT", faNum(pulse.pendingApproved, 0), "text-cyan-300")}
        {chip("وتوی سوپروایزر", faNum(pulse.vetoedTotal, 0), "text-rose-300")}
        {chip("دفتر سایه (کاغذی)", `${shadow ? faNum(shadow.settled, 0) : faNum(0, 0)} کارت · ${shadow?.winRate != null ? faNum(shadow.winRate, 1) + "٪" : "—"} · ${faNum(shadow?.netProfit ?? 0, 1)}u`, "text-muted-foreground")}
        {silver && silver.settled > 0 && chip("🥈 حصاد نقره‌ای", `${faNum(silver.settled, 0)} کارت · ${silver.winRate != null ? faNum(silver.winRate, 1) + "٪" : "—"} · +${faNum(silver.netProfit, 1)}u`, "text-zinc-200")}
        {savedByVeto > 0 && chip("سرمایه نجات‌یافته", `+${faNum(savedByVeto, 1)}u`, "text-amber-300")}
      </div>
      {frozen ? (
        <p className="rounded-lg border border-amber-500/35 bg-amber-500/[0.08] px-2 py-1.5 text-[10px] leading-4 text-amber-200">
          <b>وضعیت فعلی: کتاب رسمی در انتظار کارت تازه است.</b> آمار و منحنی فقط از کارت‌های «تایید سوپروایزر با پول واقعی» ساخته می‌شوند؛ {faNum(pulse.vetoedTotal, 0)} کاندیدای پرریسک توسط گیت سخت v16.0 (ریسک همزمان &gt; ۱۰.۵٪ / لیگ‌های سمّی / فاوریت بدون برتری واضح) به دفتر سایه رفت‌اند — به‌محض تایید اولین کارت امروز، منحنی و وین‌ریت همین‌جا به‌روز می‌شود (رفرش خودکار هر ۹۰ ثانیه).
        </p>
      ) : (
        <p className="text-[10px] leading-4 text-muted-foreground">
          تسویه‌های رسمی در جریان‌اند — آمار این ماژول هر ۹۰ ثانیه خودکار رفرش می‌شود؛ منحنی انتهایش دقیقاً برابر «سود خالص مجموع» است.
        </p>
      )}
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
  // v18.0 — سوییچ تاج نقره‌ای: وقتی روشن است، سود واقعی کارت‌های سطح ۲ روی تیتر بانک اضافه می‌شود
  const shadowHarvestOn = useQuantStore((s) => s.config.shadowHarvestOn);

  // v18.0 — بارگذاری تکرارشونده: هر ۹۰ ثانیه خودکار رفرش می‌شود تا به‌محض تسویه ESPN
  // جدید، وین‌ریت/منحنی/عملکرد بدون reload مرورگر به‌روز شوند (رفع «تغییری نکرده»).‌
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/settlement/ledger", { cache: "no-store" });
        const data = (await res.json()) as LedgerDTO;
        if (alive && data.success) setLedger(data);
      } catch {
        // خطای شبکه — ویجت با آخرین دیتای سالم رندر می‌ماند
      } finally {
        if (alive) setLoading(false);
      }
    };
    void load();
    const t = setInterval(() => void load(), 90_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const { winPct, breakdown, curve, roi, settledCount, finalBank, curveBasis, eqFrom, eqTo, silverAdded, silverSettled } = useMemo(() => {
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

    // v18.0 — حصاد نقره‌ای: وقتی سوییچ تاج نقره‌ای روشن است، سود واقعی کارت‌های سطح ۲
    // (تسویه‌شده با استیک ۵۰ واحدی) روی تیتر بانک اضافه می‌شود — همان تزریق +X واحد از دل دفتر سایه.
    const silver = ledger?.silverHarvest;
    const silverNetOn = shadowHarvestOn && silver ? silver.netProfit : 0;
    const silverSettledOn = shadowHarvestOn && silver ? silver.settled : 0;
    // v13.5 — منحنی از سرور می‌آید: «تمام تاریخ» کارت‌های تاییدشده غیربازخوانی؛
    // دیگر به ۱۲۰ ردیف آخر محدود نیست و کارت‌های بازخوانی (retroIssued) هم در آن نیستند،
    // پس انتهای منحنی دقیقاً برابر «سود خالص مجموع» تیتر است.
    const eq = ledger?.equity;
    if (eq && Array.isArray(eq.points) && eq.points.length >= 2) {
      return {
        winPct,
        breakdown,
        curve: downsampleEvenly(eq.points, 31),
        roi: Math.round(((eq.finalBank + silverNetOn - START_BANK) / START_BANK) * 1000) / 10,
        settledCount: settled + (shadowHarvestOn && silver ? silver.settled : 0),
        finalBank: Math.round((eq.finalBank + silverNetOn) * 100) / 100,
        curveBasis: eq.basis + silverSettledOn,
        eqFrom: eq.firstSettledAt ?? null,
        eqTo: eq.lastSettledAt ?? null,
        silverAdded: silverNetOn,
        silverSettled: silverSettledOn,
      };
    }
    // فالبک سمت کلاینت (نسخه قدیمی API) — با فیلتر کامل شامل حذف بازخوانی‌ها
    const settledSlips = (ledger?.slips ?? [])
      .filter((s) => s.supervisorApproved && !s.retroIssued && s.netProfit !== null && s.settledAt)
      .sort((a, b) => new Date(a.settledAt!).getTime() - new Date(b.settledAt!).getTime());
    let acc = START_BANK;
    const fullCurve = [acc];
    for (const s of settledSlips) {
      acc += s.netProfit ?? 0;
      fullCurve.push(acc);
    }
    const curve = downsampleEvenly(fullCurve, 31);
    const accWithSilver = acc + silverNetOn;
    const roi = ((accWithSilver - START_BANK) / START_BANK) * 100;
    const times = settledSlips.map((s) => s.settledAt!).filter(Boolean);
    return {
      winPct,
      breakdown,
      curve,
      roi,
      settledCount: settled + (shadowHarvestOn && silver ? silver.settled : 0),
      finalBank: Math.round(accWithSilver * 100) / 100,
      curveBasis: settledSlips.length + silverSettledOn,
      eqFrom: times[0] ?? null,
      eqTo: times[times.length - 1] ?? null,
      silverAdded: silverNetOn,
      silverSettled: silverSettledOn,
    };
  }, [ledger, shadowHarvestOn]);

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

      {/* ═══ v19.0 — ویترین ۵ رژیم (سود خالص هر خط تولید — افراز مجزا) ═══ */}
      <RegimeRoiBanner regimes={ledger?.regimes ?? null} />

      {/* نبض کارنامه — v18.0: تشخیص شفاف «چرا آمار تغییر می‌کند/نمی‌کند» + دفتر سایه زنده */}
      <LedgerPulse ledger={ledger} savedByVeto={savedByVeto} />

      {/* چهار ویجت */}
      <div className="grid gap-4 p-4 lg:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
          <WinRateGauge winPct={winPct} breakdown={breakdown} />
        </div>
        <div className="flex flex-col rounded-xl border border-white/8 bg-white/[0.02] p-3">
          <EquitySparkline curve={curve} roi={roi} finalBank={finalBank} basis={curveBasis} firstSettledAt={eqFrom} lastSettledAt={eqTo} />
        </div>
        <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
          <VetoEfficiency approved={approved} vetoed={vetoed} scanned={scanned} savedByVeto={savedByVeto} />
        </div>
        <div className="flex flex-col justify-between gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-3">
          <TierSwitch />
          {/* v18.0 — سوییچ تاج نقره‌ای (شکارچی آلفای دفتر سایه) */}
          <SilverCrownSwitch />
          {shadowHarvestOn && silverAdded !== 0 && (
            <p className="rounded-lg border border-zinc-500/30 bg-zinc-500/[0.08] px-2 py-1.5 text-[10px] text-zinc-200" role="status">
              🥈 تزریق واقعی از دل دفتر سایه: <b className="font-num" dir="ltr">{silverAdded >= 0 ? "+" : "−"}{faNum(Math.abs(silverAdded), 1)}u</b> از {faNum(silverSettled, 0)} کارت نقره‌ای تسویه‌شده (استیک ۵۰ واحدی)
            </p>
          )}
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
