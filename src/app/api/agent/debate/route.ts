import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeeded } from "@/lib/seed";
import { computeMatchEngine, devigRows, sharpOu } from "@/lib/engine/matchEngine";
import { runBullAgent, runBearAgent, runJudgeAgent, type Brief } from "@/lib/agents/debate";
import { leagueCalibration } from "@/lib/engine/calibration";
import { getNewsForTeams } from "@/lib/server/live-ingest";
import type { AgentBriefDTO, DebateResultDTO } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

function toBrief(b: Brief, role: "BULL" | "BEAR", source: "LLM" | "ENGINE_FALLBACK"): AgentBriefDTO {
  return {
    role,
    title: role === "BULL" ? "ایجنت گاو (Bull)" : "ایجنت خرس (Bear)",
    thesis: b.thesis,
    arguments: b.arguments,
    factorDeltas: b.factorDeltas,
    confidence: b.confidence,
    source,
  };
}

/**
 * POST /api/agent/debate { matchId }
 * مناظره چندایجنتی: موتور کمّی + شین دی‌ویگ → گاو/خرس → قاضی → کالیبراسیون خودکار
 */
export async function POST(req: NextRequest) {
  try {
    await ensureSeeded();
    const { matchId } = await req.json();
    if (!matchId) {
      return NextResponse.json({ success: false, error: "matchId الزامی است" }, { status: 400 });
    }

    const match = await db.match.findUnique({ where: { id: matchId }, include: { referee: true } });
    if (!match) {
      return NextResponse.json({ success: false, error: "بازی یافت نشد" }, { status: 404 });
    }
    const odds = await db.oddsRecord.findMany({ where: { matchId: match.id } });

    // ─── ۱) موتور کمّی با تعدیل‌های زمینه‌ای ───
    const engine = computeMatchEngine(match);
    const dc = engine.dc;

    // ─── ۲) خط شارپ: شین دی‌ویگ روی پیناکل ───
    const rows = devigRows(odds);
    const pinnacleRow = rows.find((r) => r.sharp) ?? null;
    const sharpProbs = pinnacleRow ? pinnacleRow.shinProbs : null;

    // ─── ۳) کالیبراسیون خودکار لیگ (حافظه بریر) ───
    const logs = await db.calibrationLog.findMany({ where: { league: match.league } });
    const cal = leagueCalibration(
      logs.map((l) => ({ league: l.league, predictedProb: l.predictedProb, outcome: l.outcome as "WIN" | "LOSS", brier: l.brier }))
    );
    const leagueCal = cal.find((c) => c.league === match.league) ?? null;
    const shrink = leagueCal && leagueCal.calibrationFactor < 1 ? 1 - leagueCal.calibrationFactor : 0;

    // ─── ۴) مناظره: گاو و خرس (موازی) سپس قاضی ───
    const context = {
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      league: match.league,
      weather: match.weather,
      homeXg: match.homeXg,
      awayXg: match.awayXg,
      homePpda: match.homePpda,
      awayPpda: match.awayPpda,
      homeFieldTilt: match.homeFieldTilt,
      awayFieldTilt: match.awayFieldTilt,
      homeForm: match.homeForm,
      awayForm: match.awayForm,
      homeAbsence: match.homeAbsence,
      awayAbsence: match.awayAbsence,
      homeMotivation: match.homeMotivation,
      awayMotivation: match.awayMotivation,
      tacticalNote: match.tacticalNote,
      engine: {
        lambdaHome: dc.lambdaHome,
        lambdaAway: dc.lambdaAway,
        pHome: dc.pHome,
        pDraw: dc.pDraw,
        pAway: dc.pAway,
        pOver25: dc.pOver25,
      },
      sharp: sharpProbs,
      notes: engine.notes,
      // v4.0: اخبار زنده ESPN مرتبط با دو تیم — مستند واقعی برای گاو و خرس
      liveNews: (await getNewsForTeams(match.homeTeam, match.awayTeam)).map((n) => ({
        headline: n.headline,
        description: n.description,
        url: n.url,
        side: n.leagueSlug !== "" ? ("HOME" as const) : ("HOME" as const),
      })),
    };
    // تعیین سمت خبر بر اساس حضور نام واقعی هر تیم در متن
    {
      const norm = (s: string) => s.toLowerCase();
      for (const doc of context.liveNews ?? []) {
        const text = norm(`${doc.headline} ${doc.description}`);
        const hitH = norm(match.homeTeam).split(" ").filter((t) => t.length > 2).some((t) => text.includes(t));
        const hitA = norm(match.awayTeam).split(" ").filter((t) => t.length > 2).some((t) => text.includes(t));
        doc.side = hitH && !hitA ? "HOME" : hitA && !hitH ? "AWAY" : "HOME";
      }
    }

    const [bullRes, bearRes] = await Promise.all([runBullAgent(context), runBearAgent(context)]);
    // v4.0: تشخیص دقیق fallback (فلگ صریح به‌جای جستجوی رشته)
    const source: "LLM" | "ENGINE_FALLBACK" =
      bullRes.fallback || bearRes.fallback ? "ENGINE_FALLBACK" : "LLM";

    // ترکیب وزنی: موتور + خط شارپ + دلتاهای ایجنت‌ها (وزن‌دهی با اطمینان)
    const bw = bullRes.confidence;
    const rw = bearRes.confidence;
    const wSum = bw + rw || 1;
    const delta = {
      home: (bullRes.factorDeltas.home * bw + bearRes.factorDeltas.home * rw) / wSum,
      draw: (bullRes.factorDeltas.draw * bw + bearRes.factorDeltas.draw * rw) / wSum,
      away: (bullRes.factorDeltas.away * bw + bearRes.factorDeltas.away * rw) / wSum,
      over25: (bullRes.factorDeltas.over25 * bw + bearRes.factorDeltas.over25 * rw) / wSum,
    };

    const wEngine = sharpProbs ? 0.45 : 0.65;
    const wSharp = sharpProbs ? 0.3 : 0;
    const wAgents = sharpProbs ? 0.25 : 0.35;

    const blend = {
      home: wEngine * dc.pHome + wSharp * (sharpProbs?.home ?? 0) + wAgents * (dc.pHome + delta.home),
      draw: wEngine * dc.pDraw + wSharp * (sharpProbs?.draw ?? 0) + wAgents * (dc.pDraw + delta.draw),
      away: wEngine * dc.pAway + wSharp * (sharpProbs?.away ?? 0) + wAgents * (dc.pAway + delta.away),
      over25: wEngine * dc.pOver25 + wSharp * dc.pOver25 + wAgents * (dc.pOver25 + delta.over25),
    };
    const s = blend.home + blend.draw + blend.away;
    blend.home /= s;
    blend.draw /= s;
    blend.away /= s;
    blend.over25 = Math.min(0.92, Math.max(0.08, blend.over25 / (wEngine + wSharp + wAgents)));

    // جمع‌شدگی کالیبراسیون: اگر لیگ بریر بدی دارد، به سمت خط شارپ جمع شو
    let calibrationApplied: string | null = null;
    if (shrink > 0 && sharpProbs) {
      blend.home = blend.home * (1 - shrink) + sharpProbs.home * shrink;
      blend.draw = blend.draw * (1 - shrink) + sharpProbs.draw * shrink;
      blend.away = blend.away * (1 - shrink) + sharpProbs.away * shrink;
      calibrationApplied = `ضریب اصلاحی لیگ (${leagueCal?.calibrationFactor.toFixed(2)}) اعمال شد — ${(shrink * 100).toFixed(0)}٪ گرایش به خط شارپ پیناکل`;
    }

    const judgeRes = await runJudgeAgent(context, bullRes, bearRes, blend);

    // محدودسازی خروجی قاضی به پنجره ±۸ واحد درصدی اطراف مرجع کمّی (ضد هذیان)
    let final = { ...blend };
    if (judgeRes) {
      const clamp = (v: number, ref: number) => Math.min(ref + 0.08, Math.max(ref - 0.08, v));
      final = {
        home: clamp(judgeRes.probabilities.home, blend.home),
        draw: clamp(Math.max(0.12, judgeRes.probabilities.draw), Math.max(0.12, blend.draw - 0.03)),
        away: clamp(judgeRes.probabilities.away, blend.away),
        over25: Math.min(0.92, Math.max(0.08, judgeRes.probabilities.over25)),
      };
      const s2 = final.home + final.draw + final.away;
      final.home /= s2;
      final.draw /= s2;
      final.away /= s2;
    }

    // ─── ۵) ذخیره تحلیل ───
    const analysis = await db.agentAnalysis.create({
      data: {
        matchId: match.id,
        payload: JSON.stringify({ bull: bullRes, bear: bearRes, judge: judgeRes, blend, notes: engine.notes, devig: rows }),
        pHome: final.home,
        pDraw: final.draw,
        pAway: final.away,
        pOver25: final.over25,
        pUnder25: 1 - final.over25,
        evHome: final.home * match.oddsHome - 1,
        evDraw: final.draw * match.oddsDraw - 1,
        evAway: final.away * match.oddsAway - 1,
        evOver25: final.over25 * match.oddsOver25 - 1,
        evUnder25: (1 - final.over25) * match.oddsUnder25 - 1,
        bestMarket: "مناظره چندایجنتی",
        bestEv: Math.max(final.home * match.oddsHome - 1, final.away * match.oddsAway - 1, final.draw * match.oddsDraw - 1, final.over25 * match.oddsOver25 - 1),
        confidence: judgeRes?.confidence ?? 0.65,
        riskFlag: final.home + final.draw >= 0.72 ? "OK" : "MIDDLE_TRAP_RISK",
        source,
      },
    });
    // v4.0: وضعیت‌های ویژه (LIVE/ARCHIVED/FINISHED) نباید با ANALYZED بازنویسی شوند
    const protectedStatus = ["LIVE", "ARCHIVED", "FINISHED"].includes(match.status);
    await db.match.update({
      where: { id: match.id },
      data: { status: protectedStatus ? match.status : "ANALYZED" },
    });

    const judgeBrief: AgentBriefDTO = {
      role: "JUDGE",
      title: "قاضی کمّی ارشد",
      thesis: judgeRes?.thesis ?? "حکم نهایی از ترکیب وزنی موتور کمّی، خط شارپ پیناکل و دلتاهای دو ایجنت محاسبه شد.",
      arguments: judgeRes?.arguments ?? [
        "ترکیب ۴۵٪ دیکسون-کولز + ۳۰٪ خط شارپ + ۲۵٪ دلتاهای مناظره",
        "خروجی قاضی در پنجره ±۸ واحد درصدی اطراف مرجع کمّی قفل شد",
      ],
      confidence: judgeRes?.confidence ?? 0.65,
      source: judgeRes ? "LLM" : "ENGINE_FALLBACK",
    };

    const result: DebateResultDTO = {
      success: true,
      source,
      match: {
        id: match.id,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        league: match.league,
        referee: match.referee?.name ?? null,
      },
      quantitative: {
        lambdaHome: dc.lambdaHome,
        lambdaAway: dc.lambdaAway,
        pHome: dc.pHome,
        pDraw: dc.pDraw,
        pAway: dc.pAway,
        pOver25: dc.pOver25,
        pUnder25: dc.pUnder25,
        pBtts: dc.pBtts,
        gamestateNote: engine.notes.gamestateNote,
        fatigueNote: engine.notes.fatigueNote,
        refereeNote: engine.notes.refereeNote,
        lineupShockNote: engine.notes.lineupShockNote,
      },
      devig: rows,
      sharpProbs,
      bull: toBrief(bullRes, "BULL", source),
      bear: toBrief(bearRes, "BEAR", source),
      judge: judgeBrief,
      final: {
        pHome: final.home,
        pDraw: final.draw,
        pAway: final.away,
        pOver25: final.over25,
        analysisId: analysis.id,
        confidence: judgeRes?.confidence ?? 0.65,
        calibrationApplied,
      },
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/agent/debate error:", error);
    return NextResponse.json({ success: false, error: "خطا در اجرای مناظره چندایجنتی" }, { status: 500 });
  }
}
