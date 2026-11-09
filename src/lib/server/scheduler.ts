// ─────────────────────────────────────────────────────────────────────────────
// زمان‌بند سرور (Server-Side Automation Loop) — v10.0
//
// پاسخ به مستقیم‌ترین دستور کارفرما: «سیستم و ارسال پیام‌ها به تلگرام نباید
// وابسته به مرورگر باشد» + «همگام‌سازی و تسویه خودکار باید اتوماتیک باشد نه دستی»
//
// این حلقه با instrumentation.ts هنگام بوت سرور Next.js (runtime nodejs) بالا
// می‌آید و کاملاً مستقل از مرورگر کار می‌کند:
//   · هر ۹۰ ثانیه: اسکن ESPN (۳ روز + امروز) → صدور کارت تازه → تسویه FT →
//     ژورنال/دکترین → انتشار خودکار تلگرام (کارت/نتیجه/گزارش وین‌ریت)
//   · هر روز ساعت ۲۱:۰۰ تهران: گزارش وین‌ریت تصویری کانال
//   · heartbeat در Setting — برای نمایش «اتوماسیون سرور فعال» در UI
// ─────────────────────────────────────────────────────────────────────────────

import { getSchedulerStatus, patchSchedulerStatus } from "./scheduler-status";
import { setSetting } from "./telegram-service";

const TICK_INTERVAL_MS = 90_000;
const DAILY_REPORT_HOUR_TEHRAN = 21;
const DAILY_REPORT_MINUTE_WINDOW = 5; // پنجره ۵ دقیقه‌ای پس از ساعت هدف
// v13.0 — ساعت‌های قیف کانال عمومی
const FUNNEL_RADAR_HOUR = 11; // رادار شفافیت صبح
const FUNNEL_PNL_HOUR = 23;   // برآیند واقعی شب
const FUNNEL_PNL_MINUTE = 30;

interface SchedulerState {
  timer: ReturnType<typeof setInterval> | null;
  busy: boolean;
}

const g = globalThis as unknown as { __fqSchedulerState?: SchedulerState };
g.__fqSchedulerState = g.__fqSchedulerState ?? { timer: null, busy: false };
const state = g.__fqSchedulerState;

/** ساعت و دقیقه فعلی به وقت تهران */
function tehranNow(): { hour: number; minute: number; dateKey: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tehran",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return {
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

async function runTick(): Promise<void> {
  if (state.busy) return;
  state.busy = true;
  const st = getSchedulerStatus();
  try {
    // ─── ۱) خط لوله کامل بدون مرورگر: اسکن → صدور → تسویه → یادگیری → اعلام ───
    const { autoSyncPastAndPresentMatches } = await import("./auto-issue");
    try {
      await autoSyncPastAndPresentMatches({ notify: true });
    } catch (err) {
      console.warn("[scheduler] auto-sync failed:", err instanceof Error ? err.message : err);
    }

    // ─── ۲) صف انتشار تلگرام (کارت‌های تایید سوپروایزر + نتایج FT) ───
    try {
      const { autoDispatchApprovedSlips } = await import("./telegram-service");
      await autoDispatchApprovedSlips({ maxCards: 2, maxResults: 2 });
    } catch (err) {
      console.warn("[scheduler] auto-dispatch failed:", err instanceof Error ? err.message : err);
    }

    // ─── ۳) گزارش تصویری روزانه وین‌ریت — ۲۱:۰۰ تهران ───
    const th = tehranNow();
    const todayKey = th.dateKey;
    const lastReportDay = st.lastDailyReportAt ? tehranNowKey(st.lastDailyReportAt) : null;
    if (th.hour === DAILY_REPORT_HOUR_TEHRAN && th.minute < DAILY_REPORT_MINUTE_WINDOW && lastReportDay !== todayKey) {
      try {
        const { sendWinRateReport, sendDailyDigest } = await import("./telegram-service");
        const ok = await sendWinRateReport(true);
        // پوستر برآیند روزانه (فقط نتایج واقعی)
        await sendDailyDigest(true).catch((e: unknown) => console.warn("[scheduler] daily digest failed:", e));
        if (ok) {
          patchSchedulerStatus({ lastDailyReportAt: Date.now() });
          await setSetting("scheduler_last_daily_report", new Date().toISOString()).catch(() => undefined);
          console.log("[scheduler] daily win-rate report sent");
        }
      } catch (err) {
        console.warn("[scheduler] daily report failed:", err instanceof Error ? err.message : err);
      }
    }

    // ═══ v13.0 — ۴) ایجنت مدیر کانال عمومی و VIP (قیف تبدیل @aineobet) ═══
    try {
      const funnel = await import("./telegram-service");
      // پست ۱ — رادار شفافیت ۱۱:۰۰ تهران (Dedupe روزانه داخلی)
      if (th.hour === FUNNEL_RADAR_HOUR && th.minute < 10) {
        const ok = await funnel.sendPublicRadar(false);
        if (ok) console.log("[scheduler] funnel morning radar sent to public channel");
      }
      // پست ۲ — گیفت + تیزرهای قفل‌شده در پنجره T-60 (Dedupe با outbox)
      const tq = await funnel.sendFunnelTeasers(false);
      if (tq.gift || tq.teasers > 0) console.log(`[scheduler] funnel T-60 dispatched: gift=${tq.gift} teasers=${tq.teasers}`);
      // پست ۳ — بازگشایی قفل + اثبات SHA-256 پس از FT (Dedupe با outbox)
      const unblurred = await funnel.sendPublicUnblur();
      if (unblurred > 0) console.log(`[scheduler] funnel unblur proof sent: ${unblurred}`);
      // پست ۴ — برآیند واقعی شب ۲۳:۳۰ تهران با افراز مجزا (Dedupe روزانه داخلی)
      if (th.hour === FUNNEL_PNL_HOUR && th.minute >= FUNNEL_PNL_MINUTE && th.minute < FUNNEL_PNL_MINUTE + 10) {
        const ok = await funnel.sendNightlyPnl(false);
        if (ok) console.log("[scheduler] funnel nightly disjoint PnL sent to public channel");
      }
    } catch (err) {
      console.warn("[scheduler] funnel director failed:", err instanceof Error ? err.message : err);
    }

    patchSchedulerStatus({ lastTickAt: Date.now(), tickCount: st.tickCount + 1 });
    await setSetting("scheduler_last_tick", new Date().toISOString()).catch(() => undefined);
  } finally {
    state.busy = false;
  }
}

function tehranNowKey(ms: number): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** بوت حلقه اتوماسیون — فقط یک‌بار در عمر پروسه؛ در instrumentation register صدا زده می‌شود */
export function startScheduler(): void {
  if (state.timer) return;
  const st = getSchedulerStatus();
  patchSchedulerStatus({ active: true, startedAt: st.startedAt ?? Date.now() });

  // نخستین پاس با تأخیر کوتاه (اجازه دهیم DB و شبکه آماده شوند)
  setTimeout(() => {
    void runTick();
  }, 12_000);

  state.timer = setInterval(() => {
    void runTick();
  }, TICK_INTERVAL_MS);

  console.log(`[scheduler] v10.0 server automation active — tick every ${TICK_INTERVAL_MS / 1000}s (browser-independent)`);
}

export function stopScheduler(): void {
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }
  patchSchedulerStatus({ active: false });
}
