// ─────────────────────────────────────────────────────────────────────────────
// زمان‌بند سرور (Server-Side Automation Loop) — v18.2 NeoBet Official Broadcast
//
// پاسخ به مستقیم‌ترین دستور کارفرما: «سیستم و ارسال پیام‌ها به تلگرام نباید
// وابسته به مرورگر باشد» + خط لوله کامل ایجنت سوپروایزر تلگرام (v18.0):
//   · هر ۹۰ ثانیه: اسکن ESPN → صدور کارت → تسویه FT → انتشار خودکار:
//       کانال VIP  = فلش‌کارت‌های تاییدشده (فقط بازی‌های امروز تهران)
//       کانال عمومی @aineobet = فقط نتایج FT
//   · v18.2 — Slot Catch-Up Engine: اسلات‌های از‌دست‌رفته (خاموشی موتور در پنجره)
//     بعد از روشن شدن در همان روز جبران می‌شوند — هیچ پستی برای کل روز گم نمی‌شود.
//   · ۰۹:۳۰ و ۱۶:۳۰ تهران: خبرهای مهم فوتبال (وایر ESPN) → کانال عمومی
//   · ۱۰:۰۰ تهران: بریفینگ صبح VIP (کارت‌های امروز + توصیه‌های مهم) → کانال VIP
//   · ۱۱:۳۰ و ۱۸:۳۰ تهران: آکادمی اصطلاحات BET (دو درس چرخشی) → کانال عمومی
//   · ۰۹ تا ۲۳ تهران: ۱ کارت رایگان روزانه + بنر بازاریابی ساعتی → کانال عمومی
//   · ۲۱:۰۰ تهران: کارت نتیجه برایند روزانه → هر دو کانال
//   · ۲۲:۰۰ جمعه تهران: گزارش هفتگی با افراز مجزا → هر دو کانال
//   · ۲۳:۳۰ تهران: برآیند واقعی شب با افراز مجزا → کانال عمومی
//   · heartbeat در Setting — برای نمایش «اتوماسیون سرور فعال» در UI
// ─────────────────────────────────────────────────────────────────────────────

import { getSchedulerStatus, patchSchedulerStatus } from "./scheduler-status";
import { setSetting } from "./telegram-service";

const TICK_INTERVAL_MS = 90_000;
const DAILY_REPORT_HOUR_TEHRAN = 21;
const DAILY_REPORT_MINUTE_WINDOW = 5; // پنجره ۵ دقیقه‌ای پس از ساعت هدف
// v18.0 — ساعت‌های ایجنت سوپروایزر تلگرام
const VIP_BRIEF_HOUR = 10;       // بریفینگ صبح کانال VIP
const NEWS_SLOTS = [             // خبرهای فوتبال (وایر ESPN) → کانال عمومی
  { hour: 9, minute: 30, slot: 0 },
  { hour: 16, minute: 30, slot: 1 },
];
const EDU_SLOTS = [              // آکادمی اصطلاحات BET → کانال عمومی
  { hour: 11, minute: 30, slot: 0 },
  { hour: 18, minute: 30, slot: 1 },
];
const WEEKLY_HOUR = 22;          // گزارش هفتگی — جمعه ۲۲:۰۰
const WEEKLY_MINUTE_WINDOW = 10;
const WEEKDAY_FRIDAY = 5;        // Intl: 0=Sunday … 5=Friday
// v13.5 — کارت رایگان روزانه دیگر به ساعت ۱۲ گره نیست: هر تیک بین ۹ تا ۲۳ تلاش می‌کند
const FUNNEL_PNL_HOUR = 23;   // برآیند واقعی شب
const FUNNEL_PNL_MINUTE = 30;
const MARKETING_START_HOUR = 9;  // پنجره بنر بازاریابی ساعتی ۰۹ تا ۲۳ تهران
const MARKETING_END_HOUR = 23;

interface SchedulerState {
  timer: ReturnType<typeof setInterval> | null;
  busy: boolean;
  /** v18.1 — آخرین تیک موفق؛ نگهبان همیشه‌گرم روی این نگه می‌شود */
  lastTickAt: number;
  /** v18.1 — تایمر نگهبان: اگر حلقه اصلی بمیرد، خودکار ری‌استارت می‌کند */
  watchdog: ReturnType<typeof setInterval> | null;
}

/**
 * v18.2 — Slot Catch-Up Engine: اگر موتور در پنجره دقیق یک اسلات خاموش بوده،
 * محتوای همان روز بعد از روشن شدن دیرتر ارسال می‌شود — هیچ اسلاتی گم نمی‌شود.
 * امنیت: هر تابع فانل dedupe داخلی با Setting دارد؛ فراخوانی تکراری no-op است.
 */
function slotDue(
  th: { hour: number; minute: number },
  hour: number,
  minute: number
): boolean {
  return th.hour > hour || (th.hour === hour && th.minute >= minute);
}

const g = globalThis as unknown as { __fqSchedulerState?: SchedulerState };
g.__fqSchedulerState = g.__fqSchedulerState ?? { timer: null, busy: false, lastTickAt: 0, watchdog: null };
const state = g.__fqSchedulerState;

const WATCHDOG_INTERVAL_MS = 60_000;
const STALE_TICK_MS = 6 * 60_000; // بیش از ۵ تیک جاافتاده = حلقه مرده → ری‌استارت خودکار

/** ساعت، دقیقه و روز هفته فعلی به وقت تهران (weekday: 0=یکشنبه … 6=شنبه) */
function tehranNow(): { hour: number; minute: number; dateKey: string; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tehran",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
    weekday: WEEKDAYS[get("weekday")] ?? 0,
  };
}

async function runTick(): Promise<void> {
  if (state.busy) return;
  state.busy = true;
  try {
    try {
      await tickBody();
    } catch (err) {
      // v18.1 — هیچ خطایی حلقه را نمی‌کشد؛ نگهبان همیشه‌گرم ادامه می‌دهد
      console.warn("[scheduler] tick error (loop kept alive):", err instanceof Error ? err.message : err);
    }
    state.lastTickAt = Date.now();
  } finally {
    state.busy = false;
  }
}

async function tickBody(): Promise<void> {
  const st = getSchedulerStatus();
    // ─── ۱) خط لوله کامل بدون مرورگر: اسکن → صدور → تسویه → یادگیری → اعلام ───
    const { autoSyncPastAndPresentMatches } = await import("./auto-issue");
    try {
      await autoSyncPastAndPresentMatches({ notify: true });
    } catch (err) {
      console.warn("[scheduler] auto-sync failed:", err instanceof Error ? err.message : err);
    }

    // ─── ۲) صف انتشار تلگرام (کارت‌های تایید سوپروایزر + نتایج FT) ───
    // v16.0 — سقف هر پاس افزایش یافت (۴ کارت / ۳ نتیجه) تا فلش‌کارت‌های «بازی‌های روز»
    // در کانال VIP همیشه قبل از کیک‌آف کامل مخابره شوند (ریشه باگ تأخیر کانال VIP)
    try {
      const { autoDispatchApprovedSlips } = await import("./telegram-service");
      await autoDispatchApprovedSlips({ maxCards: 4, maxResults: 3 });
    } catch (err) {
      console.warn("[scheduler] auto-dispatch failed:", err instanceof Error ? err.message : err);
    }

    // ─── ۳) گزارش تصویری روزانه وین‌ریت — ۲۱:۰۰ تهران ───
    const th = tehranNow();
    const todayKey = th.dateKey;
    const lastReportDay = st.lastDailyReportAt ? tehranNowKey(st.lastDailyReportAt) : null;
    // v18.2 — catch-up: اگر ۲۱:۰۰ از دست رفته بود، هر تیک تا پایان همان روز جبران می‌کند
    if (slotDue(th, DAILY_REPORT_HOUR_TEHRAN, 0) && lastReportDay !== todayKey) {
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

    // ═══ v18.0 — ۴) ایجنت سوپروایزر تلگرام: کانال عمومی @aineobet و کانال VIP ═══
    //   کانال عمومی: نتایج + ۱ کارت رایگان روزانه + بنر بازاریابی ساعتی + برآیند شب ۲۳:۳۰
    //   + خبرهای فوتبال (۰۹:۳۰/۱۶:۳۰) + آکادمی BET (۱۱:۳۰/۱۸:۳۰)
    //   کانال VIP: فلش‌کارت‌ها (از مرحله ۲) + برآیند روزانه ۲۱:۰۰ + بریفینگ صبح ۱۰:۰۰
    //   جمعه ۲۲:۰۰: گزارش هفتگی → هر دو کانال
    try {
      const funnel = await import("./telegram-service");

      // ─── کارت رایگان روزانه (اولویت دژ نفوذناپذیر) — هر تیک بین ۹ تا ۲۳ تلاش می‌شود؛
      // Dedupe داخلی KEY_FUNNEL_GIFT_DAY ارسال تکراری را صفر می‌کند.
      if (th.hour >= MARKETING_START_HOUR && th.hour <= MARKETING_END_HOUR) {
        const gift = await funnel.sendDailyGiftCard(false);
        if (gift.ok) console.log(`[scheduler] daily free VIP card sent to public (${gift.detail})`);
        else if (!gift.detail.startsWith("ALREADY") && gift.detail !== "NO_TODAY_CARD") console.warn(`[scheduler] daily gift card skipped: ${gift.detail}`);
      }

      // ─── بنر بازاریابی هوشمند ساعتی — ۰۹ تا ۲۳ تهران، هر ساعت یک‌بار (Dedupe داخلی) ───
      if (th.hour >= MARKETING_START_HOUR && th.hour <= MARKETING_END_HOUR) {
        const ad = await funnel.sendHourlyVipAd(false);
        if (ad.ok) console.log(`[scheduler] hourly VIP marketing banner sent: ${ad.topic}`);
      }

      // ─── v18.0+18.2 — بریفینگ صبح کانال VIP (۱۰:۰۰ تهران + جبران تا پایان روز) ───
      if (slotDue(th, VIP_BRIEF_HOUR, 0)) {
        const brief = await funnel.sendVipMorningBrief(false);
        if (brief.ok) console.log(`[scheduler] VIP morning brief sent (${brief.detail})`);
        else if (!brief.detail.startsWith("ALREADY")) console.warn(`[scheduler] VIP brief skipped: ${brief.detail}`);
      }

      // ─── v18.0+18.2 — خبرهای مهم فوتبال (۰۹:۳۰ و ۱۶:۳۰ تهران + جبران اسلات از دست‌رفته) ───
      for (const ns of NEWS_SLOTS) {
        if (slotDue(th, ns.hour, ns.minute)) {
          const news = await funnel.sendFootballNews(false, ns.slot);
          if (news.ok) console.log(`[scheduler] football news board sent (slot ${ns.slot})`);
          else if (news.detail !== "ALREADY_SENT_THIS_SLOT" && news.detail !== "WIRE_EMPTY") console.warn(`[scheduler] football news skipped: ${news.detail}`);
        }
      }

      // ─── v18.0+18.2 — آکادمی اصطلاحات BET (۱۱:۳۰ و ۱۸:۳۰ تهران + جبران) ───
      for (const es of EDU_SLOTS) {
        if (slotDue(th, es.hour, es.minute)) {
          const edu = await funnel.sendBetTermLesson(false, es.slot);
          if (edu.ok) console.log(`[scheduler] BET term lesson sent (slot ${es.slot})`);
          else if (!edu.detail.startsWith("ALREADY")) console.warn(`[scheduler] BET lesson skipped: ${edu.detail}`);
        }
      }

      // ─── v18.0+18.2 — گزارش هفتگی (جمعه ۲۲:۰۰ تهران + جبران تا پایان جمعه) ───
      if (th.weekday === WEEKDAY_FRIDAY && slotDue(th, WEEKLY_HOUR, 0)) {
        const weekly = await funnel.sendWeeklyDigest(false);
        if (weekly.ok) console.log(`[scheduler] weekly audit report sent to both channels (${weekly.detail})`);
        else if (!weekly.detail.startsWith("ALREADY")) console.warn(`[scheduler] weekly digest skipped: ${weekly.detail}`);
      }

      // ─── برآیند واقعی شب ۲۳:۳۰ تهران با افراز مجزا (Dedupe روزانه داخلی + جبران تا ۲۳:۵۹) ───
      if (slotDue(th, FUNNEL_PNL_HOUR, FUNNEL_PNL_MINUTE)) {
        const ok = await funnel.sendNightlyPnl(false);
        if (ok) console.log("[scheduler] funnel nightly disjoint PnL sent to public channel");
      }
    } catch (err) {
      console.warn("[scheduler] channel director failed:", err instanceof Error ? err.message : err);
    }

    patchSchedulerStatus({ lastTickAt: Date.now(), tickCount: st.tickCount + 1 });
    await setSetting("scheduler_last_tick", new Date().toISOString()).catch(() => undefined);
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

  console.log(`[scheduler] v18.2 server automation active — tick every ${TICK_INTERVAL_MS / 1000}s (browser-independent + always-warm watchdog + slot catch-up)`);
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
