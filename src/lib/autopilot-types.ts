// ─────────────────────────────────────────────────────────────────────────────
// تایپ‌های خلبان خودکار v3.0 (Autonomous Autopilot & 3D Flashcards)
// ─────────────────────────────────────────────────────────────────────────────

import type { DebateResultDTO, LineupShockDTO, MatchDTO, PortfolioPairDTO, PortfolioResultDTO } from "./types";

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
  /** v5.0 — تیپ جاری یک الگوی متعامد است؟ (برای نشانگر و سوییچر) */
  isArchetype?: boolean;
}

/** رویداد زنده برای توست پوشش In-Play */
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
}
