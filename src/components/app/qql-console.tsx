"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 💻 کنسول تعاملی زبان پرس‌وجوی علوم داده و ریشه‌یابی — v24.0
// «Interactive Quant SQL / QQL & AI RCA Lab»
// چهار کوئری آماده ۱ کلیکی + اجرای خط لوله QQL کامل روی انبار تله‌متری واقعی
// (historical_telemetry_warehouse از کارت‌های تسویه‌شده ESPN — صفر عدد جعلی)
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useState } from "react";
import { BrainCircuit, Database, Loader2, Terminal, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { faNum } from "@/lib/format";
import { cn } from "@/lib/utils";

interface QqlConsoleResultDTO {
  queryId: string;
  title: string;
  columns: string[];
  rows: (string | number | null)[][];
  note: string;
}

const PRESETS: { id: string; label: string; hint: string }[] = [
  { id: "Q1", label: "Query 1 — top_performing_pairs", hint: "SELECT top_performing_pairs WHERE double_win_rate > 15%" },
  { id: "Q2", label: "Query 2 — RCA_AUDIT", hint: "RCA_AUDIT ON lost_matches GROUP BY failure_root_cause" },
  { id: "Q3", label: "Query 3 — today_matches", hint: "SELECT today_matches WHERE effective_overlap_odds >= 1.20 ORDER BY sharpe DESC" },
  { id: "Q4", label: "Query 4 — counterfactual_roi", hint: "COMPARE counterfactual_roi ACROSS all 12_market_operators" },
];

export function QqlConsole() {
  const [result, setResult] = useState<QqlConsoleResultDTO | null>(null);
  const [telemetrySize, setTelemetrySize] = useState<number | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (preset: string) => {
    setLoading(preset);
    setError(null);
    try {
      const res = await fetch("/api/qql/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preset }),
      });
      const data = (await res.json()) as { success: boolean; result?: QqlConsoleResultDTO; telemetrySize?: number; error?: string };
      if (!data.success || !data.result) {
        setError(data.error ?? "اجرای کوئری ناموفق بود");
        return;
      }
      setResult(data.result);
      setTelemetrySize(data.telemetrySize ?? null);
    } catch {
      setError("خطای شبکه در اجرای کوئری QQL");
    } finally {
      setLoading(null);
    }
  }, []);

  return (
    <section
      className="glass overflow-hidden rounded-2xl border border-cyan-500/20 bg-gradient-to-l from-cyan-500/[0.05] via-transparent to-emerald-500/[0.04]"
      aria-label="کنسول زبان پرس‌وجوی علوم داده و ریشه‌یابی"
    >
      {/* هدر */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/8 px-4 py-2.5">
        <h2 className="flex items-center gap-2 text-sm font-bold sm:text-base">
          <Terminal className="size-4 text-cyan-400" aria-hidden />
          💻 کنسول زبان پرس‌وجوی علوم داده و ریشه‌یابی
          <span className="hidden rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[9px] font-semibold text-cyan-300 sm:inline" dir="ltr">
            QQL &amp; AI RCA Lab — v24.0
          </span>
        </h2>
        {telemetrySize !== null && (
          <span className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[9px] text-muted-foreground" title="حجم انبار تله‌متری درون‌حافظه">
            <Database className="size-3" aria-hidden />
            انبار تله‌متری: <b className="font-num text-foreground" dir="ltr">{faNum(telemetrySize, 0)}</b> ردیف تسویه‌شده
          </span>
        )}
      </div>

      {/* نوار کوئری‌های آماده */}
      <div className="flex flex-wrap items-center gap-1.5 px-4 py-3" role="tablist" aria-label="کوئری‌های آماده QQL">
        {PRESETS.map((p) => (
          <Button
            key={p.id}
            size="sm"
            variant="outline"
            role="tab"
            aria-selected={result?.queryId === p.id}
            className={cn(
              "h-8 gap-1.5 rounded-lg border-white/10 px-2.5 text-[10px] sm:text-[11px]",
              result?.queryId === p.id
                ? "border-cyan-500/50 bg-cyan-500/15 text-cyan-200"
                : "text-muted-foreground hover:border-cyan-500/30 hover:text-cyan-200"
            )}
            onClick={() => void run(p.id)}
            disabled={loading !== null}
            title={p.hint}
          >
            {loading === p.id ? <Loader2 className="size-3 animate-spin" /> : <BrainCircuit className="size-3" />}
            {p.label}
          </Button>
        ))}
      </div>

      {/* بدنه کنسول */}
      <div className="px-4 pb-4">
        {error && (
          <p className="flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/[0.07] px-3 py-2 text-[11px] text-rose-200" role="alert">
            <TriangleAlert className="size-3.5" /> {error}
          </p>
        )}
        {!result && !error && (
          <p className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-3 text-[11px] leading-5 text-muted-foreground">
            یکی از ۴ کوئری آماده تحلیلی را اجرا کنید — موتور QQL درون‌حافظه‌ای روی «انبار داده پیشینه علوم داده» (کارت‌های تسویه‌شده واقعی ESPN)،
            «پایگاه دانش تحلیل ریشه‌ای RCA» و «۶۶ ترکیب کاندیدای استخر کوانتومی» پرس‌وجوی زنده اجرا می‌کند.
          </p>
        )}
        {result && (
          <div className="space-y-2">
            <p className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-[10px] leading-4 text-emerald-200/90" dir="ltr">
              {result.title}
            </p>
            <div className="overflow-hidden rounded-xl border border-white/10">
              <div className="max-h-72 overflow-auto">
                <table className="w-full min-w-[420px] text-[10px]" aria-label={`نتایج ${result.queryId}`}>
                  <thead className="sticky top-0 bg-black/60 text-muted-foreground">
                    <tr>
                      {result.columns.map((c) => (
                        <th key={c} className="px-2.5 py-1.5 text-right font-semibold" dir="ltr">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.length === 0 ? (
                      <tr>
                        <td colSpan={result.columns.length} className="px-3 py-4 text-center text-muted-foreground">
                          ردیفی برای این کوئری یافت نشد
                        </td>
                      </tr>
                    ) : (
                      result.rows.map((r, i) => (
                        <tr key={i} className="border-t border-white/6">
                          {r.map((cell, j) => (
                            <td key={j} className={cn("max-w-[220px] break-words px-2.5 py-1.5 text-right text-foreground/90", j === 0 && "font-semibold")} dir="auto">
                              {cell === null ? "—" : String(cell)}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="text-[10px] leading-4 text-muted-foreground">ℹ️ {result.note}</p>
          </div>
        )}
      </div>
    </section>
  );
}
