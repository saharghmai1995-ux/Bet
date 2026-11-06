// ─────────────────────────────────────────────
// معماری مناظره چندایجنتی (Adversarial Debate)
// گاو (Bull) در برابر خرس (Bear) + قاضی کمّی ارشد (Chief Quantitative Judge)
// هدف: شکستن «سوگیری تأیید» — هر ایجنت موظف به قوی‌ترین استدلال مخالف
// ─────────────────────────────────────────────

import ZAI from "z-ai-web-dev-sdk";
import { z } from "zod";
import { runWithLlmSlot, RateLimitedError } from "@/lib/server/llm-limiter";

const BriefSchema = z.object({
  thesis: z.string(),
  arguments: z.array(z.string()).min(1).max(6),
  factorDeltas: z
    .object({
      home: z.number().min(-0.15).max(0.15).catch(0),
      draw: z.number().min(-0.1).max(0.1).catch(0),
      away: z.number().min(-0.15).max(0.15).catch(0),
      over25: z.number().min(-0.15).max(0.15).catch(0),
    })
    .catch({ home: 0, draw: 0, away: 0, over25: 0 }),
  confidence: z.number().min(0).max(1).catch(0.6),
  fallback: z.boolean().optional(),
});

const JudgeSchema = z.object({
  thesis: z.string(),
  arguments: z.array(z.string()).min(1).max(6),
  probabilities: z.object({
    home: z.number().min(0.01).max(0.95),
    draw: z.number().min(0.05).max(0.6),
    away: z.number().min(0.01).max(0.95),
    over25: z.number().min(0.1).max(0.9),
  }),
  confidence: z.number().min(0).max(1).catch(0.65),
});

export type Brief = z.infer<typeof BriefSchema>;
export type JudgeOutput = z.infer<typeof JudgeSchema>;

export interface DebateNewsDoc {
  headline: string;
  description: string;
  url: string;
  side: "HOME" | "AWAY"; // کدام تیم در خبر بود
}

export interface DebateContext {
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
  homeAbsence: string | null;
  awayAbsence: string | null;
  homeMotivation: string | null;
  awayMotivation: string | null;
  tacticalNote: string | null;
  engine: { lambdaHome: number; lambdaAway: number; pHome: number; pDraw: number; pAway: number; pOver25: number };
  sharp: { home: number; draw: number; away: number } | null;
  notes: { gamestateNote: string | null; fatigueNote: string | null; refereeNote: string | null; lineupShockNote: string | null };
  /** v4.0 — اخبار زنده ESPN مرتبط با دو تیم (مستند واقعی برای استدلال) */
  liveNews?: DebateNewsDoc[];
}

function stripJson(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) s = s.slice(start, end + 1);
  return s;
}

// ─── سپر ضد 429 (v5.0): صف سراسری با فاصله حداقل ۱۵ ثانیه بین درخواست‌های LLM ───
// اسکن پس‌زمینه اصلاً به این مسیر نمی‌آید (موتور کمّی محلی)؛ فقط فراخوان دستی کاربر.

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function callLlm(system: string, user: string): Promise<string | null> {
  return runWithLlmSlot(async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const zai = await ZAI.create();
        const completion = await zai.chat.completions.create({
          messages: [
            { role: "assistant", content: system },
            { role: "user", content: user },
          ],
          thinking: { type: "disabled" },
        });
        const content = completion.choices[0]?.message?.content;
        return content && content.trim().length > 0 ? content : null;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("429") && attempt < 1) {
          await sleep(4000);
          continue;
        }
        // 429 پایدار = RateLimitedError تا فراخوان به موتور کمّی محلی fallback کند
        if (msg.includes("429")) throw new RateLimitedError(15_000);
        console.error("Debate LLM call failed:", err);
        return null;
      }
    }
    return null;
  });
}

const JSON_RULE = `خروجی تو باید "فقط و فقط" یک JSON معتبر باشد؛ بدون markdown، بدون متن اضافه.`;

function contextBlock(c: DebateContext): string {
  const n = c.notes;
  return `مسابقه: ${c.homeTeam} (میزبان) در برابر ${c.awayTeam} (میهمان) — ${c.league}
■ آمار: xG: ${c.homeXg}−${c.awayXg} | PPDA (کمتر = پرس بیشتر): ${c.homePpda}−${c.awayPpda} | Field Tilt: ${c.homeFieldTilt}٪−${c.awayFieldTilt}٪ | فرم: ${c.homeForm}−${c.awayForm} | آب‌وهوا: ${c.weather}
■ غیبت‌ها: ${c.homeTeam}: ${c.homeAbsence ?? "ندارد"} | ${c.awayTeam}: ${c.awayAbsence ?? "ندارد"}
■ انگیزه: ${c.homeMotivation ?? "-"} | ${c.awayMotivation ?? "-"}
■ یادداشت تاکتیکی: ${c.tacticalNote ?? "-"}
■ خروجی موتور دیکسون-کولز (تعدیل‌شده با وضعیت بازی/سفر/داور/ترکیب): λ = ${c.engine.lambdaHome.toFixed(2)}−${c.engine.lambdaAway.toFixed(2)} | برد میزبان ${(c.engine.pHome * 100).toFixed(1)}٪ / مساوی ${(c.engine.pDraw * 100).toFixed(1)}٪ / برد میهمان ${(c.engine.pAway * 100).toFixed(1)}٪ / بالای ۲.۵ = ${(c.engine.pOver25 * 100).toFixed(1)}٪
■ خط شارپ پیناکل بعد از حذف حاشیه شین: ${c.sharp ? `میزبان ${(c.sharp.home * 100).toFixed(1)}٪ / مساوی ${(c.sharp.draw * 100).toFixed(1)}٪ / میهمان ${(c.sharp.away * 100).toFixed(1)}٪` : "در دسترس نیست"}
■ تعدیل‌های زمینه‌ای: ${[n.gamestateNote, n.fatigueNote, n.refereeNote, n.lineupShockNote].filter(Boolean).join(" | ") || "ندارد"}
${newsBlock(c)}`;
}

/** بلوک اخبار زنده ESPN — مستند واقعی برای الصاق به استدلال ایجنت‌ها */
function newsBlock(c: DebateContext): string {
  if (!c.liveNews || c.liveNews.length === 0) return "■ اخبار زنده: موردی مرتبط یافت نشد";
  return [
    "■ اخبار زنده ESPN (مستند واقعی — موظفی به استفاده در استدلال‌های مرتبط):",
    ...c.liveNews.map(
      (n) =>
        `  • [${n.side === "HOME" ? c.homeTeam : c.awayTeam}] ${n.headline}${n.description ? ` — ${n.description.slice(0, 160)}` : ""}`
    ),
  ].join("\n");
}

export async function runBullAgent(c: DebateContext): Promise<Brief> {
  const system = `تو «ایجنت گاو» (Bull Agent) هستی؛ وکیل مدافع سناریوی خوش‌بینانه. وظیفه‌ات یافتن قوی‌ترین دلایل آماری و تاکتیکی برای برد میزبان یا پرگل شدن بازی است. استدلال‌ها باید مبتنی بر داده‌های ارائه‌شده باشد، نه شعار. ${JSON_RULE}
ساختار JSON: { "thesis": "جمله اصلی استدلال", "arguments": ["استدلال ۱", "استدلال ۲"], "factorDeltas": { "home": 0.04, "draw": -0.02, "away": -0.02, "over25": 0.05 }, "confidence": 0.65 }
factorDeltas: پیشنهاد جابه‌جایی احتمال نسبت به خروجی موتور (حداکثر ±۰.۱۵).`;

  const user = `${contextBlock(c)}

قوی‌ترین پرونده را به نفع سناریوی صعودی (برد میزبان / بازی پرگل) بساز. اگر داده‌ها علیه توست، بهترین چرخش ممکن را پیدا کن.`;
  try {
    const raw = await callLlm(system, user);
    if (!raw) return { ...fallbackBrief(c, "BULL"), fallback: true };
    const parsed = BriefSchema.safeParse(JSON.parse(stripJson(raw)));
    return parsed.success ? parsed.data : { ...fallbackBrief(c, "BULL"), fallback: true };
  } catch (err) {
    if (err instanceof RateLimitedError) throw err; // v5.0 — صف پر: به موتور محلی منتقل شود
    return { ...fallbackBrief(c, "BULL"), fallback: true };
  }
}

export async function runBearAgent(c: DebateContext): Promise<Brief> {
  const system = `تو «ایجنت خرس» (Bear Agent) هستی؛ وکیل مدافع شیطان. وظیفه‌ات تخریب سناریوی خوش‌بینانه است: نقاط ضعف میزبان، خستگی سفر، آمار داور، خطر مساوی، بازی بسته و کم‌گل. استدلال‌ها باید از دل داده‌ها بیاید. ${JSON_RULE}
ساختار JSON: { "thesis": "جمله اصلی استدلال", "arguments": ["استدلال ۱"], "factorDeltas": { "home": -0.05, "draw": 0.03, "away": 0.02, "over25": -0.06 }, "confidence": 0.6 }`;

  const user = `${contextBlock(c)}

قوی‌ترین پرونده را علیه سناریوی صعودی بساز؛ مساوی و بازی بسته را جدی بگیر.`;
  try {
    const raw = await callLlm(system, user);
    if (!raw) return { ...fallbackBrief(c, "BEAR"), fallback: true };
    const parsed = BriefSchema.safeParse(JSON.parse(stripJson(raw)));
    return parsed.success ? parsed.data : { ...fallbackBrief(c, "BEAR"), fallback: true };
  } catch (err) {
    if (err instanceof RateLimitedError) throw err;
    return { ...fallbackBrief(c, "BEAR"), fallback: true };
  }
}

export async function runJudgeAgent(
  c: DebateContext,
  bull: Brief,
  bear: Brief,
  blend: { home: number; draw: number; away: number; over25: number }
): Promise<JudgeOutput | null> {
  const system = `تو «قاضی کمّی ارشد» (Chief Quantitative Judge) هستی. دو ایجنت گاو و خرس مناظره کرده‌اند؛ تو استدلال‌ها را وزن‌دهی می‌کنی و توزیع احتمال نهایی را صادر می‌کنی.
قواعد حیاتی:
1. احتمالات باید بین ترکیب موتور کمّی و خط شارپ پیناکل معقول بماند؛ از هر دو دور نشو (حداکثر انحراف مجاز از مرجع کمّی: ۸ واحد درصدی).
2. احتمال مساوی هیچ‌وقت زیر ۱۲٪ نرود. home + draw + away = 1.
3. ${JSON_RULE}
ساختار JSON: { "thesis": "حکم نهایی دو-سه جمله‌ای", "arguments": ["دلیل وزن‌دهی ۱"], "probabilities": { "home": 0.0, "draw": 0.0, "away": 0.0, "over25": 0.0 }, "confidence": 0.7 }`;

  const user = `${contextBlock(c)}

■ مرجع کمّی وزن‌دار (نقطه شروع تو): برد میزبان ${(blend.home * 100).toFixed(1)}٪ / مساوی ${(blend.draw * 100).toFixed(1)}٪ / برد میهمان ${(blend.away * 100).toFixed(1)}٪ / بالای ۲.۵ = ${(blend.over25 * 100).toFixed(1)}٪

■ استدلال ایجنت گاو: ${bull.thesis}
${bull.arguments.map((a) => "- " + a).join("\n")}

■ استدلال ایجنت خرس: ${bear.thesis}
${bear.arguments.map((a) => "- " + a).join("\n")}

حالا حکم نهایی را با توزیع احتمال اصلاح‌شده صادر کن.`;
  try {
    const raw = await callLlm(system, user);
    if (!raw) return null;
    const parsed = JudgeSchema.safeParse(JSON.parse(stripJson(raw)));
    return parsed.success ? parsed.data : null;
  } catch (err) {
    if (err instanceof RateLimitedError) throw err;
    return null;
  }
}

// ─── fallback قطعی وقتی LLM در دسترس نیست ───

function fallbackBrief(c: DebateContext, role: "BULL" | "BEAR"): Brief {
  if (role === "BULL") {
    return {
      thesis: `${c.homeTeam} با تکیه بر فشار خانگی و برتری xG (${c.homeXg} در برابر ${c.awayXg}) شانس بالاتری دارد؛ Field Tilt ${c.homeFieldTilt}٪ نشان‌دهنده کنترل یک‌سوم دفاعی حریف است.`,
      arguments: [
        `امید گل موتور پس از تعدیل‌ها: ${c.engine.lambdaHome.toFixed(2)} در برابر ${c.engine.lambdaAway.toFixed(2)}`,
        c.homeFieldTilt > c.awayFieldTilt ? `برتری Field Tilt به میزان ${c.homeFieldTilt - c.awayFieldTilt} واحد درصدی` : "میزبان در زمین خودش با پرس بالاتر بازی را می‌بندد",
        c.homeForm.includes("W") ? `فرم میزبان (${c.homeForm}) حاوی پیروزی‌های متوالی است` : "عمق ترکیب میزبان برای چرخش کافی است",
      ],
      factorDeltas: { home: 0.03, draw: -0.015, away: -0.015, over25: 0.03 },
      confidence: 0.6,
    };
  }
  return {
    thesis: `سناریوی خوش‌بینانه نادیده گرفتن ${c.awayTeam} است؛ PPDA ${c.awayPpda} و فرم (${c.awayForm}) سیگنال بلوک منظم می‌دهد و مساوی همیشه زنده است.`,
    arguments: [
      `احتمال مساوی طبق موتور: ${(c.engine.pDraw * 100).toFixed(1)}٪ — هرگز حذف نمی‌شود`,
      c.awayAbsence ? `با وجود غیبت (${c.awayAbsence})، بلوک دفاعی میهمان کم‌گل‌ترین بازار این بازی است` : "بلوک میانی میهمان برای شکستن تمپو کافی است",
      c.notes.fatigueNote ?? "ریسک تله‌های معمول بازار: زیر ۲.۵ گل با ارزش بیشتری نسبت به قیمت فعلی است",
    ],
    factorDeltas: { home: -0.03, draw: 0.02, away: 0.01, over25: -0.03 },
    confidence: 0.58,
  };
}
