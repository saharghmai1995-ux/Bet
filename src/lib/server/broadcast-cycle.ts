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
