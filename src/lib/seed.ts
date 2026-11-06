// ─────────────────────────────────────────────
// داده‌های اولیه سطح اول:
// بازیکنان با ارزش‌گذاری VAEP/xT، داوران، ضرایب Pinnacle/Soft Books،
// npxG تفکیک وضعیت بازی، سفر و تقویم + لاگ کالیبراسیون بریر
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
  // زمینه: وضعیت بازی، کرنر، سفر، تقویم، داور
  homeNpxg: [number, number, number]; // level, leading, trailing
  awayNpxg: [number, number, number];
  homeCorners: [number, number]; // for, against
  awayCorners: [number, number];
  awayTravelKm: number;
  homeRestDays: number;
  awayRestDays: number;
  referee: string;
}

const REFEREES = [
  { name: "مایکل الیور", yellowPerMatch: 4.2, penPerMatch: 0.24, foulsPerMatch: 22, strictness: "AVERAGE", note: "خطای پنالتی روی تماس داخل محوطه حساس" },
  { name: "آنتونیو ماتئو لائوس", yellowPerMatch: 5.8, penPerMatch: 0.3, foulsPerMatch: 28, strictness: "STRICT", note: "دربی‌های پرتنش را با کارت مدیریت می‌کند" },
  { name: "فلیکس تسوایر", yellowPerMatch: 3.9, penPerMatch: 0.22, foulsPerMatch: 24, strictness: "AVERAGE", note: null },
  { name: "دانیله اورساتو", yellowPerMatch: 4.0, penPerMatch: 0.2, foulsPerMatch: 23, strictness: "AVERAGE", note: null },
  { name: "کلمنت تورپن", yellowPerMatch: 4.4, penPerMatch: 0.25, foulsPerMatch: 25, strictness: "STRICT", note: null },
  { name: "پل تیرنی", yellowPerMatch: 3.6, penPerMatch: 0.18, foulsPerMatch: 21, strictness: "LENIENT", note: "اجازه بازی فیزیکی — کارت کم" },
  { name: "مارکو دی بلو", yellowPerMatch: 4.1, penPerMatch: 0.23, foulsPerMatch: 24, strictness: "AVERAGE", note: null },
  { name: "خسوس گیل مانزانو", yellowPerMatch: 5.2, penPerMatch: 0.28, foulsPerMatch: 27, strictness: "STRICT", note: null },
];

// فرمت: نام:پست:xT:VAEP:وضعیت:کلیدی(0/1) — GK/DEF/MID/FW و FIT/INJURED/SUSPENDED/DOUBTFUL
const TEAM_PLAYERS: Record<string, string> = {
  "منچسترسیتی":
    "ادرسون:GK:0.01:0.02:FIT:0;استونز:DEF:0.15:0.06:FIT:0;روبن دیاس:DEF:0.12:0.09:FIT:0;آکانجی:DEF:0.14:0.05:FIT:0;گرلیش:FW:0.42:0.05:FIT:0;رودری:MID:0.35:0.13:FIT:1;کوین دبروینه:MID:0.55:0.09:FIT:1;فیل فودن:MID:0.5:0.08:FIT:1;برناردو سیلوا:MID:0.38:0.06:FIT:0;ارلینگ هالند:FW:0.82:0.15:FIT:1;خولیان آلفارز:FW:0.36:0.05:FIT:0",
  "آرسنال":
    "دیوید رایا:GK:0.01:0.02:FIT:0;بن وایت:DEF:0.16:0.05:FIT:0;سالیبا:DEF:0.11:0.09:FIT:0;گابریل ماگالیس:DEF:0.13:0.08:FIT:0;کیران تیرنی:DEF:0.14:0.04:FIT:0;دکلان رایس:MID:0.28:0.11:INJURED:1;مارتین اودگارد:MID:0.56:0.09:FIT:1;میکیل آرتتا:MID:0.18:0.04:FIT:0;بخایو ساکا:FW:0.64:0.12:FIT:1;گابریل مارتینلی:FW:0.41:0.06:FIT:0;کای هافرز:FW:0.32:0.06:FIT:0;لوئک تروسار:FW:0.33:0.05:FIT:0",
  "رئال مادرید":
    "تیبو کورتوا:GK:0.01:0.03:FIT:0;دانی کارواخال:DEF:0.22:0.06:INJURED:1;ادر میلتائو:DEF:0.09:0.07:FIT:0;آنتونیو رودیگر:DEF:0.08:0.07:FIT:0;فرلان مندی:DEF:0.2:0.05:FIT:0;ادواردو کاماوینگا:MID:0.24:0.05:FIT:0;فدریکو والورده:MID:0.31:0.08:FIT:0;جود بیلینگام:MID:0.58:0.12:FIT:1;وینسیوس جونیور:FW:0.68:0.11:FIT:1;رودریگو:FW:0.44:0.07:FIT:0;لوکا مودریچ:MID:0.33:0.05:FIT:0",
  "بارسلونا":
    "مارک-آندره تراشتگن:GK:0.01:0.04:FIT:0;ژول کونده:DEF:0.24:0.05:FIT:0;اینالگو مارتینس:DEF:0.1:0.05:FIT:0;آندریاس کریستنسن:DEF:0.11:0.05:FIT:0;الخاندرو بالده:DEF:0.25:0.04:FIT:0;مارک کاسادو:MID:0.18:0.05:FIT:0;فرنکی دی یونگ:MID:0.3:0.08:FIT:0;پدری:MID:0.43:0.07:FIT:1;لامین یامال:FW:0.55:0.09:FIT:1;رافینیا:FW:0.46:0.07:FIT:0;رابرت لواندوفسکی:FW:0.61:0.1:FIT:1",
  "بایرن مونیخ":
    "مانوئل نویر:GK:0.01:0.03:FIT:0;کیم مین-جائه:DEF:0.3:0.07:FIT:0;دایت اوپامکانو:DEF:0.08:0.06:FIT:0;ماتیس دی لیخت:DEF:0.09:0.07:FIT:0;آلفونسو دیویس:DEF:0.34:0.05:FIT:0;جوشوا کیمیش:MID:0.29:0.07:FIT:0;لئون گورتسکا:MID:0.2:0.04:FIT:0;جامال موسیالا:MID:0.5:0.09:FIT:1;لروی سانه:MID:0.4:0.05:FIT:0;میشائل اولیسه:FW:0.38:0.06:FIT:0;هری کین:FW:0.85:0.16:INJURED:1",
  "دورتموند":
    "گرگور کوبل:GK:0.01:0.05:FIT:0;نیکلاس زوله:DEF:0.14:0.05:FIT:0;نیکو شلاتنبک:DEF:0.12:0.04:FIT:0;یولیان ری‌رسون:DEF:0.2:0.05:FIT:0;والدیمار آنتون:DEF:0.09:0.04:FIT:0;امره کان:MID:0.2:0.05:FIT:0;یولیان براندت:MID:0.4:0.07:FIT:1;پاسکال گروس:MID:0.24:0.04:FIT:0;دونییل مالن:FW:0.4:0.05:FIT:0;کاریم آدمی:FW:0.32:0.04:FIT:0;سرهو گیراسی:FW:0.47:0.08:FIT:1",
  "اینتر":
    "یان سومر:GK:0.01:0.04:FIT:0;بنجامین پاوار:DEF:0.25:0.06:FIT:0;فرانچسکو آچربی:DEF:0.06:0.08:FIT:0;الساندرو باستونی:DEF:0.18:0.09:FIT:0;فدریکو دی‌مارکو:DEF:0.36:0.06:FIT:0;نیکولو باره‌لا:MID:0.41:0.08:FIT:1;هکان چالهان‌اوغلو:MID:0.43:0.07:FIT:1;هنریک میخیتاریان:MID:0.22:0.05:FIT:0;مارسلو بروزویچ:MID:0.15:0.04:FIT:0;لائوتارو مارتینس:FW:0.62:0.12:FIT:1;مارکوس تورام:FW:0.32:0.07:FIT:0",
  "یوونتوس":
    "میشله دی گریگوریو:GK:0.01:0.03:FIT:0;آندرئا کامبیاسو:DEF:0.2:0.05:FIT:0;فدریکو گاتی:DEF:0.12:0.05:FIT:0;گلاس برمر:DEF:0.1:0.1:FIT:1;دانیله روجانی:DEF:0.08:0.04:FIT:0;مانوئل لوکاتلی:MID:0.22:0.08:FIT:0;آدرین رابیو:MID:0.26:0.06:FIT:0;وستون مک‌کنی:MID:0.31:0.05:FIT:0;تئوهرارد? :MID:0:0:FIT:0;کنان یلدیز:FW:0.4:0.08:FIT:1;دوسان ولاهوویچ:FW:0.41:0.07:FIT:0",
  "پاری سن ژرمن":
    "جیانلوئیجی دوناروما:GK:0.01:0.04:FIT:0;آشرف هاکیمی:DEF:0.46:0.07:FIT:1;مارکیوس:DEF:0.1:0.08:FIT:0;ویلیام پاچو:DEF:0.09:0.06:FIT:0;نونو مندس:DEF:0.27:0.05:FIT:0;ویتینیا:MID:0.41:0.09:FIT:1;جوائو نویش:MID:0.31:0.07:FIT:0;فابین رویس:MID:0.35:0.06:FIT:0;عثمان دمبله:FW:0.48:0.07:FIT:0;بردسون بارکولا:FW:0.43:0.06:FIT:0;رندال کولو موانی:FW:0.3:0.05:FIT:0",
  "مارسی":
    "پائول لوپس:GK:0.01:0.02:FIT:0;لئوناردو بالردی:DEF:0.08:0.05:FIT:0;کورنلیوس:DEF:0.09:0.04:FIT:0;امیر مر? :DEF:0:0:FIT:0;عمید? :DEF:0:0:FIT:0;پیرامین هویبرگ:MID:0.25:0.05:FIT:0;ژیفروند کوندوگبیا:MID:0.2:0.05:FIT:0;والنتین رونگیر:MID:0.28:0.04:FIT:0;میسون گرینوود:FW:0.46:0.07:FIT:1;پیر امریک اوبامیانگ:FW:0.35:0.06:FIT:0;لوئیس هنری:MID:0.3:0.04:FIT:0",
  "لیورپول":
    "الیسون بکر:GK:0.01:0.04:FIT:0;ترنت الکساندر-آرنولد:DEF:0.52:0.05:FIT:1;ویرژیل فان دایک:DEF:0.12:0.12:FIT:1;ایبراهیما کوناته:DEF:0.08:0.07:FIT:0;آندرو رابرسون:DEF:0.28:0.05:FIT:0;راین گرایونبرخ:MID:0.18:0.07:FIT:0;الکسیس مک‌آلیستر:MID:0.36:0.06:FIT:0;دومینیک زوبوسلای:MID:0.33:0.06:FIT:0;محمد صلاح:FW:0.74:0.13:FIT:1;لوئیس دیاز:FW:0.45:0.07:FIT:0;دیوگو ژوتا:FW:0.38:0.06:FIT:0",
  "تاتنهام":
    "جوئلو ویکاریو:GK:0.01:0.03:FIT:0;پدرو پورو:DEF:0.26:0.05:FIT:0;کریستین رومرو:DEF:0.15:0.09:FIT:0;مکی ون ده ون:DEF:0.14:0.05:FIT:0;دستینی اودوبرت:DEF:0.22:0.04:FIT:0;یوی بیسوما:MID:0.22:0.07:SUSPENDED:1;جیمز میدیسون:MID:0.49:0.08:FIT:1;دجان کولوسفسکی:MID:0.3:0.05:FIT:0;هونگ-مین سون:FW:0.61:0.1:FIT:1;دومینیک سولیکه:FW:0.31:0.05:FIT:0;برنان جانسون:FW:0.34:0.05:FIT:0",
  "میلان":
    "میک مین یان:GK:0.01:0.03:FIT:0;دیوید کالابریا:DEF:0.24:0.05:FIT:0;فیکایو توموری:DEF:0.1:0.08:FIT:0;استرانیو پاولو? :DEF:0:0:FIT:0;تئو هرناندز:DEF:0.41:0.07:FIT:1;یوسف فوفانا:MID:0.2:0.05:FIT:0;تیجانی رایندرز:MID:0.33:0.06:FIT:0;روبن لوفتیوس-چیک:MID:0.28:0.05:FIT:0;کریستین پولیسیچ:FW:0.46:0.07:FIT:1;رافائ لئائو:FW:0.53:0.08:FIT:1;الوارو موراتا:FW:0.32:0.05:FIT:0",
  "ناپولی":
    "الکس مرت:GK:0.01:0.02:FIT:0;جووانی دی لورنزو:DEF:0.36:0.06:FIT:1;آمیر راهمانی:DEF:0.07:0.06:FIT:0;بونوجورنو:DEF:0.09:0.07:FIT:0;ماتیا اولیورا:DEF:0.21:0.04:FIT:0;استانیسلاو لوپوتکا:MID:0.3:0.1:FIT:1;آندره-فرانک زامبو آنگویسا:MID:0.18:0.05:FIT:0;اسکات مک‌تومینی:MID:0.36:0.07:FIT:0;خویچا کواتسخاریا:FW:0.56:0.09:FIT:1;روملو لوکاکو:FW:0.43:0.08:FIT:0;متئو پولیتانو:FW:0.35:0.05:FIT:0",
  "اتلتیکو مادرید":
    "یان اوبلاک:GK:0.01:0.04:FIT:0;ناهوئل مولینا:DEF:0.28:0.05:FIT:0;خوزه خیمنس:DEF:0.09:0.09:FIT:0;اکسل ویتسل:DEF:0.1:0.06:FIT:0;مارکوس یورنته:DEF:0.31:0.05:FIT:0;رودریگو د پل:MID:0.31:0.06:FIT:0;پابلو باریوس:MID:0.21:0.05:FIT:0;ساموئل لینو:MID:0.3:0.05:FIT:0;آنتوان گریزمن:FW:0.51:0.09:FIT:1;الکساندر سورلوت:FW:0.36:0.06:FIT:0;کونور گالاگر:MID:0.29:0.05:FIT:0",
  "سویا":
    "ارتن نیلند:GK:0.01:0.02:FIT:0;لوییس بامبا:DEF:0.09:0.04:FIT:0;خواکین کوره‌آ:DEF:0.12:0.04:FIT:0;خسوس ناواس:DEF:0.18:0.03:FIT:0;مارکائو آکونا:DEF:0.1:0.04:FIT:0;خوزه آنخل کارمونا:MID:0.2:0.04:FIT:0;لوکاس اکامبورو:MID:0.22:0.04:FIT:0;سعدیو مانی:MID:0.29:0.05:FIT:0;دوادی? :MID:0:0:FIT:0;لوک باکیو:FW:0.31:0.05:FIT:0;ایساک رومرو:FW:0.28:0.04:FIT:0",
};

// بازی‌های تمام‌شده برای حافظه کالیبراسیون (امتیاز بریر)
const CALIBRATION_SEEDS: {
  matchLabel: string;
  league: string;
  pick: string;
  predictedProb: number;
  outcome: "WIN" | "LOSS";
  lesson?: string;
}[] = [
  { matchLabel: "منچسترسیتی ۳−۱ منچستریونایتد", league: "لیگ برتر انگلیس", pick: "برد میزبان", predictedProb: 0.68, outcome: "WIN" },
  { matchLabel: "لیورپول ۲−۲ اورتون", league: "لیگ برتر انگلیس", pick: "برد میزبان", predictedProb: 0.63, outcome: "LOSS", lesson: "دربی محلی با کارت قرمز زودهنگام — مدل حساسیت به اخراج را کم‌برآورد کرد" },
  { matchLabel: "بارسلونا ۴−۰ ختافه", league: "لالیگا اسپانیا", pick: "برد میزبان", predictedProb: 0.74, outcome: "WIN" },
  { matchLabel: "اتلتیکو ۱−۲ رئال سوسیداد", league: "لالیگا اسپانیا", pick: "برد میزبان", predictedProb: 0.58, outcome: "LOSS" },
  { matchLabel: "بایرن ۵−۰ بوخوم", league: "بوندسلیگا آلمان", pick: "برد میزبان", predictedProb: 0.78, outcome: "WIN" },
  { matchLabel: "دورتموند ۳−۲ لایپزیگ", league: "بوندسلیگا آلمان", pick: "بالای ۲.۵ گل", predictedProb: 0.62, outcome: "WIN" },
  { matchLabel: "اشتوتگارت ۱−۱ فرایبورگ", league: "بوندسلیگا آلمان", pick: "برد میزبان", predictedProb: 0.55, outcome: "LOSS" },
  { matchLabel: "اینتر ۱−۱ ناپولی", league: "سری آ ایتالیا", pick: "زیر ۲.۵ گل", predictedProb: 0.57, outcome: "WIN" },
  { matchLabel: "میلان ۰−۱ لاتزیو", league: "سری آ ایتالیا", pick: "برد میزبان", predictedProb: 0.54, outcome: "LOSS", lesson: "تقویم فشرده میلان قبل از بازی اروپایی — وزن خستگی تقویم باید دوبرابر شود" },
  { matchLabel: "یوونتوس ۲−۰ جنوا", league: "سری آ ایتالیا", pick: "زیر ۲.۵ گل", predictedProb: 0.61, outcome: "WIN" },
  { matchLabel: "پاری سن ژرمن ۴−۲ لیون", league: "لیگ ۱ فرانسه", pick: "برد میزبان", predictedProb: 0.7, outcome: "WIN" },
  { matchLabel: "مارسی ۱−۱ نیس", league: "لیگ ۱ فرانسه", pick: "برد میزبان", predictedProb: 0.52, outcome: "LOSS" },
];

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
    homeNpxg: [2.1, 1.5, 2.5], awayNpxg: [1.75, 1.2, 2.3],
    homeCorners: [6.8, 3.6], awayCorners: [5.9, 4.1],
    awayTravelKm: 310, homeRestDays: 6, awayRestDays: 6,
    referee: "مایکل الیور",
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
    homeNpxg: [2.0, 1.7, 2.6], awayNpxg: [1.95, 1.5, 2.7],
    homeCorners: [6.2, 4.0], awayCorners: [6.5, 4.2],
    awayTravelKm: 620, homeRestDays: 5, awayRestDays: 6,
    referee: "آنتونیو ماتئو لائوس",
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
    homeNpxg: [2.3, 1.8, 2.6], awayNpxg: [1.6, 1.1, 2.4],
    homeCorners: [7.1, 3.4], awayCorners: [4.9, 5.2],
    awayTravelKm: 580, homeRestDays: 7, awayRestDays: 4,
    referee: "فلیکس تسوایر",
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
    homeNpxg: [1.7, 1.4, 2.0], awayNpxg: [1.1, 0.7, 1.5],
    homeCorners: [6.0, 3.2], awayCorners: [4.2, 4.8],
    awayTravelKm: 500, homeRestDays: 6, awayRestDays: 6,
    referee: "دانیله اورساتو",
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
    homeNpxg: [2.2, 1.6, 2.5], awayNpxg: [1.35, 0.9, 1.9],
    homeCorners: [6.5, 3.8], awayCorners: [4.5, 5.6],
    awayTravelKm: 660, homeRestDays: 5, awayRestDays: 3,
    referee: "کلمنت تورپن",
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
    homeNpxg: [2.05, 1.6, 2.4], awayNpxg: [1.4, 0.95, 2.1],
    homeCorners: [6.9, 3.5], awayCorners: [4.7, 5.4],
    awayTravelKm: 350, homeRestDays: 6, awayRestDays: 7,
    referee: "پل تیرنی",
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
    homeNpxg: [1.55, 1.2, 2.0], awayNpxg: [1.6, 1.3, 2.1],
    homeCorners: [5.6, 4.3], awayCorners: [5.8, 4.0],
    awayTravelKm: 770, homeRestDays: 3, awayRestDays: 6,
    referee: "مارکو دی بلو",
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
    homeNpxg: [1.45, 1.0, 1.9], awayNpxg: [1.0, 0.6, 1.4],
    homeCorners: [5.4, 3.6], awayCorners: [3.9, 5.8],
    awayTravelKm: 530, homeRestDays: 6, awayRestDays: 5,
    referee: "خسوس گیل مانزانو",
  },
];

/** CDF پواسون برای بازار کرنر */
function poissonCdf(k: number, lambda: number): number {
  let cum = Math.exp(-lambda);
  let term = cum;
  for (let i = 1; i <= k; i++) {
    term = (term * lambda) / i;
    cum += term;
  }
  return cum;
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

/** ضرایب Soft Book با سوگیری Favorite-Longshot (آندوگان بیش‌برآورد → ضریب پایین‌تر) */
function softBookOdds(p: number, isLongshot: boolean): number {
  const pEff = isLongshot ? Math.min(0.95, p * 1.07) : p * 0.985;
  return round2(1 / (pEff * 1.075));
}

function parsePlayers(s: string): { name: string; position: string; xT: number; vaep: number; status: string; isKey: boolean }[] {
  return s
    .split(";")
    .map((e) => e.trim())
    .filter((e) => e.length > 0 && !e.includes("?"))
    .map((e) => {
      const [name, position, xt, vaep, status, key] = e.split(":");
      return {
        name: name.trim(),
        position,
        xT: parseFloat(xt) || 0,
        vaep: parseFloat(vaep) || 0,
        status: status || "FIT",
        isKey: key === "1",
      };
    })
    .filter((p) => p.name.length > 1);
}

/**
 * اگر جدول خالی باشد، داده‌های اولیه سطح اول را می‌سازد.
 */
export async function ensureSeeded(): Promise<void> {
  const count = await db.match.count();
  if (count > 0) return;

  // ۱) داوران
  const refereeMap = new Map<string, string>();
  for (const r of REFEREES) {
    const created = await db.referee.create({ data: r });
    refereeMap.set(r.name, created.id);
  }

  // ۲) بازی‌ها + بازیکنان + ضرایب سه بوک‌میکر
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

    // امید کرنر کل بازی
    const lambdaCorners =
      (m.homeCorners[0] + m.awayCorners[1]) / 2 + (m.awayCorners[0] + m.homeCorners[1]) / 2;
    const pCornersOver = 1 - poissonCdf(9, lambdaCorners);

    const created = await db.match.create({
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
        oddsHome: fairOdds(probs.pHome, 1.06),
        oddsDraw: fairOdds(probs.pDraw, 1.06),
        oddsAway: fairOdds(probs.pAway, 1.06),
        oddsOver25: fairOdds(probs.pOver25, 1.06),
        oddsUnder25: fairOdds(probs.pUnder25, 1.06),
        odds1x: fairOdds(p1x, 1.06),
        // زمینه
        homeNpxgLevel: m.homeNpxg[0],
        homeNpxgLeading: m.homeNpxg[1],
        homeNpxgTrailing: m.homeNpxg[2],
        awayNpxgLevel: m.awayNpxg[0],
        awayNpxgLeading: m.awayNpxg[1],
        awayNpxgTrailing: m.awayNpxg[2],
        homeCornersFor: m.homeCorners[0],
        homeCornersAgainst: m.homeCorners[1],
        awayCornersFor: m.awayCorners[0],
        awayCornersAgainst: m.awayCorners[1],
        awayTravelKm: m.awayTravelKm,
        homeRestDays: m.homeRestDays,
        awayRestDays: m.awayRestDays,
        refereeId: refereeMap.get(m.referee) ?? null,
        status: "UPCOMING",
      },
    });

    // بازیکنان دو تیم (VAEP/xT)
    const playersHome = parsePlayers(TEAM_PLAYERS[m.homeTeam] ?? "");
    const playersAway = parsePlayers(TEAM_PLAYERS[m.awayTeam] ?? "");
    for (const p of playersHome) {
      await db.player.create({ data: { ...p, matchId: created.id, side: "HOME" } });
    }
    for (const p of playersAway) {
      await db.player.create({ data: { ...p, matchId: created.id, side: "AWAY" } });
    }

    // ضرایب سه بوک‌میکر — Pinnacle حاشیه ۲.۵٪، Soft A حاشیه ۶٪، Soft B حاشیه ۷.۵٪ + سوگیری آندوگان
    const maxGoals = probs.matrix.length - 1;
    void maxGoals;
    const mk = (margin: number, longshotBias: boolean) => {
      const f = (p: number, isDog: boolean) =>
        longshotBias ? softBookOdds(p, isDog) : round2(1 / (p * margin));
      return {
        home: f(probs.pHome, probs.pHome < 0.3),
        draw: f(probs.pDraw, probs.pDraw < 0.3),
        away: f(probs.pAway, probs.pAway < 0.3),
        over25: f(probs.pOver25, false),
        under25: f(probs.pUnder25, false),
        cOver: f(pCornersOver, pCornersOver < 0.3),
        cUnder: f(1 - pCornersOver, false),
      };
    };

    const pinnacle = mk(1.025, false);
    const softA = mk(1.06, false);
    const softB = mk(1.075, true);

    for (const [book, o] of [
      ["PINNACLE", pinnacle],
      ["SOFT_A", softA],
      ["SOFT_B", softB],
    ] as const) {
      await db.oddsRecord.create({
        data: {
          matchId: created.id,
          bookmaker: book,
          oddsHome: o.home,
          oddsDraw: o.draw,
          oddsAway: o.away,
          oddsOver25: o.over25,
          oddsUnder25: o.under25,
          oddsCornersOver95: o.cOver,
          oddsCornersUnder95: o.cUnder,
        },
      });
    }
  }

  // ۳) لاگ کالیبراسیون بریر
  const calCount = await db.calibrationLog.count();
  if (calCount === 0) {
    let dayOffset = 3;
    for (const c of CALIBRATION_SEEDS) {
      await db.calibrationLog.create({
        data: {
          matchLabel: c.matchLabel,
          league: c.league,
          pick: c.pick,
          predictedProb: c.predictedProb,
          outcome: c.outcome,
          brier: (c.predictedProb - (c.outcome === "WIN" ? 1 : 0)) ** 2,
          lesson: c.lesson ?? null,
          createdAt: new Date(Date.now() - dayOffset * 24 * 3600 * 1000),
        },
      });
      dayOffset += 1;
    }
  }
}
