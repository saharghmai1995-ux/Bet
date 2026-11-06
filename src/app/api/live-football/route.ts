import { NextRequest, NextResponse } from "next/server";
import { getLiveFeed, forceSync } from "@/lib/server/live-ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * GET /api/live-football — وضعیت فید زنده (کش ۹۰ ثانیه‌ای، بدون هزینه Odds API)
 * به محض باز شدن سایت فراخوانی می‌شود: ESPN + TheSportsDB + Open-Meteo + اخبار
 */
export async function GET() {
  try {
    const feed = await getLiveFeed();
    return NextResponse.json(feed);
  } catch (error) {
    console.error("GET /api/live-football error:", error);
    return NextResponse.json(
      { success: false, mode: "FALLBACK", error: "خطا در اتصال به سرورهای زنده", news: [], sources: [] },
      { status: 200 }
    );
  }
}

/**
 * POST /api/live-football { useOddsApi?: boolean, oddsApiKey?: string }
 * همگام‌سازی اجباری (دکمه 🔄) — با اجازه کاربر ضرایب زنده The Odds API هم تازه می‌شود.
 * سرور درخواست‌های Odds API را در بازه ۱۲ دقیقه throttles می‌کند (محافظت از پلن رایگان).
 */
export async function POST(req: NextRequest) {
  try {
    let body: { useOddsApi?: boolean; oddsApiKey?: string } = {};
    try {
      body = await req.json();
    } catch {
      // بدنه خالی مجاز است
    }
    const feed = await forceSync({
      useOddsApi: body.useOddsApi !== false,
      oddsApiKey: body.oddsApiKey,
    });
    return NextResponse.json(feed);
  } catch (error) {
    console.error("POST /api/live-football error:", error);
    return NextResponse.json(
      { success: false, mode: "FALLBACK", error: "همگام‌سازی مجدد ناموفق بود", news: [], sources: [] },
      { status: 200 }
    );
  }
}
