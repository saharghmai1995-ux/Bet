import { NextResponse } from "next/server";
import { settleFinishedSlips } from "@/lib/server/liveDataService";
import { autoSyncPastAndPresentMatches } from "@/lib/server/auto-issue";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/settlement/sync
 * دکمه «⚡ همگام‌سازی و تسویه خودکار نتایج پایان‌یافته با سرور ESPN» — v9.0:
 *   ۱) autoSyncPastAndPresentMatches: واکشی تاریخ‌دار ۳ روز گذشته + امروز از
 *      ESPN Scoreboard → صدور خودکار کارت‌های تاییدشده سوپروایزر (بازی‌های
 *      وتوشده مطلقاً صدور نمی‌شوند) → تسویه فوری FT ها
 *   ۲) settleFinishedSlips: تسویه همه کارت‌های انتظار با نتیجه واقعی + اعلام تلگرام
 */
export async function POST() {
  try {
    const auto = await autoSyncPastAndPresentMatches({ force: true, notify: true });
    const result = await settleFinishedSlips({ notify: true });
    return NextResponse.json({
      ...result,
      autoRegistered: {
        scanned: auto.scanned,
        past: auto.registeredPast,
        today: auto.registeredToday,
        vetoed: auto.vetoed,
        skippedExisting: auto.skippedExisting,
        /** v22.0 — بازی‌های رد‌شده به‌دلیل نداشتن ضریب زنده واقعی (قانون آهنین) */
        noLiveOdds: auto.noLiveOdds,
      },
    });
  } catch (error) {
    console.error("POST /api/settlement/sync error:", error);
    return NextResponse.json(
      { success: false, checkedEspn: 0, ftFound: 0, settled: [], live: 0, notified: 0, elapsedMs: 0, error: "خطا در تسویه خودکار با سرور ESPN" },
      { status: 500 }
    );
  }
}
