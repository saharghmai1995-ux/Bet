import { NextRequest, NextResponse } from "next/server";
import {
  telegramStatus,
  setSetting,
  sendConfigTestMessage,
  setAutoDispatch,
  getAutoDispatch,
  autoDispatchApprovedSlips,
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

    if (typeof body.botToken === "string") {
      await setSetting("telegram_bot_token", body.botToken.trim());
      saved.token = true;
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
    if (body.dispatchNow || (saved.token && (await getAutoDispatch()))) {
      dispatch = await autoDispatchApprovedSlips();
    }

    const status = await telegramStatus();
    return NextResponse.json({ success: true, saved, test, dispatch, status, autoDispatch: await getAutoDispatch() });
  } catch (error) {
    console.error("POST /api/telegram/config error:", error);
    return NextResponse.json({ success: false, error: "خطا در ذخیره تنظیمات تلگرام" }, { status: 500 });
  }
}
