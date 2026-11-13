"use client";

// ─────────────────────────────────────────────────────────────────────────────
// کارت‌های 🔗 آکومولاتور هوشمند — v17.0
// سه برگه میکس زنجیره‌ای از بهترین بنکرها/کمبوهای تاییدشده روز:
//   ۱) 2-Fold Banker Accumulator (ضریب کل ۲.۱۰..۲.۵۵ — نرخ اصابت > ۸۰٪)
//   ۲) 3-Fold Pro Combo Accumulator (ضریب کل ۳.۶۰..۵.۴۰)
//   ۳) Time-Staggered Hedged Accumulator (میکس پله‌زمانی + فرمول پوشش زنده پای آخر)
// استیک بهینه بر اساس معیار کلِی همزمان (Simultaneous Kelly)
// ─────────────────────────────────────────────────────────────────────────────

import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAccumulators } from "@/lib/autopilot-derive";
import { faNum } from "@/lib/format";
import { useState } from "react";

const KIND_STYLE: Record<string, string> = {
  TWO_FOLD_BANKER: "border-sky-500/40 from-sky-500/[0.10] to-transparent",
  THREE_FOLD_COMBO: "border-violet-500/40 from-violet-500/[0.10] to-transparent",
  TIME_STAGGERED: "border-amber-500/40 from-amber-500/[0.10] to-transparent",
};

function accCopy(text: string): string {
  return text;
}

export function AccumulatorCards() {
  const accs = useAccumulators();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyOf = (a: (typeof accs)[number]): string => {
    const lines: string[] = [];
    lines.push(`🔗 ${a.labelFa} — ضریب کل: ${a.totalOdds.toFixed(2)}x`);
    lines.push(`💰 استیک کلِی همزمان: ${a.stake} واحد | نرخ اصابت ماتریس: ${a.hitRatePct.toFixed(1)}٪ | بازده بالقوه: ${a.potentialReturn} واحد`);
    for (const [i, l] of a.legs.entries()) {
      lines.push(`${i + 1}. ${l.matchLabel} (${l.league}) — ${l.tip} @ ${l.odds.toFixed(2)}x`);
    }
    if (a.hedgeNote) lines.push(`⚖️ ${a.hedgeNote}`);
    return lines.join("\n");
  };

  if (accs.length === 0) {
    return (
      <div className="flex min-h-[180px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-6 text-center">
        <span className="text-2xl" aria-hidden>🔗</span>
        <p className="text-xs leading-5 text-muted-foreground">
          هنوز آکومولاتوری ساخته نشده — برای ساخت میکس زنجیره‌ای به حداقل ۲ بنکر امن یا ۳ پایه بنکر/کمبوی تاییدشده امروز نیاز است.
          فیلتر <b className="text-foreground">🏦 بنکرهای امن</b> را بررسی کنید.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {accs.map((a) => (
        <article
          key={a.id}
          className={`flex flex-col gap-2.5 rounded-2xl border bg-gradient-to-b p-4 ${KIND_STYLE[a.kind] ?? "border-white/10 from-white/[0.04] to-transparent"}`}
          aria-label={a.labelFa}
        >
          <header className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="flex items-center gap-1.5 text-xs font-bold leading-5 sm:text-[13px]">
                <span aria-hidden>{a.icon}</span>
                {a.labelFa}
              </h3>
              <p className="mt-0.5 text-[9.5px] text-muted-foreground" dir="ltr">{a.labelEn}</p>
            </div>
            <span className="shrink-0 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-300" dir="ltr">
              {a.totalOdds.toFixed(2)}x
            </span>
          </header>

          {/* پاها */}
          <ol className="space-y-1.5">
            {a.legs.map((l, i) => (
              <li key={`${a.id}-${i}`} className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5">
                <p className="text-[11px] font-semibold leading-4">
                  <span className="ml-1 inline-flex size-4 items-center justify-center rounded-full bg-white/10 text-[9px]" aria-hidden>
                    {faNum(i + 1, 0)}
                  </span>
                  {l.matchLabel}
                </p>
                <p className="mt-0.5 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                  <span className="min-w-0 flex-1 truncate">{l.tip}</span>
                  <b className="shrink-0 font-num text-emerald-300" dir="ltr">{l.odds.toFixed(2)}</b>
                </p>
              </li>
            ))}
          </ol>

          {/* سنجه‌ها */}
          <div className="grid grid-cols-3 gap-1.5 text-center">
            <div className="rounded-lg border border-white/10 bg-white/[0.03] px-1 py-1.5">
              <p className="text-[8.5px] text-muted-foreground">استیک کلِی</p>
              <p className="font-num text-xs font-bold" dir="ltr">{faNum(a.stake, 1)}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.03] px-1 py-1.5">
              <p className="text-[8.5px] text-muted-foreground">نرخ اصابت</p>
              <p className="font-num text-xs font-bold text-cyan-300" dir="ltr">{faNum(a.hitRatePct, 1)}٪</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.03] px-1 py-1.5">
              <p className="text-[8.5px] text-muted-foreground">بازده بالقوه</p>
              <p className="font-num text-xs font-bold text-emerald-300" dir="ltr">{faNum(a.potentialReturn, 1)}</p>
            </div>
          </div>

          {/* فرمول پوشش زنده پای آخر */}
          {a.hedgeNote && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/[0.08] px-2.5 py-1.5 text-[9.5px] font-medium leading-4 text-amber-200">
              ⚖️ {a.hedgeNote}
            </p>
          )}

          <Button
            size="sm"
            variant="outline"
            className="h-7 w-full gap-1 border-white/15 text-[10px]"
            onClick={() => {
              void navigator.clipboard?.writeText(accCopy(copyOf(a)));
              setCopiedId(a.id);
              setTimeout(() => setCopiedId(null), 1600);
            }}
            aria-label={`کپی متن ${a.labelFa}`}
          >
            <Copy className="size-3" />
            {copiedId === a.id ? "کپی شد!" : "کپی متن برگه میکس"}
          </Button>
        </article>
      ))}
    </div>
  );
}
