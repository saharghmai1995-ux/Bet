import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeeded } from "@/lib/seed";
import { computeLineupShock } from "@/lib/engine/matchEngine";
import type { LineupShockDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/lineup { matchId }
 * شبیه‌سازی شوک T-60: اعلام ترکیب رسمی → بازمحاسبه قدرت با VAEP/xT هر بازیکن
 * بیشترین ناکارآمدی بازار یک ساعت قبل از سوت آغاز رخ می‌دهد
 */
export async function POST(req: NextRequest) {
  try {
    await ensureSeeded();
    const { matchId } = await req.json();
    if (!matchId) {
      return NextResponse.json({ success: false, error: "matchId الزامی است" }, { status: 400 });
    }

    const match = await db.match.findUnique({ where: { id: matchId } });
    if (!match) {
      return NextResponse.json({ success: false, error: "بازی یافت نشد" }, { status: 404 });
    }
    const players = await db.player.findMany({ where: { matchId: match.id } });

    const homePlayers = players.filter((p) => p.side === "HOME");
    const awayPlayers = players.filter((p) => p.side === "AWAY");

    const home = computeLineupShock(homePlayers);
    const away = computeLineupShock(awayPlayers);

    const isShock = Math.abs(home.shockDelta) >= 0.1 || Math.abs(away.shockDelta) >= 0.1
      || home.missingKeyPlayers.length > 0 || away.missingKeyPlayers.length > 0;

    await db.match.update({
      where: { id: match.id },
      data: {
        lineupAnnounced: true,
        lineupShockHome: home.shockDelta,
        lineupShockAway: away.shockDelta,
      },
    });

    const parts: string[] = [];
    if (home.missingKeyPlayers.length > 0) {
      parts.push(`${match.homeTeam}: غیبت کلیدی «${home.missingKeyPlayers[0].name}» (${home.missingKeyPlayers[0].status === "INJURED" ? "مصدوم" : "محروم"}) — افت ${Math.abs(home.shockDelta * 100).toFixed(0)}٪ قدرت ترکیب`);
    }
    if (away.missingKeyPlayers.length > 0) {
      parts.push(`${match.awayTeam}: غیبت کلیدی «${away.missingKeyPlayers[0].name}» — افت ${Math.abs(away.shockDelta * 100).toFixed(0)}٪`);
    }
    if (parts.length === 0) {
      parts.push("ترکیب‌ها با حداقل تغییر اعلام شدند — بازار به‌سرعت قیمت‌گذاری می‌کند؛ فرصت محدود");
    }

    const topPlayers = [...players]
      .sort((a, b) => b.xT + b.vaep - (a.xT + a.vaep))
      .slice(0, 14)
      .map((p) => ({
        side: p.side as "HOME" | "AWAY",
        name: p.name,
        position: p.position,
        xT: p.xT,
        vaep: p.vaep,
        status: p.status,
        isKey: p.isKey,
      }));

    const result: LineupShockDTO = {
      success: true,
      matchId: match.id,
      home: { team: match.homeTeam, ...home },
      away: { team: match.awayTeam, ...away },
      isShock,
      message: parts.join("؛ ") + " — مدل λ را بازمحاسبه کرد؛ مناظره را دوباره اجرا کنید.",
      topPlayers,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/lineup error:", error);
    return NextResponse.json({ success: false, error: "خطا در اعلام ترکیب" }, { status: 500 });
  }
}
