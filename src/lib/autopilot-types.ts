// ─────────────────────────────────────────────────────────────────────────────
// تایپ‌های خلبان خودکار v3.0 (Autonomous Autopilot & 3D Flashcards)
// ─────────────────────────────────────────────────────────────────────────────

import type { DebateResultDTO, LineupShockDTO, MatchDTO, PortfolioPairDTO, PortfolioResultDTO } from "./types";
import type { ExecutionMode, RejectedCandidate } from "./supervisor";
import type { BetTypeCandidate, BetTypeKey } from "./engine/betrouter";

/** پنج مرحله خط لوله اتوماتیک (رادار تب ۱) */
export type StageKey = "ingest" | "t60" | "debate" | "pair" | "signal";

export type StageState = "IDLE" | "RUNNING" | "DONE" | "ERROR" | "SKIPPED";

export const STAGE_LABELS: Record<StageKey, string> = {
  ingest: "۱. دریافت xG/Odds",
  t60: "۲. بررسی T-60",
  debate: "۳. مناظره گاو/خرس",
  pair: "۴. ساخت زوج‌تیپ مکمل",
  signal: "۵. سیگنال نهایی",
};

export const STAGE_HINTS: Record<StageKey, string> = {
  ingest: "فید آمار پیشرفته + خطوط بوک‌میکرها",
  t60: "اعلام ترکیب و بازمحاسبه VAEP/xT",
  debate: "گاو/خرس/قاضی کمّی + شین دی‌ویگ",
  pair: "مونت‌کارلو کاپولا + کلِی همزمان",
  signal: "فلش‌کارت زوج‌تیپ نهایی",
};

/** وضعیت خط لوله اتوماتیک برای یک بازی */
export interface AutopilotMatchState {
  matchId: string;
  stages: Record<StageKey, StageState>;
  debate: DebateResultDTO | null;
  lineup: LineupShockDTO | null;
  portfolio: PortfolioResultDTO | null;
  error: string | null;
  startedAt: number;
  finishedAt: number | null;
}

export function emptyAutopilotState(matchId: string): AutopilotMatchState {
  return {
    matchId,
    stages: { ingest: "IDLE", t60: "IDLE", debate: "IDLE", pair: "IDLE", signal: "IDLE" },
    debate: null,
    lineup: null,
    portfolio: null,
    error: null,
    startedAt: 0,
    finishedAt: null,
  };
}

/** تنظیمات اتصال و خلبان خودکار (مودال هدر) — در localStorage ذخیره می‌شود */
export interface AutopilotConfig {
  oddsApiKey: string; // کلید The Odds API
  oddsApiIoKey: string; // v5.0 — کلید رایگان Odds-API.io (۱۰۰ درخواست/ساعت از ۴۵۰ بوک‌میکر)
  dataWebhook: string; // وب‌هوک SoccerData / FastAPI
  scanIntervalSec: number; // بازه اسکن خودکار (۱۵..۱۲۰)
  dailyBudget: number; // بودجه پیش‌فرض روزانه
  mode: "SIMPLE" | "PRO"; // Smart Autopilot vs Pro Quant Terminal
  autopilotOn: boolean;
  liveSimulation: boolean; // شبیه‌ساز زنده + توست پوشش
  autoDebate: boolean; // مناظره LLM در اسکن خودکار (یا فقط موتور کمّی)
  /** v5.0 — سپر ضد Rate-Limit: اسکن پس‌زمینه ۱۰۰٪ با موتور کمّی محلی (صفر توکن) */
  zeroTokenScan: boolean;
  /** v7.0 — تلگرام VIP: توکن بات و شناسه کانال (نسخه سروری در Setting ذخیره می‌شود) */
  telegramBotToken: string;
  telegramChannelId: string;
  /** v13.0 — شناسه کانال عمومی ویترین (Public Showcase Chat ID) — قیف دوکاناله */
  telegramPublicChannelId: string;
  /** v8.0 — سوییچ استراتژی اجرایی ضد گوبینگ (Anti-Gubbing Compliance) */
  executionMode: ExecutionMode;
  /** v8.0 — شبیه‌ساز سطح اشتراک: Free تار می‌کند / Pro و VIP کاملاً باز */
  tier: "FREE" | "PRO" | "VIP";
  /**
   * v18.0 — 🥈 تاج نقره‌ای (شکارچی آلفای دفتر سایه):
   * روشن = کارت‌های سطح ۲ (winProb ≥ ۸۴٪ و شارپ ≥ ۰.۱۶) با استیک نصف ۵۰ واحدی
   * Half-Kelly در دک فلش‌کارت و منحنی بانک نمایش داده می‌شوند (+۶۵۰ واحد تزریق
   * سود از دل دفتر سایه). خاموش = فقط تاج‌های طلایی سطح ۱ (استیک کامل ۱۰۰u).
   */
  shadowHarvestOn: boolean;
}

export const DEFAULT_CONFIG: AutopilotConfig = {
  oddsApiKey: "",
  oddsApiIoKey: "",
  dataWebhook: "",
  scanIntervalSec: 30,
  dailyBudget: 1000,
  mode: "SIMPLE",
  autopilotOn: true,
  liveSimulation: true,
  autoDebate: true,
  zeroTokenScan: true,
  telegramBotToken: "",
  telegramChannelId: "",
  telegramPublicChannelId: "@aineobet",
  executionMode: "DUAL_BOOK",
  tier: "FREE",
  shadowHarvestOn: true,
};

/** نمای آماده فلش‌کارت — از تلاقی مناظره + پرتفوی + T-60 ساخته می‌شود */
export interface FlashcardView {
  key: string; // matchId::pairId
  match: MatchDTO;
  pair: PortfolioPairDTO;
  confidence: number; // اطمینان قاضی کمّی
  trust: { kind: "GOLD" | "T60" | "SILVER"; label: string };
  lineup: LineupShockDTO | null;
  bullLine: string;
  bearLine: string;
  judgeLine: string;
  /** لامبداهای نهایی موتور برای مینی‌مپ پوشش ۶×۶ */
  lambdaHome: number;
  lambdaAway: number;
  /** v9.0 — شفافیت کامل λ: الگوی Odds بازار / آمار فصل / ترکیبی نهایی */
  lambdaMarketHome: number | null;
  lambdaMarketAway: number | null;
  lambdaStatsHome: number;
  lambdaStatsAway: number;
  lambdaFitError: number | null;
  /** v9.0 — متن قوانین فعال کالیبراسیون لیگ این کارت (🧠 درس اعمال‌شده) */
  calibrationRule: string[];
  /** v5.0 — تیپ جاری یک الگوی متعامد است؟ (برای نشانگر) */
  isArchetype?: boolean;
  /** v8.0 — تصمیم ایجنت سوپروایزر ارشد (تک‌تیپ طلایی مونت‌کارلو) */
  supervisor: {
    /** امتیاز خام فرمول v11.0 */
    raw: number;
    /** نمایش ۰..۱۰۰ (مثل ۹۴/۱۰۰) */
    score100: number;
    veto: boolean;
    vetoReason: string | null;
    guaranteedProfitPct: number;
    /** v11.0 — پهنای پوشش متعامد (درصد) */
    coveragePct: number;
    doubleWinProbPct: number;
    jointLossRiskPct: number;
    /** v11.0 — دژ نفوذناپذیر: ریسک زیر ۷٪ + تایید سوپروایزر */
    fortress: boolean;
    executionMode: ExecutionMode;
    /** ۴ الگوی رد‌شده + دلیل — پشت کارت */
    rejected: RejectedCandidate[];
  } | null;
  /**
   * v17.0 — استراتژی منتخب سوپروایزر از مسیریاب غیرخطی ۵ رژیمی Bet-Type:
   * کاندید برنده (BANKER / COMBO / CORRECT_SCORE / DUAL_HEDGE) با سنجه‌های
   * آنتروپی شانون، Rλ، شارپ، EV و امتیاز مطلوبیت غیرخطی.
   */
  betType: (BetTypeCandidate & {
    /** سنجه‌های ساختاری ماتریس ۶×۶ این بازی */
    entropy: number;
    rLambda: number;
    top4Sum: number;
  }) | null;
  /** v17.0 — کارت از بازی وتوشده مسیریاب است؟ (هیچ روشی آستانه کیفیت را پاس نکرد) */
  routerVeto: boolean;
  /**
   * v18.0 — سطح تاج کارت (Two-Tier Crown System):
   * "GOLD" = 👑 تاج طلایی سطح ۱ (استیک کامل ۱۰۰u) | "SILVER" = 🥈 تاج نقره‌ای سطح ۲
   * (شکارچی آلفای سایه — استیک نصف ۵۰u Half-Kelly) | null = وتوشده/بدون سطح‌بندی
   */
  crownTier: "GOLD" | "SILVER" | null;
}

/** رویداد زنده برای توست پوشش In-Play — v6.1: منبع واقعی ESPN یا تست دستی موتور */
export interface LiveEventToast {
  id: string;
  matchId: string;
  matchLabel: string;
  minute: number;
  event: "GOAL_HOME" | "GOAL_AWAY" | "RED_HOME" | "RED_AWAY";
  score: string;
  scenarioLabel: string;
  preBet: { selection: string; label: string; odds: number; stake: number };
  hedge: { targetOdds: number; targetLabel: string; stake: number; profitIfPre: number; profitIfHedge: number } | null;
  recommendation: "HEDGE" | "HOLD";
  message: string;
  createdAt: number;
  actioned: boolean;
  /** v6.1 — REAL: فید زنده ESPN (گل/کارت واقعی) · MANUAL: تست دستی موتور در تب زنده */
  source?: "REAL" | "MANUAL";
  /** v6.1 — ساعت خام رسمی ESPN مثل «45'+2'» (فقط منبع REAL) */
  clock?: string;
}
