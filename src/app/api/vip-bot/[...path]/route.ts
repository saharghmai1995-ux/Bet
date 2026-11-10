// ─────────────────────────────────────────────────────────────────────────────
// 🤖 پروکسی Next.js → موتور اشتراک VIP (مینی‌سرویس bun روی پورت 3010)
// تمام مسیرهای /api/vip-bot/* به صورت server-to-server به سرویس ربات ارسال می‌شوند.
//   GET  /api/vip-bot/api/health
//   GET  /api/vip-bot/api/stats | members | payments | receipts | config
//   GET  /api/vip-bot/api/receipts/:id/photo   (نمایش فیش عکس در پنل)
//   POST /api/vip-bot/api/config | receipts/decide | selftest
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";

const VIP_BOT_BASE = process.env.VIP_BOT_URL ?? "http://127.0.0.1:3010";

type Ctx = { params: Promise<{ path: string[] }> };

async function proxy(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { path } = await ctx.params;
  const targetPath = (path ?? []).join("/");
  const search = req.nextUrl.search || "";

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const init: RequestInit = { method: req.method, headers, cache: "no-store" };
    if (req.method !== "GET" && req.method !== "HEAD") {
      init.body = await req.text();
    }

    const upstream = await fetch(`${VIP_BOT_BASE}/${targetPath}${search}`, {
      ...init,
      signal: AbortSignal.timeout(30_000),
    });

    // عبور شفاف بایت‌های فیش عکس
    const contentType = upstream.headers.get("content-type") ?? "application/json";
    if (contentType.startsWith("image/")) {
      const buf = await upstream.arrayBuffer();
      return new NextResponse(buf, {
        status: upstream.status,
        headers: { "Content-Type": contentType, "Cache-Control": "no-store" },
      });
    }

    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch (exc) {
    return NextResponse.json(
      {
        success: false,
        error: `سرویس ربات اشتراک VIP در دسترس نیست (${String(exc)})`,
        hint: "مینی‌سرویس mini-services/vip-bot باید روی پورت 3010 در حال اجرا باشد.",
      },
      { status: 502 }
    );
  }
}

export async function GET(req: NextRequest, ctx: Ctx) {
  return proxy(req, ctx);
}

export async function POST(req: NextRequest, ctx: Ctx) {
  return proxy(req, ctx);
}
