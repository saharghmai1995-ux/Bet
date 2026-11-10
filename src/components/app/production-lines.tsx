"use client";

// ─────────────────────────────────────────────────────────────────────────────
// ۳ خط تولید مجزا (3 Mutually Exclusive Slip Tiers) — v13.0
//   خط ۱ Single Dual-Hedge  → فلش‌کارت‌های تاییدشده سوپروایزر (کارت کامل)
//   خط ۲ Smart Combos       → میکس ۲ تایی امن + میکس ۳ تایی طلایی + پوشش ضدباخت
//   خط ۳ High-Odds Sniper   → شکار +EV ≥ ۱۲٪ در ضرایب ۴.۰۰–۹.۵۰ (استیک کلِی ۰.۱۵)
// افراز مجزا: هر خط استیک و حساب مستقل خودش را دارد — دوباره‌شماری ممنوع.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { Crosshair, Layers, Link2, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useFlashcards } from "@/lib/autopilot-derive";
import { buildSmartCombos, findSniperShots, type SmartCombo, type SniperShot } from "@/lib/engine/tiers";
import { faNum } from "@/lib/format";
import { cn } from "@/lib/utils";

type TierKey = "SINGLE" | "COMBO" | "SNIPER";

const TIERS: { key: TierKey; label: string; icon: typeof Layers; tone: string }[] = [
  { key: "SINGLE", label: "۱️⃣ تک‌بازی دوهج (Single Dual-Hedge) · ~2.0 & ~3.0", icon: ShieldCheck, tone: "emerald" },
  { key: "COMBO", label: "۲️⃣ میکس ۲/۳ تایی (Smart Combos) · 2.7–3.5x / 4.4–6.8x", icon: Link2, tone: "cyan" },
  { key: "SNIPER", label: "۳️⃣ تک‌تیرانداز (High-Odds Sniper) · 4.0–9.5x · +EV ≥ 12%", icon: Crosshair, tone: "violet" },
];

function timeFa(iso: string): string {
  return new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit", weekday: "short", day: "numeric", month: "long", timeZone: "Asia/Tehran" }).format(new Date(iso));
}

function ComboCard({ combo }: { combo: SmartCombo }) {
  return (
    <div className={cn("space-y-2 rounded-xl border p-3", combo.kind === "TREBLE_3_LEG" ? "border-amber-500/40 bg-amber-500/[0.05]" : "border-cyan-500/40 bg-cyan-500/[0.05]")}>
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <p className="text-[11px] font-bold text-foreground/90">{combo.kindLabel}</p>
        <Badge variant="outline" className={cn("gap-1 text-[9px]", combo.kind === "TREBLE_3_LEG" ? "border-amber-500/50 text-amber-300" : "border-cyan-500/50 text-cyan-300")} dir="ltr">
          {combo.totalOdds.toFixed(2)}x
        </Badge>
      </div>
      <div className="space-y-1">
        {combo.legs.map((l, i) => (
          <div key={l.matchId} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/25 px-2 py-1.5">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full text-[9px] font-black", combo.kind === "TREBLE_3_LEG" ? "bg-amber-500/20 text-amber-300" : "bg-cyan-500/20 text-cyan-300")}>L{i + 1}</span>
              <span className="min-w-0 truncate text-[10px] font-bold" title={l.matchLabel}>{l.matchLabel}</span>
              <span className="shrink-0 text-[9px] text-muted-foreground">({l.league})</span>
            </span>
            <span className="shrink-0 text-left">
              <b className="font-num text-[10px] text-emerald-300" dir="ltr">@{l.odds.toFixed(2)}</b>
              <span className="font-num text-[9px] text-muted-foreground" dir="ltr"> · {(l.prob * 100).toFixed(1)}%</span>
            </span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-1.5 text-center">
        <div className="rounded-lg border border-white/10 bg-black/30 p-1.5">
          <p className="text-[8px] text-muted-foreground">ضریب کل</p>
          <p className="font-num text-xs font-black text-amber-300" dir="ltr">{combo.totalOdds.toFixed(2)}x</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/30 p-1.5">
          <p className="text-[8px] text-muted-foreground">اطمینان مونت‌کارلو</p>
          <p className="font-num text-xs font-black text-cyan-300" dir="ltr">{(combo.jointProb * 100).toFixed(1)}%</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/30 p-1.5">
          <p className="text-[8px] text-muted-foreground">استیک پیشنهادی</p>
          <p className="font-num text-xs font-black text-foreground" dir="ltr">{faNum(combo.stake, 0)}u</p>
        </div>
      </div>
      <p className="text-[9px] leading-4 text-muted-foreground">🛡️ {combo.cover.note}</p>
      <p className="text-[9px] text-muted-foreground">
        لِگ‌ها از بازی‌های مستقلِ تاییدشده سوپروایزر با پایه امن بالای ۸۶٪ ساخته می‌شوند · این خط در کارنامه «دسته ب» با حساب مستقل تسویه می‌شود.
      </p>
    </div>
  );
}

function SniperCard({ shot }: { shot: SniperShot }) {
  return (
    <div className="space-y-2 rounded-xl border border-violet-500/40 bg-violet-500/[0.06] p-3">
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <p className="min-w-0 truncate text-[11px] font-bold text-foreground/90" title={shot.matchLabel}>{shot.matchLabel}</p>
        <Badge variant="outline" className="border-violet-500/50 text-[9px] text-violet-300" dir="ltr">{shot.odds.toFixed(2)}x</Badge>
      </div>
      <p className="text-[10px] text-violet-200/90">🎯 {shot.marketLabel}</p>
      <div className="grid grid-cols-4 gap-1.5 text-center">
        <div className="rounded-lg border border-white/10 bg-black/30 p-1.5">
          <p className="text-[8px] text-muted-foreground">مدل</p>
          <p className="font-num text-[11px] font-black text-violet-300" dir="ltr">{(shot.modelProb * 100).toFixed(1)}%</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/30 p-1.5">
          <p className="text-[8px] text-muted-foreground">بوک‌میکر</p>
          <p className="font-num text-[11px] font-black text-muted-foreground" dir="ltr">{(shot.impliedProb * 100).toFixed(1)}%</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/30 p-1.5">
          <p className="text-[8px] text-muted-foreground">مزیت</p>
          <p className="font-num text-[11px] font-black text-emerald-300" dir="ltr">+{faNum(shot.edgePct, 1)}%</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/30 p-1.5">
          <p className="text-[8px] text-muted-foreground">استیک کلِی</p>
          <p className="font-num text-[11px] font-black text-amber-300" dir="ltr">{faNum(shot.stake, 1)}u</p>
        </div>
      </div>
      <p className="flex items-center justify-between text-[9px] text-muted-foreground">
        <span>{shot.league} · {timeFa(shot.kickoff)}</span>
        <b className="font-num text-emerald-300" dir="ltr">EV +{faNum(shot.evPct, 1)}%</b>
      </p>
    </div>
  );
}

export function ProductionLines() {
  const cards = useFlashcards();
  const [tier, setTier] = useState<TierKey>("SINGLE");

  const loading = cards.length === 0;
  const combos = useMemo(() => buildSmartCombos(cards), [cards]);
  const snipers = useMemo(() => findSniperShots(cards), [cards]);

  return (
    <section className="space-y-3" aria-label="۳ خط تولید مجزا تیپ‌ها">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold sm:text-base">
          <span aria-hidden>🏭</span>
          خطوط تولید تیپ — ۳ خط کاملاً مجزا و بدون همپوشانی
        </h2>
        <Badge variant="outline" className="gap-1 border-emerald-500/40 bg-emerald-500/10 text-[9px] text-emerald-300">
          افراز مجزا v13.0 — حساب مستقل هر خط در کارنامه
        </Badge>
      </div>

      {/* سوییچ ۳ خط */}
      <div className="grid gap-1.5 sm:grid-cols-3" role="tablist" aria-label="انتخاب خط تولید">
        {TIERS.map((t) => (
          <Button
            key={t.key}
            size="sm"
            variant="outline"
            role="tab"
            aria-selected={tier === t.key}
            className={cn(
              "h-auto min-h-[44px] whitespace-nowrap px-3 py-2 text-[10px] sm:text-[11px]",
              tier === t.key
                ? t.tone === "emerald"
                  ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-200"
                  : t.tone === "cyan"
                    ? "border-cyan-500/50 bg-cyan-500/15 text-cyan-200"
                    : "border-violet-500/50 bg-violet-500/15 text-violet-200"
                : "border-white/10 text-muted-foreground"
            )}
            onClick={() => setTier(t.key)}
          >
            <t.icon className="size-3.5 shrink-0" />
            {t.label}
          </Button>
        ))}
      </div>

      {/* بدنه هر خط */}
      {tier === "SINGLE" ? (
        <p className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-center text-[11px] text-muted-foreground">
          ✅ خط ۱ همین‌جاست — فلش‌کارت‌های تک‌بازی دوهج با تیپ A (~۲.۰) و تیپ B (~۳.۰) و ریسک زیر ۹.۸٪ در بخش فلش‌کارت‌ها نمایش داده می‌شوند
          (پیش‌فرض: فیلتر 👑 تاییدشده سوپروایزر). این خط در کارنامه «دسته الف» با پول واقعی تسویه می‌شود.
        </p>
      ) : tier === "COMBO" ? (
        loading ? (
          <div className="flex min-h-[120px] items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> در انتظار اسکن برای ساخت میکس‌ها…
          </div>
        ) : combos.safe === null && combos.treble === null ? (
          <p className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-center text-[11px] text-muted-foreground">
            🔗 هنوز ۲ لِگ امن با پایه بالای ۸۶٪ و ضریب کل در بازه مجاز هم‌زمان موجود نیست — با اسکن‌های بعدی موتور همبستگی مونت‌کارلو میکس‌ها را می‌سازد.
          </p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {combos.safe && <ComboCard combo={combos.safe} />}
            {combos.treble && <ComboCard combo={combos.treble} />}
          </div>
        )
      ) : loading ? (
        <div className="flex min-h-[120px] items-center justify-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> در انتظار اسکن برای شکار ضرایب بالا…
        </div>
      ) : snipers.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-center text-[11px] text-muted-foreground">
          🎯 در اسکن جاری شکار مطلبی با شرط سخت (ضریب ۴.۰۰–۹.۵۰ × مزیت ≥ ۸ واحد × EV ≥ +۱۲٪) وجود ندارد — سوپروایزر اجازه شکار بی‌ارزش نمی‌دهد.
        </p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {snipers.map((s) => (
            <SniperCard key={s.id} shot={s} />
          ))}
        </div>
      )}

      <p className="flex items-center gap-1 text-[9px] text-muted-foreground">
        <Sparkles className="size-3 shrink-0 text-amber-300" />
        قاعده افراز: دسته الف (تک‌بازی) + دسته ب (میکس) + دسته ج (تک‌تیرانداز) + دسته د (دفتر سایه) = کل کارنامه؛ هیچ کارتی دوبار شمرده نمی‌شود.
      </p>
    </section>
  );
}
