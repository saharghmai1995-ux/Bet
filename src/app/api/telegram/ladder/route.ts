import { NextResponse } from "next/server";
import { renderRolloverLadderPNG } from "@/lib/server/card-render";
import { getStadiumBackground } from "@/lib/server/stadium-store";
import { telegramStatus, sendBroadcastPhoto } from "@/lib/server/telegram-service";

export const dynamic = "force-dynamic";

/** فرار HTML برای کپشن تلگرام */
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** یک پله نردبان مرکب — از فلش‌کارت کلاینت */
interface LadderStepInput {
  homeTeam: string;
  awayTeam: string;
  league: string;
  kickoffIso: string;
  oddsA: number;
  oddsB: number;
  marginPct: number;
  /** v18.0 — نام مارکت تیپ A/B برای چاپ روی پوستر (انگلیسی — ترجیح) */
  tipA?: string;
  tipB?: string;
}

/**
 * POST /api/telegram/ladder
 * ✈️ ارسال «نردبان سود مرکب ۳ پله‌ای» به کانال @aineobet — پوستر انگلیسی PNG
 * ورودی: حداکثر ۳ پله از فلش‌کارت‌های تاییدشده ریسک زیر ۱۰٪ (کلاینت انتخاب می‌کند)
 * اعتبارسنجی سرور: حداکثر ۳ پله · فاصله ≥ ۲ ساعت · مارجین مثبت
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { steps?: LadderStepInput[]; startBank?: number };
    const raw = Array.isArray(body.steps) ? body.steps : [];
    const steps = raw.slice(0, 3).filter(
      (s) =>
        typeof s?.homeTeam === "string" &&
        typeof s?.awayTeam === "string" &&
        typeof s?.kickoffIso === "string" &&
        Number.isFinite(s?.oddsA) &&
        Number.isFinite(s?.oddsB) &&
        Number.isFinite(s?.marginPct) &&
        s.marginPct > 0
    );
    if (steps.length < 2) {
      return NextResponse.json({ success: false, error: "حداقل ۲ پله معتبر لازم است" }, { status: 400 });
    }
    // گیت فاصله ≥ ۲ ساعت بین پله‌های متوالی
    const times = steps.map((s) => new Date(s.kickoffIso).getTime()).sort((a, b) => a - b);
    for (let i = 1; i < times.length; i++) {
      if (times[i] - times[i - 1] < 2 * 3600_000) {
        return NextResponse.json({ success: false, error: "فاصله شروع پله‌ها باید حداقل ۲ ساعت باشد" }, { status: 400 });
      }
    }

    const startBank = Math.max(1, Math.min(10_000, Number(body.startBank) || 100));
    const finalBank = steps.reduce((b, s) => b * (1 + s.marginPct / 100), startBank);
    const totalGrowthPct = (finalBank / startBank - 1) * 100;

    const fmt = (iso: string) =>
      new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Tehran" }).format(
        new Date(iso)
      );
    const dateLabelEn = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Tehran" }).format(
      new Date(times[0])
    );

    const photo = await renderRolloverLadderPNG({
      dateLabelEn,
      steps: steps.map((s, i) => ({
        index: i + 1,
        kickoffEn: fmt(s.kickoffIso),
        teams: `${s.homeTeam} vs ${s.awayTeam}`,
        league: s.league ?? "",
        oddsA: s.oddsA,
        oddsB: s.oddsB,
        marginPct: s.marginPct,
        // v18.0 — تیپ‌های هر پله روی پوستر (پاسخ مستقیم «تیپ‌ها مشخص نشده‌اند»)
        tipA: typeof s.tipA === "string" && s.tipA.trim() ? s.tipA.trim() : undefined,
        tipB: typeof s.tipB === "string" && s.tipB.trim() ? s.tipB.trim() : undefined,
      })),
      startBank,
      finalBank: Math.round(finalBank * 10) / 10,
      totalGrowthPct: Math.round(totalGrowthPct * 10) / 10,
      principalLock: false,
    });

    const status = await telegramStatus();
    if (!status.configured || !status.channelSet) {
      return NextResponse.json({ success: false, notConfigured: true, error: "اتصال تلگرام تنظیم نشده است" });
    }
    const caption =
      `🪜 <b>NEOBET QUANT PRO • @AINEOBET — Daily Compound Rollover Plan</b>\n` +
      `${steps.length} پله روی کارت‌های تاییدشده ریسک زیر ۱۰٪ · ورود ${startBank} واحد → خروج هدف ${finalBank.toFixed(1)} واحد (+${totalGrowthPct.toFixed(1)}٪)\n` +
      steps
        .map(
          (s, i) =>
            `${i + 1}. ${esc(s.homeTeam)} × ${esc(s.awayTeam)} — تیپ A: ${esc(s.tipA ?? "—")} @${s.oddsA.toFixed(2)} · تیپ B: ${esc(s.tipB ?? "—")} @${s.oddsB.toFixed(2)} · پوشش +${s.marginPct.toFixed(1)}٪`
        )
        .join("\n") +
      `\n🔒 هر پله پیش از شروع پله بعد تسویه و برداشت می‌شود — گیت سخت ریسک اتمیک v16.0 (۱۰.۵٪).`;
    const stadium = (await getStadiumBackground("DAILY_REPORT")) !== null;
    const res = await sendBroadcastPhoto(photo, caption, `rollover-ladder-${Date.now()}.png`, stadium);
    return NextResponse.json({ success: res.ok, detail: res.detail, finalBank: Math.round(finalBank * 10) / 10, totalGrowthPct: Math.round(totalGrowthPct * 10) / 10 });
  } catch (error) {
    console.error("POST /api/telegram/ladder error:", error);
    return NextResponse.json({ success: false, error: "خطای سرور در ساخت پوستر نردبان" }, { status: 500 });
  }
}
