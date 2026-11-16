import { NextRequest, NextResponse } from "next/server";
import { issueSlip } from "@/lib/server/liveDataService";
import { leagueGate } from "@/lib/leagues-catalog";
import type { IssueSlipItemDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/settlement/issue
 * صدور کارت‌های سبد فلش‌کارت به کارنامه — با هش SHA-256 (Idempotent).
 * بدنه: { items: IssueSlipItemDTO[] }
 * ═══ v20.0 — گایت لیگ بلک‌لیست در صدور دستی (سند §۴-۲) ═══
 * هیچ مسابقه‌ای از لیگ‌های بلک‌لیست (fifa.friendly / esp.2 / usa.1) در هیچ بخشی
 * از سایت مهر تایید نمی‌گیرد — صدور دستی هم دقیقاً همان گیت صدور خودکار را دارد.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { items?: IssueSlipItemDTO[] };
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) {
      return NextResponse.json({ success: false, error: "هیچ کارتی برای صدور ارسال نشد" }, { status: 400 });
    }

    const results: { match: string; created: boolean; hash: string; status: string }[] = [];
    const rejected: { match: string; reason: string }[] = [];

    for (const item of items) {
      // ═══ v20.0 — گایت لیگ سمّی/خارج وایت‌لیست (فیلترهای دوگانه: slug و نام لیگ) ═══
      const rawSlug = String((item.match as { externalId?: string | null })?.externalId ?? "");
      const slugMatch = rawSlug.match(/^espn-([a-z0-9.]+)-\d+$/i);
      const slug = slugMatch ? slugMatch[1].toLowerCase() : "";
      const leagueName = String((item.match as { league?: string | null })?.league ?? "");
      const gate = leagueGate(slug || leagueName.toLowerCase(), leagueName || slug);
      // اگر slug شناخته نشد اما نام لیگ معتبر بود، گیت بر اساس نام را هم بپذیر
      const gateFinal = slug ? gate : leagueGate(leagueName.toLowerCase(), leagueName);
      if (gateFinal.veto) {
        rejected.push({ match: `${item.match.homeTeam} × ${item.match.awayTeam}`, reason: gateFinal.reason });
        continue;
      }

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

    return NextResponse.json({
      success: results.length > 0,
      issued: results.length,
      rejectedCount: rejected.length,
      rejected,
      results,
    });
  } catch (error) {
    console.error("POST /api/settlement/issue error:", error);
    return NextResponse.json({ success: false, error: "خطا در صدور کارت" }, { status: 500 });
  }
}
