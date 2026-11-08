"use client";

// ─────────────────────────────────────────────────────────────────────────────
// کارنامه و تسویه خودکار (Automated Post-Match Grader + VIP Telegram) — v7.0
//
//   ۱) دکمه «⚡ همگام‌سازی و تسویه خودکار نتایج پایان‌یافته با سرور ESPN» بالای جدول
//   ۲) جدول کارنامه: برد تیپ A / برد تیپ B / جکپات دو برد / تله میانی — با سود واقعی
//      فرمول سند ارتقا: stakeA×oddsA−۱۰۰ (برد A) · stakeB×oddsB−۱۰۰ (برد B)
//   ۳) کانال تلگرام VIP: انتشار کارت کامل / تیزر (تیپ B سانسور 🔒) + نتیجه خودکار
//      با تصویر جام پیروزی (برد) و رختکن بهم‌ریخته (باخت) — همه با هش SHA-256
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Bot,
  BookOpen,
  Calculator,
  Check,
  ClipboardList,
  Copy,
  Crown,
  ExternalLink,
  EyeOff,
  Loader2,
  Lock,
  MonitorSmartphone,
  RefreshCw,
  Rocket,
  ScrollText,
  Send,
  SendHorizonal,
  ServerCog,
  Settings2,
  Sparkles,
  Trophy,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useQuantStore } from "@/lib/store";
import { useCartItems } from "@/lib/autopilot-derive";
import { faNum } from "@/lib/format";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { IssueSlipItemDTO, IssuedSlipDTO, LedgerDTO, SettlementSyncResultDTO } from "@/lib/types";

// ═══════════ استیک داچینگ روی مجموع ۱۰۰ واحد (مبنای فرمول سند ارتقا) ═══════════

function equalProfitStakes(oddsA: number, oddsB: number): { stakeA: number; stakeB: number } {
  const invA = 1 / Math.max(1.01, oddsA);
  const invB = 1 / Math.max(1.01, oddsB);
  const sum = invA + invB;
  const r1 = (v: number) => Math.round(v * 10) / 10;
  return { stakeA: r1((100 * invA) / sum), stakeB: r1((100 * invB) / sum) };
}

const STATUS_META: Record<string, { label: string; icon: typeof Trophy; cls: string }> = {
  PENDING: { label: "در انتظار نتیجه", icon: ClipboardList, cls: "border-white/15 bg-white/5 text-zinc-300" },
  LIVE: { label: "در جریان (ESPN Live)", icon: RefreshCw, cls: "border-cyan-500/40 bg-cyan-500/10 text-cyan-300" },
  WON_A: { label: "🟢 برد تیپ A", icon: BadgeCheck, cls: "border-sky-500/40 bg-sky-500/10 text-sky-300" },
  WON_B: { label: "🟢 برد تیپ B", icon: BadgeCheck, cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" },
  DOUBLE_WIN: { label: "🏆 جکپات دو برد", icon: Trophy, cls: "border-amber-500/50 bg-amber-500/15 text-amber-300" },
  MIDDLE_TRAP: { label: "🔴 تله میانی", icon: EyeOff, cls: "border-rose-500/40 bg-rose-500/10 text-rose-300" },
  MANUAL_REVIEW: { label: "بازبینی دستی", icon: Settings2, cls: "border-violet-500/40 bg-violet-500/10 text-violet-300" },
  VOID: { label: "باطل (VOID)", icon: EyeOff, cls: "border-white/10 bg-white/[0.03] text-zinc-500" },
};

export function SettlementTab() {
  const cartItems = useCartItems();
  const matches = useQuantStore((s) => s.matches);
  const config = useQuantStore((s) => s.config);
  const patchConfig = useQuantStore((s) => s.patchConfig);

  const [ledger, setLedger] = useState<LedgerDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [savingTg, setSavingTg] = useState(false);
  const [tgToken, setTgToken] = useState(config.telegramBotToken ?? "");
  // v8.0 — کانال پیش‌فرض رسمی @aineobet (در صورت خالی بودن تنظیمات کاربر)
  const [tgChannel, setTgChannel] = useState(config.telegramChannelId || "@aineobet");
  const [preview, setPreview] = useState<string | null>(null);
  // ═══ v9.0 — صف ارسال خودکار فقط-کارت‌های-تایید-سوپروایزر + شبیه‌ساز فید کانال ═══
  const [autoDispatch, setAutoDispatch] = useState(true);
  const [dispatching, setDispatching] = useState(false);
  const [feed, setFeed] = useState<{ kind: string; matchLabel: string; message: string; status?: string }[]>([]);
  const [feedOpen, setFeedOpen] = useState(false);
  // ═══ v10.0 — ماشین‌حساب بانک‌رول شخصی (۱ واحد = ۱٪ موجودی) ═══
  const [bankrollUsd, setBankrollUsd] = useState(10);
  const [doctrineFilter, setDoctrineFilter] = useState<string>("ALL");

  const loadFeed = useCallback(async () => {
    try {
      const res = await fetch("/api/telegram/autodispatch", { cache: "no-store" });
      const data = (await res.json()) as {
        success: boolean;
        queue?: { kind: string; matchLabel: string; message: string; status?: string }[];
        autoDispatch?: boolean;
        configured?: boolean;
      };
      if (data.success && Array.isArray(data.queue)) {
        setFeed(data.queue);
        if (typeof data.autoDispatch === "boolean") setAutoDispatch(data.autoDispatch);
      }
    } catch {
      // خطای شبکه — فید قبلی معتبر می‌ماند
    }
  }, []);

  useEffect(() => {
    void loadFeed();
  }, [loadFeed]);

  const toggleAutoDispatch = useCallback(
    async (on: boolean) => {
      setAutoDispatch(on);
      try {
        await fetch("/api/telegram/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ autoDispatch: on }),
        });
        toast.success(on ? "🤖 ارسال خودکار کارت‌های تایید سوپروایزر روشن شد" : "ارسال خودکار خاموش شد — فقط ارسال دستی فعال است");
      } catch {
        toast.error("خطا در ذخیره سوییچ ارسال خودکار");
        setAutoDispatch(!on);
      }
    },
    []
  );

  const loadLedger = useCallback(async () => {
    try {
      const res = await fetch("/api/settlement/ledger", { cache: "no-store" });
      const data = (await res.json()) as LedgerDTO;
      if (data.success) setLedger(data);
    } catch {
      // خطای شبکه — داده قبلی حفظ می‌شود
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLedger();
  }, [loadLedger]);

  // v10.0 — تازه‌سازی خودکار کارنامه هر ۶۰ ثانیه (هماهنگ با زمان‌بند سرور)
  useEffect(() => {
    const t = setInterval(() => {
      void loadLedger();
    }, 60_000);
    return () => clearInterval(t);
  }, [loadLedger]);

  // ─── 🚀 ارسال فوری تمام کارت‌های تاییدشده سوپروایزر و گزارش نتایج تسویه‌شده (v9.0) ───
  const dispatchNow = useCallback(async () => {
    setDispatching(true);
    try {
      const res = await fetch("/api/telegram/autodispatch", { method: "POST" });
      const data = (await res.json()) as { success: boolean; sentCards?: number; sentResults?: number; winRateSent?: boolean; skippedVetoed?: number; detail?: string; error?: string };
      if (!data.success) {
        toast.error(data.error ?? "ارسال ناموفق بود");
        return;
      }
      if (data.detail === "TELEGRAM_NOT_CONFIGURED") {
        toast.warning("اتصال تلگرام تنظیم نشده — پیش‌نمایش زنده فید کانال را ببینید", {
          description: "با وارد کردن توکن، همه پیام‌های صف بلافاصله مخابره می‌شوند",
        });
        setFeedOpen(true);
        await loadFeed();
        return;
      }
      if (data.detail === "AUTO_DISPATCH_OFF") {
        toast.info("سوییچ ارسال خودکار خاموش است — آن را روشن کنید یا از دکمه‌های دستی استفاده کنید");
        return;
      }
      if (data.detail === "QUEUE_EMPTY") {
        toast.info("صف انتشار خالی است — همه کارت‌های تایید و نتایج قبلاً مخابره شده‌اند", {
          description: `بازی‌های وتوشده رد‌شده: ${faNum(data.skippedVetoed ?? 0, 0)}`,
        });
        return;
      }
      toast.success(`🚀 ${faNum(data.sentCards ?? 0, 0)} کارت تایید سوپروایزر + ${faNum(data.sentResults ?? 0, 0)} برگه نتیجه FT مخابره شد`, {
        description: data.winRateSent ? "📊 گزارش وین‌ریت کانال هم ارسال شد" : undefined,
      });
      await loadFeed();
      await loadLedger();
    } catch {
      toast.error("خطای شبکه در ارسال خودکار");
    } finally {
      setDispatching(false);
    }
  }, [loadFeed, loadLedger]);

  // ─── ساخت بدنه صدور از آیتم‌های سبد (تطبیق میکس دو بازی با externalId ESPN) ───
  const buildIssueItem = useCallback(
    (it: (typeof cartItems)[number]): IssueSlipItemDTO => {
      const { pair, view } = it;
      const m = view.match;
      const extOf = (matchId: string) => matches.find((x) => x.id === matchId)?.externalId ?? m.externalId ?? null;
      const legsOf = (legs: string[] | undefined, base: string, varKey: string, varMatchId: string): { key: string; matchExternalId: string | null; matchLabel: string }[] => {
        if (legs && legs.length > 0) {
          return legs.map((k) => ({ key: k, matchExternalId: m.externalId ?? null, matchLabel: `${m.homeTeam} × ${m.awayTeam}` }));
        }
        const isPrimary = varMatchId === m.id;
        const legsOut: { key: string; matchExternalId: string | null; matchLabel: string }[] = [];
        if (base && base !== "ORTHO") legsOut.push({ key: base, matchExternalId: m.externalId ?? null, matchLabel: `${m.homeTeam} × ${m.awayTeam}` });
        legsOut.push({
          key: varKey,
          matchExternalId: isPrimary ? m.externalId ?? null : extOf(varMatchId),
          matchLabel: isPrimary ? `${m.homeTeam} × ${m.awayTeam}` : matches.find((x) => x.id === varMatchId) ? `${matches.find((x) => x.id === varMatchId)!.homeTeam} × ${matches.find((x) => x.id === varMatchId)!.awayTeam}` : "بازی دوم میکس",
        });
        return legsOut;
      };
      const stakes = equalProfitStakes(pair.totalOddsA, pair.totalOddsB);
      const espnId = m.externalId?.split("-").pop() ?? null;
      return {
        match: {
          id: m.id,
          externalId: m.externalId ?? null,
          league: m.league,
          homeTeam: m.homeTeam,
          awayTeam: m.awayTeam,
          kickoff: m.kickoff,
          espnUrl: espnId ? `https://www.espn.com/soccer/match/_/gameId/${espnId}` : null,
        },
        labelA: pair.labelA,
        labelB: pair.labelB,
        legsA: legsOf(pair.structure.legsA, pair.structure.baseKey, pair.structure.varAKey, pair.structure.varAMatchId),
        legsB: legsOf(pair.structure.legsB, pair.structure.baseKey, pair.structure.varBKey, pair.structure.varBMatchId),
        oddsA: pair.totalOddsA,
        oddsB: pair.totalOddsB,
        stakeA: stakes.stakeA,
        stakeB: stakes.stakeB,
        guaranteedProfit: pair.equalProfit.profit,
        marginPct: pair.guaranteedMarginPct,
        archetype: pair.archetype?.short ?? null,
        lambdaHome: view.lambdaHome,
        lambdaAway: view.lambdaAway,
      };
    },
    [matches]
  );

  // ─── صدور همه کارت‌های سبد به کارنامه ───
  const issueAll = useCallback(async () => {
    if (cartItems.length === 0) {
      toast.warning("سبد تیپ‌ها خالی است — ابتدا از فلش‌کارت‌ها «افزودن به سبد» بزنید");
      return;
    }
    setIssuing(true);
    try {
      const res = await fetch("/api/settlement/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: cartItems.map(buildIssueItem) }),
      });
      const data = (await res.json()) as { success: boolean; issued?: number };
      if (data.success) {
        toast.success(`${faNum(data.issued ?? 0, 0)} کارت با هش SHA-256 به کارنامه صادر شد`, {
          description: "با FT شدن بازی در ESPN، تسویه تیپ A و B به‌صورت ۱۰۰٪ خودکار انجام می‌شود",
        });
        await loadLedger();
      } else {
        toast.error("صدور کارت ناموفق بود");
      }
    } catch {
      toast.error("خطای شبکه در صدور کارت");
    } finally {
      setIssuing(false);
    }
  }, [cartItems, buildIssueItem, loadLedger]);

  // ─── ⚡ همگام‌سازی و تسویه خودکار با سرور ESPN ───
  const syncAndSettle = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/settlement/sync", { method: "POST", cache: "no-store" });
      const data = (await res.json()) as SettlementSyncResultDTO;
      if (data.success) {
        if (data.settled.length > 0) {
          const jackpot = data.settled.filter((s) => s.status === "DOUBLE_WIN").length;
          const trap = data.settled.filter((s) => s.status === "MIDDLE_TRAP").length;
          const net = data.settled.reduce((a, s) => a + s.netProfit, 0);
          toast.success(`⚡ ${faNum(data.settled.length, 0)} کارت با نتیجه واقعی FT ESPN تسویه شد`, {
            description: `سود خالص: ${net >= 0 ? "+" : ""}${faNum(net, 1)} واحد${jackpot ? ` · 🏆 جکپات دو برد: ${faNum(jackpot, 0)}` : ""}${trap ? ` · 🔴 تله میانی: ${faNum(trap, 0)}` : ""}${data.notified ? ` · تلگرام: ${faNum(data.notified, 0)} پیام` : ""}`,
            duration: 8000,
          });
        } else {
          toast.info(`ESPN بررسی شد (${faNum(data.checkedEspn, 0)} رخداد · ${faNum(data.ftFound, 0)} پایان‌یافته)`, {
            description: `کارت در جریان: ${faNum(data.live, 0)} · کارت در انتظار نتیجه جدید: صفر — همه قبلاً تسویه شده‌اند`,
          });
        }
        await loadLedger();
      } else {
        toast.error(data.error ?? "تسویه خودکار ناموفق بود");
      }
    } catch {
      toast.error("خطای شبکه در همگام‌سازی با سرور ESPN");
    } finally {
      setSyncing(false);
    }
  }, [loadLedger]);

  // ─── انتشار تلگرام: کارت کامل / تیزر ───
  const publish = useCallback(
    async (it: (typeof cartItems)[number], mode: "CARD" | "TEASER") => {
      const key = `${it.key}::${mode}`;
      setPublishing(key);
      try {
        const res = await fetch("/api/telegram/publish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ item: buildIssueItem(it), mode }),
        });
        const data = (await res.json()) as { success: boolean; detail?: string; preview?: string; notConfigured?: boolean; error?: string };
        if (data.notConfigured) {
          toast.warning("اتصال تلگرام تنظیم نشده — توکن بات و کانال را در همین تب ذخیره کنید", {
            description: "پیش‌نمایش پیام تولید شد و پس از اتصال قابل انتشار است",
          });
          if (data.preview) setPreview(data.preview);
          await loadLedger();
          return;
        }
        if (data.success) {
          toast.success(mode === "CARD" ? "📤 کارت کامل به کانال VIP ارسال شد" : "🔒 تیزر VIP (با تیپ B سانسور) ارسال شد", {
            description: `تلگرام: ${data.detail ?? "ok"}`,
          });
          if (data.preview) setPreview(data.preview);
          await loadLedger();
        } else {
          toast.error(`ارسال تلگرام ناموفق: ${data.detail ?? data.error ?? "?"}`);
          await loadLedger();
        }
      } catch {
        toast.error("خطای شبکه در انتشار تلگرام");
      } finally {
        setPublishing(null);
      }
    },
    [buildIssueItem, loadLedger]
  );

  // ─── ذخیره تنظیمات تلگرام + پیام آزمون ───
  const saveTelegram = useCallback(
    async (test: boolean) => {
      setSavingTg(true);
      try {
        const res = await fetch("/api/telegram/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ botToken: tgToken, channelId: tgChannel, test }),
        });
        const data = (await res.json()) as { success: boolean; test?: { ok: boolean; detail: string } | null };
        patchConfig({ telegramBotToken: tgToken, telegramChannelId: tgChannel });
        if (test) {
          if (data.test?.ok) toast.success("✅ پیام آزمون به کانال VIP ارسال شد — اتصال برقرار است");
          else toast.error(`پیام آزمون ناموفق: ${data.test?.detail ?? "?"}`, { description: "توکن بات و شناسه کانال (مثل @channel یا -100...) را بررسی کنید" });
        } else {
          toast.success("تنظیمات تلگرام روی سرور ذخیره شد");
        }
        await loadLedger();
      } catch {
        toast.error("خطای شبکه در ذخیره تنظیمات");
      } finally {
        setSavingTg(false);
      }
    },
    [tgToken, tgChannel, patchConfig, loadLedger]
  );

  const stats = ledger?.stats;
  const slipCount = ledger?.slips.length ?? 0;
  const automation = ledger?.automation;
  const unitValueUsd = bankrollUsd / 100; // ۱ واحد = ۱٪ بانک‌رول
  const netUsd = (stats?.netProfit ?? 0) * unitValueUsd;
  const perTicketUsd = 100 * unitValueUsd;

  const journal = ledger?.journal ?? [];
  const doctrineAll = ledger?.doctrine ?? [];
  const doctrine = doctrineFilter === "ALL" ? doctrineAll : doctrineAll.filter((d) => d.kind === doctrineFilter);
  const doctrineCounts = useMemo(
    () => ({
      ALL: doctrineAll.length,
      LEAGUE_LAMBDA: doctrineAll.filter((d) => d.kind === "LEAGUE_LAMBDA").length,
      ARCHETYPE: doctrineAll.filter((d) => d.kind === "ARCHETYPE").length,
      TIMING_WINDOW: doctrineAll.filter((d) => d.kind === "TIMING_WINDOW").length,
    }),
    [doctrineAll]
  );

  const tgStatusBadges = useMemo(
    () => (
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="outline" className={cn("gap-1 text-[9px]", ledger?.telegram.configured ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-amber-500/40 bg-amber-500/10 text-amber-300")}>
          {ledger?.telegram.configured ? <Check className="size-2.5" /> : <Settings2 className="size-2.5" />}
          {ledger?.telegram.configured ? "بات متصل" : "بات تنظیم نشده"}
        </Badge>
        <Badge variant="outline" className={cn("gap-1 text-[9px]", ledger?.telegram.channelSet ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-amber-500/40 bg-amber-500/10 text-amber-300")}>
          <Crown className="size-2.5" />
          {ledger?.telegram.channelSet ? "کانال VIP متصل" : "کانال تنظیم نشده"}
        </Badge>
      </div>
    ),
    [ledger]
  );

  return (
    <section className="space-y-4" aria-label="کارنامه و تسویه خودکار">
      {/* ═══ هدر و آمار ═══ */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold sm:text-base">
          <span aria-hidden>🧾</span>
          کارنامه تسویه خودکار + کانال تلگرام VIP
          {slipCount > 0 && (
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300" dir="ltr">
              {faNum(slipCount, 0)}
            </span>
          )}
        </h2>
        {tgStatusBadges}
      </div>

      {/* آمار تجمیعی */}
      {stats && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="تسویه‌شده" value={stats.settled} tone="text-foreground" sub={`از ${faNum(stats.total, 0)} کارت`} />
          <StatCard label="🟢 برد تیپ A" value={stats.wonA} tone="text-sky-300" />
          <StatCard label="🟢 برد تیپ B" value={stats.wonB} tone="text-emerald-300" />
          <StatCard label="🏆 جکپات دو برد" value={stats.doubleWin} tone="text-amber-300" />
          <StatCard label="🔴 تله میانی" value={stats.middleTrap} tone="text-rose-300" />
          <StatCard
            label="سود خالص مجموع"
            value={`${stats.netProfit >= 0 ? "+" : ""}${faNum(stats.netProfit, 1)}`}
            tone={stats.netProfit >= 0 ? "text-emerald-300" : "text-rose-300"}
            sub={`${faNum(stats.netProfitPct, 1)}٪ از استیک`}
          />
        </div>
      )}

      {/* ═══ ⚡ دکمه همگام‌سازی و تسویه خودکار — بالای جدول کارنامه ═══ */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-3">
        <Button
          className="h-9 gap-1.5 bg-gradient-to-l from-amber-500 to-amber-400 text-xs font-bold text-black hover:from-amber-400 hover:to-amber-300"
          onClick={() => void syncAndSettle()}
          disabled={syncing}
          aria-label="همگام‌سازی و تسویه خودکار نتایج پایان‌یافته با سرور ESPN"
        >
          {syncing ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />}
          ⚡ همگام‌سازی و تسویه خودکار نتایج پایان‌یافته با سرور ESPN
        </Button>
        <p className="text-[10px] leading-4 text-muted-foreground">
          اسکوربورد رسمی ESPN (۳ روز گذشته + امروز — Scheduled / In-Progress / Final) بررسی می‌شود؛ به محض FT، نتیجه واقعی
          <b className="font-num" dir="ltr"> homeScore/awayScore </b> خوانده و تیپ A و تیپ B با فرمول
          <b className="font-num" dir="ltr"> stake×odds−۱۰۰ </b>
          تسویه می‌شوند. v9.0: بازی‌های پایان‌یافته ۳ روز اخیر به‌صورت خودکار ثبت و تسویه می‌شوند (Zero-Click) و نتیجه‌ها با تصویر جام پیروزی /
          رختکن بهم‌ریخته به کانال VIP اعلام می‌گردند.
        </p>
      </div>

      {/* ═══ کانال تلگرام VIP ═══ */}
      <div className="space-y-3 rounded-xl border border-cyan-500/25 bg-cyan-500/[0.05] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-cyan-300">
            <Send className="size-3.5" /> کانال تلگرام VIP — انتشار کارت، تیزر جذب مشترک و اعلام نتیجه
          </p>
          {tgStatusBadges}
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="tg-token" className="text-[10px] text-muted-foreground">
              توکن بات تلگرام (از BotFather)
            </Label>
            <Input
              id="tg-token"
              dir="ltr"
              placeholder="123456:ABC-DEF..."
              value={tgToken}
              onChange={(e) => setTgToken(e.target.value)}
              className="h-9 border-white/10 bg-black/30 text-xs"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tg-channel" className="text-[10px] text-muted-foreground">
              شناسه کانال VIP (مثل ‎@my_vip_channel یا ‎-1001234567890)
            </Label>
            <Input
              id="tg-channel"
              dir="ltr"
              placeholder="@my_vip_channel"
              value={tgChannel}
              onChange={(e) => setTgChannel(e.target.value)}
              className="h-9 border-white/10 bg-black/30 text-xs"
              autoComplete="off"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="h-8 gap-1 border-cyan-500/40 text-[11px] text-cyan-300 hover:bg-cyan-500/10" onClick={() => void saveTelegram(false)} disabled={savingTg}>
            {savingTg ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />} ذخیره اتصال
          </Button>
          <Button size="sm" variant="outline" className="h-8 gap-1 border-white/15 text-[11px] text-foreground/80" onClick={() => void saveTelegram(true)} disabled={savingTg}>
            <SendHorizonal className="size-3" /> ارسال پیام آزمون به کانال
          </Button>
        </div>

        {/* ═══ v9.0 — صف ارسال خودکار فقط-کارت‌های-تایید-سوپروایزر ═══ */}
        <div className="space-y-2 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.05] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Bot className="size-4 text-emerald-400" />
              <p className="text-[11px] font-semibold text-emerald-300">
                🤖 ارسال خودکار کارت‌های تاییدشده سوپروایزر و نتایج FT به تلگرام
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground">{autoDispatch ? "روشن (پیش‌فرض)" : "خاموش"}</span>
              <Switch checked={autoDispatch} onCheckedChange={(v) => void toggleAutoDispatch(v)} aria-label="سوییچ ارسال خودکار تلگرام" />
            </div>
          </div>
          <p className="text-[10px] leading-4 text-muted-foreground">
            بازی‌های وتوشده سوپروایزر <b className="text-rose-300">مطلقاً</b> ارسال نمی‌شوند — فقط کارت‌های دارای مهر 👑 «تاییدشده سوپروایزر (Monte-Carlo Winner)».
            پست پیش از بازی (کارت کامل + λ بازار + هش SHA-256) و پست تسویه پس از FT (نتیجه ESPN + سود خالص + به‌روزرسانی وین‌ریت کل کانال) خودکار مخابره می‌شوند
            (Dedupe سمت سرور — صفر پیام تکراری).
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              className="h-8 gap-1 bg-emerald-600 text-[11px] hover:bg-emerald-500"
              onClick={() => void dispatchNow()}
              disabled={dispatching}
            >
              {dispatching ? <Loader2 className="size-3 animate-spin" /> : <Rocket className="size-3" />}
              🚀 ارسال فوری تمام کارت‌های تاییدشده سوپروایزر و گزارش نتایج تسویه‌شده
            </Button>
            <Button size="sm" variant="outline" className="h-8 gap-1 border-white/15 text-[11px] text-foreground/80" onClick={() => { setFeedOpen((v) => !v); void loadFeed(); }}>
              <MonitorSmartphone className="size-3" />
              {feedOpen ? "بستن شبیه‌ساز فید کانال" : "پیش‌نمایش زنده فید کانال (شبیه‌ساز)"}
            </Button>
          </div>

          {/* ─── شبیه‌ساز زنده فید کانال (Live Telegram Channel Simulator Feed) ─── */}
          {feedOpen && (
            <div className="space-y-2 rounded-xl border border-white/10 bg-black/30 p-3">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold text-cyan-300">
                <MonitorSmartphone className="size-3.5" />
                پیش‌نمایش زنده فید کانال VIP — صف فعلی ({faNum(feed.length, 0)} پیام آماده مخابره)
                {!ledger?.telegram.configured && (
                  <Badge variant="outline" className="border-amber-500/40 text-[9px] text-amber-300">بات تنظیم نشده — با ذخیره توکن، همین پیام‌ها مخابره می‌شوند</Badge>
                )}
              </p>
              {feed.length === 0 ? (
                <p className="rounded-lg border border-dashed border-white/10 p-3 text-center text-[10px] text-muted-foreground">
                  صف خالی است — کارت‌های تایید سوپروایزر پس از صدور خودکار و نتایج پس از FT اینجا ظاهر می‌شوند.
                </p>
              ) : (
                <ScrollArea className="max-h-72">
                  <div className="space-y-2 pr-1">
                    {feed.map((msg, i) => (
                      <div key={`${msg.kind}-${i}`} className="rounded-lg border border-white/10 bg-[rgba(8,12,22,0.9)] p-2.5">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <Badge
                            variant="outline"
                            className={`text-[9px] ${msg.kind === "CARD" ? "border-cyan-500/40 text-cyan-300" : msg.kind === "RESULT" ? "border-emerald-500/40 text-emerald-300" : "border-amber-500/40 text-amber-300"}`}
                          >
                            {msg.kind === "CARD" ? "📤 پست پیش از بازی (کارت تایید سوپروایزر)" : msg.kind === "RESULT" ? "🏁 پست تسویه پس از FT" : "📊 گزارش وین‌ریت کانال"}
                          </Badge>
                          <span className="truncate text-[10px] text-muted-foreground">{msg.matchLabel}</span>
                        </div>
                        <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-[10px] leading-4 text-foreground/80" dir="rtl" style={{ fontFamily: "Vazirmatn, Tahoma, sans-serif" }}>
                          {msg.message}
                        </pre>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          )}
        </div>

        {/* سبد → انتشار / صدور */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-medium text-foreground/80">
              سبد تیپ‌های آماده انتشار ({faNum(cartItems.length, 0)} زوج‌تیپ)
            </p>
            <Button size="sm" variant="outline" className="h-7 gap-1 border-white/15 px-2 text-[10px]" onClick={() => void issueAll()} disabled={issuing}>
              {issuing ? <Loader2 className="size-3 animate-spin" /> : <ClipboardList className="size-3" />}
              صدور همه به کارنامه (SHA-256)
            </Button>
          </div>
          {cartItems.length === 0 ? (
            <p className="rounded-lg border border-dashed border-white/10 p-3 text-center text-[10px] text-muted-foreground">
              سبد خالی است — از فلش‌کارت‌ها زوج‌تیپ را «افزودن به سبد» کنید تا دکمه‌های انتشار کارت و تیزر فعال شوند.
            </p>
          ) : (
            <ScrollArea className="max-h-64">
              <div className="space-y-2 pr-1">
                {cartItems.map((it) => {
                  const stake = equalProfitStakes(it.pair.totalOddsA, it.pair.totalOddsB);
                  return (
                    <div key={it.key} className="rounded-lg border border-white/10 bg-black/20 p-2.5">
                      <p className="truncate text-[11px] font-bold">
                        {it.view.match.homeTeam} <span className="text-muted-foreground">×</span> {it.view.match.awayTeam}
                        <span className="mr-1 text-[9px] font-normal text-muted-foreground">({it.view.match.league})</span>
                      </p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        داچینگ ۱۰۰ واحدی: A <b className="font-num" dir="ltr">{faNum(stake.stakeA, 1)}</b> · B <b className="font-num" dir="ltr">{faNum(stake.stakeB, 1)}</b>
                        {" · "}سود تضمینی <b className="font-num text-emerald-300" dir="ltr">+{faNum(it.pair.guaranteedMarginPct, 1)}%</b>
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <Button size="sm" className="h-7 gap-1 bg-cyan-600 text-[10px] hover:bg-cyan-500" onClick={() => void publish(it, "CARD")} disabled={publishing !== null}>
                          {publishing === `${it.key}::CARD` ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />}
                          📤 انتشار کارت کامل
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 gap-1 border-amber-500/40 text-[10px] text-amber-300 hover:bg-amber-500/10" onClick={() => void publish(it, "TEASER")} disabled={publishing !== null}>
                          {publishing === `${it.key}::TEASER` ? <Loader2 className="size-3 animate-spin" /> : <Lock className="size-3" />}
                          🔒 انتشار تیزر (تیپ B سانسور)
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}

          {/* پیش‌نمایش آخرین پیام */}
          {preview && (
            <details className="rounded-lg border border-white/10 bg-black/20 p-2.5" open>
              <summary className="cursor-pointer text-[10px] font-semibold text-cyan-300">پیش‌نمایش پیام تلگرام (HTML)</summary>
              <pre className="mt-1.5 max-h-40 overflow-auto whitespace-pre-wrap text-[10px] leading-4 text-foreground/80" dir="rtl" style={{ fontFamily: "Vazirmatn, Tahoma, sans-serif" }}>
                {preview}
              </pre>
              <Button size="sm" variant="ghost" className="mt-1 h-6 gap-1 px-2 text-[10px] text-muted-foreground" onClick={() => void navigator.clipboard?.writeText(preview)}>
                <Copy className="size-3" /> کپی متن
              </Button>
            </details>
          )}

          {/* صندوق ارسال‌ها */}
          {ledger && ledger.outbox.length > 0 && (
            <div className="rounded-lg border border-white/10 bg-black/20 p-2.5">
              <p className="mb-1 text-[10px] font-semibold text-muted-foreground">صندوق پیام‌های کانال (۲۵ مورد اخیر)</p>
              <ul className="space-y-1">
                {ledger.outbox.slice(0, 8).map((o) => (
                  <li key={o.id} className="flex items-center gap-1.5 text-[10px]">
                    {o.ok ? <Check className="size-3 shrink-0 text-emerald-400" /> : <EyeOff className="size-3 shrink-0 text-rose-400" />}
                    <span className="text-muted-foreground">{o.kind}</span>
                    <span className="truncate text-muted-foreground/70">{o.detail}</span>
                    <span className="ms-auto shrink-0 text-muted-foreground/60" dir="ltr">{new Date(o.createdAt).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" })}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* ═══ جدول کارنامه ═══ */}
      <div className="rounded-xl border border-white/10 bg-white/[0.02]">
        <div className="flex items-center justify-between gap-2 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold">
            <Sparkles className="size-3.5 text-amber-400" /> جدول کارنامه — تسویه ۱۰۰٪ خودکار با نتیجه رسمی ESPN
          </p>
          <p className="text-[10px] text-muted-foreground">
            فرمول سند ارتقا: <b className="font-num" dir="ltr">stakeA×oddsA−۱۰۰</b> / <b className="font-num" dir="ltr">stakeB×oddsB−۱۰۰</b>
          </p>
        </div>
        {loading ? (
          <div className="flex min-h-[120px] items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> در حال بارگذاری کارنامه…
          </div>
        ) : !ledger || ledger.slips.length === 0 ? (
          <div className="flex min-h-[120px] flex-col items-center justify-center gap-2 p-6 text-center">
            <ClipboardList className="size-6 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              کارنامه خالی است — زوج‌تیپ‌های سبد را «صدور همه به کارنامه» کنید؛ پس از FT شدن بازی در ESPN، تسویه خودکار انجام و همین‌جا ثبت می‌شود.
            </p>
          </div>
        ) : (
          <ScrollArea className="max-h-[480px]">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-[rgba(9,13,24,0.95)] backdrop-blur">
                <TableRow className="border-white/8">
                  <TableHead className="text-right text-[10px]">بازی (نتیجه FT واقعی)</TableHead>
                  <TableHead className="text-right text-[10px]">وضعیت تسویه</TableHead>
                  <TableHead className="text-right text-[10px]">تیپ A</TableHead>
                  <TableHead className="text-right text-[10px]">تیپ B</TableHead>
                  <TableHead className="text-left text-[10px]">سود خالص</TableHead>
                  <TableHead className="text-right text-[10px]">هش SHA-256 + راستی‌آزمایی</TableHead>
                  <TableHead className="text-center text-[10px]">تلگرام</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ledger.slips.map((s) => (
                  <SlipRow key={s.id} slip={s} />
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </div>
    </section>
  );
}

// ═══════════ سطر کارنامه ═══════════

function SlipRow({ slip }: { slip: IssuedSlipDTO }) {
  const meta = STATUS_META[slip.status] ?? STATUS_META.PENDING;
  const StatusIcon = meta.icon;
  const score = slip.homeGoals !== null && slip.awayGoals !== null ? `${slip.homeGoals}−${slip.awayGoals}` : null;
  const profitTone = (slip.netProfit ?? 0) > 0 ? "text-emerald-300" : (slip.netProfit ?? 0) < 0 ? "text-rose-300" : "text-muted-foreground";
  const [copied, setCopied] = useState(false);

  const copyHash = (e: React.MouseEvent) => {
    e.stopPropagation();
    void navigator.clipboard?.writeText(slip.hash);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <TableRow className="border-white/6 align-top">
      <TableCell className="max-w-[190px] py-2.5">
        <p className="truncate text-[11px] font-bold">
          {slip.homeTeam} <span className="text-muted-foreground">×</span> {slip.awayTeam}
        </p>
        <p className="text-[9px] text-muted-foreground">
          {slip.league} · <span dir="ltr">{new Date(slip.kickoff).toLocaleDateString("fa-IR", { month: "short", day: "numeric" })}</span>
          {score && (
            <b className="mr-1 font-num text-foreground" dir="ltr">
              FT {score}
            </b>
          )}
        </p>
        {slip.archetype && <p className="mt-0.5 truncate text-[9px] text-fuchsia-300">📐 {slip.archetype}</p>}
      </TableCell>

      <TableCell className="py-2.5">
        <Badge variant="outline" className={cn("gap-1 whitespace-nowrap text-[9px]", meta.cls)}>
          <StatusIcon className={cn("size-2.5", slip.status === "LIVE" && "animate-spin")} />
          {meta.label}
        </Badge>
        {slip.settleNote && (
          <p className="mt-1 max-w-[160px] truncate text-[9px] text-muted-foreground" title={slip.settleNote}>
            {slip.settleNote}
          </p>
        )}
      </TableCell>

      <TableCell className="max-w-[170px] py-2.5">
        <p className="line-clamp-2 text-[10px] leading-4">{slip.labelA}</p>
        <p className="mt-0.5 text-[9px] text-muted-foreground">
          ضریب <b className="font-num text-sky-300" dir="ltr">{slip.oddsA.toFixed(2)}</b> · استیک{" "}
          <b className="font-num" dir="ltr">{faNum(slip.stakeA, 1)}</b>
          {slip.status === "WON_A" || slip.status === "DOUBLE_WIN" ? (
            <b className="mr-1 font-num text-emerald-300" dir="ltr"> ✓</b>
          ) : ["WON_B", "MIDDLE_TRAP"].includes(slip.status) ? (
            <b className="mr-1 font-num text-rose-300" dir="ltr"> ✗</b>
          ) : null}
        </p>
      </TableCell>

      <TableCell className="max-w-[170px] py-2.5">
        <p className="line-clamp-2 text-[10px] leading-4">{slip.labelB}</p>
        <p className="mt-0.5 text-[9px] text-muted-foreground">
          ضریب <b className="font-num text-emerald-300" dir="ltr">{slip.oddsB.toFixed(2)}</b> · استیک{" "}
          <b className="font-num" dir="ltr">{faNum(slip.stakeB, 1)}</b>
          {slip.status === "WON_B" || slip.status === "DOUBLE_WIN" ? (
            <b className="mr-1 font-num text-emerald-300" dir="ltr"> ✓</b>
          ) : ["WON_A", "MIDDLE_TRAP"].includes(slip.status) ? (
            <b className="mr-1 font-num text-rose-300" dir="ltr"> ✗</b>
          ) : null}
        </p>
      </TableCell>

      <TableCell className="py-2.5 text-left">
        {slip.netProfit !== null ? (
          <>
            <b className={cn("font-num text-sm", profitTone)} dir="ltr">
              {slip.netProfit >= 0 ? "+" : ""}
              {faNum(slip.netProfit, 1)}
            </b>
            {(slip.status === "WON_A" || slip.status === "WON_B") && (
              <p className="text-[8px] leading-3 text-muted-foreground" dir="ltr">
                {slip.status === "WON_A" ? `${slip.stakeA.toFixed(1)}×${slip.oddsA.toFixed(2)}−100` : `${slip.stakeB.toFixed(1)}×${slip.oddsB.toFixed(2)}−100`}
              </p>
            )}
            {slip.status === "DOUBLE_WIN" && (
              <p className="text-[8px] leading-3 text-amber-300/80">A: {faNum(slip.profitA ?? 0, 1)} + B: {faNum(slip.profitB ?? 0, 1)}</p>
            )}
          </>
        ) : (
          <span className="text-[10px] text-muted-foreground">—</span>
        )}
      </TableCell>

      <TableCell className="py-2.5">
        <button type="button" className="flex items-center gap-1 font-mono text-[9px] text-cyan-300/90 hover:text-cyan-200" onClick={copyHash} title={`کپی هش کامل: ${slip.hash}`} aria-label="کپی هش SHA-256 کارت">
          <span dir="ltr">{slip.hash.slice(0, 14)}…</span>
          {copied ? <Check className="size-2.5 text-emerald-400" /> : <Copy className="size-2.5" />}
        </button>
        {slip.espnUrl && (
          <a href={slip.espnUrl} target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-0.5 text-[9px] text-cyan-400 hover:underline">
            راستی‌آزمایی ESPN <ExternalLink className="size-2.5" />
          </a>
        )}
      </TableCell>

      <TableCell className="py-2.5">
        <div className="flex items-center justify-center gap-1" aria-label="وضعیت انتشار تلگرام">
          <TgDot on={slip.telegramCard} title="کارت کامل" icon="📤" />
          <TgDot on={slip.telegramTeaser} title="تیزر VIP (تیپ B سانسور)" icon="🔒" />
          <TgDot on={slip.telegramResult} title="نتیجه پس از FT (جام/رختکن)" icon={slip.status === "MIDDLE_TRAP" ? "🧹" : "🏆"} />
        </div>
      </TableCell>
    </TableRow>
  );
}

function TgDot({ on, title, icon }: { on: boolean; title: string; icon: string }) {
  return (
    <span title={`${title}: ${on ? "ارسال شد" : "ارسال نشده"}`} className={cn("flex size-5 items-center justify-center rounded-full text-[9px]", on ? "bg-emerald-500/20 ring-1 ring-emerald-500/40" : "bg-white/5 opacity-35 grayscale")} aria-label={`${title} ${on ? "ارسال شد" : "ارسال نشده"}`}>
      {icon}
    </span>
  );
}

function StatCard({ label, value, tone, sub }: { label: string; value: number | string; tone: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
      <p className="text-[9px] text-muted-foreground">{label}</p>
      <p className={cn("font-num text-lg font-bold leading-6", tone)} dir="ltr">
        {typeof value === "number" ? faNum(value, 0) : value}
      </p>
      {sub && <p className="text-[8px] text-muted-foreground">{sub}</p>}
    </div>
  );
}
