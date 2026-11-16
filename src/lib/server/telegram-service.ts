// ─────────────────────────────────────────────────────────────────────────────
// سرویس کانال تلگرام VIP (Telegram VIP Broadcaster) — v7.0
//
//   ۱) انتشار فلش‌کارت کامل: تصویر فوتبالی + تیپ A + تیپ B + مبالغ داچینگ +
//      هش SHA-256 + لینک راستی‌آزمایی ESPN (پیام HTML فرمت‌بندی‌شده)
//   ۲) حالت تیزر جذب کاربر: نام مسابقه + درصد سود تضمینی + تیپ A —
//      تیپ B سانسور می‌شود (🔒 [مخصوص اعضای کانال VIP]) تا کاربران به خرید
//      اشتراک VIP ترغیب شوند.
//   ۳) اعلام خودکار نتیجه پس از FT: تصویر جام پیروزی برای کارت‌های برنده،
//      تصویر رختکن بهم‌ریخته برای کارت‌های بازنده (شفافیت کامل).
//
// توکن بات: env TELEGRAM_BOT_TOKEN یا ذخیره‌شده در Setting (مودال تنظیمات)
// کانال: env TELEGRAM_VIP_CHANNEL_ID یا Setting — v8.0 پیش‌فرض رسمی کانال: @aineobet
// ─────────────────────────────────────────────────────────────────────────────

import { db } from "@/lib/db";
import { computeMasterLedgerMetrics } from "./master-metrics";
import {
  renderSlipCardPNG,
  renderSlipResultPNG,
  renderSlipTeaserPNG,
  renderWinRateReportPNG,
  renderDailyReportPNG,
  renderDailyRadarPNG,
  // v13.5.1 — رفع باگ «RENDER_FAILED» بنر بازاریابی ساعتی: این تابع هیچ‌وقت import نشده بود
  renderVipAdBannerPNG,
  // v18.0 — قالب‌های ایجنت سوپروایزر تلگرام (آکادمی BET / خبر / بریفینگ VIP / گزارش هفتگی)
  renderBetLessonPNG,
  renderNewsBoardPNG,
  renderVipBriefPNG,
  renderWeeklyDigestPNG,
} from "./slip-images";
import { fetchSoccerNews, newsTimeEn } from "./news-service";
// v18.1 — ترجمه فارسی خبرهای مهم برای کپشن دوزبانه (پوستر انگلیسی / کپشن فارسی)
import { translateNewsBatch, newsDateFa } from "./news-translate";
import { faNum } from "@/lib/format";
import { marketEnLabel, SETTLEMENT_RULE_EN, SETTLEMENT_RULE_FA } from "@/lib/engine/orthogonal";
import { score100Of } from "@/lib/supervisor";
// v20.0 — محاسبه واقعی سود تضمینی پوششی در کپشن (پاسخ «چرا محاسبه نمی‌شود؟»)
import { coverProfitOf, signedPct, signedUnit } from "./cover-profit";
import type { IssuedSlip } from "@prisma/client";

// ═════════════════════ تنظیمات (Setting + env) ═════════════════════

const KEY_TOKEN = "telegram_bot_token";
const KEY_CHANNEL = "telegram_channel_id";
/** v13.0 — کانال عمومی ویترین (Public Showcase) — جدا از کانال VIP */
export const KEY_PUBLIC_CHANNEL = "telegram_public_channel_id";
/** v9.0 — کلید سوییچ ارسال خودکار کارت‌های تایید سوپروایزر (پیش‌فرض: روشن) */
const KEY_AUTODISPATCH = "telegram_autodispatch";

/**
 * v13.5 — کانال عمومی رسمی کارفرما: @aineobet (رفع باگ ریشه‌ای انتشار).
 * قبلاً «@aineobet_public» بود که وجود خارجی ندارد → همه پست‌های عمومی «chat not found» می‌شدند.
 */
export const DEFAULT_PUBLIC_CHANNEL = "@aineobet";
/** v13.2 — کانال پیش‌فرض رسمی کانال VIP کارفرما (شناسه عددی کانال VIP واقعی) */
export const DEFAULT_VIP_CHANNEL = "-1004487154797";

/**
 * v15.0 — لینک رسمی عضویت VIP در کپشن‌های کانال عمومی (تصحیح‌شده به دستور کارفرما:
 * شناسه درست «@Aineobet_bot» است — نه «@aineobet_vip_bot»).
 */
export const VIP_MEMBERSHIP_LINK = "@Aineobet_bot";

/**
 * v13.2 — اعتبارسنجی قالب توکن بات تلگرام.
 * توکن معتبر = <bot_id>:<hash> مثل «9147801427:AAH2...» (۴۶ کاراکتر).
 * باگ ریشه‌ای کشف‌شده: توکن ناقص (فقط بخش hash) ذخیره شده بود → همه ارسال‌ها 404 Not Found.
 */
export function isValidBotTokenFormat(token: string): boolean {
  return /^\d{6,12}:[A-Za-z0-9_-]{30,}$/.test(String(token ?? "").trim());
}

/** v13.2 — راستی‌آزمایی زنده توکن با متد getMe — نام کاربری بات را برمی‌گرداند */
export async function verifyBotToken(token: string): Promise<{ ok: boolean; username: string | null; detail: string }> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token.trim()}/getMe`, { cache: "no-store" });
    const json = (await res.json()) as { ok?: boolean; result?: { username?: string }; description?: string };
    if (json.ok && json.result?.username) return { ok: true, username: json.result.username, detail: `@${json.result.username}` };
    return { ok: false, username: null, detail: json.description ?? `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, username: null, detail: err instanceof Error ? err.message : "network error" };
  }
}

export async function getSetting(key: string): Promise<string | null> {
  try {
    const row = await db.setting.findUnique({ where: { key } });
    return row?.value ?? null;
  } catch {
    return null;
  }
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
}

/**
 * v18.4 — claim اتمی کلید Setting برای dedupe بین‌پردازه‌ای (Atomic Dedupe Claim).
 * الگوی قدیمی «check → send → write» در دو اجرای هم‌زمان (زمان‌بند + مسیر دستی یا دو
 * پردازه) هر دو استمپ کهنه می‌خواند و همان پست را دوبار می‌فرستد. حالا claim قبل از
 * ارسال انجام می‌شود؛ فقط یک فراخوان برنده است (SQLite تک‌نویسنده).
 * خروجی false = دیگری قبلاً مالک شده — بدون ارسال.
 */
export async function claimSetting(key: string, value: string): Promise<boolean> {
  const existing = await db.setting.findUnique({ where: { key } }).catch(() => null);
  if (!existing) {
    try {
      await db.setting.create({ data: { key, value } });
      return true;
    } catch {
      return false; // مسیر موازی هم‌زمان ردیف را ساخت
    }
  }
  if (existing.value === value) return false;
  const res = await db.setting.updateMany({ where: { key, value: { not: value } }, data: { value } });
  return res.count === 1;
}

/** v18.4 — آزادسازی claim در شکست ارسال تا اسلات از دست نرود */
export async function unclaimSetting(key: string, value: string): Promise<void> {
  try {
    await db.setting.deleteMany({ where: { key, value } });
  } catch {
    // بهترین‌تلاش
  }
}

// ═══ v19.0 — ادعای اتمی Broadcast (Insert-First Claim) ═══
// ریشه ریشه‌ای باگ «ارسال پیام‌های تکراری»: الگوی claim قبلی (خواندن Setting سپس
// update شرطی) در هم‌پوشانی ری‌استارت‌های dev / دو پردازه موازی، توالی خواندن‌ها
// را stale می‌کرد و هر دو مسیر ادعا را می‌بردند. راه‌حل مهندسی v19.0:
// قبل از ارسال، یک ردیف TelegramOutbox با dedupeKey یکتا INSERT می‌شود.
//   · موفق بودن INSERT  = مالکیت ارسال با ماست (اتمیک در سطح SQLite — هر تعداد
//     پردازه و هر ری‌استارتی که باشد، ایندکس UNIQUE داور است)
//   · شکست INSERT       = ادعای قبلی موجود → بدون ارسال
// بعد از ارسال: commitBroadcast (ok=true) | در شکست: releaseBroadcast (حذف ردیف).
// کلیدها: CARD:<slipId> | RESULT:<slipId> | NEWS:<day>:<slot> | BET:<day>:<slot> |
// BRIEF:<day> | GIFT:<day> | AD:<day>:<hour> | DIGEST:<day> | PNL:<day> |
// WEEKLY:<week> | RADAR:<day> | UNBLUR:<slipId> | TEASER:<slipId>

const dedupeKeyOf = {
  card: (id: string) => `CARD:${id}`,
  result: (id: string) => `RESULT:${id}`,
  // ═══ v20.0 — ادعای سطح-بازی (هر بازی فقط یک‌بار) ═══
  // دستور کارفرما: «کارتهای تکراری به تلگرام ارسال نشود هر بازی فقط 1بار ارسال شود».
  // هر مسیر انتشار کارت‌نوع (CARD به VIP + GIFT/TEASER به عمومی) اول ادعای
  // MT-CARD:<matchKey> را می‌گیرد — اولین مسیرِ برنده ارسال می‌کند، بقیه skip.
  // نتیجه/اثبات FT هم همین‌طور: MT-RESULT:<matchKey> (RESULT یا UNBLUR — فقط یکی).
  mtCard: (matchKey: string) => `MT-CARD:${matchKey}`,
  mtResult: (matchKey: string) => `MT-RESULT:${matchKey}`,
  news: (day: string, slot: number) => `NEWS:${day}:${slot}`,
  bet: (day: string, slot: number) => `BET:${day}:${slot}`,
  brief: (day: string) => `BRIEF:${day}`,
  gift: (day: string) => `GIFT:${day}`,
  ad: (day: string, hour: number) => `AD:${day}:${hour}`,
  digest: (day: string) => `DIGEST:${day}`,
  pnl: (day: string) => `PNL:${day}`,
  weekly: (week: string) => `WEEKLY:${week}`,
  radar: (day: string) => `RADAR:${day}`,
  unblur: (id: string) => `UNBLUR:${id}`,
  teaser: (id: string) => `TEASER:${id}`,
  winrate: (day: string, bucket: number) => `WINRATE:${day}:${bucket}`,
};

/**
 * v20.0 — کلید یکتای سطح-بازی برای «هر بازی فقط یک‌بار»:
 * اولویت با externalId ESPN؛ بدون آن، ترکیب تیم‌ها + روز کیک‌آف تهران.
 */
export function matchKeyOf(slip: Pick<IssuedSlip, "externalId" | "homeTeam" | "awayTeam" | "kickoff">): string {
  if (slip.externalId && slip.externalId.trim()) return slip.externalId.trim();
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" }).format(new Date(slip.kickoff));
  return `${slip.homeTeam.trim().toLowerCase()}|${slip.awayTeam.trim().toLowerCase()}|${day}`;
}

/** آیا این بازی قبلاً یک پست کارت‌نوع داشته؟ (کارت VIP یا گیفت/تیزر عمومی) */
async function matchCardAlreadyPosted(matchKey: string): Promise<boolean> {
  try {
    const row = await db.telegramOutbox.findFirst({ where: { dedupeKey: { startsWith: `MT-CARD:${matchKey}` } }, select: { id: true } });
    return Boolean(row);
  } catch {
    return false;
  }
}

/** آیا این بازی قبلاً یک پست نتیجه‌نوع داشته؟ (نتیجه FT یا اثبات UNBLUR) */
async function matchResultAlreadyPosted(matchKey: string): Promise<boolean> {
  try {
    const row = await db.telegramOutbox.findFirst({ where: { dedupeKey: { startsWith: `MT-RESULT:${matchKey}` } }, select: { id: true } });
    return Boolean(row);
  } catch {
    return false;
  }
}

async function claimBroadcast(
  dedupeKey: string,
  slipId: string | null,
  kind: string
): Promise<boolean> {
  try {
    await db.telegramOutbox.create({ data: { dedupeKey, slipId, kind, ok: false, detail: "CLAIMED" } });
    return true;
  } catch {
    return false; // کلید یکتا موجود است — مسیر موازی قبلاً ادعا کرده
  }
}

async function commitBroadcast(dedupeKey: string, ok: boolean, detail: string): Promise<void> {
  try {
    await db.telegramOutbox.updateMany({ where: { dedupeKey }, data: { ok, detail: detail.slice(0, 400) } });
  } catch (err) {
    // v18.4 — قابل مشاهده بودن شکست ژورنال (ریشه خرابی repair پرچم‌ها)
    console.warn("[telegram] outbox commit failed:", dedupeKey, err instanceof Error ? err.message : err);
  }
}

async function releaseBroadcast(dedupeKey: string): Promise<void> {
  try {
    await db.telegramOutbox.deleteMany({ where: { dedupeKey, ok: false, detail: "CLAIMED" } });
  } catch {
    // بهترین‌تلاش
  }
}

async function botToken(): Promise<string | null> {
  const stored = await getSetting(KEY_TOKEN);
  return (stored && stored.trim()) || process.env.TELEGRAM_BOT_TOKEN || null;
}

async function channelId(): Promise<string | null> {
  const stored = await getSetting(KEY_CHANNEL);
  const fromEnv = process.env.TELEGRAM_VIP_CHANNEL_ID;
  // v8.0 — کانال @aineobet پیش‌فرض رسمی است؛ تنظیم کاربر/env در اولویت است
  return (stored && stored.trim()) || (fromEnv && fromEnv.trim()) || DEFAULT_VIP_CHANNEL;
}

/** v13.0 — کانال عمومی ویترین (Public Showcase Chat ID) — پیش‌فرض @aineobet_public */
export async function publicChannelId(): Promise<string | null> {
  const stored = await getSetting(KEY_PUBLIC_CHANNEL);
  const fromEnv = process.env.TELEGRAM_PUBLIC_CHANNEL_ID;
  return (stored && stored.trim()) || (fromEnv && fromEnv.trim()) || DEFAULT_PUBLIC_CHANNEL;
}

export async function telegramStatus(): Promise<{
  configured: boolean;
  channelSet: boolean;
  publicSet: boolean;
  /** v13.2 — قالب توکن معتبر است؟ (تشخیص زودهنگام توکن ناقص بدون فراخوانی API) */
  tokenFormat: boolean;
}> {
  const [token, channel, pub] = await Promise.all([botToken(), channelId(), publicChannelId()]);
  return {
    configured: Boolean(token),
    channelSet: Boolean(channel),
    publicSet: Boolean(pub),
    tokenFormat: token ? isValidBotTokenFormat(token) : false,
  };
}

// ═══════════ v9.0 — سوییچ ارسال خودکار (پیش‌فرض روشن) ═══════════

export async function getAutoDispatch(): Promise<boolean> {
  const v = await getSetting(KEY_AUTODISPATCH);
  return v === null ? true : v === "on";
}

export async function setAutoDispatch(on: boolean): Promise<void> {
  await setSetting(KEY_AUTODISPATCH, on ? "on" : "off");
}

// ═════════════════════ فرستنده پایه Bot API ═════════════════════

async function tgCall(method: string, body: Record<string, unknown>): Promise<{ ok: boolean; detail: string }> {
  const token = await botToken();
  if (!token) return { ok: false, detail: "NO_TOKEN" };
  // v13.2 — سپر توکن ناقص: خطای 404 مبهم تلگرام را با پیام دقیق جایگزین می‌کند
  if (!isValidBotTokenFormat(token)) return { ok: false, detail: "INVALID_TOKEN_FORMAT" };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const json = (await res.json()) as { ok?: boolean; description?: string; result?: { message_id?: number } };
    if (json.ok) return { ok: true, detail: `message:${json.result?.message_id ?? "?"}` };
    return { ok: false, detail: json.description ?? `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : "network error" };
  }
}

async function tgSendPhotoTo(
  chatId: string | null,
  photo: Buffer,
  caption: string,
  filename = "slip-card.png",
  captionless = false
): Promise<{ ok: boolean; detail: string }> {
  const token = await botToken();
  if (!token) return { ok: false, detail: "NO_TOKEN" };
  if (!chatId) return { ok: false, detail: "NO_CHANNEL" };
  // v13.2 — سپر توکن ناقص (بخش hash بدون bot_id) — ریشه باگ «انتشار انجام نمیشه»
  if (!isValidBotTokenFormat(token)) return { ok: false, detail: "INVALID_TOKEN_FORMAT" };
  // ═══ v20.0 — سپر «هیچ پیامی بدون تصویر کامل ارسال نشود» ═══
  // امضای PNG + حداقل حجم ۲۰KB — بافر ناقص/خراب هرگز به تلگرام نمی‌رود.
  if (!isValidPng(photo)) return { ok: false, detail: "PHOTO_INCOMPLETE" };
  try {
    // v20.0 — کپشن عکس همیشه «کاملاً HTML-معتبر و ≤۱۰۰۰ کاراکتر در مرز خط» —
    // ریشه ریشه‌ای «پیام بدون تصویر»: caption.slice(0,1024) تگ HTML را نصف می‌کرد
    // → تلگرام sendPhoto را با parse-error رد می‌کرد → فالبک متنی بی‌تصویر می‌رفت.
    const cap = captionless ? "" : safePhotoCaption(caption);
    let result = await tgSendPhotoAttempt(token, chatId, photo, cap, filename, captionless);
    // v20.0 — یک ری‌تای ارسال (خطای شبکه/آپلود گذرا) — همان بافر معتبر، بدون متن جایگزین
    if (!result.ok && !/parse|entities|caption/i.test(result.detail)) {
      await new Promise((r) => setTimeout(r, 1500));
      result = await tgSendPhotoAttempt(token, chatId, photo, cap, filename, captionless);
    }
    return result;
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : "network error" };
  }
}

/** v20.0 — اعتبارسنجی سخت PNG: امضای ۸ بایتی + حداقل ۲۰KB */
function isValidPng(buf: Buffer | null | undefined): boolean {
  if (!buf || buf.length < 20480) return false;
  const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 8; i++) if (buf[i] !== SIG[i]) return false;
  return true;
}

/**
 * v20.0 — کپشن ایمن عکس: برش فقط در مرز خط + بستن تگ‌های باز + سقف ۱۰۰۰ کاراکتر.
 * خروجی همیشه HTML-معتبر است (تلگرام هرگز parse-error نمی‌گیرد → پیام بی‌تصویر صفر).
 */
export function safePhotoCaption(text: string, limit = 1000): string {
  let s = String(text ?? "");
  if (s.length <= limit) return s;
  // برش در مرز خط — هیچ تگی نصف نمی‌شود
  s = s.slice(0, limit);
  const lastNl = s.lastIndexOf("\n");
  if (lastNl > 200) s = s.slice(0, lastNl);
  // شمارش تگ‌های باز تلگرام و بستن به ترتیب معکوس (HTML تلگرام فقط ۵ تگ پشتیبانی می‌کند)
  const TAGS = ["b", "i", "u", "s", "code", "pre", "a", "blockquote"];
  const stack: string[] = [];
  const re = /<\/?([a-z]+)[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const tag = m[1].toLowerCase();
    if (!TAGS.includes(tag)) continue;
    if (m[0][1] === "/") {
      const idx = stack.lastIndexOf(tag);
      if (idx >= 0) stack.length = idx;
    } else if (!m[0].endsWith("/>")) {
      stack.push(tag);
    }
  }
  for (const tag of stack.reverse()) s += `</${tag}>`;
  return s;
}

async function tgSendPhotoAttempt(
  token: string,
  chatId: string,
  photo: Buffer,
  caption: string,
  filename: string,
  captionless: boolean
): Promise<{ ok: boolean; detail: string }> {
  const form = new FormData();
  form.append("chat_id", chatId);
  if (!captionless && caption) {
    form.append("caption", caption);
    form.append("parse_mode", "HTML");
  }
  form.append("photo", new Blob([new Uint8Array(photo)], { type: "image/png" }), filename);
  const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, { method: "POST", body: form });
  const json = (await res.json()) as { ok?: boolean; description?: string; result?: { message_id?: number } };
  if (json.ok) return { ok: true, detail: `photo:${json.result?.message_id ?? "?"}${captionless ? ":broadcast" : ""}` };
  return { ok: false, detail: json.description ?? `HTTP ${res.status}` };
}

async function tgSendPhoto(
  photo: Buffer,
  caption: string,
  filename = "slip-card.png",
  captionless = false
): Promise<{ ok: boolean; detail: string }> {
  return tgSendPhotoTo(await channelId(), photo, caption, filename, captionless);
}

/** v12.0 — ارسال مستقیم پوسترهای تولیدی سرور (نردبان مرکب/گزارش‌ها) با پشتیبانی Broadcast */
export async function sendBroadcastPhoto(
  photo: Buffer,
  caption: string,
  filename: string,
  captionless = false
): Promise<{ ok: boolean; detail: string }> {
  const res = await tgSendPhoto(photo, caption, filename, captionless);
  await logOutbox(null, "BROADCAST", res.ok, res.detail);
  return res;
}

async function logOutbox(slipId: string | null, kind: string, ok: boolean, detail: string): Promise<void> {
  try {
    await db.telegramOutbox.create({ data: { slipId, kind, ok, detail: detail.slice(0, 400) } });
  } catch (err) {
    // v18.4 — لاگ اختیاری اما مشاهده‌پذیر: شکست نوشتن outbox پرچم repair را خراب می‌کند
    // (ریشه تکرار ارسال در v18.3) — باید در لاگ سرور دیده شود.
    console.warn("[telegram] outbox log failed:", kind, err instanceof Error ? err.message : err);
  }
}

// ═══ v18.4 — ضد تکرار ارسال (Anti-Duplicate Broadcast Infrastructure) ═══
// ریشه باگ «ارسال پیام‌های تکراری به کانال عمومی»: چهار مسیر ورود مستقل
// (زمان‌بند سرور، runSync فید زنده، POST autodispatch، POST config dispatchNow)
// هم‌زمان صف انتشار را اجرا می‌کردند؛ هر دو اسنپ‌شات stale می‌خواندند و همان
// پیام را دو بار می‌فرستادند. سه سپر:
//   ۱) قفل in-flight سراسری برای هر جریان ارسال (dispatch / funnel / winrate)
//   ۲) claim اتمی پرچم‌های telegramCard/telegramResult قبل از ارسال (updateMany شرطی)
//   ۳) آزادسازی claim در شکست ارسال تا ریتیپ بعدی از دست نرود

const gBroadcast = globalThis as unknown as {
  __fqDispatchInFlight?: boolean;
  __fqFunnelLock?: Promise<unknown> | null;
};

/** قفل رشته‌ای funnel — اجرای هم‌زمان دو پست فانل (دو مسیر ورود) را سریال می‌کند */
function withFunnelLock<F extends (...args: never[]) => Promise<unknown>>(fn: F): F {
  return (async (...args: Parameters<F>) => {
    const prev = gBroadcast.__fqFunnelLock ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    gBroadcast.__fqFunnelLock = prev.then(() => gate);
    await prev.catch(() => undefined);
    try {
      return await fn(...(args as Parameters<F>));
    } finally {
      release();
      if (gBroadcast.__fqFunnelLock === gate) gBroadcast.__fqFunnelLock = null;
    }
  }) as F;
}

/**
 * claim اتمی پرچم تلگرام اسلیپ — فقط یک فراخوان برنده می‌شود (SQLite تک‌نویسنده).
 * خروجی true = مالکیت ارسال با ماست؛ false = مسیر موازی قبلاً مالک شده (بدون ارسال).
 */
async function claimSlipFlag(slipId: string, field: "telegramCard" | "telegramResult"): Promise<boolean> {
  const res = await db.issuedSlip.updateMany({
    where: { id: slipId, [field]: false },
    data: { [field]: true },
  });
  return res.count === 1;
}

/** آزادسازی claim در شکست ارسال — مسیر بعدی دوباره تلاش می‌کند */
async function releaseSlipFlag(slipId: string, field: "telegramCard" | "telegramResult"): Promise<void> {
  try {
    await db.issuedSlip.update({ where: { id: slipId }, data: { [field]: false } });
  } catch {
    // آزادسازی بهترین‌تلاش
  }
}

// ═════════════════════ فرار HTML تلگرام ═════════════════════

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ═════════════════════ سازنده پیام کارت کامل ═════════════════════

/** پیام HTML فلش‌کارت کامل — تیپ A + تیپ B + داچینگ + SHA-256 + لینک ESPN */
export function buildCardMessage(slip: IssuedSlip): string {
  const kickoff = new Date(slip.kickoff).toLocaleString("fa-IR", { dateStyle: "short", timeStyle: "short" });
  // v15.0 — نام رسمی بین‌المللی مارکت هر تیپ (Institutional Execution Metadata)
  const legKeys = (json: string): string[] => {
    try {
      const arr = JSON.parse(json);
      return Array.isArray(arr) ? arr.map((l: { key?: string }) => String(l?.key ?? l)) : [];
    } catch {
      return [];
    }
  };
  const marketAEn = marketEnLabel(legKeys(slip.legsA)[0] ?? "");
  const marketBEn = marketEnLabel(legKeys(slip.legsB)[0] ?? "");
  const lines: string[] = [];
  // v18.0 — نشان سطح تاج کارت (Two-Tier Crown System)
  if (slip.crownTier === "SILVER_SHADOW") {
    lines.push(`🥈 <b>فوتبال‌کوانت — تاج نقره‌ای سطح ۲ · شکارچی آلفای سایه (استیک نصف ۵۰ واحدی Half-Kelly)</b>`);
  } else {
    lines.push(`⚽️ <b>فوتبال‌کوانت — فلش‌کارت الگوی طلایی اتمیک v18.0</b>`);
  }
  lines.push(`🏆 <b>${esc(slip.homeTeam)}</b> × <b>${esc(slip.awayTeam)}</b>`);
  lines.push(`📡 ${esc(slip.league)} · ⏰ ${kickoff}`);
  if (slip.archetype) lines.push(`📐 الگو: ${esc(slip.archetype)}`);
  lines.push("");
  lines.push(`🔹 <b>تیپ A</b> (ضریب ${slip.oddsA.toFixed(2)}): ${esc(slip.labelA)}`);
  lines.push(`🏷 Market (EN): <i>${esc(marketAEn)}</i>`);
  lines.push(`💵 مبلغ داچینگ A: <b>${slip.stakeA.toFixed(1)}</b> واحد`);
  lines.push("");
  lines.push(`🟢 <b>تیپ B مکمل</b> (ضریب ${slip.oddsB.toFixed(2)}): ${esc(slip.labelB)}`);
  lines.push(`🏷 Market (EN): <i>${esc(marketBEn)}</i>`);
  lines.push(`💵 مبلغ داچینگ B: <b>${slip.stakeB.toFixed(1)}</b> واحد`);
  lines.push("");
  lines.push(`${esc(SETTLEMENT_RULE_FA)}`);
  // ─── v10.0 — ارزش عددی نسبت به خط مرجع (همیشه عدد دارد) ───
  if (slip.edgeA !== null || slip.edgeB !== null) {
    const isPin = slip.edgeSourceA === "PINNACLE" || slip.edgeSourceB === "PINNACLE";
    const src = isPin ? "خط شارپ پیناکل" : "خط منصفانه بازار";
    const fa = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
    const a = slip.edgeA !== null ? fa(slip.edgeA) : "—";
    const b = slip.edgeB !== null ? fa(slip.edgeB) : "—";
    lines.push(`📈 ارزش عددی نسبت به ${src}: تیپ A <b>${a}</b> · تیپ B <b>${b}</b>`);
    if (isPin) {
      const cmp = (odds: number, pin: number | null): string | null =>
        pin && pin > 1.01 ? `${odds.toFixed(2)} در برابر خط ${pin.toFixed(2)}` : null;
      const pa = slip.edgeSourceA === "PINNACLE" ? cmp(slip.oddsA, slip.pinnacleOddsA) : null;
      const pb = slip.edgeSourceB === "PINNACLE" ? cmp(slip.oddsB, slip.pinnacleOddsB) : null;
      const parts = [pa ? `تیپ A: ${pa}` : null, pb ? `تیپ B: ${pb}` : null].filter((x): x is string => Boolean(x));
      if (parts.length > 0) lines.push(`📌 مقایسه قیمت با خط پیناکل: ${parts.join(" · ")}`);
    }
  }
  // ─── v10.0 — بهترین ساعت ثبت ضریب (Optimal Odds Timing Window) ───
  if (slip.timingWindowA || slip.timingWindowB) {
    const winName = timingWindowLabel(slip.timingWindowA ?? slip.timingWindowB);
    const start = slip.timingStartA ?? slip.timingStartB;
    const end = slip.timingEndA ?? slip.timingEndB;
    const fmt = (d: Date) => new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tehran" }).format(d);
    const range = start && end ? ` | ساعت دقیق پیشنهادی ثبت: ${fmt(new Date(start))} تا ${fmt(new Date(end))} (تهران)` : "";
    lines.push(`⏱️ بهترین زمان ثبت این تیپ: <b>${esc(winName)}</b>${range}`);
  }
  // ═══ v20.0 — سود تضمینی پوششی «محاسبه‌شده» از اعداد واقعی کارت (نه مقدار ذخیره‌شده) ═══
  const cover = coverProfitOf(slip);
  if (cover.hedged) {
    lines.push(
      `💰 سود تضمینی پوششی (بدترین سناریو): <b>${signedPct(cover.guaranteePct)}</b> (${signedUnit(cover.guarantee)} واحد از ${cover.staked.toFixed(0)} استیک)`
    );
    lines.push(`   🧮 برد تیپ A: ${signedUnit(cover.profitIfA)} واحد · برد تیپ B: ${signedUnit(cover.profitIfB ?? 0)} واحد — هر نتیجه‌ای همین است`);
  } else {
    lines.push(`💰 سود در صورت برد (تک‌ستونه — پوشش ندارد): <b>${signedUnit(cover.profitIfA)}</b> واحد · ریسک کامل: −${cover.staked.toFixed(0)}`);
  }
  lines.push(`🔐 هش راستی‌آزمایی SHA-256:\n<code>${slip.hash.slice(0, 32)}</code>`);
  if (slip.espnUrl) lines.push(`🔎 <a href="${slip.espnUrl}">لینک راستی‌آزمایی رسمی ESPN</a>`);
  lines.push("");
  lines.push(`⚖️ ابزار تحلیل کمّی — مسئولیت استفاده با کاربر است.`);
  return lines.join("\n");
}

/** برچسب فارسی پنجره زمانی v10.0 */
function timingWindowLabel(key: string | null): string {
  switch (key) {
    case "EARLY_FAVORITE":
      return "⏰ پنجره شکار فاوریت — Early Favorite (T-24h تا T-12h)";
    case "LINEUP_SHOCK":
      return "⚡ پنجره طلایی ترکیب رسمی — Lineup Shock (T-60m تا T-45m)";
    case "LATE_UNDERDOG":
      return "🎯 پنجره اوج آندرداگ — Late Underdog Peak (T-30m تا T-10m)";
    default:
      return "پنجره استاندارد";
  }
}

// ═════════════════════ سازنده پیام تیزر (تیپ B سانسور) ═════════════════════

/** پیام HTML تیزر جذب مشترک: تیپ A رایگان، تیپ B قفل VIP */
export function buildTeaserMessage(slip: IssuedSlip): string {
  const kickoff = new Date(slip.kickoff).toLocaleString("fa-IR", { dateStyle: "short", timeStyle: "short" });
  const lines: string[] = [];
  lines.push(`🔥 <b>تیپ رایگان امروز — فوتبال‌کوانت</b> 🔥`);
  lines.push(`🏆 <b>${esc(slip.homeTeam)}</b> × <b>${esc(slip.awayTeam)}</b>`);
  lines.push(`📡 ${esc(slip.league)} · ⏰ ${kickoff}`);
  lines.push("");
  lines.push(`🔹 <b>تیپ A</b> (ضریب ${slip.oddsA.toFixed(2)}): ${esc(slip.labelA)}`);
  lines.push(`💵 مبلغ داچینگ A: <b>${slip.stakeA.toFixed(1)}</b> واحد`);
  // v20.0 — سود تضمینی پوششی واقعی (محاسبه‌شده از ضریب/استیک، نه marginPct ذخیره‌شده)
  const cover = coverProfitOf(slip);
  lines.push(`💰 سود تضمینی پوششی: <b>${signedPct(cover.guaranteePct)}</b> (${signedUnit(cover.guarantee)} واحد)`);
  lines.push("");
  lines.push(`🟢 <b>تیپ B مکمل</b> (ضریب ${slip.oddsB.toFixed(2)}): 🔒 <b>[مخصوص اعضای کانال VIP]</b>`);
  lines.push(`💵 مبلغ داچینگ B: 🔒 <b>[مخصوص اعضای کانال VIP]</b>`);
  lines.push("");
  lines.push(`👑 برای دریافت پوشش کامل و تیپ B (ضریب ~۳) در کانال VIP عضو شوید.`);
  lines.push(`🔐 هش سند: <code>${slip.hash.slice(0, 16)}</code>`);
  if (slip.espnUrl) lines.push(`🔎 <a href="${slip.espnUrl}">راستی‌آزمایی ESPN</a>`);
  return lines.join("\n");
}

// ═════════════════════ سازنده پیام نتیجه پس از تسویه ═════════════════════

export function slipResultLabel(status: string): { label: string; emoji: string; win: boolean } {
  switch (status) {
    case "WON_A":
      return { label: "برد تیپ A (Slip A Won)", emoji: "🟢", win: true };
    case "WON_B":
      return { label: "برد تیپ B (Slip B Won)", emoji: "🟢", win: true };
    case "DOUBLE_WIN":
      return { label: "برد طلایی هر دو تیپ — Double-Win Jackpot", emoji: "🏆", win: true };
    case "MIDDLE_TRAP":
      return { label: "تله میانی — باخت همزمان (Middle Trap)", emoji: "🔴", win: false };
    default:
      return { label: status, emoji: "⚪️", win: false };
  }
}

export function buildResultMessage(slip: IssuedSlip): string {
  const r = slipResultLabel(slip.status);
  const score = slip.homeGoals !== null && slip.awayGoals !== null ? `${slip.homeGoals}−${slip.awayGoals}` : "؟";
  const lines: string[] = [];
  lines.push(`${r.emoji} <b>نتیجه نهایی کارت</b> ${r.emoji}`);
  lines.push(`🏆 <b>${esc(slip.homeTeam)} ${score} ${esc(slip.awayTeam)}</b>`);
  lines.push(`📡 ${esc(slip.league)} · FT (منبع رسمی ESPN)`);
  lines.push("");
  lines.push(`نتیجه: <b>${r.label}</b>`);
  if (slip.status === "DOUBLE_WIN") {
    lines.push(`💰 سود تیپ A: <b>+${(slip.profitA ?? 0).toFixed(1)}</b> · سود تیپ B: <b>+${(slip.profitB ?? 0).toFixed(1)}</b>`);
    lines.push(`🎯 جمع سود خالص (Jackpot): <b>${(slip.netProfit ?? 0) >= 0 ? "+" : ""}${(slip.netProfit ?? 0).toFixed(1)}</b> واحد`);
  } else if (slip.status === "MIDDLE_TRAP") {
    // ═══ v20.0 — باخت صادقانه و کامل (حذف روایت سپر استاپ‌لاس ساختگی) ═══
    // سند §۳: کش‌اوت ۵۵٪ در دقیقه ۶۵ وجود ندارد — کل استیک کارت از دست می‌رود (-۱۰۰ طلایی / -۵۰ نقره‌ای)
    const loss = slip.netProfit ?? -(slip.stakeA + slip.stakeB);
    lines.push(`📉 زیان کامل کارت: <b>${loss.toFixed(1)}</b> واحد از استیک ${(slip.stakeA + slip.stakeB).toFixed(1)} — ثبت صادقانه و شفاف (کل استیک از دست رفت)`);
    lines.push(`🧮 محاسبه صادقانه: استیک ${(slip.stakeA + slip.stakeB).toFixed(1)} × ۱۰۰٪ زیان = <b>${loss.toFixed(1)}</b> واحد`);
  } else {
    lines.push(`💰 سود خالص: <b>${(slip.netProfit ?? 0) >= 0 ? "+" : ""}${(slip.netProfit ?? 0).toFixed(1)}</b> واحد`);
    lines.push(`🧮 فرمول: ${(slip.status === "WON_A" ? `stakeA×oddsA−۱۰۰ = ${slip.stakeA.toFixed(1)}×${slip.oddsA.toFixed(2)}−۱۰۰` : `stakeB×oddsB−۱۰۰ = ${slip.stakeB.toFixed(1)}×${slip.oddsB.toFixed(2)}−۱۰۰`)}`);
  }
  lines.push(`🔐 هش سند: <code>${slip.hash.slice(0, 32)}</code>`);
  if (slip.espnUrl) lines.push(`🔎 <a href="${slip.espnUrl}">راستی‌آزمایی نتیجه در ESPN</a>`);
  return lines.join("\n");
}

// ═════════════════════ انتشار عمومی ═════════════════════

export type PublishMode = "CARD" | "TEASER";

/**
 * انتشار کارت/تیزر به کانال VIP:
 * تصویر فوتبالی دو تیم + پیام HTML. تیپ B در حالت TEASER سانسور می‌شود.
 * v9.0 — فیلتر سختگیرانه سوپروایزر: بازی وتوشده مطلقاً به تلگرام ارسال نمی‌شود.
 * v18.4 — ضد تکرار: claim اتمی telegramCard قبل از ارسال؛ انتشار دستی با force:true
 * می‌تواند پرچم را دور بزند (دکمه دستی پنل) — مسیر خودکار هرگز دو بار نمی‌فرستد.
 */
export async function publishSlipToTelegram(
  slip: IssuedSlip,
  mode: PublishMode,
  opts?: { force?: boolean }
): Promise<{ ok: boolean; detail: string; preview: string }> {
  const preview = mode === "CARD" ? buildCardMessage(slip) : buildTeaserMessage(slip);
  if (!slip.supervisorApproved) {
    await logOutbox(slip.id, mode, false, "VETOED_BY_SUPERVISOR");
    return { ok: false, detail: "VETOED_BY_SUPERVISOR", preview };
  }
  // v13.2 — کارت بازخوانی (بازی هنگام صدور از قبل FT بود) هرگز به کانال نمی‌رود؛
  // انتشار «کارت پیش‌بازی» پس از پایان بازی فاقد اعتبار است.
  if (slip.retroIssued) {
    await logOutbox(slip.id, mode, false, "RETRO_CARD_NOT_PUBLISHABLE");
    return { ok: false, detail: "RETRO_CARD_NOT_PUBLISHABLE", preview };
  }
  const status = await telegramStatus();
  if (!status.configured || !status.channelSet || !status.tokenFormat) {
    await logOutbox(slip.id, mode, false, status.configured ? "TELEGRAM_NOT_CONFIGURED" : "INVALID_TOKEN_FORMAT");
    return { ok: false, detail: "TELEGRAM_NOT_CONFIGURED", preview };
  }

  // ═══ v20.0 — ادعای سطح-بازی: هر بازی فقط یک‌بار پست کارت‌نوع می‌گیرد ═══
  // اگر CARD/GIFT/TEASER قبلاً برای این بازی رفته باشد، هیچ مسیر دومی دوباره نمی‌فرستد.
  const mKey = matchKeyOf(slip);
  if (mode === "CARD" && !opts?.force && (await matchCardAlreadyPosted(mKey))) {
    await logOutbox(slip.id, mode, true, "MATCH_ALREADY_POSTED");
    await db.issuedSlip.update({ where: { id: slip.id }, data: { telegramCard: true } }).catch(() => {});
    return { ok: false, detail: "MATCH_ALREADY_POSTED", preview };
  }

  // v18.4 — claim اتمی: اگر مسیر موازی همین کارت را در حال ارسال/ارسال‌شده است، skip
  if (mode === "CARD" && !opts?.force) {
    const claimed = await claimSlipFlag(slip.id, "telegramCard");
    if (!claimed) {
      return { ok: false, detail: "ALREADY_SENT_OR_CLAIMED", preview };
    }
    // v19.0 — لایه دوم ادعا (INSERT-first، اتمیک بین پردازه‌ها): کلید CARD:<slipId>
    if (!(await claimBroadcast(dedupeKeyOf.card(slip.id), slip.id, "CARD"))) {
      await releaseSlipFlag(slip.id, "telegramCard");
      return { ok: false, detail: "ALREADY_SENT_OR_CLAIMED", preview };
    }
    // v20.0 — لایه سوم: ادعای سطح-بازی MT-CARD:<matchKey> (ضدتکرار بین مسیرها)
    if (!(await claimBroadcast(dedupeKeyOf.mtCard(mKey), slip.id, "MT_CARD"))) {
      await releaseSlipFlag(slip.id, "telegramCard");
      await releaseBroadcast(dedupeKeyOf.card(slip.id));
      await logOutbox(slip.id, mode, true, "MATCH_ALREADY_POSTED");
      await db.issuedSlip.update({ where: { id: slip.id }, data: { telegramCard: true } }).catch(() => {});
      return { ok: false, detail: "MATCH_ALREADY_POSTED", preview };
    }
  }

  try {
    // ═══ v20.0 — هیچ پیامی بدون تصویر کامل ارسال نمی‌شود ═══
    // فالبک متنی حذف شد: رندر ناموفق → هیچ پستی نمی‌رود؛ ادعا آزاد و تیک بعدی
    // (۹۰ ثانیه بعد) دوباره تلاش می‌کند. کپشن هم در tgSendPhotoTo ایمن می‌شود.
    let photo: Buffer | null = null;
    for (let attempt = 0; attempt < 2 && photo === null; attempt++) {
      try {
        photo = mode === "TEASER" ? await renderSlipTeaserPNG(slip) : await renderSlipCardPNG(slip);
      } catch (err) {
        console.warn(`[telegram] card render attempt ${attempt + 1} failed:`, err instanceof Error ? err.message : err);
      }
    }
    if (!photo) {
      if (mode === "CARD") {
        await releaseSlipFlag(slip.id, "telegramCard");
        await releaseBroadcast(dedupeKeyOf.card(slip.id));
        await releaseBroadcast(dedupeKeyOf.mtCard(mKey));
      }
      await logOutbox(slip.id, mode, false, "RENDER_FAILED_NO_POST");
      return { ok: false, detail: "RENDER_FAILED_NO_POST", preview };
    }

    const result = await tgSendPhoto(photo, preview, `slip-${slip.hash.slice(0, 10)}.png`);

    await logOutbox(slip.id, mode, result.ok, result.detail);
    if (result.ok) {
      if (mode === "TEASER") {
        await db.issuedSlip.update({ where: { id: slip.id }, data: { telegramTeaser: true } });
      }
      // telegramCard در claim ست شده — فقط تایید نهایی
      // v19.0 — commit ردیف ادعای outbox (ok=true) تا repair پرچم‌ها ارسال موفق را ببیند
      if (mode === "CARD") await commitBroadcast(dedupeKeyOf.card(slip.id), true, result.detail);
      return { ...result, preview };
    }
    // v18.4 — شکست ارسال → آزادسازی claim تا ریتیپ بعدی مسیر کار را از دست ندهد
    if (mode === "CARD") {
      await releaseSlipFlag(slip.id, "telegramCard");
      await releaseBroadcast(dedupeKeyOf.card(slip.id));
      await releaseBroadcast(dedupeKeyOf.mtCard(mKey));
    }
    return { ...result, preview };
  } catch (err) {
    // رندر/شبکه شکست خورد → آزادسازی claim
    if (mode === "CARD") {
      await releaseSlipFlag(slip.id, "telegramCard");
      await releaseBroadcast(dedupeKeyOf.card(slip.id));
      await releaseBroadcast(dedupeKeyOf.mtCard(mKey));
    }
    throw err;
  }
}

/**
 * اعلام خودکار نتیجه پس از FT:
 * برنده → تصویر جام پیروزی | بازنده → تصویر رختکن بهم‌ریخته
 * v13.5 — نتایج فقط به «کانال عمومی @aineobet» می‌روند (دستور کارفرما: کانال عمومی فقط نتیجه؛
 * کانال VIP فقط فلش‌کارت بازی + برآیند روزانه).
 * v18.4 — ضد تکرار: claim اتمی telegramResult قبل از ارسال (ریشه ارسال تکراری نتایج —
 * سه مسیر موازی هم‌زمان این تابع را صدا می‌زدند)؛ شکست ارسال → آزادسازی claim برای ریتیپ.
 */
export async function sendSettlementNotification(slip: IssuedSlip, opts?: { force?: boolean }): Promise<boolean> {
  // v11.0 — سپر مطلق دفتر سایه: کارت وتوشده سوپروایزر هرگز نتیجه هم به کانال نمی‌رود
  if (!slip.supervisorApproved) return false;
  // v13.2 — کارت بازخوانی (بازی FT پیش از صدور) هرگز به کانال اعلام نمی‌شود —
  // کارتی که هرگز منتشر نشده نتیجه هم ندارد (جلوگیری از MIDDLE_TRAP‌های هرگز-صادرنشده)
  if (slip.retroIssued) return false;
  const status = await telegramStatus();
  if (!status.configured || !status.channelSet || !status.tokenFormat) return false;
  if (slip.homeGoals === null || slip.awayGoals === null) return false;

  const chatId = await publicChannelId();
  if (!chatId) return false;

  // ═══ v20.0 — ادعای سطح-بازی نتیجه: هر بازی فقط یک‌بار پست نتیجه‌نوع می‌گیرد ═══
  const mKey = matchKeyOf(slip);
  if (!opts?.force && (await matchResultAlreadyPosted(mKey))) {
    await db.issuedSlip.update({ where: { id: slip.id }, data: { telegramResult: true } }).catch(() => {});
    return false;
  }

  // v18.4 — claim اتمی مالکیت ارسال نتیجه (بدون این، دو مسیر موازی دوبار می‌فرستند)
  if (!opts?.force) {
    const claimed = await claimSlipFlag(slip.id, "telegramResult");
    if (!claimed) return false;
    // v19.0 — لایه دوم ادعا (INSERT-first اتمیک بین پردازه‌ها): RESULT:<slipId>
    if (!(await claimBroadcast(dedupeKeyOf.result(slip.id), slip.id, "RESULT"))) {
      await releaseSlipFlag(slip.id, "telegramResult");
      return false;
    }
    // v20.0 — لایه سوم: ادعای سطح-بازی MT-RESULT:<matchKey> (نتیجه یا اثبات UNBLUR — فقط یکی)
    if (!(await claimBroadcast(dedupeKeyOf.mtResult(mKey), slip.id, "MT_RESULT"))) {
      await releaseSlipFlag(slip.id, "telegramResult");
      await releaseBroadcast(dedupeKeyOf.result(slip.id));
      await db.issuedSlip.update({ where: { id: slip.id }, data: { telegramResult: true } }).catch(() => {});
      return false;
    }
  }

  const caption = buildResultMessage(slip);

  // ═══ v20.0 — هیچ پیامی بدون تصویر کامل ارسال نمی‌شود ═══
  // فالبک متنی حذف شد؛ رندر دو بار تلاش می‌شود و با اعتبارسنجی PNG در tgSendPhotoTo
  // (امضای + حداقل حجم) پشتیبانی می‌شود. شکست کامل → بدون پست، ادعا آزاد، تیک بعدی ریتیپ.
  let photo: Buffer | null = null;
  for (let attempt = 0; attempt < 2 && photo === null; attempt++) {
    try {
      photo = await renderSlipResultPNG(slip);
    } catch (err) {
      console.warn(`[telegram] result poster render attempt ${attempt + 1} failed:`, err instanceof Error ? err.message : err);
    }
  }
  if (!photo) {
    await releaseSlipFlag(slip.id, "telegramResult");
    await releaseBroadcast(dedupeKeyOf.result(slip.id));
    await releaseBroadcast(dedupeKeyOf.mtResult(mKey));
    await logOutbox(slip.id, "RESULT", false, "RENDER_FAILED_NO_POST");
    return false;
  }

  const ok = (await tgSendPhotoTo(chatId, photo, caption, `${slip.status.toLowerCase()}-${slip.hash.slice(0, 10)}.png`)).ok;

  await logOutbox(slip.id, "RESULT", ok, ok ? "sent" : "send-failed");
  if (ok) {
    await db.issuedSlip.update({ where: { id: slip.id }, data: { telegramResult: true } });
    // v19.0 — commit ردیف ادعا (ok=true)
    await commitBroadcast(dedupeKeyOf.result(slip.id), true, "sent");
  } else {
    // v18.4 — شکست ارسال → آزادسازی claim تا ریتیپ بعدی از دست نرود
    await releaseSlipFlag(slip.id, "telegramResult");
    await releaseBroadcast(dedupeKeyOf.result(slip.id));
    await releaseBroadcast(dedupeKeyOf.mtResult(mKey));
  }
  return ok;
}

/** پیام آزمون اتصال از مودال تنظیمات */
export async function sendConfigTestMessage(): Promise<{ ok: boolean; detail: string }> {
  const text =
    `✅ <b>اتصال موفق</b> — موتور تسویه خودکار فوتبال‌کوانت به این کانال متصل شد.\n` +
    `از این پس فلش‌کارت‌ها، تیزرهای VIP و نتایج تسویه‌شده به‌صورت خودکار اینجا منتشر می‌شوند.`;
  const chatId = await channelId();
  if (!chatId) return { ok: false, detail: "NO_CHANNEL" };
  const res = await tgCall("sendMessage", { chat_id: chatId, text, parse_mode: "HTML" });
  await logOutbox(null, "CONFIG_TEST", res.ok, res.detail);
  return res;
}

// ═══════════════════════════════════════════════════════════════
// v9.0 — خط لوله ارسال خودکار فقط-کارت‌های-تایید-سوپروایزر
// (Supervisor-Only Auto-Dispatch Queue) + گزارش وین‌ریت کانال
// ═══════════════════════════════════════════════════════════════

/** آمار وین‌ریت کانال — مستقیم از دیتابیس (بدون وابستگی چرخه‌ای) */
async function channelWinRateStats() {
  // v11.0 — فقط کارت‌های واقعی تاییدشده؛ تسویه کاغذی دفتر سایه در وین‌ریت کانال دخالت نمی‌کند
  // v13.2 — فقط کارت‌های واقعی تاییدشده؛ کارت‌های بازخوانی (retroIssued) و دفتر سایه در وین‌ریت کانال دخالت نمی‌کنند
  // ═══ v20.0 — منبع واحد حقیقت: وین‌ریت کانال دقیقاً همان computeMasterLedgerMetrics داشبورد است ═══
  // (رفع تعریف برد ناهمخوان قبلی: (settled − middleTrap)/settled)
  const rows = await db.issuedSlip.findMany({
    where: { status: { in: ["WON_A", "WON_B", "DOUBLE_WIN", "MIDDLE_TRAP"] }, supervisorApproved: true, retroIssued: false, crownTier: { not: "SILVER_SHADOW" } },
    select: { status: true, netProfit: true, stakeA: true, stakeB: true },
  });
  const master = computeMasterLedgerMetrics(rows);
  const st = {
    settled: master.settled,
    wonA: master.wonA,
    wonB: master.wonB,
    doubleWin: master.doubleWin,
    middleTrap: master.middleTrap,
    netProfit: master.netProfit,
    staked: master.totalStaked,
  };
  const winRatePct = master.winRatePct ?? 0;
  const netPct = master.yieldPct ?? 0;
  // ─── v11.0 — دفتر سایه: شفافیت counterfactual وتوها (خط جداگانه گزارش) ───
  // v13.5.1 — سایه فقط وتوهای زنده است؛ کارت‌های بازخوانی (retroIssued) داخل سایه شمرده نمی‌شوند
  const shadowRows = await db.issuedSlip.findMany({
    where: { supervisorApproved: false, retroIssued: false, status: { in: ["WON_A", "WON_B", "DOUBLE_WIN", "MIDDLE_TRAP"] } },
    select: { status: true, netProfit: true },
  });
  const shadowWins = shadowRows.filter((s) => s.status !== "MIDDLE_TRAP").length;
  const shadowNet = Math.round(shadowRows.reduce((a, b) => a + (b.netProfit ?? 0), 0) * 100) / 100;
  const shadowWinRate = shadowRows.length > 0 ? Math.round((shadowWins / shadowRows.length) * 1000) / 10 : null;
  // ─── v13.2 — دفتر بازخوانی: کارت‌های چندروزه‌ای که هرگز پیش‌بازی صادر نشده‌اند (تسویه کاغذی تحلیلی) ───
  // v13.5.1 — بازخوانی با پرچم retroIssued شناسایی می‌شود (مستقل از تایید — کارت بازخوانی هرگز تاییدشده نیست)
  const retroRows = await db.issuedSlip.findMany({
    where: { retroIssued: true, status: { in: ["WON_A", "WON_B", "DOUBLE_WIN", "MIDDLE_TRAP"] } },
    select: { status: true, netProfit: true },
  });
  const retroWins = retroRows.filter((s) => s.status !== "MIDDLE_TRAP").length;
  // ─── v18.0 — 🥈 حصاد آلفای سایه: کارت‌های تاج نقره‌ای سطح ۲ (استیک ۵۰u Half-Kelly) ───
  const silverRows = await db.issuedSlip.findMany({
    where: { crownTier: "SILVER_SHADOW", retroIssued: false, status: { in: ["WON_A", "WON_B", "DOUBLE_WIN", "MIDDLE_TRAP"] } },
    select: { status: true, netProfit: true },
  });
  const silverWins = silverRows.filter((s) => s.status !== "MIDDLE_TRAP").length;
  return {
    ...st,
    winRatePct,
    netPct,
    netProfit: Math.round(st.netProfit * 100) / 100,
    shadow: { settled: shadowRows.length, wins: shadowWins, winRatePct: shadowWinRate, netProfit: shadowNet },
    silver: {
      settled: silverRows.length,
      wins: silverWins,
      winRatePct: silverRows.length > 0 ? Math.round((silverWins / silverRows.length) * 1000) / 10 : null,
      netProfit: Math.round(silverRows.reduce((a, b) => a + (b.netProfit ?? 0), 0) * 100) / 100,
    },
    retro: {
      settled: retroRows.length,
      wins: retroWins,
      winRatePct: retroRows.length > 0 ? Math.round((retroWins / retroRows.length) * 1000) / 10 : null,
      netProfit: Math.round(retroRows.reduce((a, b) => a + (b.netProfit ?? 0), 0) * 100) / 100,
    },
  };
}

/** پیام نوع دوم — گزارش تسویه + به‌روزرسانی وین‌ریت کل کانال */
export function buildWinRateReportMessage(st: {
  settled: number;
  wonA: number;
  wonB: number;
  doubleWin: number;
  middleTrap: number;
  winRatePct: number;
  netProfit: number;
  netPct: number;
}): string {
  const pct = (n: number) => (st.settled > 0 ? `${Math.round((n / st.settled) * 1000) / 10}٪` : "۰٪");
  const lines: string[] = [];
  lines.push(`📊 <b>گزارش وین‌ریت کانال — تسویه ۱۰۰٪ خودکار ESPN</b>`);
  lines.push(`🎯 وین‌ریت زوج‌تیپ‌های تاییدشده: <b>${st.winRatePct}٪</b> (${st.settled} کارت تسویه‌شده)`);
  lines.push(`🟢 برد تیپ A: <b>${st.wonA}</b> (${pct(st.wonA)}) · برد تیپ B: <b>${st.wonB}</b> (${pct(st.wonB)})`);
  lines.push(`🏆 برد طلایی همزمان (Double-Win Jackpot): <b>${st.doubleWin}</b> (${pct(st.doubleWin)})`);
  lines.push(`🔴 تله میانی (ثبت صادقانه): <b>${st.middleTrap}</b> (${pct(st.middleTrap)})`);
  lines.push(`💰 سود خالص تجمعی کانال: <b>${st.netProfit >= 0 ? "+" : ""}${st.netProfit.toFixed(1)}</b> واحد (${st.netPct >= 0 ? "+" : ""}${st.netPct}٪)`);
  lines.push(`🔐 همه نتایج با اسکوربورد رسمی ESPN و هش SHA-256 راستی‌آزمایی می‌شوند.`);
  return lines.join("\n");
}

/** آیتم صف انتشار — برای ارسال واقعی و شبیه‌ساز زنده فید کانال */
export interface DispatchQueueItem {
  kind: "CARD" | "RESULT" | "WINRATE";
  slipId: string | null;
  slipHash: string | null;
  matchLabel: string;
  message: string;
  status?: string;
}

/** صف انتشار بدون ارسال — پیش‌نمایش زنده فید کانال (Live Telegram Channel Simulator) */
export async function previewDispatchQueue(): Promise<{ queue: DispatchQueueItem[]; autoDispatch: boolean; configured: boolean }> {
  // v13.2 — فقط کارت‌های بازی‌های «امروز تهران» به کانال ارسال می‌شوند؛ بازی‌های روزهای آینده
  // در دک فلش‌کارت می‌مانند و نوبت انتشارشان روز بازی خودش می‌رسد.
  const day = tehranDayRange();
  const [pendingCards, pendingResults, autoDispatch, tg] = await Promise.all([
    db.issuedSlip.findMany({
      where: { status: { in: ["PENDING", "LIVE"] }, telegramCard: false, supervisorApproved: true, retroIssued: false, kickoff: { gte: day.start, lt: day.end } },
      orderBy: { kickoff: "asc" },
      take: 8,
    }),
    db.issuedSlip.findMany({
      where: { status: { in: ["WON_A", "WON_B", "DOUBLE_WIN", "MIDDLE_TRAP"] }, telegramResult: false, supervisorApproved: true, retroIssued: false },
      orderBy: { settledAt: "asc" },
      take: 8,
    }),
    getAutoDispatch(),
    telegramStatus(),
  ]);

  const queue: DispatchQueueItem[] = [];
  for (const s of pendingCards) {
    queue.push({
      kind: "CARD",
      slipId: s.id,
      slipHash: s.hash,
      matchLabel: `${s.homeTeam} × ${s.awayTeam}`,
      message: buildCardMessage(s),
      status: s.status,
    });
  }
  for (const s of pendingResults) {
    queue.push({
      kind: "RESULT",
      slipId: s.id,
      slipHash: s.hash,
      matchLabel: `${s.homeTeam} ${s.homeGoals ?? "?"}−${s.awayGoals ?? "?"} ${s.awayTeam}`,
      message: buildResultMessage(s),
      status: s.status,
    });
  }
  const st = await channelWinRateStats();
  if (pendingResults.length > 0) {
    queue.push({ kind: "WINRATE", slipId: null, slipHash: null, matchLabel: "گزارش وین‌ریت کانال", message: buildWinRateReportMessage(st) });
  }
  return { queue, autoDispatch, configured: tg.configured };
}

/**
 * v15.0 — تعمیر پرچم‌های انتشار پیش‌ماتره (Premature Broadcast Repair).
 * ریشه باگ «فلش‌کارت‌های بازی‌های روز به کانال VIP ارسال نمی‌شود»:
 * کارت‌های بازی‌های فردا/آینده قبل از فعال‌شدن قانون «فقط کارت‌های روزانه» به کانال
 * رفته و پرچم telegramCard=true گرفته‌اند؛ پس از آن صف روز بازی، کارت را «ارسال‌شده»
 * می‌بیند و هرگز دوباره ارسال نمی‌کند. این تابع پرچم کارت‌هایی که ارسال موفقشان
 * بیرون از «روز تهرانِ کیک‌آف» انجام شده را بازنشانی می‌کند تا روز بازی واقعاً منتشر شوند.
 */
async function repairPrematureCardFlags(): Promise<number> {
  try {
    // ═══ v19.0 — بازیابی ادعاهای مرده (Dead Claim Reclaim) ═══
    // اگر پردازه در میانه رندر/ارسال کرش کند، ردیف CLAIMED با ok=false در جدول
    // می‌ماند و آن پست تا ابد قفل می‌شود. اجاره ادعا ۱۵ دقیقه است: ردیف‌های
    // CLAIMED قدیمی‌تر حذف می‌شوند تا تیک بعدی دوباره ادعا کند (بدون هیچ امکان
    // ارسال تکراری — چون در پنجره ۱۵ دقیقه‌ای فقط یک مسیر می‌تواند ادعا کند).
    const deadCutoff = new Date(Date.now() - 15 * 60_000);
    const dead = await db.telegramOutbox.deleteMany({
      where: { ok: false, detail: "CLAIMED", createdAt: { lt: deadCutoff } },
    });
    if (dead.count > 0) {
      console.log(`[telegram] v19.0 dead-claim reclaim: ${dead.count} expired CLAIMED rows released`);
    }

    const flagged = await db.issuedSlip.findMany({
      where: { status: { in: ["PENDING", "LIVE"] }, telegramCard: true, supervisorApproved: true, retroIssued: false },
      select: { id: true, kickoff: true },
      take: 40,
    });
    if (flagged.length === 0) return 0;
    let repaired = 0;
    for (const slip of flagged) {
      // v18.3 — جست‌وجوی هدفمند per-slip به‌جای پنجره ۲۰۰ رکوردی سراسری:
      // در روزهای شلوغ (تبلیغات ساعتی + خبرها + درس‌ها) رکورد ارسال موفق کارت از
      // پنجره ۲۰۰تایی خارج می‌شد → lastSend تهی → پرچم بی‌دلیل ریست → کارت دوباره
      // به کانال می‌رفت (ریشه ارسال تکراری فلش‌کارت). حالا رکورد واقعی آخرین ارسال
      // همان اسلیپ مستقیم پرس‌وجو می‌شود — دقیق و ضدتکرار.
      const lastSend = await db.telegramOutbox.findFirst({
        where: { slipId: slip.id, kind: { in: ["CARD", "FUNNEL_GIFT", "FUNNEL_TEASER"] }, ok: true },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });
      if (!lastSend) {
        // پرچم خورده ولی هیچ ارسال موفقی ثبت نشده — قطعاً پیش‌ماتره یا خطای نیمه‌کاره
        await db.issuedSlip.update({ where: { id: slip.id }, data: { telegramCard: false } });
        repaired += 1;
        continue;
      }
      // ═══ v20.0 — سیاست «هر بازی فقط یک‌بار» ═══
      // شاخه بازپخشِ «روز بازی» حذف شد — ریشه مستقیم کارت تکراری: ارسال موفقِ یک بازی
      // نهایی است و هرگز دوباره پخش نمی‌شود. پرچم telegramCard فقط وقتی ریست می‌شود
      // که هیچ ارسال موفقی برای آن slip در کل تاریخچه ثبت نشده باشد.
      console.log(`[telegram] v20.0 repair: slip ${slip.id} already broadcast once — kept (match-once policy)`);
    }
    if (repaired > 0) console.log(`[telegram] v20.0 premature-card repair: ${repaired} flags reset (no successful send ever)`);
    return repaired;
  } catch (err) {
    console.warn("premature card repair failed:", err instanceof Error ? err.message : err);
    return 0;
  }
}

/**
 * صف ارسال خودکار دو مرحله‌ای (Auto-Dispatch Queue):
 *   · پیام نوع اول (پیش از بازی): فقط کارت‌های تاییدشده سوپروایزر (وتوشده‌ها اسکیپ)
 *   · پیام نوع دوم (پس از FT): برگه نتیجه + به‌روزرسانی وین‌ریت کل کانال
 * Dedupe سمت سرور با پرچم‌های telegramCard/telegramResult — ارسال تکراری صفر.
 * v9.0 — سقف هر پاس قابل تنظیم است: پس‌زمینه ۳/۳ (حفظ تأخیر سینک) و دکمه فوری ۸/۸.
 */
export async function autoDispatchApprovedSlips(options?: {
  maxCards?: number;
  maxResults?: number;
}): Promise<{
  ok: boolean;
  sentCards: number;
  sentResults: number;
  winRateSent: boolean;
  skippedVetoed: number;
  detail: string;
}> {
  // v18.4 — قفل in-flight سراسری: چهار مسیر ورود (زمان‌بند، runSync، autodispatch، dispatchNow)
  // هم‌زمان اجرا نمی‌شوند — اجرای موازی = ریشه ارسال تکراری کارت/نتیجه
  if (gBroadcast.__fqDispatchInFlight) {
    return { ok: false, sentCards: 0, sentResults: 0, winRateSent: false, skippedVetoed: 0, detail: "DISPATCH_BUSY" };
  }
  gBroadcast.__fqDispatchInFlight = true;
  try {
    return await autoDispatchApprovedSlipsInner(options);
  } finally {
    gBroadcast.__fqDispatchInFlight = false;
  }
}

async function autoDispatchApprovedSlipsInner(options?: {
  maxCards?: number;
  maxResults?: number;
}): Promise<{
  ok: boolean;
  sentCards: number;
  sentResults: number;
  winRateSent: boolean;
  skippedVetoed: number;
  detail: string;
}> {
  const maxCards = Math.max(1, Math.min(12, options?.maxCards ?? 3));
  const maxResults = Math.max(1, Math.min(12, options?.maxResults ?? 3));
  // v15.0 — تعمیر پرچم‌های پیش‌ماتره قبل از هر پاس انتشار (ریشه باگ کانال VIP)
  await repairPrematureCardFlags();
  const [tg, autoOn] = await Promise.all([telegramStatus(), getAutoDispatch()]);
  // v13.5.1 — کارت‌های بازخوانی (retroIssued) وتو نیستند — شمارش وتو فقط برای کارت‌های زنده
  const skippedVetoed = await db.issuedSlip.count({ where: { supervisorApproved: false, retroIssued: false, telegramCard: false } });

  if (!tg.configured || !tg.channelSet) {
    return { ok: false, sentCards: 0, sentResults: 0, winRateSent: false, skippedVetoed, detail: "TELEGRAM_NOT_CONFIGURED" };
  }
  if (!tg.tokenFormat) {
    return { ok: false, sentCards: 0, sentResults: 0, winRateSent: false, skippedVetoed, detail: "INVALID_TOKEN_FORMAT" };
  }
  if (!autoOn) {
    return { ok: false, sentCards: 0, sentResults: 0, winRateSent: false, skippedVetoed, detail: "AUTO_DISPATCH_OFF" };
  }

  // v13.2 — «فقط کارت‌های روزانه»: پنجره انتشار کارت = بازی‌های امروز تهران
  const day = tehranDayRange();

  let sentCards = 0;
  let sentResults = 0;

  // ─── مرحله ۱: پست پیش از بازی — فقط کارت‌های 👑 تاییدشده سوپروایزر «بازی‌های امروز تهران» ───
  const cards = await db.issuedSlip.findMany({
    where: { status: { in: ["PENDING", "LIVE"] }, telegramCard: false, supervisorApproved: true, retroIssued: false, kickoff: { gte: day.start, lt: day.end } },
    orderBy: { kickoff: "asc" },
    take: maxCards,
  });
  for (const s of cards) {
    try {
      const res = await publishSlipToTelegram(s, "CARD");
      if (res.ok) sentCards += 1;
    } catch (err) {
      console.warn("auto dispatch card failed:", err);
    }
  }

  // ─── مرحله ۲: پست تسویه‌حساب پس از بازی — برگه نتیجه FT (کارت‌های بازخوانی مستثنا) ───
  const results = await db.issuedSlip.findMany({
    where: { status: { in: ["WON_A", "WON_B", "DOUBLE_WIN", "MIDDLE_TRAP"] }, telegramResult: false, supervisorApproved: true, retroIssued: false },
    orderBy: { settledAt: "asc" },
    take: maxResults,
  });
  for (const s of results) {
    try {
      const ok = await sendSettlementNotification(s);
      if (ok) sentResults += 1;
    } catch (err) {
      console.warn("auto dispatch result failed:", err);
    }
  }

  // ─── به‌روزرسانی وین‌ریت کل کانال — فقط وقتی نتیجه تازه‌ای مخابره شد ───
  let winRateSent = false;
  if (sentResults > 0) {
    winRateSent = await sendWinRateReport();
  }

  return {
    ok: sentCards + sentResults > 0,
    sentCards,
    sentResults,
    winRateSent,
    skippedVetoed,
    detail: sentCards + sentResults > 0 ? "dispatched" : "QUEUE_EMPTY",
  };
}

/** throttle گزارش وین‌ریت — حداکثر هر ۱۰ دقیقه یک‌بار (v18.4: روی globalThis — پایدار در برابر hot-reload) */
const gWinRate = globalThis as unknown as { __fqLastWinRateAt?: number };
const lastWinRateAt = (): number => gWinRate.__fqLastWinRateAt ?? 0;
const setLastWinRateAt = (v: number): void => {
  gWinRate.__fqLastWinRateAt = v;
};

/**
 * v13.2 — بازه «امروز تهران» به UTC (تهران = UTC+۳:۳۰ ثابت، بدون DST).
 * مبنای فیلتر «فقط کارت‌های روزانه به کانال ارسال شود».
 */
export function tehranDayRange(d = new Date()): { start: Date; end: Date } {
  const TEHRAN_OFFSET_MS = 3.5 * 3600_000;
  const shifted = d.getTime() + TEHRAN_OFFSET_MS;
  const dayStartShifted = Math.floor(shifted / 86_400_000) * 86_400_000;
  const start = new Date(dayStartShifted - TEHRAN_OFFSET_MS);
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

/**
 * پیام نوع دوم (بخش وین‌ریت): به‌روزرسانی وین‌ریت کل کانال پس از تسویه.
 * v13.5 — مقصد: فقط کانال عمومی @aineobet (اثبات عملکرد برای جذب VIP).
 * throttle ۱۰ دقیقه.
 */
export async function sendWinRateReport(force = false): Promise<boolean> {
  // v18.4 — قفل سراسری: دو مسیر موازی (تسویه + dispatch) هر دو throttle را رد می‌کردند
  if (gBroadcast.__fqDispatchInFlight || gBroadcast.__fqFunnelLock) {
    // اجرای موازی در جریان است — این فراخوان را نادیده بگیر (دفعه بعد throttle جلوی تکرار را می‌گیرد)
    if (!force) return false;
  }
  if (!force && Date.now() - lastWinRateAt() < 10 * 60_000) return false;
  const status = await telegramStatus();
  if (!status.configured || !status.channelSet) return false;
  const chatId = await publicChannelId();
  if (!chatId) return false;
  // v19.0 — ادعای اتمی bucket ۱۰ دقیقه‌ای (INSERT-first): هیچ دو مسیری در یک bucket دوبار نمی‌فرستند
  const wrClaim = dedupeKeyOf.winrate(tehranDayKey(), Math.floor(Date.now() / 600_000));
  if (!force && !(await claimBroadcast(wrClaim, null, "WINRATE"))) return false;
  const st = await channelWinRateStats();

  // v10.0 — گزارش وین‌ریت با تصویر اختصاصی (گیج وین‌ریت + مبنای واحد برای حساب شخصی)
  const caption = buildWinRateReportMessage(st) +
    (st.silver.settled > 0
      ? `\n\n🥈 <b>حصاد آلفای سایه (تاج نقره‌ای سطح ۲ — استیک نصف ۵۰ واحدی):</b> ${st.silver.settled} کارت تسویه‌شده · وین‌ریت ${st.silver.winRatePct ?? 0}٪ · سود واقعی تزریق‌شده از دل دفتر سایه: ${st.silver.netProfit >= 0 ? "+" : ""}${st.silver.netProfit.toFixed(1)} واحد`
      : "") +
    (st.shadow.settled > 0
      ? `\n\n🛡️ <b>دفتر سایه (شفافیت وتوها):</b> ${st.shadow.settled} کارت وتوشده تسویه کاغذی شد — وین‌ریت ${st.shadow.winRatePct ?? 0}٪ · سود کاغذی ${st.shadow.netProfit >= 0 ? "+" : ""}${st.shadow.netProfit.toFixed(1)} واحد (هرگز پول واقعی نبوده)`
      : "") +
    (st.retro.settled > 0
      ? `\n📚 <b>دفتر بازخوانی (کارت‌های چندروزه):</b> ${st.retro.settled} بازی FT که هرگز پیش‌بازی کارت صادر نشده بود — فقط تحلیل کاغذی با همان موتور؛ وین‌ریت ${st.retro.winRatePct ?? 0}٪. این دسته <b>هرگز</b> در وین‌ریت واقعی کانال شمرده نمی‌شود.`
      : "") +
    `\n\n🧮 <b>مبنای واحد برای حساب شخصی شما:</b> هر کارت با مجموع استیک ۱۰۰ واحد ثبت می‌شود؛ ۱ واحد = ۱٪ بانک‌رول خودتان.` +
    `\nمثال با موجودی ۱۰ دلار: ۱ واحد = ۰٫۱ دلار → سود ${st.netProfit >= 0 ? "+" : ""}${st.netProfit.toFixed(1)} واحد = ${st.netProfit >= 0 ? "+" : "−"}${Math.abs(st.netProfit * 0.1).toFixed(2)} دلار (مقیاس‌پذیر با هر موجودی).`;

  let res: { ok: boolean; detail: string } = { ok: false, detail: "RENDER_FAILED_NO_POST" };
  try {
    const photo = await renderWinRateReportPNG({
      winRatePct: st.winRatePct,
      settled: st.settled,
      wonA: st.wonA,
      wonB: st.wonB,
      doubleWin: st.doubleWin,
      middleTrap: st.middleTrap,
      netProfit: st.netProfit,
      netPct: st.netPct,
      generatedAtIso: new Date().toISOString(),
    });
    res = await tgSendPhotoTo(chatId, photo, caption, `winrate-report-${Date.now()}.png`);
  } catch (err) {
    console.warn("winrate image render failed (no text fallback):", err);
  }
  if (res.ok) {
    setLastWinRateAt(Date.now());
    await commitBroadcast(wrClaim, true, "sent");
  } else {
    await releaseBroadcast(wrClaim);
  }
  return res.ok;
}

// ═══════════════════════════════════════════════════════════════
// v12.0 — گزارش برآیند روزانه روی قالب استادیومی DAILY_REPORT
// (۱۰۸۰×۱۴۴۰ — ۴ KPI + ۴ ردیف بازی تسویه‌شده — فقط نتیجه واقعی ESPN)
// ═══════════════════════════════════════════════════════════════

/** کلید روز تهران برای Dedupe گزارش روزانه */
function tehranDayKey(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" }).format(d);
}

/** v13.5 — ساعت فعلی تهران (برای پنجره بنر بازاریابی ساعتی) */
function tehranHour(d = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Tehran" }).format(d));
}

const KEY_LAST_DIGEST_DAY = "last_daily_digest_day";

/**
 * پوستر برآیند روزانه @aineobet — یک‌بار در هر روز تهران (از زمان‌بند سرور).
 * v13.5 — «کارت نتیجه برایند روزانه» به هر دو کانال می‌رود: عمومی @aineobet + کانال VIP
 * (دستور کارفرما: VIP فقط فلش‌کارت بازی + برآیند روزانه؛ عمومی فقط نتایج + برآیند).
 * KPIها: تعداد تسویه · وین‌ریت · جکپات · سود خالص واحدِ همان روز.
 * v18.4 — قفل funnel (اجرای موازی زمان‌بند + مسیر دستی = ریشه تکرار برآیند).
 */
async function sendDailyDigestInner(force = false, dayKey?: string): Promise<boolean> {
  const status = await telegramStatus();
  if (!status.configured || !status.channelSet) return false;

  // v20.0 — پشتیبانی جبران اسلات گم‌شده بعداز نیمه‌شب تهران: dayKey می‌تواند روزِ دیروز باشد
  const today = dayKey ?? tehranDayKey();
  // v19.0 — ادعای اتمی روزانه (INSERT-first) — ریشه ریشه‌ای تکرار برآیند روزانه
  const digestClaim = dedupeKeyOf.digest(today);
  if (!force && !(await claimBroadcast(digestClaim, null, "DAILY_DIGEST"))) return false;

  // بازی‌های تسویه‌شده «امروز تهران» — فقط کارت‌های واقعی تاییدشده (بدون بازخوانی)
  const rows = await db.issuedSlip.findMany({
    where: {
      supervisorApproved: true,
      retroIssued: false,
      status: { in: ["WON_A", "WON_B", "DOUBLE_WIN", "MIDDLE_TRAP"] },
      settledAt: { not: null },
    },
    orderBy: { settledAt: "desc" },
    take: 60,
  });
  const todayRows = rows.filter((r) => tehranDayKey(r.settledAt as Date) === today);

  const settled = todayRows.length;
  const wins = todayRows.filter((r) => r.status !== "MIDDLE_TRAP").length;
  const jackpots = todayRows.filter((r) => r.status === "DOUBLE_WIN").length;
  const net = todayRows.reduce((a, r) => a + (r.netProfit ?? 0), 0);
  const staked = todayRows.reduce((a, r) => a + r.stakeA + r.stakeB, 0);
  const winRate = settled > 0 ? (wins / settled) * 100 : 0;

  const dateLabelEn = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Tehran" }).format(new Date());
  const timeEn = (d: Date) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Tehran" }).format(d);

  let res: { ok: boolean; detail: string } = { ok: false, detail: "NO_CHANNEL" };
  try {
    const photo = await renderDailyReportPNG({
      dateLabelEn,
      kpis: [
        { label: "TICKETS SETTLED", value: String(settled), color: C_cyan },
        { label: "CHANNEL WIN-RATE", value: `${winRate.toFixed(0)}%`, color: C_emerald },
        { label: "GOLDEN JACKPOTS", value: String(jackpots), color: C_gold },
        { label: "NET UNITS TODAY", value: `${net >= 0 ? "+" : "−"}${Math.abs(net).toFixed(1)}`, color: net >= 0 ? C_emerald : C_rose },
      ],
      matches: todayRows.slice(0, 4).map((r) => ({
        teams: `${r.homeTeam} vs ${r.awayTeam}`,
        score: `${r.homeGoals ?? 0}-${r.awayGoals ?? 0}`,
        verdict: `${r.status.replace("_", " ")} · settled ${r.settledAt ? timeEn(r.settledAt) : ""} Tehran`,
        profit: r.netProfit ?? 0,
      })),
      dayNetProfit: Math.round(net * 100) / 100,
      daySettled: settled,
      dayStaked: Math.round(staked),
    });

    const caption =
      `📊 <b>NEOBET QUANT PRO • @AINEOBET — Daily Settlement Digest</b>\n` +
      `${settled} کارت امروز روی اسکوربورد رسمی ESPN تسویه شد · وین‌ریت ${winRate.toFixed(1)}٪ · سود خالص روز: ${net >= 0 ? "+" : ""}${net.toFixed(1)} واحد\n` +
      `🔒 هیچ شبیه‌سازی و هیچ کارت کاغذی در این گزارش نیست.`;

    // v13.5 — ارسال به هر دو کانال (عمومی + VIP) با همان بافر تصویر
    const [pub, vip] = await Promise.all([publicChannelId(), channelId()]);
    const targets = [...new Set([pub, vip].filter((x): x is string => Boolean(x)))];
    for (const chatId of targets) {
      // v20.0 — هیچ پست بی‌تصویری: شکست sendPhoto → بدون جایگزین متنی
      const ok = (await tgSendPhotoTo(chatId, photo, caption, `daily-digest-${today}.png`)).ok;
      if (ok) res = { ok: true, detail: `sent:${chatId}` };
    }
  } catch (err) {
    console.warn("daily digest render failed (no text fallback):", err);
  }
  if (res.ok) {
    await setSetting(KEY_LAST_DIGEST_DAY, today);
    await commitBroadcast(digestClaim, true, res.detail);
  } else {
    await releaseBroadcast(digestClaim);
  }
  return res.ok;
}

export const sendDailyDigest = withFunnelLock(sendDailyDigestInner);

// پالت hex برای KPIهای گزارش روزانه (مستقل از ثابت‌های card-render)
const C_cyan = "#38d6f5";
const C_emerald = "#3ddc97";
const C_gold = "#f5c542";
const C_rose = "#ff6b7a";

// ═══════════════════════════════════════════════════════════════
// v13.0 — ایجنت مدیر کانال عمومی و VIP (@aineobet Channel Director Agent)
// قیف تبدیل مخاطب عمومی به VIP — کاملاً سمت سرور:
//   پست ۱ (۱۱:۰۰ تهران): رادار شفافیت روزانه → کانال عمومی
//   پست ۲ (T-60m): ۱ کارت رایگان کامل + تیزرهای قفل‌شده → کانال عمومی
//   پست ۳ (FT+5m): بازگشایی قفل همان کارت + پوستر WIN CONFIRMED → کانال عمومی
//   پست ۴ (۲۳:۳۰ تهران): برآیند واقعی روز با افراز مجزا → کانال عمومی
// Dedupe کامل با TelegramOutbox (kind = FUNNEL_*) و Setting روزانه.
// ═══════════════════════════════════════════════════════════════

const KEY_FUNNEL_RADAR_DAY = "funnel_last_radar_day";
const KEY_FUNNEL_PNL_DAY = "funnel_last_pnl_day";
const KEY_FUNNEL_GIFT_DAY = "funnel_last_gift_day";
/** v13.5 — کلید dedupe بنر بازاریابی ساعتی: مقدار = «dayKey:hour» */
const KEY_MARKETING_LAST_AD = "marketing_last_ad_hour";

// ═══════════════════════════════════════════════════════════════
// v13.5 — خط لوله جدید کانال‌ها (دستور صریح کارفرما):
//   · کانال عمومی @aineobet: فقط نتایج (کارت نتیجه FT + وین‌ریت + برآیند)
//     + روزانه ۱ کارت VIP رایگان تاییدشده سوپروایزر (یا کارت دژ نفوذناپذیر)
//     + پیام‌های بازاریابی ساعتی با بنر تصویری
//   · کانال VIP اعضا: فقط فلش‌کارت‌های بازی + کارت نتیجه برایند روزانه
// ═══════════════════════════════════════════════════════════════

/**
 * v13.5 — پست روزانه «۱ کارت VIP رایگان» به کانال عمومی (۱۲:۰۰ تهران):
 * از کارت‌های تاییدشده بازی‌های امروز، اولویت با کارت‌های «دژ نفوذناپذیر»
 * (ریسک باخت همزمان زیر ۷٪) است؛ در نبود دژ، بالاترین امتیاز سوپروایزر انتخاب می‌شود.
 * Dedupe روزانه با KEY_FUNNEL_GIFT_DAY.
 */
async function sendDailyGiftCardInner(force = false): Promise<{ ok: boolean; detail: string }> {
  const token = await botToken();
  if (!token) return { ok: false, detail: "NO_TOKEN" };
  const chatId = await publicChannelId();
  if (!chatId) return { ok: false, detail: "NO_PUBLIC_CHANNEL" };

  const today = tehranDayKey();
  // v19.0 — ادعای اتمی روزانه (INSERT-first) — این کلید بین هر دو مسیر گیفت
  // (sendDailyGiftCard و پست ۲ فانل sendFunnelTeasers) مشترک است؛ فقط یک مسیر در روز می‌برد.
  const giftClaim = dedupeKeyOf.gift(today);
  if (!force && !(await claimBroadcast(giftClaim, null, "FUNNEL_GIFT"))) return { ok: false, detail: "ALREADY_SENT_TODAY" };

  const day = tehranDayRange();
  const candidates = await db.issuedSlip.findMany({
    where: { supervisorApproved: true, retroIssued: false, status: { in: ["PENDING", "LIVE"] }, kickoff: { gte: day.start, lt: day.end } },
    orderBy: { kickoff: "asc" },
    take: 24,
  });
  if (candidates.length === 0) {
    await releaseBroadcast(giftClaim); // امروز کارتی نبود — اسلات برای تیک بعدی آزاد بماند
    return { ok: false, detail: "NO_TODAY_CARD" };
  }

  // اولویت ۱: دژ نفوذناپذیر (ریسک < ۷٪) با بالاترین امتیاز؛ اولویت ۲: بالاترین امتیاز سوپروایزر
  // v20.0 — «هر بازی فقط یک‌بار»: بازی‌هایی که قبلاً پست کارت‌نوع دارند از کاندیداها حذف می‌شوند
  const scoreOf = (s: IssuedSlip) => s.supervisorScore ?? -999;
  const fresh: IssuedSlip[] = [];
  for (const s of [...candidates].sort((a, b) => scoreOf(b) - scoreOf(a))) {
    if (!(await matchCardAlreadyPosted(matchKeyOf(s)))) fresh.push(s);
  }
  const pick = fresh.length > 0 ? fresh[0] : candidates.sort((a, b) => scoreOf(b) - scoreOf(a))[0];
  const isFortress = (pick.jointLossRiskPct ?? 99) < 7;

  // v20.0 — ادعای سطح-بازی MT-CARD برای گیفت (مسیر VIP و گیفت/تیزر فقط یکی برای هر بازی)
  const pickMatchKey = matchKeyOf(pick);
  const mtClaimed = fresh.length > 0 && (await claimBroadcast(dedupeKeyOf.mtCard(pickMatchKey), pick.id, "MT_CARD"));
  if (fresh.length > 0 && !mtClaimed) {
    await releaseBroadcast(giftClaim);
    return { ok: false, detail: "MATCH_ALREADY_POSTED" };
  }

  // v20.0 — هیچ پیامی بدون تصویر کامل: رندر دو بار تلاش می‌شود؛ شکست → بدون پست
  let photo: Buffer | null = null;
  for (let attempt = 0; attempt < 2 && photo === null; attempt++) {
    try {
      photo = await renderSlipCardPNG(pick);
    } catch (err) {
      console.warn(`[telegram] gift card render attempt ${attempt + 1} failed:`, err instanceof Error ? err.message : err);
    }
  }
  if (!photo) {
    if (mtClaimed) await releaseBroadcast(dedupeKeyOf.mtCard(pickMatchKey));
    await releaseBroadcast(giftClaim);
    return { ok: false, detail: "RENDER_FAILED_NO_POST" };
  }

  const kickoffEn = new Intl.DateTimeFormat("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Tehran" }).format(new Date(pick.kickoff));
  // v20.0 — سود تضمینی پوششی واقعی (محاسبه‌شده از ضریب/استیک، نه marginPct ذخیره‌شده)
  const cover = coverProfitOf(pick);
  const coverLine = cover.hedged
    ? `💰 Guaranteed dutch cover: <b>${signedPct(cover.guaranteePct)}</b> (${signedUnit(cover.guarantee)}u) on a ${cover.staked.toFixed(0)}-unit ticket`
    : `💰 Win-scenario profit: <b>${signedUnit(cover.profitIfA)}u</b> · single-column ticket (no hedge)`;
  const caption =
    `${isFortress ? "🏰 <b>FREE VIP CARD OF THE DAY — FORTRESS MODE (joint-loss risk &lt; 7%)</b>" : "🎁 <b>FREE VIP CARD OF THE DAY — Supervisor-Approved</b>"}\n` +
    `🏆 <b>${esc(pick.homeTeam)}</b> × <b>${esc(pick.awayTeam)}</b> · ${esc(pick.league)} · ⏰ ${kickoffEn} Tehran\n` +
    `🔹 Tip A @${pick.oddsA.toFixed(2)}: ${esc(pick.labelA)} · stake ${pick.stakeA.toFixed(1)}u\n` +
    `🟢 Tip B @${pick.oddsB.toFixed(2)}: ${esc(pick.labelB)} · stake ${pick.stakeB.toFixed(1)}u\n` +
    `${coverLine}\n` +
    `🔐 Pre-match SHA-256: <code>${pick.hash.slice(0, 24)}</code>\n` +
    `———————\n` +
    `🎁 <b>کارت رایگان امروز — تایید سوپروایزر${isFortress ? " · دژ نفوذناپذیر (ریسک زیر ۷٪)" : ""}</b>\n` +
    `هر روز فقط ۱ کارت کامل و باز در کانال عمومی منتشر می‌شود؛ بقیه کارت‌ها مخصوص اعضای VIP است.\n` +
    `👑 عضویت VIP: @Aineobet_bot`;

  // v20.0 — photo-only: شکست sendPhoto → بدون پست متنی
  const ok = (await tgSendPhotoTo(chatId, photo, caption, `daily-gift-${pick.hash.slice(0, 10)}.png`)).ok;
  if (ok) {
    await setSetting(KEY_FUNNEL_GIFT_DAY, today);
    await commitBroadcast(giftClaim, true, `public:${chatId}${isFortress ? ":fortress" : ""}`);
  } else {
    if (mtClaimed) await releaseBroadcast(dedupeKeyOf.mtCard(pickMatchKey));
    await releaseBroadcast(giftClaim);
  }
  return { ok, detail: ok ? (isFortress ? "fortress-gift-sent" : "gift-sent") : "send-failed" };
}

export const sendDailyGiftCard = withFunnelLock(sendDailyGiftCardInner);

// ─── v13.5 — موضوعات بنر بازاریابی ساعتی (چرخشی، با کپشن فارسی — تصویر کاملاً انگلیسی) ───

interface MarketingAd {
  key: string;
  headline: string;
  sub: string;
  hashtag: string;
  bullets: { icon: "shield" | "crown" | "target" | "vault" | "clock" | "bolt"; title: string; line: string }[];
  faCaption: string;
}

export const MARKETING_ADS: MarketingAd[] = [
  {
    key: "DUTCH_COVER",
    headline: "GUARANTEED DUTCH COVER",
    sub: "Two complementary tips split one 100-unit ticket — either winning outcome pays the same fixed profit.",
    hashtag: "#GUARANTEED_COVER",
    bullets: [
      { icon: "shield", title: "FULL SCOREBOARD COVER", line: "Both tips own disjoint score corridors — no double exposure." },
      { icon: "target", title: "FIXED PROFIT PER TICKET", line: "The margin is locked at issue time and printed on the card." },
      { icon: "vault", title: "100-UNIT STANDARD", line: "1 unit = 1% of your own bankroll — fully scalable." },
      { icon: "clock", title: "AUTO ESPN GRADING", line: "Every ticket settles itself on the official final score." },
    ],
    faCaption: "💰 <b>پوشش داچینگ تضمینی — امضای NeoBet</b>\nدو تیپ مکمل یک بلیت ۱۰۰ واحدی را پوشش می‌دهند؛ هر نتیجه‌ای دربیاید سود ثابت همان است.\n👑 عضویت VIP: @Aineobet_bot",
  },
  {
    key: "SUPERVISOR_GATE",
    headline: "AI SUPERVISOR VETO GATE",
    sub: "Every match is scanned and scored — high-risk patterns are vetoed before a card is ever issued.",
    hashtag: "#AI_SUPERVISOR",
    bullets: [
      { icon: "shield", title: "V15 ATOMIC RISK GATE", line: "Degenerate pairs above the 45% joint-loss corridor are vetoed before a card is ever issued." },
      { icon: "target", title: "SIX-FACTOR SCORING", line: "Odds movement, λ model, form, variance and market value." },
      { icon: "vault", title: "SHADOW LEDGER", line: "Vetoed cards are paper-settled publicly for full transparency." },
      { icon: "crown", title: "HUMAN-GRADE DISCIPLINE", line: "No chasing, no tilt, no revenge tickets — pure process." },
    ],
    faCaption: "🛡️ <b>دروازه وتوی سوپروایزر هوشمند v16.0</b>\nفقط بازی‌های تراز اول تایید می‌شوند: ریسک باخت همزمان بالای ۱۰.۵٪ وتو و به دفتر سایه منتقل می‌شود؛ فاوریت بدون برتری واضح (λ &lt; ۱.۵۰) وتو می‌شود؛ لیگ‌های سمّی (لالیگا ۲ و MLS و دوستانه) بلک‌لیست رسمی‌اند. ریسک هر کارت روی خودش شفاف چاپ می‌شود.\n👑 عضویت VIP: @Aineobet_bot",
  },
  {
    key: "ESPN_SETTLEMENT",
    headline: "100% AUTO ESPN SETTLEMENT",
    sub: "Zero manual grading. Every card is auto-settled on the official ESPN scoreboard within minutes of FT.",
    hashtag: "#ESPN_AUTO_SETTLED",
    bullets: [
      { icon: "bolt", title: "MINUTES AFTER FT", line: "Server loop scans ESPN day+night — no human in the loop." },
      { icon: "shield", title: "OFFICIAL SCOREBOARD ONLY", line: "If ESPN has no result, the ticket is voided honestly." },
      { icon: "vault", title: "SHA-256 ON EVERY CARD", line: "Pre-match hash proves the tip was never edited." },
      { icon: "target", title: "WIN / LOSS POSTED ALIKE", line: "Losses are published too — full transparency policy." },
    ],
    faCaption: "⚡ <b>تسویه ۱۰۰٪ خودکار با اسکوربورد رسمی ESPN</b>\nچند دقیقه پس از سوت پایان، نتیجه هر کارت خودکار اعلام می‌شود — بدون هیچ دخالت انسانی.\n👑 عضویت VIP: @Aineobet_bot",
  },
  {
    key: "FORTRESS_MODE",
    headline: "FORTRESS MODE CARDS",
    sub: "The safest product line: joint-loss risk under 7% — slower, calmer, built for stress-free tickets.",
    hashtag: "#FORTRESS_MODE",
    bullets: [
      { icon: "vault", title: "RISK < 7% ONLY", line: "Only ultra-low joint-loss patterns earn the fortress badge." },
      { icon: "shield", title: "SUPERVISOR APPROVED", line: "Every fortress card passes the full AI veto gate." },
      { icon: "clock", title: "BANK-FRIENDLY PACE", line: "Designed for steady compounding, not adrenaline." },
      { icon: "crown", title: "DAILY FORTRESS PICK", line: "The daily free card prefers fortress patterns first." },
    ],
    faCaption: "🏰 <b>دژ نفوذناپذیر — امن‌ترین خط تولید NeoBet</b>\nفقط کارت‌هایی با ریسک باخت همزمان زیر ۷٪ نشان دژ می‌گیرند؛ کارت رایگان روزانه اولویت با دژهاست.\n👑 عضویت VIP: @Aineobet_bot",
  },
  {
    key: "SHA_PROOF",
    headline: "SHA-256 PRE-MATCH PROOF",
    sub: "Every tip is hashed before kickoff — the hash is published first, the result can never rewrite history.",
    hashtag: "#SHA256_PROOF",
    bullets: [
      { icon: "vault", title: "HASHED BEFORE KICKOFF", line: "The card content is committed before the match starts." },
      { icon: "target", title: "VERIFY AFTER FT", line: "Same hash, same tip — zero edits, zero deletions." },
      { icon: "shield", title: "ESPN VERIFICATION LINK", line: "Each card carries its official ESPN match link." },
      { icon: "crown", title: "AUDIT-FRIENDLY", line: "Anyone can re-verify the full track record." },
    ],
    faCaption: "🔐 <b>اثبات SHA-256 پیش از بازی</b>\nهش هر کارت قبل از شروع مسابقه منتشر می‌شود؛ بعد از بازی هم همان است — صفر ادیت، صفر حذف.\n👑 عضویت VIP: @Aineobet_bot",
  },
  {
    key: "BANK_STRATEGY",
    headline: "1000-UNIT BANK BLUEPRINT",
    sub: "A flat 100-unit dutch ticket per card on a 1000-unit bank — simple, honest, measurable growth.",
    hashtag: "#BANK_BLUEPRINT",
    bullets: [
      { icon: "crown", title: "FLAT STAKING DISCIPLINE", line: "No martingale, no doubling — pure flat 100u tickets." },
      { icon: "target", title: "+X% PER TICKET LOCKED", line: "The cover margin is fixed at issue time." },
      { icon: "shield", title: "DRAWDOWN CONTROLLED", line: "Veto gate keeps the loss-corridor rare and small." },
      { icon: "vault", title: "TRACKED IN PUBLIC", line: "The bank growth curve is computed from real settled cards." },
    ],
    faCaption: "📈 <b>نقشه رشد بانک ۱۰۰۰ واحدی</b>\nهر کارت ۱۰۰ واحد ثابت روی بانک ۱۰۰۰ واحدی — رشد قابل اندازه‌گیری و شفاف، بدون مارتینگل.\n👑 عضویت VIP: @Aineobet_bot",
  },
  {
    key: "TIMING_WINDOWS",
    headline: "BEST EXECUTION WINDOWS",
    sub: "Each card prints its own optimal odds-entry window — early favorite, lineup shock or late underdog peak.",
    hashtag: "#TIMING_WINDOWS",
    bullets: [
      { icon: "clock", title: "T-60 LINEUP SHOCK", line: "Odds swing hardest when official XIs drop." },
      { icon: "bolt", title: "EARLY FAVORITE WINDOW", line: "Sharp money moves the favorite line early — be there first." },
      { icon: "target", title: "LATE UNDERDOG PEAK", line: "The best underdog price often lands in the last 30 minutes." },
      { icon: "vault", title: "PRINTED ON THE CARD", line: "The exact Tehran-time window is on every poster." },
    ],
    faCaption: "⏱️ <b>بهترین ساعت ثبت ضریب — روی خود کارت</b>\nهر پوستر پنجره دقیق ثبت (به وقت تهران) را چاپ می‌کند؛ در پنجره درست وارد شوید.\n👑 عضویت VIP: @Aineobet_bot",
  },
  {
    key: "COMBO_LINE",
    headline: "SMART COMBO ENGINE",
    sub: "Independent anchor legs joined into 2/3-leg combos with Monte-Carlo joint confidence printed on the poster.",
    hashtag: "#SMART_COMBOS",
    bullets: [
      { icon: "bolt", title: "2-LEG SAFE DOUBLE", line: "Two uncorrelated anchors — the calm multiplier line." },
      { icon: "crown", title: "3-LEG GOLDEN TREBLE", line: "Higher odds with joint-confidence disclosure." },
      { icon: "target", title: "MONTE-CARLO 10K RUNS", line: "Joint probability is simulated, not guessed." },
      { icon: "shield", title: "DISJOINT ACCOUNTING", line: "A combo ticket never counts in two product lines." },
    ],
    faCaption: "🧩 <b>موتور میکس هوشمند — اعتماد مونت‌کارلو</b>\nپایه‌های مستقل با احتمال مشترک شبیه‌سازی‌شده روی پوستر چاپ می‌شود؛ هیچ عدد ساختگی وجود ندارد.\n👑 عضویت VIP: @Aineobet_bot",
  },
  {
    key: "SNIPER_LINE",
    headline: "HIGH-ODDS SNIPER SHOTS",
    sub: "Reverse-Poisson value hunts at big prices — small capped stakes, EV-protected single shots.",
    hashtag: "#ODDS_SNIPER",
    bullets: [
      { icon: "target", title: "REVERSE-POISSON EDGE", line: "We price the longshot; the book prices the crowd." },
      { icon: "vault", title: "0.5-1.0% BANKROLL CAP", line: "Snipers stay small — the bank is never hostage." },
      { icon: "bolt", title: "FRACTIONAL KELLY 0.15x", line: "Quarter-Kelly discipline on every shot." },
      { icon: "crown", title: "SINGLE SHOT ONLY", line: "One sniper per match — no parlays of longshots." },
    ],
    faCaption: "🎯 <b>تک‌تیرانداز ضریب بالا — ارزش پنهان بازار</b>\nشات‌های تک با استیک کپ‌شده و لبه ریورس‌پواسون؛ بانک شما هرگز گروگان شات بلند نیست.\n👑 عضویت VIP: @Aineobet_bot",
  },
  {
    key: "LIFETIME_PLAN",
    headline: "LIFETIME VIP — ONE PAYMENT",
    sub: "Pay once, receive every VIP flashcard, the daily digest and the full quant pipeline forever.",
    hashtag: "#LIFETIME_VIP",
    bullets: [
      { icon: "crown", title: "LIFETIME ACCESS 50 USDT", line: "The flagship plan — never expires." },
      { icon: "vault", title: "ALL PRODUCT LINES", line: "Dual-hedge cards, combos, snipers, fortress picks." },
      { icon: "bolt", title: "INSTANT USDT AUTO-VERIFY", line: "TRC-20 / SOL / BSC / Polygon — 10-second activation." },
      { icon: "shield", title: "CARD-TO-CARD IN TOMAN", line: "Iranian bank transfer accepted inside the bot." },
    ],
    faCaption: "♾️ <b>اشتراک مادام‌العمر — فقط یک پرداخت</b>\nهمه فلش‌کارت‌ها، برآیند روزانه و کل خط تولید کوانتوم، برای همیشه.\nپرداخت: USDT (TRC20/SOL/BSC/Polygon) یا کارت‌به‌کارت تومانی داخل ربات.\n👑 عضویت: @Aineobet_bot",
  },
];

/**
 * v13.5 — پیام بازاریابی هوشمند ساعتی به کانال عمومی (۰۹ تا ۲۳ تهران):
 * بنر تصویری کاملاً انگلیسی + کپشن فارسی حرفه‌ای + KPI واقعی کانال.
 * موضوع‌ها چرخشی‌اند (hour % 10) و با KEY_MARKETING_LAST_AD در هر ساعت فقط یک‌بار ارسال می‌شوند.
 */
async function sendHourlyVipAdInner(force = false): Promise<{ ok: boolean; detail: string; topic: string }> {
  const token = await botToken();
  if (!token) return { ok: false, detail: "NO_TOKEN", topic: "—" };
  const chatId = await publicChannelId();
  if (!chatId) return { ok: false, detail: "NO_PUBLIC_CHANNEL", topic: "—" };

  const th = tehranHour();
  if (!force && (th < 9 || th > 23)) return { ok: false, detail: "OUT_OF_MARKETING_HOURS", topic: "—" };

  const stamp = `${tehranDayKey()}:${th}`;
  // v19.0 — ادعای اتمی ساعتی (INSERT-first): AD:<day>:<hour>
  const adClaim = dedupeKeyOf.ad(tehranDayKey(), th);
  if (!force && !(await claimBroadcast(adClaim, null, "MARKETING_AD"))) return { ok: false, detail: "ALREADY_SENT_THIS_HOUR", topic: "—" };

  const ad = MARKETING_ADS[th % MARKETING_ADS.length];
  try {
    const photo = await renderVipAdBannerPNG({
      topicKey: ad.key,
      headline: ad.headline,
      sub: ad.sub,
      hashtag: ad.hashtag,
      bullets: ad.bullets,
      generatedAtIso: new Date().toISOString(),
    });
    // v20.0 — هیچ پست بی‌تصویری: شکست sendPhoto → بدون جایگزین متنی
    const ok = (await tgSendPhotoTo(chatId, photo, ad.faCaption, `vip-ad-${ad.key.toLowerCase()}.png`)).ok;
    if (ok) {
      await setSetting(KEY_MARKETING_LAST_AD, stamp);
      await commitBroadcast(adClaim, true, `public:${chatId}:${ad.key}`);
    } else {
      await releaseBroadcast(adClaim);
    }
    return { ok, detail: ok ? "ad-sent" : "send-failed", topic: ad.key };
  } catch (err) {
    console.warn("hourly vip ad failed:", err instanceof Error ? err.message : err);
    await releaseBroadcast(adClaim); // اسلات ساعت از دست نرود
    return { ok: false, detail: "RENDER_FAILED", topic: ad.key };
  }
}

export const sendHourlyVipAd = withFunnelLock(sendHourlyVipAdInner);

/** آمار رادار شفافیت — از دیتابیس کارنامه (بدون هیچ عدد جعلی) */
export async function funnelRadarStats(): Promise<{ scanned: number; vetoed: number; golden: number }> {
  const [all, vetoed] = await Promise.all([
    db.issuedSlip.findMany({ select: { id: true, externalId: true, supervisorApproved: true } }),
    db.issuedSlip.count({ where: { supervisorApproved: false, retroIssued: false } }),
  ]);
  const scanned = new Set(all.map((s) => s.externalId ?? s.id)).size;
  const golden = await db.issuedSlip.count({ where: { supervisorApproved: true, status: { in: ["PENDING", "LIVE"] } } });
  return { scanned, vetoed, golden };
}

/** پست ۱ — رادار شفافیت روزانه به کانال عمومی (ساعت ۱۱:۰۰ تهران، یک‌بار در روز) */
export async function sendPublicRadar(force = false): Promise<boolean> {
  const token = await botToken();
  if (!token) return false;
  const chatId = await publicChannelId();
  if (!chatId) return false;

  const today = tehranDayKey();
  // v19.0 — ادعای اتمی روزانه رادار (INSERT-first)
  const radarClaim = dedupeKeyOf.radar(today);
  if (!force && !(await claimBroadcast(radarClaim, null, "FUNNEL_RADAR"))) return false;

  const st = await funnelRadarStats();
  const next = await db.issuedSlip.findFirst({
    where: { supervisorApproved: true, status: { in: ["PENDING", "LIVE"] } },
    orderBy: { kickoff: "asc" },
  });
  // v20.0 — سود تضمینی پوششی واقعی (محاسبه‌شده از ضریب/استیک)
  const nextCover = next ? coverProfitOf(next) : null;
  const topLine = next && nextCover
    ? `${next.homeTeam} vs ${next.awayTeam} · guaranteed ${signedPct(nextCover.guaranteePct)} dutch cover`
    : "Scanner is waiting for the next ESPN matchday window";

  const dateLabelEn = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "2-digit", month: "short", timeZone: "Asia/Tehran" }).format(new Date());
  const photo = await renderDailyRadarPNG({
    dateLabelEn,
    scanned: st.scanned,
    vetoed: st.vetoed,
    goldenSignals: st.golden,
    topPickLine: topLine,
  });

  const caption =
    `📡 <b>NEOBET QUANT PRO • ${esc(DEFAULT_PUBLIC_CHANNEL.replace("@", "@"))} — Daily Matchday Radar</b>\n` +
    `🔍 ${st.scanned} matches scanned · 🛡️ ${st.vetoed} high-risk vetoed by the Supervisor · 👑 ${st.golden} golden signals issued for VIP.\n` +
    `Free gift card + locked VIP teasers drop at T-60 before kickoff. Same SHA-256, unblurred after FT.`;

  // v20.0 — هیچ پست بی‌تصویری: شکست sendPhoto → بدون جایگزین متنی
  const res = await tgSendPhotoTo(chatId, photo, caption, `daily-radar-${today}.png`);
  if (res.ok) {
    await setSetting(KEY_FUNNEL_RADAR_DAY, today);
    await commitBroadcast(radarClaim, true, `public:${chatId}`);
  } else {
    await releaseBroadcast(radarClaim);
  }
  return res.ok;
}

/** پست ۲ — قیف T-60m: ۱ کارت رایگان کامل + تیزرهای قفل‌شده به کانال عمومی */
export async function sendFunnelTeasers(force = false): Promise<{ gift: boolean; teasers: number }> {
  const token = await botToken();
  if (!token) return { gift: false, teasers: 0 };
  const chatId = await publicChannelId();
  if (!chatId) return { gift: false, teasers: 0 };

  const now = Date.now();
  const window = await db.issuedSlip.findMany({
    where: { supervisorApproved: true, status: { in: ["PENDING", "LIVE"] }, kickoff: { gte: new Date(now + 25 * 60_000), lte: new Date(now + 95 * 60_000) } },
    orderBy: { kickoff: "asc" },
    take: 6,
  });

  const alreadySent = new Set(
    (await db.telegramOutbox.findMany({ where: { kind: { in: ["FUNNEL_GIFT", "FUNNEL_TEASER"] }, slipId: { not: null } }, select: { slipId: true } })).map((r) => r.slipId)
  );
  const candidates = window.filter((s) => !alreadySent.has(s.id));
  if (candidates.length === 0 && !force) return { gift: false, teasers: 0 };

  const today = tehranDayKey();
  const giftDay = await getSetting(KEY_FUNNEL_GIFT_DAY);

  let gift = false;
  let teasers = 0;

  for (const slip of candidates) {
    // ═══ v20.0 — «هر بازی فقط یک‌بار»: ادعای سطح-بازی MT-CARD قبل از گیفت/تیزر ═══
    // اگر این بازی قبلاً کارت‌نوع رفته (CARD به VIP یا گیفت قبلی)، دیگر تیزر/گیفت دوم نمی‌گیرد.
    const mKey = matchKeyOf(slip);
    if (await matchCardAlreadyPosted(mKey)) continue;
    const mtClaim = dedupeKeyOf.mtCard(mKey);
    // v19.0 — ادعای اتمی per-slip برای گیفت/تیزر (INSERT-first) — مسیر موازی هرگز دوبار نمی‌فرستد
    const isGift = giftDay !== today && (await claimBroadcast(dedupeKeyOf.gift(today), slip.id, "FUNNEL_GIFT"));
    if (!isGift && !(await claimBroadcast(dedupeKeyOf.teaser(slip.id), slip.id, "FUNNEL_TEASER"))) continue;
    // v20.0 — ادعای MT بعد از per-slip claim (شکست MT → آزادسازی per-slip)
    if (!(await claimBroadcast(mtClaim, slip.id, "MT_CARD"))) {
      await releaseBroadcast(dedupeKeyOf.gift(today));
      await releaseBroadcast(dedupeKeyOf.teaser(slip.id));
      continue;
    }
    // v20.0 — هیچ پیامی بدون تصویر کامل: رندر دو بار تلاش می‌شود؛ شکست → بدون پست
    let photo: Buffer | null = null;
    for (let attempt = 0; attempt < 2 && photo === null; attempt++) {
      try {
        photo = isGift ? await renderSlipCardPNG(slip) : await renderSlipTeaserPNG(slip);
      } catch (err) {
        console.warn(`[telegram] teaser render attempt ${attempt + 1} failed:`, err instanceof Error ? err.message : err);
      }
    }
    if (!photo) {
      await releaseBroadcast(dedupeKeyOf.gift(today));
      await releaseBroadcast(dedupeKeyOf.teaser(slip.id));
      await releaseBroadcast(mtClaim);
      continue;
    }

    // v20.0 — سود تضمینی پوششی واقعی (محاسبه‌شده از ضریب/استیک، نه marginPct ذخیره‌شده)
    const cover = coverProfitOf(slip);
    try {
      if (isGift) {
        const coverLine = cover.hedged
          ? `💰 Guaranteed dutch profit: <b>${signedPct(cover.guaranteePct)}</b> (${signedUnit(cover.guarantee)}u)`
          : `💰 Win-scenario profit: <b>${signedUnit(cover.profitIfA)}u</b> · single-column`;
        const caption =
          `🎁 <b>FREE GIFT CARD — 100% OPEN, NO LOCK</b>\n` +
          `🏆 <b>${esc(slip.homeTeam)}</b> × <b>${esc(slip.awayTeam)}</b> · ${esc(slip.league)}\n` +
          `🔹 Tip A @${slip.oddsA.toFixed(2)}: ${esc(slip.labelA)} · stake ${slip.stakeA.toFixed(1)}u\n` +
          `🟢 Tip B @${slip.oddsB.toFixed(2)}: ${esc(slip.labelB)} · stake ${slip.stakeB.toFixed(1)}u\n` +
          `${coverLine}\n` +
          `🔐 SHA-256: <code>${slip.hash.slice(0, 24)}</code>\n` +
          `Every settlement is auto-graded on the official ESPN final score.`;
        const ok = (await tgSendPhotoTo(chatId, photo, caption, `gift-${slip.hash.slice(0, 10)}.png`)).ok;
        if (ok) {
          gift = true;
          await setSetting(KEY_FUNNEL_GIFT_DAY, today);
          await commitBroadcast(dedupeKeyOf.gift(today), true, `public:${chatId}`);
        } else {
          await releaseBroadcast(dedupeKeyOf.gift(today));
          await releaseBroadcast(mtClaim);
        }
      } else {
        // v13.5 — رفع باگ ورودی: از رندر تیزر رسمی (کارت کامل با تیپ B قفل) استفاده می‌شود.
        const caption =
          `🔒 <b>VIP TEASER — UNBLURRED AFTER FT</b>\n` +
          `🏆 <b>${esc(slip.homeTeam)}</b> × <b>${esc(slip.awayTeam)}</b> · ${esc(slip.league)}\n` +
          `💰 Guaranteed cover profit: <b>${signedPct(cover.guaranteePct)}</b> (${signedUnit(cover.guarantee)}u) · Tip A @${slip.oddsA.toFixed(2)} revealed — Tip B locked.\n` +
          `🔐 Pre-match SHA-256: <code>${slip.hash.slice(0, 24)}</code>\n` +
          `Join VIP to unlock the complementary leg before kickoff.`;
        const ok = (await tgSendPhotoTo(chatId, photo, caption, `teaser-${slip.hash.slice(0, 10)}.png`)).ok;
        if (ok) {
          teasers += 1;
          await commitBroadcast(dedupeKeyOf.teaser(slip.id), true, `public:${chatId}`);
        } else {
          await releaseBroadcast(dedupeKeyOf.teaser(slip.id));
          await releaseBroadcast(mtClaim);
        }
      }
    } catch (err) {
      console.warn("funnel teaser failed:", err instanceof Error ? err.message : err);
      // v20.0 — شکست → همه ادعاها آزاد تا تیک بعدی ریتیپ کند
      await releaseBroadcast(dedupeKeyOf.gift(today));
      await releaseBroadcast(dedupeKeyOf.teaser(slip.id));
      await releaseBroadcast(mtClaim);
    }
  }
  return { gift, teasers };
}

/** پست ۳ — FT+5m: بازگشایی قفل همان کارت + پوستر نتیجه در کانال عمومی (اثبات SHA-256) */
export async function sendPublicUnblur(): Promise<number> {
  const token = await botToken();
  if (!token) return 0;
  const chatId = await publicChannelId();
  if (!chatId) return 0;

  // کارت‌های تسویه‌شده که تیزر/گیفت عمومی دارند ولی اثبات عمومی نگرفته‌اند
  const teased = (
    await db.telegramOutbox.findMany({ where: { kind: { in: ["FUNNEL_GIFT", "FUNNEL_TEASER"] }, slipId: { not: null } }, select: { slipId: true } })
  ).map((r) => r.slipId as string);
  const proven = new Set(
    (await db.telegramOutbox.findMany({ where: { kind: "FUNNEL_UNBLUR", slipId: { not: null } }, select: { slipId: true } })).map((r) => r.slipId)
  );
  const ids = teased.filter((id) => !proven.has(id));
  if (ids.length === 0) return 0;

  const slips = await db.issuedSlip.findMany({
    where: { id: { in: ids }, status: { in: ["WON_A", "WON_B", "DOUBLE_WIN", "MIDDLE_TRAP"] } },
    orderBy: { settledAt: "asc" },
    take: 4,
  });

  let sent = 0;
  for (const slip of slips) {
    // ═══ v20.0 — «هر بازی فقط یک‌بار» برای پست نتیجه‌نوع: RESULT یا UNBLUR — فقط یکی ═══
    const mKey = matchKeyOf(slip);
    if (await matchResultAlreadyPosted(mKey)) continue;
    const mtResultClaim = dedupeKeyOf.mtResult(mKey);
    const mtGot = await claimBroadcast(mtResultClaim, slip.id, "MT_RESULT");
    if (!mtGot) continue;
    // v19.0 — ادعای اتمی per-slip اثبات عمومی (INSERT-first)
    const unblurClaim = dedupeKeyOf.unblur(slip.id);
    if (!(await claimBroadcast(unblurClaim, slip.id, "FUNNEL_UNBLUR"))) {
      await releaseBroadcast(mtResultClaim);
      continue;
    }
    try {
      // v20.0 — هیچ پیامی بدون تصویر کامل: رندر دوبار تلاش؛ شکست کامل → بدون پست
      let unblurred: Buffer | null = null;
      for (let attempt = 0; attempt < 2 && unblurred === null; attempt++) {
        try {
          unblurred = await renderSlipCardPNG(slip);
        } catch (err) {
          console.warn(`[telegram] unblur render attempt ${attempt + 1} failed:`, err instanceof Error ? err.message : err);
        }
      }
      if (!unblurred) {
        await releaseBroadcast(unblurClaim);
        await releaseBroadcast(mtResultClaim);
        continue;
      }
      let result: Buffer | null = null;
      try {
        result = await renderSlipResultPNG(slip);
      } catch {
        result = null;
      }
      const r = slipResultLabel(slip.status);
      const caption =
        `🔓 <b>UNBLURRED — SAME SHA-256, NOW OPEN</b>\n` +
        `🏆 <b>${esc(slip.homeTeam)} ${slip.homeGoals ?? 0}−${slip.awayGoals ?? 0} ${esc(slip.awayTeam)}</b> · FT (official ESPN)\n` +
        `${r.emoji} Result: <b>${esc(r.label)}</b> · net ${((slip.netProfit ?? 0) >= 0 ? "+" : "")}${(slip.netProfit ?? 0).toFixed(1)}u\n` +
        `🔐 Pre-match hash: <code>${slip.hash.slice(0, 24)}</code> — identical to the locked teaser posted before kickoff.\n` +
        `The VIP leg that was blurred is now fully visible. Zero edits, zero deletions — full transparency.`;
      const okPhoto = (await tgSendPhotoTo(chatId, unblurred, caption, `unblur-${slip.hash.slice(0, 10)}.png`)).ok;
      if (okPhoto) {
        if (result) await tgSendPhotoTo(chatId, result, caption, `proof-${slip.hash.slice(0, 10)}.png`);
        sent += 1;
        await commitBroadcast(unblurClaim, true, `public:${chatId}`);
      } else {
        await releaseBroadcast(unblurClaim);
        await releaseBroadcast(mtResultClaim);
      }
    } catch (err) {
      console.warn("funnel unblur failed:", err instanceof Error ? err.message : err);
      await releaseBroadcast(unblurClaim);
      await releaseBroadcast(mtResultClaim);
    }
  }
  return sent;
}

/**
 * پست ۴ — برآیند واقعی شب (۲۳:۳۰ تهران) به کانال عمومی:
 * سود خالص واقعی روز با «افراز مجزا» — دسته الف تک‌بازی / ب میکس / ج تیپ‌های ضریب بالا.
 * صفر دوباره‌شماری: هر کارت فقط در خط تولید خودش شمرده می‌شود.
 */
async function sendNightlyPnlInner(force = false, dayKey?: string): Promise<boolean> {
  const token = await botToken();
  if (!token) return false;
  const chatId = await publicChannelId();
  if (!chatId) return false;

  // v20.0 — پشتیبانی جبران اسلات گم‌شده بعداز نیمه‌شب تهران
  const today = dayKey ?? tehranDayKey();
  // v19.0 — ادعای اتمی شبانه (INSERT-first): PNL:<day>
  const pnlClaim = dedupeKeyOf.pnl(today);
  if (!force && !(await claimBroadcast(pnlClaim, null, "FUNNEL_PNL"))) return false;

  const rows = await db.issuedSlip.findMany({
    where: { supervisorApproved: true, retroIssued: false, status: { in: ["WON_A", "WON_B", "DOUBLE_WIN", "MIDDLE_TRAP"] }, settledAt: { not: null } },
    orderBy: { settledAt: "desc" },
    take: 80,
  });
  const todayRows = rows.filter((r) => tehranDayKey(r.settledAt as Date) === today);

  const tierNet = (line: string) => todayRows.filter((r) => (r.productLine ?? "SINGLE") === line).reduce((a, r) => a + (r.netProfit ?? 0), 0);
  const netA = tierNet("SINGLE");
  const netB = tierNet("COMBO");
  const netC = tierNet("SNIPER");
  const total = netA + netB + netC;
  const settled = todayRows.length;
  const wins = todayRows.filter((r) => r.status !== "MIDDLE_TRAP").length;
  const winRate = settled > 0 ? (wins / settled) * 100 : 0;

  const dateLabelEn = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Tehran" }).format(new Date());
  const timeEn = (d: Date) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Tehran" }).format(d);

  const photo = await renderDailyReportPNG({
    dateLabelEn,
    kpis: [
      { label: "TIER 1 · DUAL-HEDGE NET", value: `${netA >= 0 ? "+" : "−"}${Math.abs(netA).toFixed(1)}`, color: netA >= 0 ? C_emerald : C_rose },
      { label: "TIER 2 · COMBO NET", value: `${netB >= 0 ? "+" : "−"}${Math.abs(netB).toFixed(1)}`, color: netB >= 0 ? C_emerald : C_rose },
      { label: "TIER 3 · SNIPER NET", value: `${netC >= 0 ? "+" : "−"}${Math.abs(netC).toFixed(1)}`, color: netC >= 0 ? C_emerald : C_rose },
      { label: "CHANNEL WIN-RATE", value: `${winRate.toFixed(0)}%`, color: C_cyan },
    ],
    matches: todayRows.slice(0, 4).map((r) => ({
      teams: `${r.homeTeam} vs ${r.awayTeam}`,
      score: `${r.homeGoals ?? 0}-${r.awayGoals ?? 0}`,
      verdict: `${r.status.replace("_", " ")} · settled ${r.settledAt ? timeEn(r.settledAt) : ""} Tehran`,
      profit: r.netProfit ?? 0,
    })),
    dayNetProfit: Math.round(total * 100) / 100,
    daySettled: settled,
    dayStaked: Math.round(todayRows.reduce((a, r) => a + r.stakeA + r.stakeB, 0)),
  });

  const caption =
    `🌙 <b>NEOBET QUANT PRO • Nightly Real PnL — Disjoint Product Lines</b>\n` +
    `Tier 1 Dual-Hedge: <b>${netA >= 0 ? "+" : ""}${netA.toFixed(1)}u</b> · Tier 2 Combos: <b>${netB >= 0 ? "+" : ""}${netB.toFixed(1)}u</b> · Tier 3 Sniper: <b>${netC >= 0 ? "+" : ""}${netC.toFixed(1)}u</b>\n` +
    `Day net: <b>${total >= 0 ? "+" : ""}${total.toFixed(1)} units</b> on ${settled} real ESPN-settled tickets · win-rate ${winRate.toFixed(1)}%.\n` +
    `Strictly disjoint accounting — no ticket is ever counted in two lines. No simulation, no paper trades.`;

  // v20.0 — هیچ پست بی‌تصویری
  const res = await tgSendPhotoTo(chatId, photo, caption, `nightly-pnl-${today}.png`);
  if (res.ok) {
    await setSetting(KEY_FUNNEL_PNL_DAY, today);
    await commitBroadcast(pnlClaim, true, `public:${chatId}`);
  } else {
    await releaseBroadcast(pnlClaim);
  }
  return res.ok;
}

export const sendNightlyPnl = withFunnelLock(sendNightlyPnlInner);

// ═══════════════════════════════════════════════════════════════
// v18.0 — ایجنت سوپروایزر تلگرام (Telegram Supervisor Agent — نسخه مهندسی‌شده)
// برنامه پایدار و دقیق پخش، طبق دستور کارفرما:
//   · کانال VIP  → ۱۰:۰۰ بریفینگ صبح (کارت‌های امروز + توصیه‌های مهم + انضباط اجرا)
//                  ← کارت‌های بازی از خط لوله auto-dispatch (هر ۹۰ ثانیه)
//                  ← ۲۱:۰۰ برآیند روزانه (sendDailyDigest) + جمعه ۲۲:۰۰ گزارش هفتگی
//   · کانال عمومی → ۰۹:۳۰ و ۱۶:۳۰ خبرهای فوتبال (وایر ESPN)
//                  ← ۱۱:۳۰ و ۱۸:۳۰ آکادمی اصطلاحات BET (دو درس در روز، چرخشی)
//                  ← کارت رایگان روزانه + بنر بازاریابی ساعتی + نتایج FT + وین‌ریت
//                  ← ۲۱:۰۰ برآیند روزانه + ۲۳:۳۰ برآیند شب + جمعه ۲۲:۰۰ گزارش هفتگی
// همه پست‌ها با Dedupe روی Setting — صفر ارسال تکراری، صفر وابستگی به مرورگر.
// ═══════════════════════════════════════════════════════════════

const KEY_VIP_BRIEF_DAY = "vip_last_brief_day";
const KEY_EDU_LAST = "edu_last_stamp";
const KEY_NEWS_LAST = "news_last_stamp";
const KEY_WEEKLY_LAST = "weekly_last_week";

// ─── آکادمی اصطلاحات BET — ۱۴ درس چرخشی (تصویر انگلیسی + کپشن فارسی) ───

interface BetTerm {
  term: string;
  tagline: string;
  definition: string;
  example: string;
  fa: string; // توضیح کامل فارسی برای کپشن تلگرام
}

export const BET_TERMS: BetTerm[] = [
  {
    term: "VALUE",
    tagline: "the only reason a sharp bet exists",
    definition: "A bet has value when the true probability is higher than the odds imply. Edge = model probability − implied probability. No edge, no bet.",
    example: "Model says 50% win chance → fair odds 2.00. Book offers 2.30 → implied 43.5% → +6.5% edge → a VALUE ticket.",
    fa: "ارزش (Value): وقتی احتمال واقعی برد بیشتر از چیزی است که ضریب نشان می‌دهد. NeoBet با موتور پواسون/دیکسون-کولز احتمال واقعی را می‌سازد و فقط کارت‌هایی با لبه مثبت صادر می‌کند.",
  },
  {
    term: "IMPLIED PROBABILITY",
    tagline: "what the odds secretly tell you",
    definition: "Implied probability = 1 ÷ decimal odds. It is the win chance the market has priced in — before the bookmaker's margin.",
    example: "Odds 2.50 → 1/2.50 = 40%. Odds 1.50 → 66.7%. Sum of all outcomes > 100% — the excess is the book's fee.",
    fa: "احتمال ضمنی: معکوس ضریب اعشاری. مثلا ضریب ۲.۵۰ یعنی بازار ۴۰٪ شانس می‌بیند. با حذف مارجین کتابmaker (روش شین) قیمت‌های عادلانه آشکار می‌شوند.",
  },
  {
    term: "DUTCH COVER",
    tagline: "the NeoBet signature — one ticket, two tips",
    definition: "Splitting one 100-unit ticket across two complementary tips so that EITHER winning outcome pays the same fixed profit. Full scoreboard corridor.",
    example: "Tip A 42u @ 3.10 + Tip B 58u @ 1.85 → Home-win pays +88.2u · Over-pays +87.3u — profit locked at issue time.",
    fa: "پوشش داچینگ: امضای NeoBet — یک بلیت ۱۰۰ واحدی بین دو تیپ مکمل تقسیم می‌شود و هر نتیجه‌ای دربیاید سود ثابت همان است. سود لحظه صدور روی کارت چاپ می‌شود.",
  },
  {
    term: "HEDGE",
    tagline: "locking profit mid-match",
    definition: "Backing the opposite outcome after the market moves, to lock a guaranteed profit or cut the loss — the core of live risk management.",
    example: "Pre-bet: Over 2.5 @ 1.90. Early goal → live Under @ 4.20. A 24u live hedge locks profit whatever happens next.",
    fa: "هج (پوشش مقابل): وقتی بازار جابه‌جا شد، نتیجه مقابل را می‌خریم تا سود تضمین یا زیان قطع شود. هج‌بات NeoBet این پنجره را زنده و لحظه‌ای پیشنهاد می‌دهد.",
  },
  {
    term: "KELLY STAKE",
    tagline: "the mathematical bankroll fraction",
    definition: "Kelly criterion: f* = edge ÷ variance — the growth-optimal fraction of bankroll. Full Kelly is violent; pros use fractional Kelly (0.15–0.25×).",
    example: "Edge 6% at odds 2.20 → full Kelly ≈ 5.5% of bank → NeoBet fractional 0.15× ≈ 0.8% — survival first.",
    fa: "استیک کلی: کسر بهینه سرمایه برای بیشترین رشد بلندمدت. NeoBet همیشه کلی کسری (۰.۱۵ تا ۰.۲۵ برابر) استفاده می‌کند تا نوسان مرگبار حذف شود.",
  },
  {
    term: "FLAT STAKING",
    tagline: "no martingale, no chasing, no tilt",
    definition: "Every card gets the same fixed stake (100 units) regardless of previous results. Flat staking survives variance that destroys progressions.",
    example: "10 losing cards in a row on martingale = 100× stake. On flat 100u staking the bank loses only 10% and stays alive.",
    fa: "استیک ثابت: هر کارت همیشه ۱۰۰ واحد — نه مارتینگل، نه دوبرابر کردن بعد از باخت. تنها روشی که با نوسان چندباخت متوالی زنده می‌ماند.",
  },
  {
    term: "BANKROLL",
    tagline: "your betting capital, measured in units",
    definition: "The total betting capital. NeoBet standard: 1 unit = 1% of your bank. A 100-unit ticket on a 1000-unit bank is exactly 10%.",
    example: "Bank $100 → 1 unit = $1. The +88.2u golden ticket = +$88.2 — the same math scales to any bank size.",
    fa: "بانک‌رول: کل سرمایه شرط‌بندی. قانون NeoBet: هر واحد = ۱٪ بانک شما. کارت ۱۰۰ واحدی روی بانک ۱۰۰۰ واحدی دقیقا ۱۰٪ است و با هر موجودی مقیاس‌پذیر است.",
  },
  {
    term: "JOINT-LOSS RISK",
    tagline: "the probability both tips lose together",
    definition: "For dual-tip cards: the simulated probability that BOTH tips lose simultaneously. NeoBet's hard gate vetoes every card above 10.5%.",
    example: "Monte-Carlo 10,000 runs → both-lose in 8.2% of worlds → approved. 13% → vetoed to the shadow ledger.",
    fa: "ریسک باخت همزمان: احتمال شبیه‌سازی‌شده این‌که هر دو تیپ با هم ببازند. گیت سخت v16 هر کارت بالای ۱۰.۵٪ را وتو می‌کند — کارت‌های وتوشده به دفتر سایه می‌روند.",
  },
  {
    term: "DOUBLE-WIN",
    tagline: "the golden jackpot scenario",
    definition: "When both complementary tips cash the same moment — the rarest and most profitable outcome, shown as DOUBLE_WIN on the ledger.",
    example: "Tip A (Home win) + Tip B (Over 2.5) both cash on 2-1 → stakeA×oddsA + stakeB×oddsB − 100 = the jackpot line.",
    fa: "برد طلایی همزمان: هر دو تیپ مکمل یک لحظه برنده می‌شوند — کمیاب‌ترین و سودآورترین سناریو که به‌صورت DOUBLE_WIN در کارنامه ثبت می‌شود.",
  },
  {
    term: "CLV — CLOSING LINE VALUE",
    tagline: "the sharpest long-run quality metric",
    definition: "CLV = beating the market's final (closing) odds. If you consistently get better prices than the close, you are a long-term winner regardless of short variance.",
    example: "You take Home @ 2.10; market closes at 1.95 → you beat the close by 7.7% — positive CLV.",
    fa: "CLV: فاصله ضریب شما با ضریب نهایی بازار. اگر پیوسته بهتر از خط پایانی گرفته باشید، برنده بلندمدت هستید. کارت‌های NeoBet لبه نسبت به خط شارپ پیناکل را چاپ می‌کنند.",
  },
  {
    term: "xG — EXPECTED GOALS",
    tagline: "chance quality, not luck",
    definition: "xG measures the quality of every chance (location, assist type, pressure). It exposes teams that over/under-perform their real strength.",
    example: "Team shooting 15 shots × 0.06 xG each = 0.9 xG — one lucky goal from 3 shots = regression coming.",
    fa: "ایکس‌جی: کیفیت واقعی موقعیت‌ها. سوخت موتور پیش‌بینی NeoBet — لامبدهای پواسون از xG و PPDA ساخته می‌شوند، نه از هیاهوی رسانه‌ای.",
  },
  {
    term: "POISSON MATRIX",
    tagline: "where every NeoBet tip is born",
    definition: "A score-probability grid built from each team's attack/defense lambdas (Dixon-Coles adjusted). Every market price derives from this matrix.",
    example: "λ_home 1.8 × λ_away 0.9 → P(2-1)=…, P(1-1)=… — the 6×6 grid feeds Over/Under, 1X2, BTTS and the golden pair.",
    fa: "ماتریس پواسون: جدول احتمال نتیجه‌ها از لامبدای حمله/دفاع دو تیم (با تصحیح دیکسون-کولز). همه تیپ‌های NeoBet از همین ماتریس زاده می‌شوند.",
  },
  {
    term: "MARGIN (VIG)",
    tagline: "the hidden fee inside every odd",
    definition: "The bookmaker's commission baked into odds. Removing the vig (Shin method) reveals the fair market price you must beat.",
    example: "1X2 odds 2.10/3.40/3.30 → implied 112.4% → 12.4% vig. Fair prices after Shin removal: 2.24/3.63/3.52.",
    fa: "مارجین (ویج): کارمزد پنهان بوکمیکر داخل ضرایب. موتور شین دی‌ویگ NeoBet این مارجین را حذف می‌کند تا قیمت عادلانه و لبه واقعی مشخص شود.",
  },
  {
    term: "TIMING WINDOW",
    tagline: "when to place the bet matters as much as what",
    definition: "Odds swing hardest at lineup release (T-60), early sharp moves and the late underdog peak. Each NeoBet card prints its exact entry window.",
    example: "Card window: 19:30–21:00 Tehran — the EARLY FAVORITE WINDOW before the sharp money re-prices the line.",
    fa: "پنجره زمانی: «چه زمانی» به اندازه «چه چیزی» مهم است. هر کارت NeoBet پنجره دقیق ثبت (به وقت تهران) را چاپ می‌کند — بهترین ضریب در پنجره درست گرفته می‌شود.",
  },
];

/** آمار واقعی کانال برای تزریق در پوسترهای آموزشی/بریفینگ */
async function channelKpis(): Promise<{ winRatePct: number | null; settled: number; netProfit: number }> {
  try {
    const rows = await db.issuedSlip.findMany({
      where: { supervisorApproved: true, retroIssued: false, status: { in: ["WON_A", "WON_B", "DOUBLE_WIN", "MIDDLE_TRAP"] } },
      select: { status: true, netProfit: true },
    });
    if (rows.length === 0) return { winRatePct: null, settled: 0, netProfit: 0 };
    const wins = rows.filter((r) => r.status !== "MIDDLE_TRAP").length;
    return {
      winRatePct: (wins / rows.length) * 100,
      settled: rows.length,
      netProfit: rows.reduce((a, r) => a + (r.netProfit ?? 0), 0),
    };
  } catch {
    return { winRatePct: null, settled: 0, netProfit: 0 };
  }
}

/**
 * v18.0 — بریفینگ صبح کانال VIP (۱۰:۰۰ تهران، یک‌بار در روز):
 * کارت‌های تاییدشده امروز + توصیه‌های مهم سوپروایزر + انضباط اجرا.
 * اگر امروز کارتی تایید نشده باشد، پوستر «انضباط کامل» با شمار وتوها مخابره می‌شود
 * (شفافیت کامل — هیچ کارت ساختگی تولید نمی‌شود).
 */
async function sendVipMorningBriefInner(force = false): Promise<{ ok: boolean; detail: string }> {
  const chatId = await channelId();
  if (!chatId) return { ok: false, detail: "NO_VIP_CHANNEL" };

  const today = tehranDayKey();
  // v19.0 — ادعای اتمی روزانه بریفینگ VIP (INSERT-first): BRIEF:<day>
  const briefClaim = dedupeKeyOf.brief(today);
  if (!force && !(await claimBroadcast(briefClaim, null, "VIP_BRIEF"))) return { ok: false, detail: "ALREADY_SENT_TODAY" };

  const day = tehranDayRange();
  const [cards, vetoedToday, kpis] = await Promise.all([
    db.issuedSlip.findMany({
      where: { supervisorApproved: true, retroIssued: false, status: { in: ["PENDING", "LIVE"] }, kickoff: { gte: day.start, lt: day.end } },
      orderBy: [{ supervisorScore: "desc" }, { kickoff: "asc" }],
      take: 5,
    }),
    db.issuedSlip.count({ where: { supervisorApproved: false, retroIssued: false, createdAt: { gte: day.start, lt: day.end } } }),
    channelKpis(),
  ]);

  const dateLabelEn = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Tehran" }).format(new Date());
  const kickoffEn = (d: Date) => new Intl.DateTimeFormat("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Tehran" }).format(d);

  const photo = await renderVipBriefPNG({
    dateLabelEn,
    cards: cards.map((c) => {
      const tw = c.timingWindowA ?? c.timingWindowB;
      const timingEn = tw && typeof tw === "string" ? tw.replace(/_/g, " ") : "EXECUTION WINDOW";
      return {
        teams: `${c.homeTeam} vs ${c.awayTeam}`,
        league: c.league,
        kickoffEn: kickoffEn(c.kickoff),
        oddsA: c.oddsA,
        oddsB: c.oddsB,
        marginPct: c.marginPct,
        riskPct: c.jointLossRiskPct ?? 0,
        tipA: c.labelA,
        tipB: c.labelB,
        timingEn,
        score100: c.supervisorScore != null ? score100Of(c.supervisorScore) : null,
      };
    }),
    vetoedToday,
    netUnitsAllTime: kpis.netProfit,
    winRatePct: kpis.winRatePct,
  });

  const cardLines = cards
    .map((c, i) => `${i + 1}. <b>${esc(c.homeTeam)} × ${esc(c.awayTeam)}</b> · ${esc(c.league)}\n   🔹 تیپ A @${c.oddsA.toFixed(2)}: ${esc(c.labelA)}\n   🟢 تیپ B @${c.oddsB.toFixed(2)}: ${esc(c.labelB)}\n   💰 پوشش تضمینی +${c.marginPct.toFixed(1)}٪ · ریسک همزمان ${(c.jointLossRiskPct ?? 0).toFixed(1)}٪`)
    .join("\n\n");

  const caption =
    `🌅 <b>NEOBET QUANT PRO — بریفینگ صبح کانال VIP</b>\n` +
    `📅 ${dateLabelEn}\n\n` +
    (cards.length > 0
      ? `👑 <b>کارت‌های تاییدشده امروز: ${cards.length}</b>\n\n${cardLines}\n\n` +
        `⭐ <b>توصیه‌های مهم سوپروایزر:</b>\n` +
        `۱) فقط داخل پنجره زمانی چاپ‌شده روی کارت ضریب ثبت کنید — بهترین قیمت پیش از حرکت پول شارپ است.\n` +
        `۲) استیک ثابت ۱۰۰ واحد؛ هرگز بعد از باخت استیک را بالا نبرید (بدون مارتینگل).\n` +
        `۳) هر ۱ واحد = ۱٪ بانک شخصی شما — مقیاس با موجودی خودتان.\n`
      : `🛡️ <b>امروز هیچ کارت تاییدشده‌ای صادر نشد — حالت انضباط کامل.</b>\n` +
        `سوپروایزر همه ${vetoedToday} کاندیدای پرریسک را وتو کرد؛ هیچ کارت ساختگی صادر نمی‌شود و هیچ کارتی به کانال تحمیل نمی‌شود.\n\n` +
        `⭐ <b>توصیه امروز:</b> بی‌کارت ماندن هم یک تصمیم حرفه‌ای است — سرمایه حفظ‌شده، سرمایه آماده برای روزهای تراز اول است.\n`) +
    `———————\n` +
    `📊 سود تجمعی کانال: ${kpis.netProfit >= 0 ? "+" : ""}${kpis.netProfit.toFixed(1)} واحد · وین‌ریت واقعی ESPN: ${kpis.winRatePct != null ? kpis.winRatePct.toFixed(1) + "٪" : "—"}\n` +
    `🤖 پیام‌های این کانال کامل خودکار است — صدور، تسویه ESPN و گزارش‌ها.`;

  let ok = (await tgSendPhotoTo(chatId, photo, caption, `vip-brief-${today}.png`)).ok;
  if (ok) {
    await setSetting(KEY_VIP_BRIEF_DAY, today);
    await commitBroadcast(briefClaim, true, `vip:${chatId}:cards=${cards.length}:vetoed=${vetoedToday}`);
  } else {
    await releaseBroadcast(briefClaim);
  }
  return { ok, detail: ok ? (cards.length > 0 ? `brief-sent:${cards.length} cards` : "brief-sent:discipline-mode") : "send-failed" };
}

export const sendVipMorningBrief = withFunnelLock(sendVipMorningBriefInner);

/**
 * v18.0 — آکادمی اصطلاحات BET (۱۱:۳۰ و ۱۸:۳۰ تهران):
 * دو درس تصویری چرخشی در روز به کانال عمومی — آموزش زبان پول شارپ.
 * slot: ۰ یا ۱ (دو اسلات روزانه) — اصطلاح با (شماره روز + slot) چرخش می‌شود.
 * v18.4 — claim اتمی استمپ قبل از ارسال + قفل funnel — ریشه ارسال تکراری درس‌ها.
 */
async function sendBetTermLessonInner(force = false, slot = 0): Promise<{ ok: boolean; detail: string }> {
  const token = await botToken();
  if (!token) return { ok: false, detail: "NO_TOKEN" };
  const chatId = await publicChannelId();
  if (!chatId) return { ok: false, detail: "NO_PUBLIC_CHANNEL" };

  // v19.0 — ادعای اتمی اسلات درس (INSERT-first): BET:<day>:<slot> — اتمیک در سطح SQLite،
  // ایمن در برابر هر تعداد پردازه/ری‌استارت (ریشه ریشه‌ای ارسال تکراری هر ۹۰ ثانیه)
  const claimKey = dedupeKeyOf.bet(tehranDayKey(), slot);
  if (!force) {
    const claimed = await claimBroadcast(claimKey, null, "BET_TERM");
    if (!claimed) return { ok: false, detail: "ALREADY_SENT_THIS_SLOT" };
    await setSetting(`${KEY_EDU_LAST}:${slot}`, `${tehranDayKey()}:${slot}`).catch(() => undefined);
  }

  const dayIndex = Math.floor(Date.now() / 86_400_000);
  const term = BET_TERMS[(dayIndex + slot) % BET_TERMS.length];
  const kpis = await channelKpis();

  const photo = await renderBetLessonPNG({
    term: term.term,
    tagline: term.tagline,
    definition: term.definition,
    example: term.example,
    lessonNo: ((dayIndex + slot) % BET_TERMS.length) + 1,
    winRatePct: kpis.winRatePct,
    settled: kpis.settled,
  });

  const caption =
    `🎓 <b>آکادمی BET NeoBet — درس ${(((dayIndex + slot) % BET_TERMS.length) + 1).toLocaleString("fa-IR")} · ${esc(term.term)}</b>\n\n` +
    `${esc(term.fa)}\n\n` +
    `💬 <b>مثال واقعی:</b> ${esc(term.example)}\n\n` +
    `👑 اعضای VIP همه کارت‌ها + راهنمای کامل اجرا را دریافت می‌کنند — عضویت: @Aineobet_bot`;

  let ok = (await tgSendPhotoTo(chatId, photo, caption, `bet-lesson-${(dayIndex + slot) % BET_TERMS.length}.png`)).ok;
  if (ok) {
    await commitBroadcast(claimKey, true, `public:${chatId}:${term.term}`);
  } else if (!force) {
    await releaseBroadcast(claimKey); // اسلات از دست نرود — ریتیپ تیک بعدی
  }
  return { ok, detail: ok ? `lesson-sent:${term.term}` : "send-failed" };
}

export const sendBetTermLesson = withFunnelLock(sendBetTermLessonInner);

/**
 * v18.1 — خبرهای مهم فوتبال (۰۹:۳۰ و ۱۶:۳۰ تهران):
 * کانال دوزبانه است — پوستر آرکید انگلیسی خالص + کپشن فارسی کامل با ترجمه خبرهای مهم.
 * slot: ۰ یا ۱ — شکست وایر = skip بی‌صدا (بدون پیام خطا به کانال).
 * v18.4 — claim اتمی استمپ قبل از ارسال + قفل funnel — ریشه ارسال تکراری خبرها.
 */
async function sendFootballNewsInner(force = false, slot = 0): Promise<{ ok: boolean; detail: string }> {
  const token = await botToken();
  if (!token) return { ok: false, detail: "NO_TOKEN" };
  const chatId = await publicChannelId();
  if (!chatId) return { ok: false, detail: "NO_PUBLIC_CHANNEL" };

  // v19.0 — ادعای اتمی اسلات خبر (INSERT-first): NEWS:<day>:<slot> — اتمیک در سطح SQLite،
  // ایمن در برابر هر تعداد پردازه/ری‌استارت (ریشه ریشه‌ای ارسال تکراری خبرها)
  const claimKey = dedupeKeyOf.news(tehranDayKey(), slot);
  if (!force) {
    const claimed = await claimBroadcast(claimKey, null, "FOOTBALL_NEWS");
    if (!claimed) return { ok: false, detail: "ALREADY_SENT_THIS_SLOT" };
    await setSetting(`${KEY_NEWS_LAST}:${slot}`, `${tehranDayKey()}:${slot}`).catch(() => undefined);
  }

  const items = await fetchSoccerNews(8);
  if (items.length === 0) {
    // وایر خالی → claim را آزاد کن تا اسلات خبر در تیک بعدی دوباره تلاش شود
    if (!force) await releaseBroadcast(claimKey);
    return { ok: false, detail: "WIRE_EMPTY" };
  }

  const dateLabelEn = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Tehran" }).format(new Date());
  const photo = await renderNewsBoardPNG({
    dateLabelEn,
    items: items.slice(0, 6).map((n) => ({ headline: n.headline, timeEn: newsTimeEn(n.published) })),
  });

  // v18.1 — ترجمه فارسی خبرهای مهم: کپشن فقط فارسی کامل است؛ تیتر انگلیسی فقط روی پوستر می‌ماند
  const fa = await translateNewsBatch(items);
  const faList = items
    .slice(0, 4)
    .map((n, i) => {
      const t = fa[i];
      const head = t?.headlineFa && t.headlineFa.trim().length > 0 ? t.headlineFa.trim() : n.headline;
      const sum = t?.summaryFa && t.summaryFa.trim().length > 0 ? `\n   <i>${esc(t.summaryFa.trim())}</i>` : "";
      return `${faNum(i + 1, 0)}. <b>${esc(head)}</b>${sum}`;
    })
    .join("\n\n");

  const caption =
    `📰 <b>خلاصه خبرهای مهم فوتبال — وایر ESPN</b>\n📅 ${newsDateFa()}\n\n` +
    `${faList}\n\n` +
    `🧠 <b>حواشی مهم:</b> خبرها ورودی تصمیم‌اند، نه سیگنال — ترکیب‌ها، مصدومان و حواشی در محاسبات لامبدای موتور لحاظ می‌شوند. تیترهای روی پوستر به‌صورت بین‌المللی (انگلیسی) چاپ می‌شوند تا با منبع رسمی ESPN یک‌به‌یک قابل راستی‌آزمایی باشند.` +
    `\n👑 برای دریافت کارت‌های تاییدشده سوپروایزر: @Aineobet_bot`;

  let ok = (await tgSendPhotoTo(chatId, photo, caption, `news-board-${tehranDayKey()}-${slot}.png`)).ok;
  if (ok) {
    await commitBroadcast(claimKey, true, `public:${chatId}:items=${Math.min(6, items.length)}:fa=1`);
  } else if (!force) {
    await releaseBroadcast(claimKey); // اسلات از دست نرود — ریتیپ تیک بعدی
  }
  return { ok, detail: ok ? `news-sent:${items.length} headlines:fa-translated` : "send-failed" };
}

export const sendFootballNews = withFunnelLock(sendFootballNewsInner);

/**
 * v18.0 — گزارش هفتگی (جمعه ۲۲:۰۰ تهران → هر دو کانال):
 * KPIهای ۷ روز اخیر با افراز مجزای خطوط تولید + بهترین روز + بانک ۱۰۰۰ واحدی.
 */
async function sendWeeklyDigestInner(force = false): Promise<{ ok: boolean; detail: string }> {
  const [pub, vip] = await Promise.all([publicChannelId(), channelId()]);
  if (!pub && !vip) return { ok: false, detail: "NO_CHANNEL" };

  const weekKey = tehranDayKey(); // یک‌بار در هفته جمعه — کلید = روز جمعه
  // v19.0 — ادعای اتمی هفتگی (INSERT-first): WEEKLY:<week>
  const weeklyClaim = dedupeKeyOf.weekly(weekKey);
  if (!force && !(await claimBroadcast(weeklyClaim, null, "WEEKLY_DIGEST"))) return { ok: false, detail: "ALREADY_SENT_THIS_WEEK" };

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const rows = await db.issuedSlip.findMany({
    where: {
      supervisorApproved: true,
      retroIssued: false,
      status: { in: ["WON_A", "WON_B", "DOUBLE_WIN", "MIDDLE_TRAP"] },
      settledAt: { not: null, gte: weekAgo },
    },
    select: { status: true, netProfit: true, productLine: true, settledAt: true },
  });

  const settled = rows.length;
  const wins = rows.filter((r) => r.status !== "MIDDLE_TRAP").length;
  const winRate = settled > 0 ? (wins / settled) * 100 : 0;
  const net = rows.reduce((a, r) => a + (r.netProfit ?? 0), 0);
  const jackpots = rows.filter((r) => r.status === "DOUBLE_WIN").length;
  const tierNetOf = (line: string) => rows.filter((r) => (r.productLine ?? "SINGLE") === line).reduce((a, r) => a + (r.netProfit ?? 0), 0);

  // بهترین روز هفته (کلید روز تهران)
  const dayMap = new Map<string, number>();
  for (const r of rows) {
    if (!r.settledAt) continue;
    const k = tehranDayKey(r.settledAt);
    dayMap.set(k, (dayMap.get(k) ?? 0) + (r.netProfit ?? 0));
  }
  let bestDay: { label: string; net: number } | null = null;
  for (const [k, netDay] of dayMap.entries()) {
    if (!bestDay || netDay > bestDay.net) bestDay = { label: k, net: netDay };
  }

  const bankNow = 1000 + (await channelKpis()).netProfit;
  const weekLabelEn = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", timeZone: "Asia/Tehran" }).format(weekAgo) + " – " + new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Tehran" }).format(now);

  const photo = await renderWeeklyDigestPNG({
    weekLabelEn,
    settled,
    winRatePct: winRate,
    netProfit: net,
    jackpots,
    bestDay: bestDay ? { label: bestDay.label, net: bestDay.net } : null,
    tierNet: { single: tierNetOf("SINGLE"), combo: tierNetOf("COMBO"), sniper: tierNetOf("SNIPER") },
    bankNow,
  });

  const caption =
    `🗓 <b>NEOBET QUANT PRO — گزارش هفتگی ${weekLabelEn}</b>\n\n` +
    `🧾 کارت‌های تسویه‌شده: <b>${settled}</b> · وین‌ریت هفته: <b>${winRate.toFixed(1)}٪</b> · جکپات طلایی: <b>${jackpots}</b>\n` +
    `💰 سود خالص هفته: <b>${net >= 0 ? "+" : ""}${net.toFixed(1)} واحد</b> (افراز مجزا: تک‌بازی ${tierNetOf("SINGLE").toFixed(1)} · میکس ${tierNetOf("COMBO").toFixed(1)} · اسنایپر ${tierNetOf("SNIPER").toFixed(1)})\n` +
    `📈 بانک ۱۰۰۰ واحدی: <b>${bankNow.toFixed(1)} واحد</b>\n\n` +
    `🛡️ فقط کارت‌های تاییدشده سوپروایزر و تسویه رسمی ESPN — بدون شبیه‌سازی، بدون کارت کاغذی.\n` +
    `👑 عضویت VIP: @Aineobet_bot`;

  const targets = [...new Set([pub, vip].filter((x): x is string => Boolean(x)))];
  let okAny = false;
  for (const chatId of targets) {
    let ok = (await tgSendPhotoTo(chatId, photo, caption, `weekly-digest-${weekKey}.png`)).ok;
    if (ok) okAny = true;
  }
  if (okAny) {
    await setSetting(KEY_WEEKLY_LAST, weekKey);
    await commitBroadcast(weeklyClaim, true, `targets:${targets.join("|")}:settled=${settled}`);
  } else {
    await releaseBroadcast(weeklyClaim);
  }
  return { ok: okAny, detail: okAny ? `weekly-sent:settled=${settled}:net=${net.toFixed(1)}` : "send-failed" };
}

export const sendWeeklyDigest = withFunnelLock(sendWeeklyDigestInner);

/** وضعیت خط لوله کانال‌ها برای کنسول ایجنت مدیر کانال (v13.5 + v18.0 + v18.3 per-slot) */
export async function funnelStatus() {
  const [pub, vip, radarDay, pnlDay, giftDay, lastAd, digestDay, briefDay, eduStamp0, eduStamp1, newsStamp0, newsStamp1, weeklyWeek, stats] = await Promise.all([
    publicChannelId(),
    channelId(),
    getSetting(KEY_FUNNEL_RADAR_DAY),
    getSetting(KEY_FUNNEL_PNL_DAY),
    getSetting(KEY_FUNNEL_GIFT_DAY),
    getSetting(KEY_MARKETING_LAST_AD),
    getSetting(KEY_LAST_DIGEST_DAY),
    getSetting(KEY_VIP_BRIEF_DAY),
    getSetting(`${KEY_EDU_LAST}:0`),
    getSetting(`${KEY_EDU_LAST}:1`),
    getSetting(`${KEY_NEWS_LAST}:0`),
    getSetting(`${KEY_NEWS_LAST}:1`),
    getSetting(KEY_WEEKLY_LAST),
    funnelRadarStats(),
  ]);
  const counts = await db.telegramOutbox.groupBy({ by: ["kind"], where: { kind: { startsWith: "FUNNEL" } }, _count: { kind: true } });
  const adCounts = await db.telegramOutbox.groupBy({ by: ["kind"], where: { kind: { in: ["MARKETING_AD", "VIP_BRIEF", "BET_TERM", "FOOTBALL_NEWS", "WEEKLY_DIGEST"] } }, _count: { kind: true } });
  const recent = await db.telegramOutbox.findMany({ where: { kind: { in: ["FUNNEL_RADAR", "FUNNEL_TEASER", "FUNNEL_GIFT", "FUNNEL_UNBLUR", "FUNNEL_PNL", "MARKETING_AD", "DAILY_DIGEST", "WINRATE", "VIP_BRIEF", "BET_TERM", "FOOTBALL_NEWS", "WEEKLY_DIGEST"] } }, orderBy: { createdAt: "desc" }, take: 18, select: { kind: true, ok: true, detail: true, createdAt: true } });
  return {
    publicChannel: pub,
    vipChannel: vip,
    today: tehranDayKey(),
    radarSentToday: radarDay === tehranDayKey(),
    pnlSentToday: pnlDay === tehranDayKey(),
    giftSentToday: giftDay === tehranDayKey(),
    digestSentToday: digestDay === tehranDayKey(),
    briefSentToday: briefDay === tehranDayKey(),
    lastEduStamps: [eduStamp0, eduStamp1],
    eduSentThisSlot: [eduStamp0, eduStamp1].some((s) => s != null && s.startsWith(`${tehranDayKey()}:`)),
    lastNewsStamps: [newsStamp0, newsStamp1],
    newsSentThisSlot: [newsStamp0, newsStamp1].some((s) => s != null && s.startsWith(`${tehranDayKey()}:`)),
    weeklySentThisWeek: weeklyWeek != null && weeklyWeek.length > 0,
    lastWeeklyWeek: weeklyWeek,
    lastAdStamp: lastAd,
    adSentThisHour: lastAd === `${tehranDayKey()}:${tehranHour()}`,
    stats,
    sentCounts: Object.fromEntries([...counts, ...adCounts].map((c) => [c.kind, c._count.kind])),
    recent,
  };
}
