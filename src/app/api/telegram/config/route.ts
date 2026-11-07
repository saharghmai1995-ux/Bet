import { NextRequest, NextResponse } from "next/server";
import { telegramStatus, setSetting, sendConfigTestMessage } from "@/lib/server/telegram-service";

export const dynamic = "force-dynamic";

/**
 * POST /api/telegram/config
 * ذخیره توکن بات و شناسه کانال VIP (سمت سرور در Setting) + پیام آزمون اختیاری
 * بدنه: { botToken?, channelId?, test? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { botToken?: string; channelId?: string; test?: boolean };
    const saved = { token: false, channel: false };

    if (typeof body.botToken === "string") {
      await setSetting("telegram_bot_token", body.botToken.trim());
      saved.token = true;
    }
    if (typeof body.channelId === "string") {
      await setSetting("telegram_channel_id", body.channelId.trim());
      saved.channel = true;
    }

    let test: { ok: boolean; detail: string } | null = null;
    if (body.test) {
      test = await sendConfigTestMessage();
    }

    const status = await telegramStatus();
    return NextResponse.json({ success: true, saved, test, status });
  } catch (error) {
    console.error("POST /api/telegram/config error:", error);
    return NextResponse.json({ success: false, error: "خطا در ذخیره تنظیمات تلگرام" }, { status: 500 });
  }
}
