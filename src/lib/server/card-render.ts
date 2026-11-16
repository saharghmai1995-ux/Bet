// ─────────────────────────────────────────────────────────────────────────────
// NEOBET Broadcast Stadium Card Renderer — v12.0 (@aineobet Official Edition)
//
// کاملاً قطعی (Deterministic): متن‌ها با SVG برداری رندر و با sharp به PNG
// تبدیل می‌شوند — صفر وابستگی به تولید تصویر هوش مصنوعی:
//   · صفر باگ متنی (نام تیم‌ها/اعداد/هش دقیقاً همان رشته‌های واقعی‌اند)
//   · صفر خطای content-filter · صفر تأخیر · صفر هزینه
//
// v12.0 — سیستم ۵ قالب فوتبالی استادیومی UEFA Broadcast:
//   · بوم استاندارد تلگرام 3:4 (1080×1440) — بدون برش در فید موبایل
//   · اگر مدیر قالب استادیومی آپلود کرده باشد (assets/stadium/<kind>.png)
//     متن‌ها و لوگوها دقیقاً روی همان عکس چاپ می‌شوند (حالت Broadcast)
//   · در غیر این صورت پس‌زمینه برداری استادیوم شب‌هنگام چاپ می‌شود
//   · لوگوی باشگاه‌ها از فید زنده ESPN (کش ۷ روزه) — فالبک: مونوگرام حروف
//
// زبان تصاویر: انگلیسی خالص (Pure Visual English — سازگار با librsvg بدون bidi)
// ─────────────────────────────────────────────────────────────────────────────

import sharp from "sharp";
import { enLeagueLabel } from "@/lib/leagues-catalog";

// ═════════════════════ برندینگ رسمی v12.0 ═════════════════════

export const BRAND_TITLE = "NEOBET QUANT PRO";
export const BRAND_HANDLE = "@AINEOBET";
export const BRAND_SUB = "OFFICIAL BROADCAST · AI FOOTBALL QUANT";

// ═════════════════════ پالت رنگ سازمانی ═════════════════════

const C = {
  bgTop: "#0a1220",
  bgBottom: "#0e1c30",
  gold: "#f5c542",
  goldSoft: "rgba(245,197,66,0.14)",
  cyan: "#38d6f5",
  cyanSoft: "rgba(56,214,245,0.10)",
  emerald: "#3ddc97",
  emeraldSoft: "rgba(61,220,151,0.10)",
  rose: "#ff6b7a",
  roseSoft: "rgba(255,107,122,0.10)",
  ink: "#f2f6fc",
  inkDim: "#9db0ca",
  inkFaint: "#5c6c85",
  line: "rgba(255,255,255,0.08)",
  cardBg: "rgba(255,255,255,0.035)",
  mono: "'DejaVu Sans Mono','Courier New',monospace",
  sans: "'DejaVu Sans','Liberation Sans',sans-serif",
};

// ═════════════════════ ابزار متن (سنجش + شکستن خط) ═════════════════════

/** عرض تقریبی کاراکتر به واحد em در DejaVu Sans */
function charW(ch: string): number {
  if (" iIljt.,:;!'|".includes(ch)) return 0.32;
  if ("ftr-()[]".includes(ch)) return 0.42;
  if ("mwMW@".includes(ch)) return 0.92;
  if (ch >= "A" && ch <= "Z") return 0.72;
  if (ch >= "0" && ch <= "9") return 0.64;
  if (ch === " ") return 0.34;
  if (ch >= "a" && ch <= "z") return 0.56;
  return 0.62;
}

export function textWidth(text: string, fontSize: number, weight = 400): number {
  const w = String(text ?? "").split("").reduce((acc, ch) => acc + charW(ch), 0) * fontSize;
  return w * (weight >= 600 ? 1.06 : 1);
}

/** شکستن متن به خطوط با حداکثر عرض پیکسلی */
export function wrapText(text: string, maxWidth: number, fontSize: number, weight = 400, maxLines = 3): string[] {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const word of words) {
    const attempt = cur ? `${cur} ${word}` : word;
    if (textWidth(attempt, fontSize, weight) <= maxWidth) {
      cur = attempt;
    } else {
      if (cur) lines.push(cur);
      cur = word;
      if (lines.length === maxLines) break;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length === maxLines && words.join(" ") !== lines.join(" ")) {
    let last = lines[maxLines - 1];
    while (textWidth(`${last}…`, fontSize, weight) > maxWidth && last.length > 4) last = last.slice(0, -1);
    lines[maxLines - 1] = `${last}…`;
  }
  return lines.length > 0 ? lines : ["—"];
}

/** کوچک‌سازی خودکار فونت تا متن در عرض بگنجد */
export function fitSize(text: string, maxWidth: number, baseSize: number, minSize: number, weight = 700): number {
  let size = baseSize;
  while (size > minSize && textWidth(text, size, weight) > maxWidth) size -= 2;
  return size;
}

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** چند خط tspan با line-height مشخص */
function tspans(lines: string[], x: number, y: number, lh: number): string {
  return lines.map((l, i) => `<tspan x="${x}" y="${y + i * lh}">${esc(l)}</tspan>`).join("");
}

// ═════════════════════ برچسب انگلیسی انتخاب‌ها (از کلید بازار) ═════════════════════

const KEY_EN: Record<string, string> = {
  HOME: "Full-Time Result: 1 — Home Win",
  DRAW: "Full-Time Result: X — Draw",
  AWAY: "Full-Time Result: 2 — Away Win",
  DC_1X: "Double Chance 1X",
  DC_X2: "Double Chance X2",
  O15: "Total Goals: Over 1.5",
  O25: "Total Goals: Over 2.5",
  U25: "Total Goals: Under 2.5",
  O35: "Total Goals: Over 3.5",
  U35: "Total Goals: Under 3.5",
  BTTS_Y: "Both Teams To Score: Yes",
  BTTS_N: "Both Teams To Score: No",
  DNB_HOME: "Draw No Bet · Home",
  DNB_AWAY: "Draw No Bet · Away",
  NO_DRAW: "No Draw (1 or 2)",
  AH_AWAY_15: "Asian Handicap: Away +1.5",
  AH_HOME_15: "Asian Handicap: Home −1.5",
  ASIAN_O20: "Asian Total Over 2.0",
  ASIAN_U20: "Asian Total Under 2.0",
  TGOAL_HOME: "Home To Score 1+",
  TGOAL_AWAY: "Away To Score 1+",
  HOME_O15: "Home Team Total: Over 1.5",
  AWAY_O15: "Away Team Total: Over 1.5",
  HOME_U15: "Home Team Total: Under 1.5",
  AWAY_U15: "Away Team Total: Under 1.5",
  WIN_NIL_HOME: "Home Team to Win to Nil: Yes",
  WIN_NIL_AWAY: "Away Win To Nil",
  EXACT2: "Exact Total Goals: 2 Goals",
  HOME_BY_1: "Winning Margin: Home by 1 Goal",
  C_O95: "Corners Over 9.5",
  C_U95: "Corners Under 9.5",
};

/** حذف هر کاراکتر غیرلاتین از برچسب — منع مطلق متن فارسی/عربی در تصویر */
function latinOnly(s: string): string {
  return String(s ?? "")
    .replace(/[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** برچسب انگلیسی یک تیپ از کلیدهای بازار — ۱۰۰٪ لاتین برای رندر بی‌نقص */
export function englishSelectionLabel(keys: string[], archetypeCode?: string | null): string {
  const known = (keys ?? []).map((k) => KEY_EN[String(k).toUpperCase()]).filter(Boolean);
  if (known.length > 0) return latinOnly(known.join("  +  "));
  // v18.0 — فالبک فقط با کد لاتین الگو (G1/G2/...) — هرگز نام فارسی archetype چاپ نمی‌شود
  const code = latinOnly(String(archetypeCode ?? "")).replace(/[^A-Za-z0-9 _+.\-×/]/g, "").trim();
  return code ? `${code} · orthogonal dual-tip coverage` : "Orthogonal dual-tip coverage";
}

// ═════════════════════ عناصر تزئینی مشترک ═════════════════════

const W = 1080;
const H = 1440;

/** v13.0 — انواع پوسترهای خودساز (بدون هیچ آپلود خارجی) */
export type StadiumKind = "PRE_MATCH" | "WIN" | "LOSS" | "DOUBLE_WIN" | "DAILY_REPORT" | "COMBO" | "SNIPER" | "TEASER" | "RADAR";

/** LCG قطعی — هر پوستر همیشه با همان ذرات رندر می‌شود (Deterministic) */
function seeded(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

/**
 * ═══ v18.0 — RETRO 16-BIT ARCADE ENGINE (Zero-Upload Procedural Pixel Art) ═══
 * موتور خودساز گرافیک کانال — بازطراحی کامل به سبک کنسول‌های ۱۶ بیتی:
 *   · آسمان پیکسلی با ستاره‌های چانکی + برج‌های نورافکن پیکسلی
 *   · سکوهای تماشاگر با جمعیت پیکسلی (grid 12px — dithered roster)
 *   · چمن با نوارهای تخت (flat stripes) و خطوط ۹۰ درجه — پرسپکتیو حذف شد
 *   · فایرورک پیکسلی (WIN/DOUBLE_WIN) · باران پیکسلی (LOSS)
 *   · لایه CRT: scanline + vignette روی کل پوستر (احساس مانیتور آرکید)
 * v18.1 — موتور نمادهای ورزشی موضوع‌محور (Sports Symbol Topic Engine):
 *   · پس‌زمینه هر پوستر با نمادهای ورزشی مرتبط با «موضوع همان پست» تزئین می‌شود
 *     (توپ، تور دروازه، پرچم کرنر، سوت، کفش، پیراهن، تابلو امتیاز، جام، دسته بازی،...)
 *   · نشان بزرگ موضوع (Topic Emblem) در آسمان + پراکندگی نمادهای کوچک روی سکو/چمن
 *   · توضیح کامل انگلیسی موضوع (Topic Brief) روی خود پوستر چاپ می‌شود
 * تمام متن‌ها انگلیسی خالص (منع مطلق متن فارسی در تصویر).
 */

/** v18.1 — موضوع هر پست برای انتخاب نمادهای پس‌زمینه */
export type PosterTopic =
  | "MATCH"
  | "RESULT_WIN"
  | "RESULT_LOSS"
  | "RESULT_JACKPOT"
  | "DAILY"
  | "LADDER"
  | "WINRATE"
  | "COMBO"
  | "SNIPER"
  | "TEASER"
  | "RADAR"
  | "AD"
  | "LESSON"
  | "NEWS"
  | "BRIEF"
  | "WEEKLY";

// ═════════ v18.1 — کتابخانه نمادهای پیکسلی ورزشی (کاملاً rect — بدون path) ═════════

function px(x: number, y: number, w: number, h: number, fill: string, op = 1): string {
  return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${fill}"${op < 1 ? ` opacity="${op.toFixed(2)}"` : ""}/>`;
}

/** توپ فوتبال پیکسلی — هسته + حلقه ۸تایی + وصله‌های تیره */
function pixelBall(cx: number, cy: number, r: number, color: string): string {
  const u = Math.max(2, r / 5);
  const p = (dx: number, dy: number, mul = 1) =>
    px(cx + dx * u - u * mul * 0.5, cy + dy * u - u * mul * 0.5, u * mul, u * mul, color);
  return [
    p(0, 0, 3),
    p(1, 0, 2), p(-1, 0, 2), p(0, 1, 2), p(0, -1, 2),
    p(2, 0), p(-2, 0), p(0, 2), p(0, -2),
    p(1, 1), p(-1, -1), p(1, -1), p(-1, 1),
    px(cx - u * 0.5, cy - u * 0.5, u, u, "rgba(6,12,22,0.55)"),
    px(cx - u * 2.5, cy + u, u * 0.7, u * 0.7, "rgba(6,12,22,0.4)"),
    px(cx + u * 1.8, cy - u * 1.8, u * 0.7, u * 0.7, "rgba(6,12,22,0.4)"),
  ].join("");
}

/** دروازه با تور پیکسلی */
function pixelGoal(x: number, y: number, w: number, h: number, color: string, op = 1): string {
  const u = Math.max(2, w / 56);
  const net: string[] = [];
  for (let gx = x + u; gx <= x + w - u; gx += u * 4) net.push(px(gx, y + u, u * 0.8, h - u, color, op * 0.45));
  for (let gy = y + u * 4; gy <= y + h - u; gy += u * 4) net.push(px(x + u, gy, w - u * 2, u * 0.8, color, op * 0.45));
  return [
    px(x, y, w, u, color, op), // crossbar
    px(x, y, u, h, color, op), // left post
    px(x + w - u, y, u, h, color, op), // right post
    net.join(""),
  ].join("");
}

/** پرچم کرنر پیکسلی */
function pixelFlag(x: number, y: number, h: number, color: string, op = 1): string {
  const u = Math.max(2, h / 10);
  return [
    px(x, y, u, h, color, op),
    px(x + u, y, u * 3, u, color, op),
    px(x + u, y + u, u * 2, u, color, op * 0.9),
    px(x + u, y + u * 2, u, u, color, op * 0.8),
  ].join("");
}

/** سوت داور پیکسلی */
function pixelWhistle(cx: number, cy: number, s: number, color: string, op = 1): string {
  const u = Math.max(2, s / 8);
  return [
    px(cx - u * 3, cy - u, u * 5, u * 2.4, color, op),
    px(cx + u * 2, cy - u * 0.6, u * 1.6, u * 1.6, color, op * 0.85),
    px(cx - u * 4, cy - u * 1.8, u, u * 1.2, color, op),
    px(cx - u * 0.6, cy - u * 0.4, u, u, "rgba(4,8,16,0.65)", op),
    px(cx - u * 4.6, cy - u * 3, u, u, color, op * 0.8),
  ].join("");
}

/** کفش فوتبال پیکسلی با میخ‌ها */
function pixelBoot(x: number, y: number, s: number, color: string, op = 1): string {
  const u = Math.max(2, s / 8);
  return [
    px(x, y + u * 4, u * 7, u, color, op), // sole
    px(x, y + u * 1.4, u * 2.4, u * 2.6, color, op), // ankle
    px(x + u * 2, y + u * 2.8, u * 3.6, u * 1.2, color, op * 0.88), // toe upper
    px(x + u * 0.8, y + u * 5, u, u * 0.8, color, op * 0.75), // studs
    px(x + u * 3, y + u * 5, u, u * 0.8, color, op * 0.75),
    px(x + u * 5.2, y + u * 5, u, u * 0.8, color, op * 0.75),
  ].join("");
}

/** پیراهن فوتبال پیکسلی با شماره */
function pixelJersey(cx: number, cy: number, s: number, color: string, op = 1): string {
  const u = Math.max(2, s / 9);
  return [
    px(cx - u * 2, cy - u * 2.5, u * 4, u * 5, color, op), // torso
    px(cx - u * 3.4, cy - u * 2.5, u * 1.4, u * 2.2, color, op * 0.85), // sleeves
    px(cx + u * 2, cy - u * 2.5, u * 1.4, u * 2.2, color, op * 0.85),
    px(cx - u, cy - u * 2.9, u * 2, u * 0.7, "rgba(4,8,16,0.6)", op), // collar
    px(cx - u * 0.5, cy - u * 1.4, u, u * 1.6, "rgba(255,255,255,0.85)", op), // number 1
    px(cx + u * 0.5, cy - u * 1.4, u * 0.4, u * 0.7, "rgba(255,255,255,0.85)", op),
  ].join("");
}

/** تابلوی امتیاز پیکسلی */
function pixelScoreboard(x: number, y: number, w: number, h: number, color: string, op = 1): string {
  const u = Math.max(2, w / 26);
  const cell = (cx: number, cy: number) => px(cx, cy, u * 1.4, u * 2, "rgba(255,255,255,0.75)", op * 0.9);
  return [
    px(x, y, w, h, "rgba(4,8,18,0.9)", op),
    px(x, y, w, u * 0.6, color, op),
    px(x, y + h - u * 0.6, w, u * 0.6, color, op * 0.8),
    cell(x + u * 3, y + u * 2.4), cell(x + u * 5.2, y + u * 2.4),
    cell(x + w - u * 6.6, y + u * 2.4), cell(x + w - u * 4.4, y + u * 2.4),
    px(x + w / 2 - u * 0.8, y + u * 2.4, u * 0.5, u * 2, color, op * 0.9),
    px(x + w / 2 + u * 0.8, y + u * 2.4, u * 0.5, u * 2, color, op * 0.9),
  ].join("");
}

/** دسته بازی آرکید پیکسلی */
function pixelController(cx: number, cy: number, s: number, color: string, op = 1): string {
  const u = Math.max(2, s / 9);
  return [
    px(cx - u * 4, cy - u * 1.5, u * 8, u * 3, color, op),
    px(cx - u * 3.6, cy - u * 2.3, u * 7.2, u * 0.8, color, op * 0.85),
    px(cx - u * 3.6, cy + u * 1.5, u * 7.2, u * 0.8, color, op * 0.85),
    px(cx - u * 2.6, cy - u * 0.9, u, u * 1.8, "rgba(4,8,16,0.7)", op), // dpad
    px(cx - u * 3, cy - u * 0.5, u * 1.8, u, "rgba(4,8,16,0.7)", op),
    px(cx + u * 2.6, cy - u * 0.9, u, u, C.rose, op), // buttons
    px(cx + u * 3.3, cy - u * 0.2, u, u, C.emerald, op),
    px(cx - u * 0.6, cy + u * 0.6, u * 1.4, u * 0.5, "rgba(255,255,255,0.6)", op), // start
  ].join("");
}

/** سکه پیکسلی (استک) */
function pixelCoinStack(x: number, y: number, s: number, n: number, op = 1): string {
  const u = Math.max(2, s / 6);
  const coins: string[] = [];
  for (let i = 0; i < n; i++) {
    const yy = y - i * u * 1.15;
    coins.push(px(x, yy, u * 5, u * 0.9, i === n - 1 ? C.gold : "#caa53a", op));
    coins.push(px(x + u * 0.6, yy + u * 0.15, u * 3.8, u * 0.35, "rgba(255,255,255,0.5)", op * 0.9));
  }
  return coins.join("");
}

/** بوق/مگافون خبر پیکسلی */
function pixelMegaphone(x: number, y: number, s: number, color: string, op = 1): string {
  const u = Math.max(2, s / 9);
  return [
    px(x, y + u * 1.5, u * 2, u * 3, color, op),
    px(x + u * 2, y + u * 1, u * 2, u * 4, color, op * 0.9),
    px(x + u * 4, y + u * 0.2, u * 2.4, u * 5.6, color, op * 0.8),
    px(x + u * 7, y + u * 0.4, u * 0.8, u * 5.2, color, op * 0.6),
    px(x + u * 8.6, y + u * 1.4, u * 0.8, u * 3.2, color, op * 0.4),
    px(x + u * 10, y + u * 2.2, u * 0.8, u * 1.6, color, op * 0.3),
    px(x + u * 0.6, y + u * 4.5, u * 1.2, u * 1.8, color, op * 0.75), // handle
  ].join("");
}

/** روزنامه پیکسلی */
function pixelNews(x: number, y: number, s: number, color: string, op = 1): string {
  const u = Math.max(2, s / 10);
  return [
    px(x, y, u * 8, u * 10, "rgba(238,244,252,0.9)", op),
    px(x, y, u * 8, u * 1.2, color, op),
    px(x + u, y + u * 2, u * 6, u * 0.7, "rgba(10,16,30,0.75)", op),
    px(x + u, y + u * 3.2, u * 6, u * 0.7, "rgba(10,16,30,0.55)", op),
    px(x + u, y + u * 4.6, u * 3, u * 2.6, color, op * 0.75), // photo box
    px(x + u * 4.4, y + u * 4.6, u * 2.6, u * 0.7, "rgba(10,16,30,0.45)", op),
    px(x + u * 4.4, y + u * 5.8, u * 2.6, u * 0.7, "rgba(10,16,30,0.45)", op),
    px(x + u, y + u * 7.8, u * 6, u * 0.7, "rgba(10,16,30,0.45)", op),
  ].join("");
}

/** کلاه فارغ‌التحصیلی آکادمی */
function pixelGradCap(cx: number, cy: number, s: number, color: string, op = 1): string {
  const u = Math.max(2, s / 10);
  return [
    px(cx - u * 4, cy - u * 1.6, u * 8, u * 2, color, op), // board
    px(cx - u * 2.2, cy + u * 0.4, u * 4.4, u * 1.6, color, op * 0.8), // head band
    px(cx + u * 3.4, cy - u * 1.2, u * 0.7, u * 2.6, color, op * 0.9), // tassel
    px(cx + u * 3.2, cy + u * 1.4, u * 1.1, u * 1.1, C.gold, op), // tassel knot
  ].join("");
}

/** نمودار رشد پیکسلی */
function pixelChart(x: number, y: number, w: number, h: number, color: string, op = 1): string {
  const u = Math.max(2, w / 14);
  const bars = [0.35, 0.55, 0.75, 1].map((f, i) =>
    px(x + u * (2 + i * 2.6), y + h - u * 0.8 - (h - u * 2) * f, u * 1.8, (h - u * 2) * f, i === 3 ? C.gold : color, op * (0.5 + i * 0.16))
  ).join("");
  return [
    px(x, y + h - u * 0.8, w, u * 0.8, color, op * 0.9), // axis
    px(x, y, u * 0.8, h, color, op * 0.9),
    bars,
  ].join("");
}

/** نشان هدف اسنایپر پیکسلی */
function pixelTarget(cx: number, cy: number, r: number, color: string, op = 1): string {
  const u = Math.max(2, r / 6);
  return [
    px(cx - r, cy - u * 0.4, r * 2, u * 0.8, color, op * 0.8),
    px(cx - u * 0.4, cy - r, u * 0.8, r * 2, color, op * 0.8),
    px(cx - r * 0.55, cy - r * 0.55, r * 1.1, r * 1.1, "none"),
    px(cx - r * 0.55, cy - r * 0.55, r * 1.1, u * 0.7, color, op * 0.9),
    px(cx - r * 0.55, cy + r * 0.55 - u * 0.7, r * 1.1, u * 0.7, color, op * 0.9),
    px(cx - r * 0.55, cy - r * 0.55, u * 0.7, r * 1.1, color, op * 0.9),
    px(cx + r * 0.55 - u * 0.7, cy - r * 0.55, u * 0.7, r * 1.1, color, op * 0.9),
    px(cx - u, cy - u, u * 2, u * 2, C.rose, op),
  ].join("");
}

/** رادار پیکسلی */
function pixelRadar(cx: number, cy: number, r: number, color: string, op = 1): string {
  const ring = (f: number) =>
    px(cx - r * f, cy - r * f, r * 2 * f, u0, color, op * 0.7) +
    px(cx - r * f, cy + r * f - u0, r * 2 * f, u0, color, op * 0.7) +
    px(cx - r * f, cy - r * f, u0, r * 2 * f, color, op * 0.7) +
    px(cx + r * f - u0, cy - r * f, u0, r * 2 * f, color, op * 0.7);
  const u0 = Math.max(2, r / 9);
  return [
    ring(1), ring(0.62), ring(0.3),
    px(cx - u0 * 0.5, cy - u0 * 0.5, u0, u0, C.emerald, op),
    px(cx + r * 0.3, cy - r * 0.22, u0, u0, C.rose, op * 0.9),
    px(cx - r * 0.42, cy + r * 0.28, u0, u0, C.gold, op * 0.9),
    px(cx - u0 * 0.4, cy + r * 0.9, u0 * 0.8, r * 0.35, color, op * 0.8), // stand
  ].join("");
}

/** ستاره/جرقه پیکسلی */
function pixelStar(x: number, y: number, s: number, color: string, op = 1): string {
  const u = Math.max(2, s / 5);
  return [
    px(x - u * 2.4, y - u * 0.5, u * 4.8, u, color, op),
    px(x - u * 0.5, y - u * 2.4, u, u * 4.8, color, op),
    px(x - u * 1.5, y - u * 1.5, u, u, color, op * 0.7),
    px(x + u * 0.7, y + u * 0.7, u, u, color, op * 0.7),
    px(x + u * 0.7, y - u * 1.5, u, u, color, op * 0.7),
    px(x - u * 1.5, y + u * 0.7, u, u, color, op * 0.7),
  ].join("");
}

/** بلیت پیکسلی VIP */
function pixelTicket(x: number, y: number, w: number, h: number, color: string, op = 1): string {
  const u = Math.max(2, h / 6);
  return [
    px(x, y, w, h, "rgba(245,197,66,0.16)", op),
    px(x, y, w, u * 0.7, color, op * 0.9),
    px(x, y + h - u * 0.7, w, u * 0.7, color, op * 0.9),
    px(x, y, u * 0.7, h, color, op * 0.9),
    px(x + w - u * 0.7, y, u * 0.7, h, color, op * 0.9),
    px(x + w * 0.62, y + u * 0.7, u * 0.5, h - u * 1.4, color, op * 0.55), // perforation
    px(x + w * 0.72, y + h * 0.32, u * 1.1, u * 1.1, C.gold, op),
    px(x + w * 0.82, y + h * 0.32, u * 1.1, u * 1.1, C.gold, op * 0.85),
  ].join("");
}

/** توضیح کامل انگلیسی موضوع هر پست — «تمام پوسترها انگلیسی با توضیحات کامل» */
function topicBrief(topic: PosterTopic): string {
  switch (topic) {
    case "MATCH":
      return "TODAY'S SUPERVISOR-APPROVED DUAL-TIP CARD — TWO COMPLEMENTARY MARKETS ON ONE FLAT 100-UNIT TICKET, PROFIT PRINTED AT ISSUE TIME.";
    case "RESULT_WIN":
      return "OFFICIAL FT SETTLEMENT — ONE TIP CASHED ON THE ESPN SCOREBOARD, PROFIT POSTED TO THE 1000-UNIT BANK LEDGER.";
    case "RESULT_JACKPOT":
      return "GOLDEN DOUBLE-WIN — BOTH COMPLEMENTARY TIPS CASHED IN THE SAME MATCH, THE RAREST AND LARGEST PAYOUT OF THE PIPELINE.";
    case "RESULT_LOSS":
      return "MIDDLE TRAP — BOTH TIPS LOST TOGETHER; THE JOINT-LOSS RISK PRINTED ON THE CARD IS THE HONEST COST OF THE COVERAGE.";
    case "DAILY":
      return "END-OF-DAY AUDIT — EVERY CARD SETTLED ON THE OFFICIAL ESPN SCOREBOARD, WIN-RATE AND NET UNITS ACCOUNTED WITH ZERO MANUAL EDITS.";
    case "LADDER":
      return "3-STEP COMPOUND ROLLOVER — PRINCIPAL PLUS PROFIT ROLLS INTO THE NEXT APPROVED MATCH, EACH STEP SETTLED BEFORE THE NEXT KICKOFF.";
    case "WINRATE":
      return "LIVE VERIFIED WIN-RATE — ONLY SUPERVISOR-APPROVED TICKETS COUNTED, GRADED BY THE OFFICIAL ESPN SCOREBOARD, SHADOW VETOES EXCLUDED.";
    case "COMBO":
      return "BANKER ACCUMULATOR — INDEPENDENT APPROVED BASES STACKED WITH SIMULATED JOINT PROBABILITY PRINTED ON THE POSTER.";
    case "SNIPER":
      return "HIGH-ODDS SINGLE SHOT — REVERSE-POISSON EDGE WITH A CAPPED STAKE, THE BANK IS NEVER A HOSTAGE TO A LONG SHOT.";
    case "TEASER":
      return "LOCKED PREVIEW — TIP B STAYS HIDDEN UNTIL KICKOFF FOR FREE VIEWERS; VIP MEMBERS SEE THE FULL DUAL-TIP CARD.";
    case "RADAR":
      return "MATCHDAY RADAR — EVERY FIXTURE SCANNED BY THE 5-REGIME BET-TYPE ROUTER, APPROVED CANDIDATES MARKED, HIGH RISK VETOED.";
    case "AD":
      return "NEOBET VIP MEMBERSHIP — THE FULL PIPELINE: FLASHCARDS, DAILY DIGEST, LIVE ESPN SETTLEMENT AND THE SHA-256 PUBLIC LEDGER.";
    case "LESSON":
      return "BET ACADEMY — LEARN THE EXACT LANGUAGE PROFESSIONAL BETTORS USE TO FIND VALUE, SIZE STAKES AND SURVIVE VARIANCE.";
    case "NEWS":
      return "LIVE ESPN WIRE — TEAM NEWS, INJURIES AND STORYLINES FEED THE ENGINE'S LAMBDA CONTEXT BEFORE KICKOFF; NEWS IS INPUT, NOT SIGNAL.";
    case "BRIEF":
      return "VIP MORNING BRIEF — TODAY'S APPROVED BOARD PLUS THE SUPERVISOR'S TOP RECOMMENDATION AND EXECUTION DISCIPLINE RULES.";
    case "WEEKLY":
      return "WEEKLY AUDIT — 7 DAYS OF OFFICIAL ESPN SETTLEMENTS SPLIT BY PRODUCT LINE, NO SIMULATION AND NO PAPER TICKETS.";
  }
}

/** نشان بزرگ موضوع در آسمان پوستر — هر پست امضای بصری خودش را دارد (کم‌رنگ: بافت پس‌زمینه، نه مانع محتوا) */
function topicEmblem(topic: PosterTopic, accent: string): string {
  const ex = W - 165;
  const ey = 215;
  const body = (() => {
    switch (topic) {
    case "MATCH":
      return pixelGoal(ex - 120, ey - 52, 210, 118, accent, 0.9) + pixelBall(ex + 90, ey + 92, 30, "rgba(240,246,255,0.95)");
    case "RESULT_WIN":
      return trophyVector(ex, ey, 0.78, C.gold) + pixelStar(ex - 120, ey - 60, 22, C.gold, 0.85) + pixelStar(ex + 110, ey + 40, 18, accent, 0.8);
    case "RESULT_JACKPOT":
      return trophyVector(ex, ey - 10, 0.72, C.gold) + pixelCoinStack(ex - 95, ey + 95, 26, 4, 0.95) + pixelStar(ex + 115, ey - 58, 20, C.gold, 0.9);
    case "RESULT_LOSS":
      return pixelWhistle(ex, ey, 64, "rgba(255,150,160,0.95)") + pixelFlag(ex - 110, ey - 40, 96, accent, 0.75);
    case "DAILY":
      return pixelScoreboard(ex - 130, ey - 62, 250, 110, accent, 0.95) + pixelBall(ex + 100, ey + 80, 24, "rgba(240,246,255,0.9)");
    case "LADDER":
      return pixelChart(ex - 110, ey - 64, 210, 130, accent, 0.95) + pixelCoinStack(ex + 80, ey + 92, 24, 3, 0.9);
    case "WINRATE":
      return pixelChart(ex - 110, ey - 64, 210, 130, C.emerald, 0.95) + pixelScoreboard(ex - 40, ey + 60, 150, 62, accent, 0.85);
    case "COMBO":
      return [
        pixelBall(ex - 66, ey, 34, "rgba(240,246,255,0.95)"),
        px(ex - 30, ey - 8, 44, 10, accent, 0.85),
        px(ex - 30, ey + 4, 44, 10, accent, 0.7),
        pixelBall(ex + 44, ey, 34, "rgba(240,246,255,0.95)"),
        pixelStar(ex - 10, ey - 74, 20, C.gold, 0.9),
      ].join("");
    case "SNIPER":
      return pixelTarget(ex, ey, 92, "rgba(255,120,135,0.95)") + pixelBall(ex, ey, 18, "rgba(240,246,255,0.9)");
    case "TEASER":
      return lockIcon(ex, ey, 62, accent) + pixelBall(ex - 108, ey + 60, 26, "rgba(240,246,255,0.85)") + pixelStar(ex + 96, ey - 70, 18, C.gold, 0.8);
    case "RADAR":
      return pixelRadar(ex, ey, 95, accent, 0.95) + pixelBall(ex - 118, ey + 62, 24, "rgba(240,246,255,0.85)");
    case "AD":
      return pixelController(ex - 20, ey + 62, 110, accent, 0.95) + pixelCoinStack(ex + 62, ey - 8, 26, 3, 0.95) + pixelStar(ex - 108, ey - 58, 20, C.gold, 0.85);
    case "LESSON":
      return pixelGradCap(ex - 10, ey, 120, accent, 0.95) + pixelBall(ex - 116, ey + 66, 26, "rgba(240,246,255,0.85)");
    case "NEWS":
      return pixelNews(ex - 70, ey - 66, 150, accent, 0.95) + pixelMegaphone(ex - 138, ey + 60, 78, C.gold, 0.9);
    case "BRIEF":
      return pixelMegaphone(ex - 60, ey, 100, C.gold, 0.95) + pixelTicket(ex - 148, ey - 58, 132, 58, accent, 0.9);
    case "WEEKLY":
      return trophyVector(ex, ey - 6, 0.6, C.gold) + pixelChart(ex - 138, ey - 20, 110, 90, accent, 0.85);
  }
  })();
  return `<g opacity="0.62">${body}</g>`;
}

/** خانواده نمادهای کوچک — پراکندگی موضوعی روی سکوها و چمن */
function topicScatter(topic: PosterTopic, rnd: () => number, w: number, h: number, accent: string): string {
  const generic = (x: number, y: number, s: number, op: number) => {
    const pick = Math.floor(rnd() * 4);
    if (pick === 0) return pixelBall(x, y, s, `rgba(226,238,252,${op})`);
    if (pick === 1) return pixelFlag(x - s / 2, y - s, s * 1.5, accent, op * 0.9);
    if (pick === 2) return pixelBoot(x - s / 2, y - s / 2, s * 1.4, accent, op * 0.85);
    return pixelWhistle(x, y, s * 1.1, `rgba(226,238,252,${op * 0.9})`);
  };
  const arcade = (x: number, y: number, s: number, op: number) => {
    const pick = Math.floor(rnd() * 4);
    if (pick === 0) return pixelController(x, y, s * 1.6, accent, op * 0.9);
    if (pick === 1) return pixelCoinStack(x - s, y + s / 2, s * 1.2, 2, op);
    if (pick === 2) return pixelStar(x, y, s * 1.2, C.gold, op);
    return pixelTicket(x - s * 1.6, y - s * 0.6, s * 3.2, s * 1.2, accent, op * 0.9);
  };
  const media = (x: number, y: number, s: number, op: number) => {
    const pick = Math.floor(rnd() * 3);
    if (pick === 0) return pixelNews(x - s * 0.8, y - s, s * 1.6, accent, op);
    if (pick === 1) return pixelMegaphone(x - s * 1.5, y - s * 0.5, s * 1.6, C.gold, op * 0.95);
    return pixelStar(x, y, s, accent, op * 0.9);
  };
  const family = topic === "AD" || topic === "LESSON" || topic === "TEASER" || topic === "SNIPER" ? arcade : topic === "NEWS" ? media : generic;
  const out: string[] = [];
  for (let i = 0; i < 6; i++) {
    const x = 130 + rnd() * (w - 260);
    const y = h * 0.30 + rnd() * (h * 0.17);
    out.push(family(x, y, 14 + rnd() * 10, 0.13 + rnd() * 0.08));
  }
  for (let i = 0; i < 4; i++) {
    const x = 110 + rnd() * (w - 220);
    const y = h * 0.60 + rnd() * (h * 0.30);
    out.push(family(x, y, 15 + rnd() * 11, 0.16 + rnd() * 0.09));
  }
  return out.join("");
}
const A = {
  sky0: "#04060f",
  sky1: "#0a1030",
  stand0: "#1a2142",
  stand1: "#232a52",
  ledge: "#39406e",
  pole: "#39406e",
  pitch0: "#1c8a3e",
  pitch1: "#167636",
  hud: "#04060c",
  dim: "#9db0ca",
  faint: "#5c6c85",
  crowd: ["#2c3560", "#39406e", "#4a5490", "#5a6480", "#3d4a7a", "#46528c"],
};

/** پیکسل‌های ثابت — هر پوستر همیشه با همان چیدمان رندر می‌شود (Deterministic) */
function arcadeBackdrop(w: number, h: number, kind: StadiumKind, accent: string, topic: PosterTopic = "MATCH"): string {
  const rnd = seeded(kind.length * 6151 + 97);
  const theme =
    kind === "DOUBLE_WIN" ? "gold" : kind === "LOSS" ? "rain" : kind === "SNIPER" ? "sniper" : kind === "DAILY_REPORT" ? "aerial" : kind === "WIN" ? "win" : kind === "TEASER" ? "teaser" : kind === "RADAR" ? "radar" : "night";

  const sky0 = theme === "sniper" ? "#0a0618" : theme === "aerial" ? "#04120a" : A.sky0;
  const sky1 = theme === "sniper" ? "#181040" : theme === "aerial" ? "#0a2a14" : A.sky1;

  // ─── ستاره‌های پیکسلی آسمان (چانکی ۲–۴px) ───
  const stars = Array.from({ length: 84 }, () => {
    const x = Math.floor(rnd() * (w / 4)) * 4;
    const y = Math.floor(rnd() * (h * 0.24 / 4)) * 4;
    const s = rnd() > 0.82 ? 4 : 2;
    const o = 0.18 + rnd() * 0.6;
    const c = rnd() > 0.9 ? accent : "#cdd8ee";
    return `<rect x="${x}" y="${y}" width="${s}" height="${s}" fill="${c}" opacity="${o.toFixed(2)}"/>`;
  }).join("");

  // ─── سکوهای تماشاگر + جمعیت پیکسلی (grid 12px) ───
  const standTop = Math.round(h * 0.26);
  const ledge1 = Math.round(h * 0.36);
  const ledge2 = Math.round(h * 0.465);
  const pitchY0 = Math.round(h * 0.52);
  const crowdColors = [...A.crowd, accent, "#f5c542", "#3ddc97", "#38d6f5"];
  const crowd: string[] = [];
  const rows = Math.floor((pitchY0 - standTop) / 12);
  for (let r = 0; r < rows; r++) {
    const y = standTop + r * 12;
    for (let cxi = 0; cxi < Math.ceil(w / 12); cxi++) {
      if (rnd() > 0.52) continue;
      const x = cxi * 12 + 2;
      const ci = Math.floor(rnd() * crowdColors.length);
      const op = 0.5 + rnd() * 0.5;
      crowd.push(`<rect x="${x}" y="${y + 2}" width="8" height="8" fill="${crowdColors[ci]}" opacity="${op.toFixed(2)}"/>`);
    }
  }
  const stands = `
  <rect x="0" y="${standTop}" width="${w}" height="${ledge1 - standTop}" fill="${A.stand0}"/>
  <rect x="0" y="${ledge1}" width="${w}" height="6" fill="${A.ledge}"/>
  <rect x="0" y="${ledge1 + 6}" width="${w}" height="${ledge2 - ledge1 - 6}" fill="${A.stand1}"/>
  <rect x="0" y="${ledge2}" width="${w}" height="7" fill="${A.ledge}"/>
  ${crowd.join("")}`;

  // ─── برج‌های نورافکن پیکسلی ───
  const tower = (cx: number) => {
    const headY = Math.round(h * 0.055);
    const cells: string[] = [];
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 5; c++)
        cells.push(`<rect x="${cx - 44 + c * 18}" y="${headY + r * 18}" width="14" height="14" fill="${rnd() > 0.25 ? "#f8e08e" : "#c9a93e"}"/>`);
    return `
    <radialGradient id="fl-${cx}" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.34"/>
      <stop offset="55%" stop-color="${accent}" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
    <circle cx="${cx}" cy="${headY + 26}" r="300" fill="url(#fl-${cx})"/>
    <rect x="${cx - 7}" y="${headY + 54}" width="14" height="${pitchY0 - headY - 54}" fill="${A.pole}"/>
    <rect x="${cx - 24}" y="${headY + 54}" width="48" height="8" fill="${A.ledge}"/>
    ${cells.join("")}`;
  };

  // ─── چمن تخت با نوارهای پیکسلی (بدون پرسپکتیو — ۱۶ بیت واقعی) ───
  const stripes: string[] = [];
  const N = 10;
  for (let i = 0; i < N; i++) {
    const y0 = pitchY0 + ((h - pitchY0) / N) * i;
    stripes.push(`<rect x="0" y="${y0.toFixed(1)}" width="${w}" height="${((h - pitchY0) / N).toFixed(1)}" fill="${i % 2 === 0 ? A.pitch0 : A.pitch1}"/>`);
  }
  const cxp = w / 2;
  const markings = `
  <g fill="none" stroke="rgba(255,255,255,0.50)" stroke-width="4">
    <line x1="0" y1="${pitchY0}" x2="${w}" y2="${pitchY0}"/>
    <rect x="${cxp - 300}" y="${pitchY0 + 34}" width="600" height="${h - pitchY0 - 110}"/>
    <rect x="${cxp - 130}" y="${pitchY0 + 34}" width="260" height="120"/>
    <polygon points="${cxp},${pitchY0 + 60} ${cxp + 70},${pitchY0 + 90} ${cxp + 70},${pitchY0 + 140} ${cxp},${pitchY0 + 170} ${cxp - 70},${pitchY0 + 140} ${cxp - 70},${pitchY0 + 90}"/>
  </g>`;

  // ─── فایرورک پیکسلی (WIN / DOUBLE_WIN) ───
  const pixelBurst = (fx: number, fy: number, col: string) => {
    const arm = (dx: number, dy: number) => `<rect x="${fx + dx * 10 - 4}" y="${fy + dy * 10 - 4}" width="8" height="8" fill="${col}"/><rect x="${fx + dx * 20 - 3}" y="${fy + dy * 20 - 3}" width="6" height="6" fill="${col}" opacity="0.8"/>`;
    return `<g>${arm(0, 0)}${arm(1, 0)}${arm(-1, 0)}${arm(0, 1)}${arm(0, -1)}${arm(1, 1)}${arm(-1, -1)}${arm(1, -1)}${arm(-1, 1)}</g>`;
  };
  const fireworks =
    theme === "gold" || theme === "win"
      ? [pixelBurst(w * 0.18, h * 0.14, "#f5c542"), pixelBurst(w * 0.82, h * 0.12, "#3ddc97"), pixelBurst(w * 0.5, h * 0.19, accent), pixelBurst(w * 0.32, h * 0.08, "#38d6f5"), pixelBurst(w * 0.68, h * 0.22, "#f5c542")].join("")
      : "";

  // ─── باران پیکسلی (LOSS) ───
  const rain =
    theme === "rain"
      ? Array.from({ length: 90 }, () => {
          const x = Math.floor(rnd() * w);
          const y = Math.floor(rnd() * h);
          const len = 12 + Math.floor(rnd() * 18);
          return `<rect x="${x}" y="${y}" width="3" height="${len}" fill="rgba(160,190,255,0.28)"/>`;
        }).join("")
      : "";

  return `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${sky0}"/>
      <stop offset="${pitchY0}" stop-color="${sky1}"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  ${stars}
  ${tower(130)}
  ${tower(w - 130)}
  ${stands}
  ${stripes.join("")}
  ${markings}
  ${fireworks}
  ${rain}
  <rect width="${w}" height="${h}" fill="rgba(2,6,14,0.32)"/>
  ${topicScatter(topic, rnd, w, h, accent)}
  ${topicEmblem(topic, accent)}`;
}

/** لایه CRT روی کل پوستر — scanline + vignette (احساس مانیتور آرکید ۱۶ بیتی) */
function crtOverlay(w: number, h: number): string {
  return `
  <defs>
    <pattern id="crt-scan" width="4" height="4" patternUnits="userSpaceOnUse">
      <rect width="4" height="2" fill="rgba(0,0,0,0.14)"/>
    </pattern>
    <radialGradient id="crt-vig" cx="50%" cy="46%" r="74%">
      <stop offset="56%" stop-color="rgba(0,0,0,0)"/>
      <stop offset="100%" stop-color="rgba(0,0,8,0.52)"/>
    </radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#crt-scan)"/>
  <rect width="${w}" height="${h}" fill="url(#crt-vig)"/>`;
}

/** هدر آرکید HUD — NEOBET QUANT PRO • @AINEOBET (سبک نوار بالای بازی‌های ۱۶ بیتی) */
function brandHeader(w: number, accent: string, right = BRAND_HANDLE, tierColor: string = C.gold): string {
  return `
  <rect x="0" y="0" width="${w}" height="92" fill="${A.hud}"/>
  <rect x="0" y="88" width="${w}" height="4" fill="${accent}"/>
  <rect x="0" y="92" width="${w}" height="3" fill="rgba(0,0,0,0.65)"/>
  <rect x="34" y="22" width="48" height="48" fill="${tierColor}"/>
  <rect x="34" y="22" width="48" height="8" fill="rgba(255,255,255,0.35)"/>
  <rect x="34" y="62" width="48" height="8" fill="rgba(0,0,0,0.35)"/>
  <text x="58" y="56" text-anchor="middle" font-family="${C.sans}" font-size="27" font-weight="bold" fill="#0a0f1c">N</text>
  <text x="96" y="44" font-family="${C.sans}" font-size="26" font-weight="bold" fill="${tierColor}" letter-spacing="3">${BRAND_TITLE}</text>
  <text x="96" y="70" font-family="${C.sans}" font-size="12.5" fill="${A.dim}" letter-spacing="3.5">${BRAND_SUB}</text>
  <rect x="${w - 128}" y="26" width="52" height="18" fill="#c86bff"/>
  <text x="${w - 102}" y="39" text-anchor="middle" font-family="${C.sans}" font-size="10.5" font-weight="bold" fill="#12061f" letter-spacing="1">16-BIT</text>
  <text x="${w - 40}" y="58" text-anchor="end" font-family="${C.sans}" font-size="19" font-weight="bold" fill="${C.cyan}" letter-spacing="1.5">${esc(right)}</text>
  <text x="${w - 40}" y="78" text-anchor="end" font-family="${C.sans}" font-size="10.5" fill="${A.faint}" letter-spacing="2">INSERT COIN → JOIN VIP</text>`;
}

/** فوتر آرکید — جان‌ها + سکه + متن سلب مسئولیت */
function footer(w: number, h: number, note: string): string {
  const heart = (x: number, y: number, c: string) =>
    `<rect x="${x}" y="${y}" width="10" height="4" fill="${c}"/><rect x="${x - 3}" y="${y - 4}" width="6" height="4" fill="${c}"/><rect x="${x + 7}" y="${y - 4}" width="6" height="4" fill="${c}"/><rect x="${x}" y="${y + 4}" width="10" height="3" fill="${c}"/><rect x="${x + 2}" y="${y + 7}" width="6" height="3" fill="${c}"/>`;
  const coin = (x: number, y: number) =>
    `<rect x="${x}" y="${y}" width="14" height="14" fill="${C.gold}"/><rect x="${x + 2}" y="${y + 2}" width="10" height="10" fill="${A.hud}"/><rect x="${x + 4}" y="${y + 4}" width="6" height="6" fill="${C.gold}"/>`;
  return `
  <rect x="0" y="${h - 52}" width="${w}" height="52" fill="${A.hud}"/>
  <rect x="0" y="${h - 52}" width="${w}" height="3" fill="${C.gold}" opacity="0.65"/>
  ${heart(42, h - 32, C.rose)}${heart(60, h - 32, C.rose)}${heart(78, h - 32, "rgba(255,107,122,0.25)")}
  <text x="${w / 2}" y="${h - 19}" text-anchor="middle" font-family="${C.sans}" font-size="14.5" fill="${A.dim}">${esc(note)}</text>
  ${coin(w - 104, h - 36)}${coin(w - 82, h - 36)}
  <text x="${w - 62}" y="${h - 24}" font-family="${C.sans}" font-size="12" font-weight="bold" fill="${C.gold}" letter-spacing="1">×2</text>`;
}

/** قاب کارت آرکید — قاب پیکسلی با گوشه‌های notch (جایگزین glassBox شیشه‌ای) */
function glassBox(x: number, y: number, w: number, h: number, accent: string, _rx = 22, fillOpacity = 0.82): string {
  const s = 9;
  return `
  <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="rgba(4,8,18,${fillOpacity})"/>
  <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${accent}" stroke-opacity="0.9" stroke-width="3"/>
  <rect x="${x + 5}" y="${y + 5}" width="${w - 10}" height="${h - 10}" fill="none" stroke="${accent}" stroke-opacity="0.22" stroke-width="2"/>
  <rect x="${x - 3}" y="${y - 3}" width="${s}" height="${s}" fill="${accent}"/>
  <rect x="${x + w + 3 - s}" y="${y - 3}" width="${s}" height="${s}" fill="${accent}"/>
  <rect x="${x - 3}" y="${y + h + 3 - s}" width="${s}" height="${s}" fill="${accent}"/>
  <rect x="${x + w + 3 - s}" y="${y + h + 3 - s}" width="${s}" height="${s}" fill="${accent}"/>
  <rect x="${x}" y="${y}" width="${w}" height="6" fill="${accent}" fill-opacity="0.22"/>`;
}

/** ساعت کوچک برداری */
function clockIcon(x: number, y: number, r: number, color: string): string {
  return `
  <circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${color}" stroke-width="${Math.max(2, r * 0.18)}"/>
  <path d="M${x} ${y - r * 0.55} v${r * 0.55} l${r * 0.42} ${r * 0.28}" stroke="${color}" stroke-width="${Math.max(2, r * 0.18)}" fill="none" stroke-linecap="round"/>`;
}

/** قفل برداری */
function lockIcon(x: number, y: number, s: number, color: string): string {
  return `
  <rect x="${x - s}" y="${y - s * 0.1}" width="${s * 2}" height="${s * 1.5}" rx="${s * 0.3}" fill="${color}" fill-opacity="0.25" stroke="${color}" stroke-width="2.5"/>
  <path d="M${x - s * 0.55} ${y - s * 0.1} v${-s * 0.45} a${s * 0.55} ${s * 0.55} 0 0 1 ${s * 1.1} 0 v${s * 0.45}" fill="none" stroke="${color}" stroke-width="2.5"/>`;
}

/** جام قهرمانی برداری */
function trophyVector(cx: number, cy: number, scale: number, color: string): string {
  return `
  <g transform="translate(${cx} ${cy}) scale(${scale})" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round">
    <path d="M-70 -95 h140 v40 a70 78 0 0 1 -140 0 z" fill="${color}" fill-opacity="0.18"/>
    <path d="M-70 -85 h-38 a38 38 0 0 0 40 52"/>
    <path d="M70 -85 h38 a38 38 0 0 1 -40 52"/>
    <path d="M0 25 v34"/>
    <path d="M-30 60 h60 l12 36 h-84 z" fill="${color}" fill-opacity="0.18"/>
    <path d="M-52 96 h104"/>
    <circle cx="0" cy="-58" r="12" fill="${color}" fill-opacity="0.55" stroke="none"/>
  </g>`;
}

/** مدال دایره‌ای لوگوی باشگاه — لوگوی واقعی ESPN یا مونوگرام حروف */
function clubBadge(cx: number, cy: number, r: number, name: string, color: string, logoDataUrl: string | null): string {
  const initials = crestInitials(name);
  const font = fitSize(initials, r * 1.15, Math.round(r * 0.62), 18, 700);
  const clip = `badge-${cx}-${cy}`;
  return `
  <defs><clipPath id="${clip}"><circle cx="${cx}" cy="${cy}" r="${r - 4}"/></clipPath></defs>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="rgba(255,255,255,0.92)" stroke="${color}" stroke-width="5"/>
  ${
    logoDataUrl
      ? `<image href="${logoDataUrl}" x="${cx - (r - 10)}" y="${cy - (r - 10)}" width="${2 * (r - 10)}" height="${2 * (r - 10)}" preserveAspectRatio="xMidYMid meet" clip-path="url(#${clip})"/>`
      : `<text x="${cx}" y="${cy + font * 0.34}" text-anchor="middle" font-family="${C.sans}" font-size="${font}" font-weight="bold" fill="#132033">${esc(initials)}</text>`
  }`;
}

// ═════════════════════ فرمت‌های کمکی ═════════════════════

function fmtKickoff(iso: string): string {
  try {
    const d = new Date(iso);
    const day = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "2-digit", month: "short", timeZone: "Asia/Tehran" }).format(d);
    const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Tehran" }).format(d);
    return `${day} · ${time} Tehran`;
  } catch {
    return String(iso);
  }
}

const sign = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}`;

function crestInitials(name: string): string {
  const parts = String(name ?? "").split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

/** کامپوز نهایی v18.1: پس‌زمینه آرکید پیکسلی موضوع‌محور + لایه برداری + لایه CRT — خروجی PNG 1080×1440 (صفر آپلود) */
function compose(kind: StadiumKind, overlaySvg: string, accent: string, topic: PosterTopic = "MATCH", backdropVariant?: "ARCADE" | "SILVER"): Promise<Buffer> {
  // ═══ v20.0 — Two-Tier Visual Identity: کارت طلایی = استادیوم آرکید گرم؛
  // کارت نقره‌ای = پس‌زمینه فولادی-صنعتی کاملاً متفاوت (سند کارفرما: فلش کارت‌های
  // طلایی و نقره‌ای باید تصاویر متفاوت داشته باشند) ═══
  const backdrop = backdropVariant === "SILVER" ? silverBackdrop(W, H) : arcadeBackdrop(W, H, kind, accent, topic);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${backdrop}${overlaySvg}${crtOverlay(W, H)}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * v20.0 — پس‌زمینه «شکارچی آلفای سایه» — هویت بصری کاملاً متفاوت کارت نقره‌ای:
 * به‌جای استادیوم آرکید شبانه (کارت طلایی)، ترکیب فولادی-صنعتی:
 *   · آسمان سرد دو رنگ پلاتینیوم + خطوط مورب فولادی ۴۵ درجه
 *   · شبکه شش‌ضلعی ( Honeycomb ) در نیمه بالا + خطوط اسکن افقی
 *   · موج‌های زمین فلزی مورب به‌جای چمن افقی
 *   · مهرهای لوزی پلاتینیوم پخش در پس‌زمینه
 */
function silverBackdrop(w: number, h: number): string {
  const sky0 = "#0a0e16";
  const sky1 = "#151c2a";
  const steel = "#cdd6e4";
  const steelDim = "#8f9fb5";

  // ─── آسمان سرد + خطوط مورب فولادی (جنس کاملاً متفاوت از ستاره‌های آرکید) ───
  const diagonal: string[] = [];
  for (let i = -4; i < Math.ceil((w + h) / 56); i++) {
    const x0 = i * 56;
    diagonal.push(
      `<line x1="${x0}" y1="0" x2="${x0 + h * 0.42}" y2="${h * 0.42}" stroke="${steel}" stroke-opacity="${(i % 3 === 0 ? 0.10 : 0.05).toFixed(2)}" stroke-width="${i % 3 === 0 ? 3 : 1.6}"/>`
    );
  }

  // ─── شبکه شش‌ضلعی فولادی در نیمه بالایی ───
  const hexes: string[] = [];
  const hr = 26;
  for (let row = 0; row * hr * 1.5 < h * 0.46 + hr; row++) {
    for (let col = 0; col * hr * Math.sqrt(3) < w + hr * 2; col++) {
      const cx = col * hr * Math.sqrt(3) + (row % 2 === 1 ? hr * Math.sqrt(3) / 2 : 0);
      const cy = row * hr * 1.5;
      const pts: string[] = [];
      for (let k = 0; k < 6; k++) {
        const ang = Math.PI / 6 + (k * Math.PI) / 3;
        pts.push(`${(cx + hr * Math.cos(ang)).toFixed(1)},${(cy + hr * Math.sin(ang)).toFixed(1)}`);
      }
      hexes.push(`<polygon points="${pts.join(" ")}" fill="none" stroke="${steelDim}" stroke-opacity="0.13" stroke-width="1.4"/>`);
    }
  }

  // ─── خطوط اسکن افقی (CRT صنعتی) ───
  const scan: string[] = [];
  for (let y = 0; y < h; y += 6) {
    scan.push(`<rect x="0" y="${y}" width="${w}" height="1.4" fill="${steel}" fill-opacity="0.05"/>`);
  }

  // ─── زمین فلزی مورب (به‌جای چمن افقی آرکید) ───
  const floorY = Math.round(h * 0.5);
  const floor: string[] = [];
  for (let i = 0; i < 14; i++) {
    const t = i / 14;
    const y0 = floorY + t * (h - floorY);
    const inset = Math.round(90 * (1 - t));
    floor.push(
      `<line x1="${inset}" y1="${y0.toFixed(1)}" x2="${w - inset}" y2="${y0.toFixed(1)}" stroke="${steelDim}" stroke-opacity="${(0.22 - t * 0.16).toFixed(2)}" stroke-width="${i % 2 === 0 ? 2.4 : 1.2}"/>`
    );
  }
  // پرسپکتیو شعاعی از مرکز زمین
  const rays: string[] = [];
  for (let k = -8; k <= 8; k++) {
    rays.push(`<line x1="${w / 2 + k * 22}" y1="${floorY}" x2="${w / 2 + k * 118}" y2="${h}" stroke="${steelDim}" stroke-opacity="0.12" stroke-width="1.6"/>`);
  }

  // ─── مهرهای لوزی پلاتینیوم ───
  const diamonds: string[] = [];
  const drnd = seeded(20260);
  for (let i = 0; i < 26; i++) {
    const dx = drnd() * w;
    const dy = drnd() * h * 0.48;
    const s = 5 + drnd() * 9;
    const op = 0.10 + drnd() * 0.22;
    diamonds.push(`<rect x="${dx.toFixed(1)}" y="${dy.toFixed(1)}" width="${s.toFixed(1)}" height="${s.toFixed(1)}" transform="rotate(45 ${(dx + s / 2).toFixed(1)} ${(dy + s / 2).toFixed(1)})" fill="${steel}" fill-opacity="${op.toFixed(2)}"/>`);
  }

  return `
  <defs>
    <linearGradient id="silverSky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${sky0}"/>
      <stop offset="52%" stop-color="${sky1}"/>
      <stop offset="100%" stop-color="#0b1018"/>
    </linearGradient>
    <radialGradient id="silverGlow" cx="50%" cy="18%" r="62%">
      <stop offset="0%" stop-color="${steel}" stop-opacity="0.20"/>
      <stop offset="45%" stop-color="${steel}" stop-opacity="0.06"/>
      <stop offset="100%" stop-color="${steel}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#silverSky)"/>
  ${diagonal.join("")}
  ${hexes.join("")}
  ${diamonds.join("")}
  <rect width="${w}" height="${h}" fill="url(#silverGlow)"/>
  <rect x="0" y="${floorY}" width="${w}" height="${h - floorY}" fill="#0d1320" fill-opacity="0.88"/>
  ${rays.join("")}
  ${floor.join("")}
  ${scan.join("")}
  <!-- نوار هویت نقره‌ای بالای کارت (جدا از طلایی) -->
  <rect x="0" y="0" width="${w}" height="6" fill="${steel}" fill-opacity="0.85"/>
  <rect x="0" y="10" width="${w}" height="2" fill="${steel}" fill-opacity="0.35"/>`;
}

/** data URL از بافر لوگو (برای جاسازی در SVG) */
function logoDataUrl(buf: Buffer | null): string | null {
  return buf ? `data:image/png;base64,${buf.toString("base64")}` : null;
}

// ═════════════════════ ۱) قالب PRE_MATCH — کارت تیپ بازی (1080×1440) ═════════════════════
// نقشه مختصات رسمی v12.0:
//   لوگوی میزبان: مرکز (260,290) شعاع 115 | لوگوی میهمان: مرکز (820,290) شعاع 115
//   باکس چپ تیپ A (آبی): x90 y520 w420 h530 | باکس راست تیپ B (سبز): x570 y520 w420 h530
//   نوار شیشه‌ای پایینی: x90 y1135 w900 h145

export interface MatchCardInput {
  homeTeam: string;
  awayTeam: string;
  league: string;
  kickoffIso: string;
  /** v20.0 — سطح تاج: "GOLD" | "SILVER_SHADOW" | null — دو هویت بصری کاملاً متفاوت */
  crownTier?: string | null;
  labelAEn: string;
  oddsA: number;
  stakeA: number;
  labelBEn: string;
  oddsB: number;
  stakeB: number;
  guaranteedPct: number;
  edgeA: number | null;
  edgeB: number | null;
  edgeSource: string; // PINNACLE | MARKET_FAIR
  timingTitle: string; // "EARLY FAVORITE WINDOW"
  timingDetail: string; // "Place between 19:30 - 07:30 Tehran"
  timingState: "OPEN" | "WAITING" | "LATE" | "KICKED_OFF";
  hashShort: string;
  espnUrl: string | null;
  doubleWin: boolean;
  /** v12.0 — لوگوی رسمی باشگاه (بافر PNG) — null = مونوگرام حروف */
  homeLogo?: Buffer | null;
  awayLogo?: Buffer | null;
  teaser?: boolean;
  /**
   * v13.2 — بلوک داده حرفه‌ای پوستر تجاری:
   * احتمال ۱X۲ مدل · λ · پوشش/ریسک/جکپات · امتیاز سوپروایزر · رتبه و فرم تیم‌ها · استادیوم
   */
  stats?: {
    pHome: number | null;
    pDraw: number | null;
    pAway: number | null;
    lambdaHome: number | null;
    lambdaAway: number | null;
    coveragePct: number | null;
    jointLossRiskPct: number | null;
    doubleWinProbPct: number | null;
    supervisorScore: number | null;
    score100: number | null;
    fortress: boolean;
    archetypeCode: string | null;
    archetype: string | null;
    homeRank: number | null;
    awayRank: number | null;
    homeForm: string | null;
    awayForm: string | null;
    venue: string | null;
  };
}

// ═══════════ v13.2 — دیکشنری آموزشی استراتژی هر الگو (خط پایینی پوستر) ═══════════

/** v16.0 — استراتژی رسمی ۳ الگوی طلایی تک‌دکمه‌ای (92%+ Coverage Golden Atomic Pairs) */
const STRATEGY_EN: Record<string, { title: string; line: string }> = {
  G1: {
    title: "GOLDEN PATTERN 1 · FAV TEAM O1.5 × U2.5",
    line: "Favorite Team Total Over 1.5 with Match Under 2.5 — favorite scores 2+ pays Tip A, a low-scoring game pays Tip B, and 2-0 pays both (Double-Win). 0-0 / 1-0 / 0-1 are always covered.",
  },
  G2: {
    title: "GOLDEN PATTERN 2 · HOME WIN × U2.5",
    line: "Full-Time Result: 1 with Match Under 2.5 — every home win pays Tip A, low-score draws and economic away wins pay Tip B, and 1-0 / 2-0 pay both (Double-Win).",
  },
  G3: {
    title: "GOLDEN PATTERN 3 · BTTS VS WIN TO NIL",
    line: "Both Teams To Score: Yes against Favorite Win to Nil (~2.95x) — if the underdog scores Tip A pays, if the favorite keeps a clean sheet Tip B pays. Proven 91.3% win rate.",
  },
  // کدهای الگوی نسخه‌های قبلی — فقط برای کارت‌های تاریخی دفتر
  A1: {
    title: "LEGACY PATTERN A1 · 1X COVER",
    line: "Legacy v15 pattern — retired in v16.0 after the 0-1 away-win gap audit (−438.8u). Replaced by Golden Patterns with 92%+ matrix coverage.",
  },
  A2: {
    title: "LEGACY PATTERN A2 · GOALS SPLIT",
    line: "Legacy v15 pattern — retired in v16.0 after the 0-0 / 1-0 coverage-gap audit (−263.3u). Replaced by Golden Patterns with 92%+ matrix coverage.",
  },
  A3: {
    title: "LEGACY PATTERN A3 · BTTS VS CLEAN SHEET",
    line: "Legacy v15 champion pattern — evolved into Golden Pattern 3 in v16.0.",
  },
  A4: {
    title: "LEGACY PATTERN A4 · HANDICAP SPLIT",
    line: "Legacy v15 pattern — retired in v16.0 in favor of Golden Patterns with 92%+ matrix coverage.",
  },
};
const STRATEGY_DEFAULT = {
  title: "ATOMIC DUTCH COVER",
  line: "Two official single-button markets split a 100-unit stake so either winning outcome pays the same guaranteed profit — zero same-game multiplication.",
};

/** نقطه‌های فرم تیم (W/D/L) — ۵ بازی آخر */
function formDots(form: string | null, cx: number, cy: number): string {
  const seq = String(form ?? "")
    .toUpperCase()
    .replace(/[^WDL]/g, "")
    .slice(-5)
    .split("");
  if (seq.length === 0) return "";
  const gap = 21;
  const x0 = cx - ((seq.length - 1) * gap) / 2;
  return seq
    .map((ch, i) => {
      const color = ch === "W" ? C.emerald : ch === "L" ? C.rose : "#93a7c4";
      return `<circle cx="${(x0 + i * gap).toFixed(1)}" cy="${cy}" r="7.5" fill="${color}" fill-opacity="0.92"/>`;
    })
    .join("");
}

/** چیپ رتبه فصل تیم */
function rankChip(cx: number, cy: number, rank: number | null): string {
  if (!rank || rank <= 0) return "";
  return `
  <rect x="${cx - 44}" y="${cy - 16}" width="88" height="30" rx="15" fill="rgba(6,10,20,0.7)" stroke="rgba(255,255,255,0.22)" stroke-width="1.2"/>
  <text x="${cx}" y="${cy + 5}" text-anchor="middle" font-family="${C.sans}" font-size="14.5" font-weight="bold" fill="${C.inkDim}" letter-spacing="1">RANK ${rank}</text>`;
}

/** نوار احتمال ۱X۲ مدل — سه‌بخشی تجاری با برچسب درصد */
function probBar1x2(pHome: number, pDraw: number, pAway: number, x: number, y: number, w: number, h: number): string {
  const total = Math.max(0.0001, pHome + pDraw + pAway);
  const hW = (pHome / total) * w;
  const dW = (pDraw / total) * w;
  const aW = (pAway / total) * w;
  const seg = (sx: number, sw: number, color: string, fillOp: string) =>
    `<rect x="${sx.toFixed(1)}" y="${y}" width="${sw.toFixed(1)}" height="${h}" fill="${color}" fill-opacity="${fillOp}"/>`;
  return `
  <g>
    ${seg(x, hW, C.cyan, "0.55")}
    ${seg(x + hW, dW, "#93a7c4", "0.4")}
    ${seg(x + hW + dW, aW, C.emerald, "0.55")}
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="1.6"/>
    ${
      hW > 62
        ? `<text x="${x + hW / 2}" y="${y + h / 2 + 7}" text-anchor="middle" font-family="${C.mono}" font-size="19" font-weight="bold" fill="${C.ink}">${Math.round(pHome * 100)}%</text><text x="${x + hW / 2}" y="${y + h + 24}" text-anchor="middle" font-family="${C.sans}" font-size="13.5" fill="${C.cyan}" letter-spacing="1.5">HOME</text>`
        : `<text x="${x + hW / 2}" y="${y - 10}" text-anchor="middle" font-family="${C.mono}" font-size="15" font-weight="bold" fill="${C.cyan}">${Math.round(pHome * 100)}%</text>`
    }
    ${
      dW > 62
        ? `<text x="${x + hW + dW / 2}" y="${y + h / 2 + 7}" text-anchor="middle" font-family="${C.mono}" font-size="19" font-weight="bold" fill="${C.ink}">${Math.round(pDraw * 100)}%</text><text x="${x + hW + dW / 2}" y="${y + h + 24}" text-anchor="middle" font-family="${C.sans}" font-size="13.5" fill="${C.inkDim}" letter-spacing="1.5">DRAW</text>`
        : ""
    }
    ${
      aW > 62
        ? `<text x="${x + hW + dW + aW / 2}" y="${y + h / 2 + 7}" text-anchor="middle" font-family="${C.mono}" font-size="19" font-weight="bold" fill="${C.ink}">${Math.round(pAway * 100)}%</text><text x="${x + hW + dW + aW / 2}" y="${y + h + 24}" text-anchor="middle" font-family="${C.sans}" font-size="13.5" fill="${C.emerald}" letter-spacing="1.5">AWAY</text>`
        : `<text x="${x + w - 4}" y="${y - 10}" text-anchor="end" font-family="${C.mono}" font-size="15" font-weight="bold" fill="${C.emerald}">${Math.round(pAway * 100)}%</text>`
    }
  </g>`;
}

/** نشان (badge) دایره‌ای کوچک با آیکون برداری + متن */
function statBadge(x: number, y: number, w: number, icon: "crown" | "shield" | "target" | "vault", label: string, value: string, color: string): string {
  const icons: Record<string, string> = {
    crown: `<path d="M${x + 18} ${y + 16} l6 8 h10 l6 -8 v13 h-22 z" fill="${color}" fill-opacity="0.9"/>`,
    shield: `<path d="M${x + 14} ${y + 12} l6 -3 6 3 v7 c0 4 -3 6.5 -6 8 c-3 -1.5 -6 -4 -6 -8 z" fill="none" stroke="${color}" stroke-width="2.2"/>`,
    target: `<circle cx="${x + 20}" cy="${y + 20}" r="8.5" fill="none" stroke="${color}" stroke-width="2.2"/><circle cx="${x + 20}" cy="${y + 20}" r="2.6" fill="${color}"/>`,
    vault: `<rect x="${x + 12}" y="${y + 12}" width="16" height="15" rx="3" fill="none" stroke="${color}" stroke-width="2.2"/><circle cx="${x + 20}" cy="${y + 19.5}" r="3.4" fill="none" stroke="${color}" stroke-width="1.8"/><path d="M${x + 20} ${y + 16.5} v6 M${x + 16.5} ${y + 19.5} h7" stroke="${color}" stroke-width="1.4"/>`,
  };
  return `
  <rect x="${x}" y="${y}" width="${w}" height="40" rx="20" fill="rgba(6,10,20,0.78)" stroke="${color}" stroke-opacity="0.55" stroke-width="1.6"/>
  ${icons[icon]}
  <text x="${x + 42}" y="${y + 17}" font-family="${C.sans}" font-size="12.5" fill="${C.inkDim}" letter-spacing="1.2">${esc(label)}</text>
  <text x="${x + 42}" y="${y + 33}" font-family="${C.mono}" font-size="15.5" font-weight="bold" fill="${color}">${esc(value)}</text>`;
}

export async function renderMatchCardPNG(input: MatchCardInput): Promise<Buffer> {
  const dw = input.doubleWin;
  // ═══ v20.0 — Two-Tier Visual Identity: طلایی ۱۰۰u در برابر نقره‌ای ۵۰u ═══
  // کارت طلایی: پالت طلایی گرم + نوار GOLD CROWN TIER 1
  // کارت نقره‌ای: پالت پلاتینیوم سرد + نوار SILVER TIER 2 + مُهر HALF-KELLY 50u
  const isSilver = input.crownTier === "SILVER_SHADOW";
  const SILVER = "#cdd6e4";
  const tierColor = isSilver ? SILVER : C.gold;
  const tierLabel = isSilver ? "SILVER TIER 2 · SHADOW ALPHA HUNTER · HALF-KELLY 50u" : "GOLD CROWN TIER 1 · FULL 100u TICKET";
  const accent = isSilver ? SILVER : dw ? C.gold : C.cyan;
  const st = input.stats;
  const homeLogo = logoDataUrl(input.homeLogo ?? null);
  const awayLogo = logoDataUrl(input.awayLogo ?? null);

  // متن تیپ‌ها داخل باکس‌های ۴۲۰px
  const aLines = wrapText(input.labelAEn, 420 - 56, 24, 400, 4);
  const bLines = input.teaser
    ? ["Full complementary pick +", "stake locked for", "VIP members"]
    : wrapText(input.labelBEn, 420 - 56, 24, 400, 4);
  const tLines = wrapText(input.timingDetail, 900 - 300, 21, 400, 2);
  const homeSize = fitSize(input.homeTeam, 380, 30, 15, 700);
  const awaySize = fitSize(input.awayTeam, 380, 30, 15, 700);
  // v13.5 — «هیچ کلمه فارسی در تصویر»: نام لیگ فارسی به معادل رسمی انگلیسی نگاشت می‌شود
  const leagueEn = enLeagueLabel(input.league);
  const leagueSize = fitSize(leagueEn, 500, 23, 14, 600);

  // ─── v13.2 — استراتژی آموزشی الگو ───
  const strategy = STRATEGY_EN[st?.archetypeCode ?? ""] ?? STRATEGY_DEFAULT;
  const strategyLines = wrapText(strategy.line, 900 - 240, 16, 400, 2);

  // ─── v13.2 — نشان‌های بالای کارت (امتیاز سوپروایزر/دژ/جکپات) ───
  const badgeSpecs: { icon: "crown" | "shield" | "target" | "vault"; label: string; value: string; color: string }[] = [];
  {
    const score = st?.score100 ?? null;
    const risk = st?.jointLossRiskPct ?? null;
    const jw = st?.doubleWinProbPct ?? null;
    if (score !== null) badgeSpecs.push({ icon: "crown", label: "SUPERVISOR SCORE", value: `${score}/100`, color: C.gold });
    if (st?.fortress) badgeSpecs.push({ icon: "vault", label: "FORTRESS MODE", value: "RISK < 7%", color: C.emerald });
    else if (risk !== null) badgeSpecs.push({ icon: "shield", label: "JOINT-LOSS RISK", value: `${risk.toFixed(1)}%`, color: risk < 10 ? C.emerald : C.rose });
    if (jw !== null && jw > 0.2) badgeSpecs.push({ icon: "target", label: "DOUBLE-WIN CHANCE", value: `${jw.toFixed(1)}%`, color: C.cyan });
  }
  const badgeW = 236;
  const badgeGap = 18;
  const badgesStartX = (W - (badgeSpecs.length * badgeW + Math.max(0, badgeSpecs.length - 1) * badgeGap)) / 2;
  const badges = badgeSpecs.map((b, i) => statBadge(badgesStartX + i * (badgeW + badgeGap), 160, badgeW, b.icon, b.label, b.value, b.color));

  // ─── v13.2 — نوار احتمال ۱X۲ + λ ───
  const pHome = st?.pHome ?? null;
  const pDraw = st?.pDraw ?? null;
  const pAway = st?.pAway ?? null;
  const hasProbs = pHome != null && pAway != null;
  const lambdaLine =
    st?.lambdaHome != null && st?.lambdaAway != null
      ? `MODEL GOALS λ  ${st.lambdaHome.toFixed(2)} — ${st.lambdaAway.toFixed(2)}`
      : null;

  const overlay = `
  ${brandHeader(W, accent, BRAND_HANDLE, tierColor)}
  <!-- v20.0 — نوار هویت سطح تاج: طلایی/نقره‌ای (بدون تداخل با چیپ لیگ) -->
  <rect x="0" y="95" width="${W}" height="15" fill="rgba(4,8,16,0.88)"/>
  <rect x="0" y="95" width="${W}" height="2" fill="${tierColor}" opacity="0.9"/>
  <text x="740" y="107" text-anchor="middle" font-family="${C.sans}" font-size="12.5" font-weight="bold" fill="${tierColor}" letter-spacing="3.5">${esc(tierLabel)}</text>

  <!-- لیگ + زمان -->
  <rect x="90" y="108" width="${textWidth(leagueEn, leagueSize, 600) + 56}" height="44" rx="22" fill="rgba(6,10,20,0.75)" stroke="rgba(56,214,245,0.5)" stroke-width="1.5"/>
  <circle cx="118" cy="130" r="7" fill="${C.cyan}"/>
  <text x="138" y="138" font-family="${C.sans}" font-size="${leagueSize}" font-weight="600" fill="${C.cyan}">${esc(leagueEn)}</text>
  <text x="${W - 90}" y="130" text-anchor="end" font-family="${C.sans}" font-size="21" fill="${C.inkDim}">${esc(fmtKickoff(input.kickoffIso))}</text>

  <!-- نشان‌های داده v13.2 -->
  ${badges.join("")}

  <!-- لوگوی باشگاه‌ها + فرم/رتبه -->
  ${clubBadge(260, 296, 100, input.homeTeam, C.cyan, homeLogo)}
  ${clubBadge(820, 296, 100, input.awayTeam, C.emerald, awayLogo)}
  <text x="260" y="436" text-anchor="middle" font-family="${C.sans}" font-size="${homeSize}" font-weight="bold" fill="${C.ink}">${esc(input.homeTeam)}</text>
  <text x="820" y="436" text-anchor="middle" font-family="${C.sans}" font-size="${awaySize}" font-weight="bold" fill="${C.ink}">${esc(input.awayTeam)}</text>
  ${formDots(st?.homeForm ?? null, 260, 462)}
  ${formDots(st?.awayForm ?? null, 820, 462)}
  ${rankChip(260, 496, st?.homeRank ?? null)}
  ${rankChip(820, 496, st?.awayRank ?? null)}
  <rect x="${W / 2 - 52}" y="268" width="104" height="56" rx="14" fill="rgba(4,8,16,0.78)" stroke="rgba(255,255,255,0.2)"/>
  <text x="${W / 2}" y="306" text-anchor="middle" font-family="${C.sans}" font-size="26" font-weight="bold" fill="${C.gold}">VS</text>

  <!-- ═══ v15.0 — نشان رسمی قانون تسویه (Settlement Rule Badge) ═══ -->
  <rect x="${W / 2 - 118}" y="344" width="236" height="42" rx="21" fill="rgba(6,10,20,0.82)" stroke="rgba(245,197,66,0.55)" stroke-width="1.5"/>
  <text x="${W / 2}" y="372" text-anchor="middle" font-family="${C.sans}" font-size="15.5" font-weight="bold" fill="${C.gold}" letter-spacing="1.2">⏱ 90 MIN · REGULAR TIME ONLY</text>

  <!-- ═══ نوار احتمال مدل 1X2 + λ (جزئیات داده تجاری) ═══ -->
  ${
    hasProbs && pHome != null && pAway != null
      ? `
  <text x="90" y="530" font-family="${C.sans}" font-size="15.5" font-weight="bold" fill="${C.inkDim}" letter-spacing="2">AI MODEL WIN PROBABILITY (1X2)</text>
  ${probBar1x2(pHome, pDraw ?? 0, pAway, 90, 544, 900, 32)}
  ${lambdaLine ? `<text x="${W - 90}" y="530" text-anchor="end" font-family="${C.mono}" font-size="14.5" fill="${C.inkFaint}">${esc(lambdaLine)}</text>` : ""}`
      : ""
  }

  <!-- ═══ باکس تیپ A (چپ - آبی) ═══ -->
  ${glassBox(90, 614, 420, 408, C.cyan)}
  <text x="118" y="656" font-family="${C.sans}" font-size="18" font-weight="bold" fill="${C.cyan}" letter-spacing="2.5">TIP A · JUDGE SIDE</text>
  <text x="482" y="700" text-anchor="end" font-family="${C.mono}" font-size="40" font-weight="bold" fill="${C.cyan}">@${input.oddsA.toFixed(2)}</text>
  <text x="118" y="758" font-family="${C.sans}" font-size="24" fill="${C.ink}">${tspans(aLines, 118, 758, 34)}</text>
  <rect x="118" y="912" width="364" height="52" rx="13" fill="rgba(0,0,0,0.5)"/>
  <text x="140" y="946" font-family="${C.sans}" font-size="17" fill="${C.inkDim}">DUTCH STAKE</text>
  <text x="460" y="948" text-anchor="end" font-family="${C.mono}" font-size="26" font-weight="bold" fill="${C.ink}">${input.stakeA.toFixed(1)} u</text>
  <text x="118" y="994" font-family="${C.sans}" font-size="16" fill="${C.inkDim}">VALUE vs ${input.edgeSource === "PINNACLE" ? "PINNACLE" : "FAIR"} LINE</text>
  <text x="460" y="994" text-anchor="end" font-family="${C.mono}" font-size="20" font-weight="bold" fill="${input.edgeA !== null && input.edgeA >= 0 ? C.emerald : C.rose}">${input.edgeA !== null ? sign(input.edgeA) + "%" : "—"}</text>

  <!-- ═══ باکس تیپ B (راست - سبز/قفل) ═══ -->
  ${input.teaser ? glassBox(570, 614, 420, 408, C.gold) : glassBox(570, 614, 420, 408, C.emerald)}
  <text x="598" y="656" font-family="${C.sans}" font-size="18" font-weight="bold" fill="${input.teaser ? C.gold : C.emerald}" letter-spacing="2.5">TIP B · COMPLEMENT</text>
  ${
    input.teaser
      ? `<g>${lockIcon(880, 648, 13, C.gold)}<text x="962" y="700" text-anchor="end" font-family="${C.sans}" font-size="26" font-weight="bold" fill="${C.gold}" letter-spacing="2">LOCKED</text></g>`
      : `<text x="962" y="700" text-anchor="end" font-family="${C.mono}" font-size="40" font-weight="bold" fill="${C.emerald}">@${input.oddsB.toFixed(2)}</text>`
  }
  <text x="598" y="758" font-family="${C.sans}" font-size="24" fill="${C.ink}">${tspans(bLines, 598, 758, 34)}</text>
  <rect x="598" y="912" width="364" height="52" rx="13" fill="rgba(0,0,0,0.5)"/>
  <text x="620" y="946" font-family="${C.sans}" font-size="17" fill="${C.inkDim}">DUTCH STAKE</text>
  ${
    input.teaser
      ? `<text x="940" y="948" text-anchor="end" font-family="${C.sans}" font-size="23" font-weight="bold" fill="${C.gold}">VIP ONLY</text>`
      : `<text x="940" y="948" text-anchor="end" font-family="${C.mono}" font-size="26" font-weight="bold" fill="${C.ink}">${input.stakeB.toFixed(1)} u</text>`
  }
  <text x="598" y="994" font-family="${C.sans}" font-size="16" fill="${C.inkDim}">VALUE vs ${input.edgeSource === "PINNACLE" ? "PINNACLE" : "FAIR"} LINE</text>
  <text x="940" y="994" text-anchor="end" font-family="${C.mono}" font-size="20" font-weight="bold" fill="${input.edgeB !== null && input.edgeB >= 0 ? C.emerald : C.rose}">${input.edgeB !== null ? sign(input.edgeB) + "%" : "—"}</text>

  <!-- ═══ نوار پوشش/ریسک/جکپات — جزئیات داده ═══ -->
  ${
    st?.coveragePct != null
      ? `
  <rect x="90" y="1036" width="900" height="46" rx="14" fill="rgba(6,10,20,0.75)" stroke="${C.line}"/>
  <text x="${W / 2}" y="1066" text-anchor="middle" font-family="${C.mono}" font-size="18.5" fill="${C.inkDim}">COVERS <tspan fill="${C.emerald}" font-weight="bold">${st.coveragePct.toFixed(1)}%</tspan> OF SCOREBOARD  ·  JOINT-LOSS RISK <tspan fill="${(st.jointLossRiskPct ?? 0) < 10 ? C.emerald : C.rose}" font-weight="bold">${(st.jointLossRiskPct ?? 0).toFixed(1)}%</tspan>  ·  DOUBLE-WIN <tspan fill="${C.gold}" font-weight="bold">${(st.doubleWinProbPct ?? 0).toFixed(1)}%</tspan></text>`
      : ""
  }

  <!-- ═══ نوار شیشه‌ای پایینی — سود تضمینی + بهترین زمان ثبت ═══ -->
  ${glassBox(90, 1096, 900, 132, tierColor, 20)}
  <text x="${W / 2}" y="1134" text-anchor="middle" font-family="${C.sans}" font-size="19" font-weight="bold" fill="${tierColor}" letter-spacing="2.5">${isSilver ? "SILVER HALF-KELLY GUARANTEE" : (st && (st.archetypeCode === "BANKER" || st.archetypeCode === "ACC") ? "WIN-SCENARIO PROFIT · SINGLE COLUMN" : "GUARANTEED COVER PROFIT")} · ${esc(input.timingTitle)}</text>
  <text x="290" y="1190" text-anchor="middle" font-family="${C.mono}" font-size="34" font-weight="bold" fill="${tierColor}">${input.guaranteedPct >= 0 ? "+" : "−"}${Math.abs(input.guaranteedPct).toFixed(1)}%</text>
  ${
    isSilver
      ? `<!-- v20.0 — مهر تیرکام نقره‌ای (ویژه کارت سطح ۲) -->
  <rect x="560" y="1158" width="176" height="40" rx="20" fill="rgba(205,214,228,0.14)" stroke="${SILVER}" stroke-width="1.6"/>
  <text x="648" y="1184" text-anchor="middle" font-family="${C.sans}" font-size="15" font-weight="bold" fill="${SILVER}" letter-spacing="2">TIER-2 · 50u</text>`
      : `<rect x="408" y="1156" width="128" height="34" rx="17" fill="${input.timingState === "OPEN" ? "rgba(61,220,151,0.18)" : "rgba(245,197,66,0.16)"}" stroke="${input.timingState === "OPEN" ? C.emerald : C.gold}" stroke-width="1.6"/>
  <text x="472" y="1179" text-anchor="middle" font-family="${C.sans}" font-size="14.5" font-weight="bold" fill="${input.timingState === "OPEN" ? C.emerald : C.gold}" letter-spacing="1">${input.timingState === "OPEN" ? "WINDOW OPEN" : input.timingState === "WAITING" ? "UPCOMING" : input.timingState === "LATE" ? "CLOSING" : "KICKED OFF"}</text>`
  }
  <text x="775" y="1190" text-anchor="middle" font-family="${C.sans}" font-size="16" fill="${C.inkDim}">${esc(tLines.join(" · "))}</text>

  <!-- ═══ خط آموزشی استراتژی v13.2 ═══ -->
  <rect x="90" y="1240" width="900" height="86" rx="14" fill="rgba(6,10,20,0.72)" stroke="${isSilver ? "rgba(205,214,228,0.35)" : "rgba(56,214,245,0.35)"}" stroke-width="1.4"/>
  <text x="118" y="1269" font-family="${C.sans}" font-size="15" font-weight="bold" fill="${isSilver ? SILVER : C.cyan}" letter-spacing="1.6">${isSilver ? "SILVER DOCTRINE ·" : "📚 STRATEGY ·"} ${esc(strategy.title)}</text>
  <text x="118" y="1293" font-family="${C.sans}" font-size="15.5" fill="${C.inkDim}">${tspans(strategyLines, 118, 1293, 20)}</text>

  <!-- هش -->
  <rect x="90" y="1338" width="900" height="48" rx="12" fill="rgba(0,0,0,0.55)" stroke="${C.line}"/>
  <text x="118" y="1370" font-family="${C.mono}" font-size="18" fill="${C.gold}">SHA-256</text>
  <text x="238" y="1370" font-family="${C.mono}" font-size="18" fill="${C.inkDim}">${esc(input.hashShort)}…</text>
  <text x="${W - 118}" y="1370" text-anchor="end" font-family="${C.mono}" font-size="17" fill="${C.cyan}">${input.espnUrl ? "VERIFY: espn.com/soccer" : "ESPN-GRADED"} · ${BRAND_HANDLE}</text>

  ${footer(W, H, "NEOBET QUANT PRO · auto-graded on official ESPN scoreboard · not financial advice")}`;

  return compose("PRE_MATCH", overlay, accent, "MATCH", isSilver ? "SILVER" : "ARCADE");
}

export async function renderTeaserPNG(input: Omit<MatchCardInput, "teaser">): Promise<Buffer> {
  return renderMatchCardPNG({ ...input, teaser: true });
}

// ═════════════════════ ۲-۴) قالب‌های نتیجه — WIN / LOSS / DOUBLE_WIN (1080×1440) ═════════════════════

export type ResultKind = "WON_A" | "WON_B" | "DOUBLE_WIN" | "MIDDLE_TRAP";

export interface ResultImageInput {
  homeTeam: string;
  awayTeam: string;
  score: string; // "3-1"
  league: string;
  kind: ResultKind;
  netProfit: number;
  formula?: string;
  hashShort: string;
  /** v12.0 — سهم سود هر تیپ برای کارت DOUBLE_WIN */
  profitA?: number | null;
  profitB?: number | null;
  /** v12.0 — استیک هر تیپ برای باکس‌های طلایی */
  stakeAHint?: number | null;
  stakeBHint?: number | null;
  /** v12.0 — ضریب هر تیپ */
  oddsAHint?: number | null;
  oddsBHint?: number | null;
  /** v12.0 — وین‌ریت لحظه‌ای کانال برای نوار پایینی WIN */
  winRatePct?: number | null;
  /** درس کالیبراسیون برای نوار پایینی LOSS */
  lesson?: string | null;
  /** v12.0 — لوگوی رسمی باشگاه‌ها */
  homeLogo?: Buffer | null;
  awayLogo?: Buffer | null;
}

const RESULT_META: Record<ResultKind, { title: string; sub: string; accent: string; soft: string }> = {
  WON_A: { title: "TIP A WON", sub: "Settled automatically on the official ESPN final score", accent: C.emerald, soft: C.emeraldSoft },
  WON_B: { title: "TIP B WON", sub: "Settled automatically on the official ESPN final score", accent: C.emerald, soft: C.emeraldSoft },
  DOUBLE_WIN: { title: "DOUBLE-WIN JACKPOT", sub: "Both complementary tips won the same moment — golden sweep", accent: C.gold, soft: C.goldSoft },
  MIDDLE_TRAP: { title: "MIDDLE TRAP", sub: "Both tips lost — honestly recorded for full transparency", accent: C.rose, soft: C.roseSoft },
};

export async function renderResultPNG(input: ResultImageInput): Promise<Buffer> {
  const meta = RESULT_META[input.kind];
  const jackpot = input.kind === "DOUBLE_WIN";
  const loss = input.kind === "MIDDLE_TRAP";
  const kind: StadiumKind = jackpot ? "DOUBLE_WIN" : loss ? "LOSS" : "WIN";

  // هندسه اختصاصی هر قالب طبق نقشه مختصات v12.0
  const geo = jackpot
    ? { homeCx: 310, awayCx: 770, cy: 430, r: 110, boxX: 145, boxY: 610, boxW: 385, boxH: 425, barX: 115, barY: 1190, barW: 850, barH: 115 }
    : loss
      ? { homeCx: 370, awayCx: 710, cy: 430, r: 110, boxX: 130, boxY: 610, boxW: 820, boxH: 235, barX: 130, barY: 1215, barW: 820, barH: 90 }
      : { homeCx: 380, awayCx: 700, cy: 480, r: 110, boxX: 175, boxY: 675, boxW: 730, boxH: 300, barX: 95, barY: 1210, barW: 890, barH: 115 };

  const homeLogo = logoDataUrl(input.homeLogo ?? null);
  const awayLogo = logoDataUrl(input.awayLogo ?? null);
  const [hg, ag] = input.score.split(/[-:–]/).map((x) => x.trim());
  const profit = input.netProfit;
  const homeSize = fitSize(input.homeTeam, 360, 28, 14, 700);
  const awaySize = fitSize(input.awayTeam, 360, 28, 14, 700);
  const leagueEn = enLeagueLabel(input.league);
  const leagueSize = fitSize(`${leagueEn} · FT · OFFICIAL ESPN SCOREBOARD`, 760, 20, 13, 400);
  const winRate = input.winRatePct;
  const barLine =
    input.kind === "DOUBLE_WIN"
      ? "SUM OF BOTH GOLDEN TIPS · SINGLE MOMENT"
      : loss
        ? "CALIBRATION LESSON RECORDED · SHADOW DOCTRINE UPDATED"
        : "NET RESULT · 100-UNIT DUTCH TICKET";

  // سناریوی مرکزی
  const centerX = geo.boxX + geo.boxW / 2;
  let centerContent = "";
  if (jackpot) {
    const pa = input.profitA ?? null;
    const pb = input.profitB ?? null;
    centerContent = `
    <text x="${centerX}" y="${geo.boxY + 58}" text-anchor="middle" font-family="${C.mono}" font-size="52" font-weight="bold" fill="${C.ink}">${esc(hg ?? "0")} − ${esc(ag ?? "0")}</text>
    <text x="${geo.boxX + 24}" y="${geo.boxY + 116}" font-family="${C.sans}" font-size="17" font-weight="bold" fill="${C.gold}" letter-spacing="2">TIP A GOLDEN LEG</text>
    <text x="${geo.boxX + 24}" y="${geo.boxY + 152}" font-family="${C.mono}" font-size="30" font-weight="bold" fill="${C.gold}">${pa !== null ? sign(pa) : sign(profit / 2)} u</text>
    <line x1="${geo.boxX + 24}" y1="${geo.boxY + 180}" x2="${geo.boxX + geo.boxW - 24}" y2="${geo.boxY + 180}" stroke="rgba(255,255,255,0.12)" stroke-width="2"/>
    <text x="${geo.boxX + 24}" y="${geo.boxY + 226}" font-family="${C.sans}" font-size="17" font-weight="bold" fill="${C.gold}" letter-spacing="2">TIP B GOLDEN LEG</text>
    <text x="${geo.boxX + 24}" y="${geo.boxY + 262}" font-family="${C.mono}" font-size="30" font-weight="bold" fill="${C.gold}">${pb !== null ? sign(pb) : sign(profit / 2)} u</text>
    <text x="${geo.boxX + 24}" y="${geo.boxY + 316}" font-family="${C.sans}" font-size="15" fill="${C.inkDim}">${esc(input.formula ?? "")}</text>
    <rect x="${geo.boxX + 20}" y="${geo.boxY + 336}" width="${geo.boxW - 40}" height="60" rx="12" fill="rgba(0,0,0,0.45)"/>
    <text x="${centerX}" y="${geo.boxY + 376}" text-anchor="middle" font-family="${C.mono}" font-size="30" font-weight="bold" fill="${C.gold}">${sign(profit)} units</text>`;
  } else {
    const scoreY = geo.boxY + 96;
    centerContent = `
    <g text-anchor="middle" font-family="${C.mono}" font-weight="bold">
      <rect x="${centerX - 210}" y="${scoreY - 70}" width="180" height="104" rx="16" fill="rgba(0,0,0,0.5)" stroke="${meta.accent}" stroke-opacity="0.6" stroke-width="2"/>
      <text x="${centerX - 120}" y="${scoreY + 8}" font-size="56" fill="${C.ink}">${esc(hg ?? "0")}</text>
      <rect x="${centerX + 30}" y="${scoreY - 70}" width="180" height="104" rx="16" fill="rgba(0,0,0,0.5)" stroke="${meta.accent}" stroke-opacity="0.6" stroke-width="2"/>
      <text x="${centerX + 120}" y="${scoreY + 8}" font-size="56" fill="${C.ink}">${esc(ag ?? "0")}</text>
      <text x="${centerX}" y="${scoreY - 18}" font-size="38" fill="${C.inkFaint}">−</text>
    </g>
    <text x="${centerX}" y="${geo.boxY + geo.boxH - 68}" text-anchor="middle" font-family="${C.mono}" font-size="40" font-weight="bold" fill="${profit >= 0 ? C.emerald : C.rose}">${sign(profit)} units</text>
    ${input.formula ? `<text x="${centerX}" y="${geo.boxY + geo.boxH - 34}" text-anchor="middle" font-family="${C.mono}" font-size="18" fill="${C.inkDim}">${esc(input.formula)}</text>` : ""}`;
  }

  const barCenterY = geo.barY + geo.barH / 2;
  const barContent =
    input.kind === "DOUBLE_WIN"
      ? `
    <text x="${geo.barX + 28}" y="${barCenterY - 8}" font-family="${C.sans}" font-size="18" font-weight="bold" fill="${C.gold}" letter-spacing="2">FT ${esc(hg ?? "0")}−${esc(ag ?? "0")} · GOLDEN SWEEP PROFIT</text>
    <text x="${geo.barX + 28}" y="${barCenterY + 28}" font-family="${C.mono}" font-size="30" font-weight="bold" fill="${C.gold}">${sign(profit)} units both sides</text>
    <text x="${geo.barX + geo.barW - 28}" y="${barCenterY + 6}" text-anchor="end" font-family="${C.sans}" font-size="19" font-weight="bold" fill="${C.cyan}">${BRAND_HANDLE}</text>`
      : loss
        ? `
    <text x="${geo.barX + 28}" y="${barCenterY - 6}" font-family="${C.mono}" font-size="19" fill="${C.gold}">SHA-256</text>
    <text x="${geo.barX + 150}" y="${barCenterY - 6}" font-family="${C.mono}" font-size="19" fill="${C.inkDim}">${esc(input.hashShort)}…</text>
    <text x="${geo.barX + geo.barW - 28}" y="${barCenterY - 6}" text-anchor="end" font-family="${C.sans}" font-size="15.5" fill="${C.inkDim}">${esc((input.lesson ?? "lesson recorded").slice(0, 60))}</text>
    <text x="${geo.barX + geo.barW - 28}" y="${barCenterY + 24}" text-anchor="end" font-family="${C.sans}" font-size="17" font-weight="bold" fill="${C.cyan}">${BRAND_HANDLE}</text>`
      : `
    <text x="${geo.barX + 28}" y="${barCenterY - 8}" font-family="${C.sans}" font-size="18" font-weight="bold" fill="${C.inkDim}" letter-spacing="2">NET RESULT · ESPN AUTO-GRADED</text>
    <text x="${geo.barX + 28}" y="${barCenterY + 28}" font-family="${C.mono}" font-size="28" font-weight="bold" fill="${profit >= 0 ? C.emerald : C.rose}">${sign(profit)} units</text>
    <text x="${geo.barX + geo.barW - 28}" y="${barCenterY - 8}" text-anchor="end" font-family="${C.sans}" font-size="17" fill="${C.inkDim}">CHANNEL WIN-RATE</text>
    <text x="${geo.barX + geo.barW - 28}" y="${barCenterY + 28}" text-anchor="end" font-family="${C.mono}" font-size="26" font-weight="bold" fill="${C.emerald}">${winRate != null ? `${winRate.toFixed(1)}%` : "—"} · ${BRAND_HANDLE}</text>`;

  const overlay = `
  ${brandHeader(W, meta.accent)}

  <text x="${W / 2}" y="222" text-anchor="middle" font-family="${C.sans}" font-size="46" font-weight="bold" fill="${meta.accent}" letter-spacing="4">${esc(meta.title)}</text>
  <text x="${W / 2}" y="258" text-anchor="middle" font-family="${C.sans}" font-size="19" fill="${C.inkDim}">${esc(meta.sub)}</text>

  ${jackpot ? trophyVector(W / 2, 355, 0.72, C.gold) : ""}

  <!-- لوگوی باشگاه‌ها (مختصات رسمی v12.0 برای هر قالب) -->
  ${clubBadge(geo.homeCx, geo.cy, geo.r, input.homeTeam, C.cyan, homeLogo)}
  ${clubBadge(geo.awayCx, geo.cy, geo.r, input.awayTeam, C.emerald, awayLogo)}
  <text x="${geo.homeCx}" y="${geo.cy + geo.r + 38}" text-anchor="middle" font-family="${C.sans}" font-size="${homeSize}" font-weight="bold" fill="${C.ink}">${esc(input.homeTeam)}</text>
  <text x="${geo.awayCx}" y="${geo.cy + geo.r + 38}" text-anchor="middle" font-family="${C.sans}" font-size="${awaySize}" font-weight="bold" fill="${C.ink}">${esc(input.awayTeam)}</text>

  <!-- ═══ قالب DOUBLE_WIN: دو باکس طلایی کنار هم (مختصات رسمی v12.0) ═══ -->
  ${
    jackpot
      ? `
  ${glassBox(145, 610, 385, 425, C.gold, 24)}
  <text x="337" y="668" text-anchor="middle" font-family="${C.sans}" font-size="20" font-weight="bold" fill="${C.gold}" letter-spacing="2.5">TIP A · GOLDEN LEG</text>
  <text x="337" y="742" text-anchor="middle" font-family="${C.sans}" font-size="21" fill="${C.inkDim}">${esc(input.homeTeam)} side</text>
  <text x="337" y="828" text-anchor="middle" font-family="${C.mono}" font-size="52" font-weight="bold" fill="${C.gold}">${input.profitA != null ? sign(input.profitA) : sign(profit / 2)} u</text>
  <text x="337" y="880" text-anchor="middle" font-family="${C.mono}" font-size="19" fill="${C.inkDim}">${esc(`${(input.stakeAHint ?? 0).toFixed(1)} u @ ${(input.oddsAHint ?? 0).toFixed(2)}`)}</text>
  <text x="337" y="968" text-anchor="middle" font-family="${C.sans}" font-size="16" font-weight="bold" fill="${C.emerald}" letter-spacing="2">BOTH WON · SAME MATCH</text>

  ${glassBox(550, 610, 385, 425, C.gold, 24)}
  <text x="742" y="668" text-anchor="middle" font-family="${C.sans}" font-size="20" font-weight="bold" fill="${C.gold}" letter-spacing="2.5">TIP B · GOLDEN LEG</text>
  <text x="742" y="742" text-anchor="middle" font-family="${C.sans}" font-size="21" fill="${C.inkDim}">${esc(input.awayTeam)} side</text>
  <text x="742" y="828" text-anchor="middle" font-family="${C.mono}" font-size="52" font-weight="bold" fill="${C.gold}">${input.profitB != null ? sign(input.profitB) : sign(profit / 2)} u</text>
  <text x="742" y="880" text-anchor="middle" font-family="${C.mono}" font-size="19" fill="${C.inkDim}">${esc(`${(input.stakeBHint ?? 0).toFixed(1)} u @ ${(input.oddsBHint ?? 0).toFixed(2)}`)}</text>
  <text x="742" y="968" text-anchor="middle" font-family="${C.sans}" font-size="16" font-weight="bold" fill="${C.emerald}" letter-spacing="2">ZERO RISK TAKEN</text>`
      : `
  ${glassBox(geo.boxX, geo.boxY, geo.boxW, geo.boxH, meta.accent, 24)}
  ${centerContent}`
  }
  <text x="${W / 2}" y="${geo.boxY + geo.boxH + 38}" text-anchor="middle" font-family="${C.sans}" font-size="${leagueSize}" fill="${C.inkDim}">${esc(leagueEn)} · FT · OFFICIAL ESPN SCOREBOARD</text>

  <!-- نوار شیشه‌ای پایینی -->
  ${glassBox(geo.barX, geo.barY, geo.barW, geo.barH, meta.accent, 18)}
  ${barContent}

  ${footer(W, H, "NEOBET QUANT PRO · every settlement graded on the official ESPN final score — zero simulation")}`;

  return compose(kind, overlay, meta.accent, jackpot ? "RESULT_JACKPOT" : loss ? "RESULT_LOSS" : "RESULT_WIN");
}

// ═════════════════════ ۵) قالب DAILY_REPORT — گزارش برآیند روزانه (1080×1440) ═════════════════════
// نقشه مختصات رسمی v12.0:
//   هدر تاریخ و @AINEOBET: x90 y90 w900 h170 (بدون لوگو)
//   ۴ باکس KPI در یک ردیف: y300 h220 — x:90,320,550,780 عرض 210
//   ۴ ردیف بازی تسویه‌شده: y555,720,885,1050 — x90 w900 h135
//   نوار پایینی: x90 y1215 w900 h135

export interface DailyReportInput {
  dateLabelEn: string; // "Friday, 27 Feb 2026"
  kpis: { label: string; value: string; color: string }[]; // دقیقاً ۴ عدد
  matches: { teams: string; score: string; verdict: string; profit: number }[]; // حداکثر ۴ ردیف
  dayNetProfit: number;
  daySettled: number;
  dayStaked: number;
}

export async function renderDailyReportPNG(input: DailyReportInput): Promise<Buffer> {
  const good = input.dayNetProfit >= 0;
  const accent = good ? C.emerald : C.rose;

  const kpiBoxes = input.kpis
    .slice(0, 4)
    .map((k, i) => {
      const x = 90 + i * 230;
      const vSize = fitSize(k.value, 210 - 36, 44, 20, 700);
      const lLines = wrapText(k.label, 210 - 32, 16, 600, 2);
      const labelSpans = lLines.map((l, j) => `<tspan x="${x + 105}" dy="${j === 0 ? 0 : 21}">${esc(l)}</tspan>`).join("");
      return `
    ${glassBox(x, 300, 210, 220, k.color, 18)}
    <text x="${x + 105}" y="${410}" text-anchor="middle" font-family="${C.mono}" font-size="${vSize}" font-weight="bold" fill="${k.color}">${esc(k.value)}</text>
    <text x="${x + 105}" y="${455}" text-anchor="middle" font-family="${C.sans}" font-size="16" font-weight="bold" fill="${C.inkDim}">${labelSpans}</text>`;
    })
    .join("");

  const rows = input.matches
    .slice(0, 4)
    .map((m, i) => {
      const y = 555 + i * 165;
      const teamsSize = fitSize(m.teams, 430, 24, 13, 700);
      const profitColor = m.profit > 0 ? C.emerald : m.profit < 0 ? C.rose : C.inkDim;
      return `
    ${glassBox(90, y, 900, 135, m.profit >= 0 ? C.emerald : C.rose, 16)}
    <text x="118" y="${y + 52}" font-family="${C.sans}" font-size="${teamsSize}" font-weight="bold" fill="${C.ink}">${esc(m.teams)}</text>
    <text x="118" y="${y + 92}" font-family="${C.sans}" font-size="17" fill="${C.inkDim}">${esc(m.verdict)}</text>
    <rect x="560" y="${y + 30}" width="120" height="74" rx="12" fill="rgba(0,0,0,0.5)" stroke="rgba(255,255,255,0.14)"/>
    <text x="620" y="${y + 80}" text-anchor="middle" font-family="${C.mono}" font-size="34" font-weight="bold" fill="${C.ink}">${esc(m.score)}</text>
    <text x="${960}" y="${y + 80}" text-anchor="end" font-family="${C.mono}" font-size="30" font-weight="bold" fill="${profitColor}">${sign(m.profit)} u</text>`;
    })
    .join("");

  const netSize = fitSize(`${sign(input.dayNetProfit)} units`, 480, 44, 22, 700);

  const overlay = `
  ${brandHeader(W, accent, BRAND_HANDLE)}

  <!-- هدر تاریخ -->
  ${glassBox(90, 130, 900, 130, accent, 20)}
  <text x="${W / 2}" y="188" text-anchor="middle" font-family="${C.sans}" font-size="30" font-weight="bold" fill="${C.ink}" letter-spacing="2">DAILY SETTLEMENT REPORT</text>
  <text x="${W / 2}" y="228" text-anchor="middle" font-family="${C.sans}" font-size="21" fill="${C.inkDim}">${esc(input.dateLabelEn)} · real ESPN results only</text>

  <!-- ۴ KPI -->
  ${kpiBoxes}

  <!-- ردیف بازی‌های تسویه‌شده -->
  ${rows || `<text x="${W / 2}" y="700" text-anchor="middle" font-family="${C.sans}" font-size="22" fill="${C.inkDim}">No ticket settled today — bank protected, zero loss taken.</text>`}

  <!-- نوار پایینی -->
  ${glassBox(90, 1215, 900, 135, accent, 20)}
  <text x="118" y="1266" font-family="${C.sans}" font-size="18" font-weight="bold" fill="${C.inkDim}" letter-spacing="2">REAL NET RESULT OF THE DAY · ${faEn(input.daySettled)} settled · ${faEn(input.dayStaked)} units staked</text>
  <text x="118" y="1322" font-family="${C.mono}" font-size="${netSize}" font-weight="bold" fill="${accent}">${sign(input.dayNetProfit)} units</text>
  <text x="${W - 118}" y="1300" text-anchor="end" font-family="${C.sans}" font-size="20" font-weight="bold" fill="${C.cyan}">${BRAND_HANDLE}</text>
  <text x="${W - 118}" y="1326" text-anchor="end" font-family="${C.sans}" font-size="14" fill="${C.inkDim}">NO SIMULATION · NO PAPER TRADES</text>

  ${footer(W, H, "NEOBET QUANT PRO · daily real settlement digest · not financial advice")}`;

  return compose("DAILY_REPORT", overlay, accent, "DAILY");
}

/** اعداد انگلیسی ساده برای پوستر */
function faEn(v: number): string {
  return String(Math.round(v));
}

// ═════════════════════ ۶) پوستر نردبان مرکب ۳ پله‌ای (v11.0 Rollover Ladder) ═════════════════════

export interface RolloverLadderInput {
  dateLabelEn: string;
  /** v18.0 — نام مارکت تیپ‌ها روی هر پله (انگلیسی — پاسخ مستقیم «تیپ‌ها مشخص نشده») */
  steps: { index: number; kickoffEn: string; teams: string; league: string; oddsA: number; oddsB: number; marginPct: number; tipA?: string; tipB?: string }[];
  startBank: number; // ۱۰۰
  finalBank: number;
  totalGrowthPct: number;
  principalLock: boolean; // حالت شتاب‌دهنده نامتقارن روی نردبان؟
}

export async function renderRolloverLadderPNG(input: RolloverLadderInput): Promise<Buffer> {
  const rows = input.steps.slice(0, 3);
  let bank = input.startBank;
  const stepBoxes = rows
    .map((s, i) => {
      const y = 330 + i * 250;
      const endBank = i === rows.length - 1 ? input.finalBank : (() => { const b = bank * (1 + s.marginPct / 100); bank = b; return b; })();
      const teamSize = fitSize(s.teams, 520, 26, 14, 700);
      const tips = [s.tipA, s.tipB].filter(Boolean).map((t) => String(t).toUpperCase());
      const tipLine = tips.length > 0 ? `TIP A: ${esc(tips[0])}${tips[1] ? `  ·  TIP B: ${esc(tips[1])}` : ""}` : "orthogonal dual-tip coverage";
      const tipSize = fitSize(tipLine.replace(/&amp;/g, "&"), 580, 17, 11, 700);
      return `
    ${glassBox(90, y, 900, 200, C.emerald, 20)}
    <circle cx="150" cy="${y + 100}" r="40" fill="rgba(245,197,66,0.14)" stroke="${C.gold}" stroke-width="3"/>
    <text x="150" y="${y + 112}" text-anchor="middle" font-family="${C.sans}" font-size="30" font-weight="bold" fill="${C.gold}">${i + 1}</text>
    <text x="220" y="${y + 52}" font-family="${C.sans}" font-size="${teamSize}" font-weight="bold" fill="${C.ink}">${esc(s.teams)}</text>
    <text x="220" y="${y + 84}" font-family="${C.sans}" font-size="16" fill="${C.inkDim}">${esc(enLeagueLabel(s.league))} · ${esc(s.kickoffEn)} Tehran · odds ${s.oddsA.toFixed(2)} / ${s.oddsB.toFixed(2)}</text>
    <text x="220" y="${y + 116}" font-family="${C.sans}" font-size="${tipSize}" font-weight="bold" fill="${C.cyan}" letter-spacing="1">${tipLine}</text>
    <text x="220" y="${y + 152}" font-family="${C.sans}" font-size="17" fill="${C.inkDim}">Enter with <tspan font-weight="bold" fill="${C.ink}">${bankAt(input, i).toFixed(1)} u</tspan> → guaranteed profit <tspan font-weight="bold" fill="${C.emerald}">+${s.marginPct.toFixed(1)}%</tspan></text>
    <text x="960" y="${y + 108}" text-anchor="end" font-family="${C.mono}" font-size="32" font-weight="bold" fill="${C.emerald}">${endBank.toFixed(1)} u</text>
    ${i < rows.length - 1 ? `<path d="M940 ${y + 214} l-16 -22 h10 v-30 h12 v30 h10 z" fill="${C.gold}" opacity="0.85"/>` : ""}`;
    })
    .join("");

  const overlay = `
  ${brandHeader(W, C.gold)}

  <text x="${W / 2}" y="200" text-anchor="middle" font-family="${C.sans}" font-size="38" font-weight="bold" fill="${C.gold}" letter-spacing="3">DAILY COMPOUND ROLLOVER</text>
  <text x="${W / 2}" y="240" text-anchor="middle" font-family="${C.sans}" font-size="19" fill="${C.inkDim}">3-step ladder on sub-10% joint-risk approved cards · ${esc(input.dateLabelEn)}</text>
  <rect x="${W / 2 - 240}" y="262" width="480" height="44" rx="22" fill="rgba(61,220,151,0.12)" stroke="rgba(61,220,151,0.5)" stroke-width="1.5"/>
  <text x="${W / 2}" y="291" text-anchor="middle" font-family="${C.sans}" font-size="17" font-weight="bold" fill="${C.emerald}" letter-spacing="1.5">${input.principalLock ? "PRINCIPAL-LOCK BOOSTER MODE" : "EQUAL-PROFIT DUTCH MODE"} · ATOMIC RISK GATE V15</text>

  ${stepBoxes}

  ${glassBox(90, 1135, 900, 145, C.gold, 20)}
  <text x="${W / 2}" y="1180" text-anchor="middle" font-family="${C.sans}" font-size="18" font-weight="bold" fill="${C.gold}" letter-spacing="2.5">END OF DAY COMPOUND RESULT</text>
  <text x="${W / 2}" y="1228" text-anchor="middle" font-family="${C.mono}" font-size="40" font-weight="bold" fill="${C.gold}">${input.startBank.toFixed(0)} u → ${input.finalBank.toFixed(1)} u (+${input.totalGrowthPct.toFixed(1)}%)</text>
  <text x="${W / 2}" y="1262" text-anchor="middle" font-family="${C.sans}" font-size="15" fill="${C.inkDim}">each step settles before the next kickoff · automatic ESPN grading · ${BRAND_HANDLE}</text>

  ${footer(W, H, "NEOBET QUANT PRO · rollover planner on verified sub-10% risk cards · not financial advice")}`;

  return compose("DAILY_REPORT", overlay, C.gold, "LADDER");
}

/** بانک ورودی هر پله (برای متن داخل باکس‌ها) */
function bankAt(input: RolloverLadderInput, i: number): number {
  let b = input.startBank;
  for (let k = 0; k < i; k++) b *= 1 + input.steps[k].marginPct / 100;
  return b;
}

// ═════════════════════ ۷) گزارش وین‌ریت کانال (بازبرندینگ v12) ═════════════════════

export interface WinRateReportInput {
  winRatePct: number;
  settled: number;
  wonA: number;
  wonB: number;
  doubleWin: number;
  middleTrap: number;
  netProfit: number;
  netPct: number;
  generatedAtIso: string;
}

export async function renderWinRateReportPNG(input: WinRateReportInput): Promise<Buffer> {
  const S = 1080;
  const good = input.netProfit >= 0;
  const arc = Math.max(0, Math.min(100, input.winRatePct));
  const angle = -210 + (arc / 100) * 240;
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const cx = S / 2;
  const cy = 396;
  const R = 208;
  const arcStart = rad(-210);
  const arcEnd = rad(angle);
  const largeArc = angle - -210 > 180 ? 1 : 0;
  const p1 = `${cx + R * Math.cos(arcStart)},${cy + R * Math.sin(arcStart)}`;
  const p2 = `${cx + R * Math.cos(arcEnd)},${cy + R * Math.sin(arcEnd)}`;
  const tick = (deg: number, len: number, color: string) => {
    const a = rad(deg);
    return `<line x1="${cx + (R - 16) * Math.cos(a)}" y1="${cy + (R - 16) * Math.sin(a)}" x2="${cx + (R - 16 - len) * Math.cos(a)}" y2="${cy + (R - 16 - len) * Math.sin(a)}" stroke="${color}" stroke-width="3" stroke-linecap="round"/>`;
  };

  const boxes: Array<[string, string, string]> = [
    ["TIP A WINS", String(input.wonA), C.cyan],
    ["TIP B WINS", String(input.wonB), C.emerald],
    ["JACKPOTS", String(input.doubleWin), C.gold],
    ["MID TRAPS", String(input.middleTrap), C.rose],
  ];
  const boxW = (S - 96 - 3 * 18) / 4;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  ${arcadeBackdrop(S, S, "WIN", good ? C.emerald : C.rose, "WINRATE")}
  ${brandHeader(S, good ? C.emerald : C.rose)}

  <text x="${S / 2}" y="164" text-anchor="middle" font-family="${C.sans}" font-size="30" font-weight="bold" fill="${C.ink}" letter-spacing="3">VERIFIED WIN-RATE REPORT</text>

  <path d="M ${p1} A ${R} ${R} 0 ${largeArc} 1 ${p2}" fill="none" stroke="${good ? C.emerald : C.rose}" stroke-width="26" stroke-linecap="round"/>
  ${tick(-210, 14, "rgba(255,255,255,0.25)")}
  ${tick(-150, 9, "rgba(255,255,255,0.18)")}
  ${tick(-90, 14, "rgba(255,255,255,0.25)")}
  ${tick(-30, 9, "rgba(255,255,255,0.18)")}
  ${tick(30, 14, "rgba(255,255,255,0.25)")}
  <text x="${cx}" y="${cy + 4}" text-anchor="middle" font-family="${C.mono}" font-size="86" font-weight="bold" fill="${C.ink}">${arc.toFixed(1)}%</text>
  <text x="${cx}" y="${cy + 50}" text-anchor="middle" font-family="${C.sans}" font-size="22" fill="${C.inkDim}">win-rate · ${input.settled} settled tickets</text>

  ${boxes
    .map(
      ([label, value, color], i) => `
  <rect x="${48 + i * (boxW + 18)}" y="668" width="${boxW}" height="116" rx="14" fill="${C.cardBg}" stroke="${color}" stroke-opacity="0.45" stroke-width="1.5"/>
  <text x="${48 + i * (boxW + 18) + boxW / 2}" y="718" text-anchor="middle" font-family="${C.mono}" font-size="38" font-weight="bold" fill="${color}">${esc(value)}</text>
  <text x="${48 + i * (boxW + 18) + boxW / 2}" y="758" text-anchor="middle" font-family="${C.sans}" font-size="14.5" fill="${C.inkDim}">${esc(label)}</text>`
    )
    .join("")}

  <rect x="48" y="814" width="${S - 96}" height="126" rx="16" fill="${good ? C.emeraldSoft : C.roseSoft}" stroke="${good ? C.emerald : C.rose}" stroke-opacity="0.5" stroke-width="1.6"/>
  <text x="84" y="858" font-family="${C.sans}" font-size="19" font-weight="bold" fill="${C.inkDim}" letter-spacing="2">CUMULATIVE NET PROFIT</text>
  <text x="84" y="914" font-family="${C.mono}" font-size="44" font-weight="bold" fill="${good ? C.emerald : C.rose}">${sign(input.netProfit)} units</text>
  <text x="${S - 84}" y="858" text-anchor="end" font-family="${C.sans}" font-size="19" fill="${C.inkDim}">ROI on total staked</text>
  <text x="${S - 84}" y="914" text-anchor="end" font-family="${C.mono}" font-size="38" font-weight="bold" fill="${C.ink}">${input.netPct >= 0 ? "+" : ""}${input.netPct.toFixed(1)}%</text>

  <rect x="48" y="956" width="${S - 96}" height="58" rx="12" fill="rgba(0,0,0,0.4)" stroke="${C.line}"/>
  <text x="84" y="982" font-family="${C.sans}" font-size="18" font-weight="bold" fill="${C.gold}">UNIT BASIS: 1 unit = 1% of your own bankroll</text>
  <text x="84" y="1006" font-family="${C.sans}" font-size="17" fill="${C.inkDim}">Example · $10 balance: 1 unit = $0.10 → ${sign(input.netProfit)} units = $${(Math.abs(input.netProfit) * 0.1).toFixed(2)}</text>

  ${footer(S, S, `${BRAND_TITLE} ${BRAND_HANDLE} · graded only on official ESPN results`)}
</svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

// ═════════════════════ v13.0 — پوستر میکس ۲/۳ تایی (COMBO_2_3_LEG) ═════════════════════

export interface ComboPosterLeg {
  teams: string;
  league: string;
  kickoffEn: string;
  legLabel: string;
  odds: number;
  probPct: number;
  logoUrl: string | null;
}

export interface ComboPosterInput {
  kind: "2-LEG SAFE DOUBLE" | "3-LEG GOLDEN TREBLE";
  legs: ComboPosterLeg[];
  totalOdds: number;
  jointProbPct: number;
  stake: number;
  coverLine: string;
  hashShort: string;
}

export async function renderComboPosterPNG(input: ComboPosterInput): Promise<Buffer> {
  const accent = C.emerald;
  const rows = input.legs.slice(0, 3);
  const rowH = 196;
  const startY = 372;

  const legRows = rows
    .map((l, i) => {
      const y = startY + i * (rowH + 26);
      const teamSize = fitSize(l.teams, 500, 26, 15, 700);
      const legSize = fitSize(l.legLabel, 330, 20, 13, 700);
      return `
    ${glassBox(90, y, 900, rowH, C.emerald, 20)}
    <circle cx="150" cy="${y + rowH / 2}" r="34" fill="rgba(61,220,151,0.12)" stroke="${C.emerald}" stroke-width="2.5"/>
    <text x="150" y="${y + rowH / 2 + 10}" text-anchor="middle" font-family="${C.sans}" font-size="24" font-weight="bold" fill="${C.emerald}">L${i + 1}</text>
    <text x="206" y="${y + 58}" font-family="${C.sans}" font-size="${teamSize}" font-weight="bold" fill="${C.ink}">${esc(l.teams)}</text>
    <text x="206" y="${y + 90}" font-family="${C.sans}" font-size="15.5" fill="${C.inkDim}">${esc(enLeagueLabel(l.league))} · ${esc(l.kickoffEn)} Tehran</text>
    <text x="206" y="${y + 148}" font-family="${C.sans}" font-size="${legSize}" font-weight="bold" fill="${C.cyan}">${esc(l.legLabel)}</text>
    <text x="206" y="${y + 176}" font-family="${C.sans}" font-size="14" fill="${C.inkDim}">model confidence ${l.probPct.toFixed(1)}%</text>
    <rect x="806" y="${y + 58}" width="156" height="80" rx="14" fill="rgba(0,0,0,0.5)" stroke="rgba(61,220,151,0.5)" stroke-width="2"/>
    <text x="884" y="${y + 108}" text-anchor="middle" font-family="${C.mono}" font-size="30" font-weight="bold" fill="${C.emerald}">${l.odds.toFixed(2)}</text>`;
    })
    .join("");

  const overlay = `
  ${brandHeader(W, accent, BRAND_HANDLE)}

  <text x="${W / 2}" y="196" text-anchor="middle" font-family="${C.sans}" font-size="38" font-weight="bold" fill="${C.emerald}" letter-spacing="3">SMART COMBO ENGINE</text>
  <text x="${W / 2}" y="236" text-anchor="middle" font-family="${C.sans}" font-size="19" fill="${C.inkDim}">independent anchor legs · Monte-Carlo joint confidence</text>
  <rect x="${W / 2 - 260}" y="258" width="520" height="46" rx="23" fill="rgba(61,220,151,0.14)" stroke="rgba(61,220,151,0.55)" stroke-width="1.8"/>
  <text x="${W / 2}" y="289" text-anchor="middle" font-family="${C.sans}" font-size="19" font-weight="bold" fill="${C.emerald}" letter-spacing="2">${esc(input.kind)}</text>

  ${legRows}

  <rect x="90" y="${startY + rows.length * (rowH + 26) + 6}" width="900" height="150" rx="20" fill="rgba(6,10,20,0.85)" stroke="${C.gold}" stroke-opacity="0.65" stroke-width="2.5"/>
  <text x="118" y="${startY + rows.length * (rowH + 26) + 46}" font-family="${C.sans}" font-size="17" font-weight="bold" fill="${C.gold}" letter-spacing="2">TOTAL COMBO ODDS</text>
  <text x="118" y="${startY + rows.length * (rowH + 26) + 100}" font-family="${C.mono}" font-size="46" font-weight="bold" fill="${C.gold}">${input.totalOdds.toFixed(2)}x</text>
  <text x="560" y="${startY + rows.length * (rowH + 26) + 46}" font-family="${C.sans}" font-size="17" font-weight="bold" fill="${C.cyan}" letter-spacing="1.5">MONTE-CARLO CONFIDENCE</text>
  <text x="560" y="${startY + rows.length * (rowH + 26) + 100}" font-family="${C.mono}" font-size="34" font-weight="bold" fill="${C.cyan}">${input.jointProbPct.toFixed(1)}%</text>
  <text x="962" y="${startY + rows.length * (rowH + 26) + 46}" text-anchor="end" font-family="${C.sans}" font-size="17" font-weight="bold" fill="${C.inkDim}" letter-spacing="1.5">STAKE</text>
  <text x="962" y="${startY + rows.length * (rowH + 26) + 100}" text-anchor="end" font-family="${C.mono}" font-size="34" font-weight="bold" fill="${C.ink}">${input.stake.toFixed(0)} u</text>
  <text x="${W / 2}" y="${startY + rows.length * (rowH + 26) + 134}" text-anchor="middle" font-family="${C.sans}" font-size="14.5" fill="${C.inkDim}">${esc(input.coverLine)}</text>

  <rect x="90" y="${startY + rows.length * (rowH + 26) + 172}" width="900" height="52" rx="12" fill="rgba(0,0,0,0.55)" stroke="${C.line}"/>
  <text x="118" y="${startY + rows.length * (rowH + 26) + 206}" font-family="${C.mono}" font-size="19" fill="${C.gold}">SHA-256</text>
  <text x="238" y="${startY + rows.length * (rowH + 26) + 206}" font-family="${C.mono}" font-size="19" fill="${C.inkDim}">${esc(input.hashShort)}…</text>
  <text x="${W - 118}" y="${startY + rows.length * (rowH + 26) + 206}" text-anchor="end" font-family="${C.mono}" font-size="18" fill="${C.cyan}">ESPN-GRADED LEGS · ${BRAND_HANDLE}</text>

  ${footer(W, H, "NEOBET QUANT PRO · disjoint combo product line · not financial advice")}`;

  return compose("COMBO", overlay, accent, "COMBO");
}

// ═════════════════════ v13.0 — پوستر تک‌تیرانداز ضریب بالا (HIGH_ODDS_SNIPER) ═════════════════════

export interface SniperPosterInput {
  teams: string;
  league: string;
  kickoffEn: string;
  marketLabel: string;
  odds: number;
  modelProbPct: number;
  impliedProbPct: number;
  edgePct: number;
  stake: number;
  kellyNote: string;
  hashShort: string;
}

export async function renderSniperPosterPNG(input: SniperPosterInput): Promise<Buffer> {
  const accent = "#a78bfa"; // بنفش نئونی
  const radarR = 132;
  const rcx = W / 2;
  const rcy = 620;
  const sweep = -90 + (Math.min(95, input.modelProbPct) / 100) * 300;
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const sx = rcx + radarR * Math.cos(rad(sweep));
  const sy = rcy + radarR * Math.sin(rad(sweep));
  const teamSize = fitSize(input.teams, 780, 40, 20, 700);
  const mktSize = fitSize(input.marketLabel, 820, 30, 16, 700);

  const overlay = `
  ${brandHeader(W, accent, BRAND_HANDLE)}

  <text x="${W / 2}" y="210" text-anchor="middle" font-family="${C.sans}" font-size="42" font-weight="bold" fill="${accent}" letter-spacing="5">HIGH-ODDS SNIPER</text>
  <text x="${W / 2}" y="250" text-anchor="middle" font-family="${C.sans}" font-size="19" fill="${C.inkDim}">reverse-poisson value hunt · single shot · small stake</text>

  <text x="${W / 2}" y="356" text-anchor="middle" font-family="${C.sans}" font-size="${teamSize}" font-weight="bold" fill="${C.ink}">${esc(input.teams)}</text>
  <text x="${W / 2}" y="396" text-anchor="middle" font-family="${C.sans}" font-size="18" fill="${C.inkDim}">${esc(enLeagueLabel(input.league))} · ${esc(input.kickoffEn)} Tehran</text>

  <!-- رادار هدف‌گیری -->
  <g>
    <circle cx="${rcx}" cy="${rcy}" r="${radarR}" fill="rgba(13,7,22,0.6)" stroke="${accent}" stroke-opacity="0.6" stroke-width="2.5"/>
    <circle cx="${rcx}" cy="${rcy}" r="${Math.round(radarR * 0.66)}" fill="none" stroke="${accent}" stroke-opacity="0.3" stroke-width="1.5"/>
    <circle cx="${rcx}" cy="${rcy}" r="${Math.round(radarR * 0.33)}" fill="none" stroke="${accent}" stroke-opacity="0.25" stroke-width="1.5"/>
    ${[0, 45, 90, 135].map((d) => { const a = rad(d - 90); return `<line x1="${(rcx + radarR * Math.cos(a)).toFixed(0)}" y1="${(rcy + radarR * Math.sin(a)).toFixed(0)}" x2="${(rcx - radarR * Math.cos(a)).toFixed(0)}" y2="${(rcy - radarR * Math.sin(a)).toFixed(0)}" stroke="rgba(167,139,250,0.22)" stroke-width="1.2"/>`; }).join("")}
    <path d="M${rcx} ${rcy} L${sx.toFixed(0)} ${sy.toFixed(0)} L${(rcx + radarR * Math.cos(rad(sweep + 26))).toFixed(0)} ${(rcy + radarR * Math.sin(rad(sweep + 26))).toFixed(0)} Z" fill="rgba(167,139,250,0.22)"/>
    <circle cx="${sx.toFixed(0)}" cy="${sy.toFixed(0)}" r="7" fill="#f5c542"><animate attributeName="r" values="5;9;5" dur="1.4s" repeatCount="indefinite"/></circle>
    <text x="${rcx}" y="${rcy - 12}" text-anchor="middle" font-family="${C.mono}" font-size="30" font-weight="bold" fill="${C.ink}">${input.modelProbPct.toFixed(1)}%</text>
    <text x="${rcx}" y="${rcy + 16}" text-anchor="middle" font-family="${C.sans}" font-size="13" fill="${C.inkDim}">MODEL PROB</text>
  </g>

  ${glassBox(90, 810, 900, 168, accent, 22)}
  <text x="${W / 2}" y="856" text-anchor="middle" font-family="${C.sans}" font-size="17" font-weight="bold" fill="${accent}" letter-spacing="2.5">SNIPER TARGET</text>
  <text x="${W / 2}" y="906" text-anchor="middle" font-family="${C.sans}" font-size="${mktSize}" font-weight="bold" fill="${C.ink}">${esc(input.marketLabel)}</text>
  <text x="${W / 2}" y="950" text-anchor="middle" font-family="${C.mono}" font-size="26" font-weight="bold" fill="#f5c542">SNIPER ODDS: ${input.odds.toFixed(2)}x · +EV EDGE: ${input.edgePct >= 0 ? "+" : ""}${input.edgePct.toFixed(1)}%</text>

  <rect x="90" y="1000" width="900" height="120" rx="18" fill="rgba(6,10,20,0.8)" stroke="rgba(167,139,250,0.5)" stroke-width="2"/>
  <text x="118" y="1044" font-family="${C.sans}" font-size="16" font-weight="bold" fill="${C.inkDim}" letter-spacing="1.5">IMPLIED (BOOK) vs MODEL</text>
  <text x="118" y="1092" font-family="${C.mono}" font-size="30" font-weight="bold" fill="${C.inkDim}">${input.impliedProbPct.toFixed(1)}%</text>
  <text x="560" y="1044" font-family="${C.sans}" font-size="16" font-weight="bold" fill="${C.inkDim}" letter-spacing="1.5">FRACTIONAL KELLY STAKE (0.15x)</text>
  <text x="560" y="1092" font-family="${C.mono}" font-size="30" font-weight="bold" fill="#f5c542">${input.stake.toFixed(0)} u</text>
  <text x="962" y="1044" text-anchor="end" font-family="${C.sans}" font-size="15" fill="${C.inkDim}">EV-PROTECTED SINGLE SHOT</text>
  <text x="962" y="1092" text-anchor="end" font-family="${C.mono}" font-size="20" font-weight="bold" fill="${C.emerald}">CAP 10-15u</text>
  <text x="118" y="1112" font-family="${C.sans}" font-size="12.5" fill="${C.inkFaint}">${esc(input.kellyNote)}</text>

  <rect x="90" y="1140" width="900" height="52" rx="12" fill="rgba(0,0,0,0.55)" stroke="${C.line}"/>
  <text x="118" y="1174" font-family="${C.mono}" font-size="19" fill="#f5c542">SHA-256</text>
  <text x="238" y="1174" font-family="${C.mono}" font-size="19" fill="${C.inkDim}">${esc(input.hashShort)}…</text>
  <text x="${W - 118}" y="1174" text-anchor="end" font-family="${C.mono}" font-size="18" fill="${C.cyan}">VERIFY: espn.com/soccer · ${BRAND_HANDLE}</text>

  ${footer(W, H, "NEOBET QUANT PRO · value longshots capped at 0.5-1.0% bankroll · not financial advice")}`;

  return compose("SNIPER", overlay, accent, "SNIPER");
}

// ═════════════════════ v13.0 — پوستر تیزر قفل‌شده قیف کانال (Blurred VIP Teaser) ═════════════════════

const rad = (deg: number) => (deg * Math.PI) / 180;

export interface LockedTeaserInput {
  homeTeam: string;
  awayTeam: string;
  league: string;
  kickoffEn: string;
  guaranteedPct: number;
  labelAEn: string;
  oddsA: number;
  hashShort: string;
  freeGift: boolean; // پست ۲ قیف: ۱ کارت کاملاً رایگان در روز
  /** v13.5 — لوگوی رسمی باشگاه/پرچم تیم (ESPN) — null = مونوگرام */
  homeLogo?: Buffer | null;
  awayLogo?: Buffer | null;
}

export async function renderLockedTeaserPNG(input: LockedTeaserInput): Promise<Buffer> {
  const accent = input.freeGift ? C.emerald : C.gold;
  const homeSize = fitSize(input.homeTeam, 380, 30, 15, 700);
  const awaySize = fitSize(input.awayTeam, 380, 30, 15, 700);
  const aLines = wrapText(input.labelAEn, 820, 24, 400, 2);
  const homeLogo = logoDataUrl(input.homeLogo ?? null);
  const awayLogo = logoDataUrl(input.awayLogo ?? null);

  const overlay = `
  ${brandHeader(W, accent, BRAND_HANDLE)}

  <rect x="${W / 2 - 220}" y="150" width="440" height="46" rx="23" fill="${input.freeGift ? "rgba(61,220,151,0.16)" : "rgba(245,197,66,0.16)"}" stroke="${accent}" stroke-opacity="0.7" stroke-width="1.8"/>
  <text x="${W / 2}" y="181" text-anchor="middle" font-family="${C.sans}" font-size="19" font-weight="bold" fill="${accent}" letter-spacing="3">${input.freeGift ? "FREE GIFT CARD · TODAY" : "VIP TEASER · LOCKED"}</text>

  ${clubBadge(260, 330, 105, input.homeTeam, C.cyan, homeLogo)}
  ${clubBadge(820, 330, 105, input.awayTeam, C.emerald, awayLogo)}
  <text x="260" y="486" text-anchor="middle" font-family="${C.sans}" font-size="${homeSize}" font-weight="bold" fill="${C.ink}">${esc(input.homeTeam)}</text>
  <text x="820" y="486" text-anchor="middle" font-family="${C.sans}" font-size="${awaySize}" font-weight="bold" fill="${C.ink}">${esc(input.awayTeam)}</text>
  <rect x="${W / 2 - 52}" y="302" width="104" height="56" rx="14" fill="rgba(4,8,16,0.78)" stroke="rgba(255,255,255,0.2)"/>
  <text x="${W / 2}" y="340" text-anchor="middle" font-family="${C.sans}" font-size="26" font-weight="bold" fill="${C.gold}">VS</text>

  <text x="${W / 2}" y="540" text-anchor="middle" font-family="${C.sans}" font-size="20" fill="${C.inkDim}">${esc(enLeagueLabel(input.league))} · ${esc(input.kickoffEn)} Tehran</text>

  <!-- تیپ A همیشه باز -->
  ${glassBox(90, 580, 900, 220, C.cyan, 22)}
  <text x="118" y="626" font-family="${C.sans}" font-size="18" font-weight="bold" fill="${C.cyan}" letter-spacing="2.5">TIP A · JUDGE SIDE ${input.freeGift ? "· 100% FREE" : "· REVEALED"}</text>
  <text x="118" y="676" font-family="${C.sans}" font-size="25" fill="${C.ink}">${tspans(aLines, 118, 676, 34)}</text>
  <text x="962" y="676" text-anchor="end" font-family="${C.mono}" font-size="38" font-weight="bold" fill="${C.cyan}">@${input.oddsA.toFixed(2)}</text>
  <text x="118" y="760" font-family="${C.sans}" font-size="17" fill="${C.inkDim}">GUARANTEED DUTCH PROFIT</text>
  <text x="118" y="786" font-family="${C.mono}" font-size="26" font-weight="bold" fill="${C.emerald}">+${input.guaranteedPct.toFixed(1)}%</text>

  <!-- تیپ B پوشانده‌شده با شیشه تار + مهر طلایی -->
  <g>
    <defs><filter id="teaser-blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="13"/></filter></defs>
    ${glassBox(90, 830, 900, 260, C.gold, 22)}
    <text x="118" y="878" font-family="${C.sans}" font-size="18" font-weight="bold" fill="${C.gold}" letter-spacing="2.5">TIP B · COMPLEMENT</text>
    <text x="118" y="930" font-family="${C.sans}" font-size="24" fill="${C.inkDim}" filter="url(#teaser-blur)">Complementary cover selection</text>
    <text x="118" y="972" font-family="${C.sans}" font-size="24" fill="${C.inkDim}" filter="url(#teaser-blur)">locked behind VIP membership</text>
    <text x="962" y="930" text-anchor="end" font-family="${C.mono}" font-size="34" font-weight="bold" fill="${C.gold}" filter="url(#teaser-blur)">@?.??</text>
    <rect x="${W / 2 - 330}" y="986" width="660" height="72" rx="16" fill="rgba(20,14,2,0.92)" stroke="#f5c542" stroke-width="3"/>
    <text x="${W / 2}" y="1032" text-anchor="middle" font-family="${C.sans}" font-size="24" font-weight="bold" fill="#f5c542" letter-spacing="2">🔒 LOCKED FOR ${BRAND_HANDLE} VIP MEMBERS</text>
  </g>

  <rect x="90" y="1118" width="900" height="88" rx="16" fill="rgba(6,10,20,0.82)" stroke="${C.line}"/>
  <text x="118" y="1156" font-family="${C.sans}" font-size="16" font-weight="bold" fill="${C.inkDim}" letter-spacing="1.5">PRE-MATCH PROOF HASH (SHA-256) — UNBLURRED AFTER FT</text>
  <text x="118" y="1188" font-family="${C.mono}" font-size="21" fill="${C.gold}">${esc(input.hashShort)}…</text>
  <text x="${W - 118}" y="1188" text-anchor="end" font-family="${C.sans}" font-size="16" fill="${C.cyan}">POST-MATCH UNBLUR PROOF · ${BRAND_HANDLE}</text>

  ${footer(W, H, "NEOBET QUANT PRO · public funnel teaser — same hash opens after FT · not financial advice")}`;

  return compose("TEASER", overlay, accent, "TEASER");
}

// ═════════════════════ v13.0 — پوستر رادار شفافیت روزانه (Morning Radar) ═════════════════════

export interface DailyRadarInput {
  dateLabelEn: string;
  scanned: number;
  vetoed: number;
  goldenSignals: number;
  topPickLine: string;
}

export async function renderDailyRadarPNG(input: DailyRadarInput): Promise<Buffer> {
  const accent = C.cyan;
  const rcx = W / 2;
  const rcy = 520;
  const R = 200;

  const kpi = (x: number, value: string, label: string, color: string) => `
    ${glassBox(x, 810, 210, 200, color, 18)}
    <text x="${x + 105}" y="${810 + 96}" text-anchor="middle" font-family="${C.mono}" font-size="${fitSize(value, 174, 48, 22, 700)}" font-weight="bold" fill="${color}">${esc(value)}</text>
    <text x="${x + 105}" y="${810 + 150}" text-anchor="middle" font-family="${C.sans}" font-size="14.5" font-weight="bold" fill="${C.inkDim}">${esc(label)}</text>`;

  const overlay = `
  ${brandHeader(W, accent, BRAND_HANDLE)}

  <text x="${W / 2}" y="200" text-anchor="middle" font-family="${C.sans}" font-size="40" font-weight="bold" fill="${accent}" letter-spacing="4">DAILY MATCHDAY RADAR</text>
  <text x="${W / 2}" y="242" text-anchor="middle" font-family="${C.sans}" font-size="19" fill="${C.inkDim}">${esc(input.dateLabelEn)} · full transparency report</text>

  <g>
    <circle cx="${rcx}" cy="${rcy}" r="${R}" fill="rgba(7,13,24,0.55)" stroke="${accent}" stroke-opacity="0.55" stroke-width="2.5"/>
    ${[0.72, 0.44].map((f) => `<circle cx="${rcx}" cy="${rcy}" r="${(R * f).toFixed(0)}" fill="none" stroke="${accent}" stroke-opacity="0.25" stroke-width="1.6"/>`).join("")}
    ${[0, 30, 60, 90, 120, 150].map((d) => { const a = rad(d - 90); return `<line x1="${rcx}" y1="${rcy}" x2="${(rcx + R * Math.cos(a)).toFixed(0)}" y2="${(rcy + R * Math.sin(a)).toFixed(0)}" stroke="rgba(56,214,245,0.16)" stroke-width="1.2"/>`; }).join("")}
    <g>
      <path d="M${rcx} ${rcy} L${(rcx + R).toFixed(0)} ${rcy} A${R} ${R} 0 0 0 ${(rcx + R * Math.cos(rad(-38))).toFixed(0)} ${(rcy + R * Math.sin(rad(-38))).toFixed(0)} Z" fill="rgba(56,214,245,0.14)">
        <animateTransform attributeName="transform" type="rotate" from="0 ${rcx} ${rcy}" to="360 ${rcx} ${rcy}" dur="7s" repeatCount="indefinite"/>
      </path>
    </g>
    <circle cx="${rcx}" cy="${rcy}" r="7" fill="${accent}"/>
    <text x="${rcx}" y="${rcy - 46}" text-anchor="middle" font-family="${C.sans}" font-size="15" font-weight="bold" fill="${C.inkDim}" letter-spacing="2">LIVE SCAN</text>
    <text x="${rcx}" y="${rcy + 44}" text-anchor="middle" font-family="${C.sans}" font-size="14" fill="${C.inkDim}">ESPN FEED · SUPERVISOR GATE V15</text>
  </g>

  ${kpi(90, String(input.scanned), "MATCHES SCANNED", C.cyan)}
  ${kpi(320, String(input.vetoed), "RISKY VETOED", C.rose)}
  ${kpi(550, String(input.goldenSignals), "GOLDEN SIGNALS", C.gold)}
  ${kpi(780, "100%", "ESPN-GRADED", C.emerald)}

  ${glassBox(90, 1060, 900, 128, C.gold, 20)}
  <text x="118" y="1104" font-family="${C.sans}" font-size="16" font-weight="bold" fill="${C.gold}" letter-spacing="2">TODAY'S FREE GIFT + VIP TEASERS DROP AT T-60</text>
  <text x="118" y="1150" font-family="${C.sans}" font-size="17" fill="${C.ink}">${esc(input.topPickLine)}</text>
  <text x="${W - 118}" y="1150" text-anchor="end" font-family="${C.sans}" font-size="17" font-weight="bold" fill="${C.cyan}">${BRAND_HANDLE}</text>

  ${footer(W, H, "NEOBET QUANT PRO · morning transparency radar · not financial advice")}`;

  return compose("RADAR", overlay, accent, "RADAR");
}

// ═════════════════════ v13.5 — بنر بازاریابی هوشمند ساعتی (VIP Marketing Banner) ═════════════════════
// پوستر ۱۰۸۰×۱۴۴۰ کاملاً انگلیسی (هیچ کلمه فارسی در تصویر) — هر ساعت یک موضوع چرخشی با
// نماد برداری، KPI واقعی کانال، جدول قیمت تومان/USDT، شبکه‌های پرداخت و CTA عضویت.

export interface VipAdInput {
  topicKey: string;
  headline: string;
  sub: string;
  bullets: { icon: "shield" | "crown" | "target" | "vault" | "clock" | "bolt"; title: string; line: string }[];
  /** KPI واقعی — وین‌ریت و سود تجمعی کانال (صفر عدد جعلی) */
  winRatePct: number | null;
  settled: number | null;
  netProfit: number | null;
  /** قیمت — فقط انگلیسی داخل تصویر (مثلاً "FROM 25 USDT" و "62,500,000 TOMAN") */
  priceToman: string;
  priceUsdt: string;
  hashtag: string;
  generatedAtIso: string;
}

const AD_ICON: Record<VipAdInput["bullets"][number]["icon"], (x: number, y: number, c: string) => string> = {
  shield: (x, y, c) => `<path d="M${x + 16} ${y + 8} l10 -4 10 4 v12 c0 8 -5 12 -10 15 c-5 -3 -10 -7 -10 -15 z" fill="none" stroke="${c}" stroke-width="3"/>`,
  crown: (x, y, c) => `<path d="M${x + 8} ${y + 26} l3 -14 7 8 7 -13 7 13 7 -8 3 14 z" fill="${c}" fill-opacity="0.85"/>`,
  target: (x, y, c) => `<circle cx="${x + 26}" cy="${y + 20}" r="12" fill="none" stroke="${c}" stroke-width="3"/><circle cx="${x + 26}" cy="${y + 20}" r="4" fill="${c}"/>`,
  vault: (x, y, c) => `<rect x="${x + 14}" y="${y + 8}" width="24" height="24" rx="5" fill="none" stroke="${c}" stroke-width="3"/><circle cx="${x + 26}" cy="${y + 20}" r="5.5" fill="none" stroke="${c}" stroke-width="2.4"/><path d="M${x + 26} ${y + 14.5} v11 M${x + 20.5} ${y + 20} h11" stroke="${c}" stroke-width="2"/>`,
  clock: (x, y, c) => `${clockIcon(x + 26, y + 20, 13, c)}`,
  bolt: (x, y, c) => `<path d="M${x + 28} ${y + 4} l-12 18 h9 l-4 14 13 -19 h-9 z" fill="${c}" fill-opacity="0.9"/>`,
};

export async function renderVipAdPNG(input: VipAdInput): Promise<Buffer> {
  const accentByTopic: Record<string, string> = {
    DUTCH_COVER: C.emerald,
    SUPERVISOR_GATE: C.cyan,
    ESPN_SETTLEMENT: C.emerald,
    FORTRESS_MODE: C.cyan,
    SHA_PROOF: C.gold,
    BANK_STRATEGY: C.gold,
    TIMING_WINDOWS: C.cyan,
    SNIPER_LINE: "#a78bfa",
    COMBO_LINE: C.emerald,
    LIFETIME_PLAN: C.gold,
  };
  const accent = accentByTopic[input.topicKey] ?? C.gold;
  const good = (input.netProfit ?? 0) >= 0;

  const headlineSize = fitSize(input.headline, 900, 62, 34, 800);
  const subLines = wrapText(input.sub, 880, 24, 400, 2);

  const bulletRows = input.bullets
    .slice(0, 4)
    .map((b, i) => {
      const y = 680 + i * 122;
      const titleSize = fitSize(b.title, 700, 25, 17, 700);
      const lineLines = wrapText(b.line, 720, 18.5, 400, 1);
      return `
    <rect x="90" y="${y}" width="900" height="104" rx="18" fill="rgba(6,10,20,0.72)" stroke="${accent}" stroke-opacity="0.4" stroke-width="1.6"/>
    <circle cx="150" cy="${y + 52}" r="34" fill="rgba(6,10,20,0.65)" stroke="${accent}" stroke-opacity="0.55" stroke-width="2"/>
    ${AD_ICON[b.icon](116, y + 32, accent)}
    <text x="204" y="${y + 46}" font-family="${C.sans}" font-size="${titleSize}" font-weight="bold" fill="${C.ink}">${esc(b.title)}</text>
    <text x="204" y="${y + 76}" font-family="${C.sans}" font-size="18.5" fill="${C.inkDim}">${tspans(lineLines, 204, y + 76, 24)}</text>`;
    })
    .join("");

  const kpiBoxes = [
    { label: "CHANNEL WIN-RATE", value: input.winRatePct != null ? `${input.winRatePct.toFixed(1)}%` : "—", color: C.emerald },
    { label: "REAL SETTLED TICKETS", value: input.settled != null ? String(input.settled) : "—", color: C.cyan },
    { label: "NET UNITS (ALL-TIME)", value: input.netProfit != null ? sign(input.netProfit) : "—", color: good ? C.gold : C.rose },
  ]
    .map(
      (k, i) => `
  ${glassBox(90 + i * 310, 1170, 280, 150, k.color, 16)}
  <text x="${90 + i * 310 + 140}" y="${1170 + 74}" text-anchor="middle" font-family="${C.mono}" font-size="${fitSize(k.value, 244, 44, 24, 700)}" font-weight="bold" fill="${k.color}">${esc(k.value)}</text>
  <text x="${90 + i * 310 + 140}" y="${1170 + 118}" text-anchor="middle" font-family="${C.sans}" font-size="13.5" font-weight="bold" fill="${C.inkDim}" letter-spacing="1.2">${esc(k.label)}</text>`
    )
    .join("");

  const overlay = `
  ${brandHeader(W, accent, BRAND_HANDLE)}

  <!-- تیتر بزرگ + زیرتیتر -->
  <text x="${W / 2}" y="270" text-anchor="middle" font-family="${C.sans}" font-size="${headlineSize}" font-weight="800" fill="${C.ink}" letter-spacing="1.5">${esc(input.headline)}</text>
  <text x="${W / 2}" y="322" text-anchor="middle" font-family="${C.sans}" font-size="24" fill="${C.inkDim}">${tspans(subLines, W / 2, 322, 32)}</text>

  <!-- نشان هشتگ موضوع -->
  <rect x="${W / 2 - 250}" y="392" width="500" height="52" rx="26" fill="rgba(6,10,20,0.8)" stroke="${accent}" stroke-opacity="0.65" stroke-width="2"/>
  <text x="${W / 2}" y="427" text-anchor="middle" font-family="${C.sans}" font-size="21" font-weight="bold" fill="${accent}" letter-spacing="2.5">${esc(input.hashtag)}</text>

  <!-- نماد بزرگ موضوع: سپر دوتایی با تیک تایید -->
  <g transform="translate(${W / 2} 572) scale(0.82)" opacity="0.92">
    <path d="M-120 -52 L0 -104 L120 -52 L120 30 Q120 86 0 118 Q-120 86 -120 30 Z" fill="${accent}" fill-opacity="0.10" stroke="${accent}" stroke-opacity="0.6" stroke-width="3"/>
    <path d="M-84 -38 L0 -76 L84 -38 L84 22 Q84 66 0 92 Q-84 66 -84 22 Z" fill="none" stroke="${accent}" stroke-opacity="0.35" stroke-width="2"/>
    <path d="M-34 4 L-8 30 L44 -26" fill="none" stroke="${accent}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
  </g>

  <!-- ردیف ویژگی‌ها -->
  ${bulletRows}

  <!-- KPI واقعی کانال -->
  ${kpiBoxes}

  <!-- جدول قیمت — یک خط مرکزی فشرده؛ بدون همپوشانی دو لایه متن (رفع باگ نمایش) -->
  ${glassBox(90, 1340, 900, 52, C.gold, 14, 0.9)}
  <text x="${W / 2}" y="1373" text-anchor="middle" font-family="${C.sans}" font-size="16.5" font-weight="bold" fill="${C.gold}" letter-spacing="1.2">VIP PLANS · 1-MONTH 25 · LIFETIME 50 ★ · 3-MONTH 60 — ALL-IN USDT</text>

  ${footer(W, H, `JOIN ${BRAND_HANDLE} VIP · USDT TRC-20 / SOL / BSC / POLYGON · instant auto-verify`)}`;

  return compose("TEASER", overlay, accent, "AD");
}

// ═══════════════════ ۸) قالب‌های ایجنت سوپروایزر تلگرام (v18.0) ═══════════════════
// همه قالب‌ها روی موتور Retro 16-Bit Arcade — انگلیسی خالص داخل تصویر.

/** ۸-۱) آکادمی اصطلاحات BET — پوستر آموزشی کانال عمومی */
export interface BetLessonInput {
  term: string; // "DUTCH COVER"
  tagline: string; // short EN definition one-liner
  definition: string; // 2-3 lines EN
  example: string; // worked example on a NeoBet card
  lessonNo: number; // شماره درس (چرخشی)
  winRatePct: number | null;
  settled: number | null;
}

export async function renderBetLessonPNG(input: BetLessonInput): Promise<Buffer> {
  const termSize = fitSize(input.term, 860, 74, 40, 800);
  const defLines = wrapText(input.definition, 860, 24, 400, 3);
  const exLines = wrapText(input.example, 820, 20, 400, 3);
  const overlay = `
  ${brandHeader(W, "#c86bff")}

  <text x="${W / 2}" y="216" text-anchor="middle" font-family="${C.sans}" font-size="24" font-weight="bold" fill="${A.dim}" letter-spacing="6">BET TERM ACADEMY · LESSON ${String(input.lessonNo).padStart(2, "0")}</text>

  ${glassBox(90, 260, 900, 190, C.gold)}
  <text x="${W / 2}" y="366" text-anchor="middle" font-family="${C.sans}" font-size="${termSize}" font-weight="800" fill="${C.gold}" letter-spacing="2">${esc(input.term)}</text>
  <text x="${W / 2}" y="416" text-anchor="middle" font-family="${C.sans}" font-size="19" fill="${C.inkDim}">${esc(input.tagline)}</text>

  ${glassBox(90, 500, 900, 260, C.cyan)}
  <text x="126" y="556" font-family="${C.sans}" font-size="20" font-weight="bold" fill="${C.cyan}" letter-spacing="3">WHAT IT MEANS</text>
  <text x="126" y="612" font-family="${C.sans}" font-size="24" fill="${C.ink}">${tspans(defLines, 126, 612, 38)}</text>

  ${glassBox(90, 810, 900, 250, C.emerald)}
  <text x="126" y="866" font-family="${C.sans}" font-size="20" font-weight="bold" fill="${C.emerald}" letter-spacing="3">EXAMPLE ON A NEOBET CARD</text>
  <text x="126" y="922" font-family="${C.sans}" font-size="21" fill="${C.inkDim}">${tspans(exLines, 126, 922, 34)}</text>

  ${glassBox(90, 1110, 900, 130, C.gold)}
  <text x="${W / 2}" y="1166" text-anchor="middle" font-family="${C.sans}" font-size="18" font-weight="bold" fill="${C.gold}" letter-spacing="2">NEW LESSON EVERY DAY · MASTER THE LANGUAGE OF SHARP MONEY</text>
  <text x="${W / 2}" y="1204" text-anchor="middle" font-family="${C.sans}" font-size="16" fill="${C.inkDim}">channel win-rate ${input.winRatePct != null ? `${input.winRatePct.toFixed(1)}%` : "—"} on ${input.settled ?? 0} real ESPN-settled tickets</text>

  ${glassBox(90, 1270, 900, 52, "#c86bff", 14, 0.9)}
  <text x="${W / 2}" y="1303" text-anchor="middle" font-family="${C.sans}" font-size="16.5" font-weight="bold" fill="#c86bff" letter-spacing="1.5">VIP MEMBERS GET EVERY CARD + THE FULL PLAYBOOK — JOIN @AINEOBET</text>

  ${footer(W, H, "NEOBET BET ACADEMY · education first · not financial advice")}`;

  return compose("RADAR", overlay, "#c86bff", "LESSON");
}

/** ۸-۲) تخته خبرهای فوتبال — تیترهای وایر ESPN روی قالب آرکید */
export interface NewsBoardInput {
  dateLabelEn: string;
  items: { headline: string; timeEn: string }[];
}

export async function renderNewsBoardPNG(input: NewsBoardInput): Promise<Buffer> {
  const rows = input.items.slice(0, 6);
  const rowH = 148;
  const startY = 330;
  const newsRows = rows
    .map((n, i) => {
      const y = startY + i * rowH;
      // v18.0 — عرض ۶۴۰px برای تیتر تا با برچسب ESPN WIRE هم‌پوشانی نکند
      const lines = wrapText(n.headline, 640, 21, 700, 2);
      return `
    ${glassBox(90, y, 900, rowH - 22, C.cyan)}
    <rect x="106" y="${y + 18}" width="112" height="26" fill="${C.cyan}"/>
    <text x="162" y="${y + 36}" text-anchor="middle" font-family="${C.sans}" font-size="13" font-weight="bold" fill="#04101c" letter-spacing="1">${esc(n.timeEn)}</text>
    <text x="238" y="${y + 38}" font-family="${C.sans}" font-size="${fitSize(lines.join(" "), 640, 21, 15, 700)}" font-weight="bold" fill="${C.ink}">${tspans(lines, 238, y + 38, 28)}</text>
    <text x="962" y="${y + 36}" text-anchor="end" font-family="${C.sans}" font-size="13" fill="${A.faint}" letter-spacing="1">ESPN WIRE</text>`;
    })
    .join("");

  const overlay = `
  ${brandHeader(W, C.cyan)}

  <text x="${W / 2}" y="200" text-anchor="middle" font-family="${C.sans}" font-size="40" font-weight="800" fill="${C.ink}" letter-spacing="3">FOOTBALL NEWS TICKER</text>
  <text x="${W / 2}" y="244" text-anchor="middle" font-family="${C.sans}" font-size="19" fill="${A.dim}">${esc(input.dateLabelEn)} · top headlines from the soccer wire</text>
  <rect x="${W / 2 - 210}" y="266" width="420" height="40" fill="rgba(56,214,245,0.12)" stroke="${C.cyan}" stroke-opacity="0.5" stroke-width="2"/>
  <text x="${W / 2}" y="293" text-anchor="middle" font-family="${C.sans}" font-size="16" font-weight="bold" fill="${C.cyan}" letter-spacing="2.5">STAY INFORMED · BET SMARTER</text>

  ${newsRows}

  ${glassBox(90, 1206, 900, 74, C.cyan)}
  <text x="126" y="1234" font-family="${C.sans}" font-size="15" font-weight="bold" fill="${C.cyan}" letter-spacing="2">WHY THIS POST EXISTS</text>
  <text x="126" y="1256" font-family="${C.sans}" font-size="14" fill="${C.inkDim}">${tspans(wrapText(topicBrief("NEWS"), 830, 14, 400, 2), 126, 1256, 19)}</text>

  ${glassBox(90, 1290, 900, 60, C.gold, 14, 0.9)}
  <text x="${W / 2}" y="1327" text-anchor="middle" font-family="${C.sans}" font-size="16.5" font-weight="bold" fill="${C.gold}" letter-spacing="1.5">EVERY VIP CARD STILL SETTLES ON THE OFFICIAL ESPN SCOREBOARD</text>

  ${footer(W, H, "headlines via ESPN wire · team news is input, not betting advice")}`;

  return compose("RADAR", overlay, C.cyan, "NEWS");
}

/** ۸-۳) بریفینگ صبح کانال VIP — کارت‌های امروز + توصیه‌های مهم */
export interface VipBriefInput {
  dateLabelEn: string;
  cards: { teams: string; league: string; kickoffEn: string; oddsA: number; oddsB: number; marginPct: number; riskPct: number; tipA: string; tipB: string; timingEn: string; score100: number | null }[];
  vetoedToday: number;
  netUnitsAllTime: number;
  winRatePct: number | null;
}

export async function renderVipBriefPNG(input: VipBriefInput): Promise<Buffer> {
  const rows = input.cards.slice(0, 4);
  const hasCards = rows.length > 0;
  const rowH = 190;
  const cardRows = rows
    .map((c, i) => {
      const y = 470 + i * rowH;
      const teamSize = fitSize(c.teams, 620, 24, 14, 700);
      const tipLine = `TIP A: ${c.tipA.toUpperCase()} @${c.oddsA.toFixed(2)} · TIP B: ${c.tipB.toUpperCase()} @${c.oddsB.toFixed(2)}`;
      const tipSize = fitSize(tipLine, 590, 16, 10, 700);
      return `
    ${glassBox(90, y, 900, 168, C.gold)}
    <rect x="106" y="${y + 16}" width="64" height="30" fill="${C.gold}"/>
    <text x="138" y="${y + 37}" text-anchor="middle" font-family="${C.sans}" font-size="15" font-weight="bold" fill="#120a02">#${i + 1}</text>
    <text x="186" y="${y + 40}" font-family="${C.sans}" font-size="${teamSize}" font-weight="bold" fill="${C.ink}">${esc(c.teams)}</text>
    <text x="186" y="${y + 70}" font-family="${C.sans}" font-size="15.5" fill="${C.inkDim}">${esc(enLeagueLabel(c.league))} · ${esc(c.kickoffEn)} Tehran · ${c.riskPct.toFixed(1)}% joint risk${c.score100 != null ? ` · supervisor ${Math.round(c.score100)}/100` : ""}</text>
    <text x="186" y="${y + 100}" font-family="${C.sans}" font-size="${tipSize}" font-weight="bold" fill="${C.cyan}" letter-spacing="0.5">${esc(tipLine)}</text>
    <text x="186" y="${y + 132}" font-family="${C.sans}" font-size="15.5" fill="${C.inkDim}">guaranteed cover <tspan font-weight="bold" fill="${C.emerald}">+${c.marginPct.toFixed(1)}%</tspan> · window <tspan font-weight="bold" fill="${C.gold}">${esc(c.timingEn)}</tspan></text>
    <text x="962" y="${y + 40}" text-anchor="end" font-family="${C.sans}" font-size="13" fill="${A.faint}" letter-spacing="1">APPROVED</text>`;
    })
    .join("");

  const emptyBlock = hasCards
    ? ""
    : `
  ${glassBox(90, 470, 900, 220, C.rose)}
  <text x="${W / 2}" y="560" text-anchor="middle" font-family="${C.sans}" font-size="26" font-weight="bold" fill="${C.rose}" letter-spacing="1.5">NO CARD TODAY — FULL DISCIPLINE MODE</text>
  <text x="${W / 2}" y="606" text-anchor="middle" font-family="${C.sans}" font-size="18" fill="${C.inkDim}">the supervisor vetoed every candidate on today's board — capital stays flat</text>
  <text x="${W / 2}" y="644" text-anchor="middle" font-family="${C.sans}" font-size="17" fill="${C.inkDim}">${input.vetoedToday} high-risk patterns rejected · no card is safer than a forced card</text>`;

  const reco = hasCards
    ? (() => {
        const top = [...input.cards].sort((a, b) => (b.score100 ?? -1) - (a.score100 ?? -1))[0];
        const line = `TOP PICK: ${top.teams.toUpperCase()} · +${top.marginPct.toFixed(1)}% COVER · ${top.timingEn.toUpperCase()} WINDOW`;
        return `
  ${glassBox(90, hasCards ? 470 + rows.length * rowH : 730, 900, 118, C.emerald)}
  <text x="126" y="${(hasCards ? 470 + rows.length * rowH : 730) + 44}" font-family="${C.sans}" font-size="18" font-weight="bold" fill="${C.emerald}" letter-spacing="3">SUPERVISOR RECOMMENDATION</text>
  <text x="126" y="${(hasCards ? 470 + rows.length * rowH : 730) + 84}" font-family="${C.sans}" font-size="${fitSize(line, 820, 18, 12, 700)}" font-weight="bold" fill="${C.ink}">${esc(line)}</text>`;
      })()
    : "";

  const overlay = `
  ${brandHeader(W, C.gold)}

  <text x="${W / 2}" y="206" text-anchor="middle" font-family="${C.sans}" font-size="42" font-weight="800" fill="${C.gold}" letter-spacing="3">VIP DAILY BRIEF</text>
  <text x="${W / 2}" y="250" text-anchor="middle" font-family="${C.sans}" font-size="19" fill="${A.dim}">${esc(input.dateLabelEn)} · supervisor-approved board only</text>

  <g>
    ${glassBox(90, 292, 440, 130, C.emerald)}
    <text x="310" y="352" text-anchor="middle" font-family="${C.mono}" font-size="44" font-weight="bold" fill="${C.emerald}">${hasCards ? String(rows.length) : "0"}</text>
    <text x="310" y="394" text-anchor="middle" font-family="${C.sans}" font-size="14" font-weight="bold" fill="${C.inkDim}" letter-spacing="1.5">CARDS TODAY</text>
    ${glassBox(550, 292, 440, 130, C.cyan)}
    <text x="770" y="352" text-anchor="middle" font-family="${C.mono}" font-size="44" font-weight="bold" fill="${C.cyan}">${input.vetoedToday}</text>
    <text x="770" y="394" text-anchor="middle" font-family="${C.sans}" font-size="14" font-weight="bold" fill="${C.inkDim}" letter-spacing="1.5">VETOED CANDIDATES</text>
  </g>

  ${cardRows}
  ${emptyBlock}
  ${reco}

  ${glassBox(90, 1180, 900, 110, C.gold)}
  <text x="126" y="1224" font-family="${C.sans}" font-size="16.5" font-weight="bold" fill="${C.gold}" letter-spacing="2">EXECUTION DISCIPLINE</text>
  <text x="126" y="1258" font-family="${C.sans}" font-size="15.5" fill="${C.inkDim}">flat 100u ticket · place inside the printed window · 1 unit = 1% of your own bank</text>

  ${footer(W, H, `channel all-time net ${sign(input.netUnitsAllTime)} units · win-rate ${input.winRatePct != null ? input.winRatePct.toFixed(1) + "%" : "—"} · not financial advice`)}`;

  return compose("PRE_MATCH", overlay, C.gold, "BRIEF");
}

/** ۸-۴) گزارش هفتگی — برایند هفت به هر دو کانال */
export interface WeeklyDigestInput {
  weekLabelEn: string; // "Mon 09 Nov – Sun 15 Nov"
  settled: number;
  winRatePct: number;
  netProfit: number;
  jackpots: number;
  bestDay: { label: string; net: number } | null;
  tierNet: { single: number; combo: number; sniper: number };
  bankNow: number; // بانک ۱۰۰۰ واحدی
}

export async function renderWeeklyDigestPNG(input: WeeklyDigestInput): Promise<Buffer> {
  const good = input.netProfit >= 0;
  const accent = good ? C.emerald : C.rose;
  const kpis = [
    { label: "TICKETS SETTLED", value: String(input.settled), color: C.cyan },
    { label: "WEEK WIN-RATE", value: `${input.winRatePct.toFixed(1)}%`, color: C.emerald },
    { label: "GOLDEN JACKPOTS", value: String(input.jackpots), color: C.gold },
    { label: "NET UNITS", value: `${input.netProfit >= 0 ? "+" : "−"}${Math.abs(input.netProfit).toFixed(1)}`, color: good ? C.emerald : C.rose },
  ];
  const kpiBoxes = kpis
    .map((k, i) => {
      const x = 90 + i * 232;
      return `
  ${glassBox(x, 420, 208, 150, k.color)}
  <text x="${x + 104}" y="${420 + 78}" text-anchor="middle" font-family="${C.mono}" font-size="${fitSize(k.value, 170, 40, 20, 700)}" font-weight="bold" fill="${k.color}">${esc(k.value)}</text>
  <text x="${x + 104}" y="${420 + 118}" text-anchor="middle" font-family="${C.sans}" font-size="12.5" font-weight="bold" fill="${C.inkDim}" letter-spacing="1">${esc(k.label)}</text>`;
    })
    .join("");

  const tiers = [
    { label: "TIER 1 · DUAL-HEDGE", net: input.tierNet.single },
    { label: "TIER 2 · COMBO", net: input.tierNet.combo },
    { label: "TIER 3 · SNIPER", net: input.tierNet.sniper },
  ];
  const tierRows = tiers
    .map((t, i) => {
      const y = 640 + i * 120;
      return `
    ${glassBox(90, y, 900, 96, t.net >= 0 ? C.emerald : C.rose)}
    <text x="126" y="${y + 58}" font-family="${C.sans}" font-size="20" font-weight="bold" fill="${C.ink}" letter-spacing="1.5">${esc(t.label)}</text>
    <text x="960" y="${y + 60}" text-anchor="end" font-family="${C.mono}" font-size="28" font-weight="bold" fill="${t.net >= 0 ? C.emerald : C.rose}">${t.net >= 0 ? "+" : "−"}${Math.abs(t.net).toFixed(1)} u</text>`;
    })
    .join("");

  const overlay = `
  ${brandHeader(W, accent, BRAND_HANDLE)}

  <text x="${W / 2}" y="206" text-anchor="middle" font-family="${C.sans}" font-size="42" font-weight="800" fill="${accent}" letter-spacing="3">WEEKLY AUDIT REPORT</text>
  <text x="${W / 2}" y="252" text-anchor="middle" font-family="${C.sans}" font-size="20" fill="${A.dim}">${esc(input.weekLabelEn)} · official ESPN settlements only</text>
  <rect x="${W / 2 - 250}" y="282" width="500" height="56" fill="rgba(0,0,0,0.35)" stroke="${accent}" stroke-opacity="0.55" stroke-width="2"/>
  <text x="${W / 2}" y="318" text-anchor="middle" font-family="${C.sans}" font-size="19" font-weight="bold" fill="${accent}" letter-spacing="2">7-DAY DISJOINT PRODUCT-LINE ACCOUNTING</text>

  ${kpiBoxes}

  ${tierRows}

  ${glassBox(90, 1030, 900, 150, C.gold)}
  <text x="126" y="1078" font-family="${C.sans}" font-size="18" font-weight="bold" fill="${C.gold}" letter-spacing="2">BANK 1000-UNIT CURVE</text>
  <text x="126" y="1124" font-family="${C.sans}" font-size="30" font-weight="bold" fill="${C.ink}">1000 u → <tspan fill="${input.bankNow >= 1000 ? C.emerald : C.rose}">${input.bankNow.toFixed(1)} u</tspan> <tspan fill="${input.bankNow >= 1000 ? C.emerald : C.rose}" font-size="22">(${input.bankNow >= 1000 ? "+" : "−"}${Math.abs(input.bankNow - 1000).toFixed(1)})</tspan></text>
  <text x="126" y="1158" font-family="${C.sans}" font-size="14.5" fill="${C.inkDim}">flat 100-unit tickets · vetoes excluded from real money · ${input.bestDay ? `best day: ${esc(input.bestDay.label)} (${input.bestDay.net >= 0 ? "+" : "−"}${Math.abs(input.bestDay.net).toFixed(1)}u)` : "—"}</text>

  ${glassBox(90, 1220, 900, 90, C.emerald)}
  <text x="${W / 2}" y="1262" text-anchor="middle" font-family="${C.sans}" font-size="17" font-weight="bold" fill="${C.emerald}" letter-spacing="1.5">SAME PIPELINE NEXT WEEK · EVERY TICKET HASHED BEFORE KICKOFF</text>
  <text x="${W / 2}" y="1292" text-anchor="middle" font-family="${C.sans}" font-size="14.5" fill="${C.inkDim}">full SHA-256 ledger + live ESPN grading — verifiable by anyone</text>

  ${footer(W, H, "NEOBET WEEKLY AUDIT · no simulation · not financial advice")}`;

  return compose("DAILY_REPORT", overlay, accent, "WEEKLY");
}
