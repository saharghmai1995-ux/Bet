import { NextRequest, NextResponse } from "next/server";
import { autoDispatchApprovedSlips, previewDispatchQueue } from "@/lib/server/telegram-service";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * GET /api/telegram/autodispatch
 * پیش‌نمایش زنده فید کانال تلگرام (Live Telegram Channel Simulator Feed):
 * دقیقاً چه پیام‌هایی (فقط کارت‌های تاییدشده سوپروایزر + برگه‌های تسویه FT +
 * گزارش وین‌ریت کانال) آماده مخابره هستند — بدون ارسال واقعی.
 */
export async function GET() {
  try {
    const data = await previewDispatchQueue();
    return NextResponse.json({ success: true, ...data });
  } catch (error) {
    console.error("GET /api/telegram/autodispatch error:", error);
    return NextResponse.json({ success: false, error: "خطا در ساخت صف انتشار" }, { status: 500 });
  }
}

/**
 * POST /api/telegram/autodispatch
 * 🚀 ارسال فوری تمام کارت‌های تاییدشده سوپروایزر و گزارش نتایج تسویه‌شده
 * (صف ارسال خودکار دو مرحله‌ای — Dedupe سمت سرور)
 */
export async function POST(_req: NextRequest) {
  try {
    const result = await autoDispatchApprovedSlips({ maxCards: 8, maxResults: 8 });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("POST /api/telegram/autodispatch error:", error);
    return NextResponse.json({ success: false, error: "خطا در ارسال خودکار تلگرام" }, { status: 500 });
  }
}
