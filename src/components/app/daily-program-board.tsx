"use client";

// ─────────────────────────────────────────────────────────────────────────────
// DailyProgramBoard — تابلوی «برنامه روزانه حرفه‌ای پخش» (v21.0)
// دستور کارفرما: زمان‌بندی مشخص برای ارسال پیام‌ها و کارت‌ها به کانال عمومی و خصوصی.
// این پنل فقط «نمایش‌دهنده» است: پیشرانِ واقعی، دیمن مستقل پخش (:3011) است که
// بدون مرورگر هم همیشه گرم اجرا می‌شود — وضعیت هر اسلات از صندوق اتمی
// TelegramOutbox خوانده می‌شود (راستی‌آزمایی‌پذیر، نه ادعا).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import { CalendarClock, RefreshCw, RadioTower, Server, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SlotRow {
  id: string;
  hour: number;
  minute: number;
  icon: string;
  title: string;
  target: "PUBLIC" | "VIP" | "BOTH";
  status: "SENT" | "DUE" | "UPCOMING";
  sentAt: string | null;
  info: string;
  isNew?: boolean;
}

interface ProgramPayload {
  success: boolean;
  program?: {
    dateKey: string;
    tehran: { hour: number; minute: number; weekdayFa: string; dateFa: string };
    slots: SlotRow[];
    counts: {
      matchesToday: number;
      cardsTodayReady: number;
      cardsTomorrowReady: number;
      cardsSentToday: number;
      resultsPending: number;
    };
    nextSlotId: string | null;
    nextSlotInMin: number | null;
    sentCount: number;
  };
  health?: {
    daemon: { alive: boolean; cycles: number; lastCycleAt: string | null; lastError: string | null };
    schedulerLastTick: string | null;
    browserIndependent: boolean;
  };
}

const TARGET_LABEL: Record<SlotRow["target"], string> = {
  PUBLIC: "عمومی",
  VIP: "VIP",
  BOTH: "هر دو",
};

const TARGET_CLASS: Record<SlotRow["target"], string> = {
  PUBLIC: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  VIP: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  BOTH: "border-cyan-500/40 bg-cyan-500/10 text-cyan-300",
};

const faNum = (v: string | number) =>
  String(v).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)] ?? d);

const slotTime = (h: number, m: number) => faNum(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);

export function DailyProgramBoard({ compact = false }: { compact?: boolean }) {
  const [data, setData] = useState<ProgramPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busySlot, setBusySlot] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/telegram/program", { cache: "no-store" });
      setData(await res.json());
    } catch {
      // نمایش وضعیت قبلی حفظ می‌شود
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    // هر ۶۰ ثانیه تازه‌سازی — نمایش زنده وضعیت اسلات‌ها (پیشران سروری است)
    const t = setInterval(() => void load(), 60_000);
    return () => clearInterval(t);
  }, [load]);

  const runSlot = useCallback(
    async (slot: "morning" | "tomorrow") => {
      setBusySlot(slot);
      try {
        const res = await fetch("/api/telegram/program", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slot }),
        });
        const json = (await res.json()) as { success: boolean; detail?: string; sent?: number; error?: string };
        setToast(
          json.success
            ? slot === "morning"
              ? "تابلوی برنامه صبح به هر دو کانال ارسال شد"
              : `پیش‌نمایش فردا مخابره شد (${faNum(json.sent ?? 0)} کارت VIP)`
            : `خطا: ${json.error ?? json.detail ?? "نامشخص"}`
        );
        await load();
      } catch {
        setToast("ارسال ناموفق — دوباره تلاش کنید");
      } finally {
        setBusySlot(null);
        setTimeout(() => setToast(null), 6_000);
      }
    },
    [load]
  );

  const p = data?.program;
  const h = data?.health;
  const daemonCycles = h?.daemon.cycles ?? 0;
  const daemonAlive = h?.daemon.alive ?? false;

  return (
    <Card className="border-white/8 bg-white/[0.03]">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
        <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
          <CalendarClock className="size-4 text-amber-400" aria-hidden />
          برنامه روزانه پخش — <span dir="ltr" className="text-amber-300">@AINEOBET</span>
          <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 px-1.5 py-0 text-[9px] text-amber-300">
            v21.0 · ۱۱ اسلات
          </Badge>
        </CardTitle>
        <div className="flex items-center gap-2">
          {/* نشانگر سلامت هسته مستقل از مرورگر */}
          <span
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px]",
              daemonAlive
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                : "border-red-500/40 bg-red-500/10 text-red-300"
            )}
            title={h?.daemon.lastError ?? "broadcast-daemon :3011"}
          >
            <Server className="size-3" aria-hidden />
            دیمن پخش :3011 {daemonAlive ? "گرم" : "خاموش"}
            {daemonAlive && <span dir="ltr">· {daemonCycles} cycles</span>}
          </span>
          <span
            className={cn(
              "hidden items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] sm:flex",
              h?.schedulerLastTick ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-white/15 bg-white/5 text-muted-foreground"
            )}
          >
            <Zap className="size-3" aria-hidden />
            زمان‌بند پشتیبان {h?.schedulerLastTick ? "فعال" : "—"}
          </span>
          <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-[11px]" onClick={() => void load()} aria-label="تازه‌سازی وضعیت برنامه">
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            تازه‌سازی
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* نوار شمارنده‌های واقعی روز */}
        {p && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {[
              { label: "بازی امروز", value: p.counts.matchesToday, cls: "text-emerald-300" },
              { label: "کارت آماده امروز", value: p.counts.cardsTodayReady, cls: "text-amber-300" },
              { label: "کارت آماده فردا", value: p.counts.cardsTomorrowReady, cls: "text-cyan-300" },
              { label: "منتشرشده امروز", value: p.counts.cardsSentToday, cls: "text-emerald-300" },
              { label: "اسلات رفته", value: `${p.sentCount}/۱۱`, cls: "text-white" },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border border-white/8 bg-white/[0.04] px-3 py-2 text-center">
                <div className={cn("text-lg font-bold leading-tight", s.cls)}>{faNum(s.value)}</div>
                <div className="text-[10px] text-muted-foreground">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* پیام وضعیت بعدی */}
        {p?.nextSlotId && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <RadioTower className="size-3.5 text-amber-400" aria-hidden />
            اسلات بعدی تا <b className="text-amber-300">{faNum(p.nextSlotInMin ?? 0)} دقیقه</b> دیگر در دیمن پخش اجرا می‌شود — مستقل از مرورگر، مرورگر بسته هم پخش ادامه دارد.
          </p>
        )}

        {/* جدول اسلات‌ها */}
        <div className={cn("overflow-y-auto rounded-lg border border-white/8", compact ? "max-h-80" : "max-h-96")}>
          <table className="w-full text-right text-xs">
            <thead className="sticky top-0 bg-[rgba(6,9,17,0.94)] text-[10px] text-muted-foreground backdrop-blur">
              <tr>
                <th className="px-3 py-2 font-medium">ساعت تهران</th>
                <th className="px-3 py-2 font-medium">اسلات</th>
                <th className="px-3 py-2 font-medium">کانال هدف</th>
                <th className="px-3 py-2 font-medium">وضعیت</th>
              </tr>
            </thead>
            <tbody>
              {(p?.slots ?? []).map((s) => (
                <tr key={s.id} className="border-t border-white/5 transition-colors hover:bg-white/[0.03]">
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] text-white/90" dir="ltr">
                    {slotTime(s.hour, s.minute)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <span aria-hidden>{s.icon}</span>
                      <span className="font-medium text-white/90">{s.title}</span>
                      {s.isNew && (
                        <Badge variant="outline" className="border-cyan-500/40 bg-cyan-500/10 px-1 py-0 text-[8px] text-cyan-300">
                          جدید
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">{s.info}</p>
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className={cn("px-1.5 py-0 text-[9px]", TARGET_CLASS[s.target])}>
                      {TARGET_LABEL[s.target]}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {s.status === "SENT" ? (
                      <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0 text-[9px] text-emerald-300">
                        ارسال شد{s.sentAt ? ` · ${s.sentAt}` : ""}
                      </Badge>
                    ) : s.status === "DUE" ? (
                      <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 px-1.5 py-0 text-[9px] text-amber-300">
                        در صف اجرا
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-white/15 bg-white/5 px-1.5 py-0 text-[9px] text-muted-foreground">
                        ساعت {slotTime(s.hour, s.minute)}
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
              {!p && !loading && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                    وضعیت برنامه بارگذاری نشد — دکمه تازه‌سازی را بزنید
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* اجرای دستی دو اسلات جدید */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 border-amber-500/30 bg-amber-500/5 text-[11px] text-amber-300 hover:bg-amber-500/15"
            disabled={busySlot !== null}
            onClick={() => void runSlot("morning")}
          >
            {busySlot === "morning" ? <RefreshCw className="size-3.5 animate-spin" /> : <CalendarClock className="size-3.5" />}
            ارسال تابلوی برنامه صبح
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 border-cyan-500/30 bg-cyan-500/5 text-[11px] text-cyan-300 hover:bg-cyan-500/15"
            disabled={busySlot !== null}
            onClick={() => void runSlot("tomorrow")}
          >
            {busySlot === "tomorrow" ? <RefreshCw className="size-3.5 animate-spin" /> : <RadioTower className="size-3.5" />}
            اجرای پیش‌نمایش فردا
          </Button>
          <span className="text-[10px] text-muted-foreground">
            پیشران: دیمن پخش :3011 (هر ۹۰ ثانیه) + زمان‌بند سرور (هر ۱۰ دقیقه) — کاملاً مستقل از مرورگر
          </span>
        </div>

        {toast && (
          <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200" role="status">
            {toast}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
