import { NextRequest, NextResponse } from "next/server";
import { issueSlip } from "@/lib/server/liveDataService";
import type { IssueSlipItemDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/settlement/issue
 * صدور کارت‌های سبد فلش‌کارت به کارنامه — با هش SHA-256 (Idempotent).
 * بدنه: { items: IssueSlipItemDTO[] }
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { items?: IssueSlipItemDTO[] };
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) {
      return NextResponse.json({ success: false, error: "هیچ کارتی برای صدور ارسال نشد" }, { status: 400 });
    }
    const results: { match: string; created: boolean; hash: string; status: string }[] = [];
    for (const item of items) {
      try {
        const { created, slip } = await issueSlip(item);
        results.push({
          match: `${slip.homeTeam} × ${slip.awayTeam}`,
          created,
          hash: slip.hash,
          status: slip.status,
        });
      } catch (err) {
        console.error("issue slip item failed:", err);
      }
    }
    return NextResponse.json({ success: results.length > 0, issued: results.length, results });
  } catch (error) {
    console.error("POST /api/settlement/issue error:", error);
    return NextResponse.json({ success: false, error: "خطا در صدور کارت" }, { status: 500 });
  }
}
