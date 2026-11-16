// ─────────────────────────────────────────────────────────────────────────────
// زمان‌بند سرور (Server-Side Automation Loop) — v20.0 NeoBet Official Broadcast
//
// معماری دو-اجرایی با خط لوله مشترک (بدون وابستگی به مرورگر):
//   · خط لوله کامل پخش در broadcast-cycle.ts مشترک است
//   · دیمن مستقل mini-services/broadcast-daemon (:3011) — اجراکننده اصلی هر ۹۰ ثانیه
//   · این زمان‌بند (درون Next.js) — پشتیبان هر ۶۰۰ ثانیه (۱۰ دقیقه)
//
// v20.0 — تیک داخل Next از ۹۰ثانیه به ۶۰۰ثانیه کاهش یافت:
// ریشه OOM کشتن next-server (RSS ۲GB): اجرای خط لوله کامل (اسکن ESPN + رندر
// sharp + پخش) هر ۹۰ ثانیه داخل پروسه dev که خودش پین‌های سبک داشبورد را
// هرچند ثانیه سرویس می‌کند. حالا دیمن نقش اصلی (۹۰s) و این زمان‌بند نقش
// پشتیبان کم‌فشار (۶۰۰s) دارد — با ادعای اتمی مشترک، صفر ارسال دوباره.
// قابل تنظیم با env: NEOBET_SCHEDULER_TICK_MS
// heartbeat در Setting — برای نمایش «اتوماسیون سرور فعال» در UI
// ─────────────────────────────────────────────────────────────────────────────

import { getSchedulerStatus, patchSchedulerStatus } from "./scheduler-status";
import { setSetting } from "./telegram-service";

const TICK_INTERVAL_MS = Math.max(300_000, Number(process.env.NEOBET_SCHEDULER_TICK_MS ?? 600_000));

interface SchedulerState {
  timer: ReturnType<typeof setInterval> | null;
  busy: boolean;
  /** v18.1 — آخرین تیک موفق؛ نگهبان همیشه‌گرم روی این نگه می‌شود */
  lastTickAt: number;
  /** v18.1 — تایمر نگهبان: اگر حلقه اصلی بمیرد، خودکار ری‌استارت می‌کند */
  watchdog: ReturnType<typeof setInterval> | null;
}

const g = globalThis as unknown as { __fqSchedulerState?: SchedulerState };
g.__fqSchedulerState = g.__fqSchedulerState ?? { timer: null, busy: false, lastTickAt: 0, watchdog: null };
const state = g.__fqSchedulerState;

const WATCHDOG_INTERVAL_MS = 60_000;
const STALE_TICK_MS = 6 * 60_000; // بیش از ۵ تیک جاافتاده = حلقه مرده → ری‌استارت خودکار

async function runTick(): Promise<void> {
  if (state.busy) return;
  state.busy = true;
  try {
    try {
      // ─── ۱) خط لوله کامل بدون مرورگر: اسکن ESPN → صدور کارت → تسویه FT ───
      const { autoSyncPastAndPresentMatches } = await import("./auto-issue");
      try {
        await autoSyncPastAndPresentMatches({ notify: true });
      } catch (err) {
        console.warn("[scheduler] auto-sync failed:", err instanceof Error ? err.message : err);
      }

      // ─── ۱.۵) v20.0 — گرم‌کننده سه‌گانه داشبورد (پشتیبان دیمن :3011) ───
      // lineup → مناظره → پرتفوی بدون مرورگر، ذخیره در EngineSnapshot برای هیدراتاسیون
      try {
        const { warmEngineSnapshots } = await import("./engine-warmer");
        await warmEngineSnapshots("SERVER_SCHEDULER");
      } catch (err) {
        console.warn("[scheduler] engine warm failed:", err instanceof Error ? err.message : err);
      }

      // ─── ۲) چرخه پخش مشترک v19.0: کارت‌ها + نتایج + تمام اسلات‌های فانل ───
      const { runBroadcastCycle } = await import("./broadcast-cycle");
      await runBroadcastCycle();
    } catch (err) {
      // v18.1 — هیچ خطایی حلقه را نمی‌کشد؛ نگهبان همیشه‌گرم ادامه می‌دهد
      console.warn("[scheduler] tick error (loop kept alive):", err instanceof Error ? err.message : err);
    }
    state.lastTickAt = Date.now();
    const st = getSchedulerStatus();
    patchSchedulerStatus({ lastTickAt: Date.now(), tickCount: st.tickCount + 1 });
    await setSetting("scheduler_last_tick", new Date().toISOString()).catch(() => undefined);
  } finally {
    state.busy = false;
  }
}

/** بوت حلقه اتوماسیون — فقط یک‌بار در عمر پروسه؛ در instrumentation register صدا زده می‌شود */
export function startScheduler(): void {
  if (state.timer) return;
  const st = getSchedulerStatus();
  patchSchedulerStatus({ active: true, startedAt: st.startedAt ?? Date.now() });
  state.lastTickAt = Date.now();

  // نخستین پاس با تأخیر کوتاه (اجازه دهیم DB و شبکه آماده شوند)
  setTimeout(() => {
    void runTick();
  }, 12_000);

  state.timer = setInterval(() => {
    void runTick();
  }, TICK_INTERVAL_MS);

  // v18.1 — نگهبان همیشه‌گرم: موتور هسته هرگز مرده نمی‌ماند و به مرورگر وابسته نیست
  if (!state.watchdog) {
    state.watchdog = setInterval(() => {
      const idle = Date.now() - state.lastTickAt;
      if (idle > STALE_TICK_MS && !state.busy) {
        console.warn(`[scheduler] watchdog: automation loop stale ${Math.round(idle / 1000)}s — self-restart (always-warm guarantee)`);
        if (state.timer) clearInterval(state.timer);
        state.timer = setInterval(() => {
          void runTick();
        }, TICK_INTERVAL_MS);
        void runTick();
      }
    }, WATCHDOG_INTERVAL_MS);
  }

  console.log(`[scheduler] v20.0 server automation active — backstop tick every ${TICK_INTERVAL_MS / 1000}s (primary executor = broadcast-daemon :3011 every 90s · browser-independent · atomic claims · always-warm watchdog)`);
}

export function stopScheduler(): void {
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }
  if (state.watchdog) {
    clearInterval(state.watchdog);
    state.watchdog = null;
  }
  patchSchedulerStatus({ active: false });
}
