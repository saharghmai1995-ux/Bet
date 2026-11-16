// ─────────────────────────────────────────────────────────────────────────────
// Broadcast Daemon Guardian (v19.0) — نگهبان همیشه‌گرم دیمن پخش کانال‌ها
//
// دستور کارفرما: «موتور و هسته سیستم نباید وابسته به مرورگر باشد و باید همیشه
// گرم بماند» — دیمن پخش (mini-services/broadcast-daemon روی :3011) مسیر پخش
// مستقل از Next.js است؛ حتی وقتی سرور Next در حال کامپایل/ری‌استارت است،
// کارت‌ها و نتایج و اسلات‌های فانل بدون وقفه به کانال‌ها می‌روند.
//   · هر ۶۰ ثانیه /api/health دیمن ۳۰۱۱ را ping می‌کند
//   · اگر دیمن پاس نداد → detached (setsid) دوباره بالا می‌آید
//   · debounce ۴۵ ثانیه‌ای بین ری‌استارت‌ها — ضد حلقه ری‌استارت
// بوت: instrumentation register → startBroadcastDaemonGuardian()
// ─────────────────────────────────────────────────────────────────────────────

import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";

const HEALTH_URL = "http://127.0.0.1:3011/health";
const CHECK_MS = 60_000;
const RESTART_DEBOUNCE_MS = 45_000;
const SERVICE_DIR = "/home/z/my-project/mini-services/broadcast-daemon";
/** v20.0.1 — رصدپذیری دیمن: خروجی دیمن دیگر دور ریخته نمی‌شود؛ فایل لاگ دائمی */
const DAEMON_LOG = "/home/z/my-project/mini-services/broadcast-daemon/daemon.log";

interface GuardianState {
  timer: ReturnType<typeof setInterval> | null;
  restarting: boolean;
  lastRestartAt: number;
  restartCount: number;
  lastAliveAt: number | null;
}

const g = globalThis as typeof globalThis & { __neobetBroadcastGuardian?: GuardianState };
const state: GuardianState = (g.__neobetBroadcastGuardian ??= {
  timer: null,
  restarting: false,
  lastRestartAt: 0,
  restartCount: 0,
  lastAliveAt: null,
});

function pingHealth(timeoutMs = 8_000): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(HEALTH_URL, { timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.on("error", () => resolve(false));
  });
}

function spawnDaemon(): void {
  // detached — پروسه مستقل از والد بالا می‌آید (معادل nohup + setsid)
  // v20.0.1 — stdout/stderr به فایل لاگ دائمی می‌رود (راستی‌آزمایی چرخه‌ها/خطاها)
  try {
    fs.appendFileSync(DAEMON_LOG, `\n──── guardian restart @ ${new Date().toISOString()} ────\n`);
  } catch {
    // لاگ اختیاری است — شکستش دیمن را نمی‌کشد
  }
  const out = fs.openSync(DAEMON_LOG, "a");
  const child = spawn("bun", ["run", "dev"], {
    cwd: SERVICE_DIR,
    detached: true,
    stdio: ["ignore", out, out],
    env: { ...process.env },
  });
  child.unref();
}

async function checkOnce(): Promise<void> {
  if (state.restarting) return;
  const alive = await pingHealth();
  if (alive) {
    state.lastAliveAt = Date.now();
    return;
  }
  if (Date.now() - state.lastRestartAt < RESTART_DEBOUNCE_MS) return;
  state.restarting = true;
  try {
    console.warn("[broadcast-guardian] daemon :3011 down → detached restart (always-warm guarantee)");
    spawnDaemon();
    state.lastRestartAt = Date.now();
    state.restartCount += 1;
    setTimeout(() => {
      void pingHealth().then((ok) => {
        console.log(`[broadcast-guardian] restart check: ${ok ? "daemon ALIVE" : "still warming up — will re-check next cycle"}`);
      });
    }, 10_000);
  } finally {
    state.restarting = false;
  }
}

/** بوت نگهبان — فقط یک‌بار در عمر پروسه؛ از instrumentation register صدا زده می‌شود */
export function startBroadcastDaemonGuardian(): void {
  if (state.timer) return;
  setTimeout(() => void checkOnce(), 18_000);
  state.timer = setInterval(() => void checkOnce(), CHECK_MS);
  console.log("[broadcast-guardian] active — broadcast-daemon :3011 health-checked every 60s (always-warm, browser-independent guarantee)");
}

export function broadcastGuardianStatus(): { watching: boolean; restartCount: number; lastAliveAt: string | null } {
  return {
    watching: state.timer !== null,
    restartCount: state.restartCount,
    lastAliveAt: state.lastAliveAt ? new Date(state.lastAliveAt).toISOString() : null,
  };
}
