// ─────────────────────────────────────────────
// داده‌های اولیه: بازی‌های پیش رو با آمار پیشرفته (لایه داده‌کاوی)
// ─────────────────────────────────────────────

import { db } from "@/lib/db";
import { runDixonColes, fairOdds } from "./engine/poisson";
import { eloAbsenceAdjustment, HOME_ADV_ELO } from "./engine/elo";

interface SeedMatch {
  league: string;
  homeTeam: string;
  awayTeam: string;
  hoursFromNow: number;
  homeAttack: number;
  homeDefense: number;
  awayAttack: number;
  awayDefense: number;
  homeElo: number;
  awayElo: number;
  homeXg: number;
  awayXg: number;
  homePpda: number;
  awayPpda: number;
  homeFieldTilt: number;
  awayFieldTilt: number;
  homeForm: string;
  awayForm: string;
  weather: string;
  homeAbsence?: string;
  awayAbsence?: string;
  homeAbsenceImportance?: number;
  awayAbsenceImportance?: number;
  homeMotivation?: string;
  awayMotivation?: string;
  tacticalNote?: string;
}

const SEED_MATCHES: SeedMatch[] = [
  {
    league: "لیگ برتر انگلیس",
    homeTeam: "منچسترسیتی",
    awayTeam: "آرسنال",
    hoursFromNow: 20,
    homeAttack: 1.62, homeDefense: 0.82, awayAttack: 1.38, awayDefense: 0.78,
    homeElo: 1995, awayElo: 1958,
    homeXg: 2.31, awayXg: 1.94, homePpda: 11.2, awayPpda: 9.8,
    homeFieldTilt: 62, awayFieldTilt: 55,
    homeForm: "WWDWW", awayForm: "WDWWL",
    weather: "باران سبک - ۱۲ درجه",
    awayAbsence: "مصدومیت هافبک دفاعی اصلی",
    awayAbsenceImportance: 0.6,
    homeMotivation: "تعقیب صدر جدول",
    awayMotivation: "صدرنشینی - حفظ فاصله",
    tacticalNote: "میزبان با خط دفاعی بالا و پرس تهاجمی؛ میهمان از بلوک میانی با ضدحمله وینگرهای سرعتی.",
  },
  {
    league: "لالیگا اسپانیا",
    homeTeam: "رئال مادرید",
    awayTeam: "بارسلونا",
    hoursFromNow: 44,
    homeAttack: 1.58, homeDefense: 0.85, awayAttack: 1.52, awayDefense: 0.9,
    homeElo: 2010, awayElo: 1962,
    homeXg: 2.25, awayXg: 2.18, homePpda: 10.9, awayPpda: 10.4,
    homeFieldTilt: 58, awayFieldTilt: 61,
    homeForm: "WWWLW", awayForm: "WWDWW",
    weather: "آفتابی - ۲۲ درجه",
    homeAbsence: "غیبت مدافع راست اصلی",
    homeAbsenceImportance: 0.45,
    homeMotivation: "دربی ملی - اختلاف ۲ امتیازی",
    awayMotivation: "بازی در دست - برد = صدرنشینی",
    tacticalNote: "دو تیم خط دفاعی بالا؛ فضای پشت دفاع هر دو تیم در دسترس وینگرهای سرعتی.",
  },
  {
    league: "بوندسلیگا آلمان",
    homeTeam: "بایرن مونیخ",
    awayTeam: "دورتموند",
    hoursFromNow: 68,
    homeAttack: 1.72, homeDefense: 0.88, awayAttack: 1.34, awayDefense: 0.98,
    homeElo: 2001, awayElo: 1849,
    homeXg: 2.48, awayXg: 1.82, homePpda: 10.1, awayPpda: 12.0,
    homeFieldTilt: 64, awayFieldTilt: 52,
    homeForm: "WWWDW", awayForm: "LWDWL",
    weather: "ابری - ۸ درجه",
    homeAbsence: "غیبت مهاجم نوک اصلی",
    homeAbsenceImportance: 0.65,
    homeMotivation: "صدر جدول",
    awayMotivation: "مبارزه برای سهمیه چمپیونزلیگ",
    tacticalNote: "کلاسیک‌ر آلمان؛ میزبان فشار حداکثری، میهمان با ثبت پایین‌ترین PPDA لیگ در دقایق اخیر.",
  },
  {
    league: "سری آ ایتالیا",
    homeTeam: "اینتر",
    awayTeam: "یوونتوس",
    hoursFromNow: 92,
    homeAttack: 1.44, homeDefense: 0.76, awayAttack: 1.08, awayDefense: 0.72,
    homeElo: 1934, awayElo: 1878,
    homeXg: 1.86, awayXg: 1.32, homePpda: 11.8, awayPpda: 13.4,
    homeFieldTilt: 57, awayFieldTilt: 47,
    homeForm: "DWWWD", awayForm: "DWDWD",
    weather: "مه صبحگاهی رفع شده - ۱۵ درجه",
    homeMotivation: "صدرنشینی",
    awayMotivation: "بازی بدون باخت حفظ شود",
    tacticalNote: "یوونتوس با بلوک پایین و دفاع ۵ نفره؛ بازی با تمپوی پایین و کم‌گل محتمل است.",
  },
  {
    league: "لیگ ۱ فرانسه",
    homeTeam: "پاری سن ژرمن",
    awayTeam: "مارسی",
    hoursFromNow: 26,
    homeAttack: 1.66, homeDefense: 0.84, awayAttack: 1.21, awayDefense: 0.95,
    homeElo: 1972, awayElo: 1788,
    homeXg: 2.36, awayXg: 1.55, homePpda: 10.7, awayPpda: 12.6,
    homeFieldTilt: 63, awayFieldTilt: 48,
    homeForm: "WWDWW", awayForm: "WLWDW",
    weather: "پاک - ۱۸ درجه",
    homeMotivation: "تعقیب صدر",
    awayMotivation: "دربی فرانسه",
    tacticalNote: "میزبان با مالکیت بالا در یک‌سوم دفاعی حریف (Field Tilt = ۶۳٪).",
  },
  {
    league: "لیگ برتر انگلیس",
    homeTeam: "لیورپول",
    awayTeam: "تاتنهام",
    hoursFromNow: 50,
    homeAttack: 1.55, homeDefense: 0.8, awayAttack: 1.26, awayDefense: 1.02,
    homeElo: 1984, awayElo: 1822,
    homeXg: 2.19, awayXg: 1.61, homePpda: 9.6, awayPpda: 13.8,
    homeFieldTilt: 61, awayFieldTilt: 46,
    homeForm: "WWWDW", awayForm: "LDWLL",
    weather: "باد شدید - ۱۰ درجه",
    awayAbsence: "محرومیت هافبک مرکزی",
    awayAbsenceImportance: 0.55,
    homeMotivation: "قهرمانی نزدیک",
    awayMotivation: "بخش پایین جدول - حفظ بقا",
    tacticalNote: "پرس شدید میزبان (PPDA = ۹.۶) در برابر خط دفاعی بلند میهمان؛ ضدحمله پرخطر.",
  },
  {
    league: "سری آ ایتالیا",
    homeTeam: "میلان",
    awayTeam: "ناپولی",
    hoursFromNow: 116,
    homeAttack: 1.36, homeDefense: 0.86, awayAttack: 1.41, awayDefense: 0.79,
    homeElo: 1871, awayElo: 1864,
    homeXg: 1.74, awayXg: 1.79, homePpda: 12.2, awayPpda: 11.5,
    homeFieldTilt: 51, awayFieldTilt: 53,
    homeForm: "WLDLW", awayForm: "WWWDW",
    weather: "نیمه‌ابری - ۱۶ درجه",
    homeMotivation: "سهمیه اروپایی",
    awayMotivation: "صدر جدول",
    tacticalNote: "تقابل متوازن؛ هر دو تیم با وینگ‌بک تهاجمی و فضای عرضی باز.",
  },
  {
    league: "لالیگا اسپانیا",
    homeTeam: "اتلتیکو مادرید",
    awayTeam: "سویا",
    hoursFromNow: 74,
    homeAttack: 1.28, homeDefense: 0.7, awayAttack: 0.98, awayDefense: 0.94,
    homeElo: 1901, awayElo: 1752,
    homeXg: 1.62, awayXg: 1.18, homePpda: 12.9, awayPpda: 14.1,
    homeFieldTilt: 54, awayFieldTilt: 44,
    homeForm: "WDWWW", awayForm: "DLLDW",
    weather: "سرد و خشک - ۱۱ درجه",
    homeMotivation: "تثبیت جایگاه چمپیونزلیگ",
    awayMotivation: "خروج از سقوط",
    tacticalNote: "بلوک فشرده ۵-۳-۲ میزبان؛ سناریوی بازی بسته و کم‌گل با احتمال بالا.",
  },
];

/**
 * اگر جدول خالی باشد، داده‌های اولیه را می‌سازد.
 * ضرایب سایت از موتور دیکسون-کولز با حاشیه سود ۵٪ محاسبه می‌شوند.
 */
export async function ensureSeeded(): Promise<void> {
  const count = await db.match.count();
  if (count > 0) return;

  for (const m of SEED_MATCHES) {
    const eloHomeAdj = m.homeAbsenceImportance
      ? eloAbsenceAdjustment(m.homeElo, m.homeAbsenceImportance)
      : m.homeElo;
    const eloAwayAdj = m.awayAbsenceImportance
      ? eloAbsenceAdjustment(m.awayElo, m.awayAbsenceImportance)
      : m.awayElo;

    const probs = runDixonColes({
      homeAttack: m.homeAttack,
      awayAttack: m.awayAttack,
      homeDefense: m.homeDefense,
      awayDefense: m.awayDefense,
      leagueAvg: 1.35,
      homeAdvantage: 1.12,
      rho: -0.08,
      eloDiff: eloHomeAdj - eloAwayAdj,
      eloWeight: 0.35,
      homeAbsenceImpact: (m.homeAbsenceImportance ?? 0) * 0.15,
      awayAbsenceImpact: (m.awayAbsenceImportance ?? 0) * 0.15,
      timeDecayXi: 0.0065,
      daysAgo: 60,
    });

    const p1x = probs.pHome + probs.pDraw;

    await db.match.create({
      data: {
        league: m.league,
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
        kickoff: new Date(Date.now() + m.hoursFromNow * 3600 * 1000),
        homeAttack: m.homeAttack,
        homeDefense: m.homeDefense,
        awayAttack: m.awayAttack,
        awayDefense: m.awayDefense,
        homeElo: m.homeElo,
        awayElo: m.awayElo,
        homeXg: m.homeXg,
        awayXg: m.awayXg,
        homePpda: m.homePpda,
        awayPpda: m.awayPpda,
        homeFieldTilt: m.homeFieldTilt,
        awayFieldTilt: m.awayFieldTilt,
        homeForm: m.homeForm,
        awayForm: m.awayForm,
        weather: m.weather,
        homeAbsence: m.homeAbsence ?? null,
        awayAbsence: m.awayAbsence ?? null,
        homeMotivation: m.homeMotivation ?? null,
        awayMotivation: m.awayMotivation ?? null,
        tacticalNote: m.tacticalNote ?? null,
        oddsHome: fairOdds(probs.pHome),
        oddsDraw: fairOdds(probs.pDraw),
        oddsAway: fairOdds(probs.pAway),
        oddsOver25: fairOdds(probs.pOver25),
        oddsUnder25: fairOdds(probs.pUnder25),
        odds1x: fairOdds(p1x),
        status: "UPCOMING",
      },
    });
  }
}
