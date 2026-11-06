import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * POST /api/webhook/odds — اتصال وب‌هوک و API زنده
 * دریافت به‌روزرسانی ضرایب از فیدهای بیرونی (Odds Tracker / Dropping Odds)
 * body: { matchId, oddsHome?, oddsDraw?, oddsAway?, oddsOver25?, oddsUnder25?, odds1x? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const matchId: string | undefined = body.matchId;
    if (!matchId) {
      return NextResponse.json({ success: false, error: "matchId الزامی است" }, { status: 400 });
    }

    const match = await db.match.findUnique({ where: { id: matchId } });
    if (!match) {
      return NextResponse.json({ success: false, error: "بازی یافت نشد" }, { status: 404 });
    }

    const num = (v: unknown, min = 1.01, max = 100): number | undefined => {
      const n = Number(v);
      if (!Number.isFinite(n)) return undefined;
      return Math.min(max, Math.max(min, n));
    };

    const data: Record<string, number> = {};
    const oh = num(body.oddsHome);
    const od = num(body.oddsDraw);
    const oa = num(body.oddsAway);
    const oo = num(body.oddsOver25);
    const ou = num(body.oddsUnder25);
    const o1x = num(body.odds1x);
    if (oh !== undefined) data.oddsHome = oh;
    if (od !== undefined) data.oddsDraw = od;
    if (oa !== undefined) data.oddsAway = oa;
    if (oo !== undefined) data.oddsOver25 = oo;
    if (ou !== undefined) data.oddsUnder25 = ou;
    if (o1x !== undefined) data.odds1x = o1x;

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ success: false, error: "هیچ فیلد ضرایب معتبری ارسال نشد" }, { status: 400 });
    }

    const updated = await db.match.update({ where: { id: matchId }, data });

    const drops: string[] = [];
    if (oh !== undefined && oh < match.oddsHome) drops.push(`1: ${match.oddsHome.toFixed(2)}→${oh.toFixed(2)}`);
    if (od !== undefined && od < match.oddsDraw) drops.push(`X: ${match.oddsDraw.toFixed(2)}→${od.toFixed(2)}`);
    if (oa !== undefined && oa < match.oddsAway) drops.push(`2: ${match.oddsAway.toFixed(2)}→${oa.toFixed(2)}`);
    if (oo !== undefined && oo < match.oddsOver25) drops.push(`O2.5: ${match.oddsOver25.toFixed(2)}→${oo.toFixed(2)}`);
    if (ou !== undefined && ou < match.oddsUnder25) drops.push(`U2.5: ${match.oddsUnder25.toFixed(2)}→${ou.toFixed(2)}`);

    return NextResponse.json({
      success: true,
      matchId,
      updated: data,
      drops,
      message: drops.length
        ? `افت ضریب ثبت شد (Sharp Money): ${drops.join(" | ")} — مدل را دوباره اجرا کنید`
        : "ضرایب به‌روزرسانی شد",
    });
  } catch (error) {
    console.error("POST /api/webhook/odds error:", error);
    return NextResponse.json({ success: false, error: "خطا در پردازش وب‌هوک" }, { status: 500 });
  }
}
