"use client";

// ─────────────────────────────────────────────────────────────────────────────
// جدول رادار اسکنر خودکار زنده (Autonomous Pipeline Radar Matrix) — v10.0
//   · گروه‌بندی بر اساس لیگ (دستور مستقیم کارفرما) — هدر لیگ + ردیف‌های آن لیگ
//   · فقط بازی‌های آینده/در جریان — بازی‌های گذشته فیلتر می‌شوند (رفع باگ)
//   · وضعیت ۵ مرحله خط لوله برای هر بازی با تیک سبز + دکمه باز کردن فلش‌کارت
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from "react";
import { AlertCircle, Check, CircleDashed, Loader2, Minus, Radar, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuantStore } from "@/lib/store";
import { STAGE_LABELS, type StageKey, type StageState } from "@/lib/autopilot-types";
import { faNum } from "@/lib/format";
import { cn } from "@/lib/utils";

const STAGE_ORDER: StageKey[] = ["ingest", "t60", "debate", "pair", "signal"];

/** رنگ نشان لیگ — بر اساس هش نام لیگ (پالت محدود بدون آبی/بنفش) */
function leagueTone(league: string): string {
  const tones = [
    "border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-300",
    "border-amber-500/30 bg-amber-500/[0.06] text-amber-300",
    "border-cyan-500/30 bg-cyan-500/[0.06] text-cyan-300",
    "border-rose-500/30 bg-rose-500/[0.06] text-rose-300",
    "border-lime-500/30 bg-lime-500/[0.06] text-lime-300",
    "border-orange-500/30 bg-orange-500/[0.06] text-orange-300",
  ];
  let h = 0;
  for (let i = 0; i < league.length; i++) h = (h * 31 + league.charCodeAt(i)) >>> 0;
  return tones[h % tones.length];
}

function StageCell({ state, label }: { state: StageState; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1" title={label}>
      {state === "DONE" && (
        <span className="flex size-6 animate-in zoom-in-50 items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-500/15" role="img" aria-label={`${label}: انجام شد`}>
          <Check className="size-3.5 text-emerald-400" />
        </span>
      )}
      {state === "RUNNING" && (
        <span className="flex size-6 items-center justify-center" role="img" aria-label={`${label}: در حال اجرا`}>
          <Loader2 className="size-4 animate-spin text-cyan-400" />
        </span>
      )}
      {state === "ERROR" && (
        <span className="flex size-6 items-center justify-center rounded-full border border-rose-500/40 bg-rose-500/10" role="img" aria-label={`${label}: خطا`}>
          <AlertCircle className="size-3.5 text-rose-400" />
        </span>
      )}
      {state === "SKIPPED" && (
        <span className="flex size-6 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/5" role="img" aria-label={`${label}: رد شد`}>
          <Minus className="size-3.5 text-amber-400" />
        </span>
      )}
      {state === "IDLE" && (
        <span className="flex size-6 items-center justify-center" role="img" aria-label={`${label}: در صف`}>
          <CircleDashed className="size-4 text-white/20" />
        </span>
      )}
      <span className="hidden text-[8px] leading-3 text-muted-foreground lg:block">{label.split(". ")[1] ?? label}</span>
    </div>
  );
}

export function PipelineRadar({ onOpenCard }: { onOpenCard: (matchId: string) => void }) {
  const storeMatches = useQuantStore((s) => s.matches);
  const autopilot = useQuantStore((s) => s.autopilot);
  const scanning = useQuantStore((s) => s.scanning);
  const setActiveMatchId = useQuantStore((s) => s.setActiveMatchId);

  // ─── v10.0 — فقط بازی‌های پیش‌رو/در جریان + گروه‌بندی بر اساس لیگ ───
  const { groups, matches } = useMemo(() => {
    const cutoff = Date.now() - 3 * 3600_000; // بازی در جریان تا ۳ ساعت پس از کیک‌آف
    const upcoming = storeMatches
      .filter((m) => new Date(m.kickoff).getTime() >= cutoff && m.status !== "FINISHED" && m.status !== "ARCHIVED")
      .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());
    const byLeague = new Map<string, typeof upcoming>();
    for (const m of upcoming) {
      const arr = byLeague.get(m.league) ?? [];
      arr.push(m);
      byLeague.set(m.league, arr);
    }
    const ordered = [...byLeague.entries()].sort((a, b) => new Date(a[1][0].kickoff).getTime() - new Date(b[1][0].kickoff).getTime());
    return { groups: ordered, matches: upcoming };
  }, [storeMatches]);

  const doneCount = matches.filter((m) => autopilot[m.id]?.stages.signal === "DONE").length;

  return (
    <section className="glass rounded-2xl border border-white/10 bg-white/[0.02]" aria-label="رادار خط لوله اتوماتیک">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/8 px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-bold sm:text-base">
          <Radar className={`size-4 text-cyan-400 ${scanning ? "animate-pulse" : ""}`} />
          رادار اسکنر خودکار زنده
          <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-300" dir="ltr">
            {faNum(doneCount, 0)}/{faNum(matches.length, 0)}
          </span>
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
            {faNum(groups.length, 0)} لیگ · فقط بازی‌های پیش‌رو
          </span>
        </h2>
        <p className="flex items-center gap-1 text-[10px] text-muted-foreground sm:text-[11px]">
          <Table2 className="size-3.5" />
          پنج مرحله خط لوله نهادی به‌صورت ۱۰۰٪ اتوماتیک برای هر بازی اجرا می‌شود
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-right text-xs">
          <caption className="sr-only">وضعیت مراحل خط لوله اتوماتیک برای بازی‌های پیش‌رو، گروه‌بندی‌شده بر اساس لیگ</caption>
          <thead>
            <tr className="border-b border-white/8 text-[10px] text-muted-foreground">
              <th scope="col" className="px-4 py-2 font-medium">مسابقه</th>
              {STAGE_ORDER.map((k) => (
                <th key={k} scope="col" className="px-2 py-2 text-center font-medium">{STAGE_LABELS[k]}</th>
              ))}
              <th scope="col" className="px-3 py-2 text-center font-medium">فلش‌کارت</th>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 && (
              <tr>
                <td colSpan={STAGE_ORDER.length + 2} className="px-4 py-10 text-center text-muted-foreground">
                  در حال حاضر بازی پیش‌رویی در فید زنده نیست — اسکنر خودکار سرور هر لحظه رخدادهای تازه ESPN را بررسی می‌کند
                </td>
              </tr>
            )}
            {groups.map(([league, leagueMatches]) => (
              <LeagueGroup
                key={league}
                league={league}
                leagueMatches={leagueMatches}
                autopilot={autopilot}
                setActiveMatchId={setActiveMatchId}
                onOpenCard={onOpenCard}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function LeagueGroup({
  league,
  leagueMatches,
  autopilot,
  setActiveMatchId,
  onOpenCard,
}: {
  league: string;
  leagueMatches: MatchDTO[];
  autopilot: Record<string, AutopilotState>;
  setActiveMatchId: (id: string) => void;
  onOpenCard: (matchId: string) => void;
}) {
  return (
    <>
      <tr>
        <td colSpan={STAGE_ORDER.length + 2} className="px-3 pb-0 pt-3">
          <div className="flex items-center justify-between gap-2">
            <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold", leagueTone(league))}>
              🏟️ {league}
              <span className="rounded-full bg-white/10 px-1.5 text-[9px]">{faNum(leagueMatches.length, 0)} بازی</span>
            </span>
            <span className="text-[9px] text-muted-foreground">مرتب‌شده بر اساس زمان شروع</span>
          </div>
        </td>
      </tr>
      {leagueMatches.map((m) => {
        const st = autopilot[m.id];
        const ready = st?.stages.signal === "DONE";
        return (
          <tr key={m.id} className={cn("border-b border-white/5 transition-colors hover:bg-white/[0.03]", ready && "bg-emerald-500/[0.03]")}>
            <td className="px-4 py-2.5">
              <p className="font-semibold leading-4">{m.homeTeam} <span className="text-muted-foreground">—</span> {m.awayTeam}</p>
              <p className="text-[10px] text-muted-foreground">
                <span dir="ltr">{new Date(m.kickoff).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" })}</span>
                {" · "}
                {new Date(m.kickoff).getTime() > Date.now() ? (
                  <span className="text-emerald-400/90">شروع: {faCountdown(m.kickoff)}</span>
                ) : (
                  <span className="text-amber-400/90">در جریان</span>
                )}
              </p>
            </td>
            {STAGE_ORDER.map((k) => (
              <td key={k} className="px-2 py-2.5">
                <div className="flex justify-center">
                  <StageCell state={st?.stages[k] ?? "IDLE"} label={STAGE_LABELS[k]} />
                </div>
              </td>
            ))}
            <td className="px-3 py-2.5 text-center">
              <Button
                size="sm"
                variant="outline"
                className={cn(
                  "h-7 gap-1 px-2 text-[10px]",
                  ready ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-white/10 text-muted-foreground"
                )}
                disabled={!ready}
                onClick={() => {
                  setActiveMatchId(m.id);
                  onOpenCard(m.id);
                }}
                aria-label={`باز کردن فلش‌کارت بازی ${m.homeTeam} مقابل ${m.awayTeam}`}
              >
                🎴 باز کردن فلش‌کارت بازی
              </Button>
            </td>
          </tr>
        );
      })}
    </>
  );
}

// ─── تایپ‌های کمکی ───
type MatchDTO = ReturnType<typeof useQuantStore.getState>["matches"][number];
type AutopilotState = NonNullable<ReturnType<typeof useQuantStore.getState>["autopilot"][string]>;

/** شمارش معکوس فارسی تا کیک‌آف («۳ ساعت و ۱۲ دقیقه» / «۴۵ دقیقه») */
function faCountdown(kickoff: string): string {
  const ms = new Date(kickoff).getTime() - Date.now();
  if (ms <= 0) return "الان";
  const totalMin = Math.round(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const fa = (n: number) => String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
  if (h > 0 && m > 0) return `${fa(h)} ساعت و ${fa(m)} دقیقه دیگر`;
  if (h > 0) return `${fa(h)} ساعت دیگر`;
  return `${fa(m)} دقیقه دیگر`;
}
