// ─────────────────────────────────────────────────────────────────────────────
// 📡 NeoBet Broadcast Daemon — v19.0 (پورت 3011)
//
// دستور کارفرما: «موتور همچنان وابسته به مرورگر است و گزارشات زنده پست‌ها و
// کارت‌ها به تلگرام کانال عمومی و VIP ارسال نمی‌شود»
//
// ریشه مشکل: خط لوله پخش فقط در پروسه Next.js اجرا می‌شد؛ هر بار که dev-server
// برای کامپایل/ری‌استارت می‌رفت (یا مرورگر باز نبود)، اسلات‌های پخش گم می‌شدند.
// راه‌حل مهندسی v19.0 — دیمن مستقل همیشه‌گرم:
//   · پروسه bun مستقل از Next.js — با `bun --hot` و ری‌استارت خودکار guardian
//   · همان خط لوله مشترک broadcast-cycle.ts (کارت‌ها + نتایج + خبر + آکادمی +
//     بریفینگ VIP + کارت رایگان + بنر ساعتی + برآیندها + گزارش هفتگی)
//   · ضد تکرار مطلق: ادعای اتمی INSERT-first روی TelegramOutbox.dedupeKey —
//     اگر زمان‌بند Next.js همزمان هم اجرا باشد، فقط یک پردازه هر پست را می‌فرستد
//   · heartbeat: /api/health روی 3011 — نگهبان instrumentation این را پینگ می‌کند
// اجرا: bun run dev (bun --hot index.ts)
// ─────────────────────────────────────────────────────────────────────────────

const PORT = 3011;
const CYCLE_INTERVAL_MS = 90_000;

interface DaemonState {
  running: boolean;
  startedAt: string;
  lastCycleAt: string | null;
  cycles: number;
  lastError: string | null;
  busy: boolean;
}

const state: DaemonState = {
  running: false,
  startedAt: new Date().toISOString(),
  lastCycleAt: null,
  cycles: 0,
  lastError: null,
  busy: false,
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── امن‌سازی hot-reload: حلقه نسل‌دار — هر reload نسل قبلی را متوقف می‌کند ──
type LoopHandle = { stop: boolean };
const g = globalThis as typeof globalThis & { __neobetBroadcastLoop?: LoopHandle };
if (g.__neobetBroadcastLoop) g.__neobetBroadcastLoop.stop = true;
const loopHandle: LoopHandle = { stop: false };
g.__neobetBroadcastLoop = loopHandle;

async function runCycle(): Promise<void> {
  if (state.busy) return;
  state.busy = true;
  try {
    const { runBroadcastCycle } = await import("../../src/lib/server/broadcast-cycle");
    const res = await runBroadcastCycle();
    state.cycles += 1;
    state.lastCycleAt = new Date().toISOString();
    state.lastError = null;
    const active = [res.gift.startsWith("gift") || res.gift.startsWith("fortress") ? "gift" : null, res.ad === "ad-sent" ? "ad" : null, res.brief.startsWith("brief-sent") ? "brief" : null, res.news.some((n) => n.startsWith("news-sent")) ? "news" : null, res.edu.some((n) => n.startsWith("lesson-sent")) ? "edu" : null, res.digest ? "digest" : null, res.pnl ? "pnl" : null, res.dispatched ? `cards:${res.cards}+results:${res.results}` : null].filter(Boolean);
    console.log(`[daemon] cycle #${state.cycles} done${active.length ? " — sent: " + active.join(", ") : " — nothing due (dedupe claims held)"}`);
  } catch (err) {
    state.lastError = String(err);
    console.warn("[daemon] cycle failed:", err instanceof Error ? err.message : err);
  } finally {
    state.busy = false;
  }
}

async function daemonLoop(): Promise<void> {
  // نخستین پاس با تأخیر کوتاه — اجازه بوت DB/شبکه
  await sleep(20_000);
  for (;;) {
    if (loopHandle.stop) {
      console.log("[daemon] loop generation ended (hot-reload replaced it).");
      return;
    }
    await runCycle();
    await sleep(CYCLE_INTERVAL_MS);
  }
}

// ─── HTTP سلامت — نگهبان instrumentation این endpoint را پینگ می‌کند ─────────
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

Bun.serve({
  port: PORT,
  async fetch(req): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (req.method === "GET" && (url.pathname === "/health" || url.pathname === "/api/health")) {
      return new Response(
        JSON.stringify({
          success: true,
          service: "neobet-broadcast-daemon",
          version: "19.0.0",
          state,
          time: new Date().toISOString(),
        }),
        { status: 200, headers: { "Content-Type": "application/json; charset=utf-8", ...CORS } }
      );
    }
    if (req.method === "POST" && url.pathname === "/api/run-cycle") {
      void runCycle();
      return new Response(JSON.stringify({ success: true, triggered: true }), {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8", ...CORS },
      });
    }
    return new Response(JSON.stringify({ success: false, error: "not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json; charset=utf-8", ...CORS },
    });
  },
});

console.log(`📡 NeoBet Broadcast Daemon v19.0 listening on http://localhost:${PORT} — always-warm, browser-independent, atomic dedupe`);
state.running = true;
void daemonLoop();
