"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 🪜 نردبان سود مرکب ۳ پله‌ای (Daily Compound Rollover Planner) — v11.0
//
// از میان کارت‌های «تاییدشده سوپروایزر با ریسک باخت همزمان زیر ۱۰٪»، ۳ مسابقه
// یک روز با فاصله شروع ≥ ۲ ساعت انتخاب و مرکب‌سازی می‌شود:
//   پله ۱: ورود ۱۰۰ واحد → تسویه → پله ۲ با کل (اصل + سود) → پله ۳ → خروج روز.
// نمایش گرافیکی SVG متحرک + ✈️ ارسال پوستر انگلیسی PNG به تلگرام.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { Loader2, Plane, RotateCcw, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFlashcards } from "@/lib/autopilot-derive";
import { faNum } from "@/lib/format";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { FlashcardView } from "@/lib/autopilot-types";

/** کلید روز تهران (en-CA = YYYY-MM-DD) */
const dayKey = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" }).format(new Date(iso));
const timeFa = (iso: string) => new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tehran" }).format(new Date(iso));
const dayFa = (iso: string) => new Intl.DateTimeFormat("fa-IR", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Tehran" }).format(new Date(iso));

/** بهترین توالی ۳ پله‌ای یک روز — فاصله شروع ≥ ۲ ساعت، مرتب بر اساساسخت kickoff */
function bestTripleOfDay(cards: FlashcardView[], day: string): FlashcardView[] | null {
  const list = cards
    .filter((c) => dayKey(c.match.kickoff) === day && !(c.supervisor?.veto ?? false) && c.pair.jointStates.bothLose < 0.1 && c.pair.guaranteedMarginPct > 0)
    .sort((a, b) => new Date(a.match.kickoff).getTime() - new Date(b.match.kickoff).getTime());
  const GAP = 2 * 3600_000;
  let best: FlashcardView[] | null = null;
  let bestMargin = -1;
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      if (new Date(list[j].match.kickoff).getTime() - new Date(list[i].match.kickoff).getTime() < GAP) continue;
      for (let k = j + 1; k < list.length; k++) {
        if (new Date(list[k].match.kickoff).getTime() - new Date(list[j].match.kickoff).getTime() < GAP) continue;
        const triple = [list[i], list[j], list[k]];
        const totalMargin = triple.reduce((a, c) => a + c.pair.guaranteedMarginPct, 0);
        if (totalMargin > bestMargin) {
          bestMargin = totalMargin;
          best = triple;
        }
      }
    }
  }
  return best;
}

export function RolloverLadder({ startBank = 100 }: { startBank?: number }) {
  const cards = useFlashcards();
  const [sending, setSending] = useState(false);
  const [seed, setSeed] = useState(0); // reroll انتخاب روز

  const plan = useMemo(() => {
    const today = dayKey(new Date().toISOString());
    const days = Array.from(new Set(cards.map((c) => dayKey(c.match.kickoff)))).sort();
    // روزهای معتبر مرتب بر اساس تاریخ؛ امروز اولویت دارد، بعد نزدیک‌ترین روزها
    const ordered = [today, ...days.filter((d) => d !== today)].filter((d) => days.includes(d));
    // reroll: چرخش اولویت روزها
    const rotated = seed > 0 ? [...ordered.slice(seed % Math.max(1, ordered.length)), ...ordered.slice(0, seed % Math.max(1, ordered.length))] : ordered;
    for (const d of rotated) {
      const triple = bestTripleOfDay(cards, d);
      if (triple) return { day: d, steps: triple };
    }
    return null;
  }, [cards, seed]);

  const compound = useMemo(() => {
    if (!plan) return null;
    let bank = startBank;
    const rows = plan.steps.map((c) => {
      const enter = bank;
      bank = bank * (1 + c.pair.guaranteedMarginPct / 100);
      return { card: c, enter, exit: bank };
    });
    return { rows, final: bank, growth: (bank / startBank - 1) * 100 };
  }, [plan, startBank]);

  const send = async () => {
    if (!plan) return;
    setSending(true);
    try {
      const res = await fetch("/api/telegram/ladder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startBank,
          steps: plan.steps.map((c) => ({
            homeTeam: c.match.homeTeam,
            awayTeam: c.match.awayTeam,
            league: c.match.league,
            kickoffIso: c.match.kickoff,
            oddsA: c.pair.totalOddsA,
            oddsB: c.pair.totalOddsB,
            marginPct: c.pair.guaranteedMarginPct,
            // v18.0 — تیپ‌ها روی پله‌ها و پوستر (نام رسمی بین‌المللی مارکت)
            tipA: c.pair.marketAEn ?? c.pair.labelA,
            tipB: c.pair.marketBEn ?? c.pair.labelB,
          })),
        }),
      });
      const data = (await res.json()) as { success: boolean; detail?: string; error?: string; notConfigured?: boolean };
      if (data.success) {
        toast.success("✈️ پوستر نردبان ۳ پله‌ای به کانال ارسال شد", { description: `تلگرام: ${data.detail ?? "ok"}` });
      } else if (data.notConfigured) {
        toast.warning("اتصال تلگرام تنظیم نشده — توکن بات و کانال را در تب کارنامه ذخیره کنید");
      } else {
        toast.error(`ارسال نردبان ناموفق: ${data.error ?? data.detail ?? "?"}`);
      }
    } catch {
      toast.error("خطای شبکه در ارسال نردبان");
    } finally {
      setSending(false);
    }
  };

  if (!plan || !compound) {
    return (
      <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-center">
        <p className="text-xs text-muted-foreground">
          🪜 نردبان مرکب هنوز آماده نیست — حداقل ۳ کارت تاییدشده با ریسک زیر ۱۰٪ و فاصله شروع ۲ ساعته در یک روز لازم است.
        </p>
      </div>
    );
  }

  const W = 100;
  const pts = compound.rows.map((r, i) => [i * (W / 3), 44 - ((r.exit - startBank) / (Math.max(...compound.rows.map((x) => x.exit)) - startBank || 1)) * 34] as const);
  const line = `M0,44 ${pts.map(([x, y]) => `L${x.toFixed(1)},${y.toFixed(1)}`).join(" ")} L${W},44`;

  return (
    <div className="space-y-3 rounded-xl border border-emerald-500/25 bg-gradient-to-l from-emerald-500/[0.06] to-amber-500/[0.04] p-4" aria-label="نردبان سود مرکب روزانه">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-bold text-emerald-300">
          <TrendingUp className="size-4" /> 🪜 نردبان سود مرکب ۳ پله‌ای — {dayFa(plan.steps[0].match.kickoff)}
        </p>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-[10px] text-muted-foreground" onClick={() => setSeed((s) => s + 1)} aria-label="انتخاب روز دیگر">
            <RotateCcw className="size-3" /> روز دیگر
          </Button>
          <Button
            size="sm"
            className="h-7 gap-1 bg-gradient-to-l from-amber-500 to-amber-400 px-2.5 text-[10px] font-bold text-black hover:from-amber-400 hover:to-amber-300"
            onClick={() => void send()}
            disabled={sending}
            aria-label="ارسال برنامه نردبان ۳ پله‌ای امروز به تلگرام"
          >
            {sending ? <Loader2 className="size-3 animate-spin" /> : <Plane className="size-3" />}
            ✈️ ارسال به تلگرام (پوستر انگلیسی)
          </Button>
        </div>
      </div>

      {/* سه پله مرکب‌شده */}
      <div className="grid gap-2 sm:grid-cols-3">
        {compound.rows.map((r, i) => (
          <div key={r.card.key} className={cn("space-y-1 rounded-lg border p-2.5", i === 2 ? "border-amber-500/40 bg-amber-500/[0.07]" : "border-white/10 bg-black/25")}>
            <p className="flex items-center justify-between text-[10px] font-bold text-muted-foreground">
              <span>پله {faNum(i + 1, 0)}</span>
              <span dir="ltr">{timeFa(r.card.match.kickoff)}</span>
            </p>
            <p className="truncate text-[11px] font-bold text-foreground/90" title={`${r.card.match.homeTeam} × ${r.card.match.awayTeam}`}>
              {r.card.match.homeTeam} × {r.card.match.awayTeam}
            </p>
            <p className="text-[10px] text-muted-foreground">
              ورود <b className="font-num text-foreground" dir="ltr">{faNum(r.enter, 1)}</b> ← خروج{" "}
              <b className={cn("font-num", i === 2 ? "text-amber-300" : "text-emerald-300")} dir="ltr">{faNum(r.exit, 1)}</b>
            </p>
            {/* v18.0 — تیپ‌های هر پله: پاسخ مستقیم «تیپ‌ها مشخص نشده‌اند» */}
            <div className="flex flex-wrap items-center gap-1">
              <span className="rounded border border-sky-500/40 bg-sky-500/10 px-1.5 py-0.5 text-[9px] font-bold text-sky-300" dir="ltr">
                A · {r.card.pair.labelA}
              </span>
              <span className="font-num text-[9px] text-muted-foreground" dir="ltr">@{faNum(r.card.pair.totalOddsA, 2)}</span>
              <span className="rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300" dir="ltr">
                B · {r.card.pair.labelB}
              </span>
              <span className="font-num text-[9px] text-muted-foreground" dir="ltr">@{faNum(r.card.pair.totalOddsB, 2)}</span>
            </div>
            <p className="font-num text-[10px] text-emerald-300" dir="ltr">+{faNum(r.card.pair.guaranteedMarginPct, 1)}% تضمینی · ریسک {faNum(r.card.pair.jointStates.bothLose * 100, 1)}%</p>
          </div>
        ))}
      </div>

      {/* SVG متحرک رشد مرکب */}
      <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/30 p-2.5">
        <svg viewBox={`0 0 ${W} 48`} className="h-12 w-full" role="img" aria-label="نمودار مرکب‌سازی سه پله‌ای">
          <defs>
            <linearGradient id="ladder-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#34d399" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#34d399" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <path d={`${line} L${W},48 L0,48 Z`} fill="url(#ladder-fill)" />
          <path d={line} fill="none" stroke="#34d399" strokeWidth="1.6" strokeLinecap="round" />
          {pts.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="2" fill="#6ee7b7" />
          ))}
        </svg>
        <div className="shrink-0 text-left">
          <p className="text-[9px] text-muted-foreground">خروج هدف روز</p>
          <p className="font-num text-lg font-black text-amber-300" dir="ltr">
            {faNum(compound.final, 1)}
          </p>
          <p className="font-num text-[10px] text-emerald-300" dir="ltr">+{faNum(compound.growth, 1)}٪ فقط با {faNum(startBank, 0)} واحد</p>
        </div>
      </div>
      <p className="text-[9px] leading-4 text-muted-foreground">
        هر پله پیش از شروع پله بعد روی ESPN تسویه و کل (اصل + سود) وارد پله بعدی می‌شود — فقط کارت‌های تاییدشده سوپروایزر با ریسک باخت همزمان زیر ۱۰٪ و فاصله شروع ≥ ۲ ساعت.
      </p>
    </div>
  );
}
