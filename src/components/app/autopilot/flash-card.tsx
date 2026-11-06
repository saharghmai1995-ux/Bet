"use client";

// ─────────────────────────────────────────────────────────────────────────────
// فلش‌کارت سه‌بعدی دوطرفه تیپ مکمل (3D Flip Flashcard) — v3.0
//   روی کارت  : تصمیم‌گیری سریع در ۳ ثانیه — زوج‌تیپ دوقلو + شاخص‌ها + اکشن‌ها
//   پشت کارت  : خلاصه مناظره ۳ خطی + مینی‌مپ پوشش ۶×۶ + وضعیت T-60
// چرخش با transform-style: preserve-3d و rotateY(180deg)
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import {
  BadgeCheck,
  Check,
  Copy,
  Award,
  Clock,
  RefreshCw,
  ShieldAlert,
  ShoppingCart,
  Sparkles,
  Trophy,
  Scale,
  Banknote,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildScoreMatrix, coverageGrid, coverColor } from "@/lib/engine/coverage";
import { faNum, faPct } from "@/lib/format";
import type { FlashcardView } from "@/lib/autopilot-types";

const TRUST_STYLES: Record<FlashcardView["trust"]["kind"], string> = {
  GOLD: "border-amber-400/50 bg-amber-400/15 text-amber-300 shadow-[0_0_14px_rgba(251,191,36,0.35)]",
  T60: "border-violet-400/50 bg-violet-400/15 text-violet-300 shadow-[0_0_14px_rgba(167,139,250,0.3)]",
  SILVER: "border-zinc-400/30 bg-zinc-400/10 text-zinc-300",
};

const TRUST_ICONS: Record<FlashcardView["trust"]["kind"], typeof Award> = {
  GOLD: Award,
  T60: Sparkles,
  SILVER: BadgeCheck,
};

/** متن آماده کپی تیپ */
export function cardCopyText(v: FlashcardView): string {
  const p = v.pair;
  return [
    `⚽ ${v.match.homeTeam} - ${v.match.awayTeam} (${v.match.league}) · ${v.match.kickoff}`,
    `🔵 تیپ A: ${p.labelA} | ضریب ${p.totalOddsA.toFixed(2)} | استیک ${faNum(p.equalProfit.stakeA, 1)}`,
    `🟢 تیپ B: ${p.labelB} | ضریب ${p.totalOddsB.toFixed(2)} | استیک ${faNum(p.equalProfit.stakeB, 1)}`,
    `💰 سود تضمینی داچینگ: ${faPct(p.guaranteedMarginPct / 100)} | ریسک باخت همزمان: ${faPct(p.jointStates.bothLose)}`,
    `⚖️ ${p.verdict} — فوتبال‌کوانت v3.0`,
  ].join("\n");
}

export function FlashCard({
  view,
  inCart,
  onToggleCart,
  compact = false,
}: {
  view: FlashcardView;
  inCart: boolean;
  onToggleCart: () => void;
  compact?: boolean;
}) {
  const [flipped, setFlipped] = useState(false);
  const [copied, setCopied] = useState(false);

  const { pair, match } = view;
  const matrix = useMemo(() => buildScoreMatrix(view.lambdaHome, view.lambdaAway), [view.lambdaHome, view.lambdaAway]);
  const coverage = useMemo(() => coverageGrid(pair.structure, match.id, matrix), [pair.structure, match.id, matrix]);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    void navigator.clipboard?.writeText(cardCopyText(view));
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const TrustIcon = TRUST_ICONS[view.trust.kind];
  const marginPct = pair.guaranteedMarginPct;
  const bothLosePct = pair.jointStates.bothLose * 100;
  const riskTone = bothLosePct < 8 ? "text-emerald-400" : bothLosePct < 15 ? "text-amber-400" : "text-rose-400";
  const riskBar = bothLosePct < 8 ? "bg-emerald-500" : bothLosePct < 15 ? "bg-amber-500" : "bg-rose-500";

  return (
    <div className={`[perspective:1400px] ${compact ? "h-[430px]" : "h-[470px]"} w-full`}>
      <div
        role="button"
        tabIndex={0}
        aria-pressed={flipped}
        aria-label={`فلش‌کارت ${match.homeTeam} مقابل ${match.awayTeam} — برای چرخش کلیک کنید`}
        onClick={() => setFlipped((f) => !f)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setFlipped((f) => !f);
          }
        }}
        className="glass relative size-full cursor-pointer rounded-2xl border border-white/10 [transform-style:preserve-3d] transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{ transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)" }}
      >        {/* ═══════════ روی کارت ═══════════ */}
        <div aria-hidden={flipped} className="absolute inset-0 flex flex-col gap-3 rounded-2xl bg-[rgba(10,14,24,0.92)] p-4 [backface-visibility:hidden]">
          {/* هدر */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <span className="inline-block size-1.5 rounded-full bg-cyan-400" />
                {match.league}
                <Clock className="size-3" />
                <span dir="ltr">{new Date(match.kickoff).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
              <h3 className="truncate text-sm font-bold sm:text-base">
                {match.homeTeam} <span className="text-muted-foreground">×</span> {match.awayTeam}
              </h3>
            </div>
            <span className={`flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${TRUST_STYLES[view.trust.kind]}`}>
              <TrustIcon className="size-3" />
              {view.trust.label}
              {view.trust.kind === "GOLD" && (
                <span className="font-num" dir="ltr">| {Math.round(view.confidence * 100)}%</span>
              )}
            </span>
          </div>

          {/* باکس دوقلوی تیپ مکمل */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-2.5">
              <p className="mb-1 flex items-center gap-1 text-[9px] font-semibold text-sky-300">
                <span className="inline-block size-2 rounded-sm bg-sky-500" />
                تیپ A — ضریب هدف ~۲
              </p>
              <p className="line-clamp-3 min-h-[42px] text-[11px] leading-4 text-foreground/90">{pair.labelA}</p>
              <div className="mt-1.5 flex items-end justify-between gap-1">
                <div>
                  <p className="text-[9px] text-muted-foreground">ضریب</p>
                  <p className="font-num text-base font-bold text-sky-300" dir="ltr">{pair.totalOddsA.toFixed(2)}</p>
                </div>
                <div className="text-left">
                  <p className="text-[9px] text-muted-foreground">استیک خودکار</p>
                  <p className="font-num text-base font-bold text-foreground" dir="ltr">{faNum(pair.equalProfit.stakeA, 1)}</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2.5">
              <p className="mb-1 flex items-center gap-1 text-[9px] font-semibold text-emerald-300">
                <span className="inline-block size-2 rounded-sm bg-emerald-500" />
                تیپ B مکمل — ضریب ~۳
              </p>
              <p className="line-clamp-3 min-h-[42px] text-[11px] leading-4 text-foreground/90">{pair.labelB}</p>
              <div className="mt-1.5 flex items-end justify-between gap-1">
                <div>
                  <p className="text-[9px] text-muted-foreground">ضریب</p>
                  <p className="font-num text-base font-bold text-emerald-300" dir="ltr">{pair.totalOddsB.toFixed(2)}</p>
                </div>
                <div className="text-left">
                  <p className="text-[9px] text-muted-foreground">استیک خودکار</p>
                  <p className="font-num text-base font-bold text-foreground" dir="ltr">{faNum(pair.equalProfit.stakeB, 1)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* شاخص‌های کلیدی */}
          <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1 text-muted-foreground">
                <Banknote className="size-3.5 text-emerald-400" /> سود خالص تضمینی داچینگ
              </span>
              <b className="text-emerald-300" dir="ltr">
                +{faNum(marginPct, 1)}% ({faNum(pair.equalProfit.profit, 1)})
              </b>
            </div>
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="flex items-center gap-1 text-muted-foreground">
                <ShieldAlert className="size-3.5 text-amber-400" /> ریسک باخت همزمان
              </span>
              <span className="flex items-center gap-1.5">
                <b className={riskTone} dir="ltr">{faNum(bothLosePct, 1)}%</b>
                <span className={`text-[9px] ${riskTone}`}>{bothLosePct < 8 ? "بسیار امن" : bothLosePct < 15 ? "قابل قبول" : "پرریسک"}</span>
              </span>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
              <div className={`h-1 rounded-full ${riskBar} transition-all`} style={{ width: `${Math.min(100, bothLosePct * 2.5)}%` }} />
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1 text-muted-foreground">
                <Trophy className="size-3.5 text-cyan-400" /> ارزش نسبت به خط پیناکل
              </span>
              <b className={pair.sharpEdgePct !== null && pair.sharpEdgePct > 0 ? "text-cyan-300" : "text-muted-foreground"} dir="ltr">
                {pair.sharpEdgePct !== null ? `${pair.sharpEdgePct > 0 ? "+" : ""}${faNum(pair.sharpEdgePct, 1)}% CLV` : "—"}
              </b>
            </div>
          </div>

          {/* دکمه‌های عملیاتی */}
          <div className="mt-auto grid grid-cols-[1fr_1fr_auto] gap-1.5" onClick={(e) => e.stopPropagation()}>
            <Button
              size="sm"
              className="h-8 gap-1 bg-gradient-to-l from-amber-500/80 to-amber-400/80 text-[11px] text-black hover:from-amber-500 hover:to-amber-400"
              onClick={() => setFlipped((f) => !f)}
              aria-label="چرخش کارت و مشاهده تحلیل"
            >
              <RefreshCw className="size-3.5" /> چرخش کارت
            </Button>
            <Button
              size="sm"
              variant="outline"
              className={`h-8 gap-1 border-white/15 text-[11px] ${inCart ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300" : "text-foreground/80"}`}
              onClick={onToggleCart}
              aria-label={inCart ? "حذف زوج‌تیپ از سبد" : "افزودن زوج‌تیپ به سبد روزانه"}
            >
              {inCart ? <Check className="size-3.5" /> : <ShoppingCart className="size-3.5" />}
              {inCart ? "در سبد" : "افزودن به سبد"}
            </Button>
            <Button size="sm" variant="outline" className="h-8 w-9 border-white/15 p-0 text-muted-foreground" onClick={handleCopy} aria-label="کپی سریع تیپ">
              {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
            </Button>
          </div>

          {pair.structure.doubleWin && (
            <p className="flex items-center justify-center gap-1 text-[10px] font-semibold text-amber-300">
              <Sparkles className="size-3" /> فرصت Double-Win — هر دو تیپ می‌توانند همزمان ببرند
            </p>
          )}
        </div>

        {/* ═══════════ پشت کارت ═══════════ */}
        <div
          aria-hidden={!flipped}
          className="absolute inset-0 flex flex-col gap-3 overflow-y-auto rounded-2xl border border-white/10 bg-[rgba(8,12,22,0.96)] p-4 [backface-visibility:hidden] [transform:rotateY(180deg)]"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="flex items-center gap-1.5 text-xs font-bold">
            <Scale className="size-4 text-cyan-400" /> کالبدشکافی تحلیلی — {match.homeTeam} × {match.awayTeam}
          </p>

          {/* خلاصه مناظره در ۳ خط */}
          <div className="space-y-1.5 rounded-xl border border-white/10 bg-white/[0.03] p-2.5 text-[11px] leading-5">
            <p className="flex gap-1.5">
              <span className="shrink-0" aria-hidden>🐂</span>
              <span><b className="text-rose-300">برهان گاو:</b> {view.bullLine}</span>
            </p>
            <p className="flex gap-1.5">
              <span className="shrink-0" aria-hidden>🐻</span>
              <span><b className="text-amber-300">برهان خرس:</b> {view.bearLine}</span>
            </p>
            <p className="flex gap-1.5">
              <span className="shrink-0" aria-hidden>⚖️</span>
              <span><b className="text-cyan-300">حکم قاضی کمّی:</b> {view.judgeLine}</span>
            </p>
          </div>

          {/* مینی‌مپ پوشش ۶×۶ */}
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
            <div className="mb-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
              <span>مینی‌مپ پوشش نتیجه ۶×۶ (میزبان ↓ × میهمان →)</span>
              <span className="flex items-center gap-2">
                <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-sky-500" /> تیپ A</span>
                <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-emerald-500" /> تیپ B</span>
                <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-amber-400" /> دو برد</span>
              </span>
            </div>
            <div className="grid grid-cols-6 gap-0.5" aria-label="نقشه پوشش نتایج">
              {coverage.cells.flat().map((c) => (
                <div
                  key={`${c.h}-${c.a}`}
                  title={`نتیجه ${c.h}-${c.a} · احتمال ${faPct(c.p)}`}
                  className={`flex h-6 items-center justify-center rounded-[3px] text-[8px] ${coverColor(c.kind)}`}
                >
                  <span className={c.kind === "NONE" ? "" : "font-num"} dir="ltr">
                    {c.h}-{c.a}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-1.5 text-[10px] text-muted-foreground">
              پوشش کل نتایج: <b className="text-foreground" dir="ltr">{faNum(coverage.stats.coveredPct, 0)}%</b>
              {coverage.stats.bothCells > 0 && (
                <> · ناحیه طلایی: <b className="text-amber-300" dir="ltr">{faNum(coverage.stats.bothWinProb * 100, 1)}%</b> شانس دو برد همزمان</>
              )}
              {coverage.isConditional && <span className="text-amber-300"> · پوشش مشروط (پایه مشترک روی این بازی)</span>}
            </p>
          </div>

          {/* وضعیت ترکیب T-60 */}
          <div className="rounded-xl border border-violet-500/25 bg-violet-500/5 p-2.5 text-[11px] leading-5">
            <p className="mb-1 flex items-center gap-1 font-semibold text-violet-300">
              <Sparkles className="size-3.5" /> وضعیت ترکیب T-60 (VAEP/xT)
            </p>
            {view.lineup?.success ? (
              <>
                <p className="text-muted-foreground">
                  شوک میزبان: <b className={view.lineup.home.shockDelta < 0 ? "text-rose-300" : "text-emerald-300"} dir="ltr">
                    {faNum(view.lineup.home.shockDelta * 100, 1)}%
                  </b>{" "}
                  · شوک میهمان: <b className={view.lineup.away.shockDelta < 0 ? "text-rose-300" : "text-emerald-300"} dir="ltr">
                    {faNum(view.lineup.away.shockDelta * 100, 1)}%
                  </b>{" "}
                  · غایب: <b dir="ltr">{faNum(view.lineup.home.unavailableCount + view.lineup.away.unavailableCount, 0)}</b>
                </p>
                {view.lineup.isShock && (
                  <p className="mt-1 flex items-center gap-1 text-violet-200">
                    <AlertTriangle className="size-3 shrink-0 text-violet-400" />
                    {view.lineup.message}
                  </p>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">گزارش ترکیب هنوز منتشر نشده — ضریب بر پایه قدرت کامل تیم‌هاست.</p>
            )}
          </div>

          <Button
            size="sm"
            variant="outline"
            className="mt-auto h-8 gap-1.5 border-white/15 text-[11px]"
            onClick={() => setFlipped(false)}
            aria-label="بازگشت به روی کارت"
          >
            <RefreshCw className="size-3.5" /> بازگشت به روی کارت
          </Button>
        </div>
      </div>
    </div>
  );
}
