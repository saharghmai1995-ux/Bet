// ─────────────────────────────────────────────────────────────────────────────
// GET /api/reality-check — گزارش راستی‌آزمایی بازار واقعی (v24.0)
//
// پاسخ مستند به سه پرسش حیاتی کاربر:
//   ۱) عملکرد روزهای گذشته تا چه اندازه قابل راستی‌آزمایی است؟
//      (تفکیک دفتر REALTIME از کارنامه کاغذی PAPER)
//   ۲) ضرایب کارت‌ها با سایت‌های واقعی (betforward / 1xbet) چقدر فاصله دارند؟
//      (خط اجماعی چندبوکمیکر واقعی + بازسازی قیمت واقعی هر پای + گپ٪ +
//       دسترس‌پذیری بازار: تکی رسمی / فقط BetBuilder / خارج از تابلو)
//   ۳) اگر فقط روی تیپ A ورود می‌شد بازدهی چطور بود؟
//      (سناریوی.counterfactual تیپ A با ضرایب کارت و با قیمت واقعی)
//
// منبع خط واقعی:
//   · اولویت ۱ — خط اجماعی زنده چندبوکمیکر (The Odds API؛ همان کلاس قیمتی
//     betforward/1xbet؛ کش ۳۰ دقیقه‌ای برای صرفه‌جویی اعتبار)
//   · اولویت ۲ — خط ODDS_API/ESPN_DRAFTKINGS ثبت‌شده روی Match
//   · بدون هیچ‌کدام → کارت با برچسب NO_REAL_LINE گزارش می‌شود (نه قیمت جعلی)
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runRealityCheck, type SlipRow } from "@/lib/server/reality-check";
import { fetchOddsApiEvents, type OddsApiEvent } from "@/lib/server/live-sources";
import { GLOBAL_ESPN_SOCCER_LEAGUES } from "@/lib/leagues-catalog";

export const dynamic = "force-dynamic";

// ─── کش درون‌حافظه‌ی اجماع بازار (۳۰ دقیقه — صرفه‌جویی اعتبار Odds API) ───
let consensusCache: { at: number; events: OddsApiEvent[]; remaining: number | null } = {
  at: 0,
  events: [],
  remaining: null,
};
const CONSENSUS_TTL_MS = 30 * 60 * 1000;

function normName(s: string): string {
  return s.toLowerCase().replace(/[^a-z\u0600-\u06FF]/g, "");
}

function teamMatch(a: string, b: string): boolean {
  const na = normName(a);
  const nb = normName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // تطبیق بازه‌ای — «Manchester City» در برابر «Man City» و مشابه
  return na.length >= 4 && nb.length >= 4 && (na.includes(nb) || nb.includes(na));
}

/** میانه خطوط بوکمیکرهای واقعی برای یک رخداد */
function consensusLine(ev: OddsApiEvent) {
  const h2hBooks = ev.books.filter((b) => b.line.home && b.line.draw && b.line.away);
  if (!h2hBooks.length) return null;
  const median = (xs: number[]): number => {
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  const homes = h2hBooks.map((b) => b.line.home).filter((x): x is number => x != null);
  const draws = h2hBooks.map((b) => b.line.draw).filter((x): x is number => x != null);
  const aways = h2hBooks.map((b) => b.line.away).filter((x): x is number => x != null);
  const overs = h2hBooks.map((b) => b.line.over25).filter((x): x is number => x != null);
  const unders = h2hBooks.map((b) => b.line.under25).filter((x): x is number => x != null);
  return {
    oddsHome: median(homes),
    oddsDraw: median(draws),
    oddsAway: median(aways),
    oddsOver25: overs.length ? median(overs) : null,
    oddsUnder25: unders.length ? median(unders) : null,
    books: h2hBooks.length,
  };
}

async function loadConsensus(): Promise<{ events: OddsApiEvent[]; remaining: number | null }> {
  const now = Date.now();
  if (now - consensusCache.at < CONSENSUS_TTL_MS) {
    return { events: consensusCache.events, remaining: consensusCache.remaining };
  }
  const apiKey = process.env.ODDS_API_KEY || "3c0379d120a8bbd1e4ead8a8c4a7b637";
  const keys = Array.from(new Set(GLOBAL_ESPN_SOCCER_LEAGUES.map((l) => l.oddsKey).filter(Boolean)));
  try {
    const res = await fetchOddsApiEvents(keys, apiKey);
    consensusCache = { at: now, events: res.events, remaining: res.requestsRemaining };
    return { events: res.events, remaining: res.requestsRemaining };
  } catch {
    return { events: consensusCache.events, remaining: consensusCache.remaining };
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const scope = url.searchParams.get("scope") === "all" ? "all" : "pending";
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 40) || 40, 100);
    const live = url.searchParams.get("live") !== "0"; // اجماع زنده به‌صورت پیش‌فرض روشن

    const consensus = live ? await loadConsensus() : { events: [], remaining: null };
    const now = Date.now();

    const report = await runRealityCheck(
      async () => {
        const rows = await db.issuedSlip.findMany({
          orderBy: { createdAt: "asc" },
          select: {
            id: true, league: true, homeTeam: true, awayTeam: true, kickoff: true,
            status: true, crownTier: true, archetypeCode: true,
            oddsA: true, oddsB: true, stakeA: true, stakeB: true,
            guaranteedProfit: true, legsA: true, legsB: true,
            modelProbA: true, modelProbB: true, edgeA: true,
            createdAt: true, matchId: true,
          },
        });
        return rows as unknown as SlipRow[];
      },
      async (matchId) => {
        const m = await db.match.findUnique({
          where: { id: matchId },
          select: {
            league: true, homeTeam: true, awayTeam: true, kickoff: true,
            oddsSource: true, oddsHome: true, oddsDraw: true, oddsAway: true,
            oddsOver25: true, oddsUnder25: true,
            lambdaMarketHome: true, lambdaMarketAway: true,
          },
        });
        if (!m) return null;

        // ── اولویت ۱: خط اجماعی زنده چندبوکمیکر واقعی ──
        if (consensus.events.length && m.kickoff && new Date(m.kickoff).getTime() > now - 3 * 3600e3) {
          const ev = consensus.events.find(
            (e) =>
              (teamMatch(e.homeTeam, m.homeTeam) && teamMatch(e.awayTeam, m.awayTeam)) ||
              (teamMatch(e.homeTeam, m.awayTeam) && teamMatch(e.awayTeam, m.homeTeam))
          );
          const line = ev ? consensusLine(ev) : null;
          if (line) {
            // جهت میزبان/مهمان را با تطبیق نام‌ها اصلاح کن
            const flipped = teamMatch(ev.homeTeam, m.awayTeam) && teamMatch(ev.awayTeam, m.homeTeam);
            return {
              oddsSource: `ODDS_API_CONSENSUS(${line.books} books, ${consensus.remaining ?? "?"} credits left)`,
              oddsHome: flipped ? line.oddsAway : line.oddsHome,
              oddsDraw: line.oddsDraw,
              oddsAway: flipped ? line.oddsHome : line.oddsAway,
              oddsOver25: line.oddsOver25,
              oddsUnder25: line.oddsUnder25,
              lambdaHome: m.lambdaMarketHome,
              lambdaAway: m.lambdaMarketAway,
            };
          }
        }

        // ── اولویت ۲: خط واقعی ثبت‌شده روی خود Match ──
        return {
          oddsSource: m.oddsSource,
          oddsHome: m.oddsHome, oddsDraw: m.oddsDraw, oddsAway: m.oddsAway,
          oddsOver25: m.oddsOver25, oddsUnder25: m.oddsUnder25,
          lambdaHome: m.lambdaMarketHome,
          lambdaAway: m.lambdaMarketAway,
        };
      },
      { scope, pendingLimit: limit }
    );

    return NextResponse.json(
      { ...report, consensusCreditsRemaining: consensus.remaining, consensusEvents: consensus.events.length },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (err) {
    console.error("reality-check error:", err);
    return NextResponse.json({ error: "REALITY_CHECK_FAILED", detail: String(err) }, { status: 500 });
  }
}
