import { NextResponse } from "next/server";
import { getLedger } from "@/lib/server/liveDataService";

export const dynamic = "force-dynamic";

/**
 * GET /api/settlement/ledger
 * کارنامه کامل: کارت‌های صادرشده + آمار تسویه + صندوق پیام‌های تلگرام
 */
export async function GET() {
  try {
    const ledger = await getLedger();
    return NextResponse.json(ledger);
  } catch (error) {
    console.error("GET /api/settlement/ledger error:", error);
    return NextResponse.json(
      {
        success: false,
        slips: [],
        stats: {
          total: 0, pending: 0, live: 0, wonA: 0, wonB: 0, doubleWin: 0,
          middleTrap: 0, manual: 0, void: 0, settled: 0, netProfit: 0, netProfitPct: 0, staked: 0,
        },
        outbox: [],
        telegram: { configured: false, channelSet: false },
        error: "خطا در خواندن کارنامه",
      },
      { status: 500 }
    );
  }
}
