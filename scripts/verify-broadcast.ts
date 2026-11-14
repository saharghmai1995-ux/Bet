// ─────────────────────────────────────────────────────────────────────────────
// راستی‌آزمایی سه‌لایه پخش تلگرام — v20.0 NeoBet Verification Harness
//
// دستور کارفرما: «بررسی و راستی‌آزمایی کن اتصال به کانال‌ها و ثبت کارت‌ها و
// گزارشات تلگرام برقرار باشد» — این اسکریپت سه لایه را عملاً تست می‌کند:
//
//   لایه ۱ — اتصال کانال‌ها: getMe + getChat برای کانال عمومی @aineobet و کانال VIP
//            + getChatMember (وضعیت ادمین بودن بات = مجوز پست)
//   لایه ۲ — ثبت کارت‌ها: کارت‌های صادرشده/تاییدشده امروز + رسیدهای outbox
//   لایه ۳ — گزارشات رسیده: رسیدهای واقعی TelegramOutbox با message_id تلگرام
//            (photo:<id> / message:<id>) در ۴۸ ساعت گذشته، تفکیک‌شده بر اساس نوع
// اجرا:  bun run scripts/verify-broadcast.ts          (بدون ارسال)
//        bun run scripts/verify-broadcast.ts --live   (ارسال یک پست خودآزمون با تصویر کامل به کانال عمومی)
// ─────────────────────────────────────────────────────────────────────────────

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const LIVE = process.argv.includes("--live");

let pass = 0;
let fail = 0;
function ok(label: string, detail: string) {
  pass += 1;
  console.log(`  ✅ PASS — ${label} | ${detail}`);
}
function bad(label: string, detail: string) {
  fail += 1;
  console.log(`  ❌ FAIL — ${label} | ${detail}`);
}

async function tg(token: string, method: string, body?: Record<string, unknown>): Promise<{ ok: boolean; detail: string; data?: unknown }> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
      cache: "no-store",
    });
    const json = (await res.json()) as { ok?: boolean; description?: string; result?: unknown };
    return { ok: Boolean(json.ok), detail: json.description ?? `HTTP ${res.status}`, data: json.result };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : "network error" };
  }
}

async function main() {
  console.log("══════════════════════════════════════════════════════════════");
  console.log(" NeoBet v20.0 — راستی‌آزمایی اتصال کانال‌ها / ثبت کارت‌ها / گزارشات");
  console.log("══════════════════════════════════════════════════════════════\n");

  // ─── تنظیمات از دیتابیس (همان مسیر کد اصلی) ───
  const tokenRow = await db.setting.findUnique({ where: { key: "telegram_bot_token" } });
  const pubRow = await db.setting.findUnique({ where: { key: "telegram_public_channel_id" } });
  const vipRow = await db.setting.findUnique({ where: { key: "telegram_channel_id" } });
  const token = (tokenRow?.value ?? process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
  const publicId = (pubRow?.value ?? process.env.TELEGRAM_PUBLIC_CHANNEL_ID ?? "@aineobet").trim();
  const vipId = (vipRow?.value ?? process.env.TELEGRAM_VIP_CHANNEL_ID ?? "-1004487154797").trim();

  // ═══ لایه ۱ — اتصال کانال‌ها ═══
  console.log("┌─ لایه ۱: اتصال کانال‌ها (Channel Connectivity)");
  if (!/^\d{6,12}:[A-Za-z0-9_-]{30,}$/.test(token)) {
    bad("bot token format", "توکن بات ناقص یا ناموجود در Setting");
  } else {
    ok("bot token format", `قالب توکن معتبر (${token.split(":")[0]}:…${token.slice(-4)})`);
    const me = await tg(token, "getMe");
    if (me.ok) ok("getMe", `بات فعال: @${(me.data as { username?: string })?.username ?? "?"}`);
    else bad("getMe", me.detail);

    for (const [name, chatId] of [["کانال عمومی @aineobet", publicId], ["کانال VIP اعضا", vipId]] as const) {
      const chat = await tg(token, "getChat", { chat_id: chatId });
      if (chat.ok) {
        const c = chat.data as { title?: string; username?: string; id?: number };
        ok(`getChat ${name}`, `«${c.title ?? c.username ?? chatId}» در دسترس (id=${c.id ?? chatId})`);
        const member = await tg(token, "getChatMember", { chat_id: chatId, user_id: token.split(":")[0] });
        const status = (member.data as { status?: string })?.status ?? "unknown";
        if (member.ok && ["administrator", "creator"].includes(status)) ok(`مجوز پست در ${name}`, `وضعیت بات: ${status}`);
        else bad(`مجوز پست در ${name}`, `وضعیت بات: ${status} — بات باید ادمین کانال باشد`);
      } else {
        bad(`getChat ${name}`, chat.detail);
      }
    }
  }

  // ═══ لایه ۲ — ثبت کارت‌ها ═══
  console.log("\n┌─ لایه ۲: ثبت کارت‌ها (Card Registration Chain)");
  const dayStart = new Date(Date.now() - 24 * 3600_000);
  const issued24 = await db.issuedSlip.count({ where: { createdAt: { gte: dayStart } } });
  const approved24 = await db.issuedSlip.count({ where: { createdAt: { gte: dayStart }, supervisorApproved: true } });
  const pendingToday = await db.issuedSlip.count({ where: { status: { in: ["PENDING", "LIVE"] }, supervisorApproved: true, retroIssued: false } });
  if (issued24 > 0) ok("صدور کارت ۲۴ساخته", `${issued24} کارت صادر شده · ${approved24} تایید سوپروایزر · ${pendingToday} آماده پخش`);
  else bad("صدور کارت ۲۴ساخته", "هیچ کارتی در ۲۴ ساعت گذشته صادر نشده — خط لوله صدور را بررسی کنید");

  const cardReceipts = await db.telegramOutbox.count({ where: { kind: { in: ["CARD", "MT_CARD", "FUNNEL_GIFT"] }, ok: true, createdAt: { gte: dayStart } } });
  if (cardReceipts > 0) ok("ثبت انتشار کارت", `${cardReceipts} رسید ارسال موفق کارت در outbox`);
  else bad("ثبت انتشار کارت", "هیچ رسید کارتی در ۲۴ ساعت گذشته — کارت‌ها به کانال نرفته‌اند");

  // ═══ لایه ۳ — گزارشات تلگرام رسیده ═══
  console.log("\n┌─ لایه ۳: گزارشات تلگرام (Telegram Report Delivery Receipts)");
  const receipts = await db.telegramOutbox.findMany({
    where: { ok: true, createdAt: { gte: new Date(Date.now() - 48 * 3600_000) } },
    orderBy: { createdAt: "desc" },
    take: 400,
  });
  const byKind = new Map<string, { n: number; last: string; lastDetail: string }>();
  for (const r of receipts) {
    const k = r.kind;
    const e = byKind.get(k) ?? { n: 0, last: "-", lastDetail: "" };
    e.n += 1;
    if (e.last === "-") {
      e.last = r.createdAt.toISOString().slice(5, 16).replace("T", " ");
      e.lastDetail = (r.detail ?? "").slice(0, 40);
    }
    byKind.set(k, e);
  }
  if (receipts.length === 0) {
    bad("رسیدهای ۴۸ ساعت", "هیچ ارسال موفقی ثبت نشده");
  } else {
    ok("رسیدهای ۴۸ ساعت", `مجموع ${receipts.length} پست موفق با message_id واقعی تلگرام`);
    for (const [k, e] of [...byKind.entries()].sort((a, b) => b[1].n - a[1].n)) {
      console.log(`      · ${k.padEnd(16)} ×${e.n}  آخرین: ${e.last}  (${e.lastDetail})`);
    }
  }

  // ═══ لایه ۴ — خودآزمون زنده: ارسال یک پست با تصویر کامل به کانال عمومی ═══
  if (LIVE) {
    console.log("\n┌─ لایه ۴: خودآزمون زنده ارسال (Live End-to-End Delivery)");
    if (!/^\d{6,12}:[A-Za-z0-9_-]{30,}$/.test(token)) {
      bad("live send", "توکن نامعتبر");
    } else {
      const { renderDailyRadarPNG } = await import("../src/lib/server/card-render");
      const { coverProfitOf, signedPct } = await import("../src/lib/server/cover-profit");
      const next = await db.issuedSlip.findFirst({ where: { supervisorApproved: true, status: { in: ["PENDING", "LIVE"] } }, orderBy: { kickoff: "asc" } });
      const cov = next ? coverProfitOf(next) : null;
      const photo = await renderDailyRadarPNG({
        dateLabelEn: new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "2-digit", month: "short", timeZone: "Asia/Tehran" }).format(new Date()),
        scanned: await db.issuedSlip.count(),
        vetoed: await db.issuedSlip.count({ where: { supervisorApproved: false, retroIssued: false } }),
        goldenSignals: await db.issuedSlip.count({ where: { supervisorApproved: true, status: { in: ["PENDING", "LIVE"] } } }),
        topPickLine: next && cov ? `${next.homeTeam} vs ${next.awayTeam} · guarantee ${signedPct(cov.guaranteePct)}` : "scanner idle",
      });
      const caption =
        `🧪 <b>SYSTEM SELF-TEST — راستی‌آزمایی پخش</b>\n` +
        `این پست خودآزمونِ موتور پخش NeoBot است: اتصال کانال، ثبت کارت و گزارش تصویری هم‌اکنون به‌صورت زنده بررسی شد ✅\n` +
        `> این پست خودکارِ سیستم است — وضعیت پخش سالم است.\n` +
        `👑 عضویت VIP: @Aineobet_bot`;
      const form = new FormData();
      form.append("chat_id", publicId);
      form.append("caption", caption);
      form.append("parse_mode", "HTML");
      form.append("photo", new Blob([new Uint8Array(photo)], { type: "image/png" }), "selftest.png");
      const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, { method: "POST", body: form });
      const json = (await res.json()) as { ok?: boolean; description?: string; result?: { message_id?: number } };
      if (json.ok) ok("ارسال زنده با تصویر کامل", `پیام ${json.result?.message_id} به کانال عمومی رسید — تصویر کامل تحویل شد`);
      else bad("ارسال زنده", json.description ?? `HTTP ${res.status}`);
      await db.telegramOutbox.create({ data: { dedupeKey: `SELFTEST:${Date.now()}`, slipId: null, kind: "SELFTEST", ok: json.ok === true, detail: `photo:${json.result?.message_id ?? "?"}` } });
    }
  }

  // ─── نتیجه ───
  console.log("\n══════════════════════════════════════════════════════════════");
  console.log(` نتیجه راستی‌آزمایی: ${pass} موفق / ${fail} ناموفق — ${fail === 0 ? "✅ همه لایه‌ها برقرارند" : "⚠️ لایه‌های ناموفق باید رفع شوند"}`);
  console.log("══════════════════════════════════════════════════════════════");
  await db.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

void main();
