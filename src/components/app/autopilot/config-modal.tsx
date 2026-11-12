"use client";

// ─────────────────────────────────────────────────────────────────────────────
// مودال تنظیمات اتصال زنده و خلبان خودکار (API & Autopilot Config) — v5.0
// کلید The Odds API v4 (پیش‌فرض سرور فعال) · کلید رایگان Odds-API.io (۴۵۰ بوک‌میکر)
// · وضعیت زنده ۵ منبع ضرایب رایگان · وب‌هوک · بازه اسکن · بودجه · سپر Rate-Limit
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import {
  Bot,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Link2,
  RadioTower,
  Send,
  ShieldCheck,
  Sparkles,
  Timer,
  Wallet,
  Workflow,
  XCircle,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useQuantStore } from "@/lib/store";
import { faNum } from "@/lib/format";
import type { OddsSourceStatusDTO } from "@/lib/types";

export function AutopilotConfigModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const config = useQuantStore((s) => s.config);
  const patchConfig = useQuantStore((s) => s.patchConfig);
  const scanCount = useQuantStore((s) => s.scanCount);
  const llmShield = useQuantStore((s) => s.llmShield);

  const [sources, setSources] = useState<OddsSourceStatusDTO[] | null>(null);
  const [probing, setProbing] = useState(false);

  const probeSources = useCallback(
    async (force = false) => {
      setProbing(true);
      try {
        const qs = new URLSearchParams();
        if (config.oddsApiKey) qs.set("oddsApiKey", config.oddsApiKey);
        if (config.oddsApiIoKey) qs.set("oddsApiIoKey", config.oddsApiIoKey);
        if (force) qs.set("force", "1");
        const res = await fetch(`/api/odds/status?${qs.toString()}`, { cache: "no-store" });
        const data = (await res.json()) as { success: boolean; sources?: OddsSourceStatusDTO[] };
        if (data.success && data.sources) setSources(data.sources);
      } catch {
        // پروب منابع اختیاری است
      } finally {
        setProbing(false);
      }
    },
    [config.oddsApiKey, config.oddsApiIoKey]
  );

  useEffect(() => {
    if (open && !sources && !probing) void probeSources();
  }, [open]);

  const totalLlm = llmShield.llmCalls + llmShield.cacheHits;
  const cachePct = totalLlm > 0 ? Math.round((llmShield.cacheHits / totalLlm) * 100) : 94;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto border-white/10 bg-[rgba(9,13,24,0.92)] backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="size-4 text-emerald-400" />
            اتصال API و خلبان خودکار
          </DialogTitle>
          <DialogDescription className="text-xs leading-5">
            اتصال داده‌های زنده و تنظیم رفتار موتور اتوماتیک — تغییرات بلافاصله اعمال و در مرورگر ذخیره می‌شود.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 pt-1">
          {/* ─── سپر ضد Rate-Limit ─── */}
          <div className="space-y-2 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.05] p-4">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
              <ShieldCheck className="size-3.5" /> سپر ضد محدودیت نرخ LLM — فعال
            </p>
            <p className="text-[10px] leading-4 text-muted-foreground">
              اسکن پس‌زمینه ۲۲+ بازی ۱۰۰٪ با موتور ریاضی محلی (دیکسون-کولز + شین) اجرا می‌شود — صفر درخواست LLM، صفر توکن.
              LLM فقط با کلیک شما روی «تحلیل عمیق»، از کش ۶۰ دقیقه‌ای و با صف حداکثر ۱ درخواست در ۱۵ ثانیه صدا زده می‌شود.
            </p>
            <div className="flex flex-wrap items-center gap-2 text-[10px]">
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-300">کش هوشمند: <b dir="ltr">{faNum(cachePct, 0)}%</b></span>
              <span className="rounded-full bg-white/8 px-2 py-0.5 text-muted-foreground">فراخوان LLM: <b dir="ltr">{faNum(llmShield.llmCalls, 0)}</b></span>
              <span className="rounded-full bg-white/8 px-2 py-0.5 text-muted-foreground">کش موفق: <b dir="ltr">{faNum(llmShield.cacheHits, 0)}</b></span>
              <span className="rounded-full bg-white/8 px-2 py-0.5 text-muted-foreground">موتور محلی: <b dir="ltr">{faNum(llmShield.localQuant, 0)}</b></span>
            </div>
          </div>

          {/* ─── اتصال‌های داده ─── */}
          <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-cyan-300">
              <Link2 className="size-3.5" /> اتصال داده‌های زنده
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="odds-api-key" className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <KeyRound className="size-3" /> کلید The Odds API v4
              </Label>
              <Input
                id="odds-api-key"
                dir="ltr"
                placeholder="با خالی گذاشتن، کلید سرور استفاده می‌شود"
                value={config.oddsApiKey}
                onChange={(e) => patchConfig({ oddsApiKey: e.target.value })}
                className="h-9 border-white/10 bg-black/30 text-xs"
                autoComplete="off"
              />
              <p className="flex items-start gap-1 text-[10px] leading-4 text-muted-foreground">
                <span aria-hidden>🟢</span>
                <span>
                  کلید پیش‌فرض سرور (پلن رایگان ۵۰۰ درخواست ماهانه) فعال است. با وارد کردن کلید خودتان، ضرایب Pinnacle و بوک‌میکرهای اروپایی جایگزین خط پایه می‌شوند —{" "}
                  <a className="text-cyan-400 underline decoration-dotted" href="https://the-odds-api.com/liveapi/guides/v4/" target="_blank" rel="noreferrer">
                    دریافت کلید رایگان <ExternalLink className="inline size-2.5" />
                  </a>
                </span>
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="odds-api-io-key" className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <KeyRound className="size-3" /> کلید رایگان Odds-API.io (۴۵۰+ بوک‌میکر)
              </Label>
              <Input
                id="odds-api-io-key"
                dir="ltr"
                placeholder="کلید رایگان — ۱۰۰ درخواست در ساعت، بدون کارت بانکی"
                value={config.oddsApiIoKey}
                onChange={(e) => patchConfig({ oddsApiIoKey: e.target.value })}
                className="h-9 border-white/10 bg-black/30 text-xs"
                autoComplete="off"
              />
              <p className="flex items-start gap-1 text-[10px] leading-4 text-muted-foreground">
                <span aria-hidden>🟣</span>
                <span>
                  ۱۰۰ درخواست رایگان در ساعت از ۴۵۰ بوک‌میکر شامل Pinnacle و 1xBet —{" "}
                  <a className="text-cyan-400 underline decoration-dotted" href="https://odds-api.io/" target="_blank" rel="noreferrer">
                    دریافت کلید رایگان <ExternalLink className="inline size-2.5" />
                  </a>
                </span>
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="data-webhook" className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <RadioTower className="size-3" /> وب‌هوک SoccerData / FastAPI
              </Label>
              <Input
                id="data-webhook"
                dir="ltr"
                placeholder="https://api.example.com/v1/webhook"
                value={config.dataWebhook}
                onChange={(e) => patchConfig({ dataWebhook: e.target.value })}
                className="h-9 border-white/10 bg-black/30 text-xs"
                autoComplete="off"
              />
            </div>
          </div>

          {/* ─── وضعیت ۵ منبع ضرایب رایگان ─── */}
          <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-cyan-300">وضعیت منابع ضرایب (۳ منبع بدون کلید + ۲ منبع کلیددار)</p>
              <Button size="sm" variant="ghost" className="h-6 gap-1 px-2 text-[10px] text-cyan-300" onClick={() => void probeSources(true)} disabled={probing}>
                {probing ? "…" : "بررسی مجدد"}
              </Button>
            </div>
            {sources === null ? (
              <p className="text-[10px] text-muted-foreground">در حال بررسی منابع…</p>
            ) : (
              <ul className="space-y-1.5">
                <li className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.07] px-2 py-1.5 text-[10.5px] font-bold text-emerald-300" role="status">
                  <CheckCircle2 className="size-3.5 shrink-0" />
                  ✅ تمامی منابع زنده آماده به کار هستند
                </li>
                {sources.map((s) => (
                  <li key={s.key} className="flex items-start gap-2 rounded-lg border border-white/8 bg-black/20 px-2 py-1.5">
                    {s.ok ? (
                      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-400" />
                    ) : s.keyRequired && !s.keyPresent ? (
                      <KeyRound className="mt-0.5 size-3.5 shrink-0 text-amber-400" />
                    ) : (
                      <XCircle className="mt-0.5 size-3.5 shrink-0 text-rose-400" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1 text-[11px] font-medium">
                        {s.label}
                        {!s.keyRequired && <span className="rounded-full bg-emerald-500/15 px-1 text-[8px] text-emerald-300">بدون کلید</span>}
                        <span className="text-[9px] text-muted-foreground" dir="ltr">{s.latencyMs}ms</span>
                      </p>
                      <p className="truncate text-[10px] text-muted-foreground" title={s.detail}>{s.detail}</p>
                    </div>
                    {s.docsUrl && (
                      <a href={s.docsUrl} target="_blank" rel="noreferrer" className="mt-0.5 shrink-0 text-cyan-400" aria-label={`مستندات ${s.label}`}>
                        <ExternalLink className="size-3" />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* ─── رفتار خلبان خودکار ─── */}
          <div className="space-y-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
              <Bot className="size-3.5" /> رفتار خلبان خودکار
            </p>

            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium">خلبان خودکار فعال</p>
                <p className="text-[10px] text-muted-foreground">اسکن اتوماتیک همه بازی‌ها (موتور کمّی محلی)</p>
              </div>
              <Switch checked={config.autopilotOn} onCheckedChange={(v) => patchConfig({ autopilotOn: v })} aria-label="خلبان خودکار" />
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium">رصد زنده واقعی ESPN + توست پوشش</p>
                <p className="text-[10px] text-muted-foreground">گل/کارت قرمز از فید رسمی ESPN (بدون شبیه‌سازی) — حذف خودکار ۱۰ ثانیه</p>
              </div>
              <Switch checked={config.liveSimulation} onCheckedChange={(v) => patchConfig({ liveSimulation: v })} aria-label="رصد زنده واقعی ESPN" />
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium">اسکن صفر-توکن (سپر Rate-Limit)</p>
                <p className="text-[10px] text-muted-foreground">فعال = اسکن ۱۰۰٪ موتور محلی؛ LLM فقط با کلیک شما</p>
              </div>
              <Switch checked={config.zeroTokenScan} onCheckedChange={(v) => patchConfig({ zeroTokenScan: v })} aria-label="اسکن صفر توکن" />
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium">مناظره در اسکن</p>
                <p className="text-[10px] text-muted-foreground">مناظره کمّی محلی برای ۸ بازی نزدیک</p>
              </div>
              <Switch checked={config.autoDebate} onCheckedChange={(v) => patchConfig({ autoDebate: v })} aria-label="مناظره در اسکن" />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Timer className="size-3" /> بازه اسکن خودکار
                </Label>
                <span className="text-xs font-semibold text-emerald-300" dir="ltr">
                  {config.scanIntervalSec}s
                </span>
              </div>
              <Slider
                value={[config.scanIntervalSec]}
                min={15}
                max={120}
                step={5}
                onValueChange={(v) => patchConfig({ scanIntervalSec: v[0] })}
                aria-label="بازه اسکن خودکار به ثانیه"
              />
            </div>
          </div>

          {/* ─── v13.0 — قیف دوکاناله: ویترین عمومی + کانال VIP ─── */}
          <div className="space-y-3 rounded-xl border border-violet-500/25 bg-violet-500/[0.05] p-4">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-violet-300">
              <Send className="size-3.5" /> قیف دوکاناله @aineobet — ویترین عمومی + کانال VIP (v13.0)
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="tg-token-modal" className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <KeyRound className="size-3" /> توکن بات تلگرام
              </Label>
              <Input
                id="tg-token-modal"
                dir="ltr"
                placeholder="123456:ABC-DEF... (از BotFather)"
                value={config.telegramBotToken}
                onChange={(e) => patchConfig({ telegramBotToken: e.target.value })}
                className="h-9 border-white/10 bg-black/30 text-xs"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tg-public-modal" className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <KeyRound className="size-3" /> شناسه کانال عمومی ویترین (Public Showcase Chat ID)
              </Label>
              <Input
                id="tg-public-modal"
                dir="ltr"
                placeholder="@aineobet (پیش‌فرض) یا -1001234567890"
                value={config.telegramPublicChannelId}
                onChange={(e) => patchConfig({ telegramPublicChannelId: e.target.value })}
                className="h-9 border-white/10 bg-black/30 text-xs"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tg-channel-modal" className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <KeyRound className="size-3" /> شناسه کانال VIP (مثال: @Aineobet_bot یا -1001234567890)
              </Label>
              <Input
                id="tg-channel-modal"
                dir="ltr"
                placeholder="@Aineobet_bot یا -1001234567890"
                value={config.telegramChannelId}
                onChange={(e) => patchConfig({ telegramChannelId: e.target.value })}
                className="h-9 border-white/10 bg-black/30 text-xs"
                autoComplete="off"
              />
              <p className="flex items-start gap-1 text-[10px] leading-4 text-muted-foreground">
                <span aria-hidden>📤</span>
                <span>
                  ذخیره نهایی از تب «کارنامه و تسویه» انجام می‌شود. قیف v13.0: رادار صبح (۱۱:۰۰) + گیفت رایگان و تیزر قفل‌شده (T-60) + بازگشایی اثبات SHA-256 پس از FT + برآیند شبانه (۲۳:۳۰) — کنسول کامل در تب «مدیر کانال و قیف VIP».
                </span>
              </p>
            </div>
          </div>

          {/* ─── بودجه ─── */}
          <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="daily-budget" className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Wallet className="size-3" /> بودجه پیش‌فرض روزانه (واحد)
              </Label>
              <span className="text-sm font-bold text-amber-300" dir="ltr">
                {faNum(config.dailyBudget, 0)}
              </span>
            </div>
            <Input
              id="daily-budget"
              dir="ltr"
              type="number"
              min={10}
              max={100000}
              value={config.dailyBudget}
              onChange={(e) => patchConfig({ dailyBudget: Math.max(10, Number(e.target.value) || 10) })}
              className="h-9 border-white/10 bg-black/30 text-sm"
            />
            <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Workflow className="size-3" />
              مبنای استیک خودکار فلش‌کارت‌ها و تخصیص کلِی همزمان سبد — تاکنون {faNum(scanCount, 0)} اسکن کامل انجام شده است.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
