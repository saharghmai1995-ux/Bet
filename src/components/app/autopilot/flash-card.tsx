"use client";

// ─────────────────────────────────────────────────────────────────────────────
// فلش‌کارت سه‌بعدی دوطرفه تیپ مکمل (3D Flip Flashcard) — v5.0
//   روی کارت  : تصمیم‌گیری سریع در ۳ ثانیه — زوج‌تیپ دوقلو + الگوی متعامد + اکشن‌ها
//   پشت کارت  : خلاصه مناظره ۳ خطی + مینی‌مپ پوشش ۶×۶ + وضعیت T-60 + تحلیل عمیق LLM
// چرخش با transform-style: preserve-3d و rotateY(180deg)
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import {
  BadgeCheck,
  BrainCircuit,
  Check,
  Copy,
  Award,
  ChevronDown,
  Clock,
  ExternalLink,
  RefreshCw,
  SearchCheck,
  ShieldAlert,
  ShoppingCart,
  Shuffle,
  Sparkles,
  Trophy,
  Scale,
  Banknote,
  AlertTriangle,
  Loader2,
  Zap,
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

/** متن آماده کپی تیپ — v5.0 (متن استاندارد UTF-8، با نام الگوی متعامد) */
export function cardCopyText(v: FlashcardView): string {
  const p = v.pair;
  const head = p.archetype
    ? `⚽ فوتبال‌کوانت v6.0 — ${v.match.homeTeam} مقابل ${v.match.awayTeam} (${v.match.league})
📐 الگوی متعامد: ${p.archetype.short} — زاویه تمایز ۱۰۰٪ (بدون شرط تکراری)`
    : `⚽ فوتبال‌کوانت v6.0 — ${v.match.homeTeam} مقابل ${v.match.awayTeam} (${v.match.league})`;
  return [
    head,
    `🔹 تیپ A (ضریب ${p.totalOddsA.toFixed(2)}): ${p.labelA} ⬅️ مبلغ شرط: ${faNum(p.equalProfit.stakeA, 1)} واحد`,
    `🟢 تیپ B مکمل (ضریب ${p.totalOddsB.toFixed(2)}): ${p.labelB} ⬅️ مبلغ شرط: ${faNum(p.equalProfit.stakeB, 1)} واحد`,
    `✅ پوشش سناریوها: ${(p.archetype ? p.archetype.coveragePct * 100 : (1 - p.jointStates.bothLose) * 100).toFixed(0)}٪ | ریسک باخت همزمان: ${(p.jointStates.bothLose * 100).toFixed(1)}%`,
    `⚖️ ${p.verdict}`,
  ].join("\n");
}

export type DeepLlmState = "IDLE" | "RUNNING" | "CACHED" | "RATELIMITED";

export function FlashCard({
  view,
  inCart,
  onToggleCart,
  compact = false,
  onSwitchArchetype,
  archetypeLoading = false,
  hasArchetypes = false,
  onDeepLlm,
  deepLlmState = "IDLE",
}: {
  view: FlashcardView;
  inCart: boolean;
  onToggleCart: () => void;
  compact?: boolean;
  /** v5.0 — سوییچ بین ۵ الگوی متعامد برای همین بازی */
  onSwitchArchetype?: () => void;
  archetypeLoading?: boolean;
  hasArchetypes?: boolean;
  /** v5.0 — تحلیل عمیق LLM فقط با تقاضای کاربر (کش ۶۰ دقیقه‌ای + صف ۱۵ ثانیه‌ای) */
  onDeepLlm?: () => void;
  deepLlmState?: DeepLlmState;
}) {
  const [flipped, setFlipped] = useState(false);
  const [copied, setCopied] = useState(false);

  const { pair, match } = view;
  const matrix = useMemo(() => buildScoreMatrix(view.lambdaHome, view.lambdaAway), [view.lambdaHome, view.lambdaAway]);
  const coverage = useMemo(() => coverageGrid(pair.structure, match.id, matrix), [pair.structure, match.id, matrix]);
  // v6.0 — شناسه رسمی ESPN برای باکس راستی‌آزمایی (espn-<slug>-<eventId>)
  const verificationEventId = useMemo(() => {
    const ext = match.externalId ?? "";
    return ext.startsWith("espn-") ? (ext.split("-").pop() ?? null) : null;
  }, [match.externalId]);

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
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${TRUST_STYLES[view.trust.kind]}`}>
                <TrustIcon className="size-3" />
                {view.trust.label}
                {view.trust.kind === "GOLD" && (
                  <span className="font-num" dir="ltr">| {Math.round(view.confidence * 100)}%</span>
                )}
              </span>
              {match.weatherAdjusted && (
                <span
                  className="flex items-center gap-1 rounded-full border border-sky-500/40 bg-sky-500/15 px-2 py-0.5 text-[9px] font-semibold text-sky-300"
                  title={`آب‌وهوای واقعی ورزشگاه: ${match.weather ?? ""} — لامبدا −۸٪ اصلاح شد`}
                >
                  🌧️ تعدیل جوی زنده
                </span>
              )}
            </div>
          </div>

          {/* ═══ v5.0 — نوار الگوی متعامد + سوییچر ۵ الگو ═══ */}
          {pair.archetype && (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-fuchsia-500/25 bg-fuchsia-500/[0.07] px-2 py-1" onClick={(e) => e.stopPropagation()}>
              <p className="flex min-w-0 items-center gap-1 text-[10px] font-semibold text-fuchsia-300">
                <Shuffle className="size-3 shrink-0" />
                <span className="truncate">{pair.archetype.short}</span>
                <span className="shrink-0 rounded-full bg-fuchsia-500/20 px-1.5 py-0.5 text-[9px] text-fuchsia-200">۱۰۰٪ متعامد</span>
              </p>
              {onSwitchArchetype && hasArchetypes && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-5 shrink-0 gap-1 rounded-full px-1.5 text-[9px] text-fuchsia-300 hover:bg-fuchsia-500/15"
                  onClick={onSwitchArchetype}
                  disabled={archetypeLoading}
                  aria-label="سوییچ بین ۵ الگوی مکمل متعامد برای همین بازی"
                >
                  {archetypeLoading ? <Loader2 className="size-3 animate-spin" /> : <Shuffle className="size-3" />}
                  الگوی بعدی
                </Button>
              )}
            </div>
          )}

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

          {/* v5.0 — تحلیل عمیق LLM تقاضامحور (کش ۶۰ دقیقه + صف ۱۵ ثانیه) */}
          {onDeepLlm && (
            <div className="rounded-xl border border-cyan-500/25 bg-cyan-500/[0.06] p-2.5" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-1 text-[11px] font-semibold text-cyan-300">
                  <BrainCircuit className="size-3.5" /> تحلیل عمیق LLM برای این بازی
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 border-cyan-500/40 px-2 text-[10px] text-cyan-300 hover:bg-cyan-500/10"
                  onClick={onDeepLlm}
                  disabled={deepLlmState === "RUNNING"}
                  aria-label="اجرای تحلیل عمیق LLM برای این بازی"
                >
                  {deepLlmState === "RUNNING" ? <Loader2 className="size-3 animate-spin" /> : <Zap className="size-3" />}
                  {deepLlmState === "RUNNING" ? "در حال تحلیل…" : deepLlmState === "CACHED" ? "اجرای مجدد" : "اجرای LLM"}
                </Button>
              </div>
              <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
                فقط با کلیک شما اجرا می‌شود — صف حداکثر ۱ درخواست در ۱۵ ثانیه + کش ۶۰ دقیقه‌ای (سپر Rate-Limit)
              </p>
              {deepLlmState === "CACHED" && (
                <p className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-emerald-300">⚡ بارگذاری از کش هوشمند (صرفه‌جویی در نرخ API)</p>
              )}
            </div>
          )}

          {/* v5.0 — روایت الگوی متعامد جاری */}
          {pair.archetype && (
            <div className="rounded-xl border border-fuchsia-500/25 bg-fuchsia-500/[0.05] p-2.5 text-[11px] leading-5">
              <p className="mb-1 flex items-center gap-1 font-semibold text-fuchsia-300">
                <Shuffle className="size-3.5" /> {pair.archetype.name}
              </p>
              <p className="text-muted-foreground">{pair.archetype.rationale}</p>
              <p className="mt-1 text-[10px] text-fuchsia-200/80">
                زاویه تمایز: <b>۱۰۰٪ متعامد — بدون شرط تکراری</b> · پوشش سناریوها: <b dir="ltr">{faNum(pair.archetype.coveragePct * 100, 0)}%</b>
                {pair.archetype.overlapPct > 0.02 && (
                  <> · دو برد همزمان: <b dir="ltr">{faPct(pair.archetype.overlapPct, 1)}</b></>
                )}
              </p>
            </div>
          )}

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
              {coverage.hasOffMatrixLegs && <span className="text-fuchsia-300"> · شامل بازار خارج ماتریس (کرنر/کارت/نیمه اول) — پوشش تخمینی</span>}
            </p>
          </div>

          {/* وضعیت ترکیب T-60 (v6.0 — فقط ESPN واقعی) */}
          <div className="rounded-xl border border-violet-500/25 bg-violet-500/5 p-2.5 text-[11px] leading-5">
            <p className="mb-1 flex items-center gap-1 font-semibold text-violet-300">
              <Sparkles className="size-3.5" /> وضعیت ترکیب T-60 (VAEP واقعی ESPN)
            </p>
            {view.lineup?.success ? (
              <>
                <p className="text-muted-foreground">
                  {view.lineup.mode === "OFFICIAL" ? "ترکیب رسمی اعلام‌شده" : "آمار فصل واقعی (پیش از اعلام)"} · شوک میزبان:{" "}
                  <b className={view.lineup.home.shockDelta < 0 ? "text-rose-300" : "text-emerald-300"} dir="ltr">
                    {faNum(view.lineup.home.shockDelta * 100, 1)}%
                  </b>{" "}
                  · شوک میهمان:{" "}
                  <b className={view.lineup.away.shockDelta < 0 ? "text-rose-300" : "text-emerald-300"} dir="ltr">
                    {faNum(view.lineup.away.shockDelta * 100, 1)}%
                  </b>
                </p>
                {view.lineup.isShock && (
                  <p className="mt-1 flex items-center gap-1 text-violet-200">
                    <AlertTriangle className="size-3 shrink-0 text-violet-400" />
                    {view.lineup.message}
                  </p>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">فهرست بازیکنان واقعی ESPN هنوز واکشی نشده — ضریب بر پایه آمار فصل جدول رسمی است.</p>
            )}
          </div>

          {/* ═══ v6.0 — سند راستی‌آزمایی داده (Data Verification Inspector) ═══ */}
          {verificationEventId && (
            <details className="group rounded-xl border border-cyan-500/25 bg-cyan-500/[0.05] p-2.5 text-[11px] leading-5" onClick={(e) => e.stopPropagation()}>
              <summary className="flex cursor-pointer list-none items-center gap-1.5 font-semibold text-cyan-300" aria-label="راستی‌آزمایی منبع داده">
                <SearchCheck className="size-3.5" />
                راستی‌آزمایی منبع داده (Zero-Mock)
                <ChevronDown className="size-3 transition-transform group-open:rotate-180" />
              </summary>
              <div className="mt-2 space-y-1.5 text-[10px]">
                <p className="flex flex-wrap items-center gap-1">
                  <span className="text-muted-foreground">شناسه رسمی مسابقه در ESPN (Event ID):</span>
                  <b className="font-num" dir="ltr">{verificationEventId}</b>
                  <a
                    href={`https://www.espn.com/soccer/match/_/gameId/${verificationEventId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-0.5 text-cyan-300 hover:underline"
                    title="باز کردن صفحه رسمی مسابقه در ESPN"
                  >
                    espn.com/soccer/match <ExternalLink className="size-2.5" />
                  </a>
                </p>
                {view.match.statsSource === "ESPN_STANDINGS" && (
                  <>
                    <p>
                      <span className="text-muted-foreground">آمار واقعی فصل میزبان:</span> رتبه <b className="font-num" dir="ltr">{faNum(view.match.homeRank ?? 0, 0)}</b> ·{" "}
                      <b className="font-num" dir="ltr">{faNum(view.match.homeGF ?? 0, 0)}</b> گل زده و <b className="font-num" dir="ltr">{faNum(view.match.homeGA ?? 0, 0)}</b> گل خورده در{" "}
                      <b className="font-num" dir="ltr">{faNum(view.match.homeGP ?? 0, 0)}</b> بازی
                    </p>
                    <p>
                      <span className="text-muted-foreground">آمار واقعی فصل میهمان:</span> رتبه <b className="font-num" dir="ltr">{faNum(view.match.awayRank ?? 0, 0)}</b> ·{" "}
                      <b className="font-num" dir="ltr">{faNum(view.match.awayGF ?? 0, 0)}</b> گل زده و <b className="font-num" dir="ltr">{faNum(view.match.awayGA ?? 0, 0)}</b> گل خورده در{" "}
                      <b className="font-num" dir="ltr">{faNum(view.match.awayGP ?? 0, 0)}</b> بازی
                    </p>
                    <p>
                      <span className="text-muted-foreground">میانگین واقعی لیگ:</span>{" "}
                      <b className="font-num" dir="ltr">{faNum((view.match.leagueTeamAvg ?? 0) * 2, 2)}</b> گل در هر بازی · λ = α×β×میانگین×۱.۱۲
                    </p>
                  </>
                )}
                {view.match.statsSource && (
                  <p>
                    <span className="text-muted-foreground">منبع لامبدا:</span>{" "}
                    {view.match.statsSource === "ESPN_STANDINGS" ? "جدول رسمی رده‌بندی ESPN Standings (بدون کلید)" : "رکورد/فرم واقعی ESPN (جدول رده‌بندی در دسترس نبود)"}
                  </p>
                )}
                {view.match.statsFetchedAt && (
                  <p>
                    <span className="text-muted-foreground">زمان دقیق آخرین واکشی از سرور زنده:</span>{" "}
                    <b className="font-num" dir="ltr">{new Date(view.match.statsFetchedAt).toLocaleString("fa-IR")}</b>
                  </p>
                )}
                {view.match.oddsSource && (
                  <p>
                    <span className="text-muted-foreground">منبع ضرایب:</span>{" "}
                    {view.match.oddsSource === "ODDS_API"
                      ? "بوک‌میکرهای واقعی The Odds API v4"
                      : view.match.oddsSource === "ESPN_DRAFTKINGS"
                        ? "خط رسمی ESPN/DraftKings"
                        : "ضریب عادلانه مدل کمّی (پیش از بازگشایی خط بوک‌میکر)"}
                  </p>
                )}
                <p className="text-emerald-300">✅ هیچ بازیکن فرضی، بوک‌میکر ساختگی یا عدد شبیه‌سازی‌شده در این کارت وجود ندارد.</p>
              </div>
            </details>
          )}

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
