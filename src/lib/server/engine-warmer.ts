// ─────────────────────────────────────────────────────────────────────────────
// گرم‌کننده هسته موتور (Engine Core Warmer) — v20.0 De-Browserized Dashboard
//
// دستور کارفرما: «داشبورد و هسته موتور و ایجنت سوپروایزر تلگرام همچنان وابسته به
// مرورگر است، باید بررسی و راستی‌آزمایی شود تا سیستم گرم و پایدار بماند.»
//
// ریشه: خط لوله سه‌مرحله‌ای داشبورد (T-60/lineup → مناظره → پرتفوی) فقط داخل
// مرورگر اجرا می‌شد (use-autopilot) — با مرورگر بسته، هیچ پرتفوی/مناظره‌ای برای
// بازی‌های جدید ساخته نمی‌شد و داشبورد خالی می‌ماند.
//
// راه‌حل مهندسی v20.0: warmer سرور که «همان سه اندپوینت» را به‌صورت in-process
// فراخوانی می‌کند (بدون HTTP، بدون مرورگر) و خروجی را در EngineSnapshot ذخیره
// می‌کند؛ داشبورد با یک GET از همین اسنپ‌شات‌ها هیدرات می‌شود.
//
// اجراکننده‌ها (هر دو مستقل از مرورگر):
//   · دیمن پخش :3011 — در هر چرخه ۹۰ ثانیه‌ای (broadcast-cycle گام ۰.۵)
//   · زمان‌بند Next.js — تیک ۶۰۰ ثانیه‌ای (پشتیبان)
// anti-RSS: هر پاس حداکثر ۳ بازی × TTL تازگی ۱۰ دقیقه per-match.
// ─────────────────────────────────────────────────────────────────────────────

import { db } from "@/lib/db";

const WARM_TTL_MS = 10 * 60_000; // تازگی اسنپ‌شات هر بازی
const MAX_PER_PASS = 3; // بودجه RSS هر پاس — ضد OOM
const HORIZON_MS = 36 * 3600_000; // فقط بازی‌های ۳۶ ساعت آینده + LIVE

export interface EngineWarmResult {
  warmed: number;
  skippedFresh: number;
  failed: number;
  scanned: number;
}

type RouteMod = {
  POST: (req: Request) => Promise<Response>;
};

/** فراخوانی in-process یک Route Handler بدون HTTP و بدون مرورگر */
async function callRoute(mod: RouteMod, body: unknown): Promise<unknown> {
  const { NextRequest } = await import("next/server");
  const req = new NextRequest("http://neobet.internal/warm", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
  const res = await mod.POST(req as never);
  if (!res.ok) throw new Error(`route HTTP ${res.status}`);
  return await res.json();
}

/**
 * warmEngineSnapshots — گرم‌سازی سرورِ سه‌گانه داشبورد برای نزدیک‌ترین بازی‌ها:
 * lineup (LIGHT) → debate (LOCAL_QUANT — صفر توکن) → portfolio (مونت‌کارلو کاپولا).
 * هر بازی اگر اسنپ‌شات تازه (کمتر از ۱۰ دقیقه) داشته باشد skip می‌شود.
 */
export async function warmEngineSnapshots(source: "SERVER_DAEMON" | "SERVER_SCHEDULER" = "SERVER_DAEMON"): Promise<EngineWarmResult> {
  const out: EngineWarmResult = { warmed: 0, skippedFresh: 0, failed: 0, scanned: 0 };
  try {
    // بازی‌های هدف: زنده + پیش‌رو در افق ۳۶ ساعت — نزدیک‌ترین کیک‌آف اولویت دارد
    const horizon = new Date(Date.now() + HORIZON_MS);
    const liveCutoff = new Date(Date.now() - 3 * 3600_000);
    const targets = await db.match.findMany({
      where: {
        status: { in: ["UPCOMING", "ANALYZED", "LIVE"] },
        kickoff: { gte: liveCutoff, lte: horizon },
      },
      orderBy: { kickoff: "asc" },
      take: 14,
      select: { id: true },
    });
    out.scanned = targets.length;
    if (targets.length === 0) return out;

    // TTL per-match: فقط استال‌ها گرم می‌شوند
    const snaps = await db.engineSnapshot.findMany({
      where: { matchId: { in: targets.map((t) => t.id) } },
      select: { matchId: true, updatedAt: true },
    });
    const freshUntil = new Map<string, number>();
    for (const s of snaps) freshUntil.set(s.matchId, new Date(s.updatedAt).getTime() + WARM_TTL_MS);

    // قدیمی‌ترین‌ها اول — عدالت گرمایش بین بازی‌ها
    const stale = targets
      .filter((t) => (freshUntil.get(t.id) ?? 0) <= Date.now())
      .sort((a, b) => (freshUntil.get(a.id) ?? 0) - (freshUntil.get(b.id) ?? 0))
      .slice(0, MAX_PER_PASS);
    if (stale.length === 0) {
      out.skippedFresh = targets.length;
      return out;
    }

    const lineupMod = (await import("@/app/api/lineup/route")) as unknown as RouteMod;
    const debateMod = (await import("@/app/api/agent/debate/route")) as unknown as RouteMod;
    const portfolioMod = (await import("@/app/api/agent/portfolio/route")) as unknown as RouteMod;

    for (const t of stale) {
      try {
        // ۱) T-60 — ترکیب/آمار واقعی ESPN (LIGHT)
        let lineupJson: string | null = null;
        try {
          const lineup = (await callRoute(lineupMod, { matchId: t.id, depth: "LIGHT" })) as { success?: boolean };
          if (lineup?.success) lineupJson = JSON.stringify(lineup);
        } catch (err) {
          console.warn(`[engine-warmer] lineup failed for ${t.id}:`, err instanceof Error ? err.message : err);
        }

        // ۲) مناظره گاو/خرس/قاضی — موتور کمّی محلی (صفر LLM)
        let debateJson: string | null = null;
        try {
          const debate = (await callRoute(debateMod, { matchId: t.id, mode: "LOCAL_QUANT" })) as { success?: boolean };
          if (debate?.success) debateJson = JSON.stringify(debate);
        } catch (err) {
          console.warn(`[engine-warmer] debate failed for ${t.id}:`, err instanceof Error ? err.message : err);
        }

        // ۳) پرتفوی — مونت‌کارلو کاپولا + مسیریاب Bet-Type
        let portfolioJson: string | null = null;
        try {
          const portfolio = (await callRoute(portfolioMod, { matchId: t.id, bankroll: 1000 })) as { success?: boolean };
          if (portfolio?.success) portfolioJson = JSON.stringify(portfolio);
        } catch (err) {
          console.warn(`[engine-warmer] portfolio failed for ${t.id}:`, err instanceof Error ? err.message : err);
        }

        if (!lineupJson && !debateJson && !portfolioJson) {
          out.failed += 1;
          continue;
        }

        await db.engineSnapshot.upsert({
          where: { matchId: t.id },
          create: { matchId: t.id, lineup: lineupJson, debate: debateJson, portfolio: portfolioJson, warmSrc: source },
          update: { lineup: lineupJson ?? undefined, debate: debateJson ?? undefined, portfolio: portfolioJson ?? undefined, warmSrc: source },
        });
        out.warmed += 1;
      } catch (err) {
        out.failed += 1;
        console.warn(`[engine-warmer] match ${t.id} failed:`, err instanceof Error ? err.message : err);
      }
    }

    console.log(
      `[engine-warmer] v20.0 (${source}): warmed=${out.warmed} fresh=${out.skippedFresh} failed=${out.failed} of ${targets.length} targets`
    );
    return out;
  } catch (err) {
    console.warn("[engine-warmer] pass failed:", err instanceof Error ? err.message : err);
    return out;
  }
}

/**
 * hydratedSnapshots — خوراک هیدراتاسیون داشبورد:
 * همه اسنپ‌شات‌های تازه (کمتر از ۳۰ دقیقه) برای بازی‌های موجود در فید —
 * داشبورد با یک GET بدون هیچ محاسبه موتوری سمت کلاینت پر می‌شود.
 */
export async function hydratedSnapshots(): Promise<{
  success: boolean;
  snapshots: { matchId: string; lineup: unknown; debate: unknown; portfolio: unknown; updatedAt: string }[];
  warm: { lastWarmedAt: string | null; total: number };
}> {
  const cutoff = new Date(Date.now() - 30 * 60_000);
  const rows = await db.engineSnapshot.findMany({
    where: { updatedAt: { gte: cutoff } },
    orderBy: { updatedAt: "desc" },
    take: 30,
  });
  const parse = (s: string | null): unknown => {
    if (!s) return null;
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  };
  const last = rows.reduce<string | null>((acc, r) => (!acc || new Date(r.updatedAt) > new Date(acc) ? new Date(r.updatedAt).toISOString() : acc), null);
  const total = await db.engineSnapshot.count();
  return {
    success: true,
    snapshots: rows.map((r) => ({
      matchId: r.matchId,
      lineup: parse(r.lineup),
      debate: parse(r.debate),
      portfolio: parse(r.portfolio),
      updatedAt: new Date(r.updatedAt).toISOString(),
    })),
    warm: { lastWarmedAt: last, total },
  };
}
