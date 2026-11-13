"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 📣 ایجنت مدیر کانال عمومی و VIP (@aineobet Channel Director) — v13.5
// خط لوله جدید کارفرما:
//   کانال عمومی @aineobet = فقط نتایج + روزانه ۱ کارت رایگان (دژ نفوذناپذیر اولویت)
//     + بنر بازاریابی ساعتی ۰۹–۲۳ + برآیند شبانه ۲۳:۳۰
//   کانال VIP = فقط فلش‌کارت‌های بازی + کارت نتیجه برایند روزانه ۲۱:۰۰
// همه پست‌ها سمت سرور اجرا می‌شوند (زمان‌بند ۹۰ ثانیه‌ای) — دکمه‌ها فقط اجرای دستی‌اند.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, CheckCircle2, Clock, Gift, GraduationCap, Loader2, Megaphone, Moon, Newspaper, PieChart, Send, Sunrise, XCircle, CalendarDays } from "lucide-react";
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
  digestSentToday?: boolean;
  briefSentToday?: boolean;
  eduSentThisSlot?: boolean;
  newsSentThisSlot?: boolean;
  weeklySentThisWeek?: boolean;
  lastAdStamp?: string | null;
  stats?: { scanned: number; vetoed: number; golden: number };
  sentCounts?: Record<string, number>;
  recent?: { kind: string; ok: boolean; detail: string | null; createdAt: string }[];
  error?: string;
}

const KIND_LABEL: Record<string, string> = {
  FUNNEL_RADAR: "📡 رادار صبح (عمومی — نسخه قدیم)",
  FUNNEL_GIFT: "🎁 کارت رایگان روزانه (عمومی)",
  FUNNEL_TEASER: "🔒 تیزر قفل‌شده (عمومی — نسخه قدیم)",
  FUNNEL_UNBLUR: "🔓 بازگشایی + اثبات (نسخه قدیم)",
  FUNNEL_PNL: "🌙 برآیند شبانه ۲۳:۳۰ (عمومی)",
  MARKETING_AD: "📣 بنر بازاریابی ساعتی (عمومی)",
  DAILY_DIGEST: "📊 برآیند روزانه ۲۱:۰۰ (عمومی + VIP)",
  WINRATE: "🎯 گزارش وین‌ریت (عمومی)",
  VIP_BRIEF: "🌅 بریفینگ صبح ۱۰:۰۰ (VIP)",
  BET_TERM: "🎓 آکادمی اصطلاحات BET (عمومی)",
  FOOTBALL_NEWS: "📰 خبرهای فوتبال ESPN (عمومی)",
  WEEKLY_DIGEST: "🗓 گزارش هفتگی جمعه ۲۲:۰۰ (عمومی + VIP)",
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

  // ─── خط لوله v18.0 — ۹ پست خودکار ایجنت سوپروایزر تلگرام ───
  const posts = [
    {
      n: 1,
      time: "هر ۹۰ ثانیه (خودکار)",
      icon: Megaphone,
      title: "نتایج FT → کانال عمومی @aineobet · فلش‌کارت → کانال VIP",
      desc: "کارت‌های تاییدشده فقط به کانال VIP اعضا می‌روند و اعلام نتیجه رسمی ESPN فقط به کانال عمومی — تفکیک کامل طبق دستور کارفرما.",
      action: null,
      done: true,
      btn: "خودکار",
    },
    {
      n: 2,
      time: "۱۰:۰۰ تهران · کانال VIP",
      icon: Sunrise,
      title: "بریفینگ صبح VIP — کارت‌های امروز + توصیه‌های مهم سوپروایزر",
      desc: "پوستر آرکید بریفینگ: فهرست کارت‌های تاییدشده امروز، انتخاب اول سوپروایزر، پنجره ثبت، انضباط استیک ثابت + شفافیت وتوها؛ بدون کارت = پیام انضباط کامل.",
      action: "brief",
      done: status?.briefSentToday,
      btn: "🌅 ارسال بریفینگ VIP",
    },
    {
      n: 3,
      time: "۰۹:۳۰ و ۱۶:۳۰ تهران · کانال عمومی",
      icon: Newspaper,
      title: "خلاصه خبرهای مهم فوتبال (وایر ESPN)",
      desc: "تیترهای تازه وایر ESPN روی پوستر آرکید + کپشن فارسی — آگاهی پیش از شرط؛ شکست وایر بدون پیام خطا skip می‌شود.",
      action: "news",
      done: status?.newsSentThisSlot,
      btn: "📰 ارسال خبرهای فوتبال",
    },
    {
      n: 4,
      time: "۱۱:۳۰ و ۱۸:۳۰ تهران · کانال عمومی",
      icon: GraduationCap,
      title: "آکادمی اصطلاحات BET — دو درس چرخشی در روز",
      desc: "۱۴ اصطلاح کلیدی (Value، EV، کلی، داچینگ، CLV، ایکس‌جی و...) روی پوستر آموزشی انگلیسی + توضیح کامل فارسی در کپشن.",
      action: "edu",
      done: status?.eduSentThisSlot,
      btn: "🎓 ارسال درس آموزشی",
    },
    {
      n: 5,
      time: "۱۲:۰۰ تهران (۹ تا ۲۳ چرخشی)",
      icon: Gift,
      title: "۱ کارت VIP رایگان روزانه (تایید سوپروایزر یا دژ نفوذناپذیر) — کانال عمومی",
      desc: "اولویت با کارت‌های دژ (ریسک باخت همزمان زیر ۷٪)؛ در نبود دژ، بالاترین امتیاز سوپروایزر انتخاب می‌شود.",
      action: "gift",
      done: status?.giftSentToday,
      btn: "🎁 ارسال کارت رایگان",
    },
    {
      n: 6,
      time: "ساعتی · ۰۹ تا ۲۳ تهران",
      icon: Megaphone,
      title: "بنر بازاریابی هوشمند تصویری (۱۰ موضوع چرخشی) — کانال عمومی",
      desc: "بنر کاملاً انگلیسی با KPI واقعی کانال + کپشن فارسی حرفه‌ای — برای جذب اشتراک VIP.",
      action: "ad",
      done: status?.adSentThisHour ?? false,
      btn: "📣 ارسال بنر بازاریابی",
    },
    {
      n: 7,
      time: "۲۱:۰۰ تهران",
      icon: PieChart,
      title: "کارت نتیجه برایند روزانه — هر دو کانال (عمومی + VIP)",
      desc: "KPIهای واقعی روز: تعداد تسویه، وین‌ریت، جکپات‌ها و سود خالص واحد.",
      action: "digest",
      done: status?.digestSentToday,
      btn: "📊 ارسال برایند روزانه",
    },
    {
      n: 8,
      time: "جمعه ۲۲:۰۰ تهران · هر دو کانال",
      icon: CalendarDays,
      title: "گزارش هفتگی — برایند ۷ روز با افراز مجزای خطوط تولید",
      desc: "KPIهای هفته: تسویه‌ها، وین‌ریت، جکپات، سود هر خط تولید (تک‌بازی/میکس/اسنایپر)، بهترین روز و موقعیت بانک ۱۰۰۰ واحدی.",
      action: "weekly",
      done: status?.weeklySentThisWeek,
      btn: "🗓 ارسال گزارش هفتگی",
    },
    {
      n: 9,
      time: "۲۳:۳۰ تهران",
      icon: Moon,
      title: "برآیند واقعی شب با افراز مجزا — کانال عمومی",
      desc: "سود خالص Tier 1 / Tier 2 / Tier 3 جداگانه — هیچ کارتی در دو خط شمرده نمی‌شود.",
      action: "pnl",
      done: status?.pnlSentToday,
      btn: "🌙 ارسال برآیند",
    },
  ];

  return (
    <section className="space-y-4" aria-label="ایجنت مدیر کانال عمومی و VIP">
      {/* هدر */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold sm:text-base">
          <span aria-hidden>📣</span>
          ایجنت مدیر کانال عمومی و VIP (@aineobet Channel Director)
        </h2>
        <Badge variant="outline" className="gap-1 border-violet-500/40 bg-violet-500/10 text-[9px] text-violet-300">
          <Clock className="size-2.5" /> زمان‌بند سرور ۹۰ ثانیه‌ای — کاملاً مستقل از مرورگر
        </Badge>
      </div>

      {/* راهنمای تفکیک کانال‌ها */}
      <div className="grid gap-2 rounded-xl border border-violet-500/25 bg-violet-500/[0.05] p-3 sm:grid-cols-2">
        <p className="flex items-start gap-1.5 text-[10px] leading-4 text-foreground/85">
          <BadgeCheck className="mt-0.5 size-3.5 shrink-0 text-cyan-300" />
          <span>
            <b>کانال عمومی {status?.publicChannel ?? "@aineobet"}:</b> نتایج FT، گزارش وین‌ریت، برآیند روزانه، ۱ کارت رایگان روزانه، خبرهای ESPN، درس آکادمی BET و بنرهای بازاریابی ساعتی.
          </span>
        </p>
        <p className="flex items-start gap-1.5 text-[10px] leading-4 text-foreground/85">
          <BadgeCheck className="mt-0.5 size-3.5 shrink-0 text-amber-300" />
          <span>
            <b>کانال VIP {status?.vipChannel ?? "—"}</b> (اعضای ویژه): فلش‌کارت‌های بازی + بریفینگ صبح با توصیه‌های مهم + کارت نتیجه برایند روزانه + گزارش هفتگی — بدون تبلیغ، بدون نویز.
          </span>
        </p>
      </div>

      {/* دو کانال */}
      <div className="grid gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4 lg:grid-cols-[1fr_1fr_auto]">
        <div className="space-y-1.5">
          <Label htmlFor="fd-public" className="text-[10px] text-muted-foreground">
            شناسه کانال عمومی (Public Results Channel)
          </Label>
          <Input id="fd-public" dir="ltr" placeholder="@aineobet" value={pub} onChange={(e) => setPub(e.target.value)} className="h-9 border-white/10 bg-black/30 text-xs" autoComplete="off" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fd-vip" className="text-[10px] text-muted-foreground">
            شناسه کانال اعضای ویژه (VIP Private Chat ID)
          </Label>
          <Input id="fd-vip" dir="ltr" placeholder="-1004487154797" value={vip} onChange={(e) => setVip(e.target.value)} className="h-9 border-white/10 bg-black/30 text-xs" autoComplete="off" />
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

      {/* ۹ پست خط لوله */}
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
            {p.action ? (
              <Button size="sm" variant="outline" className="h-7 gap-1 border-violet-500/40 px-2.5 text-[10px] text-violet-300 hover:bg-violet-500/10" onClick={() => void run(p.action as string, p.btn)} disabled={busy !== null}>
                {busy === p.action ? <Loader2 className="size-3 animate-spin" /> : <p.icon className="size-3" />}
                اجرای دستی — {p.btn}
              </Button>
            ) : null}
          </div>
        ))}
      </div>

      {/* لاگ */}
      <div className="rounded-xl border border-white/10 bg-white/[0.02]">
        <div className="flex items-center justify-between gap-2 border-b border-white/8 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold">
            <Megaphone className="size-3.5 text-violet-300" /> صندوق مدیر کانال — آخرین پست‌های خودکار (نتایج/گیفت/بنر/برآیند)
          </p>
          {status?.sentCounts && (
            <p className="text-[9px] text-muted-foreground" dir="ltr">
              {Object.entries(status.sentCounts).map(([k, v]) => `${k.replace("FUNNEL_", "")}:${v}`).join(" · ") || "—"}
            </p>
          )}
        </div>
        {!status?.recent || status.recent.length === 0 ? (
          <p className="p-4 text-center text-[10px] text-muted-foreground">
            هنوز پستی از مدیر کانال ارسال نشده — به‌محض تنظیم توکن بات، پست‌ها طبق برنامه (۱۲:۰۰ / ساعتی / ۲۱:۰۰ / ۲۳:۳۰) خودکار مخابره می‌شوند.
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
