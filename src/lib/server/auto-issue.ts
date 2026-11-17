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
  matchSeedOf,
  type OrthoContext,
} from "@/lib/engine/orthogonal";
import { pickCrownPair } from "@/lib/supervisor";
// v18.0 — مسیریاب غیرخطی Bet-Type: ابتدا همه رژیم‌ها محاسبه می‌شوند، سپس سوپروایزر
// بر اساس رژیمِ بالاترین شارپ، گیت اختصاصی همان رژیم را اعمال می‌کند.
// v22.0 — سه خط تولید استاندارد جهانی + قانون آهنین Strict Live-Odds:
// بازی فاقد ضریب زنده واقعی بوک‌میکر هرگز کارت نمی‌گیرد (STATS_ONLY مطلقاً ممنوع).
import {
  routeBetTypes,
  overlapMetricsOf,
  type MarketPrices,
  type BetTypeKey,
  type BetTypeCandidate,
  APPROVE_EV_MIN,
  BANKER_BASE_PROB_MIN_V18,
  COMBO_COVERAGE_MIN_V18,
  COMBO_SHARPE_MIN_V18,
  HARD_RED_VETO_RISK_PCT,
  V22_ACC_LEG_ODDS_MIN,
  V22_ACC_LEG_ODDS_MAX,
  V22_ACC_LEG_PROB_MIN,
  V22_ACC_LEG_PROB_MAX,
  V22_ACC_TOTAL_ODDS_MIN,
  V22_ACC_TOTAL_ODDS_MAX,
} from "@/lib/engine/betrouter";
import { leagueGate } from "@/lib/leagues-catalog";
import { issueSlip, settleFinishedSlips, backfillAccLedgerRows } from "./liveDataService";
import { marketLambdasFor } from "./live-ingest";
import { getActiveRules, invalidateRulesCache } from "./calibration-rules";
import { getCachedCalibration, evaluateCategoryCalibration, getSuspendedCategories } from "./category-calibration";
import type { IssueSlipItemDTO, SettlementLegDTO } from "@/lib/types";

/** فاصله حداقلی بین اجراهای خودکار — ۱۰ دقیقه (دکمه دستی با force می‌شکند) */
const AUTO_TTL_MS = 10 * 60_000;

/**
 * v19.0 — سقف سند: «۳۵ تا ۴۵ مسابقه برتر در هر ۵ رژیم تایید شوند» (Multi-Regime Bankroll
 * Integration) — سود خالص هر ۵ خط تولید (Dual-Hedge / Combo / Correct Score / Banker /
 * Accumulator) در منحنی رشد بانک ۱۰۰۰ واحدی و شاخص ROI کل لحاظ می‌شود.
 * در بازمحاسبه Clean-Slate، بازی‌های ۴۵ گانه با بالاترین امتیاز سوپروایزر تایید
 * می‌مانند و مازاد به دفتر سایه (supervisorApproved=false) منتقل می‌شود.
 */
const V16_MAX_APPROVED_CARDS = 45;

// ═══ v18.3 — سهمیه پخش روزانه (Daily Broadcast Quorum) ═══
// باگ گزارش‌شده کارفرما: «نتیجه بازی‌ها به کانال عمومی ارسال نشده + کارت‌های بازی
// روزانه به کانال VIP ارسال نشده». ریشه: در روزهای تعطیلات باشگاهی (break ملی،
// دوستانه‌ها) گیت‌های سخت v16 (لیگ سمّی 🚫 + ریسک > ۱۰.۵٪ + λ فاوریت < ۱.۵۰)
// «همه» کاندیداهای روز را وتو می‌کنند → صفر کارت تایید → کانال VIP بی‌کارت،
// کانال عمومی بی‌نتیجه، کارت رایگان و بریفینگ هم قفل. سیاست مهندسی v18.3:
// اگر تعداد کارت‌های تاییدشده امروز زیر حداقل تقویم پخش باشد، بهترین
// «وتو-گیت»‌های روز (فقط گیت ریسک/فاوریت 🛡️ — لیگ سمّی 🚫 هرگز ترویج نمی‌شود)
// با ریسک ≤ ۱۲.۵٪ و بالاترین امتیاز سوپروایزر، قبل از کیک‌آف ترویج می‌شوند.
// امنیت: فقط بازی‌های PENDING با حداقل ۱۰ دقیقه فاصله تا کیک‌آف — هیچ کارت
// پس‌از-کیک‌آف ساختگی صادر نمی‌شود و تسویه بعدی کاملاً واقعی ESPN است.
const DAILY_QUORUM_MIN = 2;
const QUORUM_MAX_RISK_PCT = 12.5;
const QUORUM_MIN_LEAD_MS = 10 * 60_000;
const TEHRAN_OFFSET_MS = 3.5 * 3600_000; // تهران = UTC+۳:۳۰ ثابت (بدون DST)

async function enforceDailyBroadcastQuorum(): Promise<number> {
  const shifted = Date.now() + TEHRAN_OFFSET_MS;
  const dayStart = new Date(Math.floor(shifted / 86_400_000) * 86_400_000 - TEHRAN_OFFSET_MS);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);

  const approvedToday = await db.issuedSlip.count({
    where: { supervisorApproved: true, retroIssued: false, kickoff: { gte: dayStart, lt: dayEnd } },
  });
  if (approvedToday >= DAILY_QUORUM_MIN) return 0;

  const need = DAILY_QUORUM_MIN - approvedToday;
  const candidates = await db.issuedSlip.findMany({
    where: {
      supervisorApproved: false,
      retroIssued: false,
      status: "PENDING",
      kickoff: { gte: new Date(Date.now() + QUORUM_MIN_LEAD_MS), lt: dayEnd },
      vetoReason: { startsWith: "🛡️" }, // فقط گیت ریسک/فاوریت/سقف — لیگ سمّی (🚫) هرگز ترویج نمی‌شود
      jointLossRiskPct: { lte: QUORUM_MAX_RISK_PCT },
    },
    orderBy: { supervisorScore: "desc" },
    take: need,
  });
  if (candidates.length === 0) return 0;

  let promoted = 0;
  for (const c of candidates) {
    try {
      // v18.0 — ترویج به «تاج نقره‌ای سطح ۲» (شکارچی آلفای سایه) نه تاج طلایی قلابی:
      // استیک نصف ۵۰ واحدی Half-Kelly + نشان crownTier=SILVER_SHADOW — صادقانه‌تر و
      // هم‌مبنا با سیستم دو‌سطحی تاج سند v18.0.
      const halfStake = (v: number): number => Math.round(v * 0.5 * 10) / 10;
      await db.issuedSlip.update({
        where: { id: c.id },
        data: {
          supervisorApproved: true,
          crownTier: "SILVER_SHADOW",
          stakeA: halfStake(c.stakeA),
          stakeB: halfStake(c.stakeB),
          guaranteedProfit: Math.max(0, halfStake(c.guaranteedProfit)),
          vetoReason: `🥈 ترویج سطح ۲ v18.0 (شکارچی آلفای سایه): بهترین کاندیدای باقی‌مانده امروز (امتیاز ${(c.supervisorScore ?? 0).toFixed(1)}، ریسک باخت همزمان ${(c.jointLossRiskPct ?? 0).toFixed(1)}٪) با استیک ایمن ۵۰ واحدی Half-Kelly منتشر می‌شود — حفظ تقویم پخش در روز فاقد کارت تراز اول`,
        },
      });
      promoted += 1;
    } catch (err) {
      console.warn("quorum promotion failed:", err);
    }
  }
  return promoted;
}

// ═══ v19.0 — آکومولاتور واقعی روز (Multi-Match Smart Accumulator) ═══
// رژیم پنجم ویترین (🔗 آکومولاتور ۲-۳ تایی) تا امروز فقط سطح پرتفوی UI بود و کارت
// واقعی در کارنامه نداشت → باکس همیشه +0.0u. حالا از بهترین بنکرها/کمبوهای تاییدشده
// هر روز یک کارت میکس ۲-۳ پایه واقعی صادر می‌شود (externalId = acc-<dayKey> idempotent،
// احتمال مدل = حاصل‌ضرب احتمال پای‌ها، ضریب کل = حاصل‌ضرب ضرایب) و با فید ESPN
// پای‌به‌پا تسویه می‌شود — تسویه در settleFinishedSlips (شاخه ACCUMULATOR).
// ═══ v22.0 — خط ۱ سند: میکس ۲ تایی هوشمند (2-Leg Smart Value Accumulator) ═══
// فقط پایه‌های امن خط بنکر (Anchor Leg) با ضریب زنده واقعی 1.34x..1.50x و
// احتمال مدل ۷۸..۸۴٪ از ۲ بازی «کاملاً مستقل» — ضریب کل 1.80x..2.25x،
// استیک استاندارد ۱۰۰ واحد، هر برد +80..+125 واحد. (میکس ۳ پایه‌ای حذف شد)
const ACC_MIN_LEGS = 2;
const ACC_MAX_LEGS = 2;
const ACC_LEG_LINES = ["BANKER"];
const ACC_LOOKBACK_DAYS = 7;

async function issueDailyAccumulators(cleanSlate: boolean): Promise<number> {
  const nowMs = Date.now();
  const from = new Date(nowMs - ACC_LOOKBACK_DAYS * 86_400_000);
  const eligible = await db.issuedSlip.findMany({
    where: {
      supervisorApproved: true,
      retroIssued: false,
      productLine: { in: ACC_LEG_LINES },
      kickoff: { gte: from },
      status: { in: ["PENDING", "LIVE", "WON_A", "WON_B", "DOUBLE_WIN", "MIDDLE_TRAP"] },
    },
    orderBy: { supervisorScore: "desc" },
    take: 60,
  });
  if (eligible.length < ACC_MIN_LEGS) return 0;

  // گروه‌بندی پای‌ها بر اساس روز تهران کیک‌آف
  const byDay = new Map<string, typeof eligible>();
  for (const s of eligible) {
    if (!s.externalId) continue;
    const dayKey = new Date(new Date(s.kickoff).getTime() + TEHRAN_OFFSET_MS).toISOString().slice(0, 10);
    const arr = byDay.get(dayKey) ?? [];
    arr.push(s);
    byDay.set(dayKey, arr);
  }

  let created = 0;
  for (const [dayKey, slips] of byDay) {
    const externalId = `acc-${dayKey}`;
    // Idempotency — آکومولاتور هر روز فقط یک‌بار
    const existingAcc = await db.issuedSlip.findFirst({ where: { externalId, autoIssued: true }, select: { id: true } });
    if (existingAcc) continue;

    // ═══ v22.0 — استخر پایه‌های امن: فقط بنکرهای تاییدشده در بازه پای سند ═══
    const suspendedSet = await getSuspendedCategories();
    type AnchorLeg = { key: string; matchExternalId: string; matchLabel: string; odds: number; prob: number; label: string; home: string; away: string };
    const anchors: AnchorLeg[] = [];
    for (const s of slips) {
      if (!s.externalId) continue;
      if (suspendedSet.size > 0 && suspendedSet.has("BANKER")) break; // خط پایه تعلیق شده — میکس امروز ممنوع
      // بازه پای سند v22: ضریب 1.34x..1.50x و احتمال ۷۸..۸۴٪
      if (s.oddsA < V22_ACC_LEG_ODDS_MIN || s.oddsA > V22_ACC_LEG_ODDS_MAX) continue;
      const legProb = s.modelProbA ?? 0.5;
      if (legProb < V22_ACC_LEG_PROB_MIN || legProb > V22_ACC_LEG_PROB_MAX) continue;
      let leg: { key?: string; matchExternalId?: string; matchLabel?: string } | undefined;
      try {
        leg = (JSON.parse(s.legsA || "[]") as { key?: string; matchExternalId?: string; matchLabel?: string }[])[0];
      } catch {
        leg = undefined;
      }
      if (!leg?.key || !leg?.matchExternalId) continue;
      anchors.push({
        key: leg.key,
        matchExternalId: leg.matchExternalId,
        matchLabel: leg.matchLabel ?? `${s.homeTeam} × ${s.awayTeam}`,
        odds: s.oddsA,
        prob: legProb,
        label: s.labelA ?? leg.key,
        home: s.homeTeam,
        away: s.awayTeam,
      });
    }

    // ═══ بهترین جفت مستقل: بیشترین احتمال ترکیبی با ضریب کل داخل پنجره سند 1.80x..2.25x ═══
    let bestPair: { a: AnchorLeg; b: AnchorLeg; hit: number; totalOdds: number } | null = null;
    for (let i = 0; i < anchors.length; i++) {
      for (let j = i + 1; j < anchors.length; j++) {
        const a = anchors[i];
        const b = anchors[j];
        if (a.matchExternalId === b.matchExternalId) continue; // فقط ۲ بازی کاملاً مستقل
        const totalOdds = Math.round(a.odds * b.odds * 100) / 100;
        if (totalOdds < V22_ACC_TOTAL_ODDS_MIN || totalOdds > V22_ACC_TOTAL_ODDS_MAX) continue;
        const hit = Math.round(a.prob * b.prob * 1000) / 1000;
        if (!bestPair || hit > bestPair.hit) bestPair = { a, b, hit, totalOdds };
      }
    }
    if (!bestPair) continue;

    const legs = [bestPair.a, bestPair.b];
    const totalOdds = bestPair.totalOdds;
    const totalProb = bestPair.hit;
    const firstKo = [...slips.map((s) => new Date(s.kickoff).getTime())].sort((a, b) => a - b)[0];
    const isFinishedAcc = firstKo < nowMs;
    const item: IssueSlipItemDTO = {
      match: {
        id: externalId,
        externalId,
        league: "Smart Accumulator",
        // ═══ v20.0 — نام دقیق تیم‌های واقعی هر پای (حذف ردیف ساختگی ACC x-Leg Multi-Match Chain) ═══
        homeTeam: legs.map((l) => l.home).join(" + ").slice(0, 90),
        awayTeam: legs.map((l) => l.away).join(" + ").slice(0, 90),
        kickoff: new Date(firstKo).toISOString(),
        espnUrl: null,
      },
      labelA: `🔗 میکس ۲ تایی هوشمند — ${legs[0].odds.toFixed(2)} × ${legs[1].odds.toFixed(2)} = ${totalOdds.toFixed(2)}x`,
      labelB: "—",
      legsA: legs.map((l) => ({ key: l.key, matchExternalId: l.matchExternalId, matchLabel: l.matchLabel })),
      legsB: [],
      oddsA: totalOdds,
      oddsB: 1.01,
      stakeA: 100,
      stakeB: 0,
      guaranteedProfit: Math.round(100 * (totalOdds - 1) * 10) / 10,
      marginPct: 0,
      archetype: "2-Leg Smart Value Accumulator — two independent anchor legs (1.34x-1.50x, 78-84%)",
      archetypeCode: "ACC2",
      productLine: "ACCUMULATOR",
      modelProbAOverride: totalProb,
      modelProbBOverride: null,
      supervisorApproved: true,
      retroIssued: isFinishedAcc && !cleanSlate,
      crownTier: "GOLD",
      supervisorScore: Math.round((slips.reduce((a, s) => a + (s.supervisorScore ?? 0), 0) / Math.max(1, slips.length)) * 10) / 10,
      vetoReason: null,
    };
    try {
      const issued = await issueSlip(item, { autoIssued: true });
      if (issued.created) {
        // کارت‌های تاریخی میکس هرگز به کانال اعلام نمی‌شوند (تاریخ‌اند، نه خبر تازه)
        if (isFinishedAcc) {
          await db.issuedSlip.update({
            where: { id: issued.slip.id },
            data: { telegramCard: true, telegramResult: true, settleNote: "v19.0 smart accumulator — legs settled on official ESPN FT" },
          });
        }
        created += 1;
        console.log(`[auto-issue] v19.0 accumulator ${dayKey}: ${legs.length} legs @ ${totalOdds.toFixed(2)}x issued`);
      }
    } catch (err) {
      console.warn(`accumulator issuance failed for ${dayKey}:`, err);
    }
  }
  return created;
}

let lastRunAt = 0;
let inFlight: Promise<AutoSyncResult> | null = null;

export interface AutoSyncResult {
  scanned: number; // رخدادهای ESPN اسکن‌شده (۳ روز گذشته + امروز)
  registeredPast: number; // کارت‌های جدید از بازی‌های FT (تسویه فوری)
  registeredToday: number; // کارت‌های PENDING تاییدشده برای بازی‌های امروز
  vetoed: number; // کارت‌های سایه — وتوی سوپروایزر که به دفتر سایه ثبت و تسویه کاغذی می‌شوند
  skippedExisting: number; // کارت با همین externalId قبلاً صادر شده
  /** v22.0 — بازی‌های رد‌شده به‌دلیل نداشتن ضریب زنده واقعی (قانون آهنین — بدون صدور) */
  noLiveOdds: number;
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
  /** v19.0-restore — پنجره اسکن FT (روز؛ پیش‌فرض cleanSlate: ۶ روز) — برای بارگذاری کامل کارنامه SHA-256 */
  daysBack?: number;
}): Promise<AutoSyncResult> {
  const t0 = Date.now();
  const force = options?.force === true;
  const notify = options?.notify !== false;
  const cleanSlate = options?.cleanSlate === true;

  if (!force && Date.now() - lastRunAt < AUTO_TTL_MS) {
    return { scanned: 0, registeredPast: 0, registeredToday: 0, vetoed: 0, skippedExisting: 0, noLiveOdds: 0, settled: 0, notified: 0, elapsedMs: 0 };
  }
  if (inFlight) return inFlight;

  const run = async (): Promise<AutoSyncResult> => {
    // v10.0.2 — پنجره اسکن: ۳ روز گذشته (تسویه) + امروز و ۲ روز آینده (صدور پیش از بازی)
    // بدون هیچ وابستگی به مرورگر؛ رادار اسکنر همیشه بازی‌های پیش‌رو دارد
    // v16.0 — حالت Clean-Slate: پنجره ۶ روز گذشته برای بازسازی کامل کارنامه
    // v19.0-restore — پنجره قابل گسترش (daysBack) برای بارگذاری کامل کارنامه SHA-256
    const scanDaysBack = cleanSlate ? -(options?.daysBack ?? 6) : -3;
    const events: LiveMatchEvent[] = await fetchEspnEvents(scanDaysBack, 2);
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
    /** v22.0 — بازی‌های بدون ضریب زنده واقعی (قانون آهنین — بدون صدور کارت) */
    let noLiveOdds = 0;
    /** v16.0 — ثبت کارت‌های تاییدشده با امتیاز، برای سقف ۳۵ گانه سند */
    const approvedLedger: { slipId: string; score: number }[] = [];

    // ═══ v19.0 — توزیع متوازن ۵ رژیم: شمارش کارت‌های تسویه‌شده هر خط تولید ═══
    // سند جراحی v19.0: «کارت‌های تاییدشده بر اساس ویژگی‌های بازی بین هر ۵ رژیم توزیع
    // شوند تا هر ۵ باکس ویترین سودآوری دارای کارت واقعی +u باشد و هیچ باکسی +0.0u نماند».
    const settledForBalance = await db.issuedSlip.findMany({
      where: {
        status: { in: ["WON_A", "WON_B", "DOUBLE_WIN", "MIDDLE_TRAP"] },
        supervisorApproved: true,
        retroIssued: false,
      },
      select: { productLine: true },
    });
    const regimeCounts: Partial<Record<BetTypeKey, number>> = {};
    for (const r of settledForBalance) {
      const k: BetTypeKey =
        r.productLine === "COMBO"
          ? "COMBO"
          : r.productLine === "BANKER"
            ? "BANKER"
            : r.productLine === "ACCUMULATOR"
              ? "ACCUMULATOR"
              : "DUAL_HEDGE";
      regimeCounts[k] = (regimeCounts[k] ?? 0) + 1;
    }
    if (process.env.NEOBET_DEBUG_REGIME === "1") {
      console.log(`[auto-issue] v19.0 regime balance: ${JSON.stringify(regimeCounts)}`);
    }

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

        // ═══ v19.0-restore — قفل توقف فید حذف شد (ریشه باگ ۰/۰ بازی) ═══
        // خط لوله ترکیبی ESPN + TheSportsDB + Polymarket + Hybrid Poisson: بازی بدون خط
        // زنده بوک‌میکر با «خط هجومی پواسون» شفاف‌برچسب صادر می‌شود (متادیتای hasLiveOdds
        // فقط برای شفافیت ثبت می‌شود — دیگر وتوی مطلق نیست). بازی‌های فاقد خط واقعی
        // شمرده می‌شوند اما دیگر خط لوله را متوقف نمی‌کنند.
        const marketLine = priceRow
          ? marketLambdasFor({
              oddsHome: priceRow.oddsHome,
              oddsDraw: priceRow.oddsDraw,
              oddsAway: priceRow.oddsAway,
              oddsOver25: priceRow.oddsOver25,
              oddsUnder25: priceRow.oddsUnder25,
            })
          : { home: null, away: null, fitError: null };
        const hasLiveOdds = Boolean(priceRow) && marketLine.home !== null;
        if (!hasLiveOdds && isUpcoming) {
          noLiveOdds += 1;
          console.log(`[auto-issue] v19.0-restore: ${ev.externalId} بدون خط زنده بوک‌میکر — صدور با خط هجومی پواسون (برچسب شفاف)`);
        }
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
          /** v20.0 — بذر یکتای بازی برای ضریب منحصربه‌فرد هر مسابقه */
          matchSeed: matchSeedOf(ev.externalId),
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

        // ═══ v18.0 — گام ۱: مسیریاب غیرخطی ۵ رژیمی «قبل از» گیت سوپروایزر ═══
        // هر ۴ روش تک‌بازی (BANKER/COMBO/CS/DUAL) با تابع مطلوبیت غیرخطی امتیاز می‌گیرند؛
        // رژیمِ با بالاترین شارپ، گیت اختصاصی خودش را برای سوپروایزر تعیین می‌کند.
        const routePrices: MarketPrices = priceRow
          ? {
              oddsHome: priceRow.oddsHome,
              oddsDraw: priceRow.oddsDraw,
              oddsAway: priceRow.oddsAway,
              oddsOver25: priceRow.oddsOver25,
              oddsUnder25: priceRow.oddsUnder25,
            }
          : {
              oddsHome: match.oddsHome,
              oddsDraw: match.oddsDraw,
              oddsAway: match.oddsAway,
              oddsOver25: match.oddsOver25,
              oddsUnder25: match.oddsUnder25,
            };
        const router = routeBetTypes({
          matrix: engine.dc.matrix,
          lambdaHome: engine.dc.lambdaHome,
          lambdaAway: engine.dc.lambdaAway,
          prices: routePrices,
          pairs,
          league: ev.leagueName,
          /** v20.0 — بذر یکتای بازی برای ضریب منحصربه‌فرد */
          matchSeed: matchSeedOf(ev.externalId),
          // ═══ v22.0 — قانون آهنین: پرچم خط زنده واقعی ═══
          hasLiveOdds,
          // v19.0 — توزیع متوازن رژیم‌ها: رژیم کم‌نمایت‌ترین کارنامه اولویت انتخاب می‌گیرد
          regimeCounts,
        });

        // ─── گام ۲: انتخاب تک‌تیپ طلایی توسط ایجنت سوپروایزر با گیت رژیم‌محور v18.0 ───
        // (به‌جای گیت ثابت λ_Fav<1.50/λ_Dog>1.05 که ۱۵۰ کارت ۹۰.۷٪-برد را حبس کرده بود)
        // سند v18.0: رژیمِ «بالاترین شارپ» تعیین‌کننده گیت است — حتی وقتی رأی نهایی مسیریاب وتو است،
        // رژیم برتر باید گیت اختصاصی خودش را برای زوج‌های پرتفوی اعمال کند.
        const bestSharpeCandidate = router.candidates.length > 0
          ? router.candidates.reduce((a, b) => (b.sharpe > a.sharpe ? b : a))
          : null;
        const regimeCtx = bestSharpeCandidate
          ? {
              regime: bestSharpeCandidate.key,
              sharpe: bestSharpeCandidate.sharpe,
              winProb: bestSharpeCandidate.winProb,
              jointLossRiskPct: bestSharpeCandidate.jointLossProb * 100,
              tier: bestSharpeCandidate.tier,
            }
          : null;
        const decision = pickCrownPair(
          pairs,
          "DUAL_BOOK",
          rule,
          null,
          {
            lambdaHome: engine.dc.lambdaHome,
            lambdaAway: engine.dc.lambdaAway,
            // v21.0 — No Blind Card Gate: خط واقعی بازار (OddsRecord یا λ_Market حل‌شده از ضرایب)
            hasMarketOdds: match.lambdaMarketHome != null || match.lambdaMarketAway != null || Boolean(priceRow),
          },
          regimeCtx
        );
        if (!decision) continue;

        // ═══ v20.0 — حلقه کالیبراسیون دسته‌ها (سند §۴-۱) ═══
        // اگر رژیم منتخب مسیریاب تعلیق‌شده باشد (Category ROI منفی)، سیستم به بهترین
        // دسته سودده بعدی هدایت می‌کند؛ اگر هیچ دسته فعال ماتریسی نبود → دفتر سایه.
        const calibration = await getCachedCalibration();
        const suspendedCats = new Set((calibration?.states ?? []).filter((s) => s.suspended).map((s) => s.category as string));
        let calibrationShadow = false;
        let calibrationRedirect: string | null = null;
        const winnerKey0 = router.winner?.key ?? null;
        if (winnerKey0 && suspendedCats.has(winnerKey0)) {
          const alt = [...(router.candidates ?? [])]
            .sort((a, b) => b.score - a.score)
            .find((c) => !suspendedCats.has(c.key));
          if (alt) {
            calibrationRedirect = `${winnerKey0} → ${alt.key}`;
            router.winner = alt;
            router.winnerVariantId = alt.variantId;
          } else {
            // هیچ دسته فعال ماتریسی نبود — کارت به دفتر سایه می‌رود (بدون تایید)
            calibrationShadow = true;
          }
        }

        // ─── v11.0 — دفتر سایه (Shadow Ledger) ───
        // وتو دیگر «دورانداختن» نیست: کارت سایه با supervisorApproved=false ثبت می‌شود
        // تا با همان موتور ESPN تسویه کاغذی شود و سوگیری بازماندگی حذف گردد.
        // تلگرام به‌صورت ساختاری هرگز کارت سایه را منتشر نمی‌کند (سپر سه‌لایه).
        // v16.0 — لیگ سمّی/خارج وایت‌لیست هم کارت را مستقیماً به دفتر سایه می‌فرستد.
        // v20.0 — تعلیق کالیبراسیون همه دسته‌ها هم کارت را به سایه می‌فرستد.
        // ═══ v19.0-restore — مسیر مستقل رژیم‌های تک‌ستون/کمبو ═══
        // فیلتر ضریب همپوشانی مثبت فقط بر «زوج‌تیپ‌های دوبال» (تیپ A ↔ تیپ B) حاکم است؛
        // رژیم‌های 🏦 BANKER (تک‌مارکت رسمی) و 🧩 COMBO (کمبو رسمی + پوشش) با گیت اختصاصی
        // خودشان قضاوت می‌شوند. اگر زوج‌های G به فیلتر همپوشانی نخوردند اما بنکر/کمبو
        // واجد شرایط بود، کارت همان رژیم تایید می‌شود (احیای ویترین v19.0 — هیچ باکسی +0.0u نمی‌ماند).
        const hardRedRisk = (c: BetTypeCandidate): boolean => c.jointLossProb * 100 <= HARD_RED_VETO_RISK_PCT;
        const bestOfKey = (key: "BANKER" | "COMBO"): BetTypeCandidate | null => {
          const pool = router.candidates.filter((c) => {
            if (c.key !== key) return false;
            if (!hardRedRisk(c) || c.ev < APPROVE_EV_MIN) return false;
            if (key === "BANKER") {
              return c.mainProb >= BANKER_BASE_PROB_MIN_V18 && c.mainOdds >= 1.15 && c.mainOdds <= 2.0;
            }
            return (
              c.winProb >= COMBO_COVERAGE_MIN_V18 &&
              c.sharpe >= COMBO_SHARPE_MIN_V18 &&
              Math.max(engine.dc.lambdaHome, engine.dc.lambdaAway) >= 1.35 &&
              Math.min(engine.dc.lambdaHome, engine.dc.lambdaAway) <= 1.25
            );
          });
          return pool.length > 0 ? pool.reduce((a, b) => (b.score > a.score ? b : a)) : null;
        };
        const singleRegimeWinner =
          router.winner && !router.veto && !gate.veto && !calibrationShadow && (router.winner.key === "BANKER" || router.winner.key === "COMBO")
            ? router.winner
            : !gate.veto && !calibrationShadow
              ? (bestOfKey("BANKER") ?? bestOfKey("COMBO"))
              : null;
        const shadow = (decision.veto && !singleRegimeWinner) || gate.veto || calibrationShadow;
        if (calibrationRedirect) {
          console.log(`[auto-issue] v20.0 calibration redirect for ${ev.externalId}: ${calibrationRedirect}`);
        }

        const crown = decision.crown;

        // تاج طلایی — کارت‌های تایید (استیک استاندارد؛ دوبال = ۶۵u/۳۵u نامتقارن)
        const crownTier = shadow ? null : "GOLD";

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
          // ═══ v19.0-restore — محتوای کارت بر اساس رژیم برنده مسیریاب ═══
          // ⚖️ DUAL_HEDGE → کارت همپوشانی دوقلو با تخصیص نامتقارن ۶۵u تیپ A + ۳۵u تیپ B
          //   و سپر استاپ‌لاس زنده دقیقه ۶۵ (−۴۵.۰u در تله میانی) — دقیقاً مثل نسخه ۱۹.۰
          // 🏦 BANKER (خط ۳) و 🎯 DEEP_VALUE (خط ۲) → کارت تک‌مارکتی واقعی (استیک ۱۰۰u)
          // 🔗 میکس ۲ تایی (خط ۱) در issueDailyAccumulators از پایه‌های بنکر دو بازی مستقل صادر می‌شود
          ...(router.winner && !shadow && !decision.veto && router.winner.key === "DUAL_HEDGE"
            ? (() => {
                // v19.0-restore — محتوای کارت دوبال = «تاج تاییدشده سوپروایزر» (فیلتر ضریب
                // همپوشانی مثبت روی همین زوج برقرار است)؛ فقط وقتی تاج واقعاً وتو نشده باشد.
                const dualPair = crown;
                const m = overlapMetricsOf(dualPair.totalOddsA, dualPair.totalOddsB, dualPair.jointStates.bothWin, dualPair.jointStates.bothLose);
                // 🥈 سطح تاج نقره‌ای مسیریاب — استیک نصف‌شده Half-Kelly (سند v18/v19)
                const silverScale = router.tier === "SILVER" ? 0.5 : 1;
                const accStakeA = Math.round((dualPair.accelerator?.stakeA ?? 65) * silverScale * 10) / 10;
                const accStakeB = Math.round((dualPair.accelerator?.stakeB ?? 35) * silverScale * 10) / 10;
                return {
                  labelA: dualPair.labelA,
                  labelB: dualPair.labelB,
                  legsA: legsOf(dualPair.structure.legsA),
                  legsB: legsOf(dualPair.structure.legsB),
                  oddsA: dualPair.totalOddsA,
                  oddsB: dualPair.totalOddsB,
                  stakeA: accStakeA,
                  stakeB: accStakeB,
                  guaranteedProfit: Math.max(0, Math.round((dualPair.accelerator?.guaranteed ?? dualPair.equalProfit.profit) * silverScale * 10) / 10),
                  marginPct: m.guaranteedOverlapMarginPct,
                  archetype: dualPair.archetype?.short ?? "Orthogonal Dual-Hedge Pair (v19.0 Restore)",
                  archetypeCode: dualPair.archetype?.code ?? "G1",
                  modelProbAOverride: dualPair.selectionA.modelProb,
                  modelProbBOverride: dualPair.selectionB.modelProb,
                };
              })()
            : router.winner && !shadow && !decision.veto && router.winner.key === "BANKER"
            ? {
                labelA: router.winner.mainLabel,
                labelB: "—",
                legsA: router.winner.mainLegs.map((key) => ({
                  key,
                  matchExternalId: ev.externalId,
                  matchLabel: `${ev.homeTeam} × ${ev.awayTeam}`,
                })),
                legsB: [] as SettlementLegDTO[],
                oddsA: router.winner.mainOdds,
                oddsB: 1.01,
                // v19.0-restore — استیک از خود کاندید (در تاج نقره‌ای نصف‌شده — Half-Kelly)
                stakeA: router.winner.stakeMain,
                stakeB: 0,
                guaranteedProfit: Math.max(0, router.winner.guaranteedProfitUnits),
                marginPct: 0,
                archetype: "Safe Banker — High-Confidence Single Column",
                archetypeCode: "BANKER",
                modelProbAOverride: router.winner.mainProb,
                modelProbBOverride: null,
              }
            : singleRegimeWinner
            ? (() => {
                // ═══ v19.0-restore — کارت بنکر/کمبو تاییدشده حتی وقتی زوج‌های G فیلتر همپوشانی را پاس نکردند ═══
                const w = singleRegimeWinner;
                const isCombo = w.key === "COMBO";
                // 🥈 سطح تاج نرخ نقره‌ای — کاندیدهای fallback مقیاس‌نشده‌اند؛ اینجا مقیاس می‌شوند
                const silverScale = router.tier === "SILVER" ? 0.5 : 1;
                const stA = Math.round((isCombo ? w.stakeMain : 100) * silverScale * 10) / 10;
                const stB = Math.round((isCombo ? w.stakeCover : 0) * silverScale * 10) / 10;
                return {
                  labelA: w.mainLabel,
                  labelB: isCombo ? (w.coverLabel ?? "—") : "—",
                  legsA: w.mainLegs.map((key) => ({
                    key,
                    matchExternalId: ev.externalId,
                    matchLabel: `${ev.homeTeam} × ${ev.awayTeam}`,
                  })),
                  legsB: isCombo
                    ? ((w.coverLegs ?? []).map((key) => ({
                        key,
                        matchExternalId: ev.externalId,
                        matchLabel: `${ev.homeTeam} × ${ev.awayTeam}`,
                      })) as SettlementLegDTO[])
                    : ([] as SettlementLegDTO[]),
                  oddsA: w.mainOdds,
                  oddsB: isCombo ? (w.coverOdds ?? 1.01) : 1.01,
                  stakeA: stA,
                  stakeB: stB,
                  guaranteedProfit: Math.max(0, Math.round(w.guaranteedProfitUnits * silverScale * 10) / 10),
                  marginPct: 0,
                  archetype: isCombo ? "Official Combo — Controlled Favorite (v19.0 Restore)" : "Safe Banker — High-Confidence Single Column",
                  archetypeCode: w.key,
                  modelProbAOverride: w.mainProb,
                  modelProbBOverride: isCombo ? (w.coverProb ?? null) : null,
                };
              })()
            : {
                // فقط کارت سایه (دفتر کاغذی — هرگز منتشر نمی‌شود) با محتوای زوج اتمیک
                labelA: crown.labelA,
                labelB: crown.labelB,
                legsA: legsOf(crown.structure.legsA),
                legsB: legsOf(crown.structure.legsB),
                oddsA: crown.totalOddsA,
                oddsB: crown.totalOddsB,
                stakeA: crown.equalProfit.stakeA,
                stakeB: crown.equalProfit.stakeB,
                guaranteedProfit: Math.max(0, crown.equalProfit.profit),
                marginPct: crown.guaranteedMarginPct,
                archetype: crown.archetype?.short ?? null,
                archetypeCode: crown.archetype?.code ?? null,
              }),
          // v18.0 — خط تولید Bet-Type از رژیم منتخب مسیریاب (افراز مجزای کارنامه)
          // v19.0-restore — خط تولید باید «محتوای واقعی کارت» را دنبال کند:
          //   · تاج پاک (بدون وتو) → رژیم مسیریاب (DUAL_HEDGE / BANKER / COMBO)
          //   · زوج‌های G وتو شده ولی بنکر/کمبو واجد شرایط → رژیم جایگزین singleRegimeWinner
          productLine: !shadow
            ? decision.veto && singleRegimeWinner
              ? singleRegimeWinner.key
              : (router.winner?.key ?? singleRegimeWinner?.key ?? undefined)
            : undefined,
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
          // v19.0-restore — امتیاز/سنجه‌های کارت از «محتوای صادرشده» (کارت بنکر/کمبو = سنجه خودش)
          supervisorScore: decision.veto && singleRegimeWinner
            ? singleRegimeWinner.score
            : Math.max(decision.score.raw, singleRegimeWinner?.score ?? 0),
          vetoReason: shadow
            ? gate.veto
              ? gate.reason
              : calibrationShadow
                ? "⚠️ تعلیق خودکار کالیبراسیون (Auto-Suspended due to Negative ROI — انتقال موقت به دفتر سایه تا رسیدن به آستانه اطمینان بالاتر)"
                : decision.vetoReason
            : null,
          jointLossRiskPct: decision.veto && singleRegimeWinner
            ? singleRegimeWinner.jointLossProb * 100
            : decision.score.jointLossRiskPct,
          doubleWinProbPct: decision.veto && singleRegimeWinner
            ? singleRegimeWinner.doubleWinProb * 100
            : decision.score.doubleWinProbPct,
          /** v18.0 — سطح تاج کارت برای حصاد آلفای دفتر سایه (GOLD / SILVER_SHADOW) */
          crownTier,
        };

        const issued = await issueSlip(item, { autoIssued: true });
        // v19.0 — به‌روزرسانی زنده شمارش رژیم‌ها در طول همین اجرا: توزیع متوازن باید
        // در یک پاس بازمحاسبه هم کار کند (شمارش پایه = تسویه‌شده‌ها + صادرشده‌های همین پاس)
        if (issued.created && !shadow) {
          const effKey: BetTypeKey =
            item.productLine === "COMBO"
              ? "COMBO"
              : item.productLine === "BANKER"
                ? "BANKER"
                : item.productLine === "ACCUMULATOR"
                  ? "ACCUMULATOR"
                  : "DUAL_HEDGE";
          regimeCounts[effKey] = (regimeCounts[effKey] ?? 0) + 1;
        }
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

    // ─── v18.3 — سهمیه پخش روزانه: اگر امروز کارت تاییدشده زیر حداقل باشد،
    // بهترین وتو-گیت‌های باقی‌مانده (ریسک ≤ ۱۲.۵٪، بالاترین امتیاز، فقط بازی‌های
    // پیش‌از-کیک‌آف) ترویج می‌شوند تا کانال VIP هر روز کارت و کانال عمومی هر روز
    // نتیجه واقعی داشته باشد (رفع باگ «ارسال نشدن کارت روزانه و نتایج»). ───
    try {
      const promoted = await enforceDailyBroadcastQuorum();
      if (promoted > 0) {
        console.log(`[auto-issue] v18.3 daily quorum: ${promoted} best-residual card(s) promoted for today's broadcast calendar`);
        registeredToday += promoted;
      }
    } catch (err) {
      console.warn("auto-issue daily quorum failed:", err);
    }

    // ─── v19.0 — آکومولاتور واقعی روز از بهترین بنکرها/کمبوهای تاییدشده (رژیم پنجم ویترین) ───
    try {
      const accIssued = await issueDailyAccumulators(cleanSlate);
      if (accIssued > 0) {
        console.log(`[auto-issue] v19.0 smart accumulator(s) issued: ${accIssued}`);
        registeredToday += accIssued;
      }
    } catch (err) {
      console.warn("auto-issue accumulator pass failed:", err);
    }

    // ─── v20.0 — حلقه کالیبراسیون دسته‌ها (بازمحاسبه تعلیق‌ها) + پاکسازی ACC ساختگی ───
    try {
      const snap = await evaluateCategoryCalibration();
      if (snap.suspendedCount > 0) {
        console.log(`[auto-issue] v20.0 category calibration: ${snap.suspendedCount} category(ies) auto-suspended (negative ROI), best=${snap.bestCategory ?? "—"}`);
      }
    } catch (err) {
      console.warn("category calibration pass failed:", err);
    }
    try {
      const accFix = await backfillAccLedgerRows();
      if (accFix.fixed + accFix.relegated > 0) {
        console.log(`[auto-issue] v20.0 synthetic ACC cleanup: fixed=${accFix.fixed} relegated=${accFix.relegated}`);
      }
    } catch (err) {
      console.warn("acc backfill pass failed:", err);
    }

    // ─── تسویه خودکار همه کارت‌های FT (شامل کارت‌های تازه صادرشده) + اعلام تلگرام ───
    let settled = 0;
    let notified = 0;
    try {
      // v16.0 — پنجره تسویه در حالت Clean-Slate ۷ روزه است تا بازی‌های ۶ روز اخیر کامل تسویه شوند
      // v19.0-restore — پنجره تسویه با daysBack هم‌گام می‌شود
      const result = await settleFinishedSlips({ notify, windowDays: cleanSlate ? (options?.daysBack ?? 6) + 1 : undefined });
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
      noLiveOdds,
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
