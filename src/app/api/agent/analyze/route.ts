import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import { z } from "zod";
import { db } from "@/lib/db";
import { runDixonColes, expectedValue } from "@/lib/engine/poisson";
import { eloAbsenceAdjustment } from "@/lib/engine/elo";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// ─────────────────────────────────────────────
// اسکیمای خروجی ساختاریافته ایجنت تحلیلگر ارشد
// ─────────────────────────────────────────────
const ScenarioSchema = z.object({
  name: z.string(),
  probability: z.number().min(0).max(1),
  description: z.string(),
});

const AnalystOutputSchema = z.object({
  tacticalMatchup: z.object({
    homeStyle: z.string(),
    awayStyle: z.string(),
    tempo: z.enum(["LOW", "MEDIUM", "HIGH"]).catch("MEDIUM"),
    keyBattles: z.array(z.string()).default([]),
    summary: z.string(),
  }),
  scenarios: z.array(ScenarioSchema).min(2).max(6),
  probabilities: z.object({
    home: z.number().min(0).max(1),
    draw: z.number().min(0).max(1),
    away: z.number().min(0).max(1),
    over25: z.number().min(0).max(1),
    under25: z.number().min(0).max(1),
    btts: z.number().min(0).max(1).optional(),
  }),
  goalsExpectation: z.object({
    home: z.number().min(0).max(6),
    away: z.number().min(0).max(6),
  }),
  riskFlags: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).catch(0.65),
  narrative: z.string(),
});

type AnalystOutput = z.infer<typeof AnalystOutputSchema>;

const SYSTEM_PROMPT = `تو «تحلیلگر ارشد فوتبال» هستی؛ یک ایجنت حرفه‌ای تحلیل مسابقات با تخصص تاکتیک، آمار پیشرفته (xG، PPDA، Field Tilt) و مدل‌سازی احتمالات.

وظیفه تو: دریافت داده‌های کمّی و کیفی یک مسابقه و تولید «توزیع احتمالاتی سناریوهای بازی» و «احتمال واقعی (True Probability)» هر بازار.

قواعد حیاتی:
1. خروجی تو باید "فقط و فقط" یک JSON معتبر باشد؛ بدون هیچ متن اضافه، بدون markdown، بدون توضیح.
2. احتمالات home/draw/away باید مجموعشان ≈ ۱ باشد. over25 + under25 = ۱.
3. احتمال مساوی هیچ‌وقت کمتر از ۰.۱۲ نباشد (مساوی همیشه محتمل است).
4. سناریوها باید متقابل مستثنی و پوشش‌دهنده کل فضای بازی باشند و مجموعشان = ۱.
5. به PPDA (کمتر = پرس بیشتر)، Field Tilt، xG، فرم تیم‌ها، غیبت‌ها و شرایط جوی توجه کن.
6. تو نباید قطعی‌گویی کنی؛ همیشه توزیع احتمالاتی بده.

ساختار JSON خروجی:
{
  "tacticalMatchup": { "homeStyle": "...", "awayStyle": "...", "tempo": "LOW|MEDIUM|HIGH", "keyBattles": ["..."], "summary": "..." },
  "scenarios": [ { "name": "نام سناریو", "probability": 0.55, "description": "شرح روند بازی" } ],
  "probabilities": { "home": 0.0, "draw": 0.0, "away": 0.0, "over25": 0.0, "under25": 0.0, "btts": 0.0 },
  "goalsExpectation": { "home": 0.0, "away": 0.0 },
  "riskFlags": ["هشدارهای ریسکی مثل تله باخت همزمان یا عدم قطعیت داده"],
  "confidence": 0.0,
  "narrative": "جمع‌بندی تحلیلی دو تا سه جمله‌ای به فارسی"
}`;

function buildUserPrompt(data: {
  match: {
    homeTeam: string;
    awayTeam: string;
    league: string;
    weather: string;
    homeXg: number;
    awayXg: number;
    homePpda: number;
    awayPpda: number;
    homeFieldTilt: number;
    awayFieldTilt: number;
    homeForm: string;
    awayForm: string;
    homeElo: number;
    awayElo: number;
    homeAbsence: string | null;
    awayAbsence: string | null;
    homeMotivation: string | null;
    awayMotivation: string | null;
    tacticalNote: string | null;
    oddsHome: number;
    oddsDraw: number;
    oddsAway: number;
    oddsOver25: number;
    oddsUnder25: number;
    odds1x: number;
  };
  engine: {
    lambdaHome: number;
    lambdaAway: number;
    pHome: number;
    pDraw: number;
    pAway: number;
    pOver25: number;
    pUnder25: number;
  };
}): string {
  const { match: m, engine: e } = data;
  return `مسابقه: ${m.homeTeam} (میزبان) در برابر ${m.awayTeam} (میهمان) — ${m.league}

■ داده‌های آماری پیشرفته:
- xG: ${m.homeTeam} = ${m.homeXg} | ${m.awayTeam} = ${m.awayXg}
- شدت پرس PPDA (کمتر = پرس شدیدتر): ${m.homeTeam} = ${m.homePpda} | ${m.awayTeam} = ${m.awayPpda}
- Field Tilt (مالکیت در یک‌سوم دفاعی حریف): ${m.homeTeam} = ${m.homeFieldTilt}٪ | ${m.awayTeam} = ${m.awayFieldTilt}٪
- امتیاز الو: ${m.homeTeam} = ${m.homeElo} | ${m.awayTeam} = ${m.awayElo}
- فرم ۵ بازی اخیر: ${m.homeTeam} = ${m.homeForm} | ${m.awayTeam} = ${m.awayForm}
- آب‌وهوای استادیوم: ${m.weather}

■ وضعیت بازیکنان و انگیزه:
- غیبت‌های کلیدی: ${m.homeTeam}: ${m.homeAbsence ?? "ندارد"} | ${m.awayTeam}: ${m.awayAbsence ?? "ندارد"}
- انگیزه: ${m.homeTeam}: ${m.homeMotivation ?? "-"} | ${m.awayTeam}: ${m.awayMotivation ?? "-"}

■ یادداشت تاکتیکی اسکاترها:
${m.tacticalNote ?? "-"}

■ خروجی پایه موتور کمّی دیکسون-کولز (برای کالیبره شدن، لازم نیست عیناً تکرار کنی):
- امید گل: ${e.lambdaHome.toFixed(2)} − ${e.lambdaAway.toFixed(2)}
- احتمالات: برد میزبان ${(e.pHome * 100).toFixed(1)}٪ / مساوی ${(e.pDraw * 100).toFixed(1)}٪ / برد میهمان ${(e.pAway * 100).toFixed(1)}٪
- گل‌ها: بالای ۲.۵ = ${(e.pOver25 * 100).toFixed(1)}٪ / زیر ۲.۵ = ${(e.pUnder25 * 100).toFixed(1)}٪

■ ضرایب سایت شرط‌بندی (برای مقایسه ارزش):
- برد میزبان: ${m.oddsHome} | مساوی: ${m.oddsDraw} | برد میهمان: ${m.oddsAway}
- بالای ۲.۵: ${m.oddsOver25} | زیر ۲.۵: ${m.oddsUnder25} | شانس مجدد میزبان (1X): ${m.odds1x}

حالا خروجی JSON را طبق ساختار اعلام‌شده تولید کن.`;
}

function stripJson(raw: string): string {
  let s = raw.trim();
  // حذف ```json ... ```
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  // استخراج اولین بلوک JSON
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) s = s.slice(start, end + 1);
  return s;
}

/**
 * fallback موتور محض: اگر LLM پاسخ معتبر نداد، از خروجی دیکسون-کولز استفاده می‌کنیم
 */
function engineFallback(match: NonNullable<Awaited<ReturnType<typeof db.match.findFirst>>>, engine: ReturnType<typeof runDixonColes>): AnalystOutput {
  const p1x = engine.pHome + engine.pDraw;
  return {
    tacticalMatchup: {
      homeStyle: match.tacticalNote ?? "سبک میزبان بر اساس داده‌های آماری",
      awayStyle: "سبک میهمان بر اساس داده‌های آماری (PPDA و Field Tilt)",
      tempo: engine.pOver25 > 0.55 ? "HIGH" : engine.pOver25 < 0.42 ? "LOW" : "MEDIUM",
      keyBattles: [],
      summary: `مدل کمّی امید گل ${engine.lambdaHome.toFixed(2)} برای میزبان و ${engine.lambdaAway.toFixed(2)} برای میهمان برآورد می‌کند.`,
    },
    scenarios: [
      { name: "بازی بسته و کم‌گل", probability: engine.scenarioClosed, description: "مجموع گل ≤ ۲؛ سناریوی دفاعی" },
      { name: "برد پرگل میزبان", probability: engine.scenarioOpenHome, description: "میزبان با اختلاف ≥۱ گل در بازی باز" },
      { name: "برد پرگل میهمان", probability: engine.scenarioOpenAway, description: "میهمان با اختلاف ≥۱ گل در بازی باز" },
      { name: "تساوی پرگل", probability: engine.scenarioOther, description: "بازی پرگل با تقسیم امتیازات" },
    ],
    probabilities: {
      home: engine.pHome,
      draw: engine.pDraw,
      away: engine.pAway,
      over25: engine.pOver25,
      under25: engine.pUnder25,
      btts: engine.pBtts,
    },
    goalsExpectation: { home: engine.lambdaHome, away: engine.lambdaAway },
    riskFlags: p1x < 0.72 ? ["شانس مجدد میزبان (1X) زیر آستانه امنیت ۷۲٪"] : [],
    confidence: 0.6,
    narrative: "خروجی از موتور کمّی (fallback). پاسخ LLM معتبر نبود؛ احتمالات مستقیماً از مدل دیکسون-کولز محاسبه شد.",
  };
}

/**
 * POST /api/agent/analyze { matchId }
 * اجرای ایجنت تحلیلگر ارشد: تلفیق آمار کمّی + تحلیل کیفی تاکتیکی → JSON ساختاریافته + EV
 */
export async function POST(req: NextRequest) {
  try {
    const { matchId } = await req.json();
    if (!matchId) {
      return NextResponse.json({ success: false, error: "matchId الزامی است" }, { status: 400 });
    }

    const match = await db.match.findUnique({ where: { id: matchId } });
    if (!match) {
      return NextResponse.json({ success: false, error: "بازی یافت نشد" }, { status: 404 });
    }

    // ۱) خروجی پایه موتور کمّی
    const eloHomeAdj = match.homeAbsence ? match.homeElo - 20 : match.homeElo;
    const eloAwayAdj = match.awayAbsence ? match.awayElo - 20 : match.awayElo;

    const engine = runDixonColes({
      homeAttack: match.homeAttack,
      awayAttack: match.awayAttack,
      homeDefense: match.homeDefense,
      awayDefense: match.awayDefense,
      leagueAvg: 1.35,
      homeAdvantage: 1.12,
      rho: -0.08,
      eloDiff: eloHomeAdj - eloAwayAdj,
      eloWeight: 0.35,
      homeAbsenceImpact: match.homeAbsence ? 0.1 : 0,
      awayAbsenceImpact: match.awayAbsence ? 0.1 : 0,
      timeDecayXi: 0.0065,
      daysAgo: 60,
    });

    // ۲) فراخوانی LLM
    let output: AnalystOutput | null = null;
    let source = "LLM";

    try {
      const zai = await ZAI.create();
      const completion = await zai.chat.completions.create({
        messages: [
          { role: "assistant", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt({ match, engine }) },
        ],
        thinking: { type: "disabled" },
      });

      const raw = completion.choices[0]?.message?.content ?? "";
      const parsed = AnalystOutputSchema.safeParse(JSON.parse(stripJson(raw)));

      if (parsed.success) {
        output = parsed.data;
        // نرمال‌سازی احتمالات ۱X۲
        const s = output.probabilities.home + output.probabilities.draw + output.probabilities.away;
        if (s > 0.5 && s < 1.6) {
          output.probabilities.home /= s;
          output.probabilities.draw /= s;
          output.probabilities.away /= s;
        }
        const sOu = output.probabilities.over25 + output.probabilities.under25;
        if (Math.abs(sOu - 1) > 0.01 && sOu > 0.5) {
          output.probabilities.over25 /= sOu;
          output.probabilities.under25 /= sOu;
        }
      } else {
        console.warn("Analyst JSON validation failed:", parsed.error.issues.slice(0, 3));
      }
    } catch (llmError) {
      console.error("LLM call failed:", llmError);
    }

    if (!output) {
      output = engineFallback(match, engine);
      source = "ENGINE_FALLBACK";
    }

    // ۳) محاسبه ارزش مورد انتظار (+EV) در برابر ضرایب سایت
    const p = output.probabilities;
    const evs = {
      home: expectedValue(p.home, match.oddsHome),
      draw: expectedValue(p.draw, match.oddsDraw),
      away: expectedValue(p.away, match.oddsAway),
      over25: expectedValue(p.over25, match.oddsOver25),
      under25: expectedValue(p.under25, match.oddsUnder25),
    };

    const marketNames: Record<string, string> = {
      home: `برد ${match.homeTeam}`,
      draw: "مساوی",
      away: `برد ${match.awayTeam}`,
      over25: "بالای ۲.۵ گل",
      under25: "زیر ۲.۵ گل",
    };
    const oddsMap: Record<string, number> = {
      home: match.oddsHome,
      draw: match.oddsDraw,
      away: match.oddsAway,
      over25: match.oddsOver25,
      under25: match.oddsUnder25,
    };
    const bestKey = Object.entries(evs).sort((a, b) => b[1] - a[1])[0][0];
    const bestMarket = marketNames[bestKey];
    const bestOdds = oddsMap[bestKey];

    // ۴) فلگ ریسک تله: اگر 1X زیر آستانه امنیت باشد برای ساخت تیپ مکمل
    const p1x = p.home + p.draw;
    const riskFlag = p1x < 0.72 ? "MIDDLE_TRAP_RISK" : "OK";

    // ۵) ذخیره تحلیل
    const analysis = await db.agentAnalysis.create({
      data: {
        matchId: match.id,
        payload: JSON.stringify({ ...output, bestKey, bestOdds, oddsMap }),
        pHome: p.home,
        pDraw: p.draw,
        pAway: p.away,
        pOver25: p.over25,
        pUnder25: p.under25,
        evHome: evs.home,
        evDraw: evs.draw,
        evAway: evs.away,
        evOver25: evs.over25,
        evUnder25: evs.under25,
        bestMarket,
        bestEv: evs[bestKey as keyof typeof evs],
        confidence: output.confidence,
        riskFlag,
        source,
      },
    });

    // v4.0: وضعیت‌های ویژه (LIVE/ARCHIVED/FINISHED) نباید با ANALYZED بازنویسی شوند
    const protectedStatus = ["LIVE", "ARCHIVED", "FINISHED"].includes(match.status);
    await db.match.update({
      where: { id: match.id },
      data: { status: protectedStatus ? match.status : "ANALYZED" },
    });

    return NextResponse.json({
      success: true,
      source,
      match: {
        id: match.id,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        league: match.league,
        oddsHome: match.oddsHome,
        oddsDraw: match.oddsDraw,
        oddsAway: match.oddsAway,
        oddsOver25: match.oddsOver25,
        oddsUnder25: match.oddsUnder25,
        odds1x: match.odds1x,
      },
      engineBaseline: {
        lambdaHome: engine.lambdaHome,
        lambdaAway: engine.lambdaAway,
        pHome: engine.pHome,
        pDraw: engine.pDraw,
        pAway: engine.pAway,
      },
      analysis: {
        id: analysis.id,
        probabilities: p,
        goalsExpectation: output.goalsExpectation,
        scenarios: output.scenarios,
        tacticalMatchup: output.tacticalMatchup,
        riskFlags: output.riskFlags,
        narrative: output.narrative,
        confidence: output.confidence,
        evs,
        bestMarket,
        bestEv: evs[bestKey as keyof typeof evs],
        bestKey,
        riskFlag,
        p1x,
        createdAt: analysis.createdAt,
      },
    });
  } catch (error) {
    console.error("POST /api/agent/analyze error:", error);
    return NextResponse.json({ success: false, error: "خطا در اجرای ایجنت تحلیلگر" }, { status: 500 });
  }
}
