// ─────────────────────────────────────────────────────────────────────────────
// NeoBet Background Services Bootstrap — v20.1
//
// ریشه مشکل «داشبورد نمایش داده نمی‌شود»: next-server با RSS ۲GB توسط
// OOM-killer کشته شد و هیچ نگهبانی آن را دوباره بالا نیاورد.
//
// این بوت‌استرپ سرویس‌های پس‌زمینه را با الگوی spawn-detached (reparent به PID 1)
// بالا می‌آورد تا از چرخه‌ی حیات هر فراخوانی ابزار مستقل باشند:
//   ۱) سرور dev Next.js (bun run dev → :3000) — اگر از قبل پاسخ می‌دهد، دست نمی‌زند
//   ۲) نگهبان dev-watchdog (ری‌استارت خودکار در مرگ + ری‌استارت پیشگیرانه قبل از OOM)
// اجرا:  bun run scripts/start-background.mjs
// ─────────────────────────────────────────────────────────────────────────────

import { spawn } from "node:child_process";
import { existsSync, openSync } from "node:fs";

const PROJECT_DIR = "/home/z/my-project";

function detach(name, cmd, args, cwd, logFile) {
  const out = openSync(logFile, "a");
  const child = spawn(cmd, args, {
    cwd,
    detached: true,
    stdio: ["ignore", out, out],
    env: { ...process.env },
  });
  child.unref();
  console.log(`[bootstrap] ${name} spawned (pid ${child.pid}) → log: ${logFile}`);
  return child.pid;
}

// ─── ۱) سرور dev — فقط وقتی :3000 پاسخ نمی‌دهد ───
async function httpOk() {
  try {
    const res = await fetch("http://localhost:3000/", { signal: AbortSignal.timeout(25_000) });
    return res.status < 500;
  } catch {
    return false;
  }
}

const alive = await httpOk();
if (alive) {
  console.log("[bootstrap] dev server already UP on :3000 — skip spawn");
} else {
  detach("dev-server", "bun", ["scripts/detach-dev.mjs"], PROJECT_DIR, `${PROJECT_DIR}/devserver-keepalive.log`);
}

// ─── ۲) نگهبان پایداری — فقط یک نمونه (lockfile) ───
const { execSync } = await import("node:child_process");
let watchdogRunning = false;
try {
  const pid = (execSync("cat /tmp/neobet-dev-watchdog.lock 2>/dev/null || true").toString() || "").trim();
  if (pid) {
    execSync(`kill -0 ${pid} 2>/dev/null`);
    watchdogRunning = true;
    console.log(`[bootstrap] watchdog already running (pid ${pid})`);
  }
} catch {
  watchdogRunning = false;
}
if (!watchdogRunning) {
  execSync("rm -f /tmp/neobet-dev-watchdog.lock");
  detach("devserver-keepalive", "bun", ["scripts/devserver-keepalive.mjs"], PROJECT_DIR, `${PROJECT_DIR}/devserver-keepalive.log`);
}

console.log("[bootstrap] done — waiting for :3000 to warm up…");
