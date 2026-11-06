// ─────────────────────────────────────────────────────────────────────────────
// هوک خلبان خودکار (Zero-Touch Autonomous Pipeline) — v3.0
//
// وظایف:
//   ۱) اسکن کامل اتوماتیک ۸ بازی بلافاصله پس از بارگذاری صفحه:
//      Ingest → T-60 (VAEP/xT) → مناظره گاو/خرس/قاضی → زوج‌تیپ مکمل → سیگنال
//      (با استخر همزمانی ۳ بازی موازی)
//   ۲) اسکن دوره‌ای سبک (Odds & T-60 sweep) با تایمر شمارش معکوس؛
//      مناظره فقط در تغییر مادی ضرایب/ترکیب دوباره اجرا می‌شود
//   ۳) شبیه‌ساز رویداد زنده (In-Play) + توست پوشش Live Hedge
//
// این هوک باید «فقط یک‌بار» در صفحه روت mount شود.
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import { useCallback, useEffect, useRef } from "react";
import { useQuantStore } from "./store";
import type { StageKey, StageState } from "./autopilot-types";
import type { DebateResultDTO, LineupShockDTO, MatchDTO, PortfolioResultDTO } from "./types";
import type { LiveEventToast } from "./autopilot-types";

/** هش پایدار FNV — برای زمان‌بندی قطعی و بدون فلیکر */
function hashStr(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** اثر انگشت ضرایب برای تشخیص تغییر مادی */
function oddsFingerprint(m: MatchDTO): string {
  return [m.oddsHome, m.oddsDraw, m.oddsAway, m.oddsOver25, m.oddsUnder25, m.lineupAnnounced ? 1 : 0].join("|");
}

/** استخر همزمانی — حداکثر limit اجرای موازی */
async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, Math.max(1, queue.length)) }, async () => {
    for (;;) {
      const item = queue.shift();
      if (item === undefined) return;
      await fn(item);
    }
  });
  await Promise.all(workers);
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

export function useAutopilot() {
  const scanningRef = useRef(false);
  const fingerprintRef = useRef<Map<string, string>>(new Map());
  const lastToastRef = useRef<Map<string, number>>(new Map());

  // ─── خط لوله یک بازی ───
  const scanMatch = useCallback(
    async (m: MatchDTO, opts: { full: boolean; allowDebate: boolean }) => {
      const store = useQuantStore.getState();
      const { setStage, patchAutopilot } = store;
      const fp = oddsFingerprint(m);
      const prevFp = fingerprintRef.current.get(m.id);
      const materialChange = prevFp !== undefined && prevFp !== fp;
      fingerprintRef.current.set(m.id, fp);

      patchAutopilot(m.id, { startedAt: Date.now(), finishedAt: null, error: null });

      // ─── ۱) Ingest ───
      setStage(m.id, "ingest", "RUNNING");
      await sleep(250 + (hashStr(m.id) % 350));
      setStage(m.id, "ingest", "DONE");

      // ─── ۲) T-60: اعلام ترکیب و بازمحاسبه VAEP/xT ───
      setStage(m.id, "t60", "RUNNING");
      try {
        const lineup = await postJson<LineupShockDTO>("/api/lineup", { matchId: m.id });
        if (lineup.success) {
          patchAutopilot(m.id, { lineup });
          store.setShock(m.id, lineup.home.shockDelta, lineup.away.shockDelta);
        }
        setStage(m.id, "t60", "DONE");
      } catch {
        setStage(m.id, "t60", "ERROR");
      }

      // ─── ۳) مناظره گاو/خرس/قاضی (LLM یا اسکیپ در اسکن سبک بدون تغییر) ───
      const existing = useQuantStore.getState().autopilot[m.id];
      const hasDebate = Boolean(existing?.debate);
      if (!opts.allowDebate) {
        setStage(m.id, "debate", "SKIPPED");
      } else if (!opts.full && hasDebate && !materialChange) {
        setStage(m.id, "debate", "SKIPPED");
      } else {
        setStage(m.id, "debate", "RUNNING");
        try {
          const debate = await postJson<DebateResultDTO>("/api/agent/debate", { matchId: m.id });
          if (!debate.success) throw new Error("debate failed");
          patchAutopilot(m.id, { debate });
          useQuantStore.getState().setDebate(m.id, debate);
          setStage(m.id, "debate", "DONE");
        } catch {
          setStage(m.id, "debate", "ERROR");
        }
      }

      // ─── ۴) زوج‌تیپ مکمل: مونت‌کارلو کاپولا + کلِی همزمان ───
      // در اسکن سبک بدون تغییر مادی، نتیجه قبلی معتبر است
      if (!opts.full && existing?.portfolio && !materialChange) {
        setStage(m.id, "pair", "SKIPPED");
        setStage(m.id, "signal", existing.portfolio.pairs?.length ? "DONE" : "ERROR");
        patchAutopilot(m.id, { finishedAt: Date.now() });
        return;
      }
      setStage(m.id, "pair", "RUNNING");
      let portfolioOk = false;
      try {
        const budget = useQuantStore.getState().config.dailyBudget;
        const portfolio = await postJson<PortfolioResultDTO>("/api/agent/portfolio", {
          matchId: m.id,
          bankroll: budget,
        });
        if (!portfolio.success) throw new Error("portfolio failed");
        patchAutopilot(m.id, { portfolio });
        portfolioOk = (portfolio.pairs?.length ?? 0) > 0;
        setStage(m.id, "pair", "DONE");
      } catch {
        setStage(m.id, "pair", "ERROR");
      }

      // ─── ۵) سیگنال نهایی (آماده‌شدگی فلش‌کارت) ───
      setStage(m.id, "signal", "RUNNING");
      await sleep(280);
      setStage(m.id, "signal", portfolioOk ? "DONE" : "ERROR");
      patchAutopilot(m.id, { finishedAt: Date.now() });
    },
    []
  );

  // ─── اسکن کامل / سبک ───
  const runScan = useCallback(
    async (mode: "FULL" | "LIGHT") => {
      if (scanningRef.current) return;
      const store = useQuantStore.getState();
      if (!store.config.autopilotOn) return;
      const matches = store.matches;
      if (matches.length === 0) return;

      scanningRef.current = true;
      store.setScanMeta({ scanning: true });
      try {
        // اگر بازی جدیدی آمده، وضعیت خالی بساز
        for (const m of matches) {
          if (!useQuantStore.getState().autopilot[m.id]) {
            store.patchAutopilot(m.id, {});
          }
        }
        // v4.0: مناظره LLM فقط برای نزدیک‌ترین ۸ بازی upcoming — بازی‌های LIVE/FINISHED
        // مناظره نمی‌شوند (پیش‌بازی معنا ندارد) و هزینه LLM با فید ۲۵+ بازی کنترل می‌شود
        const debateSet = new Set(
          matches
            .filter((m) => m.status === "UPCOMING" || m.status === "ANALYZED")
            .slice(0, 8)
            .map((m) => m.id)
        );
        // همزمانی ۲ — جلوگیری از Rate-Limit موازی LLM در اسکن کامل
        await pool(matches, 2, (m) =>
          scanMatch(m, {
            full: mode === "FULL",
            allowDebate: useQuantStore.getState().config.autoDebate && debateSet.has(m.id),
          })
        );
      } finally {
        const cfg = useQuantStore.getState().config;
        const now = Date.now();
        scanningRef.current = false;
        useQuantStore.getState().setScanMeta({
          scanning: false,
          lastScanAt: now,
          nextScanAt: now + Math.max(10, cfg.scanIntervalSec) * 1000,
          scanCount: useQuantStore.getState().scanCount + 1,
        });
      }
    },
    [scanMatch]
  );

  // ─── شبیه‌ساز رویداد زنده + توست پوشش ───
  const maybeFireLiveEvent = useCallback(async (tick: number) => {
    const store = useQuantStore.getState();
    const cfg = store.config;
    if (!cfg.liveSimulation || !cfg.autopilotOn) return;
    if (typeof document !== "undefined" && document.hidden) return;

    const candidates = store.matches.filter((m) => {
      const st = store.autopilot[m.id];
      return st?.portfolio?.pairs?.length;
    });
    if (candidates.length === 0) return;

    // دو بازی «زنده» هر تیک — چرخش قطعی برای پوشش همه بازی‌ها
    const picks: MatchDTO[] = [];
    for (let i = 0; i < Math.min(2, candidates.length); i++) {
      picks.push(candidates[(tick * 2 + i) % candidates.length]);
    }

    for (const m of picks) {
      const roll = hashStr(`${m.id}:${tick}:live`) % 100;
      if (roll >= 12) continue; // ~۱۲٪ شانس رویداد در هر تیک برای بازی زنده (واقع‌گرایانه)
      const event: LiveEventToast["event"] = roll < 5 ? "GOAL_HOME" : roll < 10 ? "GOAL_AWAY" : roll < 11 ? "RED_HOME" : "RED_AWAY";

      // محدودسازی نرخ: حداکثر یک توست برای هر بازی در ۹۰ ثانیه
      const last = lastToastRef.current.get(m.id) ?? 0;
      if (Date.now() - last < 90_000) continue;

      const st = useQuantStore.getState().autopilot[m.id];
      const pair = st?.portfolio?.pairs.find((p) => p.id === st.portfolio?.recommendedId) ?? st?.portfolio?.pairs[0];
      if (!pair) continue;

      const minute = 22 + (hashStr(`${m.id}:${tick}:min`) % 45);
      const selection = pair.structure.baseKey === "DC_X2" ? "AWAY" : "HOME";
      const liveSelection = pair.structure.varAKey === "O25" ? "O25" : selection;

      try {
        const result = await postJson<{
          success: boolean;
          minute: number;
          scenarioLabel: string;
          score: string;
          preBet: { selection: string; label: string; odds: number; stake: number };
          hedge: LiveEventToast["hedge"];
          recommendation: "HEDGE" | "HOLD";
          message: string;
        }>("/api/live", {
          matchId: m.id,
          minute,
          event,
          selection: liveSelection,
          odds: pair.totalOddsA,
          stake: Math.max(1, pair.equalProfit.stakeA),
        });
        if (!result.success) return;
        lastToastRef.current.set(m.id, Date.now());
        const toast: LiveEventToast = {
          id: `${m.id}:${tick}:${event}`,
          matchId: m.id,
          matchLabel: `${m.homeTeam} - ${m.awayTeam}`,
          minute: result.minute,
          event,
          score: result.score,
          scenarioLabel: result.scenarioLabel,
          preBet: result.preBet,
          hedge: result.hedge,
          recommendation: result.recommendation,
          message: result.message,
          createdAt: Date.now(),
          actioned: false,
        };
        useQuantStore.getState().pushLiveToast(toast);
      } catch {
        // خطای شبکه — توست بعدی
      }
    }
  }, []);

  // ─── چرخه عمر: بارگذاری اولیه + اسکن دوره‌ای + شبیه‌ساز زنده ───
  const bootRef = useRef(false);
  useEffect(() => {
    if (bootRef.current) return;
    bootRef.current = true;

    // اسکن کامل به محض آماده‌شدن فید بازی‌ها
    const unsub = useQuantStore.subscribe((state) => {
      if (!bootRef.current) return;
      if (state.matches.length > 0 && Object.keys(state.autopilot).length === 0 && !scanningRef.current) {
        void runScan("FULL");
      }
    });
    return unsub;
  }, [runScan]);

  // تیک یک‌ثانیه‌ای: شمارش معکوس اسکن + شبیه‌ساز زنده
  useEffect(() => {
    const t = setInterval(() => {
      const st = useQuantStore.getState();
      const now = Date.now();
      if (
        st.config.autopilotOn &&
        !st.scanning &&
        st.nextScanAt > 0 &&
        now >= st.nextScanAt &&
        st.matches.length > 0
      ) {
        void runScan("LIGHT");
      }
    }, 1000);
    return () => clearInterval(t);
  }, [runScan]);

  useEffect(() => {
    let tick = 0;
    const t = setInterval(() => {
      tick += 1;
      void maybeFireLiveEvent(tick);
    }, 12_000);
    return () => clearInterval(t);
  }, [maybeFireLiveEvent]);

  const scanNow = useCallback(() => {
    void runScan("LIGHT");
  }, [runScan]);

  const rescanAll = useCallback(() => {
    fingerprintRef.current.clear();
    useQuantStore.getState().resetAutopilot();
    void runScan("FULL");
  }, [runScan]);

  return { scanNow, rescanAll };
}

/** پیشرفت کلی خط لوله (۰..۱) برای نوار وضعیت */
export function usePipelineProgress(): { done: number; total: number; running: boolean } {
  const matches = useQuantStore((s) => s.matches);
  const autopilot = useQuantStore((s) => s.autopilot);
  const scanning = useQuantStore((s) => s.scanning);
  const total = matches.length * 5;
  let done = 0;
  for (const m of matches) {
    const st = autopilot[m.id];
    if (!st) continue;
    for (const k of Object.keys(st.stages) as StageKey[]) {
      const v: StageState = st.stages[k];
      if (v === "DONE" || v === "SKIPPED") done += 1;
    }
  }
  return { done, total, running: scanning };
}
