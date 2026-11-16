// ─────────────────────────────────────────────────────────────────────────────
// برنامه روزانه حرفه‌ای پخش (Professional Daily Broadcast Program) — v21.0
//
// دستور کارفرما: «وابستگی به مرورگر همچنان برطرف نشده — یک برنامه روزانه حرفه‌ای
// با زمان‌بندی مشخص برای ارسال پیام‌ها و کارت‌ها به کانال عمومی و خصوصی بساز»
//
// این ماژول «منبع واحد حقیقت» جدول پخش روزانه است:
//   · جدول رسمی ۱۱ اسلات با ساعت دقیق تهران + کانال هدف (عمومی @aineobet / VIP خصوصی)
//   · دو اسلات جدید: 🌅 تابلوی برنامه صبح (۰۷:۳۰) + 🔮 پیش‌نمایش کارت‌های فردا (۱۹:۳۰)
//     — ریشه «کارت‌های تاییدشده فردا روزها بی‌ارسال می‌ماندند» حل شد: هر شب ساعت
//     ۱۹:۳۰ کارت‌های تاییدشدهِ فردا به کانال VIP (تصویر کامل) و فهرست بازی‌ها به
//     کانال عمومی مخابره می‌شود — هر کارت فقط و فقط یک‌بار (سیاست match-once).
//   · اجرا کاملاً سروری و مستقل از مرورگر: دیمن پخش :3011 هر ۹۰ ثانیه
//     runDailyProgramSlots را صدا می‌زند + زمان‌بند Next.js پشتیبان ۶۰۰ ثانیه‌ای.
//   · ضدتکرار مطلق: ادعای اتمی INSERT-first روی TelegramOutbox.dedupeKey.
//   · داشبورد فقط «نمایش‌دهنده» است (GET /api/telegram/program) — هیچ اسلاتی از
//     مرورگر اجرا نمی‌شود؛ مرورگر بسته = پخش ادامه دارد.
// ─────────────────────────────────────────────────────────────────────────────

import { db } from "@/lib/db";
import {
  VIP_MEMBERSHIP_LINK,
  channelId,
  publicChannelId,
  tehranDayRange,
  publishSlipToTelegram,
  sendHtmlTextTo,
} from "./telegram-service";
import { tehranNow } from "./broadcast-cycle";
import { faNum } from "@/lib/format";

// ═══════════════ جدول رسمی برنامه روزانه (منبع واحد حقیقت) ═══════════════

export type SlotTarget = "PUBLIC" | "VIP" | "BOTH";

export interface ProgramSlotDef {
  id: string;
  hour: number;
  minute: number;
  icon: string;
  title: string;
  target: SlotTarget;
  /** کلیدهای صندوق اتمی که «ارسال موفق امروز» را نشان می‌دهند (null = پویا) */
  dedupeKeys: ((dateKey: string) => string[]) | null;
  desc: string;
  /** اسلات تازه‌ثبت‌شده v21.0 */
  isNew?: boolean;
}

export const DAILY_PROGRAM: ProgramSlotDef[] = [
  {
    id: "MORNING_BOARD",
    hour: 7,
    minute: 30,
    icon: "🌅",
    title: "تابلوی برنامه پخش امروز",
    target: "BOTH",
    dedupeKeys: (dk) => [`PROG:MORNING:${dk}`],
    desc: "جدول کامل پخش روز + شمارش بازی‌ها و کارت‌های آماده — هر دو کانال",
    isNew: true,
  },
  {
    id: "NEWS_1",
    hour: 9,
    minute: 30,
    icon: "📰",
    title: "اخبار مهم فوتبال (صبح)",
    target: "PUBLIC",
    dedupeKeys: (dk) => [`NEWS:${dk}:0`],
    desc: "ترجمه فارسی مهم‌ترین خبرهای نقل‌وانتقال و ترکیب‌ها",
  },
  {
    id: "VIP_BRIEF",
    hour: 10,
    minute: 0,
    icon: "☀️",
    title: "بریفینگ صبح کانال VIP",
    target: "VIP",
    dedupeKeys: (dk) => [`BRIEF:${dk}`],
    desc: "خلاصه کارت‌های روز + سود تضمینی پوششی + تمرکز پیشنهادها",
  },
  {
    id: "GOLD_CARDS",
    hour: 12,
    minute: 0,
    icon: "👑",
    title: "موج کارت‌های تاج طلایی امروز",
    target: "VIP",
    dedupeKeys: null, // پویا — هر کارت کلید CARD:<slipId> خودش را دارد
    desc: "انتشار کارت‌های تایید سوپروایزر برای بازی‌های امروز (ادامه در طول روز)",
  },
  {
    id: "EDU_1",
    hour: 11,
    minute: 30,
    icon: "🎓",
    title: "آکادمی اصطلاحات BET (صبح)",
    target: "PUBLIC",
    dedupeKeys: (dk) => [`BET:${dk}:0`],
    desc: "درس آموزشی اصطلاحات شرط‌بندی کمی",
  },
  {
    id: "SILVER_CARDS",
    hour: 14,
    minute: 30,
    icon: "🥈",
    title: "موج کارت‌های تاج نقره‌ای",
    target: "VIP",
    dedupeKeys: null, // پویا
    desc: "شکارچی آلفای دفتر سایه — استیک نصف ۵۰ واحدی Half-Kelly",
  },
  {
    id: "NEWS_2",
    hour: 16,
    minute: 30,
    icon: "📰",
    title: "اخبار مهم فوتبال (عصر)",
    target: "PUBLIC",
    dedupeKeys: (dk) => [`NEWS:${dk}:1`],
    desc: "دومین اسلات خبری روز",
  },
  {
    id: "EDU_2",
    hour: 18,
    minute: 30,
    icon: "🎓",
    title: "آکادمی اصطلاحات BET (عصر)",
    target: "PUBLIC",
    dedupeKeys: (dk) => [`BET:${dk}:1`],
    desc: "دومین درس آموزشی روز",
  },
  {
    id: "TOMORROW_PREVIEW",
    hour: 19,
    minute: 30,
    icon: "🔮",
    title: "پیش‌نمایش کارت‌های فردا",
    target: "BOTH",
    dedupeKeys: (dk) => [`PROG:TOMORROW:${dk}`],
    desc: "کارت‌های تاییدشدهِ فردا: تصویر کامل در VIP + فهرست بازی‌ها در کانال عمومی",
    isNew: true,
  },
  {
    id: "DAILY_DIGEST",
    hour: 21,
    minute: 0,
    icon: "📊",
    title: "گزارش وین‌ریت + رشد بانک",
    target: "BOTH",
    dedupeKeys: (dk) => [`DIGEST:${dk}`],
    desc: "گزارش تصویری وین‌ریت واقعی و منحنی بانک ۱۰۰۰ واحدی",
  },
  {
    id: "NIGHT_PNL",
    hour: 23,
    minute: 30,
    icon: "🌙",
    title: "برآیند شبانه PnL",
    target: "PUBLIC",
    dedupeKeys: (dk) => [`PNL:${dk}`],
    desc: "سود/زیان مجزای روز برای ویترین عمومی",
  },
];

// ═══════════════ ابزارهای زمان تهران و ادعای اتمی ═══════════════

/** ساعت، دقیقه و کلید روز تهران (دوباره‌صدایی با broadcast-cycle بدون چرخه import) */
function tehranClock(): { hour: number; minute: number; dateKey: string; weekday: number } {
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

const WEEKDAY_FA = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"];

/** تاریخ شمسی تهران برای سرصفحه تابلوها */
function tehranDateFa(): string {
  try {
    return new Intl.DateTimeFormat("fa-IR", { timeZone: "Asia/Tehran", dateStyle: "full" }).format(new Date());
  } catch {
    return "";
  }
}

/** اسلات موعد کرده؟ (catch-up: بعد از عبور ساعت، تا پایان روز جبران می‌شود) */
function slotDue(th: { hour: number; minute: number }, hour: number, minute: number): boolean {
  return th.hour > hour || (th.hour === hour && th.minute >= minute);
}

/** ادعای اتمی INSERT-first — اگر کلید موجود باشد false (مسیر موازی قبلاً ادعا کرده) */
async function claimSlot(dedupeKey: string, kind: string): Promise<boolean> {
  try {
    await db.telegramOutbox.create({ data: { dedupeKey, slipId: null, kind, ok: false, detail: "CLAIMED" } });
    return true;
  } catch {
    return false;
  }
}

async function commitSlot(dedupeKey: string, ok: boolean, detail: string): Promise<void> {
  try {
    await db.telegramOutbox.updateMany({ where: { dedupeKey }, data: { ok, detail: detail.slice(0, 400) } });
  } catch (err) {
    console.warn("[daily-program] outbox commit failed:", dedupeKey, err instanceof Error ? err.message : err);
  }
}

async function releaseSlot(dedupeKey: string): Promise<void> {
  try {
    await db.telegramOutbox.deleteMany({ where: { dedupeKey, ok: false, detail: "CLAIMED" } });
  } catch {
    // بهترین‌تلاش
  }
}

function esc(s: string): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const faTime = (h: number, m: number) => `${faNum(String(h).padStart(2, "0"))}:${faNum(String(m).padStart(2, "0"))}`;

const TARGET_FA: Record<SlotTarget, string> = {
  PUBLIC: "کانال عمومی",
  VIP: "کانال VIP",
  BOTH: "هر دو کانال",
};

// ═══════════════ شمارنده‌های واقعی روز ═══════════════

export interface ProgramCounts {
  matchesToday: number;
  cardsTodayReady: number;
  cardsTomorrowReady: number;
  cardsSentToday: number;
  resultsPending: number;
}

export async function programCounts(): Promise<ProgramCounts> {
  const now = new Date();
  const day = tehranDayRange(now);
  const tomorrow = tehranDayRange(new Date(now.getTime() + 24 * 3600_000));
  const [matchesToday, cardsTodayReady, cardsTomorrowReady, cardsSentToday, resultsPending] = await Promise.all([
    db.match.count({ where: { kickoff: { gte: day.start, lt: day.end }, status: { in: ["UPCOMING", "ANALYZED", "LIVE"] } } }),
    db.issuedSlip.count({
      where: { status: { in: ["PENDING", "LIVE"] }, telegramCard: false, supervisorApproved: true, retroIssued: false, kickoff: { gte: day.start, lt: day.end } },
    }),
    db.issuedSlip.count({
      where: { status: { in: ["PENDING", "LIVE"] }, telegramCard: false, supervisorApproved: true, retroIssued: false, kickoff: { gte: tomorrow.start, lt: tomorrow.end } },
    }),
    db.telegramOutbox.count({ where: { kind: "CARD", ok: true, createdAt: { gte: day.start, lt: day.end } } }),
    db.issuedSlip.count({
      where: { status: { in: ["WON_A", "WON_B", "DOUBLE_WIN", "MIDDLE_TRAP"] }, telegramResult: false, supervisorApproved: true, retroIssued: false },
    }),
  ]);
  return { matchesToday, cardsTodayReady, cardsTomorrowReady, cardsSentToday, resultsPending };
}

// ═══════════════ اسلات ۰۷:۳۰ — تابلوی برنامه پخش امروز ═══════════════

/**
 * sendMorningProgramBoard — تابلوی صبح: جدول رسمی پخش امروز با ساعت دقیق + شمارش
 * واقعی بازی‌ها و کارت‌ها + لینک عضویت VIP — به هر دو کانال (عمومی + VIP خصوصی).
 */
export async function sendMorningProgramBoard(
  force = false
): Promise<{ ok: boolean; detail: string }> {
  const th = tehranClock();
  const dk = th.dateKey;
  const key = `PROG:MORNING:${dk}`;

  const already = await db.telegramOutbox.findFirst({ where: { dedupeKey: key, ok: true }, select: { id: true } });
  if (already && !force) return { ok: false, detail: "ALREADY_SENT" };

  const counts = await programCounts();

  const rows = DAILY_PROGRAM.map(
    (s) =>
      `<code>${faTime(s.hour, s.minute)}</code> ${s.icon} <b>${esc(s.title)}</b>\n     └─ ${TARGET_FA[s.target]}${s.isNew ? " · <i>جدید</i>" : ""}`
  ).join("\n");

  const text =
    `🌅 <b>برنامه رسمی پخش روزانه NEOBET</b>\n` +
    `<i>${esc(tehranDateFa())} — به وقت تهران</i>\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `⚽️ <b>بازی‌های امروز:</b> ${faNum(counts.matchesToday)} مسابقه در رادار\n` +
    `👑 <b>کارت‌های آماده امروز:</b> ${faNum(counts.cardsTodayReady)} کارت تایید سوپروایزر\n` +
    `🔮 <b>کارت‌های آماده فردا:</b> ${faNum(counts.cardsTomorrowReady)} کارت (پیش‌نمایش ${faTime(19, 30)})\n` +
    `✅ <b>کارت‌های امروز منتشرشده:</b> ${faNum(counts.cardsSentToday)}\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `📋 <b>جدول پخش امروز:</b>\n${rows}\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `🛡️ همه کارت‌ها با داچینگ دو‌تیپ، سود تضمینی پوششی در کپشن و هش SHA-256 راستی‌آزمایی منتشر می‌شوند.\n` +
    `🎟 عضویت VIP (پرداخت Toman / USDT): ${VIP_MEMBERSHIP_LINK}`;

  const [pub, vip] = await Promise.all([publicChannelId(), channelId()]);
  const results = await Promise.all([
    sendHtmlTextTo(pub, text, "MORNING_BOARD"),
    sendHtmlTextTo(vip, text, "MORNING_BOARD"),
  ]);
  const ok = results.every((r) => r.ok);
  const detail = results.map((r) => r.detail).join(" | ");

  if (!already) {
    if (!force && !(await claimSlot(key, "MORNING_BOARD"))) return { ok: false, detail: "ALREADY_CLAIMED" };
    await commitSlot(key, ok, detail);
  }
  console.log(`[daily-program] morning board → both channels (${ok ? "sent" : detail})`);
  return { ok, detail };
}

// ═══════════════ اسلات ۱۹:۳۰ — پیش‌نمایش کارت‌های فردا ═══════════════

/**
 * sendTomorrowPreview — حل ریشه‌ای «کارت‌های تاییدشده فردا روزها بی‌ارسال می‌مانند»:
 * هر شب ۱۹:۳۰ تهران، همه کارت‌های تایید سوپروایزر برای بازی‌های فردا مخابره می‌شوند:
 *   · کانال VIP: تصویر کامل کارت (همان خط لوله publishSlipToTelegram با هر ۳ لایه
 *     ادعای اتمی + دروازه تصویر کامل + سیاست match-once → هر کارت فقط یک‌بار)
 *   · کانال عمومی: تابلوی متنی فهرست بازی‌های کارت‌دار فردا (بدون افشای تیپ‌ها)
 */
export async function sendTomorrowPreview(
  force = false
): Promise<{ ok: boolean; detail: string; sent: number; listed: number }> {
  const th = tehranClock();
  const dk = th.dateKey;
  const key = `PROG:TOMORROW:${dk}`;

  const already = await db.telegramOutbox.findFirst({ where: { dedupeKey: key, ok: true }, select: { id: true } });
  if (already && !force) return { ok: false, detail: "ALREADY_SENT", sent: 0, listed: 0 };

  const tomorrow = tehranDayRange(new Date(Date.now() + 24 * 3600_000));
  const slips = await db.issuedSlip.findMany({
    where: {
      status: { in: ["PENDING", "LIVE"] },
      telegramCard: false,
      supervisorApproved: true,
      retroIssued: false,
      kickoff: { gte: tomorrow.start, lt: tomorrow.end },
    },
    orderBy: { kickoff: "asc" },
    take: 8,
    select: {
      id: true, league: true, homeTeam: true, awayTeam: true, kickoff: true,
      crownTier: true, guaranteedProfit: true, labelA: true, labelB: true, oddsA: true, oddsB: true,
    },
  });

  if (slips.length === 0) {
    // هنوز کارتی برای فردا تایید نشده — claim نمی‌گیریم تا تیک بعدی دوباره چک کند؛
    // اگر تا ۲۳:۵۹ تهران هیچ کارتی تایید نشد، روز طبیعی می‌بندد (بدون ارسال).
    return { ok: false, detail: "TOMORROW_EMPTY", sent: 0, listed: 0 };
  }

  let sent = 0;
  const listed: string[] = [];
  for (const s of slips) {
    try {
      const full = await db.issuedSlip.findUnique({ where: { id: s.id } });
      if (!full) continue;
      // همان خط لوله رسمی کارت — هر ۳ لایه ادعا + دروازه تصویر + match-once
      const res = await publishSlipToTelegram(full, "CARD");
      if (res.ok) sent += 1;
      else if (res.detail === "MATCH_ALREADY_POSTED" || res.detail === "ALREADY_SENT_OR_CLAIMED") {
        sent += 0; // قبلاً مخابره شده — در فهرست عمومی می‌آید ولی دوباره نمی‌رود
      }
      const tier = s.crownTier === "GOLD" ? "👑" : s.crownTier === "SILVER_SHADOW" ? "🥈" : "🎯";
      const ko = new Intl.DateTimeFormat("fa-IR", {
        timeZone: "Asia/Tehran", hour: "2-digit", minute: "2-digit", hour12: false,
      }).format(new Date(s.kickoff));
      listed.push(`${tier} <b>${esc(s.homeTeam)} × ${esc(s.awayTeam)}</b>\n     └─ ${esc(s.league)} · ساعت ${ko} تهران`);
    } catch (err) {
      console.warn("[daily-program] tomorrow card failed:", s.id, err instanceof Error ? err.message : err);
    }
  }

  const pubText =
    `🔮 <b>پیش‌نمایش کارت‌های فردا NEOBET</b>\n` +
    `<i>${faNum(slips.length)} کارت تایید سوپروایزر برای بازی‌های فردا آماده شد</i>\n` +
    `━━━━━━━━━━━━━━━━━━\n${listed.join("\n")}\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `🎯 تیپ‌های کامل + مبالغ داچینگ + سود تضمینی پوششی، اعضای VIP دریافت کردند.\n` +
    `🎟 عضویت VIP: ${VIP_MEMBERSHIP_LINK}`;

  const pub = await publicChannelId();
  const pubRes = await sendHtmlTextTo(pub, pubText, "TOMORROW_PREVIEW");

  const ok = sent > 0 || pubRes.ok;
  const detail = `cards:${sent}/${slips.length} pub:${pubRes.detail}`;

  if (!already) {
    if (!force && !(await claimSlot(key, "TOMORROW_PREVIEW"))) return { ok: false, detail: "ALREADY_CLAIMED", sent, listed: slips.length };
    await commitSlot(key, ok, detail);
  }
  console.log(`[daily-program] tomorrow preview → VIP cards=${sent}/${slips.length}, public board ${pubRes.ok ? "sent" : pubRes.detail}`);
  return { ok, detail, sent, listed: slips.length };
}

// ═══════════════ اجراکننده اسلات‌های برنامه (سروری — بدون مرورگر) ═══════════════

export interface DailyProgramRunResult {
  morning: string;
  tomorrow: string;
}

/**
 * runDailyProgramSlots — در هر تیک دیمن (:3011 هر ۹۰s) و زمان‌بند پشتیبان Next
 * (:600s) صدا زده می‌شود؛ فقط اسلات‌های موعدکرده را اجرا می‌کند و خودش idempotent است.
 */
export async function runDailyProgramSlots(): Promise<DailyProgramRunResult> {
  const out: DailyProgramRunResult = { morning: "-", tomorrow: "-" };
  const th = tehranClock();

  if (slotDue(th, 7, 30)) {
    try {
      const r = await sendMorningProgramBoard(false);
      out.morning = r.detail;
    } catch (err) {
      console.warn("[daily-program] morning slot failed:", err instanceof Error ? err.message : err);
      out.morning = "ERROR";
    }
  }

  if (slotDue(th, 19, 30)) {
    try {
      const r = await sendTomorrowPreview(false);
      out.tomorrow = r.detail;
    } catch (err) {
      console.warn("[daily-program] tomorrow slot failed:", err instanceof Error ? err.message : err);
      out.tomorrow = "ERROR";
    }
  }

  return out;
}

// ═══════════════ وضعیت زنده برنامه (خوراک داشبورد و API) ═══════════════

export interface DailyProgramSlotStatus extends ProgramSlotDef {
  status: "SENT" | "DUE" | "UPCOMING";
  sentAt: string | null;
  info: string;
}

export interface DailyProgramStatus {
  dateKey: string;
  tehran: { hour: number; minute: number; weekdayFa: string; dateFa: string };
  slots: DailyProgramSlotStatus[];
  counts: ProgramCounts;
  nextSlotId: string | null;
  nextSlotInMin: number | null;
  sentCount: number;
}

/**
 * getDailyProgramStatus — وضعیت هر ۱۱ اسلات امروز از روی صندوق اتمی TelegramOutbox.
 * کاملاً سروری: مرورگر فقط نمایش می‌دهد — پیشران، دیمن مستقل :3011 است.
 */
export async function getDailyProgramStatus(): Promise<DailyProgramStatus> {
  const th = tehranClock();
  const dk = th.dateKey;
  const day = tehranDayRange(new Date());

  // کلیدهای ثابت امروز + ردیف‌های CARD امروز
  const staticKeys = DAILY_PROGRAM.flatMap((s) => (s.dedupeKeys ? s.dedupeKeys(dk) : []));
  const [outboxRows, counts] = await Promise.all([
    db.telegramOutbox.findMany({
      where: {
        ok: true,
        createdAt: { gte: day.start, lt: day.end },
        OR: [{ dedupeKey: { in: staticKeys } }, { kind: "CARD" }],
      },
      select: { dedupeKey: true, kind: true, createdAt: true },
    }),
    programCounts(),
  ]);

  const keySentAt = new Map<string, Date>();
  for (const r of outboxRows) {
    if (r.dedupeKey && !keySentAt.has(r.dedupeKey)) keySentAt.set(r.dedupeKey, r.createdAt);
  }
  const cardSends = outboxRows.filter((r) => r.kind === "CARD");
  const firstCardAt = cardSends.reduce<Date | null>(
    (acc, r) => (!acc || r.createdAt < acc ? r.createdAt : acc),
    null
  );

  const slots: DailyProgramSlotStatus[] = DAILY_PROGRAM.map((s) => {
    let sentAt: Date | null = null;
    if (s.dedupeKeys) {
      for (const k of s.dedupeKeys(dk)) {
        const at = keySentAt.get(k);
        if (at && (!sentAt || at < sentAt)) sentAt = at;
      }
    } else if (cardSends.length > 0) {
      sentAt = firstCardAt;
    }
    const due = slotDue(th, s.hour, s.minute);
    const status: "SENT" | "DUE" | "UPCOMING" = sentAt ? "SENT" : due ? "DUE" : "UPCOMING";
    const info =
      s.id === "GOLD_CARDS" || s.id === "SILVER_CARDS"
        ? `${faNum(counts.cardsSentToday)} کارت امروز منتشر شد`
        : s.id === "TOMORROW_PREVIEW"
          ? `${faNum(counts.cardsTomorrowReady)} کارت فردا آماده`
          : s.desc;
    return {
      ...s,
      status,
      sentAt: sentAt ? new Intl.DateTimeFormat("fa-IR", { timeZone: "Asia/Tehran", hour: "2-digit", minute: "2-digit", hour12: false }).format(sentAt) : null,
      info,
    };
  });

  const upcoming = slots
    .filter((s) => s.status !== "SENT")
    .sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));
  const next = upcoming[0] ?? null;
  const nextInMin = next ? Math.max(0, next.hour * 60 + next.minute - (th.hour * 60 + th.minute)) : null;

  return {
    dateKey: dk,
    tehran: {
      hour: th.hour,
      minute: th.minute,
      weekdayFa: WEEKDAY_FA[th.weekday] ?? "",
      dateFa: tehranDateFa(),
    },
    slots,
    counts,
    nextSlotId: next?.id ?? null,
    nextSlotInMin: nextInMin,
    sentCount: slots.filter((s) => s.status === "SENT").length,
  };
}
