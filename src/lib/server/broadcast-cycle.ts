// ─────────────────────────────────────────────────────────────────────────────
// چرخه پخش مشترک (Shared Broadcast Cycle) — v19.0 NeoBet Official Broadcast
//
// معماری ضد «وابستگی به مرورگر»: منطق کامل ایجنت سوپروایزر تلگرام از زمان‌بند
// Next.js به این ماژول مشترک منتقل شد تا دو اجراکننده مستقل با همان خط لوله کار
// کنند و هیچ‌وقت هیچ پستی گم نشود:
//   ۱) زمان‌بند درون Next.js (scheduler.ts) — هر ۹۰ ثانیه
//   ۲) دیمن مستقل broadcast-daemon (mini-services/broadcast-daemon، پورت 3011)
//      — حتی وقتی سرور Next در حال ری‌استارت/کامپایل است، پخش ادامه دارد
// ضد تکرار: همه پست‌ها با ادعای اتمی INSERT-first روی TelegramOutbox.dedupeKey
// (یکتا در سطح SQLite) قفل می‌شوند — هر تعداد پردازه موازی، صفر ارسال دوباره.
// ─────────────────────────────────────────────────────────────────────────────

// ساعت‌های ایجنت سوپروایزر تلگرام (به وقت تهران)
export const VIP_BRIEF_HOUR = 10; // بریفینگ صبح کانال VIP
export const NEWS_SLOTS = [
  { hour: 9, minute: 30, slot: 0 },
  { hour: 16, minute: 30, slot: 1 },
];
export const EDU_SLOTS = [
  { hour: 11, minute: 30, slot: 0 },
  { hour: 18, minute: 30, slot: 1 },
];
export const WEEKLY_HOUR = 22; // جمعه ۲۲:۰۰
export const WEEKDAY_FRIDAY = 5;
export const FUNNEL_PNL_HOUR = 23;
export const FUNNEL_PNL_MINUTE = 30;
export const MARKETING_START_HOUR = 9;
export const MARKETING_END_HOUR = 23;

/** ساعت، دقیقه و روز هفته فعلی به وقت تهران (weekday: 0=یکشنبه … 6=شنبه) */
export function tehranNow(): { hour: number; minute: number; dateKey: string; weekday: number } {
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

/**
 * Slot Catch-Up Engine: اگر موتور در پنجره دقیق یک اسلات خاموش بوده، محتوای همان
 * روز بعد از روشن شدن دیرتر ارسال می‌شود — هیچ اسلاتی گم نمی‌شود.
 */
function slotDue(
  th: { hour: number; minute: number },
  hour: number,
  minute: number
): boolean {
  return th.hour > hour || (th.hour === hour && th.minute >= minute);
}

export interface BroadcastCycleResult {
  dispatched: boolean;
  cards: number;
  results: number;
  gift: string;
  ad: string;
  brief: string;
  news: string[];
  edu: string[];
  digest: boolean;
  pnl: boolean;
  weekly: string;
  winRate: boolean;
}

/**
 * یک پاس کامل پخش: صف کارت/نتیجه + تمام اسلات‌های فانل و ایجنت سوپروایزر.
 * هر فراخوان مستقل و idempotent است — فراخوانی تکراری در همان بازه = no-op.
 */
export async function runBroadcastCycle(options?: {
  maxCards?: number;
  maxResults?: number;
}): Promise<BroadcastCycleResult> {
  const out: BroadcastCycleResult = {
    dispatched: false,
    cards: 0,
    results: 0,
    gift: "-",
    ad: "-",
    brief: "-",
    news: [],
    edu: [],
    digest: false,
    pnl: false,
    weekly: "-",
    winRate: false,
  };

  // ═══ ۰) v20.0 — هسته موتور داخل چرخه پخش (استقلال کامل از مرورگر و سرور Next) ═══
  // اسکن ESPN → صدور کارت → تسویه FT → کالیبراسیون دسته‌ها — خودتنظیم با TTL ۱۰ دقیقه؛
  // حتی اگر سرور Next در حال ری‌استارت باشد و زمان‌بند درون Next خاموش باشد، دیمن مستقل
  // :3011 کل خط لوله موتور را گرم و پایدار نگه می‌دارد.
  try {
    const { autoSyncPastAndPresentMatches } = await import("./auto-issue");
    const sync = await autoSyncPastAndPresentMatches({ notify: true });
    if (sync.scanned > 0) {
      console.log(`[broadcast-cycle] engine sync: scanned=${sync.scanned} today=${sync.registeredToday} settled=${sync.settled} vetoed=${sync.vetoed}`);
    }
  } catch (err) {
    console.warn("[broadcast-cycle] engine sync failed:", err instanceof Error ? err.message : err);
  }

  // ═══ ۰.۵) v20.0 — گرم‌کننده سه‌گانه داشبورد (lineup → مناظره → پرتفوی) ═══
  // ریشه «داشبورد وابسته به مرورگر»: این خط لوله فقط در مرورگر اجرا می‌شد. حالا دیمن
  // مستقل آن را در EngineSnapshot ذخیره می‌کند تا داشبورد بدون مرورگرِ باز هم گرم بماند.
  try {
    const { warmEngineSnapshots } = await import("./engine-warmer");
    await warmEngineSnapshots("SERVER_DAEMON");
  } catch (err) {
    console.warn("[broadcast-cycle] engine warm failed:", err instanceof Error ? err.message : err);
  }

  // ─── ۱) صف انتشار تلگرام (کارت‌های تایید سوپروایزر + نتایج FT) ───
  // v16.0 — سقف هر پاس: ۴ کارت / ۳ نتیجه — فلش‌کارت‌های «بازی‌های روز» قبل از کیک‌آف
  // کامل مخابره می‌شوند؛ v19.0 — ادعای اتمی INSERT-first ضد تکرار بین پردازه‌ها.
  try {
    const { autoDispatchApprovedSlips, sendDailyDigest } = await import("./telegram-service");
    const d = await autoDispatchApprovedSlips({ maxCards: options?.maxCards ?? 4, maxResults: options?.maxResults ?? 3 });
    out.dispatched = d.ok;
    out.cards = d.sentCards;
    out.results = d.sentResults;
    if (d.ok && d.detail === "dispatched") {
      console.log(`[broadcast-cycle] dispatched cards=${d.sentCards} results=${d.sentResults}`);
    }

    // ─── ۲) گزارش تصویری روزانه وین‌ریت + برآیند روزانه — ۲۱:۰۰ تهران (catch-up تا پایان روز) ───
    const th = tehranNow();
    if (slotDue(th, 21, 0)) {
      const ok = await sendDailyDigest(false);
      out.digest = ok;
    }
  } catch (err) {
    console.warn("[broadcast-cycle] dispatch/digest failed:", err instanceof Error ? err.message : err);
  }

  // ═══ ۳) ایجنت سوپروایزر تلگرام: کانال عمومی @aineobet و کانال VIP ═══
  try {
    const funnel = await import("./telegram-service");
    const th = tehranNow();

    // ─── v20.0 — جبران اسلات‌های گم‌شده روز قبل (Slot Catch-Up Ledger) ───
    // ریشه «هیچ پستی ارسال نمی‌شود»: اگر سیستم در طول روز تهران خاموش بوده، همه اسلات‌های
    // آن روز (خبر/درس/بریفینگ/کارت هدیه/برآیند) برای همیشه گم می‌شدند چون catch-up قدیمی
    // فقط «درون همان روز تهران» کار می‌کرد و بعد از نیمه‌شب می‌مُرد. حالا: اولین تیک
    // پنجره بازاریابی هر روز، اسلات‌های تایید‌نشدهِ دیروز را چک می‌کند و دقیقاً یک‌بار جبران می‌کند.
    await catchUpMissedSlots(funnel);

    // ─── کارت رایگان روزانه (اولویت دژ نفوذناپذیر) — هر تیک بین ۹ تا ۲۳ تلاش می‌شود ───
    if (th.hour >= MARKETING_START_HOUR && th.hour <= MARKETING_END_HOUR) {
      const gift = await funnel.sendDailyGiftCard(false);
      out.gift = gift.detail;
      if (gift.ok) console.log(`[broadcast-cycle] daily free VIP card sent to public (${gift.detail})`);
    }

    // ─── بنر بازاریابی هوشمند ساعتی — ۰۹ تا ۲۳ تهران ───
    if (th.hour >= MARKETING_START_HOUR && th.hour <= MARKETING_END_HOUR) {
      const ad = await funnel.sendHourlyVipAd(false);
      out.ad = ad.topic;
      if (ad.ok) console.log(`[broadcast-cycle] hourly VIP marketing banner sent: ${ad.topic}`);
    }

    // ─── بریفینگ صبح کانال VIP (۱۰:۰۰ تهران + جبران تا پایان روز) ───
    if (slotDue(th, VIP_BRIEF_HOUR, 0)) {
      const brief = await funnel.sendVipMorningBrief(false);
      out.brief = brief.detail;
      if (brief.ok) console.log(`[broadcast-cycle] VIP morning brief sent (${brief.detail})`);
    }

    // ─── خبرهای مهم فوتبال (۰۹:۳۰ و ۱۶:۳۰ تهران + جبران اسلات از دست‌رفته) ───
    for (const ns of NEWS_SLOTS) {
      if (slotDue(th, ns.hour, ns.minute)) {
        const news = await funnel.sendFootballNews(false, ns.slot);
        out.news.push(news.detail);
        if (news.ok) console.log(`[broadcast-cycle] football news board sent (slot ${ns.slot})`);
      }
    }

    // ─── آکادمی اصطلاحات BET (۱۱:۳۰ و ۱۸:۳۰ تهران + جبران) ───
    for (const es of EDU_SLOTS) {
      if (slotDue(th, es.hour, es.minute)) {
        const edu = await funnel.sendBetTermLesson(false, es.slot);
        out.edu.push(edu.detail);
        if (edu.ok) console.log(`[broadcast-cycle] BET term lesson sent (slot ${es.slot})`);
      }
    }

    // ─── گزارش هفتگی (جمعه ۲۲:۰۰ تهران + جبران تا پایان جمعه) → هر دو کانال ───
    if (th.weekday === WEEKDAY_FRIDAY && slotDue(th, WEEKLY_HOUR, 0)) {
      const weekly = await funnel.sendWeeklyDigest(false);
      out.weekly = weekly.detail;
      if (weekly.ok) console.log("[broadcast-cycle] weekly audit report sent to both channels");
    }

    // ─── برآیند واقعی شب ۲۳:۳۰ تهران (Dedupe اتمی روزانه + جبران تا ۲۳:۵۹) ───
    if (slotDue(th, FUNNEL_PNL_HOUR, FUNNEL_PNL_MINUTE)) {
      const ok = await funnel.sendNightlyPnl(false);
      out.pnl = ok;
      if (ok) console.log("[broadcast-cycle] funnel nightly disjoint PnL sent to public channel");
    }
  } catch (err) {
    console.warn("[broadcast-cycle] channel director failed:", err instanceof Error ? err.message : err);
  }

  return out;
}

// ═══ v20.0 — دفتر جبران اسلات‌های گم‌شده (Slot Catch-Up Ledger) ═══
// کلید روزانه‌ی جبران: فقط یک‌بار در روز اجرا می‌شود (claim اتمی).
const CATCHUP_DAY_KEY = "broadcast_catchup_last_day";

/**
 * catchUpMissedSlots — جبران کراس-نیمه‌شب اسلات‌های از‌دست‌رفته:
 * اگر روز تهرانِ قبل هر اسلاتی (خبر ×۲ / درس ×۲ / بریفینگ VIP / کارت هدیه /
 * برآیند روزانه / برآیند شبانه) بدون ارسال موفق مانده باشد، اولین تیک پنجره
 * بازاریابی امروز (۰۹:۰۰+) همان محتوا را دقیقاً یک‌بار جبران می‌کند:
 *   · NEWS/BET/BRIEF/GIFT → با کلید اتمی «امروز» ارسال می‌شوند (محتوای تازه؛
 *     اسلات معادل امروز مصرف می‌شود — هیچ ارسال دوباره‌ای شکل نمی‌گیرد)
 *   · DIGEST/PNL → با کلید اتمی «دیروز» و داده‌های همان روز جبران می‌شوند
 *     (پارامتر dayKey override — محتوای واقعیِ روزِ از‌دست‌رفته)
 * هیچ اسلاتی دیگر «برای همیشه» گم نمی‌شود — حتی پس از خاموشی شبانه/ری‌استارت.
 */
async function catchUpMissedSlots(
  funnel: typeof import("./telegram-service")
): Promise<void> {
  try {
    const th = tehranNow();
    // فقط در پنجره بازاریابی (۰۹ تا ۲۳ تهران) — جبران در ساعت معقول مخابره می‌شود
    if (th.hour < MARKETING_START_HOUR || th.hour > MARKETING_END_HOUR) return;

    // کلید اتمی روزانه: فقط اولین تیک روز جبران را اجرا می‌کند
    const { claimSetting, getSetting } = await import("./telegram-service");
    const done = await getSetting(CATCHUP_DAY_KEY);
    if (done === th.dateKey) return;
    const claimed = await claimSetting(CATCHUP_DAY_KEY, th.dateKey);
    if (!claimed) return;

    // روز تهرانِ قبل
    const ydayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" })
      .format(new Date(Date.now() - 24 * 3600_000));

    // بررسی ارسال موفق هر اسلات دیروز از روی صندوق اتمی TelegramOutbox
    const { db } = await import("@/lib/db");
    const sentKeys = new Set<string>();
    const rows = await db.telegramOutbox.findMany({
      where: {
        ok: true,
        dedupeKey: {
          in: [
            `NEWS:${ydayKey}:0`, `NEWS:${ydayKey}:1`,
            `BET:${ydayKey}:0`, `BET:${ydayKey}:1`,
            `BRIEF:${ydayKey}`, `GIFT:${ydayKey}`,
            `DIGEST:${ydayKey}`, `PNL:${ydayKey}`,
          ],
        },
      },
      select: { dedupeKey: true },
    });
    for (const r of rows) if (r.dedupeKey) sentKeys.add(r.dedupeKey);

    let recovered = 0;
    const missed = (k: string) => !sentKeys.has(k);

    // خبرهای فوتبال (دو اسلات)
    if (missed(`NEWS:${ydayKey}:0`)) {
      const r = await funnel.sendFootballNews(false, 0);
      if (r.ok) recovered += 1;
      console.log(`[catchup] v20.0 news slot0 of ${ydayKey} → ${r.detail}`);
    }
    if (missed(`NEWS:${ydayKey}:1`)) {
      const r = await funnel.sendFootballNews(false, 1);
      if (r.ok) recovered += 1;
      console.log(`[catchup] v20.0 news slot1 of ${ydayKey} → ${r.detail}`);
    }
    // آکادمی اصطلاحات (دو اسلات)
    if (missed(`BET:${ydayKey}:0`)) {
      const r = await funnel.sendBetTermLesson(false, 0);
      if (r.ok) recovered += 1;
      console.log(`[catchup] v20.0 edu slot0 of ${ydayKey} → ${r.detail}`);
    }
    if (missed(`BET:${ydayKey}:1`)) {
      const r = await funnel.sendBetTermLesson(false, 1);
      if (r.ok) recovered += 1;
      console.log(`[catchup] v20.0 edu slot1 of ${ydayKey} → ${r.detail}`);
    }
    // بریفینگ صبح کانال VIP
    if (missed(`BRIEF:${ydayKey}`)) {
      const r = await funnel.sendVipMorningBrief(false);
      if (r.ok) recovered += 1;
      console.log(`[catchup] v20.0 VIP brief of ${ydayKey} → ${r.detail}`);
    }
    // کارت رایگان روزانه کانال عمومی
    if (missed(`GIFT:${ydayKey}`)) {
      const r = await funnel.sendDailyGiftCard(false);
      if (r.ok) recovered += 1;
      console.log(`[catchup] v20.0 daily gift card of ${ydayKey} → ${r.detail}`);
    }
    // برآیند روزانه (دو کانال) — با داده‌های واقعی همان روزِ گم‌شده
    if (missed(`DIGEST:${ydayKey}`)) {
      const ok = await funnel.sendDailyDigest(false, ydayKey);
      if (ok) recovered += 1;
      console.log(`[catchup] v20.0 daily digest of ${ydayKey} → ${ok ? "sent" : "failed"}`);
    }
    // برآیند شبانه کانال عمومی — با داده‌های واقعی همان روزِ گم‌شده
    if (missed(`PNL:${ydayKey}`)) {
      const ok = await funnel.sendNightlyPnl(false, ydayKey);
      if (ok) recovered += 1;
      console.log(`[catchup] v20.0 nightly PnL of ${ydayKey} → ${ok ? "sent" : "failed"}`);
    }

    if (recovered > 0) {
      console.log(`[catchup] v20.0: ${recovered} missed slot(s) of ${ydayKey} recovered (cross-midnight catch-up ledger)`);
    }
  } catch (err) {
    console.warn("[catchup] failed:", err instanceof Error ? err.message : err);
  }
}
