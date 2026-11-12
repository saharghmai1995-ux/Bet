// ─────────────────────────────────────────────────────────────────────────────
// ثبت و تسویه‌حساب ۱۰۰٪ خودکار بازی‌های پایان‌یافته اخیر (Zero-Click Multi-Day
// ESPN Auto-Settlement) — v16.0
//
// مشکل نسخه ۸.۰: اسکوربورد بدون تاریخ فقط بازی‌های آینده را می‌آورد و کارنامه
// کم‌حجم می‌ماند. راه‌حل v9.0:
//   ۱) واکشی خودکار بازی‌های ۳ روز گذشته + امروز از ESPN Scoreboard تاریخ‌دار
//   ۲) ساخت زوج‌های الگوهای طلایی روی λ ترکیبی (Reverse-Poisson) و انتخاب
//      «تک‌تیپ طلایی» توسط ایجنت سوپروایزر — بازی‌های وتوشده صدور نمی‌شوند
//      (v16.0: فقط ۳ الگوی طلایی ۹۲٪+ با گیت سخت ریسک ۱۰.۵٪ و لیگ گیت)
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
import { leagueGate } from "@/lib/leagues-catalog";
import { issueSlip, settleFinishedSlips } from "./liveDataService";
import { getActiveRules, invalidateRulesCache } from "./calibration-rules";
import type { IssueSlipItemDTO, SettlementLegDTO } from "@/lib/types";

/** فاصله حداقلی بین اجراهای خودکار — ۱۰ دقیقه (دکمه دستی با force می‌شکند) */
const AUTO_TTL_MS = 10 * 60_000;

/**
 * v16.0 — سقف سند: «فقط ۲۵ تا ۳۵ بازی تراز اول تایید شوند».
 * در بازمحاسبه Clean-Slate، بازی‌های ۳۵ گانه با بالاترین امتیاز سوپروایزر تایید
 * می‌مانند و مازاد به دفتر سایه (supervisorApproved=false) منتقل می‌شود.
 */
const V16_MAX_APPROVED_CARDS = 35;

let lastRunAt = 0;
let inFlight: Promise<AutoSyncResult> | null = null;

export interface AutoSyncResult {
  scanned: number; // رخدادهای ESPN اسکن‌شده (۳ روز گذشته + امروز)
  registeredPast: number; // کارت‌های جدید از بازی‌های FT (تسویه فوری)
  registeredToday: number; // کارت‌های PENDING تاییدشده برای بازی‌های امروز
  vetoed: number; // کارت‌های سایه — وتوی سوپروایزر که به دفتر سایه ثبت و تسویه کاغذی می‌شوند
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
  /** v16.0 — بازمحاسبه Clean-Slate: بازی‌های FT با ۳ الگوی طلایی به‌عنوان کارنامه رسمی بازمحاسبه می‌شوند */
  cleanSlate?: boolean;
}): Promise<AutoSyncResult> {
  const t0 = Date.now();
  const force = options?.force === true;
  const notify = options?.notify !== false;
  const cleanSlate = options?.cleanSlate === true;

  if (!force && Date.now() - lastRunAt < AUTO_TTL_MS) {
    return { scanned: 0, registeredPast: 0, registeredToday: 0, vetoed: 0, skippedExisting: 0, settled: 0, notified: 0, elapsedMs: 0 };
  }
  if (inFlight) return inFlight;

  const run = async (): Promise<AutoSyncResult> => {
    // v10.0.2 — پنجره اسکن: ۳ روز گذشته (تسویه) + امروز و ۲ روز آینده (صدور پیش از بازی)
    // بدون هیچ وابستگی به مرورگر؛ رادار اسکنر همیشه بازی‌های پیش‌رو دارد
    // v16.0 — حالت Clean-Slate: پنجره ۶ روز گذشته برای بازسازی کامل کارنامه
    const events: LiveMatchEvent[] = await fetchEspnEvents(cleanSlate ? -6 : -3, 2);
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
    /** v16.0 — ثبت کارت‌های تاییدشده با امتیاز، برای سقف ۳۵ گانه سند */
    const approvedLedger: { slipId: string; score: number }[] = [];

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
        /** v10.0.1 — خط شارپ مرجع فقط وقتی واقعاً PINNACLE است به کارت منتقل می‌شود */
        const sharpRow = oddsRows.find((o) => o.bookmaker === "PINNACLE") ?? null;
        const sharpPrices = sharpRow
          ? {
              HOME: sharpRow.oddsHome,
              DRAW: sharpRow.oddsDraw,
              AWAY: sharpRow.oddsAway,
              DC_1X: 1 / (1 / sharpRow.oddsHome + 1 / sharpRow.oddsDraw),
              DC_X2: 1 / (1 / sharpRow.oddsAway + 1 / sharpRow.oddsDraw),
              O25: sharpRow.oddsOver25,
              U25: sharpRow.oddsUnder25,
            }
          : undefined;
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

        // ─── v16.0 — گیت لیگ‌های سوپروایزر (بلک‌لیست لیگ‌های سمّی + وایت‌لیست ساختاریافته) ───
        const gate = leagueGate(ev.leagueSlug, ev.leagueName);

        // ─── انتخاب تک‌تیپ طلایی توسط ایجنت سوپروایزر (با درس کالیبراسیون + گیت λ فاوریت قاطع v16.0) ───
        const decision = pickCrownPair(pairs, "DUAL_BOOK", rule, null, {
          lambdaHome: engine.dc.lambdaHome,
          lambdaAway: engine.dc.lambdaAway,
        });
        if (!decision) continue;

        // ─── v11.0 — دفتر سایه (Shadow Ledger) ───
        // وتو دیگر «دورانداختن» نیست: کارت سایه با supervisorApproved=false ثبت می‌شود
        // تا با همان موتور ESPN تسویه کاغذی شود و سوگیری بازماندگی حذف گردد.
        // تلگرام به‌صورت ساختاری هرگز کارت سایه را منتشر نمی‌کند (سپر سه‌لایه).
        // v16.0 — لیگ سمّی/خارج وایت‌لیست هم کارت را مستقیماً به دفتر سایه می‌فرستد.
        const shadow = decision.veto || gate.veto;

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
          // v16.0 — شتاب‌دهنده نامتقارن: سود برابر زیر ۱۲٪ → قفل سرمایه روی تیپ B + تجمیس سود روی تیپ A
          stakeA: crown.accelerator?.stakeA,
          stakeB: crown.accelerator?.stakeB,
          guaranteedProfit: crown.accelerator?.active ? (crown.accelerator.profitOnA > 0 ? crown.accelerator.profitOnA : 0) : crown.equalProfit.profit,
          marginPct: crown.guaranteedMarginPct,
          archetype: crown.archetype?.short ?? null,
          archetypeCode: crown.archetype?.code ?? null,
          lambdaHome: engine.dc.lambdaHome,
          lambdaAway: engine.dc.lambdaAway,
          /** v10.0.1 — خط شارپ پیناکل برای «ارزش نسبت به خط پیناکل» کارت */
          pinnaclePrices: sharpPrices,
          /** v13.2 — کارت بازخوانی: بازی هنگام صدور از قبل FT بود (هرگز پیش‌بازی صادر/تایید/منتشر نشده)
           *  v16.0 — در بازمحاسبه Clean-Slate، تسویه بازی‌های FT کارنامه «رسمی بازمحاسبه‌شده» است
           *  (دستور صریح سند: «کل کارنامه را با کلید neobet_v16_verified_ledger بازمحاسبه کن») — retroIssued=false */
          retroIssued: isFinished && !cleanSlate,
          /** v11.0 — دفتر سایه: کارت واقعی یا سایه + سنجه‌های لحظه تصمیم */
          // v13.5.1 — ریشه‌ای باگ «تله میانی بدون صدور قبلی»: کارت بازخوانی هرگز «تاییدشده»
          // نیست (تایید = مجوز پول واقعی پیش از کیک‌آف). صدور پس از FT صرفاً تحلیل کاغذی دفتر
          // بازخوانی است و با پرچم retroIssued شناسایی می‌شود، نه با تایید سوپروایزر.
          supervisorApproved: !shadow && (!isFinished || cleanSlate),
          supervisorScore: decision.score.raw,
          vetoReason: shadow ? (gate.veto ? gate.reason : decision.vetoReason) : null,
          jointLossRiskPct: decision.score.jointLossRiskPct,
          doubleWinProbPct: decision.score.doubleWinProbPct,
        };

        const issued = await issueSlip(item, { autoIssued: true });
        // v16.0 — کارت‌های تاریخی بازمحاسبه هرگز به کانال اعلام نمی‌شوند (تاریخ‌اند، نه خبر تازه):
        // پرچم‌های تلگرام از قبل true می‌شوند تا صف انتشار از آن‌ها عبور کند.
        if (cleanSlate && isFinished && issued.created) {
          await db.issuedSlip.update({
            where: { id: issued.slip.id },
            data: { telegramCard: true, telegramResult: true, settleNote: "v16.0 verified-ledger recalculation — golden atomic pair settled on official ESPN FT" },
          });
        }
        // v16.0 — ثبت کارت تاییدشده برای سقف ۳۵ گانه سند (کارت‌های FT بازمحاسبه)
        if (cleanSlate && isFinished && !shadow && issued.created) {
          approvedLedger.push({ slipId: issued.slip.id, score: decision.score.raw });
        }
        if (shadow) {
          vetoed += 1;
        } else if (isFinished) {
          // v13.2 — کارت‌های FT همیشه «بازخوانی» هستند؛ دیگر به‌عنوان کارت واقعی تاییدشده
          // در وین‌ریت کانال شمرده نمی‌شوند (رفع باگ ۳ مورد MIDDLE_TRAP هرگز-صادرنشده)
          registeredPast += 1;
        } else registeredToday += 1;
      } catch (err) {
        console.warn(`auto-issue failed for ${ev.externalId}:`, err);
      }
    }

    // ─── v16.0 — سقف ۳۵ گانه سند: فقط تراز اول‌ترین کارت‌ها تایید می‌مانند ───
    // مازاد بر ۳۵ (کم‌امتیازترین‌ها) به دفتر سایه منتقل می‌شوند — قبل از تسویه تا آمار رسمی
    // فقط بازی‌های تراز اول را بشمارند.
    if (cleanSlate && approvedLedger.length > V16_MAX_APPROVED_CARDS) {
      const sorted = [...approvedLedger].sort((a, b) => b.score - a.score);
      const demote = sorted.slice(V16_MAX_APPROVED_CARDS);
      for (const row of demote) {
        try {
          await db.issuedSlip.update({
            where: { id: row.slipId },
            data: {
              supervisorApproved: false,
              vetoReason: `🛡️ سقف ۳۵ گانه v16.0: امتیاز ${row.score.toFixed(1)} زیر خط تراز اول — فقط ۲۵ تا ۳۵ بازی با ریسک زیر ۱۰.۵٪ تایید می‌شوند؛ انتقال به دفتر سایه`,
            },
          });
          vetoed += 1;
        } catch (err) {
          console.warn("v16 top-35 demotion failed:", err);
        }
      }
      console.log(`[auto-issue] v16 top-${V16_MAX_APPROVED_CARDS} cap: ${demote.length} low-tier cards demoted to shadow office`);
    }

    // ─── تسویه خودکار همه کارت‌های FT (شامل کارت‌های تازه صادرشده) + اعلام تلگرام ───
    let settled = 0;
    let notified = 0;
    try {
      // v16.0 — پنجره تسویه در حالت Clean-Slate ۷ روزه است تا بازی‌های ۶ روز اخیر کامل تسویه شوند
      const result = await settleFinishedSlips({ notify, windowDays: cleanSlate ? 7 : undefined });
      settled = result.settled.length;
      notified = result.notified;
    } catch (err) {
      console.warn("auto-issue settle pass failed:", err);
    }

    // ─── v10.0.2 — بازپررسی یادگیری کارت‌های قدیمی (edge/پنجره/ژورنال — throttle داخلی ۳۰ دقیقه) ───
    try {
      const { backfillSlipLearning } = await import("./liveDataService");
      const bf = await backfillSlipLearning();
      if (bf.updated > 0 || bf.journalled > 0) {
        console.log(`[auto-issue] learning backfill: ${bf.updated} slips enriched, ${bf.journalled} journalled`);
      }
    } catch (err) {
      console.warn("auto-issue learning backfill failed:", err);
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
