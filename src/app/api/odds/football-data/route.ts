import { NextRequest, NextResponse } from "next/server";
import { fetchFootballDataOdds } from "@/lib/server/odds-providers";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/odds/football-data?league=E0&limit=12
 * v5.0 — مخزن ضرایب تاریخی/جاری Football-Data.co.uk (بدون کلید):
 * خطوط افتتاحیه و پایانی پیناکل (PSH/PSD/PSA/P>2.5/P<2.5) برای بک‌تست CLV واقعی.
 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const league = sp.get("league") ?? "E0";
    const limit = Math.min(40, Math.max(4, parseInt(sp.get("limit") ?? "12") || 12));

    const data = await fetchFootballDataOdds(league, limit);
    if (!data) {
      return NextResponse.json(
        { success: false, error: "CSV فوتبال‌دیتا بارگذاری نشد — منبع موقتاً در دسترس نیست" },
        { status: 502 }
      );
    }
    return NextResponse.json({ success: true, ...data });
  } catch (error) {
    console.error("GET /api/odds/football-data error:", error);
    return NextResponse.json({ success: false, error: "خطا در بارگذاری فید Football-Data" }, { status: 500 });
  }
}
