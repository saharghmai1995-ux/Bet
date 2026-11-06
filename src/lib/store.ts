// ─────────────────────────────────────────────────────────────────────────────
// معماری وضعیت یکپارچه سراسری — Global Match State Store
// تمام ۷ تب به این استور متصل‌اند:
//   تب ۱ (کلیک روی بازی) → activeMatchId → تب‌های ۲..۷
//   تب ۴ (شوک T-60) → shockByMatch → تب ۶ (λ و Elo) → ماتریس دیکسون-کولز
//   تب ۶ (publishEngine) → تب ۲ (پایه کمّی مناظره) → حکم قاضی → تب ۳ (پرتفوی)
//   تب ۶ (انتخاب خانه‌ها) → builderSlips → تب ۳ (ماشین‌حساب داچینگ)
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import { create } from "zustand";
import type { DebateResultDTO, MatchDTO } from "@/lib/types";

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
}

export const useQuantStore = create<AppState>((set) => ({
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
}));
