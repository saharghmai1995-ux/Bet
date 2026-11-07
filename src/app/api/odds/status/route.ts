import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeeded } from "@/lib/seed";
import { probeOddsSources, fetchMatchOddsComparison } from "@/lib/server/odds-providers";
import { computeMatchEngine } from "@/lib/engine/matchEngine";
import type { OddsComparisonRowDTO } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/odds/status?matchId=&oddsApiKey=&oddsApiIoKey=
 * v5.0 — وضعیت ۵ منبع ضرایب رایگان + جدول مقایسه ضرایب بازی فعال
 * (ESPN Core ↔ Polymarket ↔ ESPN Analytics ↔ خط پایه سیستم ↔ مدل دیکسون-کولز)
 */
export async function GET(req: NextRequest) {
  try {
    await ensureSeeded();
    const sp = req.nextUrl.searchParams;
    const matchId = sp.get("matchId");
    const oddsApiKey = sp.get("oddsApiKey") ?? undefined;
    const oddsApiIoKey = sp.get("oddsApiIoKey") ?? undefined;

    const sources = await probeOddsSources({ oddsApiKey, oddsApiIoKey });

    let comparison: OddsComparisonRowDTO[] = [];
    let modelFairOdds: { home: number; draw: number; away: number } | null = null;
    let matchLabel: string | null = null;

    if (matchId) {
      const match = await db.match.findUnique({ where: { id: matchId }, include: { referee: true } });
      if (match) {
        matchLabel = `${match.homeTeam} - ${match.awayTeam}`;
        const engine = computeMatchEngine(match);
        const dc = engine.dc;
        // خط عادلانه مدل با حاشیه ۵٪ — برای مقایسه با منابع واقعی
        modelFairOdds = {
          home: Math.round((1 / (dc.pHome * 1.05)) * 100) / 100,
          draw: Math.round((1 / (dc.pDraw * 1.05)) * 100) / 100,
          away: Math.round((1 / (dc.pAway * 1.05)) * 100) / 100,
        };
        const cmp = await fetchMatchOddsComparison({
          externalId: match.externalId,
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          oddsHome: match.oddsHome,
          oddsDraw: match.oddsDraw,
          oddsAway: match.oddsAway,
          oddsSource: match.oddsSource,
        }).catch(() => ({ rows: [] as OddsComparisonRowDTO[], espnProbabilities: null }));
        comparison = cmp.rows;
        const fairNote =
          match.statsSource === "ESPN_STANDINGS"
            ? `از α/β واقعی جدول رسمی فصل — رتبه ${match.homeRank ?? "؟"} با ${match.homeGF ?? "؟"} گل زده/خانه در ${match.homeGP ?? "؟"} بازی`
            : "از ماتریس نمره — جدول رسمی برای این لیگ در دسترس نبود";
        comparison.push({
          source: "MODEL_FAIR",
          sourceLabel: "ضریب عادلانه دیکسون-کولز فصل جاری",
          home: modelFairOdds.home,
          draw: modelFairOdds.draw,
          away: modelFairOdds.away,
          note: fairNote,
        });
      }
    }

    return NextResponse.json({
      success: true,
      sources,
      comparison,
      matchLabel,
      modelFairOdds,
      generatedAt: Date.now(),
    });
  } catch (error) {
    console.error("GET /api/odds/status error:", error);
    return NextResponse.json({ success: false, error: "خطا در پروب منابع ضرایب" }, { status: 500 });
  }
}
