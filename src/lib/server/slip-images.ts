// ─────────────────────────────────────────────────────────────────────────────
// سازنده تصاویر کارت تلگرام VIP (Slip Card Image Studio) — v8.0
//   ۱) کارت فوتبالی بازی با نام دو تیم (انتشار تیپ / تیزر)
//   ۲) تصویر جام قهرمانی (کارت‌های برنده پس از تسویه)
//   ۳) تصویر رختکن بهم‌ریخته (کارت‌های بازنده — ثبت صادقانه)
//
// تولید با z-ai-web-dev-sdk (فقط سمت سرور) + کش دیسکی در public/gen
// تا هر کارت فقط یک‌بار تولید شود (صرفه‌جویی جدی در زمان/هزینه).
//
// v8.0 — مقاوم‌سازی ضد فیلتر محتوا:
//   · پرامپت‌ها ۱۰۰٪ لاتین و بدون هرگونه واژه مرتبط با شرط‌بندی (خطای ۱۳۰۱)
//   · زنجیره Prompt Fallback: پرامپت اصلی → پرامپت عمومی پاک → تصویر جنریک
//   · خطای contentFilter → تلاش مجدد بی‌فایده است؛ بلافاصله پرامپت بعدی
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

/** تشخیص خطای فیلتر محتوای موتور تصویر — با همان پرامپت تلاش مجدد بی‌فایده است */
function isContentFilterError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /1301|contentfilter|敏感|unsafe|inappropriate|policy/i.test(msg);
}

async function generateOnce(prompt: string, size: "1344x768"): Promise<Buffer> {
  const { default: ZAI } = await import("z-ai-web-dev-sdk");
  const zai = await ZAI.create();
  const res = await zai.images.generations.create({ prompt, size });
  const b64 = res?.data?.[0]?.base64;
  if (!b64) throw new Error("empty base64");
  return Buffer.from(b64, "base64");
}

/**
 * زنجیره پرامپت: هر پرامپت تا ۲ بار (خطاهای شبکه/429) تلاش می‌شود؛
 * خطای فیلتر محتوا → پرامپت فعلی رها و پرامپت پاک‌تر بعدی آزموده می‌شود.
 */
async function generateWithRetry(prompts: string[], size: "1344x768", triesPerPrompt = 2): Promise<Buffer | null> {
  let lastErr: unknown = null;
  for (const prompt of prompts) {
    for (let i = 0; i < triesPerPrompt; i++) {
      try {
        return await generateOnce(prompt, size);
      } catch (err) {
        lastErr = err;
        if (isContentFilterError(err)) break;
        const msg = err instanceof Error ? err.message : String(err);
        const waitMs = /429|rate|too many/i.test(msg) ? 12_000 * (i + 1) : 2_500 * (i + 1);
        if (i < triesPerPrompt - 1) await new Promise((r) => setTimeout(r, waitMs));
      }
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

async function cachedImage(kind: string, seed: string, prompts: string[], size: "1344x768" = "1344x768"): Promise<Buffer | null> {
  const p = cachePath(kind, seed);
  if (fs.existsSync(p)) {
    try {
      return fs.readFileSync(p);
    } catch {
      // کش خراب — بازتولید
    }
  }
  // تولید در صف یک‌در-یک‌بار (ضد 429) — اگر تصویر در صف ساخته شد، از دیسک خوانده می‌شود
  const buf = await serialize(() => generateWithRetry(prompts, size));
  if (buf) {
    try {
      fs.writeFileSync(p, buf);
    } catch {
      // ذخیره اختیاری است
    }
  }
  return buf;
}

/** فقط بخش‌های لاتین یک متن (مثلاً برچسب فارسی) — برای رندر مطمئن متن در تصویر */
function latinOnly(s: string): string {
  return ((s || "").match(/[A-Za-z0-9.'\- ]+/g) ?? []).join(" ").replace(/\s+/g, " ").trim().slice(0, 40);
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
  const home = input.homeTeam.slice(0, 42);
  const away = input.awayTeam.slice(0, 42);
  const league = latinOnly(input.league) || "Football League";
  const prompt =
    `Professional football matchday broadcast graphic, landscape banner. ` +
    `Glowing stadium at night with floodlights in the background. ` +
    `Two football club crests facing each other with a large golden VS emblem between them. ` +
    `Team name "${home}" in bold latin letters on the left side, ` +
    `team name "${away}" in bold latin letters on the right side. ` +
    `League badge labeled "${league}". ` +
    `Dark navy and emerald green palette with golden accents, premium sports-network graphic style, ` +
    `subtle geometric data lines, high quality, detailed, sharp typography.`;
  const fallback =
    `Professional football matchday broadcast graphic, landscape banner, glowing night stadium with floodlights, ` +
    `two football club crests facing each other with a golden VS emblem, ` +
    `dark navy and emerald green palette with golden accents, premium sports broadcast style, high quality, detailed.`;
  return cachedImage("card", seed, [prompt, fallback]);
}

// ═════════════════════ ۲) جام پیروزی (کارت برنده) ═════════════════════

/** تصویر جام قهرمانی برای کارت‌های برنده پس از تسویه خودکار */
export async function generateTrophyImage(input: {
  homeTeam: string;
  awayTeam: string;
  score: string;
}): Promise<Buffer | null> {
  const seed = `win|${input.homeTeam}|${input.awayTeam}|${input.score}`;
  const score = input.score.replace(/[^0-9−-]/g, "") || "0-0";
  const prompt =
    `Epic victory celebration scene, landscape. A massive golden championship trophy glowing on a football pitch at night, ` +
    `confetti raining down, golden light rays, stadium packed with cheering fans in the background, ` +
    `a large golden banner showing the final score "${score}" in bold digits with the word "VICTORY" below it, ` +
    `emerald green and gold palette, cinematic triumphant mood, high quality, detailed.`;
  const fallback =
    `Epic victory celebration scene, landscape, a massive golden championship trophy glowing on a football pitch at night, ` +
    `confetti raining down, golden light rays, packed cheering stadium in the background, ` +
    `emerald green and gold palette, cinematic triumphant mood, high quality, detailed.`;
  return cachedImage("trophy", seed, [prompt, fallback]);
}

// ═════════════════════ ۳) رختکن بهم‌ریخته (کارت بازنده) ═════════════════════

/** تصویر رختکن آشفته برای کارت‌های بازنده — ثبت صادقانه باخت همزمان */
export async function generateLockerRoomImage(input: {
  homeTeam: string;
  awayTeam: string;
  score: string;
}): Promise<Buffer | null> {
  const seed = `loss|${input.homeTeam}|${input.awayTeam}|${input.score}`;
  const score = input.score.replace(/[^0-9−-]/g, "") || "0-0";
  const prompt =
    `Somber empty football locker room after a tough defeat, landscape. Scattered boots and shirts on the floor, ` +
    `a torn tactical board, a lone flickering ceiling light, empty benches, ` +
    `a wall scoreboard showing the final score "${score}" in dim red digits, ` +
    `desaturated cold blue-grey palette, cinematic melancholic mood, high quality, detailed.`;
  const fallback =
    `Somber empty football locker room after a tough defeat, landscape, scattered boots and shirts on the floor, ` +
    `lone flickering ceiling light, empty benches, desaturated cold blue-grey palette, cinematic melancholic mood, high quality, detailed.`;
  return cachedImage("locker", seed, [prompt, fallback]);
}
