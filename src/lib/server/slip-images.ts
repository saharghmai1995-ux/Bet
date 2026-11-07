// ─────────────────────────────────────────────────────────────────────────────
// سازنده تصاویر کارت تلگرام VIP (Slip Card Image Studio) — v7.0
//   ۱) کارت فوتبالی بازی با نام دو تیم (انتشار تیپ / تیزر)
//   ۲) تصویر جام قهرمانی (کارت‌های برنده پس از تسویه)
//   ۳) تصویر رختکن بهم‌ریخته (کارت‌های بازنده — ثبت صادقانه)
//
// تولید با z-ai-web-dev-sdk (فقط سمت سرور) + کش دیسکی در public/gen
// تا هر کارت فقط یک‌بار تولید شود (صرفه‌جویی جدی در زمان/هزینه).
// ─────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import crypto from "crypto";

const GEN_DIR = path.join(process.cwd(), "public", "gen");

function ensureDir(): void {
  if (!fs.existsSync(GEN_DIR)) fs.mkdirSync(GEN_DIR, { recursive: true });
}

function cachePath(kind: string, seed: string): string {
  ensureDir();
  const h = crypto.createHash("md5").update(`${kind}::${seed}`).digest("hex").slice(0, 12);
  return path.join(GEN_DIR, `${kind}-${h}.png`);
}

async function generateWithRetry(prompt: string, size: string, tries = 3): Promise<Buffer | null> {
  let lastErr: unknown = null;
  for (let i = 0; i < tries; i++) {
    try {
      const { default: ZAI } = await import("z-ai-web-dev-sdk");
      const zai = await ZAI.create();
      const res = await zai.images.generations.create({ prompt, size });
      const b64 = res?.data?.[0]?.base64;
      if (!b64) throw new Error("empty base64");
      return Buffer.from(b64, "base64");
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      // 429 → backoff طولانی‌تر (سرویس تولید تصویر نرخ محدود دارد)
      const waitMs = /429|rate|too many/i.test(msg) ? 12_000 * (i + 1) : 3_000 * (i + 1);
      if (i < tries - 1) await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  console.warn("slip image generation failed:", lastErr);
  return null;
}

/** قفل سراسری — تولید موازی تصویر باعث 429 می‌شود؛ صفِ یک‌در-یک‌بار */
let imgQueue: Promise<unknown> = Promise.resolve();

function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const next = imgQueue.then(fn, fn);
  imgQueue = next.catch(() => undefined);
  return next;
}

async function cachedImage(kind: string, seed: string, prompt: string, size = "1344x768"): Promise<Buffer | null> {
  const p = cachePath(kind, seed);
  if (fs.existsSync(p)) {
    try {
      return fs.readFileSync(p);
    } catch {
      // کش خراب — بازتولید
    }
  }
  // تولید در صف یک‌در-یک‌بار (ضد 429) — اگر تصویر در صف ساخته شد، از دیسک خوانده می‌شود
  const buf = await serialize(() => generateWithRetry(prompt, size));
  if (buf) {
    try {
      fs.writeFileSync(p, buf);
    } catch {
      // ذخیره اختیاری است
    }
  }
  return buf;
}

// ═════════════════════ ۱) کارت فوتبالی مسابقه ═════════════════════

/** تصویر کارت فوتبالی با نام دو تیم — برای فلش‌کارت تیپ A/B و تیزر VIP */
export async function generateFootballCardImage(input: {
  homeTeam: string;
  awayTeam: string;
  league: string;
  hashShort: string;
}): Promise<Buffer | null> {
  const seed = `${input.homeTeam}|${input.awayTeam}|${input.league}`;
  const prompt =
    `Professional football (soccer) matchday promotional card, landscape banner. ` +
    `A glowing stadium at night in the background with floodlights. ` +
    `Two football club crests facing each other in the center with a large "VS" emblem between them. ` +
    `The team name "${input.homeTeam}" written in bold latin letters on the left side, ` +
    `and "${input.awayTeam}" written in bold latin letters on the right side. ` +
    `League badge area labeled "${input.league}". ` +
    `Dark navy and emerald green color palette with golden accents, premium betting-syndicate aesthetic, ` +
    `subtle geometric data lines, high quality, detailed, sharp typography.`;
  return cachedImage("card", seed, prompt);
}

// ═════════════════════ ۲) جام پیروزی (کارت برنده) ═════════════════════

/** تصویر جام قهرمانی برای کارت‌های برنده پس از تسویه خودکار */
export async function generateTrophyImage(input: {
  homeTeam: string;
  awayTeam: string;
  score: string;
  resultLabel: string;
}): Promise<Buffer | null> {
  const seed = `win|${input.homeTeam}|${input.awayTeam}|${input.score}|${input.resultLabel}`;
  const prompt =
    `Epic victory celebration image, landscape. A massive golden championship trophy glowing on a football pitch at night, ` +
    `confetti raining down, golden light rays, stadium packed with cheering fans in the background, ` +
    `a large golden banner with the final score "${input.score}" in bold digits and the text "${input.resultLabel}" below it, ` +
    `football club themes for "${input.homeTeam}" and "${input.awayTeam}", ` +
    `emerald green and gold color palette, cinematic, triumphant mood, high quality, detailed.`;
  return cachedImage("trophy", seed, prompt);
}

// ═════════════════════ ۳) رختکن بهم‌ریخته (کارت بازنده) ═════════════════════

/** تصویر رختکن آشفته برای کارت‌های بازنده — ثبت صادقانه باخت همزمان */
export async function generateLockerRoomImage(input: {
  homeTeam: string;
  awayTeam: string;
  score: string;
  resultLabel: string;
}): Promise<Buffer | null> {
  const seed = `loss|${input.homeTeam}|${input.awayTeam}|${input.score}|${input.resultLabel}`;
  const prompt =
    `Somber messy football locker room after a painful loss, landscape. Scattered boots and shirts on the floor, ` +
    `torn tactical board with crossed-out plays, a lone flickering ceiling light, empty benches, ` +
    `a wall scoreboard showing the final score "${input.score}" in dim red digits, ` +
    `sad atmosphere reflecting the defeat of "${input.homeTeam}" versus "${input.awayTeam}" bets, ` +
    `desaturated cold blue-grey palette, cinematic melancholic mood, high quality, detailed.`;
  return cachedImage("locker", seed, prompt);
}
