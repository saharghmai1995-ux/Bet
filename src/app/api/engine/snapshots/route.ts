import { NextResponse } from "next/server";
// v20.0 — هیدراتاسیون داشبورد از اسنپ‌شات‌های گرم سرور (De-Browserized)
// ریشه «داشبورد وابسته به مرورگر»: خط لوله lineup → مناظره → پرتفوی فقط با
// مرورگر باز اجرا می‌شد. حالا warmer سرور (دیمن :3011 + زمان‌بند Next) همین
// سه‌گانه را مستقل از مرورگر محاسبه و در EngineSnapshot ذخیره می‌کند؛ داشبورد
// با این GET در یک پاس هیدرات می‌شود — صفر محاسبه موتوری اجباری سمت کلاینت.
import { hydratedSnapshots } from "@/lib/server/engine-warmer";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await hydratedSnapshots();
    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/engine/snapshots error:", error);
    return NextResponse.json({ success: false, snapshots: [], warm: { lastWarmedAt: null, total: 0 }, error: "خطا در خواندن اسنپ‌شات‌های موتور" }, { status: 500 });
  }
}
