"use client";

// ─────────────────────────────────────────────────────────────────────────────
// جدول رادار اسکنر خودکار زنده (Autonomous Pipeline Radar Matrix) — v3.0
// وضعیت ۵ مرحله خط لوله برای هر بازی با تیک سبز متحرک + دکمه باز کردن فلش‌کارت
// ─────────────────────────────────────────────────────────────────────────────

import { AlertCircle, Check, CircleDashed, Loader2, Minus, Radar, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuantStore } from "@/lib/store";
import { STAGE_LABELS, type StageKey, type StageState } from "@/lib/autopilot-types";
import { faNum } from "@/lib/format";
import { cn } from "@/lib/utils";

const STAGE_ORDER: StageKey[] = ["ingest", "t60", "debate", "pair", "signal"];

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
  const matches = useQuantStore((s) => s.matches);
  const autopilot = useQuantStore((s) => s.autopilot);
  const scanning = useQuantStore((s) => s.scanning);
  const setActiveMatchId = useQuantStore((s) => s.setActiveMatchId);

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
        </h2>
        <p className="flex items-center gap-1 text-[10px] text-muted-foreground sm:text-[11px]">
          <Table2 className="size-3.5" />
          پنج مرحله خط لوله نهادی به‌صورت ۱۰۰٪ اتوماتیک برای هر بازی اجرا می‌شود
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-right text-xs">
          <caption className="sr-only">وضعیت مراحل خط لوله اتوماتیک برای همه بازی‌های امروز</caption>
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
            {matches.map((m) => {
              const st = autopilot[m.id];
              const ready = st?.stages.signal === "DONE";
              return (
                <tr key={m.id} className={cn("border-b border-white/5 transition-colors hover:bg-white/[0.03]", ready && "bg-emerald-500/[0.03]")}>
                  <td className="px-4 py-2.5">
                    <p className="font-semibold leading-4">{m.homeTeam} <span className="text-muted-foreground">—</span> {m.awayTeam}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {m.league} · <span dir="ltr">{new Date(m.kickoff).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" })}</span>
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
          </tbody>
        </table>
      </div>
    </section>
  );
}
