// ─────────────────────────────────────────────────────────────────────────────
// انبار قالب‌های استادیومی (Stadium Template Store) — v12.0 NeoBet
//
// ۵ قالب پس‌زمینه استادیومی آپلودشده مدیر، روی دیسک ذخیره می‌شوند تا
// موتور رندر سمت سرور (کارنامه/تسویه خودکار/گزارش روزانه) بدون مرورگر هم
// همیشه از همین پس‌زمینه‌ها استفاده کند:
//
//   assets/stadium/PRE_MATCH.png     — کارت تیپ بازی
//   assets/stadium/WIN.png           — کارت برنده
//   assets/stadium/LOSS.png          — کارت باخت
//   assets/stadium/DOUBLE_WIN.png    — کارت دابل برد
//   assets/stadium/DAILY_REPORT.png  — گزارش برآیند روزانه
//
// + کش لوگوی باشگاه‌ها (assets/logos/<slug>.png) از فید زنده ESPN
// ─────────────────────────────────────────────────────────────────────────────

import { promises as fs } from "fs";
import path from "path";
import sharp from "sharp";

export const STADIUM_KINDS = ["PRE_MATCH", "WIN", "LOSS", "DOUBLE_WIN", "DAILY_REPORT"] as const;
export type StadiumKind = (typeof STADIUM_KINDS)[number];

export interface StadiumTemplateInfo {
  kind: StadiumKind;
  exists: boolean;
  updatedAt: string | null;
  bytes: number | null;
}

const STADIUM_DIR = path.join(process.cwd(), "assets", "stadium");
const LOGOS_DIR = path.join(process.cwd(), "assets", "logos");

const fileOf = (kind: StadiumKind) => path.join(STADIUM_DIR, `${kind}.png`);

async function ensureDirs(): Promise<void> {
  await fs.mkdir(STADIUM_DIR, { recursive: true });
  await fs.mkdir(LOGOS_DIR, { recursive: true });
}

/** ذخیره پس‌زمینه استادیوم از data URL (image/png|jpeg|webp) — نرمال‌سازی به PNG */
export async function saveStadiumBackground(kind: StadiumKind, dataUrl: string): Promise<{ ok: boolean; bytes?: number; error?: string }> {
  const m = /^data:(image\/(?:png|jpe?g|webp));base64,(.+)$/i.exec(String(dataUrl ?? "").trim());
  if (!m) return { ok: false, error: "فرمت نامعتبر — فقط data URL تصویری (png/jpeg/webp) پذیرفته می‌شود" };
  const buf = Buffer.from(m[2], "base64");
  if (buf.length < 1024) return { ok: false, error: "فایل too small — تصویر واقعی آپلود کنید" };
  if (buf.length > 8 * 1024 * 1024) return { ok: false, error: "حجم بالای ۸ مگابایت — تصویر را کوچک‌تر کنید" };
  try {
    await ensureDirs();
    const png = await sharp(buf).png({ compressionLevel: 9 }).toBuffer();
    await fs.writeFile(fileOf(kind), png);
    return { ok: true, bytes: png.length };
  } catch (e) {
    return { ok: false, error: `پردازش تصویر ناموفق: ${e instanceof Error ? e.message : "?"}` };
  }
}

/** خواندن پس‌زمینه استادیوم — null یعنی قالب آپلود نشده (فالبک: پس‌زمینه برداری) */
export async function getStadiumBackground(kind: StadiumKind): Promise<Buffer | null> {
  try {
    return await fs.readFile(fileOf(kind));
  } catch {
    return null;
  }
}

/** حذف قالب — بازگشت به پس‌زمینه برداری پیش‌فرض */
export async function clearStadiumBackground(kind: StadiumKind): Promise<void> {
  try {
    await fs.unlink(fileOf(kind));
  } catch {
    /* از قبل وجود نداشت */
  }
}

/** فهرست وضعیت ۵ قالب برای پنل مدیریت */
export async function listStadiumBackgrounds(): Promise<{ templates: StadiumTemplateInfo[]; dir: string }> {
  const templates: StadiumTemplateInfo[] = [];
  for (const kind of STADIUM_KINDS) {
    try {
      const st = await fs.stat(fileOf(kind));
      templates.push({ kind, exists: true, updatedAt: st.mtime.toISOString(), bytes: st.size });
    } catch {
      templates.push({ kind, exists: false, updatedAt: null, bytes: null });
    }
  }
  return { templates, dir: "assets/stadium" };
}

// ═════════════════════ کش لوگوی باشگاه‌ها (ESPN) ═════════════════════

const slugOf = (name: string) =>
  String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48) || "club";

/** دانلود لوگوی تیم با کش دیسکی ۷ روزه — null = در دسترس نیست (مونوگرام حرفی چاپ می‌شود) */
export async function fetchTeamLogoBuffer(logoUrl: string | null | undefined, teamName: string): Promise<Buffer | null> {
  if (!logoUrl) return null;
  const file = path.join(LOGOS_DIR, `${slugOf(teamName)}.png`);
  try {
    const st = await fs.stat(file);
    if (Date.now() - st.mtime.getTime() < 7 * 86_400_000) return await fs.readFile(file);
  } catch {
    /* کش سرد */
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(logoUrl, { signal: ctrl.signal, headers: { "User-Agent": "NeoBetQuant/12.0" } });
    clearTimeout(t);
    if (!res.ok) return null;
    const raw = Buffer.from(await res.arrayBuffer());
    const png = await sharp(raw).resize(360, 360, { fit: "inside" }).png().toBuffer();
    await ensureDirs();
    await fs.writeFile(file, png);
    return png;
  } catch {
    return null;
  }
}
