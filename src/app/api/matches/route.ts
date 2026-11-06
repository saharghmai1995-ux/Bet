import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeeded } from "@/lib/seed";

export const dynamic = "force-dynamic";

/**
 * GET /api/matches — لیست بازی‌های پیش رو (با auto-seed)
 */
export async function GET(req: NextRequest) {
  try {
    await ensureSeeded();

    const url = new URL(req.url);
    const league = url.searchParams.get("league");

    const matches = await db.match.findMany({
      // v4.0: بازی‌های آرشیو‌شده (گذشته/جایگزین‌شده با فید زنده) نمایش داده نمی‌شوند
      where: league ? { league, status: { not: "ARCHIVED" } } : { status: { not: "ARCHIVED" } },
      orderBy: { kickoff: "asc" },
      include: {
        analyses: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    return NextResponse.json({
      success: true,
      count: matches.length,
      matches: matches.map((m) => ({
        ...m,
        latestAnalysis: m.analyses[0]
          ? {
              id: m.analyses[0].id,
              bestMarket: m.analyses[0].bestMarket,
              bestEv: m.analyses[0].bestEv,
              confidence: m.analyses[0].confidence,
              source: m.analyses[0].source,
            }
          : null,
        analyses: undefined,
      })),
    });
  } catch (error) {
    console.error("GET /api/matches error:", error);
    return NextResponse.json({ success: false, error: "خطا در دریافت بازی‌ها" }, { status: 500 });
  }
}
