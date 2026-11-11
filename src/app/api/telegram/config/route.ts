import { NextRequest, NextResponse } from "next/server";
import {
  telegramStatus,
  setSetting,
  sendConfigTestMessage,
  setAutoDispatch,
  getAutoDispatch,
  autoDispatchApprovedSlips,
  verifyBotToken,
  isValidBotTokenFormat,
  KEY_PUBLIC_CHANNEL,
} from "@/lib/server/telegram-service";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/telegram/config
 * ذخیره توکن بات و شناسه کانال VIP + کانال عمومی ویترین v13.0 (سمت سرور در Setting)
 * بدنه: { botToken?, channelId?, publicChannelId?, test?, autoDispatch?, dispatchNow? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { botToken?: string; channelId?: string; publicChannelId?: string; test?: boolean; autoDispatch?: boolean; dispatchNow?: boolean };
    const saved = { token: false, channel: false, publicChannel: false, autoDispatch: false };

    // v13.2 — گیت اعتبارسنجی توکن: توکن ناقص/خراب (ریشه باگ «انتشار انجام نمیشه») دیگر ذخیره نمی‌شود
    let tokenError: string | null = null;
    if (typeof body.botToken === "string" && body.botToken.trim()) {
      const t = body.botToken.trim();
      if (!isValidBotTokenFormat(t)) {
        tokenError =
          "قالب توکن نامعتبر است — توکن باید به شکل کامل «<bot_id>:<hash>» باشد (مثال: 123456789:AAH2...). توکن ناقص فقط بخش hash است و تلگرام آن را 404 Not Found می‌کند.";
      } else {
        const v = await verifyBotToken(t);
        if (!v.ok) {
          tokenError = `توکن توسط تلگرام تایید نشد (${v.detail}) — توکن را از @BotFather کامل کپی کنید.`;
        } else {
          await setSetting("telegram_bot_token", t);
          saved.token = true;
        }
      }
    }
    if (typeof body.channelId === "string") {
      await setSetting("telegram_channel_id", body.channelId.trim());
      saved.channel = true;
    }
    if (typeof body.publicChannelId === "string") {
      await setSetting(KEY_PUBLIC_CHANNEL, body.publicChannelId.trim());
      saved.publicChannel = true;
    }
    if (typeof body.autoDispatch === "boolean") {
      await setAutoDispatch(body.autoDispatch);
      saved.autoDispatch = true;
    }

    let test: { ok: boolean; detail: string } | null = null;
    if (body.test) {
      test = await sendConfigTestMessage();
    }

    // v9.0 — به محض ذخیره اتصال، صف ارسال خودکار دو مرحله‌ای اجرا می‌شود
    let dispatch: Awaited<ReturnType<typeof autoDispatchApprovedSlips>> | null = null;
    if (!tokenError && (body.dispatchNow || (saved.token && (await getAutoDispatch())))) {
      dispatch = await autoDispatchApprovedSlips();
    }

    const status = await telegramStatus();
    return NextResponse.json({ success: !tokenError, saved, tokenError, test, dispatch, status, autoDispatch: await getAutoDispatch() });
  } catch (error) {
    console.error("POST /api/telegram/config error:", error);
    return NextResponse.json({ success: false, error: "خطا در ذخیره تنظیمات تلگرام" }, { status: 500 });
  }
}
