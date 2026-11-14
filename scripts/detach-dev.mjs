// ─────────────────────────────────────────────────────────────────────────────
// detch-spawn سرور dev — الگوی اثبات‌شده‌ی بقای پروسه در sandbox:
// spawn detached + unref از یک اسکریپت کوتاه‌عمر → reparent به PID 1
// ─────────────────────────────────────────────────────────────────────────────
import { spawn } from "node:child_process";
import { openSync } from "node:fs";

const out = openSync("/home/z/my-project/dev.log", "a");
const child = spawn("bun", ["run", "dev"], {
  cwd: "/home/z/my-project",
  detached: true,
  stdio: ["ignore", out, out],
});
child.unref();
console.log(`[detach-dev] dev server spawned (pid ${child.pid}) → /home/z/my-project/dev.log`);
process.exit(0);
