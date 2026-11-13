import { NextRequest, NextResponse } from "next/server";
import {
  funnelStatus,
  sendDailyGiftCard,
  sendHourlyVipAd,
  sendNightlyPnl,
  sendDailyDigest,
  sendWinRateReport,
  // v18.0 — ایجنت سوپروایزر تلگرام
  sendVipMorningBrief,
  sendBetTermLesson,
  sendFootballNews,
  sendWeeklyDigest,
} from "@/lib/server/telegram-service";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * GET /api/telegram/funnel — وضعیت خط لوله کانال‌ها برای کنسول ایجنت مدیر کانال (v13.5 + v18.0)
 * POST /api/telegram/funnel — اجرای دستی پست‌ها:
 *   { action: "gift" }    → کارت رایگان روزانه (اولویت دژ نفوذناپذیر) → کانال عمومی
 *   { action: "ad" }      → بنر بازاریابی ساعتی (موضوع چرخشی) → کانال عمومی
 *   { action: "digest" }  → کارت نتیجه برایند روزانه → هر دو کانال
 *   { action: "winrate" } → گزارش وین‌ریت تصویری → کانال عمومی
 *   { action: "pnl" }     → برآیند واقعی شب با افراز مجزا → کانال عمومی
 *   { action: "brief" }   → بریفینگ صبح VIP (کارت‌های امروز + توصیه‌ها) → کانال VIP
 *   { action: "news" }    → خبرهای مهم فوتبال (وایر ESPN) → کانال عمومی
 *   { action: "edu" }     → درس آکادمی اصطلاحات BET → کانال عمومی
 *   { action: "weekly" }  → گزارش هفتگی با افراز مجزا → هر دو کانال
 */
export async function GET() {
  try {
    const status = await funnelStatus();
    return NextResponse.json({ success: true, ...status });
  } catch (error) {
    console.error("GET /api/telegram/funnel error:", error);
    return NextResponse.json({ success: false, error: "خطا در خواندن وضعیت خط لوله کانال‌ها" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { action?: string; slot?: number };
    const slot = Number(body.slot) === 1 ? 1 : 0;
    switch (body.action) {
      case "gift": {
        const r = await sendDailyGiftCard(true);
        return NextResponse.json({ success: r.ok, detail: r.ok ? `کارت رایگان روزانه به کانال عمومی ارسال شد (${r.detail})` : `ارسال نشد: ${r.detail}` });
      }
      case "ad": {
        const r = await sendHourlyVipAd(true);
        return NextResponse.json({ success: r.ok, detail: r.ok ? `بنر بازاریابی «${r.topic}» به کانال عمومی ارسال شد` : `ارسال نشد: ${r.detail}` });
      }
      case "digest": {
        const ok = await sendDailyDigest(true);
        return NextResponse.json({ success: ok, detail: ok ? "کارت نتیجه برایند روزانه به هر دو کانال (عمومی + VIP) ارسال شد" : "ارسال ناموفق — اتصال تلگرام را بررسی کنید" });
      }
      case "winrate": {
        const ok = await sendWinRateReport(true);
        return NextResponse.json({ success: ok, detail: ok ? "گزارش وین‌ریت به کانال عمومی ارسال شد" : "ارسال ناموفق — اتصال تلگرام را بررسی کنید" });
      }
      case "pnl": {
        const ok = await sendNightlyPnl(true);
        return NextResponse.json({ success: ok, detail: ok ? "برآیند شبانه با افراز مجزا ارسال شد" : "ارسال ناموفق — اتصال تلگرام را بررسی کنید" });
      }
      case "brief": {
        const r = await sendVipMorningBrief(true);
        return NextResponse.json({ success: r.ok, detail: r.ok ? `بریفینگ صبح VIP به کانال اعضا ارسال شد (${r.detail})` : `ارسال نشد: ${r.detail}` });
      }
      case "news": {
        const r = await sendFootballNews(true, slot);
        return NextResponse.json({ success: r.ok, detail: r.ok ? `تخته خبرهای فوتبال به کانال عمومی ارسال شد (${r.detail})` : `ارسال نشد: ${r.detail}` });
      }
      case "edu": {
        const r = await sendBetTermLesson(true, slot);
        return NextResponse.json({ success: r.ok, detail: r.ok ? `درس آکادمی BET به کانال عمومی ارسال شد (${r.detail})` : `ارسال نشد: ${r.detail}` });
      }
      case "weekly": {
        const r = await sendWeeklyDigest(true);
        return NextResponse.json({ success: r.ok, detail: r.ok ? `گزارش هفتگی به هر دو کانال ارسال شد (${r.detail})` : `ارسال نشد: ${r.detail}` });
      }
      default:
        return NextResponse.json({ success: false, error: "action نامعتبر" }, { status: 400 });
    }
  } catch (error) {
    console.error("POST /api/telegram/funnel error:", error);
    return NextResponse.json({ success: false, error: "خطا در اجرای مدیر کانال" }, { status: 500 });
  }
}
