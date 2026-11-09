import { NextRequest, NextResponse } from "next/server";
import {
  funnelStatus,
  sendPublicRadar,
  sendFunnelTeasers,
  sendPublicUnblur,
  sendNightlyPnl,
} from "@/lib/server/telegram-service";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * GET /api/telegram/funnel — وضعیت کامل قیف کانال عمومی/VIP برای کنسول ایجنت مدیر کانال
 * POST /api/telegram/funnel — اجرای دستی پست‌های قیف:
 *   { action: "radar" }    → پست ۱: رادار شفافیت (۱۱:۰۰ تهران)
 *   { action: "teasers" }  → پست ۲: گیفت رایگان + تیزرهای قفل‌شده (T-60m)
 *   { action: "unblur" }   → پست ۳: بازگشایی قفل + اثبات SHA-256 (FT+5m)
 *   { action: "pnl" }      → پست ۴: برآیند واقعی شب با افراز مجزا (۲۳:۳۰ تهران)
 */
export async function GET() {
  try {
    const status = await funnelStatus();
    return NextResponse.json({ success: true, ...status });
  } catch (error) {
    console.error("GET /api/telegram/funnel error:", error);
    return NextResponse.json({ success: false, error: "خطا در خواندن وضعیت قیف" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { action?: string };
    switch (body.action) {
      case "radar": {
        const ok = await sendPublicRadar(true);
        return NextResponse.json({ success: ok, detail: ok ? "رادار شفافیت به کانال عمومی ارسال شد" : "ارسال ناموفق — اتصال تلگرام را بررسی کنید" });
      }
      case "teasers": {
        const r = await sendFunnelTeasers(true);
        return NextResponse.json({ success: r.gift || r.teasers > 0, detail: `گیفت: ${r.gift ? "ارسال شد" : "ارسال نشد"} · تیزر: ${r.teasers}` });
      }
      case "unblur": {
        const n = await sendPublicUnblur();
        return NextResponse.json({ success: true, detail: `${n} پست اثبات (بازگشایی قفل + نتیجه) ارسال شد` });
      }
      case "pnl": {
        const ok = await sendNightlyPnl(true);
        return NextResponse.json({ success: ok, detail: ok ? "برآیند شبانه با افراز مجزا ارسال شد" : "ارسال ناموفق — اتصال تلگرام را بررسی کنید" });
      }
      default:
        return NextResponse.json({ success: false, error: "action نامعتبر" }, { status: 400 });
    }
  } catch (error) {
    console.error("POST /api/telegram/funnel error:", error);
    return NextResponse.json({ success: false, error: "خطا در اجرای قیف" }, { status: 500 });
  }
}
