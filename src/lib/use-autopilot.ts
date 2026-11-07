// ─────────────────────────────────────────────────────────────────────────────
// هوک خلبان خودکار (Zero-Touch Autonomous Pipeline) — v6.1
//
// وظایف:
//   ۱) اسکن کامل اتوماتیک ۸ بازی بلافاصله پس از بارگذاری صفحه:
//      Ingest → T-60 (VAEP/xT) → مناظره گاو/خرس/قاضی → زوج‌تیپ مکمل → سیگنال
//      (با استخر همزمانی ۳ بازی موازی)
//   ۲) اسکن دوره‌ای سبک (Odds & T-60 sweep) با تایمر شمارش معکوس؛
//      مناظره فقط در تغییر مادی ضرایب/ترکیب دوباره اجرا می‌شود
//   ۳) v6.1 — ردیاب رویداد زنده واقعی ESPN (گل/کارت قرمز از فید رسمی؛ صفر شبیه‌سازی)
//      + توست پوشش Live Hedge با دقیقه/نتیجه/ساعت واقعی ESPN
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
  /** v6.1 — شناسه‌های رویداد واقعی ESPN که قبلاً توست شده‌اند (dedupe کلاینت) */
  const seenEventIdsRef = useRef<Set<string>>(new Set());
  const livePollBusyRef = useRef(false);

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

      // ─── ۲) T-60: ترکیب/آمار واقعی ESPN — v6.0: فراخوانی سبک در اسکن پس‌زمینه
      // (LIGHT = حداکثر یک درخواست summary؛ واکشی کامل بازیکنان فقط در تب T-60 با تقاضای کاربر)
      setStage(m.id, "t60", "RUNNING");
      try {
        const lineup = await postJson<LineupShockDTO>("/api/lineup", { matchId: m.id, depth: "LIGHT" });
        if (lineup.success) {
          patchAutopilot(m.id, { lineup });
          store.setShock(m.id, lineup.home.shockDelta, lineup.away.shockDelta);
        }
        setStage(m.id, "t60", "DONE");
      } catch {
        setStage(m.id, "t60", "ERROR");
      }

      // ─── ۳) مناظره گاو/خرس/قاضی — v5.0: موتور کمّی محلی (صفر توکن، صفر LLM) ───
      // سپر ضد Rate-Limit: اسکن پس‌زمینه هرگز به LLM نمی‌رود؛ تحلیل عمیق LLM فقط
      // با کلیک دستی کاربر (دکمه 🧠) و از راه کش/صف ۱۵ ثانیه‌ای انجام می‌شود.
      const existing = useQuantStore.getState().autopilot[m.id];
      const hasDebate = Boolean(existing?.debate);
      if (!opts.allowDebate) {
        setStage(m.id, "debate", "SKIPPED");
      } else if (!opts.full && hasDebate && !materialChange) {
        setStage(m.id, "debate", "SKIPPED");
      } else {
        setStage(m.id, "debate", "RUNNING");
        try {
          const debate = await postJson<DebateResultDTO>("/api/agent/debate", {
            matchId: m.id,
            mode: "LOCAL_QUANT",
          });
          if (!debate.success) throw new Error("debate failed");
          patchAutopilot(m.id, { debate });
          useQuantStore.getState().setDebate(m.id, debate);
          useQuantStore.getState().bumpLlmShield("localQuant");
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
        // v5.0: اسکن پس‌زمینه ۱۰۰٪ موتور کمّی محلی است (Zero-Token Shield) —
        // مناظره فقط برای نزدیک‌ترین ۸ بازی upcoming اجرا می‌شود و هیچ درخواست LLM ندارد
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

  // ─── v6.1 — ردیاب رویداد زنده واقعی ESPN + توست پوشش ───
  // گل‌ها: اختلاف امتیاز اسکوربورد ESPN بین دو پول · کارت قرمز: keyEvents خلاصه ESPN
  // دقیقه/ساعت/نتیجه: همه واقعی — صفر تاس‌ریزی، صفر hash-roll
  interface RealLiveEventDTO {
    eventId: string;
    type: "GOAL_HOME" | "GOAL_AWAY" | "RED_HOME" | "RED_AWAY";
    externalId: string;
    dbMatchId: string | null;
    leagueName: string;
    homeTeam: string;
    awayTeam: string;
    homeScore: number;
    awayScore: number;
    minute: number;
    clock: string;
    detectedAt: number;
  }

  const pollLiveEvents = useCallback(async () => {
    if (livePollBusyRef.current) return;
    const store = useQuantStore.getState();
    const cfg = store.config;
    if (!cfg.liveSimulation || !cfg.autopilotOn) return;
    if (typeof document !== "undefined" && document.hidden) return;

    livePollBusyRef.current = true;
    try {
      const res = await fetch("/api/live/events", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { success: boolean; events?: RealLiveEventDTO[] };
      if (!data.success || !data.events?.length) return;

      for (const ev of data.events) {
        if (seenEventIdsRef.current.has(ev.eventId)) continue;
        seenEventIdsRef.current.add(ev.eventId);

        // محدودسازی نرخ: حداکثر یک توست برای هر بازی در ۶۰ ثانیه
        const last = lastToastRef.current.get(ev.externalId) ?? 0;
        if (Date.now() - last < 60_000) continue;

        const matches = useQuantStore.getState().matches;
        const m =
          matches.find((x) => x.id === ev.dbMatchId) ??
          matches.find((x) => (x as { externalId?: string | null }).externalId === ev.externalId);

        const st = m ? useQuantStore.getState().autopilot[m.id] : undefined;
        const pair = st?.portfolio?.pairs.find((p) => p.id === st.portfolio?.recommendedId) ?? st?.portfolio?.pairs[0];

        const matchLabel = `${ev.homeTeam} - ${ev.awayTeam}`;
        const realScore = `${ev.homeScore}-${ev.awayScore}`;

        if (m && pair) {
          // بازی دارای تیپ فعال ← محاسبه واقعی پوشش با نتیجه/دقیقه واقعی ESPN
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
              minute: ev.minute,
              event: ev.type,
              selection: liveSelection,
              odds: pair.totalOddsA,
              stake: Math.max(1, pair.equalProfit.stakeA),
              scoreHome: ev.homeScore,
              scoreAway: ev.awayScore,
            });
            if (!result.success) continue;
            lastToastRef.current.set(ev.externalId, Date.now());
            const toast: LiveEventToast = {
              id: `real:${ev.eventId}`,
              matchId: m.id,
              matchLabel,
              minute: ev.minute,
              event: ev.type,
              score: realScore, // نتیجه واقعی ESPN (نه سناریوی فرضی)
              scenarioLabel: result.scenarioLabel,
              preBet: result.preBet,
              hedge: result.hedge,
              recommendation: result.recommendation,
              message: result.message,
              createdAt: Date.now(),
              actioned: false,
              source: "REAL",
              clock: ev.clock,
            };
            useQuantStore.getState().pushLiveToast(toast);
          } catch {
            // خطای شبکه — رویداد بعدی
          }
        } else {
          // بازی بدون تیپ فعال ← توست اطلاع‌رسانی واقعی (بدون عدد ساختگی پوشش)
          lastToastRef.current.set(ev.externalId, Date.now());
          const eventLabel =
            ev.type === "GOAL_HOME" ? "گل میزبان!" : ev.type === "GOAL_AWAY" ? "گل میهمان!" : ev.type === "RED_HOME" ? "کارت قرمز میزبان!" : "کارت قرمز میهمان!";
          const toast: LiveEventToast = {
            id: `real:${ev.eventId}`,
            matchId: m?.id ?? ev.externalId,
            matchLabel,
            minute: ev.minute,
            event: ev.type,
            score: realScore,
            scenarioLabel: `${eventLabel} — ESPN زنده`,
            preBet: { selection: "—", label: "بدون تیپ فعال", odds: 0, stake: 0 },
            hedge: null,
            recommendation: "HOLD",
            message: `رویداد زنده واقعی ESPN در دقیقه ${ev.minute} — این بازی تیپ پیش‌بازی فعال ندارد؛ برای فعال‌شدن رصد پوشش، از تب پرتفوی زوج‌تیپ بسازید.`,
            createdAt: Date.now(),
            actioned: false,
            source: "REAL",
            clock: ev.clock,
          };
          useQuantStore.getState().pushLiveToast(toast);
        }
      }
    } catch {
      // خطای شبکه — پول بعدی
    } finally {
      livePollBusyRef.current = false;
    }
  }, []);

  // ─── چرخه عمر: بارگذاری اولیه + اسکن دوره‌ای + رصد زنده واقعی ESPN ───
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

  // تیک یک‌ثانیه‌ای: شمارش معکوس اسکن
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

  // v6.1 — پول دوره‌ای رویداد زنده واقعی ESPN (۲۵ ثانیه؛ فقط تب باز) + پول فوری پس از برگشت به تب
  useEffect(() => {
    const t = setInterval(() => {
      void pollLiveEvents();
    }, 25_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void pollLiveEvents();
    };
    document.addEventListener("visibilitychange", onVisible);
    const warm = setTimeout(() => void pollLiveEvents(), 9_000);
    return () => {
      clearInterval(t);
      clearTimeout(warm);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pollLiveEvents]);

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
