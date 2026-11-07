import { NextResponse } from "next/server";
import { detectLiveEvents } from "@/lib/server/live-events";

export const dynamic = "force-dynamic";

/**
 * GET /api/live/events — ردیاب رویدادهای زنده واقعی ESPN
 * گل‌ها از اختلاف امتیاز اسکوربورد، کارت قرمز از keyEvents، دقیقه از ساعت رسمی ESPN.
 * صفر شبیه‌سازی — همه اعداد از فید زنده می‌آیند (کش سرور ۳۰ ثانیه‌ای).
 */
export async function GET() {
  try {
    const result = await detectLiveEvents();
    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/live/events error:", error);
    return NextResponse.json(
      { success: false, mode: "REAL_ESPN", events: [], liveMatches: [], checkedAt: Date.now(), error: "خطا در رصد رویدادهای زنده" },
      { status: 200 }
    );
  }
}
