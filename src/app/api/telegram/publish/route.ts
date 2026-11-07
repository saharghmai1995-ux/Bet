import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { issueSlip } from "@/lib/server/liveDataService";
import { publishSlipToTelegram, type PublishMode } from "@/lib/server/telegram-service";
import type { IssueSlipItemDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/telegram/publish
 * انتشار فلش‌کارت به کانال تلگرام VIP:
 *   mode = "CARD"   → کارت کامل (تیپ A + تیپ B + داچینگ + SHA-256 + لینک ESPN)
 *   mode = "TEASER" → تیزر جذب مشترک (تیپ B سانسور 🔒 [مخصوص اعضای کانال VIP])
 * بدنه: { item: IssueSlipItemDTO, mode }
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { item?: IssueSlipItemDTO; mode?: PublishMode };
    if (!body.item) {
      return NextResponse.json({ success: false, error: "آیتم کارت ارسال نشد" }, { status: 400 });
    }
    const mode: PublishMode = body.mode === "TEASER" ? "TEASER" : "CARD";

    // صدور/بازیابی کارت (Idempotent با هش SHA-256) → سپس انتشار
    const { slip } = await issueSlip(body.item);
    const row = await db.issuedSlip.findUnique({ where: { hash: slip.hash } });
    if (!row) {
      return NextResponse.json({ success: false, error: "کارت ثبت نشد" }, { status: 500 });
    }

    const result = await publishSlipToTelegram(row, mode);
    return NextResponse.json({
      success: result.ok,
      mode,
      hash: slip.hash,
      detail: result.detail,
      preview: result.preview,
      notConfigured: result.detail === "TELEGRAM_NOT_CONFIGURED",
    });
  } catch (error) {
    console.error("POST /api/telegram/publish error:", error);
    return NextResponse.json({ success: false, error: "خطا در انتشار به کانال تلگرام" }, { status: 500 });
  }
}
