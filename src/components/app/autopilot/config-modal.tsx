"use client";

// ─────────────────────────────────────────────────────────────────────────────
// مودال تنظیمات اتصال زنده و خلبان خودکار (API & Autopilot Config) — v3.0
// کلید The Odds API · وب‌هوک SoccerData/FastAPI · بازه اسکن · بودجه روزانه
// ─────────────────────────────────────────────────────────────────────────────

import { KeyRound, Link2, Timer, Wallet, Bot, RadioTower, Sparkles, Workflow } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useQuantStore } from "@/lib/store";
import { faNum } from "@/lib/format";

export function AutopilotConfigModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const config = useQuantStore((s) => s.config);
  const patchConfig = useQuantStore((s) => s.patchConfig);
  const scanCount = useQuantStore((s) => s.scanCount);

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
          {/* ─── اتصال‌های داده ─── */}
          <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-cyan-300">
              <Link2 className="size-3.5" /> اتصال داده‌های زنده
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="odds-api-key" className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <KeyRound className="size-3" /> کلید The Odds API
              </Label>
              <Input
                id="odds-api-key"
                dir="ltr"
                placeholder="xxxxxxxxxxxxxxxx"
                value={config.oddsApiKey}
                onChange={(e) => patchConfig({ oddsApiKey: e.target.value })}
                className="h-9 border-white/10 bg-black/30 text-xs"
                autoComplete="off"
              />
              <p className="text-[10px] leading-4 text-muted-foreground">
                در صورت خالی بودن، موتور از فید داخلی شبیه‌سازی‌شده استفاده می‌کند.
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

          {/* ─── رفتار خلبان خودکار ─── */}
          <div className="space-y-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
              <Bot className="size-3.5" /> رفتار خلبان خودکار
            </p>

            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium">خلبان خودکار فعال</p>
                <p className="text-[10px] text-muted-foreground">اسکن و مناظره اتوماتیک همه بازی‌ها</p>
              </div>
              <Switch checked={config.autopilotOn} onCheckedChange={(v) => patchConfig({ autopilotOn: v })} aria-label="خلبان خودکار" />
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium">شبیه‌ساز زنده و توست پوشش</p>
                <p className="text-[10px] text-muted-foreground">هشدار In-Play هنگام گل / حرکت تند ضریب</p>
              </div>
              <Switch checked={config.liveSimulation} onCheckedChange={(v) => patchConfig({ liveSimulation: v })} aria-label="شبیه‌ساز زنده" />
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium">مناظره LLM در اسکن</p>
                <p className="text-[10px] text-muted-foreground">غیرفعال = فقط موتور کمّی (سریع‌تر)</p>
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
