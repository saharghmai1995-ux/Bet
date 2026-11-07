import { NextResponse } from "next/server";
import { settleFinishedSlips } from "@/lib/server/liveDataService";

export const dynamic = "force-dynamic";

/**
 * POST /api/settlement/sync
 * دکمه «⚡ همگام‌سازی و تسویه خودکار نتایج پایان‌یافته با سرور ESPN»:
 * اسکوربورد ESPN (امروز + دیروز، شامل Scheduled/In-Progress/Final) بررسی و
 * همه کارت‌های انتظار با نتیجه واقعی FT تسویه می‌شوند + اعلام تلگرام.
 */
export async function POST() {
  try {
    const result = await settleFinishedSlips({ notify: true });
    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/settlement/sync error:", error);
    return NextResponse.json(
      { success: false, checkedEspn: 0, ftFound: 0, settled: [], live: 0, notified: 0, elapsedMs: 0, error: "خطا در تسویه خودکار با سرور ESPN" },
      { status: 500 }
    );
  }
}
