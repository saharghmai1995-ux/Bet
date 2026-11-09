"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 🤖 تب ربات اشتراک VIP (@aineobet_bot Subscription Engine) — v13.1
// کنسول تجاری اشتراک: وضعیت polling، درآمد USDT، فیش‌های کارت‌به‌کارت با تایید
// ۱ کلیکی (همتای دکمه‌های تلگرام ادمین)، اعضا، پرداخت‌ها و پیکربندی کامل گیت‌وی.
// داده‌ها از مینی‌سرویس مستقل (پورت 3010) через /api/vip-bot پروکسی می‌شوند.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import {
  BadgeCheck,
  Bot,
  CircleDollarSign,
  Copy,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  ShieldCheck,
  Users,
  XCircle,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { faNum } from "@/lib/format";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── DTO ها (مطابق خروجی مینی‌سرویس) ────────────────────────────────────────

interface PollingDTO {
  running: boolean;
  startedAt: string | null;
  lastPollAt: string | null;
  lastUpdateAt: string | null;
  processedUpdates: number;
  lastError: string | null;
}

interface ConfigDTO {
  botTokenMasked: string;
  tokenConfigured: boolean;
  botUsername: string;
  publicChannelUsername: string;
  vipChannelId: string;
  adminUserId: number;
  walletUsdtTrc20: string;
  walletUsdtPolygon: string;
  bankCardNumber: string;
  bankCardHolder: string;
  bankName: string;
  usdtToTomanRate: number;
  pollingEnabled: boolean;
}

interface StatsDTO {
  totalMembers: number;
  activeVip: number;
  totalPayments: number;
  totalUsdt: number;
  pendingReceipts: number;
  totalReferrals: number;
}

interface MemberDTO {
  user_id: number;
  username: string | null;
  lang: string;
  selected_plan: string;
  vip_expires_at: string | null;
  referral_count: number;
  joined_at: string;
}

interface PaymentDTO {
  id: number;
  txid: string;
  user_id: number;
  network: string;
  amount_usdt: number;
  plan_key: string;
  verified_at: string;
}

interface ReceiptDTO {
  id: number;
  user_id: number;
  username: string | null;
  plan_key: string;
  expected_toman: number;
  receipt_type: "PHOTO" | "TEXT";
  receipt_content: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  submitted_at: string;
}

const PLAN_FA: Record<string, string> = {
  weekend: "⚡ بسته ۴۸ ساعته",
  pro_monthly: "💎 ماهانه Pro",
  quant_all: "👑 جامع کامل",
};

const STATUS_FA: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "در انتظار", cls: "border-amber-500/40 bg-amber-500/10 text-amber-300" },
  APPROVED: { label: "تایید شده", cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" },
  REJECTED: { label: "رد شده", cls: "border-rose-500/40 bg-rose-500/10 text-rose-300" },
};

const emptyForm = {
  botToken: "",
  botUsername: "",
  publicChannelUsername: "",
  vipChannelId: "",
  adminUserId: "",
  walletUsdtTrc20: "",
  walletUsdtPolygon: "",
  bankCardNumber: "",
  bankCardHolder: "",
  bankName: "",
  usdtToTomanRate: "",
};

export function VipBotTab() {
  const [health, setHealth] = useState<{ polling: PollingDTO; config: ConfigDTO; stats: StatsDTO } | null>(null);
  const [members, setMembers] = useState<MemberDTO[]>([]);
  const [payments, setPayments] = useState<PaymentDTO[]>([]);
  const [receipts, setReceipts] = useState<ReceiptDTO[]>([]);
  const [form, setForm] = useState({ ...emptyForm });
  const [pollingOn, setPollingOn] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deciding, setDeciding] = useState<number | null>(null);
  const [testing, setTesting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ─── بارگذاری همه داده‌ها ───
  const load = useCallback(async () => {
    try {
      const [hRes, mRes, pRes, rRes] = await Promise.all([
        fetch("/api/vip-bot/api/health", { cache: "no-store" }),
        fetch("/api/vip-bot/api/members?limit=100", { cache: "no-store" }),
        fetch("/api/vip-bot/api/payments?limit=50", { cache: "no-store" }),
        fetch("/api/vip-bot/api/receipts?limit=60", { cache: "no-store" }),
      ]);
      const h = (await hRes.json()) as { success: boolean; polling: PollingDTO; config: ConfigDTO; stats: StatsDTO; error?: string };
      if (!h.success) {
        setLoadError(h.error ?? "سرویس در دسترس نیست");
        return;
      }
      setLoadError(null);
      setHealth({ polling: h.polling, config: h.config, stats: h.stats });
      setPollingOn(h.config.pollingEnabled);
      const m = (await mRes.json()) as { success: boolean; members?: MemberDTO[] };
      const p = (await pRes.json()) as { success: boolean; payments?: PaymentDTO[] };
      const r = (await rRes.json()) as { success: boolean; receipts?: ReceiptDTO[] };
      setMembers(m.members ?? []);
      setPayments(p.payments ?? []);
      setReceipts(r.receipts ?? []);
    } catch {
      setLoadError("خطای شبکه در اتصال به موتور اشتراک");
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
  }, [load]);

  // ─── ذخیره پیکربندی (فقط فیلدهای پرشده ارسال می‌شوند) ───
  const saveConfig = useCallback(async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = { pollingEnabled: pollingOn };
      const strFields = [
        "botToken",
        "botUsername",
        "publicChannelUsername",
        "vipChannelId",
        "walletUsdtTrc20",
        "walletUsdtPolygon",
        "bankCardNumber",
        "bankCardHolder",
        "bankName",
      ] as const;
      for (const k of strFields) {
        if (form[k].trim()) body[k] = form[k].trim();
      }
      const admin = Number(form.adminUserId);
      if (Number.isFinite(admin) && admin > 0) body.adminUserId = admin;
      const rate = Number(form.usdtToTomanRate);
      if (Number.isFinite(rate) && rate > 0) body.usdtToTomanRate = rate;

      const res = await fetch("/api/vip-bot/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { success: boolean; config?: ConfigDTO };
      if (data.success) {
        setForm({ ...emptyForm });
        toast.success("پیکربندی ربات ذخیره شد", {
          description: body.botToken
            ? "توکن جدید ثبت شد — polling بلافاصله با بات جدید آغاز می‌شود."
            : "تغییرات بدون تغییر توکن اعمال شد.",
        });
        await load();
      } else {
        toast.error("ذخیره پیکربندی ناموفق بود");
      }
    } catch {
      toast.error("خطای شبکه در ذخیره پیکربندی");
    } finally {
      setSaving(false);
    }
  }, [form, pollingOn, load]);

  // ─── تایید / رد فیش (همتای دکمه‌های تلگرام ادمین) ───
  const decide = useCallback(
    async (id: number, approve: boolean) => {
      setDeciding(id);
      try {
        const res = await fetch("/api/vip-bot/api/receipts/decide", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, approve }),
        });
        const data = (await res.json()) as { success: boolean; result?: { statusMessage: string } };
        if (data.success) {
          toast.success(data.result?.statusMessage ?? "انجام شد");
          await load();
        } else {
          toast.error("تصمیم روی فیش ثبت نشد");
        }
      } catch {
        toast.error("خطای شبکه در ثبت تصمیم");
      } finally {
        setDeciding(null);
      }
    },
    [load]
  );

  // ─── خودآزمایی چرخه کامل کارت‌به‌کارت ───
  const runSelfTest = useCallback(async () => {
    setTesting(true);
    try {
      const res = await fetch("/api/vip-bot/api/selftest", { method: "POST" });
      const data = (await res.json()) as { success: boolean; selftest?: { ok: boolean; exactToman: number; message: string } };
      if (data.success && data.selftest) {
        if (data.selftest.ok) {
          toast.success("خودآزمایی موفق — چرخه کارت‌به‌کارت سالم است", {
            description: `${data.selftest.message} · مبلغ یکتای تولیدشده: ${faNum(data.selftest.exactToman, 0)}`,
          });
        } else {
          toast.error("خودآزمایی ناموفق — چرخه تایید فیش خطا دارد", { description: data.selftest.message });
        }
      } else {
        toast.error("اجرای خودآزمایی ناموفق بود");
      }
    } catch {
      toast.error("خطای شبکه در اجرای خودآزمایی");
    } finally {
      setTesting(false);
    }
  }, []);

  const cfg = health?.config;
  const stats = health?.stats;
  const poll = health?.polling;

  const statusBadge = (() => {
    if (!cfg) return { text: "…", cls: "border-white/20 text-muted-foreground" };
    if (!cfg.tokenConfigured) return { text: "🟡 توکن تنظیم نشده — polling خاموش", cls: "border-amber-500/40 bg-amber-500/10 text-amber-300" };
    if (!pollingOn) return { text: "⏸️ متوقف (دستی)", cls: "border-white/20 bg-white/5 text-muted-foreground" };
    if (poll?.running) return { text: "🟢 فعال — دریافت آپدیت‌ها", cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" };
    return { text: "🔴 غیرفعال", cls: "border-rose-500/40 bg-rose-500/10 text-rose-300" };
  })();

  const pendingReceipts = receipts.filter((r) => r.status === "PENDING");

  return (
    <section className="space-y-4" aria-label="ربات اشتراک VIP @aineobet">
      {/* هدر */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold sm:text-base">
          <span aria-hidden>🤖</span>
          ربات اشتراک VIP (@aineobet_bot Subscription Engine)
        </h2>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={cn("gap-1 text-[9px]", statusBadge.cls)}>
            <Zap className="size-2.5" /> {statusBadge.text}
          </Badge>
          <Button size="sm" variant="outline" className="h-7 gap-1 border-white/15 px-2.5 text-[10px]" onClick={() => void load()}>
            <RefreshCw className="size-3" /> بروزرسانی
          </Button>
        </div>
      </div>

      {loadError && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/[0.06] p-3 text-[11px] text-rose-300">
          ⚠️ {loadError} — مینی‌سرویس <b dir="ltr">mini-services/vip-bot</b> روی پورت <b dir="ltr">3010</b> باید در حال اجرا باشد.
        </div>
      )}

      {/* KPI ها */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "کل اعضا", value: stats ? faNum(stats.totalMembers, 0) : "—", icon: Users, tone: "text-cyan-300" },
          { label: "VIP فعال", value: stats ? faNum(stats.activeVip, 0) : "—", icon: BadgeCheck, tone: "text-emerald-300" },
          { label: "درآمد USDT", value: stats ? `$${faNum(stats.totalUsdt, 0)}` : "—", icon: CircleDollarSign, tone: "text-amber-300" },
          { label: "پرداخت تتر", value: stats ? faNum(stats.totalPayments, 0) : "—", icon: ShieldCheck, tone: "text-violet-300" },
          { label: "فیش در انتظار", value: stats ? faNum(stats.pendingReceipts, 0) : "—", icon: Bot, tone: "text-orange-300" },
          { label: "دعوت‌های موفق", value: stats ? faNum(stats.totalReferrals, 0) : "—", icon: Copy, tone: "text-fuchsia-300" },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-center">
            <k.icon className={cn("mx-auto mb-1 size-4", k.tone)} />
            <p className={cn("font-num text-lg font-black", k.tone)} dir="ltr">{k.value}</p>
            <p className="text-[9px] text-muted-foreground">{k.label}</p>
          </div>
        ))}
      </div>

      {/* وضعیت polling */}
      {poll && (
        <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-[10px] text-muted-foreground sm:grid-cols-4">
          <p>آخرین poll: <span className="text-foreground/80" dir="ltr">{poll.lastPollAt ? new Date(poll.lastPollAt).toLocaleString("fa-IR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}</span></p>
          <p>آخرین آپدیت: <span className="text-foreground/80" dir="ltr">{poll.lastUpdateAt ? new Date(poll.lastUpdateAt).toLocaleString("fa-IR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}</span></p>
          <p>آپدیت پردازش‌شده: <span className="text-foreground/80">{faNum(poll.processedUpdates, 0)}</span></p>
          <p>بات: <span className="text-foreground/80" dir="ltr">@{cfg?.botUsername ?? "—"}</span>{poll.lastError ? <span className="text-rose-400"> · خطا: {poll.lastError.slice(0, 60)}</span> : null}</p>
        </div>
      )}

      {/* صف فیش‌های کارت‌به‌کارت */}
      <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.04]">
        <div className="flex items-center justify-between gap-2 border-b border-white/8 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold">
            <Bot className="size-3.5 text-amber-300" />
            صف فیش‌های کارت‌به‌کارت — تایید ۱ کلیکی (همتای دکمه‌های تلگرام ادمین)
          </p>
          <Badge variant="outline" className="border-amber-500/40 text-[9px] text-amber-300">
            {faNum(pendingReceipts.length, 0)} در انتظار
          </Badge>
        </div>
        {receipts.length === 0 ? (
          <p className="p-4 text-center text-[10px] text-muted-foreground">
            هنوز فیشی ثبت نشده — به محض ارسال رسید توسط کاربران (عکس یا کد پیگیری)، فیش با مبلغ اختصاصی و دکمه تایید/رد اینجا و در تلگرام ادمین ظاهر می‌شود.
          </p>
        ) : (
          <ScrollArea className="max-h-96">
            <ul className="space-y-2 p-3">
              {receipts.map((r) => {
                const st = STATUS_FA[r.status];
                return (
                  <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/8 bg-black/25 px-2.5 py-2 text-[10px]">
                    {r.receipt_type === "PHOTO" ? (
                      <img
                        src={`/api/vip-bot/api/receipts/${r.id}/photo`}
                        alt={`فیش واریزی کاربر ${r.username ?? r.user_id}`}
                        loading="lazy"
                        className="size-10 shrink-0 rounded-md border border-white/15 object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }}
                      />
                    ) : (
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-white/15 bg-white/5 text-sm" title={r.receipt_content}>🧾</span>
                    )}
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className="flex items-center gap-1.5">
                        <b className="text-foreground/90" dir="ltr">@{r.username ?? r.user_id}</b>
                        <span className={cn("rounded-full border px-1.5 text-[8px]", st.cls)}>{st.label}</span>
                        <span className="text-muted-foreground/60">#{faNum(r.id, 0)}</span>
                      </p>
                      <p className="text-muted-foreground">
                        {PLAN_FA[r.plan_key] ?? r.plan_key} · <span className="text-amber-200" dir="ltr">{faNum(r.expected_toman, 0)}</span> تومان ·{" "}
                        <span dir="ltr">{new Date(r.submitted_at).toLocaleString("fa-IR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                      </p>
                    </div>
                    {r.status === "PENDING" ? (
                      <div className="flex shrink-0 gap-1">
                        <Button size="sm" className="h-7 gap-1 bg-emerald-600 px-2 text-[10px] font-bold hover:bg-emerald-500" onClick={() => void decide(r.id, true)} disabled={deciding !== null}>
                          {deciding === r.id ? <Loader2 className="size-3 animate-spin" /> : <BadgeCheck className="size-3" />} تایید + لینک VIP
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 gap-1 border-rose-500/40 px-2 text-[10px] text-rose-300 hover:bg-rose-500/10" onClick={() => void decide(r.id, false)} disabled={deciding !== null}>
                          <XCircle className="size-3" /> رد
                        </Button>
                      </div>
                    ) : (
                      <span className="shrink-0 text-muted-foreground/50">بررسی شده</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        )}
      </div>

      {/* اعضا + پرداخت‌ها */}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/[0.02]">
          <p className="border-b border-white/8 px-3 py-2.5 text-xs font-semibold">👥 اعضا (آخرین {faNum(members.length, 0)} نفر)</p>
          <ScrollArea className="max-h-72">
            <Table>
              <TableHeader>
                <TableRow className="border-white/8">
                  <TableHead className="h-8 text-[9px]">کاربر</TableHead>
                  <TableHead className="h-8 text-[9px]">پلن</TableHead>
                  <TableHead className="h-8 text-[9px]">انقضای VIP</TableHead>
                  <TableHead className="h-8 text-[9px]">دعوت</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="py-4 text-center text-[10px] text-muted-foreground">عضوی ثبت نشده</TableCell></TableRow>
                ) : (
                  members.map((u) => {
                    const active = u.vip_expires_at ? new Date(u.vip_expires_at) > new Date() : false;
                    return (
                      <TableRow key={u.user_id} className="border-white/5 text-[10px]">
                        <TableCell className="py-1.5" dir="ltr">@{u.username ?? u.user_id}</TableCell>
                        <TableCell className="py-1.5">{PLAN_FA[u.selected_plan] ?? u.selected_plan}</TableCell>
                        <TableCell className="py-1.5" dir="ltr">
                          {u.vip_expires_at ? (
                            <span className={active ? "text-emerald-300" : "text-muted-foreground/50"}>{new Date(u.vip_expires_at).toLocaleDateString("fa-IR")}</span>
                          ) : (
                            <span className="text-muted-foreground/50">رایگان</span>
                          )}
                        </TableCell>
                        <TableCell className="py-1.5">{faNum(u.referral_count, 0)}</TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.02]">
          <p className="border-b border-white/8 px-3 py-2.5 text-xs font-semibold">💰 پرداخت‌های تتر تاییدشده (آخرین {faNum(payments.length, 0)} مورد)</p>
          <ScrollArea className="max-h-72">
            <Table>
              <TableHeader>
                <TableRow className="border-white/8">
                  <TableHead className="h-8 text-[9px]">TxID</TableHead>
                  <TableHead className="h-8 text-[9px]">شبکه</TableHead>
                  <TableHead className="h-8 text-[9px]">مبلغ</TableHead>
                  <TableHead className="h-8 text-[9px]">پلن</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="py-4 text-center text-[10px] text-muted-foreground">پرداختی ثبت نشده — کاربران TxID را در چت بات ارسال می‌کنند و استعلام بلاکچین خودکار است</TableCell></TableRow>
                ) : (
                  payments.map((p) => (
                    <TableRow key={p.id} className="border-white/5 text-[10px]">
                      <TableCell className="py-1.5 font-mono" dir="ltr" title={p.txid}>{p.txid.slice(0, 10)}…</TableCell>
                      <TableCell className="py-1.5">{p.network}</TableCell>
                      <TableCell className="py-1.5 text-emerald-300" dir="ltr">${faNum(p.amount_usdt, 2)}</TableCell>
                      <TableCell className="py-1.5">{PLAN_FA[p.plan_key] ?? p.plan_key}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </div>
      </div>

      {/* پیکربندی کامل گیت‌وی */}
      <div className="rounded-xl border border-violet-500/25 bg-violet-500/[0.04] p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold">
            <ShieldCheck className="size-3.5 text-violet-300" /> پیکربندی موتور اشتراک (توکن، کانال‌ها، کیف پول‌ها، کارت بانکی)
          </p>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              {pollingOn ? <Play className="size-3 text-emerald-400" /> : <Pause className="size-3" />} Polling
            </span>
            <Switch checked={pollingOn} onCheckedChange={setPollingOn} aria-label="روشن/خاموش کردن polling ربات" />
            <Button size="sm" variant="outline" className="h-7 gap-1 border-white/15 px-2 text-[10px]" onClick={() => void runSelfTest()} disabled={testing}>
              {testing ? <Loader2 className="size-3 animate-spin" /> : <Zap className="size-3" />} خودآزمایی
            </Button>
          </div>
        </div>

        {cfg && (
          <p className="mb-3 text-[10px] text-muted-foreground">
            توکن فعلی: <span className="font-mono text-foreground/80" dir="ltr">{cfg.botTokenMasked || "— ثبت نشده —"}</span>
            {" · "}کانال عمومی: <span dir="ltr">{cfg.publicChannelUsername}</span>
            {" · "}VIP: <span dir="ltr">{cfg.vipChannelId}</span>
            {" · "}نرخ تتر: <span dir="ltr">{faNum(cfg.usdtToTomanRate, 0)}</span> تومان
          </p>
        )}

        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {(
            [
              { key: "botToken", label: "توکن بات اشتراک (BotFather)", ph: "123456:ABC-DEF… — فقط برای تغییر پر کنید", ltr: true, pwd: true },
              { key: "botUsername", label: "یوزرنیم بات", ph: "aineobet_bot", ltr: true },
              { key: "publicChannelUsername", label: "کانال عمومی (قفل عضویت)", ph: "@aineobet", ltr: true },
              { key: "vipChannelId", label: "شناسه کانال خصوصی VIP", ph: "-1001234567890", ltr: true },
              { key: "adminUserId", label: "آیدی عددی ادمین فیش‌ها", ph: "123456789", ltr: true, num: true },
              { key: "walletUsdtTrc20", label: "کیف پول USDT — TRC20 (ترون)", ph: "T…", ltr: true },
              { key: "walletUsdtPolygon", label: "کیف پول USDT — Polygon", ph: "0x…", ltr: true },
              { key: "bankName", label: "نام بانک کارت مقصد", ph: "بانک ملی / ملت / سامان", ltr: false },
              { key: "bankCardNumber", label: "شماره کارت کارت‌به‌کارت", ph: "6037-9975-XXXX-XXXX", ltr: true },
              { key: "bankCardHolder", label: "نام صاحب حساب", ph: "نام صاحب حساب", ltr: false },
              { key: "usdtToTomanRate", label: "نرخ هر تتر (تومان)", ph: "65000", ltr: true, num: true },
            ] as const
          ).map((f) => (
            <div key={f.key} className="space-y-1">
              <Label className="text-[9px] text-muted-foreground">{f.label}</Label>
              <Input
                dir={f.ltr ? "ltr" : "rtl"}
                type={f.pwd ? "password" : "text"}
                inputMode={f.num ? "numeric" : undefined}
                autoComplete="off"
                placeholder={f.ph}
                value={form[f.key]}
                onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                className="h-8 border-white/10 bg-black/30 text-[11px]"
              />
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <p className="text-[9px] leading-4 text-muted-foreground">
            فیلدهای خالی نادیده گرفته می‌شوند (مقادیر قبلی حفزار می‌شوند). با ثبت توکن معتبر، polling بلافاصله آغاز و ربات @aineobet_bot زنده می‌شود؛ تایید فیش هم از تلگرام ادمین و هم از همین پنل کار می‌کند.
          </p>
          <Button size="sm" className="h-8 shrink-0 gap-1 bg-violet-600 px-4 text-[11px] font-bold hover:bg-violet-500" onClick={() => void saveConfig()} disabled={saving}>
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />} ذخیره پیکربندی
          </Button>
        </div>
      </div>
    </section>
  );
}
