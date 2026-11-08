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
import { generateFootballCardImage, generateLockerRoomImage, generateTrophyImage } from "./slip-images";
import type { IssuedSlip } from "@prisma/client";

// ═════════════════════ تنظیمات (Setting + env) ═════════════════════

const KEY_TOKEN = "telegram_bot_token";
const KEY_CHANNEL = "telegram_channel_id";
/** v9.0 — کلید سوییچ ارسال خودکار کارت‌های تایید سوپروایزر (پیش‌فرض: روشن) */
const KEY_AUTODISPATCH = "telegram_autodispatch";

/** v8.0 — کانال پیش‌فرض رسمی کانال VIP کارفرما (در صورت خالی بودن تنظیمات) */
export const DEFAULT_VIP_CHANNEL = "@aineobet";

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

export async function telegramStatus(): Promise<{ configured: boolean; channelSet: boolean }> {
  const [token, channel] = await Promise.all([botToken(), channelId()]);
  return { configured: Boolean(token), channelSet: Boolean(channel) };
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

async function tgSendPhoto(
  photo: Buffer,
  caption: string,
  filename = "slip-card.png"
): Promise<{ ok: boolean; detail: string }> {
  const token = await botToken();
  const chatId = await channelId();
  if (!token) return { ok: false, detail: "NO_TOKEN" };
  if (!chatId) return { ok: false, detail: "NO_CHANNEL" };
  try {
    const form = new FormData();
    form.append("chat_id", chatId);
    form.append("caption", caption.slice(0, 1024));
    form.append("parse_mode", "HTML");
    form.append("photo", new Blob([new Uint8Array(photo)], { type: "image/png" }), filename);
    const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, { method: "POST", body: form });
    const json = (await res.json()) as { ok?: boolean; description?: string; result?: { message_id?: number } };
    if (json.ok) return { ok: true, detail: `photo:${json.result?.message_id ?? "?"}` };
    return { ok: false, detail: json.description ?? `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : "network error" };
  }
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
  const lines: string[] = [];
  lines.push(`⚽️ <b>فوتبال‌کوانت — فلش‌کارت تیپ مکمل</b>`);
  lines.push(`🏆 <b>${esc(slip.homeTeam)}</b> × <b>${esc(slip.awayTeam)}</b>`);
  lines.push(`📡 ${esc(slip.league)} · ⏰ ${kickoff}`);
  if (slip.archetype) lines.push(`📐 الگو: ${esc(slip.archetype)}`);
  lines.push("");
  lines.push(`🔹 <b>تیپ A</b> (ضریب ${slip.oddsA.toFixed(2)}): ${esc(slip.labelA)}`);
  lines.push(`💵 مبلغ داچینگ A: <b>${slip.stakeA.toFixed(1)}</b> واحد`);
  lines.push("");
  lines.push(`🟢 <b>تیپ B مکمل</b> (ضریب ${slip.oddsB.toFixed(2)}): ${esc(slip.labelB)}`);
  lines.push(`💵 مبلغ داچینگ B: <b>${slip.stakeB.toFixed(1)}</b> واحد`);
  lines.push("");
  lines.push(`💰 سود تضمینی پوشش: <b>+${slip.guaranteedProfit.toFixed(1)}%</b> (مجموع استیک ۱۰۰ واحد)`);
  lines.push(`🔐 هش راستی‌آزمایی SHA-256:\n<code>${slip.hash.slice(0, 32)}</code>`);
  if (slip.espnUrl) lines.push(`🔎 <a href="${slip.espnUrl}">لینک راستی‌آزمایی رسمی ESPN</a>`);
  lines.push("");
  lines.push(`⚖️ ابزار تحلیل کمّی — مسئولیت استفاده با کاربر است.`);
  return lines.join("\n");
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
  const status = await telegramStatus();
  if (!status.configured || !status.channelSet) {
    await logOutbox(slip.id, mode, false, "TELEGRAM_NOT_CONFIGURED");
    return { ok: false, detail: "TELEGRAM_NOT_CONFIGURED", preview };
  }

  const photo = await generateFootballCardImage({
    homeTeam: slip.homeTeam,
    awayTeam: slip.awayTeam,
    league: slip.league,
    hashShort: slip.hash.slice(0, 8),
  });

  let result: { ok: boolean; detail: string };
  if (photo) {
    result = await tgSendPhoto(photo, preview, `slip-${slip.hash.slice(0, 10)}.png`);
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
 */
export async function sendSettlementNotification(slip: IssuedSlip): Promise<boolean> {
  const status = await telegramStatus();
  if (!status.configured || !status.channelSet) return false;
  if (slip.homeGoals === null || slip.awayGoals === null) return false;

  const r = slipResultLabel(slip.status);
  const caption = buildResultMessage(slip);
  const score = `${slip.homeGoals}−${slip.awayGoals}`;

  const photo = r.win
    ? await generateTrophyImage({ homeTeam: slip.homeTeam, awayTeam: slip.awayTeam, score })
    : await generateLockerRoomImage({ homeTeam: slip.homeTeam, awayTeam: slip.awayTeam, score });

  let ok = false;
  if (photo) {
    ok = (await tgSendPhoto(photo, caption, `${r.win ? "trophy" : "locker"}-${slip.hash.slice(0, 10)}.png`)).ok;
  } else {
    ok = (await tgCall("sendMessage", { chat_id: await channelId(), text: caption, parse_mode: "HTML", disable_web_page_preview: true })).ok;
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
  const settled = await db.issuedSlip.findMany({
    where: { status: { in: ["WON_A", "WON_B", "DOUBLE_WIN", "MIDDLE_TRAP"] } },
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
  return { ...st, winRatePct, netPct, netProfit: Math.round(st.netProfit * 100) / 100 };
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
  const [pendingCards, pendingResults, autoDispatch, tg] = await Promise.all([
    db.issuedSlip.findMany({
      where: { status: { in: ["PENDING", "LIVE"] }, telegramCard: false, supervisorApproved: true },
      orderBy: { kickoff: "asc" },
      take: 8,
    }),
    db.issuedSlip.findMany({
      where: { status: { in: ["WON_A", "WON_B", "DOUBLE_WIN", "MIDDLE_TRAP"] }, telegramResult: false, supervisorApproved: true },
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
  const [tg, autoOn] = await Promise.all([telegramStatus(), getAutoDispatch()]);
  const skippedVetoed = await db.issuedSlip.count({ where: { supervisorApproved: false, telegramCard: false } });

  if (!tg.configured || !tg.channelSet) {
    return { ok: false, sentCards: 0, sentResults: 0, winRateSent: false, skippedVetoed, detail: "TELEGRAM_NOT_CONFIGURED" };
  }
  if (!autoOn) {
    return { ok: false, sentCards: 0, sentResults: 0, winRateSent: false, skippedVetoed, detail: "AUTO_DISPATCH_OFF" };
  }

  let sentCards = 0;
  let sentResults = 0;

  // ─── مرحله ۱: پست پیش از بازی — فقط کارت‌های 👑 تاییدشده سوپروایزر ───
  const cards = await db.issuedSlip.findMany({
    where: { status: { in: ["PENDING", "LIVE"] }, telegramCard: false, supervisorApproved: true },
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

  // ─── مرحله ۲: پست تسویه‌حساب پس از بازی — برگه نتیجه FT ───
  const results = await db.issuedSlip.findMany({
    where: { status: { in: ["WON_A", "WON_B", "DOUBLE_WIN", "MIDDLE_TRAP"] }, telegramResult: false, supervisorApproved: true },
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
 * پیام نوع دوم (بخش وین‌ریت): به‌روزرسانی وین‌ریت کل کانال پس از تسویه.
 * از موتور تسویه (settleFinishedSlips) و صف خودکار فراخوانی می‌شود — throttle ۱۰ دقیقه.
 */
export async function sendWinRateReport(force = false): Promise<boolean> {
  if (!force && Date.now() - lastWinRateAt < 10 * 60_000) return false;
  const status = await telegramStatus();
  if (!status.configured || !status.channelSet) return false;
  const st = await channelWinRateStats();
  const res = await tgCall("sendMessage", {
    chat_id: await channelId(),
    text: buildWinRateReportMessage(st),
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });
  if (res.ok) {
    lastWinRateAt = Date.now();
    await logOutbox(null, "WINRATE", true, "sent");
  }
  return res.ok;
}
