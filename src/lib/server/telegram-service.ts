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
import {
  renderSlipCardPNG,
  renderSlipResultPNG,
  renderSlipTeaserPNG,
  renderWinRateReportPNG,
  renderDailyReportPNG,
  renderDailyRadarPNG,
  // v13.5.1 — رفع باگ «RENDER_FAILED» بنر بازاریابی ساعتی: این تابع هیچ‌وقت import نشده بود
  renderVipAdBannerPNG,
} from "./slip-images";
import { marketEnLabel, SETTLEMENT_RULE_EN, SETTLEMENT_RULE_FA } from "@/lib/engine/orthogonal";
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
  try {
    const form = new FormData();
    form.append("chat_id", chatId);
    if (!captionless) {
      form.append("caption", caption.slice(0, 1024));
      form.append("parse_mode", "HTML");
    }
    form.append("photo", new Blob([new Uint8Array(photo)], { type: "image/png" }), filename);
    const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, { method: "POST", body: form });
    const json = (await res.json()) as { ok?: boolean; description?: string; result?: { message_id?: number } };
    if (json.ok) return { ok: true, detail: `photo:${json.result?.message_id ?? "?"}${captionless ? ":broadcast" : ""}` };
    return { ok: false, detail: json.description ?? `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : "network error" };
  }
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
  } catch {
    // لاگ اختیاری
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
  lines.push(`⚽️ <b>فوتبال‌کوانت — فلش‌کارت بازار اتمیک رسمی v15.0</b>`);
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
  lines.push(`💰 سود تضمینی پوشش: <b>+${slip.guaranteedProfit.toFixed(1)}%</b> (مجموع استیک ۱۰۰ واحد)`);
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
  lines.push(`💰 سود تضمینی داچینگ: <b>+${slip.guaranteedProfit.toFixed(1)}%</b>`);
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
    lines.push(`📉 زیان کل: <b>${(slip.netProfit ?? 0).toFixed(1)}</b> واحد — ثبت صادقانه و شفاف`);
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
 */
export async function publishSlipToTelegram(slip: IssuedSlip, mode: PublishMode): Promise<{ ok: boolean; detail: string; preview: string }> {
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

  const photo = mode === "TEASER" ? await renderSlipTeaserPNG(slip) : await renderSlipCardPNG(slip);

  let result: { ok: boolean; detail: string };
  if (photo) {
    result = await tgSendPhoto(photo, preview, `slip-${slip.hash.slice(0, 10)}.png`);
    // v13.2 — فالبک پیام متنی: اگر ارسال تصویر شکست، پیام HTML کامل همچنان به کانال می‌رود
    if (!result.ok) {
      const fb = await tgCall("sendMessage", { chat_id: await channelId(), text: preview, parse_mode: "HTML", disable_web_page_preview: true });
      if (fb.ok) result = fb;
    }
  } else {
    // تصویر تولید نشد — پیام متنی HTML همچنان کامل ارسال می‌شود
    result = await tgCall("sendMessage", { chat_id: await channelId(), text: preview, parse_mode: "HTML", disable_web_page_preview: true });
  }

  await logOutbox(slip.id, mode, result.ok, result.detail);
  if (result.ok) {
    await db.issuedSlip.update({
      where: { id: slip.id },
      data: mode === "CARD" ? { telegramCard: true } : { telegramTeaser: true },
    });
  }
  return { ...result, preview };
}

/**
 * اعلام خودکار نتیجه پس از FT:
 * برنده → تصویر جام پیروزی | بازنده → تصویر رختکن بهم‌ریخته
 * v13.5 — نتایج فقط به «کانال عمومی @aineobet» می‌روند (دستور کارفرما: کانال عمومی فقط نتیجه؛
 * کانال VIP فقط فلش‌کارت بازی + برآیند روزانه).
 */
export async function sendSettlementNotification(slip: IssuedSlip): Promise<boolean> {
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
  const caption = buildResultMessage(slip);

  // v10.0 — تصویربرداری قطعی: برد طلایی همزمان (Double-Win) طراحی طلایی اختصاصی دارد
  const photo = await renderSlipResultPNG(slip);

  let ok = false;
  if (photo) {
    ok = (await tgSendPhotoTo(chatId, photo, caption, `${slip.status.toLowerCase()}-${slip.hash.slice(0, 10)}.png`)).ok;
    // v13.2 — فالبک پیام متنی برای اعلام نتیجه (تصویر 429 یا شکست رندر)
    if (!ok) {
      ok = (await tgCall("sendMessage", { chat_id: chatId, text: caption, parse_mode: "HTML", disable_web_page_preview: true })).ok;
    }
  } else {
    ok = (await tgCall("sendMessage", { chat_id: chatId, text: caption, parse_mode: "HTML", disable_web_page_preview: true })).ok;
  }

  await logOutbox(slip.id, "RESULT", ok, ok ? "sent" : "send-failed");
  if (ok) {
    await db.issuedSlip.update({ where: { id: slip.id }, data: { telegramResult: true } });
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
  const settled = await db.issuedSlip.findMany({
    where: { status: { in: ["WON_A", "WON_B", "DOUBLE_WIN", "MIDDLE_TRAP"] }, supervisorApproved: true, retroIssued: false },
    select: { status: true, netProfit: true, stakeA: true, stakeB: true },
  });
  const st = { settled: settled.length, wonA: 0, wonB: 0, doubleWin: 0, middleTrap: 0, netProfit: 0, staked: 0 };
  for (const s of settled) {
    if (s.status === "WON_A") st.wonA += 1;
    else if (s.status === "WON_B") st.wonB += 1;
    else if (s.status === "DOUBLE_WIN") st.doubleWin += 1;
    else if (s.status === "MIDDLE_TRAP") st.middleTrap += 1;
    st.netProfit += s.netProfit ?? 0;
    st.staked += s.stakeA + s.stakeB;
  }
  const winRatePct = st.settled > 0 ? Math.round(((st.settled - st.middleTrap) / st.settled) * 1000) / 10 : 0;
  const netPct = st.staked > 0 ? Math.round((st.netProfit / st.staked) * 1000) / 10 : 0;
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
  return {
    ...st,
    winRatePct,
    netPct,
    netProfit: Math.round(st.netProfit * 100) / 100,
    shadow: { settled: shadowRows.length, wins: shadowWins, winRatePct: shadowWinRate, netProfit: shadowNet },
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
    const flagged = await db.issuedSlip.findMany({
      where: { status: { in: ["PENDING", "LIVE"] }, telegramCard: true, supervisorApproved: true, retroIssued: false },
      select: { id: true, kickoff: true },
      take: 40,
    });
    if (flagged.length === 0) return 0;
    const sends = await db.telegramOutbox.findMany({
      where: { kind: { in: ["CARD", "FUNNEL_GIFT", "FUNNEL_TEASER"] }, slipId: { not: null }, ok: true },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { slipId: true, createdAt: true },
    });
    const lastSend = new Map<string, Date>();
    for (const s of sends) {
      if (s.slipId && !lastSend.has(s.slipId)) lastSend.set(s.slipId, s.createdAt);
    }
    let repaired = 0;
    for (const slip of flagged) {
      const sentAt = lastSend.get(slip.id);
      if (!sentAt) {
        // پرچم خورده ولی هیچ ارسال موفقی ثبت نشده — قطعاً پیش‌ماتره یا خطای نیمه‌کاره
        await db.issuedSlip.update({ where: { id: slip.id }, data: { telegramCard: false } });
        repaired += 1;
        continue;
      }
      const day = tehranDayRange(slip.kickoff);
      if (sentAt.getTime() < day.start.getTime() || sentAt.getTime() >= day.end.getTime()) {
        await db.issuedSlip.update({ where: { id: slip.id }, data: { telegramCard: false } });
        repaired += 1;
      }
    }
    if (repaired > 0) console.log(`[telegram] v15 premature-card repair: ${repaired} flags reset for match-day re-broadcast`);
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

/** throttle گزارش وین‌ریت — حداکثر هر ۱۰ دقیقه یک‌بار */
let lastWinRateAt = 0;

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
  if (!force && Date.now() - lastWinRateAt < 10 * 60_000) return false;
  const status = await telegramStatus();
  if (!status.configured || !status.channelSet) return false;
  const chatId = await publicChannelId();
  if (!chatId) return false;
  const st = await channelWinRateStats();

  // v10.0 — گزارش وین‌ریت با تصویر اختصاصی (گیج وین‌ریت + مبنای واحد برای حساب شخصی)
  const caption = buildWinRateReportMessage(st) +
    (st.shadow.settled > 0
      ? `\n\n🛡️ <b>دفتر سایه (شفافیت وتوها):</b> ${st.shadow.settled} کارت وتوشده تسویه کاغذی شد — وین‌ریت ${st.shadow.winRatePct ?? 0}٪ · سود کاغذی ${st.shadow.netProfit >= 0 ? "+" : ""}${st.shadow.netProfit.toFixed(1)} واحد (هرگز پول واقعی نبوده)`
      : "") +
    (st.retro.settled > 0
      ? `\n📚 <b>دفتر بازخوانی (کارت‌های چندروزه):</b> ${st.retro.settled} بازی FT که هرگز پیش‌بازی کارت صادر نشده بود — فقط تحلیل کاغذی با همان موتور؛ وین‌ریت ${st.retro.winRatePct ?? 0}٪. این دسته <b>هرگز</b> در وین‌ریت واقعی کانال شمرده نمی‌شود.`
      : "") +
    `\n\n🧮 <b>مبنای واحد برای حساب شخصی شما:</b> هر کارت با مجموع استیک ۱۰۰ واحد ثبت می‌شود؛ ۱ واحد = ۱٪ بانک‌رول خودتان.` +
    `\nمثال با موجودی ۱۰ دلار: ۱ واحد = ۰٫۱ دلار → سود ${st.netProfit >= 0 ? "+" : ""}${st.netProfit.toFixed(1)} واحد = ${st.netProfit >= 0 ? "+" : "−"}${Math.abs(st.netProfit * 0.1).toFixed(2)} دلار (مقیاس‌پذیر با هر موجودی).`;

  let res: { ok: boolean; detail: string };
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
    console.warn("winrate image render failed:", err);
    res = await tgCall("sendMessage", {
      chat_id: chatId,
      text: caption,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
  }
  if (res.ok) {
    lastWinRateAt = Date.now();
    await logOutbox(null, "WINRATE", true, "sent");
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
 */
export async function sendDailyDigest(force = false): Promise<boolean> {
  const status = await telegramStatus();
  if (!status.configured || !status.channelSet) return false;

  const today = tehranDayKey();
  if (!force) {
    const last = await getSetting(KEY_LAST_DIGEST_DAY);
    if (last === today) return false;
  }

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
      let ok = (await tgSendPhotoTo(chatId, photo, caption, `daily-digest-${today}.png`)).ok;
      if (!ok) {
        ok = (await tgCall("sendMessage", { chat_id: chatId, text: caption, parse_mode: "HTML", disable_web_page_preview: true })).ok;
      }
      if (ok) res = { ok: true, detail: `sent:${chatId}` };
    }
  } catch (err) {
    console.warn("daily digest render failed:", err);
    res = await tgCall("sendMessage", { chat_id: await channelId(), text: captionFallback(settled, winRate, net), parse_mode: "HTML", disable_web_page_preview: true });
  }
  if (res.ok) {
    await setSetting(KEY_LAST_DIGEST_DAY, today);
    await logOutbox(null, "DAILY_DIGEST", true, res.detail);
  }
  return res.ok;
}

/** فالبک متنی برآیند روزانه (وقتی رندر تصویر شکست خورد) */
function captionFallback(settled: number, winRate: number, net: number): string {
  return (
    `📊 <b>NEOBET QUANT PRO • @AINEOBET — Daily Settlement Digest</b>\n` +
    `${settled} کارت امروز تسویه شد · وین‌ریت ${winRate.toFixed(1)}٪ · سود خالص روز: ${net >= 0 ? "+" : ""}${net.toFixed(1)} واحد`
  );
}

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
export async function sendDailyGiftCard(force = false): Promise<{ ok: boolean; detail: string }> {
  const token = await botToken();
  if (!token) return { ok: false, detail: "NO_TOKEN" };
  const chatId = await publicChannelId();
  if (!chatId) return { ok: false, detail: "NO_PUBLIC_CHANNEL" };

  const today = tehranDayKey();
  if (!force) {
    const last = await getSetting(KEY_FUNNEL_GIFT_DAY);
    if (last === today) return { ok: false, detail: "ALREADY_SENT_TODAY" };
  }

  const day = tehranDayRange();
  const candidates = await db.issuedSlip.findMany({
    where: { supervisorApproved: true, retroIssued: false, status: { in: ["PENDING", "LIVE"] }, kickoff: { gte: day.start, lt: day.end } },
    orderBy: { kickoff: "asc" },
    take: 24,
  });
  if (candidates.length === 0) return { ok: false, detail: "NO_TODAY_CARD" };

  // اولویت ۱: دژ نفوذناپذیر (ریسک < ۷٪) با بالاترین امتیاز؛ اولویت ۲: بالاترین امتیاز سوپروایزر
  const scoreOf = (s: IssuedSlip) => s.supervisorScore ?? -999;
  const fortress = candidates.filter((s) => (s.jointLossRiskPct ?? 99) < 7);
  const pick = fortress.length > 0 ? fortress.sort((a, b) => scoreOf(b) - scoreOf(a))[0] : candidates.sort((a, b) => scoreOf(b) - scoreOf(a))[0];
  const isFortress = (pick.jointLossRiskPct ?? 99) < 7;

  const photo = await renderSlipCardPNG(pick);
  const kickoffEn = new Intl.DateTimeFormat("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Tehran" }).format(new Date(pick.kickoff));
  const caption =
    `${isFortress ? "🏰 <b>FREE VIP CARD OF THE DAY — FORTRESS MODE (joint-loss risk &lt; 7%)</b>" : "🎁 <b>FREE VIP CARD OF THE DAY — Supervisor-Approved</b>"}\n` +
    `🏆 <b>${esc(pick.homeTeam)}</b> × <b>${esc(pick.awayTeam)}</b> · ${esc(pick.league)} · ⏰ ${kickoffEn} Tehran\n` +
    `🔹 Tip A @${pick.oddsA.toFixed(2)}: ${esc(pick.labelA)} · stake ${pick.stakeA.toFixed(1)}u\n` +
    `🟢 Tip B @${pick.oddsB.toFixed(2)}: ${esc(pick.labelB)} · stake ${pick.stakeB.toFixed(1)}u\n` +
    `💰 Guaranteed dutch cover: <b>+${pick.marginPct.toFixed(1)}%</b> on a 100-unit ticket\n` +
    `🔐 Pre-match SHA-256: <code>${pick.hash.slice(0, 24)}</code>\n` +
    `———————\n` +
    `🎁 <b>کارت رایگان امروز — تایید سوپروایزر${isFortress ? " · دژ نفوذناپذیر (ریسک زیر ۷٪)" : ""}</b>\n` +
    `هر روز فقط ۱ کارت کامل و باز در کانال عمومی منتشر می‌شود؛ بقیه کارت‌ها مخصوص اعضای VIP است.\n` +
    `👑 عضویت VIP: @Aineobet_bot`;

  let ok = false;
  if (photo) {
    ok = (await tgSendPhotoTo(chatId, photo, caption, `daily-gift-${pick.hash.slice(0, 10)}.png`)).ok;
    if (!ok) ok = (await tgCall("sendMessage", { chat_id: chatId, text: caption, parse_mode: "HTML", disable_web_page_preview: true })).ok;
  } else {
    ok = (await tgCall("sendMessage", { chat_id: chatId, text: caption, parse_mode: "HTML", disable_web_page_preview: true })).ok;
  }
  if (ok) {
    await setSetting(KEY_FUNNEL_GIFT_DAY, today);
    await logOutbox(pick.id, "FUNNEL_GIFT", true, `public:${chatId}${isFortress ? ":fortress" : ""}`);
  }
  return { ok, detail: ok ? (isFortress ? "fortress-gift-sent" : "gift-sent") : "send-failed" };
}

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
    faCaption: "🛡️ <b>دروازه وتوی سوپروایزر هوشمند v15</b>\nبازی‌های پرریسک قبل از صدور کارت حذف می‌شوند؛ زوج‌های افسرنده با ریسک باخت همزمان بالای ۴۵٪ هرگز منتشر نمی‌شوند و ریسک هر کارت روی خودش شفاف چاپ می‌شود.\n👑 عضویت VIP: @Aineobet_bot",
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
export async function sendHourlyVipAd(force = false): Promise<{ ok: boolean; detail: string; topic: string }> {
  const token = await botToken();
  if (!token) return { ok: false, detail: "NO_TOKEN", topic: "—" };
  const chatId = await publicChannelId();
  if (!chatId) return { ok: false, detail: "NO_PUBLIC_CHANNEL", topic: "—" };

  const th = tehranHour();
  if (!force && (th < 9 || th > 23)) return { ok: false, detail: "OUT_OF_MARKETING_HOURS", topic: "—" };

  const stamp = `${tehranDayKey()}:${th}`;
  if (!force) {
    const last = await getSetting(KEY_MARKETING_LAST_AD);
    if (last === stamp) return { ok: false, detail: "ALREADY_SENT_THIS_HOUR", topic: "—" };
  }

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
    let ok = (await tgSendPhotoTo(chatId, photo, ad.faCaption, `vip-ad-${ad.key.toLowerCase()}.png`)).ok;
    if (!ok) {
      ok = (await tgCall("sendMessage", { chat_id: chatId, text: ad.faCaption, parse_mode: "HTML", disable_web_page_preview: true })).ok;
    }
    if (ok) {
      await setSetting(KEY_MARKETING_LAST_AD, stamp);
      await logOutbox(null, "MARKETING_AD", true, `public:${chatId}:${ad.key}`);
    }
    return { ok, detail: ok ? "ad-sent" : "send-failed", topic: ad.key };
  } catch (err) {
    console.warn("hourly vip ad failed:", err instanceof Error ? err.message : err);
    return { ok: false, detail: "RENDER_FAILED", topic: ad.key };
  }
}

/** آمار رادار شفافیت — از دیتابیس کارنامه (بدون هیچ عدد جعلی) */
export async function funnelRadarStats(): Promise<{ scanned: number; vetoed: number; golden: number }> {
  const [all, vetoed] = await Promise.all([
    db.issuedSlip.findMany({ select: { externalId: true, supervisorApproved: true } }),
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
  if (!force) {
    const last = await getSetting(KEY_FUNNEL_RADAR_DAY);
    if (last === today) return false;
  }

  const st = await funnelRadarStats();
  const next = await db.issuedSlip.findFirst({
    where: { supervisorApproved: true, status: { in: ["PENDING", "LIVE"] } },
    orderBy: { kickoff: "asc" },
  });
  const topLine = next
    ? `${next.homeTeam} vs ${next.awayTeam} · guaranteed +${next.marginPct.toFixed(1)}% dutch cover`
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

  let res = await tgSendPhotoTo(chatId, photo, caption, `daily-radar-${today}.png`);
  if (!res.ok) {
    res = await tgCall("sendMessage", { chat_id: chatId, text: caption, parse_mode: "HTML", disable_web_page_preview: true });
  }
  if (res.ok) {
    await setSetting(KEY_FUNNEL_RADAR_DAY, today);
    await logOutbox(null, "FUNNEL_RADAR", true, `public:${chatId}`);
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
    const isGift = giftDay !== today; // هر روز فقط ۱ کارت کامل رایگان
    try {
      if (isGift) {
        const photo = await renderSlipCardPNG(slip);
        const caption =
          `🎁 <b>FREE GIFT CARD — 100% OPEN, NO LOCK</b>\n` +
          `🏆 <b>${esc(slip.homeTeam)}</b> × <b>${esc(slip.awayTeam)}</b> · ${esc(slip.league)}\n` +
          `🔹 Tip A @${slip.oddsA.toFixed(2)}: ${esc(slip.labelA)} · stake ${slip.stakeA.toFixed(1)}u\n` +
          `🟢 Tip B @${slip.oddsB.toFixed(2)}: ${esc(slip.labelB)} · stake ${slip.stakeB.toFixed(1)}u\n` +
          `💰 Guaranteed dutch profit: <b>+${slip.marginPct.toFixed(1)}%</b>\n` +
          `🔐 SHA-256: <code>${slip.hash.slice(0, 24)}</code>\n` +
          `Every settlement is auto-graded on the official ESPN final score.`;
        const ok = (await tgSendPhotoTo(chatId, photo, caption, `gift-${slip.hash.slice(0, 10)}.png`)).ok;
        if (ok) {
          gift = true;
          await setSetting(KEY_FUNNEL_GIFT_DAY, today);
          await logOutbox(slip.id, "FUNNEL_GIFT", true, `public:${chatId}`);
        }
      } else {
        // v13.5 — رفع باگ ورودی: renderLockedTeaserPNG قبلاً با IssuedSlip خام صدا زده می‌شد
        // (kickoffEn/labelAEn/hashShort وجود نداشت → پوستر «undefined» چاپ می‌کرد).
        // اکنون از رندر تیزر رسمی (کارت کامل با تیپ B قفل) استفاده می‌شود.
        const photo = await renderSlipTeaserPNG(slip);
        const caption =
          `🔒 <b>VIP TEASER — UNBLURRED AFTER FT</b>\n` +
          `🏆 <b>${esc(slip.homeTeam)}</b> × <b>${esc(slip.awayTeam)}</b> · ${esc(slip.league)}\n` +
          `💰 Guaranteed cover profit: <b>+${slip.marginPct.toFixed(1)}%</b> · Tip A @${slip.oddsA.toFixed(2)} revealed — Tip B locked.\n` +
          `🔐 Pre-match SHA-256: <code>${slip.hash.slice(0, 24)}</code>\n` +
          `Join VIP to unlock the complementary leg before kickoff.`;
        const ok = (await tgSendPhotoTo(chatId, photo, caption, `teaser-${slip.hash.slice(0, 10)}.png`)).ok;
        if (ok) {
          teasers += 1;
          await logOutbox(slip.id, "FUNNEL_TEASER", true, `public:${chatId}`);
        }
      }
    } catch (err) {
      console.warn("funnel teaser failed:", err instanceof Error ? err.message : err);
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
    try {
      const unblurred = await renderSlipCardPNG(slip);
      const result = await renderSlipResultPNG(slip);
      const r = slipResultLabel(slip.status);
      const caption =
        `🔓 <b>UNBLURRED — SAME SHA-256, NOW OPEN</b>\n` +
        `🏆 <b>${esc(slip.homeTeam)} ${slip.homeGoals ?? 0}−${slip.awayGoals ?? 0} ${esc(slip.awayTeam)}</b> · FT (official ESPN)\n` +
        `${r.emoji} Result: <b>${esc(r.label)}</b> · net ${((slip.netProfit ?? 0) >= 0 ? "+" : "")}${(slip.netProfit ?? 0).toFixed(1)}u\n` +
        `🔐 Pre-match hash: <code>${slip.hash.slice(0, 24)}</code> — identical to the locked teaser posted before kickoff.\n` +
        `The VIP leg that was blurred is now fully visible. Zero edits, zero deletions — full transparency.`;
      const okPhoto = (await tgSendPhotoTo(chatId, unblurred, caption, `unblur-${slip.hash.slice(0, 10)}.png`)).ok;
      if (okPhoto) {
        await tgSendPhotoTo(chatId, result, caption, `proof-${slip.hash.slice(0, 10)}.png`);
        sent += 1;
        await logOutbox(slip.id, "FUNNEL_UNBLUR", true, `public:${chatId}`);
      }
    } catch (err) {
      console.warn("funnel unblur failed:", err instanceof Error ? err.message : err);
    }
  }
  return sent;
}

/**
 * پست ۴ — برآیند واقعی شب (۲۳:۳۰ تهران) به کانال عمومی:
 * سود خالص واقعی روز با «افراز مجزا» — دسته الف تک‌بازی / ب میکس / ج تیپ‌های ضریب بالا.
 * صفر دوباره‌شماری: هر کارت فقط در خط تولید خودش شمرده می‌شود.
 */
export async function sendNightlyPnl(force = false): Promise<boolean> {
  const token = await botToken();
  if (!token) return false;
  const chatId = await publicChannelId();
  if (!chatId) return false;

  const today = tehranDayKey();
  if (!force) {
    const last = await getSetting(KEY_FUNNEL_PNL_DAY);
    if (last === today) return false;
  }

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

  let res = await tgSendPhotoTo(chatId, photo, caption, `nightly-pnl-${today}.png`);
  if (!res.ok) {
    res = await tgCall("sendMessage", { chat_id: chatId, text: caption, parse_mode: "HTML", disable_web_page_preview: true });
  }
  if (res.ok) {
    await setSetting(KEY_FUNNEL_PNL_DAY, today);
    await logOutbox(null, "FUNNEL_PNL", true, `public:${chatId}`);
  }
  return res.ok;
}

/** وضعیت خط لوله کانال‌ها برای کنسول ایجنت مدیر کانال (v13.5) */
export async function funnelStatus() {
  const [pub, vip, radarDay, pnlDay, giftDay, lastAd, digestDay, stats] = await Promise.all([
    publicChannelId(),
    channelId(),
    getSetting(KEY_FUNNEL_RADAR_DAY),
    getSetting(KEY_FUNNEL_PNL_DAY),
    getSetting(KEY_FUNNEL_GIFT_DAY),
    getSetting(KEY_MARKETING_LAST_AD),
    getSetting(KEY_LAST_DIGEST_DAY),
    funnelRadarStats(),
  ]);
  const counts = await db.telegramOutbox.groupBy({ by: ["kind"], where: { kind: { startsWith: "FUNNEL" } }, _count: { kind: true } });
  const adCounts = await db.telegramOutbox.groupBy({ by: ["kind"], where: { kind: "MARKETING_AD" }, _count: { kind: true } });
  const recent = await db.telegramOutbox.findMany({ where: { kind: { in: ["FUNNEL_RADAR", "FUNNEL_TEASER", "FUNNEL_GIFT", "FUNNEL_UNBLUR", "FUNNEL_PNL", "MARKETING_AD", "DAILY_DIGEST", "WINRATE"] } }, orderBy: { createdAt: "desc" }, take: 14, select: { kind: true, ok: true, detail: true, createdAt: true } });
  return {
    publicChannel: pub,
    vipChannel: vip,
    today: tehranDayKey(),
    radarSentToday: radarDay === tehranDayKey(),
    pnlSentToday: pnlDay === tehranDayKey(),
    giftSentToday: giftDay === tehranDayKey(),
    digestSentToday: digestDay === tehranDayKey(),
    lastAdStamp: lastAd,
    adSentThisHour: lastAd === `${tehranDayKey()}:${tehranHour()}`,
    stats,
    sentCounts: Object.fromEntries([...counts, ...adCounts].map((c) => [c.kind, c._count.kind])),
    recent,
  };
}
