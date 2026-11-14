// ─────────────────────────────────────────────────────────────────────────────
// NeoBet Dev-Server Keep-Alive Guardian (v20.1) — پایدارساز داشبورد
//
// دستور کارفرما: «داشبورد نمایش داده نمی‌شود، پایدارش کن»
// ریشه حادثه: next-server با RSS ۲GB توسط OOM-killer کانتینر کشته شد و
// داشبورد تا ری‌استارت دستی از کار افتاد.
//
// نگهبان مستقل از Next.js (روی الگوی اثبات‌شده‌ی سرویس‌های همیشه‌گرم):
//   · هر ۶۰ ثانیه :3000 را ping می‌کند
//   · اگر پروسه next وجود ندارد و سرور خاموش است → bun run dev را
//     detached + unref دوباره بالا می‌آورد (reparent به PID 1 — اثبات‌شده)
//   · اگر پروسه next هست ولی آماده نیست (کامپایل) → فقط صبر؛ ضد نمونه تکراری
//   · اگر RSS از ۱۵۰۰MB گذشت → ری‌استارت پیشگیرانه پیش از OOM-kill (۲GB)
//   · debounce ۹۰ ثانیه بین ری‌استارت‌ها — ضد حلقه ری‌استارت
// اجرا:  bun run scripts/start-background.mjs   (این اسکریپت را detached بالا می‌آورد)
// توقف:  pkill -f devserver-keepalive
// ─────────────────────────────────────────────────────────────────────────────

import { exec } from "node:child_process";
import { execSync } from "node:child_process";
import http from "node:http";

const HEALTH_URL = "http://localhost:3000/";
const CHECK_MS = 60_000;
const RESTART_DEBOUNCE_MS = 90_000;
const PROJECT_DIR = "/home/z/my-project";
const RSS_LIMIT_KB = 1_536_000; // ۱۵۰۰MB — ری‌استارت پیشگیرانه پیش از OOM (۲GB)
const RSS_STREAK = 3; // سه بررسی متوالی بالای سقف = رشد واقعی، نه اسپایک کامپایل
let rssBreachStreak = 0;
let restarting = false;
let lastRestartAt = 0;

function ping() {
  return new Promise((resolve) => {
    const req = http.get(HEALTH_URL, { timeout: 25_000 }, (res) => {
      res.resume();
      resolve(res.statusCode !== undefined && res.statusCode < 500);
    });
    req.on("timeout", () => { req.destroy(); resolve(false); });
    req.on("error", () => resolve(false));
  });
}

function nextServerRss() {
  // بزرگ‌ترین پروسه next-server / next dev (KB) — یا null
  try {
    const out = execSync(
      `ps -eo pid,rss,args 2>/dev/null | grep -E "next-server|next dev" | grep -v grep | sort -k2 -n -r | head -1`,
      { encoding: "utf8", timeout: 10_000 }
    ).trim();
    if (!out) return null;
    const [pid, rss] = out.split(/\s+/);
    return { pid: Number(pid), rssKb: Number(rss) };
  } catch {
    return null;
  }
}

function spawnDevServer() {
  // الگوی اثبات‌شده: spawn detached + unref — پروسه به PID 1 reparent می‌شود و
  // از چرخه‌ی حیات هر فراخوانی/شل مستقل می‌ماند (همان الگوی سرویس‌های همیشه‌گرم)
  exec(
    `cd "${PROJECT_DIR}" && bun run scripts/detach-dev.mjs`,
    { timeout: 15_000 },
    (err) => {
      if (err) console.warn(`[dev-keepalive] detach spawn error: ${err.message}`);
    }
  );
}

async function restart(reason) {
  if (restarting) return;
  if (Date.now() - lastRestartAt < RESTART_DEBOUNCE_MS) return;
  restarting = true;
  try {
    console.log(`[dev-keepalive] ${new Date().toISOString()} — ${reason} → detached restart (always-warm guarantee)`);
    spawnDevServer();
    lastRestartAt = Date.now();
    // تا ۱۲۰ ثانیه صبر — کامپایل اول داشبورد سنگین است
    for (let i = 0; i < 24; i++) {
      await new Promise((r) => setTimeout(r, 5_000));
      if (await ping()) {
        console.log(`[dev-keepalive] dev server is UP again after ${((i + 1) * 5).toFixed(0)}s ✅`);
        return;
      }
    }
    console.log("[dev-keepalive] server did not answer within 120s ⚠️ — will re-check next cycle");
  } finally {
    restarting = false;
  }
}

async function check() {
  const alive = await ping();
  if (alive) {
    const proc = nextServerRss();
    if (proc && proc.rssKb > RSS_LIMIT_KB) {
      rssBreachStreak += 1;
      // v20.1 — فقط با ۳ بررسی متوالی بالای سقف بازیافت می‌کنیم:
      // اسپایک‌های گذرای کامپایل داشبورد (رندر سنگین اولین بازدید) عادی‌اند
      if (rssBreachStreak >= RSS_STREAK) {
        console.log(`[dev-keepalive] next-server (pid ${proc.pid}) RSS=${Math.round(proc.rssKb / 1024)}MB > ${Math.round(RSS_LIMIT_KB / 1024)}MB for ${rssBreachStreak} checks — proactive recycle before OOM-kill`);
        rssBreachStreak = 0;
        try { execSync(`kill ${proc.pid}`, { timeout: 5_000 }); } catch {}
        await new Promise((r) => setTimeout(r, 8_000));
        // اگر next خودش worker را دوباره بالا آورد، دست نمی‌زنیم
        if (!(await ping()) && !nextServerRss()) await restart("server down after recycle");
        return;
      }
      console.log(`[dev-keepalive] RSS breach ${rssBreachStreak}/${RSS_STREAK} (${Math.round(proc.rssKb / 1024)}MB) — waiting for confirmation`);
      return;
    }
    rssBreachStreak = 0;
    return;
  }
  // سرور پاسخ نمی‌دهد
  const proc = nextServerRss();
  if (proc) {
    console.log(`[dev-keepalive] :3000 not responding but next process exists (pid ${proc.pid}) — compiling, waiting…`);
    return;
  }
  await restart(":3000 down and no next process — restarting");
}

console.log("[dev-keepalive] v20.1 main dev-server guardian active — health check every 60s + RSS guard 1500MB (always-warm guarantee)");
setInterval(() => {
  check().catch((err) => console.warn("[dev-keepalive] check error:", err?.message ?? err));
}, CHECK_MS);
check().catch(() => {});
