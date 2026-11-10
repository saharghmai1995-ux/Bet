// ─────────────────────────────────────────────────────────────────────────────
// 📡 لایه ارتباط با Bot API تلگرام (معادل ۱:۱ بخش ۶ پایتون) + دانلود فیش عکس
// ─────────────────────────────────────────────────────────────────────────────

import type { BotConfig } from "./config";

export interface TgResult<T = unknown> {
  ok: boolean;
  result?: T;
  description?: string;
}

/** فراخوانی عمومی API — اگر توکن تنظیم نشده باشد بی‌صدا null برمی‌گرداند (مثل پایتون) */
export async function tgApiCall<T = unknown>(
  cfg: BotConfig,
  method: string,
  payload: Record<string, unknown>,
  timeoutMs = 15_000
): Promise<TgResult<T> | null> {
  if (!cfg.botToken || cfg.botToken.includes("YOUR_")) return null;
  try {
    const res = await fetch(`https://api.telegram.org/bot${cfg.botToken}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
    return (await res.json()) as TgResult<T>;
  } catch (exc) {
    console.warn(`[WARN] Telegram API ${method} error: ${exc}`);
    return null;
  }
}

export type MemberStatus = "creator" | "administrator" | "member" | "restricted" | "left" | "kicked";

/** بررسی عضویت کاربر در کانال عمومی — خطای API = true (رفتار fail-open پایتون) */
export async function isUserInPublicChannel(cfg: BotConfig, userId: number): Promise<boolean> {
  const res = await tgApiCall<{ status?: MemberStatus }>(cfg, "getChatMember", {
    chat_id: cfg.publicChannelUsername,
    user_id: userId,
  });
  if (!res || !res.ok) return true;
  const status = res.result?.status ?? "left";
  return ["creator", "administrator", "member", "restricted"].includes(status);
}

/** لینک دعوت یک‌بارمصرف VIP (member_limit=1، انقضای ۴۸ ساعته) */
export async function createSingleUseVipInviteLink(
  cfg: BotConfig,
  userId: number,
  days: number
): Promise<string> {
  const expireTs = Math.floor((Date.now() + 48 * 3_600_000) / 1000);
  const res = await tgApiCall<{ invite_link?: string }>(cfg, "createChatInviteLink", {
    chat_id: cfg.vipChannelId,
    name: `VIP_User_${userId}_${days}d`,
    expire_date: expireTs,
    member_limit: 1,
  });
  if (res && res.ok && res.result?.invite_link) return res.result.invite_link;
  return "https://t.me/+YourPrivateVIPFallbackLink";
}

/** دریافت مسیر فایل تلگرام برای فیش عکس (admin panel نمایش فیش) */
export async function getTelegramFilePath(cfg: BotConfig, fileId: string): Promise<string | null> {
  const res = await tgApiCall<{ file_path?: string }>(cfg, "getFile", { file_id: fileId });
  if (res && res.ok && res.result?.file_path) return res.result.file_path;
  return null;
}

/** URL مستقیم دانلود فایل از سرور تلگرام */
export function telegramFileUrl(cfg: BotConfig, filePath: string): string {
  return `https://api.telegram.org/file/bot${cfg.botToken}/${filePath}`;
}
