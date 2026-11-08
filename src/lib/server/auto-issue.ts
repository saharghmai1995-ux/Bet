// ─────────────────────────────────────────────────────────────────────────────
// ثبت و تسویه‌حساب ۱۰۰٪ خودکار بازی‌های پایان‌یافته اخیر (Zero-Click Multi-Day
// ESPN Auto-Settlement) — v9.0
//
// مشکل نسخه ۸.۰: اسکوربورد بدون تاریخ فقط بازی‌های آینده را می‌آورد و کارنامه
// کم‌حجم می‌ماند. راه‌حل v9.0:
//   ۱) واکشی خودکار بازی‌های ۳ روز گذشته + امروز از ESPN Scoreboard تاریخ‌دار
//   ۲) ساخت زوج‌های ۵ الگوی متعامد روی λ ترکیبی (Reverse-Poisson) و انتخاب
//      «تک‌تیپ طلایی» توسط ایجنت سوپروایزر — بازی‌های وتوشده صدور نمی‌شوند
//   ۳) بازی‌های FT → کارت صدور و بلافاصله با نتیجه واقعی تسویه می‌شود
//      بازی‌های امروز تاییدشده → کارت PENDING «🔒 قفل‌شده پیش از بازی»
//   ۴) همه Idempotent (hash SHA-256 + externalId+autoIssued) — صفر کارت تکراری
// ─────────────────────────────────────────────────────────────────────────────

import { db } from "@/lib/db";
import { fetchEspnEvents, type LiveMatchEvent } from "./live-sources";
import { getLeagueStandings, findStandingsEntry, type LeagueStandings } from "./espn-standings";
import { deriveStrength, modelProbs } from "./live-ingest";
import { fairOdds } from "@/lib/engine/poisson";
import { computeMatchEngine } from "@/lib/engine/matchEngine";
import {
  generateOrthogonalComplementarySlips,
  buildOrthoPortfolioPair,
  type OrthoContext,
} from "@/lib/engine/orthogonal";
import { pickCrownPair } from "@/lib/supervisor";
import { issueSlip, settleFinishedSlips } from "./liveDataService";
import { getActiveRules, invalidateRulesCache } from "./calibration-rules";
import type { IssueSlipItemDTO, SettlementLegDTO } from "@/lib/types";

/** فاصله حداقلی بین اجراهای خودکار — ۱۰ دقیقه (دکمه دستی با force می‌شکند) */
const AUTO_TTL_MS = 10 * 60_000;

let lastRunAt = 0;
let inFlight: Promise<AutoSyncResult> | null = null;

export interface AutoSyncResult {
  scanned: number; // رخدادهای ESPN اسکن‌شده (۳ روز گذشته + امروز)
  registeredPast: number; // کارت‌های جدید از بازی‌های FT (تسویه فوری)
  registeredToday: number; // کارت‌های PENDING تاییدشده برای بازی‌های امروز
  vetoed: number; // بازی‌های وتوشده توسط سوپروایزر — بدون صدور
  skippedExisting: number; // کارت با همین externalId قبلاً صادر شده
  settled: number; // تعداد تسویه در این پاس
  notified: number; // پیام‌های تلگرام ارسال‌شده
  elapsedMs: number;
}

/** espnUrl رسمی رخداد — مشترک با liveDataService */
function espnUrlOf(externalId: string): string | null {
  const id = externalId.split("-").pop();
  return id ? `https://www.espn.com/soccer/match/_/gameId/${id}` : null;
}

/** اطمینان از وجود ردیف Match برای رخداد (past/in/pre) — با λ و قدرت واقعی جدول فصل */
async function ensureMatchRow(ev: LiveMatchEvent, st: LeagueStandings | null): Promise<{ id: string }> {
  const existing = await db.match.findUnique({
    where: { externalId: ev.externalId },
    select: { id: true },
  });
  if (existing) return existing;

  const d = deriveStrength(ev, null, st);
  const probs = modelProbs(d);
  const isPost = ev.statusState === "post";
  const isLive = ev.statusState === "in";

  const row = await db.match.upsert({
    where: { externalId: ev.externalId },
    create: {
      externalId: ev.externalId,
      league: ev.leagueName,
      homeTeam: ev.homeTeam,
      awayTeam: ev.awayTeam,
      kickoff: new Date(Date.parse(ev.kickoff)),
      homeAttack: d.homeAttack,
      homeDefense: d.homeDefense,
      awayAttack: d.awayAttack,
      awayDefense: d.awayDefense,
      homeElo: d.homeElo,
      awayElo: d.awayElo,
      homeXg: d.lambdaHome,
      awayXg: d.lambdaAway,
      homePpda: d.homePpda,
      awayPpda: d.awayPpda,
      homeFieldTilt: d.homeFieldTilt,
      awayFieldTilt: d.awayFieldTilt,
      homeForm: ev.homeForm,
      awayForm: ev.awayForm,
      weather: "نامشخص - خط لوله ثبت خودکار بازی‌های گذشته",
      oddsHome: fairOdds(probs.pHome, 1.06),
      oddsDraw: fairOdds(probs.pDraw, 1.06),
      oddsAway: fairOdds(probs.pAway, 1.06),
      oddsOver25: fairOdds(probs.pOver25, 1.06),
      oddsUnder25: fairOdds(probs.pUnder25, 1.06),
      odds1x: fairOdds(probs.pHome + probs.pDraw, 1.06),
      homeNpxgLevel: d.lambdaHome,
      awayNpxgLevel: d.lambdaAway,
      dataSource: "ESPN",
      homeLogo: ev.homeLogo,
      awayLogo: ev.awayLogo,
      venueName: ev.venueName,
      venueCity: ev.venueCity,
      homeTeamId: ev.homeTeamId,
      awayTeamId: ev.awayTeamId,
      homeRank: d.homeRank,
      homeGF: d.homeGF,
      homeGA: d.homeGA,
      homeGP: d.homeGP,
      awayRank: d.awayRank,
      awayGF: d.awayGF,
      awayGA: d.awayGA,
      awayGP: d.awayGP,
      leagueTeamAvg: d.leagueTeamAvg,
      statsSource: d.statsSource,
      statsFetchedAt: st ? new Date(st.fetchedAt) : null,
      homeGoals: isPost ? ev.homeScore : isLive ? ev.homeScore : null,
      awayGoals: isPost ? ev.awayScore : isLive ? ev.awayScore : null,
      status: isPost ? "FINISHED" : isLive ? "LIVE" : "UPCOMING",
    },
    update: {
      homeGoals: isPost ? ev.homeScore : undefined,
      awayGoals: isPost ? ev.awayScore : undefined,
      status: isPost ? "FINISHED" : undefined,
    },
    select: { id: true },
  });
  return row;
}

/**
 * autoSyncPastAndPresentMatches — قلب Zero-Click Auto-Settlement.
 * بدون نیاز به کلیک کاربر: بازی‌های FT سه روز اخیر → صدور + تسویه فوری؛
 * بازی‌های امروز تاییدشده → کارت PENDING آماده تسویه خودکار.
 */
export async function autoSyncPastAndPresentMatches(options?: {
  force?: boolean;
  notify?: boolean;
}): Promise<AutoSyncResult> {
  const t0 = Date.now();
  const force = options?.force === true;
  const notify = options?.notify !== false;

  if (!force && Date.now() - lastRunAt < AUTO_TTL_MS) {
    return { scanned: 0, registeredPast: 0, registeredToday: 0, vetoed: 0, skippedExisting: 0, settled: 0, notified: 0, elapsedMs: 0 };
  }
  if (inFlight) return inFlight;

  const run = async (): Promise<AutoSyncResult> => {
    const events: LiveMatchEvent[] = await fetchEspnEvents(-3, 0);
    const activeSlugs = [...new Set(events.map((e) => e.leagueSlug))];
    const standingsMap = new Map<string, LeagueStandings | null>();
    await Promise.all(
      activeSlugs.map(async (slug) => {
        try {
          standingsMap.set(slug, await getLeagueStandings(slug));
        } catch {
          standingsMap.set(slug, null);
        }
      })
    );

    const rules = await getActiveRules();
    let registeredPast = 0;
    let registeredToday = 0;
    let vetoed = 0;
    let skippedExisting = 0;

    for (const ev of events) {
      try {
        const isFinished = ev.statusState === "post" && ev.homeScore !== null && ev.awayScore !== null;
        const isUpcoming = ev.statusState === "pre" || ev.statusState === "in";
        if (!isFinished && !isUpcoming) continue;

        // Idempotency سطح بازی — هر بازی فقط یک کارت خودکار
        const existingCard = await db.issuedSlip.findFirst({
          where: { externalId: ev.externalId, autoIssued: true },
          select: { id: true },
        });
        if (existingCard) {
          skippedExisting += 1;
          continue;
        }

        const st = standingsMap.get(ev.leagueSlug) ?? null;
        const row = await ensureMatchRow(ev, st);
        const match = await db.match.findUnique({ where: { id: row.id }, include: { referee: true } });
        if (!match) continue;

        // ─── v9.0 — بردار قانون فعال کالیبراسیون این لیگ (درس سیستمی → عدد) ───
        const rule = rules.get(ev.leagueName) ?? null;

        const engine = computeMatchEngine(match, {
          calibrationHome: rule?.lambdaMultiplier,
          calibrationAway: rule?.lambdaMultiplier,
        });

        const oddsRows = await db.oddsRecord.findMany({ where: { matchId: match.id } });
        const priceRow = oddsRows.find((o) => o.bookmaker === "PINNACLE") ?? oddsRows[0];
        const ctx: OrthoContext = {
          lambdaHome: engine.dc.lambdaHome,
          lambdaAway: engine.dc.lambdaAway,
          matrix: engine.dc.matrix,
          lambdaCorners: engine.lambdaCorners,
          lambdaCards: engine.lambdaCards,
          prices: priceRow
            ? {
                HOME: priceRow.oddsHome,
                DRAW: priceRow.oddsDraw,
                AWAY: priceRow.oddsAway,
                DC_1X: 1 / (1 / priceRow.oddsHome + 1 / priceRow.oddsDraw),
                DC_X2: 1 / (1 / priceRow.oddsAway + 1 / priceRow.oddsDraw),
                O25: priceRow.oddsOver25,
                U25: priceRow.oddsUnder25,
              }
            : undefined,
        };
        const ortho = generateOrthogonalComplementarySlips(ctx);
        const pairs = ortho.archetypes.map((a) => buildOrthoPortfolioPair(a, match, 100));
        if (pairs.length === 0) continue;

        // ─── انتخاب تک‌تیپ طلایی توسط ایجنت سوپروایزر (با درس کالیبراسیون) ───
        const decision = pickCrownPair(pairs, "DUAL_BOOK", rule);
        if (!decision) continue;
        if (decision.veto) {
          vetoed += 1;
          continue;
        }
        const crown = decision.crown;

        const legsOf = (legs: string[] | undefined): SettlementLegDTO[] =>
          (legs ?? []).map((key) => ({
            key,
            matchExternalId: ev.externalId,
            matchLabel: `${ev.homeTeam} × ${ev.awayTeam}`,
          }));

        const item: IssueSlipItemDTO = {
          match: {
            id: match.id,
            externalId: ev.externalId,
            league: ev.leagueName,
            homeTeam: ev.homeTeam,
            awayTeam: ev.awayTeam,
            kickoff: ev.kickoff,
            espnUrl: espnUrlOf(ev.externalId),
          },
          labelA: crown.labelA,
          labelB: crown.labelB,
          legsA: legsOf(crown.structure.legsA),
          legsB: legsOf(crown.structure.legsB),
          oddsA: crown.totalOddsA,
          oddsB: crown.totalOddsB,
          guaranteedProfit: crown.equalProfit.profit,
          marginPct: crown.guaranteedMarginPct,
          archetype: crown.archetype?.short ?? null,
          archetypeCode: crown.archetype?.code ?? null,
          lambdaHome: engine.dc.lambdaHome,
          lambdaAway: engine.dc.lambdaAway,
          supervisorApproved: true,
        };

        await issueSlip(item, { autoIssued: true });
        if (isFinished) registeredPast += 1;
        else registeredToday += 1;
      } catch (err) {
        console.warn(`auto-issue failed for ${ev.externalId}:`, err);
      }
    }

    // ─── تسویه خودکار همه کارت‌های FT (شامل کارت‌های تازه صادرشده) + اعلام تلگرام ───
    let settled = 0;
    let notified = 0;
    try {
      const result = await settleFinishedSlips({ notify });
      settled = result.settled.length;
      notified = result.notified;
    } catch (err) {
      console.warn("auto-issue settle pass failed:", err);
    }

    // درس‌های تازه تسویه‌شده → بردار قانون را تازه‌سازی کن
    if (settled > 0) await invalidateRulesCache();

    lastRunAt = Date.now();
    return {
      scanned: events.length,
      registeredPast,
      registeredToday,
      vetoed,
      skippedExisting,
      settled,
      notified,
      elapsedMs: Date.now() - t0,
    };
  };

  inFlight = run().finally(() => {
    inFlight = null;
  });
  return inFlight;
}
