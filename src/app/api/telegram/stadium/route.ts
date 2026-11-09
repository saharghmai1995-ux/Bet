import { NextResponse } from "next/server";
import { listStadiumBackgrounds, saveStadiumBackground, clearStadiumBackground, getStadiumBackground, STADIUM_KINDS, type StadiumKind } from "@/lib/server/stadium-store";

export const dynamic = "force-dynamic";

const isKind = (v: unknown): v is StadiumKind => typeof v === "string" && (STADIUM_KINDS as readonly string[]).includes(v);

/**
 * GET /api/telegram/stadium              → وضعیت ۵ قالب (JSON)
 * GET /api/telegram/stadium?kind=X&raw=1 → خود فایل PNG قالب (پیش‌نمایش پنل)
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const kind = url.searchParams.get("kind");
    if (url.searchParams.get("raw") === "1" && isKind(kind)) {
      const buf = await getStadiumBackground(kind);
      if (!buf) return new NextResponse("not found", { status: 404 });
      return new NextResponse(new Uint8Array(buf), {
        headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
      });
    }
    const data = await listStadiumBackgrounds();
    return NextResponse.json({ success: true, ...data });
  } catch (error) {
    console.error("GET /api/telegram/stadium error:", error);
    return NextResponse.json({ success: false, templates: [], dir: "", error: "خطا در خواندن قالب‌ها" }, { status: 500 });
  }
}

/**
 * POST /api/telegram/stadium
 * آپلود یک قالب استادیومی — بدنه: { kind, dataUrl } (data URL تصویر)
 * v12.0 — پس از آپلود، همه کارت‌های کانال @aineobet روی همین پس‌زمینه چاپ می‌شوند
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { kind?: unknown; dataUrl?: unknown };
    if (!isKind(body.kind)) {
      return NextResponse.json({ success: false, error: `kind نامعتبر — یکی از: ${STADIUM_KINDS.join(", ")}` }, { status: 400 });
    }
    if (typeof body.dataUrl !== "string" || body.dataUrl.length < 64) {
      return NextResponse.json({ success: false, error: "تصویری ارسال نشده است" }, { status: 400 });
    }
    const res = await saveStadiumBackground(body.kind, body.dataUrl);
    if (!res.ok) return NextResponse.json({ success: false, error: res.error ?? "آپلود ناموفق" }, { status: 400 });
    const data = await listStadiumBackgrounds();
    return NextResponse.json({ success: true, bytes: res.bytes, ...data });
  } catch (error) {
    console.error("POST /api/telegram/stadium error:", error);
    return NextResponse.json({ success: false, error: "خطای سرور در آپلود قالب" }, { status: 500 });
  }
}

/**
 * DELETE /api/telegram/stadium?kind=PRE_MATCH
 * حذف قالب — بازگشت به پس‌زمینه برداری پیش‌فرض
 */
export async function DELETE(req: Request) {
  try {
    const kind = new URL(req.url).searchParams.get("kind");
    if (!isKind(kind)) {
      return NextResponse.json({ success: false, error: "kind نامعتبر" }, { status: 400 });
    }
    await clearStadiumBackground(kind);
    const data = await listStadiumBackgrounds();
    return NextResponse.json({ success: true, ...data });
  } catch (error) {
    console.error("DELETE /api/telegram/stadium error:", error);
    return NextResponse.json({ success: false, error: "خطا در حذف قالب" }, { status: 500 });
  }
}
