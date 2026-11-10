// ─────────────────────────────────────────────────────────────────────────────
// 🚀 @aineobet VIP Subscription Bot — سرویس مستقل bun روی پورت 3010
//   • حلقه getUpdates (long polling) با ری‌لود داغ پیکربندی (افزودن توکن بدون ری‌استارت)
//   • سوییپ ساعتی اعضای منقضی VIP
//   • REST API برای پنل وب (پروکسی از طریق Next.js: /api/vip-bot/...)
// اجرا: bun run dev  (bun --hot index.ts)
// ─────────────────────────────────────────────────────────────────────────────

import { BotConfig, defaultConfig, isTokenConfigured, loadConfig, maskToken, saveConfig } from "./config";
import {
  computeStats,
  openDatabase,
  type CardReceipt,
  type VipPayment,
  type VipUser,
} from "./db";
import { handleUpdate, processAdminReceiptDecision, runSelfTest, sweepExpiredVipMembers } from "./bot";
import { getTelegramFilePath, telegramFileUrl, tgApiCall } from "./telegram";

const PORT = 3010;
const DB_PATH = process.env.NEOBET_BOT_DB ?? "data/aineobet_vip_members.db";

const db = openDatabase(DB_PATH);
let cfg: BotConfig = loadConfig(db);

interface PollingState {
  running: boolean;
  startedAt: string | null;
  lastPollAt: string | null;
  lastUpdateAt: string | null;
  processedUpdates: number;
  lastError: string | null;
}
const pollState: PollingState = {
  running: false,
  startedAt: null,
  lastPollAt: null,
  lastUpdateAt: null,
  processedUpdates: 0,
  lastError: null,
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── امن‌سازی hot-reload: حلقه نسل‌دار — هر reload نسل قبلی را متوقف می‌کند ──
type LoopHandle = { stop: boolean };
const g = globalThis as typeof globalThis & { __vipBotLoop?: LoopHandle };
if (g.__vipBotLoop) g.__vipBotLoop.stop = true;
const loopHandle: LoopHandle = { stop: false };
g.__vipBotLoop = loopHandle;

// ─── منوی رسمی BotFather — هم‌گام با هندلرهای دستور در bot.ts ────────────
async function registerBotMenu(c: BotConfig): Promise<void> {
  await tgApiCall(c, "setMyCommands", {
    commands: [
      { command: "start", description: "🏁 شروع / منوی اصلی NeoBet" },
      { command: "plans", description: "💎 پلن‌های اشتراک کانال VIP" },
      { command: "free", description: "🎁 سیگنال رایگان امروز + تست ریسک" },
      { command: "status", description: "👤 وضعیت اشتراک من" },
      { command: "referral", description: "🚀 دعوت دوستان — VIP رایگان" },
      { command: "pay", description: "💳 روش‌های پرداخت (تتر / کارت‌به‌کارت)" },
      { command: "lang", description: "🌐 تغییر زبان / Switch Language" },
    ],
  });
  console.log("[MENU] BotFather commands registered (7)");
}

// ─── حلقه polling تلگرام (معادل run_polling_loop پایتون + ری‌لود داغ کانفیگ) ──

async function pollingLoop(): Promise<void> {
  let offset = 0;
  let lastSweep = Date.now();
  let tokenInUse = "";

  for (;;) {
    if (loopHandle.stop) {
      console.log("[POLL] loop generation ended (hot-reload replaced it).");
      return;
    }
    cfg = loadConfig(db); // تغییرات پنل وب (توکن / توقف) بدون ری‌استارت اعمال می‌شود
    if (!isTokenConfigured(cfg) || !cfg.pollingEnabled) {
      if (pollState.running) {
        console.log("[POLL] stopped — token cleared or polling disabled.");
      }
      pollState.running = false;
      await sleep(4_000);
      continue;
    }
    if (!pollState.running || tokenInUse !== cfg.botToken) {
      pollState.running = true;
      pollState.startedAt = new Date().toISOString();
      offset = 0; // توکن جدید → خواندن از صف تازه
      tokenInUse = cfg.botToken;
      console.log(`🤖 Starting @${cfg.botUsername} polling (USDT + Iranian Card-to-Card Gateway) on ${DB_PATH}...`);
      void registerBotMenu(cfg);
    }

    try {
      const res = await tgApiCall<{ update_id: number }[]>(
        cfg,
        "getUpdates",
        {
          offset,
          timeout: 25,
          allowed_updates: ["message", "edited_message", "channel_post", "edited_channel_post", "callback_query", "my_chat_member"],
        },
        40_000 // long-poll 25s تلگرام + حاشیه — باید بزرگ‌تر از timeout تلگرام باشد
      );
      pollState.lastPollAt = new Date().toISOString();

      // سوییپ ساعتی اعضای منقضی (معادل پایتون)
      if (Date.now() - lastSweep > 3_600_000) {
        const removed = await sweepExpiredVipMembers(db, cfg);
        if (removed > 0) console.log(`[SWEEP] Removed ${removed} expired VIP members.`);
        lastSweep = Date.now();
      }

      if (res && res.ok && Array.isArray(res.result)) {
        for (const upd of res.result as unknown as { update_id: number; [k: string]: unknown }[]) {
          offset = upd.update_id + 1;
          pollState.processedUpdates += 1;
          pollState.lastUpdateAt = new Date().toISOString();
          try {
            await handleUpdate(db, cfg, upd as never);
          } catch (exc) {
            pollState.lastError = String(exc);
            console.error(`[ERROR] Handling update failed: ${exc}`);
          }
        }
      } else if (res && !res.ok) {
        // خطای API (مثلاً توکن نامعتبر یا 409 Conflict) — گزارش + مکث
        pollState.lastError = res.description ?? "unknown Telegram API error";
        console.warn(`[POLL] API error: ${pollState.lastError}`);
        await sleep(5_000);
      }
    } catch (exc) {
      pollState.lastError = String(exc);
      await sleep(3_000);
    }
  }
}

// ─── ابزارهای پاسخ HTTP ──────────────────────────────────────────────────────

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS },
  });
}

function ok(data: Record<string, unknown>): Response {
  return json({ success: true, ...data });
}

function fail(error: string, status = 500): Response {
  return json({ success: false, error }, status);
}

function publicConfig(c: BotConfig) {
  return {
    botTokenMasked: maskToken(c.botToken),
    tokenConfigured: isTokenConfigured(c),
    botUsername: c.botUsername,
    publicChannelUsername: c.publicChannelUsername,
    vipChannelId: c.vipChannelId,
    adminUserId: c.adminUserId,
    walletUsdtTrc20: c.walletUsdtTrc20,
    walletUsdtPolygon: c.walletUsdtPolygon,
    bankCardNumber: c.bankCardNumber,
    bankCardHolder: c.bankCardHolder,
    bankName: c.bankName,
    usdtToTomanRate: c.usdtToTomanRate,
    pollingEnabled: c.pollingEnabled,
  };
}

async function readJsonBody(req: Request): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function intParam(url: URL, key: string, fallback: number): number {
  const v = parseInt(url.searchParams.get(key) ?? "", 10);
  return Number.isFinite(v) && v > 0 ? Math.min(v, 500) : fallback;
}

// ─── سرور HTTP — REST API پنل وب ────────────────────────────────────────────

Bun.serve({
  port: PORT,
  async fetch(req): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;

    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    try {
      // ── سلامت و وضعیت ──
      if (req.method === "GET" && (path === "/health" || path === "/api/health")) {
        return ok({
          service: "aineobet-vip-subscription-bot",
          dbPath: DB_PATH,
          polling: pollState,
          config: publicConfig(cfg),
          stats: computeStats(db),
          time: new Date().toISOString(),
        });
      }

      // ── آمار کلی ──
      if (req.method === "GET" && path === "/api/stats") {
        return ok({ stats: computeStats(db), polling: pollState, config: publicConfig(cfg) });
      }

      // ── پیکربندی (خواندن ماسک‌شده / ذخیره) ──
      if (req.method === "GET" && path === "/api/config") {
        return ok({ config: publicConfig(cfg), defaults: { botUsername: defaultConfig().botUsername } });
      }
      if (req.method === "POST" && path === "/api/config") {
        const body = await readJsonBody(req);
        const patch: Record<string, unknown> = {};
        const strKeys = [
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
        for (const k of strKeys) {
          const v = body[k];
          if (typeof v === "string" && v.trim() !== "") patch[k] = v.trim();
        }
        // فیلدهای خالی اجازه پاک‌کردن توکن را ندارند — فقط مقدار واقعی ذخیره می‌شود
        if (typeof body.adminUserId === "number" || typeof body.adminUserId === "string") {
          const n = Number(body.adminUserId);
          if (Number.isFinite(n) && n > 0) patch.adminUserId = n;
        }
        if (typeof body.usdtToTomanRate === "number" || typeof body.usdtToTomanRate === "string") {
          const n = Number(body.usdtToTomanRate);
          if (Number.isFinite(n) && n > 0) patch.usdtToTomanRate = n;
        }
        if (typeof body.pollingEnabled === "boolean") patch.pollingEnabled = body.pollingEnabled;
        cfg = saveConfig(db, patch as Partial<BotConfig>);
        console.log("[CONFIG] updated via web panel");
        return ok({ config: publicConfig(cfg) });
      }

      // ── اعضا ──
      if (req.method === "GET" && path === "/api/members") {
        const limit = intParam(url, "limit", 100);
        const rows = db
          .query("SELECT * FROM users ORDER BY joined_at DESC LIMIT ?")
          .all(limit) as VipUser[];
        return ok({ members: rows });
      }

      // ── پرداخت‌های تتر ──
      if (req.method === "GET" && path === "/api/payments") {
        const limit = intParam(url, "limit", 50);
        const rows = db
          .query("SELECT * FROM payments ORDER BY verified_at DESC LIMIT ?")
          .all(limit) as VipPayment[];
        return ok({ payments: rows });
      }

      // ── فیش‌های کارت‌به‌کارت ──
      if (req.method === "GET" && path === "/api/receipts") {
        const limit = intParam(url, "limit", 100);
        const status = url.searchParams.get("status");
        const rows = (
          status
            ? db.query("SELECT * FROM card_receipts WHERE status = ? ORDER BY submitted_at DESC LIMIT ?").all(status, limit)
            : db.query("SELECT * FROM card_receipts ORDER BY submitted_at DESC LIMIT ?").all(limit)
        ) as CardReceipt[];
        return ok({ receipts: rows });
      }

      // ── عکس فیش (پروکسی امن فایل تلگرام برای پنل ادمین) ──
      const photoMatch = path.match(/^\/api\/receipts\/(\d+)\/photo$/);
      if (req.method === "GET" && photoMatch) {
        const rec = db.query("SELECT * FROM card_receipts WHERE id = ?").get(Number(photoMatch[1])) as CardReceipt | null;
        if (!rec || rec.receipt_type !== "PHOTO") return fail("photo receipt not found", 404);
        const filePath = await getTelegramFilePath(cfg, rec.receipt_content);
        if (!filePath) return fail("cannot resolve telegram file (bot token missing or file expired)", 404);
        const upstream = await fetch(telegramFileUrl(cfg, filePath), { signal: AbortSignal.timeout(20_000) });
        if (!upstream.ok) return fail("telegram file download failed", 502);
        return new Response(upstream.body, {
          headers: {
            "Content-Type": upstream.headers.get("content-type") ?? "image/jpeg",
            "Cache-Control": "no-store",
            ...CORS,
          },
        });
      }

      // ── تصمیم ادمین روی فیش (همان دکمه‌های تلگرام — از پنل وب) ──
      if (req.method === "POST" && path === "/api/receipts/decide") {
        const body = await readJsonBody(req);
        const id = Number(body.id);
        const approve = body.approve === true || body.approve === "approve";
        if (!Number.isFinite(id) || id <= 0) return fail("invalid receipt id", 400);
        const result = await processAdminReceiptDecision(db, cfg, id, approve);
        return ok({ result });
      }

      // ── خودآزمایی چرخه کامل کارت‌به‌کارت (معادل self-test پایتون) ──
      if (req.method === "POST" && path === "/api/selftest") {
        const t = await runSelfTest();
        return ok({ selftest: t });
      }

      return fail(`not found: ${req.method} ${path}`, 404);
    } catch (exc) {
      console.error(`[HTTP] ${req.method} ${path} failed:`, exc);
      return fail(String(exc));
    }
  },
});

console.log(`✅ @aineobet VIP Subscription Bot service listening on http://localhost:${PORT}`);
void pollingLoop();
