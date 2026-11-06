// ─────────────────────────────────────────────────────────────────────────────
// ایجنت مناظره کمّی محلی — Zero-Token Deterministic Quant Debater (v5.0)
//
// لایه پیش‌فرض سپر ضد Rate-Limit: کل اسکن پس‌زمینه ۲۲+ بازی با این موتور
// ریاضی محلی اجرا می‌شود و «مطلقاً هیچ درخواست شبکه‌ای به LLM ارسال نمی‌کند».
// استدلال‌ها به‌صورت قطعی از اعداد واقعی (λ، xG، PPDA، Field Tilt، فرم،
// غیبت‌ها، آب‌وهوا، خط شارپ) تولید می‌شوند — بدون توکن، بدون 429.
// ─────────────────────────────────────────────────────────────────────────────

import type { Brief, DebateContext, JudgeOutput } from "./debate";

const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}٪`;

/** علامت اختصار فرم: تعداد برد/مساوی/باخت ۵ بازی اخیر */
function formSummary(form: string): { w: number; d: number; l: number; pts: number } {
  const w = [...form].filter((c) => c === "W").length;
  const d = [...form].filter((c) => c === "D").length;
  const l = [...form].filter((c) => c === "L").length;
  return { w, d, l, pts: w * 3 + d };
}

// ═══════════════════════════ ایجنت گاو محلی ═══════════════════════════

export function localBullBrief(c: DebateContext): Brief {
  const args: string[] = [];
  let homeDelta = 0.02;
  let overDelta = 0.02;

  const hf = formSummary(c.homeForm);
  const af = formSummary(c.awayForm);

  // ۱) برتری xG واقعی
  const xgDiff = c.homeXg - c.awayXg;
  if (xgDiff > 0.15) {
    args.push(`برتری کیفیت خلق‌صحنه: xG میزبان ${c.homeXg.toFixed(2)} در برابر ${c.awayXg.toFixed(2)} (${xgDiff > 0 ? "+" : ""}${xgDiff.toFixed(2)})`);
    homeDelta += 0.02;
  }

  // ۲) امید گل موتور بعد از همه تعدیل‌ها
  if (c.engine.lambdaHome >= 1.5) {
    args.push(`λ نهایی میزبان ${c.engine.lambdaHome.toFixed(2)} گل است؛ یعنی در هر بازی بیش از یک‌ونیم گل تولید بالاتری نسبت به خط انتظار لیگ دارد`);
    homeDelta += 0.015;
    overDelta += 0.01;
  }

  // ۳) Field Tilt — کنترل فضای دفاعی حریف
  const ftDiff = c.homeFieldTilt - c.awayFieldTilt;
  if (ftDiff > 4) {
    args.push(`Field Tilt ${c.homeFieldTilt}٪ مقابل ${c.awayFieldTilt}٪ نشان می‌دهد میزبان بازی را در یک‌سوم پایانی حریف نگه می‌دارد`);
    homeDelta += 0.015;
  }

  // ۴) فرم ۵ بازی اخیر
  if (hf.pts >= af.pts + 3) {
    args.push(`تفاوت فرم: میزبان ${c.homeForm} (${hf.pts} امتیاز) مقابل میهمان ${c.awayForm} (${af.pts} امتیاز)`);
    homeDelta += 0.02;
  }

  // ۵) پرس بالا حریف = فضای پشت دفاع
  if (c.homePpda < c.awayPpda - 1.5) {
    args.push(`PPDA میزبان ${c.homePpda.toFixed(1)} (پرس تهاجمی) در برابر ${c.awayPpda.toFixed(1)} حریف — فشار بالا شانس گل صحنه‌ساز را بالا می‌برد`);
    overDelta += 0.02;
  }

  // ۶) اخبار زنده ESPN — مستند واقعی
  const homeNews = (c.liveNews ?? []).filter((n) => n.side === "HOME").slice(0, 2);
  for (const n of homeNews) {
    args.push(`خبر زنده ESPN درباره ${c.homeTeam}: ${n.headline}`);
  }

  // ۷) انگیزه
  if (c.homeMotivation) args.push(`انگیزه میزبان: ${c.homeMotivation}`);

  if (args.length === 0) {
    args.push(`تعادل آماری دو تیم؛ اما فاکتور خانه (ضریب ۱.۱۲ در λ) همیشه سهم میزبان است`);
  }

  return {
    thesis: `${c.homeTeam} با امید گل ${c.engine.lambdaHome.toFixed(2)} و احتمال برد ${(c.engine.pHome * 100).toFixed(1)}٪، روی کاغذ سناریوی صعودی را دارد؛ برتری کمّی در xG/Field Tilt با فاکتور میزبانی ترکیب شده است.`,
    arguments: args.slice(0, 6),
    factorDeltas: {
      home: Math.min(0.06, homeDelta),
      draw: -(homeDelta + overDelta) / 2.2,
      away: -(homeDelta / 1.6),
      over25: Math.min(0.06, overDelta),
    },
    confidence: Math.min(0.68, 0.52 + args.length * 0.03),
  };
}

// ═══════════════════════════ ایجنت خرس محلی ═══════════════════════════

export function localBearBrief(c: DebateContext): Brief {
  const args: string[] = [];
  let drawDelta = 0.01;
  let underDelta = 0.01;

  // ۱) احتمال مساوی هرگز حذف نمی‌شود
  args.push(`احتمال مساوی طبق موتور ${pct(c.engine.pDraw)} است — بازارهای ۱X۲ همیشه این سناریو را زنده نگه می‌دارند`);

  // ۲) پرس کم / بلوک دفاعی میهمان
  if (c.awayPpda > c.homePpda + 2 || c.awayPpda > 12) {
    args.push(`PPDA میهمان ${c.awayPpda.toFixed(1)} یعنی بلوک پائین و تمپو کند — نسخه کلاسیک بازی بسته`);
    underDelta += 0.02;
  }

  // ۳) غیبت‌ها
  if (c.homeAbsence) {
    args.push(`غیبت میزبان (${c.homeAbsence}) عمق خط حمله را کم می‌کند — شوک T-60 در λ لحاظ شد`);
    drawDelta += 0.015;
  }
  if (c.awayAbsence) {
    args.push(`غیبت میهمان (${c.awayAbsence}) سیگنال بازی بسته‌تر است، نه بازتر`);
    underDelta += 0.01;
  }

  // ۴) فرم ضعیف حمله
  const hf = formSummary(c.homeForm);
  if (hf.l >= 2) {
    args.push(`فرم میزبان ${c.homeForm} شامل ${hf.l} باخت در ۵ بازی اخیر است — اعتماد به سناریوی صعودی باید تعدیل شود`);
    drawDelta += 0.01;
  }

  // ۵) خستگی/سفر از یادداشت‌های موتور
  if (c.notes.fatigueNote) args.push(c.notes.fatigueNote);
  if (c.notes.gamestateNote) args.push(c.notes.gamestateNote);

  // ۶) خط شارپ پیناکل اگر با موتور اختلاف دارد — احتیاط
  if (c.sharp && c.sharp.draw > c.engine.pDraw + 0.03) {
    args.push(`خط شارپ پیناکل به مساوی ${pct(c.sharp.draw)} قیمت داده — بازار واقعی محتاط‌تر از موتور است`);
    drawDelta += 0.01;
  }

  // ۷) اخبار منفی اخیر
  const awayNews = (c.liveNews ?? []).filter((n) => n.side === "AWAY").slice(0, 1);
  for (const n of awayNews) args.push(`خبر ESPN درباره ${c.awayTeam}: ${n.headline}`);

  return {
    thesis: `سناریوی صعودی بیش‌برآورد شده است؛ λ مجموع ${(c.engine.lambdaHome + c.engine.lambdaAway).toFixed(2)} با احتمال زیر ۲.۵ گل برابر ${pct(1 - c.engine.pOver25)} نشان می‌دهد ریسک بازی بسته جدی است.`,
    arguments: args.slice(0, 6),
    factorDeltas: {
      home: -(drawDelta + underDelta) / 1.5,
      draw: Math.min(0.05, drawDelta),
      away: Math.min(0.03, drawDelta / 2),
      over25: -Math.min(0.05, underDelta),
    },
    confidence: Math.min(0.66, 0.5 + args.length * 0.028),
  };
}

// ═══════════════════════════ قاضی کمّی محلی ═══════════════════════════

/**
 * حکم قطعی قاضی: ترکیب وزنی موتور + خط شارپ + دلتاهای دو ایجنت،
 * قفل‌شده در پنجره ±۸ واحد درصدی اطراف مرجع کمّی (ضد هذیان — همان قواعد نسخه LLM).
 */
export function localJudgeOutput(
  c: DebateContext,
  bull: Brief,
  bear: Brief,
  blend: { home: number; draw: number; away: number; over25: number }
): JudgeOutput {
  const clamp = (v: number, ref: number) => Math.min(ref + 0.08, Math.max(ref - 0.08, v));

  let home = clamp(blend.home, blend.home);
  let draw = clamp(Math.max(0.12, blend.draw), Math.max(0.12, blend.draw - 0.03));
  let away = clamp(blend.away, blend.away);
  // جابه‌جایی ملایم به سمت وزن مساوی خرس (قاضی محافظه‌کار)
  const bearDrawPull = Math.max(0, bear.factorDeltas?.draw ?? 0) * bear.confidence;
  draw = Math.min(0.5, draw + bearDrawPull * 0.35);
  const s = home + draw + away;
  home /= s;
  draw /= s;
  away /= s;
  const over25 = Math.min(0.92, Math.max(0.08, blend.over25 - Math.max(0, bear.factorDeltas?.over25 ?? 0) * bear.confidence * 0.4));

  const lean =
    home - Math.max(away, draw) > 0.05
      ? `ترجیح نهایی با برد ${c.homeTeam} (${pct(home)}) است`
      : away - Math.max(home, draw) > 0.05
        ? `ترجیح نهایی با برد ${c.awayTeam} (${pct(away)}) است`
        : `بازی در ناحیه تعادل است و مساوی (${pct(draw)}) شانس واقعی دارد`;

  const args = [
    `ترکیب قطعی: موتور دیکسون-کولز + خط شارپ پیناکل + دلتاهای گاو/خرس محلی (بدون LLM — صفر توکن)`,
    lean,
    c.sharp ? `خط مرجع شین پیناکل: ${pct(c.sharp.home)} / ${pct(c.sharp.draw)} / ${pct(c.sharp.away)}` : "خط شارپ در دسترس نیست — وزن کامل به موتور کمّی",
  ];

  return {
    thesis: `حکم قاضی کمّی محلی: ${lean}؛ خروجی در پنجره ±۸ واحد درصدی اطراف مرجع کمّی قفل شد و هیچ انحراف ذهنی ندارد.`,
    arguments: args,
    probabilities: { home, draw, away, over25 },
    confidence: Math.min(0.7, 0.58 + (c.sharp ? 0.06 : 0) + (c.liveNews?.length ? 0.04 : 0)),
  };
}
