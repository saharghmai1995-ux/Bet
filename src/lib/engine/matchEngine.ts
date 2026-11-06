// ─────────────────────────────────────────────
// خط لوله موتور بازی: دیکسون-کولز + تعدیل‌های زمینه‌ای + خط شارپ
// مشترک بین ایجنت مناظره و ایجنت پرتفوی
// ─────────────────────────────────────────────

import { runDixonColes, type MarketProbabilities } from "./poisson";
import { effectiveNpxg, refereeAdjustment, fatigueAdjustment, type RefereeProfile } from "./contextual";
import { shinDevig, shinDevigPair } from "./devig";
import type { Match, Player, Referee, OddsRecord } from "@prisma/client";

export interface MatchContextNotes {
  gamestateNote: string | null;
  fatigueNote: string | null;
  refereeNote: string | null;
  lineupShockNote: string | null;
}

export interface MatchEngine {
  dc: MarketProbabilities;
  lambdaCorners: number;
  lambdaCards: number;
  penProb: number;
  notes: MatchContextNotes;
}

type MatchWithRefs = Match & { referee: Referee | null };

/**
 * اجرای کامل موتور برای یک بازی:
 * ۱) npxG تفکیک وضعیت بازی (پرهیز از xG خام) → تعدیل قدرت حمله
 * ۲) شوک ترکیب T-60 → تعدیل حمله بر اساس دلتای VAEP
 * ۳) خستگی سفر/تقویم → تعدیل λ دو تیم
 * ۴) پروفایل داور → λ کارت و احتمال پنالتی
 */
export function computeMatchEngine(match: MatchWithRefs): MatchEngine {
  // ۱) وضعیت بازی
  const homeEff = effectiveNpxg(
    match.homeNpxgLevel !== null ? { level: match.homeNpxgLevel, leading: match.homeNpxgLeading ?? 0, trailing: match.homeNpxgTrailing ?? 0 } : null,
    match.homeXg
  );
  const awayEff = effectiveNpxg(
    match.awayNpxgLevel !== null ? { level: match.awayNpxgLevel, leading: match.awayNpxgLeading ?? 0, trailing: match.awayNpxgTrailing ?? 0 } : null,
    match.awayXg
  );
  const homeAttackAdj = match.homeAttack * (homeEff.value / Math.max(match.homeXg, 0.3));
  const awayAttackAdj = match.awayAttack * (awayEff.value / Math.max(match.awayXg, 0.3));

  // ۲) شوک ترکیب T-60
  const shockH = match.lineupShockHome ?? 0;
  const shockA = match.lineupShockAway ?? 0;
  const homeAttackShock = homeAttackAdj * (1 + Math.max(-0.5, Math.min(0.15, shockH)));
  const awayAttackShock = awayAttackAdj * (1 + Math.max(-0.5, Math.min(0.15, shockA)));

  // ۳) خستگی
  const fatigue = fatigueAdjustment({
    awayTravelKm: match.awayTravelKm,
    awayRestDays: match.awayRestDays,
    homeRestDays: match.homeRestDays,
  });

  // ۴) داور
  const refProfile: RefereeProfile | null = match.referee
    ? {
        name: match.referee.name,
        yellowPerMatch: match.referee.yellowPerMatch,
        penPerMatch: match.referee.penPerMatch,
        foulsPerMatch: match.referee.foulsPerMatch,
        strictness: match.referee.strictness,
        note: match.referee.note,
      }
    : null;
  // تمایل به خطا: PPDA بالاتر = پرس کمتر = خطای بیشتر
  const homeFoulProp = Math.min(1.3, Math.max(0.85, match.homePpda / 12));
  const awayFoulProp = Math.min(1.3, Math.max(0.85, match.awayPpda / 12));
  const ref = refereeAdjustment(refProfile, homeFoulProp, awayFoulProp);

  const dc = runDixonColes({
    homeAttack: homeAttackShock * fatigue.homeLambdaMultiplier,
    awayAttack: awayAttackShock * fatigue.awayLambdaMultiplier,
    homeDefense: match.homeDefense,
    awayDefense: match.awayDefense,
    leagueAvg: 1.35,
    homeAdvantage: 1.12,
    rho: -0.08,
    eloDiff: match.homeElo - match.awayElo,
    eloWeight: 0.35,
    homeAbsenceImpact: match.homeAbsence ? 0.08 : 0,
    awayAbsenceImpact: match.awayAbsence ? 0.08 : 0,
    timeDecayXi: 0.0065,
    daysAgo: 60,
  });

  // امید کرنر از میانگین‌های دو تیم
  const homeCorners = match.homeCornersFor !== null && match.awayCornersAgainst !== null
    ? (match.homeCornersFor + match.awayCornersAgainst) / 2 : 5.2;
  const awayCorners = match.awayCornersFor !== null && match.homeCornersAgainst !== null
    ? (match.awayCornersFor + match.homeCornersAgainst) / 2 : 4.4;

  return {
    dc,
    lambdaCorners: homeCorners + awayCorners,
    lambdaCards: ref.lambdaCards,
    penProb: ref.penProb,
    notes: {
      gamestateNote: homeEff.note ?? awayEff.note,
      fatigueNote: fatigue.note,
      refereeNote: ref.note,
      lineupShockNote:
        match.lineupAnnounced && (shockH !== 0 || shockA !== 0)
          ? `ترکیب رسمی اعلام شد — دلتای قدرت VAEP: میزبان ${(shockH * 100).toFixed(0)}٪ / میهمان ${(shockA * 100).toFixed(0)}٪ و در λ لحاظ شد`
          : null,
    },
  };
}

/** حذف حاشیه شین روی خط هر بوک‌میکر (1X2) */
export function devigRows(odds: OddsRecord[]) {
  const labels: Record<string, string> = {
    PINNACLE: "پیناکل (Sharp)",
    SOFT_A: "بت‌مستر (Soft)",
    SOFT_B: "پرسیان‌بت (Soft)",
  };
  const order = ["PINNACLE", "SOFT_A", "SOFT_B"];
  return order
    .map((book) => {
      const rec = odds.find((o) => o.bookmaker === book);
      if (!rec) return null;
      const res = shinDevig([rec.oddsHome, rec.oddsDraw, rec.oddsAway]);
      return {
        bookmaker: book,
        // v4.0: نام واقعی بوک‌میکر از فید زنده (The Odds API / ESPN) در اولویت
        bookmakerLabel: rec.bookmakerLabel ?? labels[book] ?? book,
        marginPct: res.margin,
        shinProbs: { home: res.probs[0], draw: res.probs[1], away: res.probs[2] },
        shinZ: res.z,
        powerK: res.k,
        sharp: book === "PINNACLE",
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}

/** بهترین قیمت هر انتخاب در بازار OU از بین بوک‌میکرها با مرجع شین پیناکل */
export function sharpOu(odds: OddsRecord[]): { over: number; under: number } | null {
  const pin = odds.find((o) => o.bookmaker === "PINNACLE");
  if (!pin) return null;
  const res = shinDevigPair([pin.oddsOver25, pin.oddsUnder25]);
  return { over: res.over, under: res.under };
}

/** محاسبه شوک ترکیب از بازیکنان (T-60) */
export function computeLineupShock(players: Player[]): {
  xiVaep: number;
  xiXt: number;
  fullStrengthVaep: number;
  shockDelta: number;
  missingKeyPlayers: { name: string; position: string; xT: number; vaep: number; status: string }[];
  unavailableCount: number;
} {
  const available = players.filter((p) => p.status === "FIT");
  const doubtful = players.filter((p) => p.status === "DOUBTFUL");
  const missing = players.filter((p) => p.status === "INJURED" || p.status === "SUSPENDED");

  const byVaep = [...players].sort((a, b) => b.vaep - a.vaep);
  const fullStrengthVaep = byVaep.slice(0, 11).reduce((s, p) => s + p.vaep, 0);

  const xiPool = [...available, ...doubtful.map((p) => ({ ...p, vaep: p.vaep * 0.5 }))];
  const xiVaep = xiPool.sort((a, b) => b.vaep - a.vaep).slice(0, 11).reduce((s, p) => s + p.vaep, 0);
  const xiXt = xiPool.sort((a, b) => b.xT - a.xT).slice(0, 11).reduce((s, p) => s + p.xT, 0);

  const shockDelta = fullStrengthVaep > 0 ? (xiVaep - fullStrengthVaep) / fullStrengthVaep : 0;

  return {
    xiVaep,
    xiXt,
    fullStrengthVaep,
    shockDelta,
    missingKeyPlayers: missing
      .filter((p) => p.isKey || p.xT > 0.35)
      .map((p) => ({ name: p.name, position: p.position, xT: p.xT, vaep: p.vaep, status: p.status })),
    unavailableCount: missing.length + doubtful.length,
  };
}
