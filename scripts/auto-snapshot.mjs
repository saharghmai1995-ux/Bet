// ─────────────────────────────────────────────────────────────────────────────
// NeoBet Auto-Snapshot Watcher (v18.1)
// هر تغییر پروژه را می‌بیند و بلافاصله اسنپ‌شات گیت‌هاب می‌گیرد:
//   · هر ۲ دقیقه وضعیت git را چک می‌کند؛ اگر فایل جدید/تغییری باشد → اسنپ‌شات
//   · cooldown ۴ دقیقه‌ای بعد از هر اسنپ‌شات تا جلوی اسپم commit گرفته شود
//   · در نبود توکن پوش، تگ لوکال ثبت می‌شود (اسکریپت gh-snapshot.sh) و در
//     اولین فرصت بعدی پوش می‌شود — هیچ نسخه‌ای گم نمی‌شود.
// اجرا:  nohup bun scripts/auto-snapshot.mjs &   (بون بدون نصب نیازمندی)
// ─────────────────────────────────────────────────────────────────────────────

import { execSync } from "node:child_process";

const REPO = process.cwd();
const POLL_MS = 2 * 60_000;
const COOLDOWN_MS = 4 * 60_000;
let lastSnapshotAt = 0;

const sh = (cmd) => {
  try {
    return execSync(cmd, { cwd: REPO, encoding: "utf8", timeout: 60_000 }).trim();
  } catch (err) {
    return String(err?.stdout ?? err?.message ?? "");
  }
};

function hasChanges() {
  const status = sh("git status --porcelain");
  return status.length > 0;
}

function snapshot() {
  const now = new Date();
  const stamp = now.toISOString().slice(0, 19).replace("T", " ");
  const files = sh("git status --porcelain").split("\n").filter(Boolean).length;
  const msg = `snapshot: auto backup ${stamp} — ${files} changed path(s)`;
  console.log(`[snapshot] ${msg}`);
  sh(`bash scripts/gh-snapshot.sh "${msg}"`);
  lastSnapshotAt = Date.now();
  const log = sh("tail -3 .github-snapshot.log");
  console.log(log);
}

console.log("[snapshot] watcher active — polling every 2 min (cooldown 4 min)");
setInterval(() => {
  try {
    if (Date.now() - lastSnapshotAt < COOLDOWN_MS) return;
    if (hasChanges()) snapshot();
  } catch (err) {
    console.warn("[snapshot] watcher error:", err?.message ?? err);
  }
}, POLL_MS);
