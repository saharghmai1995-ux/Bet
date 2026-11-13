// ─────────────────────────────────────────────────────────────────────────────
// NeoBet Dev-Server Keep-Alive Guardian (v18.3)
// دستور کارفرما: «موتور و هسته سیستم نباید وابسته به مرورگر باشد و باید همیشه
// گرم بماند» — نگهبان مستقل از Next.js برای سرور اصلی (پورت 3000):
//   · هر ۶۰ ثانیه صفحه اصلی را ping می‌کند
//   · اگر سرور خاموش بود → bun run dev را detached دوباره بالا می‌آورد
//   · debounce ۹۰ ثانیه بین ری‌استارت‌ها — ضدِ حلقه ری‌استارت
// اجرا:  setsid nohup bun scripts/devserver-keepalive.mjs > devserver-keepalive.log 2>&1 &
// ─────────────────────────────────────────────────────────────────────────────

import { exec } from "node:child_process";
import http from "node:http";

const HEALTH_URL = "http://localhost:3000/";
const CHECK_MS = 60_000;
const RESTART_DEBOUNCE_MS = 90_000;
const PROJECT_DIR = "/home/z/my-project";
let restarting = false;
let lastRestartAt = 0;

function ping() {
  return new Promise((resolve) => {
    const req = http.get(HEALTH_URL, { timeout: 10_000 }, (res) => {
      res.resume();
      resolve(res.statusCode !== undefined && res.statusCode < 500);
    });
    req.on("timeout", () => { req.destroy(); resolve(false); });
    req.on("error", () => resolve(false));
  });
}

async function restart() {
  if (restarting) return;
  if (Date.now() - lastRestartAt < RESTART_DEBOUNCE_MS) return;
  restarting = true;
  try {
    console.log(`[dev-keepalive] ${new Date().toISOString()} — :3000 down → detached restart (always-warm guarantee)`);
    // setsid + detached shell — پروسه مستقل از نگهبان بالا می‌آید
    exec(`cd "${PROJECT_DIR}" && setsid nohup bun run dev >> dev.log 2>&1 < /dev/null &`, { timeout: 15_000 });
    lastRestartAt = Date.now();
    await new Promise((r) => setTimeout(r, 10_000));
    const alive = await ping();
    console.log(`[dev-keepalive] restart result: ${alive ? "ALIVE" : "still warming up — will re-check next cycle"}`);
  } finally {
    restarting = false;
  }
}

console.log("[dev-keepalive] main dev-server guardian active — health check every 60s (always-warm guarantee)");
setInterval(async () => {
  try {
    const alive = await ping();
    if (!alive) await restart();
  } catch (err) {
    console.warn("[dev-keepalive] check error:", err?.message ?? err);
  }
}, CHECK_MS);

setTimeout(async () => {
  if (!(await ping())) await restart();
}, 15_000);
