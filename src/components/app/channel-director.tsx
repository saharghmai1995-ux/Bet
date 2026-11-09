"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 📣 ایجنت مدیر کانال عمومی و VIP (@aineobet Channel Director Agent) — v13.0
// کنسول قیف تبدیل مخاطب عمومی به VIP:
//   پست ۱ (۱۱:۰۰) رادار شفافیت → پست ۲ (T-60) گیفت رایگان + تیزر قفل‌شده
//   → پست ۳ (FT+5m) بازگشایی قفل + اثبات SHA-256 → پست ۴ (۲۳:۳۰) برآیند واقعی
// همه پست‌ها سمت سرور اجرا می‌شوند (زمان‌بند ۹۰ ثانیه‌ای) — دکمه‌ها فقط اجرای دستی‌اند.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Clock, Loader2, Lock, Megaphone, Moon, Radar, Send, Unlock, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQuantStore } from "@/lib/store";
import { faNum } from "@/lib/format";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface FunnelStatusDTO {
  success: boolean;
  publicChannel?: string | null;
  vipChannel?: string | null;
  today?: string;
  radarSentToday?: boolean;
  pnlSentToday?: boolean;
  giftSentToday?: boolean;
  stats?: { scanned: number; vetoed: number; golden: number };
  sentCounts?: Record<string, number>;
  recent?: { kind: string; ok: boolean; detail: string | null; createdAt: string }[];
  error?: string;
}

const KIND_LABEL: Record<string, string> = {
  FUNNEL_RADAR: "📡 رادار صبح (کانال عمومی)",
  FUNNEL_GIFT: "🎁 گیفت رایگان (T-60)",
  FUNNEL_TEASER: "🔒 تیزر قفل‌شده (T-60)",
  FUNNEL_UNBLUR: "🔓 بازگشایی + اثبات (FT+5m)",
  FUNNEL_PNL: "🌙 برآیند شبانه (۲۳:۳۰)",
};

export function ChannelDirectorTab() {
  const config = useQuantStore((s) => s.config);
  const patchConfig = useQuantStore((s) => s.patchConfig);

  const [pub, setPub] = useState(config.telegramPublicChannelId || "@aineobet");
  const [vip, setVip] = useState(config.telegramChannelId || "");
  const [status, setStatus] = useState<FunnelStatusDTO | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/telegram/funnel", { cache: "no-store" });
      const data = (await res.json()) as FunnelStatusDTO;
      if (data.success) setStatus(data);
    } catch {
      /* خطای شبکه — وضعیت قبلی می‌ماند */
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 60_000);
    return () => clearInterval(t);
  }, [load]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/telegram/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botToken: config.telegramBotToken, channelId: vip, publicChannelId: pub }),
      });
      const data = (await res.json()) as { success: boolean };
      if (data.success) {
        patchConfig({ telegramChannelId: vip, telegramPublicChannelId: pub });
        toast.success("شناسه دو کانال روی سرور ذخیره شد", { description: `عمومی: ${pub} · VIP: ${vip || "@aineobet (پیش‌فرض)"}` });
        await load();
      } else {
        toast.error("ذخیره ناموفق بود");
      }
    } catch {
      toast.error("خطای شبکه در ذخیره کانال‌ها");
    } finally {
      setSaving(false);
    }
  }, [config.telegramBotToken, vip, pub, patchConfig, load]);

  const run = useCallback(
    async (action: string, label: string) => {
      setBusy(action);
      try {
        const res = await fetch("/api/telegram/funnel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        const data = (await res.json()) as { success: boolean; detail?: string; error?: string };
        if (data.success) toast.success(`${label} — اجرا شد`, { description: data.detail });
        else toast.error(`${label} ناموفق: ${data.detail ?? data.error ?? "?"}`);
        await load();
      } catch {
        toast.error(`خطای شبکه در اجرای ${label}`);
      } finally {
        setBusy(null);
      }
    },
    [load]
  );

  const posts = [
    { n: 1, time: "۱۱:۰۰ تهران", icon: Radar, title: "رادار شفافیت روزانه — کانال عمومی", desc: "X بازی اسکن شد · Y بازی پرریسک وتو شد · Z سیگنال طلایی برای VIP صادر شد", action: "radar", done: status?.radarSentToday, btn: "📡 ارسال رادار" },
    { n: 2, time: "T-60m", icon: Lock, title: "۱ گیفت کامل رایگان + تیزرهای قفل‌شده — کانال عمومی", desc: "مبارزه، سود تضمینی و هش SHA-256 نمایان؛ تیپ B با شیشه تار و مهر 🔒 LOCKED FOR @AINEOBET VIP", action: "teasers", done: status?.giftSentToday, btn: "🎁 ارسال گیفت + تیزر" },
    { n: 3, time: "FT + 5m", icon: Unlock, title: "بازگشایی قفل + پوستر WIN CONFIRMED — کانال عمومی", desc: "همان کارت بدون سانسور کنار نتیجه ESPN منتشر می‌شود تا هش پیش از بازی با برد تطبیق دیده شود", action: "unblur", done: (status?.sentCounts?.FUNNEL_UNBLUR ?? 0) > 0, btn: "🔓 ارسال اثبات" },
    { n: 4, time: "۲۳:۳۰ تهران", icon: Moon, title: "برآیند واقعی شب با افراز مجزا — کانال عمومی", desc: "سود خالص Tier 1 / Tier 2 / Tier 3 جداگانه — هیچ کارتی در دو خط شمرده نمی‌شود", action: "pnl", done: status?.pnlSentToday, btn: "🌙 ارسال برآیند" },
  ];

  return (
    <section className="space-y-4" aria-label="ایجنت مدیر کانال عمومی و VIP">
      {/* هدر */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold sm:text-base">
          <span aria-hidden>📣</span>
          ایجنت مدیر کانال عمومی و VIP (@aineobet Funnel Director)
        </h2>
        <Badge variant="outline" className="gap-1 border-violet-500/40 bg-violet-500/10 text-[9px] text-violet-300">
          <Clock className="size-2.5" /> زمان‌بند سرور ۹۰ ثانیه‌ای — کاملاً مستقل از مرورگر
        </Badge>
      </div>

      {/* دو کانال */}
      <div className="grid gap-3 rounded-xl border border-violet-500/25 bg-violet-500/[0.05] p-4 lg:grid-cols-[1fr_1fr_auto]">
        <div className="space-y-1.5">
          <Label htmlFor="fd-public" className="text-[10px] text-muted-foreground">
            شناسه کانال عمومی ویترین (Public Showcase Chat ID)
          </Label>
          <Input id="fd-public" dir="ltr" placeholder="@aineobet" value={pub} onChange={(e) => setPub(e.target.value)} className="h-9 border-white/10 bg-black/30 text-xs" autoComplete="off" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fd-vip" className="text-[10px] text-muted-foreground">
            شناسه کانال اعضای ویژه (VIP Private Chat ID)
          </Label>
          <Input id="fd-vip" dir="ltr" placeholder="@aineobet_vip یا -1001234567890" value={vip} onChange={(e) => setVip(e.target.value)} className="h-9 border-white/10 bg-black/30 text-xs" autoComplete="off" />
        </div>
        <div className="flex items-end">
          <Button size="sm" className="h-9 gap-1 bg-violet-600 px-4 text-[11px] font-bold hover:bg-violet-500" onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />} ذخیره دو کانال
          </Button>
        </div>
      </div>

      {/* آمار رادار */}
      {status?.stats && (
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "بازی اسکن‌شده", value: status.stats.scanned, tone: "text-cyan-300" },
            { label: "وتوی سوپروایزر", value: status.stats.vetoed, tone: "text-rose-300" },
            { label: "سیگنال طلایی فعال", value: status.stats.golden, tone: "text-amber-300" },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-center">
              <p className={cn("font-num text-xl font-black", s.tone)} dir="ltr">{faNum(s.value, 0)}</p>
              <p className="text-[10px] text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* ۴ پست قیف */}
      <div className="grid gap-2 lg:grid-cols-2">
        {posts.map((p) => (
          <div key={p.n} className={cn("space-y-1.5 rounded-xl border p-3", p.done ? "border-emerald-500/30 bg-emerald-500/[0.05]" : "border-white/10 bg-white/[0.02]")}>
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <p className="flex items-center gap-1.5 text-[11px] font-bold text-foreground/90">
                <p.icon className={cn("size-3.5", p.done ? "text-emerald-400" : "text-violet-300")} />
                پست {faNum(p.n, 0)} · {p.title}
              </p>
              <span className="flex items-center gap-1 text-[9px] text-muted-foreground">
                <Clock className="size-2.5" /> {p.time}
                {p.done ? <CheckCircle2 className="size-3 text-emerald-400" /> : null}
              </span>
            </div>
            <p className="text-[10px] leading-4 text-muted-foreground">{p.desc}</p>
            <Button size="sm" variant="outline" className="h-7 gap-1 border-violet-500/40 px-2.5 text-[10px] text-violet-300 hover:bg-violet-500/10" onClick={() => void run(p.action, p.btn)} disabled={busy !== null}>
              {busy === p.action ? <Loader2 className="size-3 animate-spin" /> : <p.icon className="size-3" />}
              اجرای دستی — {p.btn}
            </Button>
          </div>
        ))}
      </div>

      {/* لاگ قیف */}
      <div className="rounded-xl border border-white/10 bg-white/[0.02]">
        <div className="flex items-center justify-between gap-2 border-b border-white/8 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold">
            <Megaphone className="size-3.5 text-violet-300" /> صندوق قیف کانال — آخرین پست‌های خودکار مدیر کانال
          </p>
          {status?.sentCounts && (
            <p className="text-[9px] text-muted-foreground" dir="ltr">
              {Object.entries(status.sentCounts).map(([k, v]) => `${k.replace("FUNNEL_", "")}:${v}`).join(" · ") || "—"}
            </p>
          )}
        </div>
        {!status?.recent || status.recent.length === 0 ? (
          <p className="p-4 text-center text-[10px] text-muted-foreground">
            هنوز پستی از قیف ارسال نشده — به‌محض تنظیم توکن بات، پست‌ها طبق برنامه (۱۱:۰۰ / T-60 / FT+5m / ۲۳:۳۰) خودکار مخابره می‌شوند.
          </p>
        ) : (
          <ScrollArea className="max-h-60">
            <ul className="space-y-1 p-3">
              {status.recent.map((r, i) => (
                <li key={i} className="flex items-center gap-1.5 rounded-lg border border-white/8 bg-black/20 px-2 py-1.5 text-[10px]">
                  {r.ok ? <CheckCircle2 className="size-3 shrink-0 text-emerald-400" /> : <XCircle className="size-3 shrink-0 text-rose-400" />}
                  <span className="font-bold text-foreground/85">{KIND_LABEL[r.kind] ?? r.kind}</span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{r.detail}</span>
                  <span className="shrink-0 text-muted-foreground/60" dir="ltr">{new Date(r.createdAt).toLocaleString("fa-IR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </div>
    </section>
  );
}
