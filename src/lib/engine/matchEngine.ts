// ─────────────────────────────────────────────
// خط لوله موتور بازی: دیکسون-کولز + تعدیل‌های زمینه‌ای + خط شارپ
// مشترک بین ایجنت مناظره و ایجنت پرتفوی
// ─────────────────────────────────────────────

import { runDixonColes, type MarketProbabilities } from "./poisson";
import { effectiveNpxg, refereeAdjustment, fatigueAdjustment, type RefereeProfile } from "./contextual";
import { shinDevig, shinDevigPair } from "./devig";
import type { Match, Referee, OddsRecord } from "@prisma/client";

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
    // v6.0: میانگین واقعی لیگ از جدول رسمی رده‌بندی ESPN (fallback: ۱.۳۵)
    leagueAvg: match.leagueTeamAvg ?? 1.35,
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

/** حذف حاشیه شین روی خط هر بوک‌میکر واقعی (1X2) — v6.0: فقط بوک‌میکرهای واقعی فید */
export function devigRows(odds: OddsRecord[]) {
  const order = ["PINNACLE", "SOFT_A", "SOFT_B"];
  return order
    .map((book) => {
      const rec = odds.find((o) => o.bookmaker === book);
      if (!rec) return null;
      const res = shinDevig([rec.oddsHome, rec.oddsDraw, rec.oddsAway]);
      return {
        bookmaker: book,
        // v6.0: فقط نام واقعی از فید زنده (The Odds API / ESPN Core) — هیچ نام ساختگی نداریم
        bookmakerLabel: rec.bookmakerLabel ?? `بوک‌میکر واقعی #${book === "PINNACLE" ? 1 : book === "SOFT_A" ? 2 : 3}`,
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

