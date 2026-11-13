// ─────────────────────────────────────────────────────────────────────────────
// NeoBet VIP-Bot Keep-Alive Guardian (v18.2)
// دستور کارفرما: «موتور و هسته سیستم نباید وابسته به مرورگر باشد و باید
// همیشه گرم بماند» — این نگهبان پروسه‌ای مستقل از Next.js است:
//   · هر ۶۰ ثانیه /api/health سرویس ۳۰۱۰ را ping می‌کند
//   · اگر سرویس خاموش بود یا پاس نداد → bun run dev را دوباره بالا می‌آورد
//   · خودش هم nohup اجرا می‌شود و هرگز نمی‌میرد
// اجرا:  nohup bun scripts/vipbot-keepalive.mjs > vipbot-keepalive.log 2>&1 &
// ─────────────────────────────────────────────────────────────────────────────

import { exec } from "node:child_process";
import http from "node:http";

const HEALTH_URL = "http://localhost:3010/api/health";
const CHECK_MS = 60_000;
const SERVICE_DIR = "/home/z/my-project/mini-services/vip-bot";
let restarting = false;

function ping() {
  return new Promise((resolve) => {
    const req = http.get(HEALTH_URL, { timeout: 8000 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on("timeout", () => { req.destroy(); resolve(false); });
    req.on("error", () => resolve(false));
  });
}

async function restart() {
  if (restarting) return;
  restarting = true;
  try {
    console.log(`[keepalive] ${new Date().toISOString()} — vip-bot down → restarting`);
    exec(`cd "${SERVICE_DIR}" && nohup bun run dev >> vipbot.log 2>&1 &`, { timeout: 15_000 });
    await new Promise((r) => setTimeout(r, 6_000));
    const alive = await ping();
    console.log(`[keepalive] restart result: ${alive ? "ALIVE" : "still down (will retry next cycle)"}`);
  } finally {
    restarting = false;
  }
}

console.log("[keepalive] vip-bot guardian active — health check every 60s (always-warm guarantee)");
setInterval(async () => {
  try {
    const alive = await ping();
    if (!alive) await restart();
  } catch (err) {
    console.warn("[keepalive] check error:", err?.message ?? err);
  }
}, CHECK_MS);

// نخستین بررسی ۱۰ ثانیه بعد از بوت نگهبان
setTimeout(async () => {
  if (!(await ping())) await restart();
}, 10_000);
