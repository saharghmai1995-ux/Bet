// ─────────────────────────────────────────────────────────────────────────────
// معماری وضعیت یکپارچه سراسری — Global Match State Store (v3.0)
// تمام تب‌ها + خلبان خودکار به این استور متصل‌اند:
//   تب ۱ (کلیک روی بازی) → activeMatchId → تب‌های ۲..۷
//   تب ۴ (شوک T-60) → shockByMatch → تب ۶ (λ و Elo) → ماتریس دیکسون-کولز
//   تب ۶ (publishEngine) → تب ۲ (پایه کمّی مناظره) → حکم قاضی → تب ۳ (پرتفوی)
//   تب ۶ (انتخاب خانه‌ها) → builderSlips → تب ۳ (ماشین‌حساب داچینگ)
//   v3.0: autopilot (خط لوله اتوماتیک) + config (پایدار در localStorage) + cart (سبد فلش‌کارت)
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { DebateResultDTO, LiveFeedDTO, MatchDTO } from "./types";
import type { AutopilotConfig, AutopilotMatchState, LiveEventToast } from "./autopilot-types";
import { DEFAULT_CONFIG } from "./autopilot-types";

/** خروجی منتشرشده موتور کمّی تب ۶ برای بازی فعال (مبنای زنجیره واکنشی) */
export interface EnginePublish {
  matchId: string;
  lambdaHome: number;
  lambdaAway: number;
  pHome: number;
  pDraw: number;
  pAway: number;
  pOver25: number;
  pUnder25: number;
  pBtts: number;
  /** ماتریس ۶×۶ برای نمایش و سازنده تیپ مکمل */
  matrix6: number[][];
  /** شوک T-60 اعمال‌شده روی این محاسبه */
  shockApplied: { home: number; away: number } | null;
  updatedAt: number;
}

export interface ShockDelta {
  home: number;
  away: number;
  announcedAt: number;
}

export interface DutchingPayload {
  matchId: string;
  matchLabel: string;
  labelA: string;
  labelB: string;
  probA: number;
  probB: number;
  cellsA: string[];
  cellsB: string[];
  sentAt: number;
}

interface AppState {
  // ─── فید بازی‌ها و انتخابگر سراسری ───
  matches: MatchDTO[];
  activeMatchId: string | null;
  setMatches: (ms: MatchDTO[]) => void;
  setActiveMatchId: (id: string | null) => void;

  // ─── مناظره‌ها (تب ۲ → تب ۳) ───
  debates: Record<string, DebateResultDTO>;
  setDebate: (matchId: string, r: DebateResultDTO) => void;

  // ─── شوک ترکیب T-60 (تب ۴ → تب ۶) ───
  shockByMatch: Record<string, ShockDelta>;
  setShock: (matchId: string, home: number, away: number) => void;

  // ─── موتور کمّی منتشرشده (تب ۶ → تب ۲ و ۳) ───
  engineByMatch: Record<string, EnginePublish>;
  publishEngine: (pub: EnginePublish) => void;

  // ─── سازنده تیپ مکمل از ماتریس (تب ۶ → تب ۳) ───
  builderSlips: { matchId: string | null; a: string[]; b: string[] };
  dutchingPayload: DutchingPayload | null;
  setSlips: (matchId: string, a: string[], b: string[]) => void;
  sendToDutching: (payload: DutchingPayload) => void;

  // ─── بانک سراسری ───
  bankroll: number;
  setBankroll: (v: number) => void;

  // ═══════════ v3.0 — خلبان خودکار ═══════════

  /** وضعیت خط لوله اتوماتیک برای هر بازی */
  autopilot: Record<string, AutopilotMatchState>;
  patchAutopilot: (matchId: string, patch: Partial<AutopilotMatchState>) => void;
  setStage: (matchId: string, stage: keyof AutopilotMatchState["stages"], state: AutopilotMatchState["stages"][keyof AutopilotMatchState["stages"]]) => void;
  resetAutopilot: (matchIds?: string[]) => void;

  /** متادیتای اسکن سراسری */
  scanning: boolean;
  lastScanAt: number;
  nextScanAt: number;
  scanCount: number;
  setScanMeta: (patch: { scanning?: boolean; lastScanAt?: number; nextScanAt?: number; scanCount?: number }) => void;

  /** تنظیمات اتصال و خلبان خودکار — پایدار در localStorage */
  config: AutopilotConfig;
  patchConfig: (patch: Partial<AutopilotConfig>) => void;

  /** سبد تیپ‌های انتخابی — کلیدها به شکل matchId::pairId */
  cart: string[];
  toggleCart: (key: string) => void;
  clearCart: () => void;

  /** توست‌های پوشش زنده (In-Play) */
  liveToasts: LiveEventToast[];
  pushLiveToast: (t: LiveEventToast) => void;
  actionLiveToast: (id: string) => void;
  dismissLiveToast: (id: string) => void;

  // ═══════════ v4.0 — فید زنده چند-API ═══════════

  /** آخرین وضعیت همگام‌سازی ESPN/TheSportsDB/Open-Meteo/The Odds API */
  liveFeed: LiveFeedDTO | null;
  liveSyncing: boolean;
  patchLiveFeed: (feed: LiveFeedDTO | null) => void;
  setLiveSyncing: (v: boolean) => void;

  // ═══════════ v5.0 — سپر ضد Rate-Limit ═══════════

  /** شمارنده مصرف LLM و کش هوشمند — برای نشانگر سپر در هدر */
  llmShield: { llmCalls: number; cacheHits: number; localQuant: number; rateLimited: number };
  bumpLlmShield: (k: "llmCalls" | "cacheHits" | "localQuant" | "rateLimited") => void;

  // ═══════════ v8.0 — مودال پرداخت USDT (مشترک بین هیرو و فلش‌کارت‌ها) ═══════════

  /** باز/بسته بودن مودال ارتقا به VIP — حالت گذرا (persist نمی‌شود) */
  usdtModalOpen: boolean;
  setUsdtModalOpen: (v: boolean) => void;
}

export const useQuantStore = create<AppState>()(
  persist(
    (set) => ({
      matches: [],
      activeMatchId: null,
      setMatches: (ms) =>
        set((st) => {
          // بازسازی زنجیره شوک T-60 پس از reload — از فیلدهای پایدار DB
          const shockByMatch = { ...st.shockByMatch };
          for (const m of ms) {
            if (m.lineupAnnounced && (m.lineupShockHome || m.lineupShockAway)) {
              if (!shockByMatch[m.id]) {
                shockByMatch[m.id] = {
                  home: m.lineupShockHome ?? 0,
                  away: m.lineupShockAway ?? 0,
                  announcedAt: 0, // 0 = بازسازی‌شده از DB (بدون timestamp)
                };
              }
            }
          }
          return {
            matches: ms,
            shockByMatch,
            // اگر بازی فعلی در فید نبود، اولین بازی را فعال کن
            activeMatchId: st.activeMatchId && ms.some((m) => m.id === st.activeMatchId)
              ? st.activeMatchId
              : ms[0]?.id ?? null,
          };
        }),
      setActiveMatchId: (id) => set({ activeMatchId: id }),

      debates: {},
      setDebate: (matchId, r) => set((st) => ({ debates: { ...st.debates, [matchId]: r } })),

      shockByMatch: {},
      setShock: (matchId, home, away) =>
        set((st) => ({ shockByMatch: { ...st.shockByMatch, [matchId]: { home, away, announcedAt: Date.now() } } })),

      engineByMatch: {},
      publishEngine: (pub) => set((st) => ({ engineByMatch: { ...st.engineByMatch, [pub.matchId]: pub } })),

      builderSlips: { matchId: null, a: [], b: [] },
      dutchingPayload: null,
      setSlips: (matchId, a, b) => set({ builderSlips: { matchId, a, b } }),
      sendToDutching: (payload) => set({ dutchingPayload: payload }),

      bankroll: 100,
      setBankroll: (v) => set({ bankroll: Math.max(1, v) }),

      // ═══════════ v3.0 ═══════════

      autopilot: {},
      patchAutopilot: (matchId, patch) =>
        set((st) => ({
          autopilot: {
            ...st.autopilot,
            [matchId]: { ...(st.autopilot[matchId] ?? emptyLocal(matchId)), ...patch },
          },
        })),
      setStage: (matchId, stage, state) =>
        set((st) => {
          const cur = st.autopilot[matchId] ?? emptyLocal(matchId);
          return {
            autopilot: {
              ...st.autopilot,
              [matchId]: { ...cur, stages: { ...cur.stages, [stage]: state } },
            },
          };
        }),
      resetAutopilot: (matchIds) =>
        set((st) => {
          if (!matchIds) return { autopilot: {} };
          const next = { ...st.autopilot };
          for (const id of matchIds) delete next[id];
          return { autopilot: next };
        }),

      scanning: false,
      lastScanAt: 0,
      nextScanAt: 0,
      scanCount: 0,
      setScanMeta: (patch) => set(patch),

      config: DEFAULT_CONFIG,
      patchConfig: (patch) => set((st) => ({ config: { ...st.config, ...patch } })),

      cart: [],
      toggleCart: (key) =>
        set((st) => ({
          cart: st.cart.includes(key) ? st.cart.filter((k) => k !== key) : [...st.cart, key],
        })),
      clearCart: () => set({ cart: [] }),

      liveToasts: [],
      pushLiveToast: (t) => set((st) => ({ liveToasts: [t, ...st.liveToasts].slice(0, 3) })),
      actionLiveToast: (id) =>
        set((st) => ({ liveToasts: st.liveToasts.map((t) => (t.id === id ? { ...t, actioned: true } : t)) })),
      dismissLiveToast: (id) => set((st) => ({ liveToasts: st.liveToasts.filter((t) => t.id !== id) })),

      // ═══════════ v4.0 ═══════════
      liveFeed: null,
      liveSyncing: false,
      patchLiveFeed: (feed) => set({ liveFeed: feed }),
      setLiveSyncing: (v) => set({ liveSyncing: v }),

      // ═══════════ v5.0 ═══════════
      llmShield: { llmCalls: 0, cacheHits: 0, localQuant: 0, rateLimited: 0 },
      bumpLlmShield: (k) =>
        set((st) => ({ llmShield: { ...st.llmShield, [k]: st.llmShield[k] + 1 } })),

      // ═══════════ v8.0 ═══════════
      usdtModalOpen: false,
      setUsdtModalOpen: (v) => set({ usdtModalOpen: v }),
    }),
    {
      name: "football-quant-v5",
      storage: createJSONStorage(() => localStorage),
      // فقط کانفیگ و سبد پایدار می‌مانند — داده‌های زنده سرورمحورند
      partialize: (st) => ({ config: st.config, cart: st.cart, bankroll: st.bankroll }),
    }
  )
);

/** سازنده وضعیت خالی (برای جلوگیری از وابستگی دایره‌ای به autopilot-types) */
function emptyLocal(matchId: string): AutopilotMatchState {
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
