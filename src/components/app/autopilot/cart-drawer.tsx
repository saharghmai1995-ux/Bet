"use client";

// ─────────────────────────────────────────────────────────────────────────────
// داک شناور «سبد هوشمند روزانه و تخصیص کلی همزمان» — v3.0 (رابط ۲)
// کل بودجه روزانه به‌صورت خودکار بین زوج‌تیپ‌های انتخابی با کلِی همزمان تقسیم
// می‌شود و خروجی متنی آماده تلگرام / برگه‌ساز تولید می‌کند.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { ShoppingBasket, Check, Copy, ScrollText, Sparkles, Trash2, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useQuantStore } from "@/lib/store";
import { buildTelegramText, useCartItems } from "@/lib/autopilot-derive";
import { solveSimultaneousKelly } from "@/lib/engine/simkelly";
import { faNum, faPct } from "@/lib/format";
import { cn } from "@/lib/utils";

export function SmartCartDrawer() {
  const cartItems = useCartItems();
  const cart = useQuantStore((s) => s.cart);
  const clearCart = useQuantStore((s) => s.clearCart);
  const toggleCart = useQuantStore((s) => s.toggleCart);
  const config = useQuantStore((s) => s.config);

  const [open, setOpen] = useState(false);
  const [deployment, setDeployment] = useState(100);
  const [useKelly, setUseKelly] = useState(true);
  const [copied, setCopied] = useState(false);

  const budget = Math.max(1, config.dailyBudget);

  // ─── تخصیص کلِی همزمان با قید بودجه ───
  const kelly = useMemo(
    () =>
      solveSimultaneousKelly(
        cartItems.map((it) => ({
          id: it.key,
          jointStates: it.pair.jointStates,
          oddsA: it.pair.totalOddsA,
          oddsB: it.pair.totalOddsB,
        })),
        budget,
        deployment / 100
      ),
    [cartItems, budget, deployment]
  );

  const allocById = useMemo(() => {
    const map = new Map<string, { stakeA: number; stakeB: number }>();
    kelly.allocations.forEach((a) => map.set(a.id, { stakeA: a.stakeA, stakeB: a.stakeB }));
    return map;
  }, [kelly.allocations]);

  // v4.0: وقتی کلِی همزمان با ضرایب واقعی به رشد ≤ ۰ می‌رسد، استیک بهینه صفر است؛
  // به‌جای نمایش «۰ واحد»، خودکار به داچینگ سود برابر fallback می‌کنیم
  const kellyZero = useKelly && kelly.allocations.length > 0 && kelly.allocations.every((a) => a.stakeA + a.stakeB < 0.05);

  // ─── سود تضمینی هر آیتم (داچینگ سود برابر روی سهم تخصیص‌یافته) ───
  const rows = useMemo(
    () =>
      cartItems.map((it) => {
        const alloc = allocById.get(it.key) ?? { stakeA: 0, stakeB: 0 };
        const deployedBudget = (budget * deployment) / 100;
        const pairTotal = kellyZero ? deployedBudget / Math.max(1, cartItems.length) : alloc.stakeA + alloc.stakeB;
        const impliedSum = 1 / it.pair.totalOddsA + 1 / it.pair.totalOddsB;
        const epStakeA = (pairTotal * (1 / it.pair.totalOddsA)) / impliedSum;
        const epStakeB = (pairTotal * (1 / it.pair.totalOddsB)) / impliedSum;
        const stakeA = useKelly && !kellyZero ? alloc.stakeA : Math.round(epStakeA * 10) / 10;
        const stakeB = useKelly && !kellyZero ? alloc.stakeB : Math.round(epStakeB * 10) / 10;
        const profit = (stakeA + stakeB) * (it.pair.totalOddsA * it.pair.totalOddsB) / (it.pair.totalOddsA + it.pair.totalOddsB) - (stakeA + stakeB);
        return { ...it, stakeA, stakeB, profit: Math.round(profit * 10) / 10 };
      }),
    [cartItems, allocById, useKelly, kellyZero, budget, deployment]
  );

  const deployed = rows.reduce((s, r) => s + r.stakeA + r.stakeB, 0);
  const guaranteedSum = rows.reduce((s, r) => s + r.profit, 0);
  const strategyLabel = useKelly ? "کلِی همزمان" : "داچینگ سود برابر";

  const telegram = useMemo(
    () =>
      buildTelegramText(
        rows.map((r) => ({ view: r.view, stakeA: r.stakeA, stakeB: r.stakeB, profit: r.profit })),
        budget,
        kellyZero ? "داچینگ سود برابر (کلِی: بدون لبه مثبت)" : strategyLabel
      ),
    [rows, budget, strategyLabel, kellyZero]
  );

  const handleCopy = () => {
    void navigator.clipboard?.writeText(telegram);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <button
          type="button"
          className={cn(
            "fixed bottom-4 left-4 z-40 flex items-center gap-2 rounded-full border px-4 py-2.5 text-xs font-bold shadow-xl backdrop-blur-md transition-all hover:scale-105",
            cart.length > 0
              ? "border-emerald-400/50 bg-emerald-500/20 text-emerald-200 shadow-emerald-500/25"
              : "border-white/15 bg-black/60 text-muted-foreground"
          )}
          aria-label={`سبد تیپ‌های انتخابی، ${cart.length} مورد`}
        >
          <span aria-hidden>🧺</span>
          سبد تیپ‌های انتخابی
          <span
            className={cn(
              "flex size-5 items-center justify-center rounded-full text-[10px]",
              cart.length > 0 ? "animate-pulse bg-emerald-500 text-black" : "bg-white/10 text-muted-foreground"
            )}
            dir="ltr"
          >
            {faNum(cart.length, 0)}
          </span>
        </button>
      </DrawerTrigger>

      <DrawerContent className="mx-auto max-h-[88vh] max-w-2xl border-white/10 bg-[rgba(9,13,24,0.97)] backdrop-blur-xl">
        <DrawerHeader className="pb-2 text-right">
          <DrawerTitle className="flex items-center justify-between gap-2 text-base">
            <span className="flex items-center gap-2">
              <ShoppingBasket className="size-4 text-emerald-400" />
              سبد هوشمند روزانه و تخصیص کلی همزمان
            </span>
            {cart.length > 0 && (
              <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-[11px] text-rose-400 hover:text-rose-300" onClick={clearCart}>
                <Trash2 className="size-3.5" /> خالی کردن سبد
              </Button>
            )}
          </DrawerTitle>
          <DrawerDescription className="text-xs leading-5">
            بودجه روزانه به‌صورت خودکار بین زوج‌تیپ‌های انتخابی تقسیم می‌شود — با{" "}
            <a
              className="text-cyan-400 underline decoration-dotted"
              href="https://www.researchgate.net/publication/343733940_A_COMPARISON_OF_SIMULTANEOUS_KELLY_BETTING_STRATEGIES"
              target="_blank"
              rel="noreferrer"
            >
              بهینه‌سازی کلِی همزمان
            </a>{" "}
            یا داچینگ سود برابر.
          </DrawerDescription>
        </DrawerHeader>

        <div className="px-4 pb-6">
          {cartItems.length === 0 ? (
            <div className="flex min-h-[160px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 p-6 text-center">
              <ShoppingBasket className="size-6 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                سبد خالی است — از فلش‌کارت‌ها دکمه «افزودن به سبد» را بزنید (۲ یا ۳ زوج‌تیپ مختلف برای تنوع بهینه).
              </p>
            </div>
          ) : (
            <>
              {/* کنترل‌های تخصیص */}
              <div className="mb-3 grid gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">درصد استقرار از بودجه ({faNum(budget, 0)} واحد)</span>
                    <b className="text-emerald-300" dir="ltr">{faNum(deployment, 0)}%</b>
                  </div>
                  <Slider value={[deployment]} min={25} max={100} step={25} onValueChange={(v) => setDeployment(v[0])} aria-label="درصد استقرار از بودجه" />
                  <p className="text-[10px] text-muted-foreground">
                    مستقرشده: <b dir="ltr" className="text-foreground">{faNum(deployed, 1)}</b> واحد از {faNum((budget * deployment) / 100, 0)}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 px-3 sm:justify-end">
                  <div className="text-left sm:text-right">
                    <p className="flex items-center gap-1 text-xs font-medium">
                      <TrendingUp className="size-3.5 text-cyan-400" /> کلِی همزمان (رشد لگاریتمی بهینه)
                    </p>
                    <p className="text-[10px] text-muted-foreground">غیرفعال = داچینگ سود برابر (حاشیه تضمینی ثابت)</p>
                  </div>
                  <Switch checked={useKelly} onCheckedChange={setUseKelly} aria-label="استراتژی کلِی همزمان" />
                </div>
              </div>

              {/* آیتم‌های سبد */}
              <ScrollArea className="max-h-[38vh]">
                <div className="space-y-2 pr-1">
                  {rows.map((r) => (
                    <div key={r.key} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold">
                            {r.view.match.homeTeam} — {r.view.match.awayTeam}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {r.view.match.league} · اطمینان قاضی{" "}
                            <b dir="ltr">{faNum(r.view.confidence * 100, 0)}%</b>
                          </p>
                        </div>
                        <Button size="icon" variant="ghost" className="size-7 shrink-0 text-muted-foreground hover:text-rose-300" onClick={() => toggleCart(r.key)} aria-label="حذف از سبد">
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                      <Separator className="my-2 bg-white/8" />
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div className="rounded-lg border border-sky-500/25 bg-sky-500/5 px-2 py-1.5">
                          <p className="line-clamp-2 leading-4">{r.pair.labelA}</p>
                          <p className="mt-1 flex justify-between">
                            <span className="text-muted-foreground" dir="ltr">×{r.pair.totalOddsA.toFixed(2)}</span>
                            <b className="text-sky-300" dir="ltr">{faNum(r.stakeA, 1)}</b>
                          </p>
                        </div>
                        <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-2 py-1.5">
                          <p className="line-clamp-2 leading-4">{r.pair.labelB}</p>
                          <p className="mt-1 flex justify-between">
                            <span className="text-muted-foreground" dir="ltr">×{r.pair.totalOddsB.toFixed(2)}</span>
                            <b className="text-emerald-300" dir="ltr">{faNum(r.stakeB, 1)}</b>
                          </p>
                        </div>
                      </div>
                      <p className="mt-2 flex items-center justify-between text-[11px]">
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Sparkles className="size-3 text-amber-400" />
                          سود در سناریوی پوشش: <b className="text-emerald-300" dir="ltr">+{faNum(r.profit, 1)}</b>
                        </span>
                        <span className="text-muted-foreground">
                          ریسک باخت همزمان <b dir="ltr">{faPct(r.pair.jointStates.bothLose, 1)}</b>
                        </span>
                      </p>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              {/* جمع‌بندی + خروجی تلگرام */}
              <div className="mt-3 space-y-2 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.05] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span>
                    مجموع استیک: <b dir="ltr" className="text-foreground">{faNum(deployed, 1)}</b> واحد
                  </span>
                  <span>
                    سود تضمینی مجموع (هر زوج پوشیده): <b dir="ltr" className="text-emerald-300">+{faNum(guaranteedSum, 1)}</b>
                  </span>
                  <span>
                    نرخ رشد کلِی: <b dir="ltr" className="text-cyan-300">{faNum(kelly.growth * 100, 2)}%</b>
                    {kelly.constrained && <span className="text-amber-400"> · قید بودجه فعال</span>}
                  </span>
                </div>
                {kellyZero && (
                  <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[10px] leading-4 text-amber-300">
                    ℹ️ با ضرایب واقعی بوک‌میکرها، کلِی همزمان برای این زوج لبه مثبت پیدا نکرد (رشد ≤ ۰) و استیک بهینه صفر بود — تخصیص «داچینگ سود برابر» به‌صورت خودکار نمایش داده می‌شود.
                  </p>
                )}
                <Separator className="bg-white/8" />
                <div className="flex items-start gap-2">
                  <ScrollText className="mt-1 size-4 shrink-0 text-muted-foreground" />
                  <textarea
                    readOnly
                    dir="rtl"
                    value={telegram}
                    rows={5}
                    className="h-24 w-full resize-none rounded-lg border border-white/10 bg-black/30 p-2 font-mono text-[10px] leading-4 text-foreground/85"
                    aria-label="خروجی متنی سبد برای تلگرام"
                  />
                </div>
                <Button size="sm" className="h-8 w-full gap-1.5 bg-emerald-600 text-xs hover:bg-emerald-500" onClick={handleCopy}>
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                  {copied ? "کپی شد!" : "خروجی متنی آماده برای تلگرام / برگه‌ساز"}
                </Button>
              </div>
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
