// ─────────────────────────────────────────────────────────────────────────────
// VIP-Bot Process Guardian (v18.2) — نگهبان همیشه‌گرم سرویس اشتراک @aineobet_bot
//
// دستور کارفرما: «موتور و هسته سیستم نباید وابسته به مرورگر باشد و باید همیشه
// گرم بماند» — نگهبان داخل هسته همیشه‌گرم Next.js (proceso اصلی سرور) اجرا می‌شود:
//   · هر ۶۰ ثانیه /api/health سرویس ۳۰۱۰ را ping می‌کند
//   · اگر سرویس پاس نداد → سرویس را detached (setsid) دوباره بالا می‌آورد
//   · سرویس بالا آماده با detached=true در صورت مرگ والد، به init سپرده می‌شود
//   · debounce: بین دو ری‌استارت حداقل ۴۵ ثانیه فاصله — ضدِ حلقه ری‌استارت
// بوت: instrumentation register → startVipBotGuardian()
// ─────────────────────────────────────────────────────────────────────────────

import { spawn } from "node:child_process";
import http from "node:http";

const HEALTH_URL = "http://127.0.0.1:3010/api/health";
const CHECK_MS = 60_000;
const RESTART_DEBOUNCE_MS = 45_000;
const SERVICE_DIR = "/home/z/my-project/mini-services/vip-bot";

interface GuardianState {
  timer: ReturnType<typeof setInterval> | null;
  restarting: boolean;
  lastRestartAt: number;
  restartCount: number;
  lastAliveAt: number | null;
}

const g = globalThis as typeof globalThis & { __neobetVipBotGuardian?: GuardianState };
const state: GuardianState = (g.__neobetVipBotGuardian ??= {
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

function spawnVipBot(): void {
  // detached + stdio ignore — پروسه مستقل از والد بالا می‌آید (معادل nohup + setsid)
  const child = spawn("bun", ["run", "dev"], {
    cwd: SERVICE_DIR,
    detached: true,
    stdio: "ignore",
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
  // سرویس پاس نداد — ری‌استارت با debounce ضدحلقه
  if (Date.now() - state.lastRestartAt < RESTART_DEBOUNCE_MS) return;
  state.restarting = true;
  try {
    console.warn("[vipbot-guardian] service :3010 down → detached restart (always-warm guarantee)");
    spawnVipBot();
    state.lastRestartAt = Date.now();
    state.restartCount += 1;
    // بعد از ۱۰ ثانیه صحت را دوباره می‌سنجیم (فقط برای لاگ)
    setTimeout(() => {
      void pingHealth().then((ok) => {
        console.log(`[vipbot-guardian] restart check: ${ok ? "service ALIVE" : "still warming up — will re-check next cycle"}`);
      });
    }, 10_000);
  } finally {
    state.restarting = false;
  }
}

/** بوت نگهبان — فقط یک‌بار در عمر پروسه؛ از instrumentation register صدا زده می‌شود */
export function startVipBotGuardian(): void {
  if (state.timer) return;
  // نخستین بررسی با تأخیر کوتاه — اجازه بوت سرویس/شبکه
  setTimeout(() => void checkOnce(), 15_000);
  state.timer = setInterval(() => void checkOnce(), CHECK_MS);
  console.log("[vipbot-guardian] active — vip-bot :3010 health-checked every 60s (always-warm guarantee)");
}

export function vipBotGuardianStatus(): { watching: boolean; restartCount: number; lastAliveAt: string | null } {
  return {
    watching: state.timer !== null,
    restartCount: state.restartCount,
    lastAliveAt: state.lastAliveAt ? new Date(state.lastAliveAt).toISOString() : null,
  };
}
