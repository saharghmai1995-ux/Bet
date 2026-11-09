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
  HOME: "Home Win (1)",
  DRAW: "Draw (X)",
  AWAY: "Away Win (2)",
  DC_1X: "Double Chance 1X",
  DC_X2: "Double Chance X2",
  O15: "Over 1.5 Goals",
  O25: "Over 2.5 Goals",
  U25: "Under 2.5 Goals",
  O35: "Over 3.5 Goals",
  U35: "Under 3.5 Goals",
  BTTS_Y: "Both Teams To Score · Yes",
  BTTS_N: "Both Teams To Score · No",
  DNB_HOME: "Draw No Bet · Home",
  DNB_AWAY: "Draw No Bet · Away",
  NO_DRAW: "No Draw (1 or 2)",
  AH_AWAY_15: "Away +1.5 Asian HCP",
  ASIAN_O20: "Asian Total Over 2.0",
  ASIAN_U20: "Asian Total Under 2.0",
  TGOAL_HOME: "Home To Score 1+",
  TGOAL_AWAY: "Away To Score 1+",
  WIN_NIL_HOME: "Home Win To Nil",
  WIN_NIL_AWAY: "Away Win To Nil",
  C_O95: "Corners Over 9.5",
  C_U95: "Corners Under 9.5",
};

/** برچسب انگلیسی یک تیپ از کلیدهای بازار — ۱۰۰٪ لاتین برای رندر بی‌نقص */
export function englishSelectionLabel(keys: string[], archetypeShort?: string | null): string {
  const known = (keys ?? []).map((k) => KEY_EN[String(k).toUpperCase()]).filter(Boolean);
  if (known.length > 0) return known.join("  +  ");
  return archetypeShort ? `${archetypeShort} orthogonal coverage` : "Orthogonal coverage pair";
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
 * ═══ v13.0 — موتور خودساز گرافیک استادیوم و موشن (Zero-Upload Procedural Stadium Engine) ═══
 * بدون هیچ فایل خارجی — نورافکن‌های radialGradient، چمن با پرسپکتیو یک‌سوم پایینی،
 * محوطه جریمه و دایره وسط، ذرات بوکه، آتش‌بازی طلایی/زمردی، باران (LOSS)، تور دروازه (WIN)،
 * نمای هوایی چمن (DAILY_REPORT) و تم بنفش/طلایی (SNIPER).
 */
function proceduralStadium(w: number, h: number, kind: StadiumKind, accent: string): string {
  const rnd = seeded(kind.length * 7919 + 41);
  const theme =
    kind === "DOUBLE_WIN" ? "gold" : kind === "LOSS" ? "rain" : kind === "SNIPER" ? "sniper" : kind === "DAILY_REPORT" ? "aerial" : kind === "WIN" ? "win" : kind === "TEASER" ? "teaser" : "night";

  const skyTop = theme === "gold" ? "#0d0a04" : theme === "rain" ? "#0a0d14" : theme === "sniper" ? "#0d0716" : theme === "aerial" ? "#0c1a10" : "#070d18";
  const skyBottom = theme === "gold" ? "#1a1206" : theme === "rain" ? "#101623" : theme === "sniper" ? "#170b28" : theme === "aerial" ? "#0f2b18" : "#0b1526";
  const pitchTop = theme === "aerial" ? "#1c7a3d" : "#157a38";
  const pitchBottom = theme === "aerial" ? "#0d5426" : "#0a4a20";

  // ─── چمن با پرسپکتیو (یک‌سوم پایینی؛ در حالت aerial تمام بوم) ───
  const pitchY0 = theme === "aerial" ? 0 : Math.round(h * 0.52);
  const stripes: string[] = [];
  const N = 9;
  for (let i = 0; i < N; i++) {
    const y0 = pitchY0 + ((h - pitchY0) / N) * i;
    const y1 = pitchY0 + ((h - pitchY0) / N) * (i + 1);
    stripes.push(`<rect x="0" y="${y0.toFixed(1)}" width="${w}" height="${(y1 - y0).toFixed(1)}" fill="${i % 2 === 0 ? "rgba(255,255,255,0.045)" : "rgba(0,0,0,0.05)"}"/>`);
  }

  // ─── خطوط زمین با پرسپکتیو (محوطه جریمه + دایره وسط) ───
  const cx = w / 2;
  const markings = theme === "aerial"
    ? `
  <g stroke="rgba(255,255,255,0.30)" stroke-width="4" fill="none">
    <rect x="${cx - 330}" y="${h * 0.20}" width="660" height="${h * 0.60}" rx="6"/>
    <rect x="${cx - 130}" y="${h * 0.20}" width="260" height="${h * 0.22}"/>
    <circle cx="${cx}" cy="${h * 0.5}" r="120"/>
    <line x1="0" y1="${h * 0.5}" x2="${w}" y2="${h * 0.5}"/>
  </g>`
    : `
  <g stroke="rgba(255,255,255,0.26)" stroke-width="3.5" fill="none">
    <path d="M${cx - 330} ${h - 60} L${cx - 235} ${pitchY0 + 26} L${cx + 235} ${pitchY0 + 26} L${cx + 330} ${h - 60}"/>
    <path d="M${cx - 150} ${h - 60} L${cx - 112} ${pitchY0 + 26} M${cx + 150} ${h - 60} L${cx + 112} ${pitchY0 + 26}"/>
    <ellipse cx="${cx}" cy="${h * 0.80}" rx="190" ry="62"/>
    <path d="M40 ${pitchY0 + 26} L${w - 40} ${pitchY0 + 26}"/>
  </g>`;

  // ─── نورافکن‌ها (radialGradient چهارگوشه بالایی) ───
  const beam = (x: number, y: number, r: number, op: number) =>
    `<radialGradient id="fl-${x}-${y}" cx="50%" cy="50%" r="50%">
       <stop offset="0%" stop-color="${accent}" stop-opacity="${op}"/>
       <stop offset="45%" stop-color="${accent}" stop-opacity="${op * 0.28}"/>
       <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
     </radialGradient>
     <circle cx="${x}" cy="${y}" r="${r}" fill="url(#fl-${x}-${y})"/>`;
  const floodlights = `
  <defs>${beam(120, 110, 430, 0.34)}${beam(w - 120, 110, 430, 0.34)}${beam(cx, 40, 520, 0.16)}</defs>
  ${beam(120, 110, 430, 0.34)}${beam(w - 120, 110, 430, 0.34)}${beam(cx, 40, 520, 0.16)}
  <g stroke="rgba(255,255,255,0.30)" stroke-width="3">${[-1, 1].map((s) => `<line x1="${s < 0 ? 120 : w - 120}" y1="96" x2="${s < 0 ? 150 : w - 150}" y2="${pitchY0 + 10}"/>`).join("")}</g>`;

  // ─── سکوهای تماشاگر + نقاط جمعیت ───
  const crowd = Array.from({ length: 240 }, () => {
    const x = rnd() * w;
    const y = pitchY0 * (0.30 + rnd() * 0.55);
    const o = 0.05 + rnd() * 0.14;
    return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(0.8 + rnd() * 1.6).toFixed(1)}" fill="rgba(255,255,255,${o.toFixed(2)})"/>`;
  }).join("");

  // ─── ذرات بوکه ───
  const bokehColors = [accent, "#f5c542", "#3ddc97", "#38d6f5"];
  const bokeh = Array.from({ length: 30 }, () => {
    const x = rnd() * w;
    const y = rnd() * h * 0.55;
    const r = 2 + rnd() * 7;
    const c = bokehColors[Math.floor(rnd() * bokehColors.length)];
    return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r.toFixed(1)}" fill="${c}" opacity="${(0.05 + rnd() * 0.16).toFixed(2)}"/>`;
  }).join("");

  // ─── آتش‌بازی (DOUBLE_WIN / WIN) ───
  const fireworks =
    theme === "gold" || theme === "win"
      ? Array.from({ length: 2 }, (_, k) => {
          const fx = k === 0 ? w * 0.2 : w * 0.8;
          const fy = 150 + k * 60;
          const rays = Array.from({ length: 14 }, (_, i) => {
            const a = (i / 14) * Math.PI * 2 + k;
            const len = 55 + rnd() * 65;
            const x2 = fx + Math.cos(a) * len;
            const y2 = fy + Math.sin(a) * len * 0.9;
            return `<line x1="${fx}" y1="${fy}" x2="${x2.toFixed(0)}" y2="${y2.toFixed(0)}" stroke="${theme === "gold" ? "#f5c542" : "#3ddc97"}" stroke-width="2.6" stroke-linecap="round" opacity="${(0.35 + rnd() * 0.4).toFixed(2)}"/>`;
          }).join("");
          return `<g>${rays}<circle cx="${fx}" cy="${fy}" r="6" fill="${theme === "gold" ? "#f5c542" : "#3ddc97"}" opacity="0.85"/></g>`;
        }).join("")
      : "";

  // ─── باران (LOSS) ───
  const rain =
    theme === "rain"
      ? Array.from({ length: 90 }, () => {
          const x = rnd() * w;
          const y = rnd() * h;
          const len = 26 + rnd() * 44;
          return `<line x1="${x.toFixed(0)}" y1="${y.toFixed(0)}" x2="${(x - len * 0.22).toFixed(0)}" y2="${(y + len).toFixed(0)}" stroke="rgba(180,205,255,0.20)" stroke-width="1.6" stroke-linecap="round"/>`;
        }).join("")
      : "";

  // ─── تور دروازه (WIN) ───
  const net =
    theme === "win"
      ? `<g stroke="rgba(255,255,255,0.13)" stroke-width="1.7" fill="none">
      ${Array.from({ length: 13 }, (_, i) => `<line x1="${(90 + i * 75).toFixed(0)}" y1="${(pitchY0 + 8).toFixed(0)}" x2="${(60 + i * 80).toFixed(0)}" y2="${h - 56}"/>`).join("")}
      ${Array.from({ length: 9 }, (_, i) => { const y = pitchY0 + 20 + ((h - 76 - pitchY0) / 9) * i; return `<path d="M85 ${y.toFixed(0)} Q${cx} ${(y - 26).toFixed(0)} ${w - 85} ${y.toFixed(0)}"/>`; }).join("")}
    </g>`
      : "";

  return `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${skyTop}"/>
      <stop offset="${theme === "aerial" ? 30 : 52}" stop-color="${skyBottom}"/>
      <stop offset="1" stop-color="${theme === "aerial" ? skyBottom : pitchBottom}"/>
    </linearGradient>
    <linearGradient id="pitch" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${pitchTop}"/>
      <stop offset="1" stop-color="${pitchBottom}"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  ${floodlights}
  ${crowd}
  ${theme === "aerial" ? "" : `<rect x="0" y="${pitchY0}" width="${w}" height="${h - pitchY0}" fill="url(#pitch)" opacity="0.94"/>`}
  ${stripes.join("")}
  ${markings}
  ${net}
  ${bokeh}
  ${fireworks}
  ${rain}
  <rect width="${w}" height="${h}" fill="rgba(2,6,14,0.30)"/>`;
}

/** هدر رسمی برند — NEOBET QUANT PRO • @AINEOBET */
function brandHeader(w: number, accent: string, right = BRAND_HANDLE): string {
  return `
  <rect x="0" y="0" width="${w}" height="92" fill="rgba(4,8,16,0.72)"/>
  <rect x="0" y="90" width="${w}" height="3" fill="${accent}" opacity="0.7"/>
  <circle cx="54" cy="46" r="19" fill="none" stroke="${C.gold}" stroke-width="3"/>
  <text x="54" y="55" text-anchor="middle" font-family="${C.sans}" font-size="21" font-weight="bold" fill="${C.gold}">N</text>
  <text x="88" y="42" font-family="${C.sans}" font-size="27" font-weight="bold" fill="${C.gold}" letter-spacing="2.5">${BRAND_TITLE}</text>
  <text x="88" y="70" font-family="${C.sans}" font-size="14.5" fill="${C.inkDim}" letter-spacing="3">${BRAND_SUB}</text>
  <text x="${w - 40}" y="55" text-anchor="end" font-family="${C.sans}" font-size="20" font-weight="bold" fill="${C.cyan}" letter-spacing="1.5">${esc(right)}</text>`;
}

/** فوتر سلب مسئولیت */
function footer(w: number, h: number, note: string): string {
  return `
  <rect x="0" y="${h - 46}" width="${w}" height="46" fill="rgba(0,0,0,0.5)"/>
  <text x="${w / 2}" y="${h - 17}" text-anchor="middle" font-family="${C.sans}" font-size="16" fill="${C.inkFaint}">${esc(note)}</text>`;
}

/** باکس شیشه‌ای استاندارد.broadcast — با پس‌زمینه تیره‌ی نیمه‌شفاف روی هر عکسی خوانا می‌ماند */
function glassBox(x: number, y: number, w: number, h: number, accent: string, rx = 22, fillOpacity = 0.82): string {
  return `
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="rgba(6,10,20,${fillOpacity})" stroke="${accent}" stroke-opacity="0.65" stroke-width="2.5"/>
  <rect x="${x}" y="${y}" width="${w}" height="${rx}" rx="${rx}" fill="${accent}" fill-opacity="0.14"/>`;
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

/** کامپوز نهایی v13.0: پس‌زمینه پروسیجرال خودساز + لایه برداری — خروجی PNG 1080×1440 (صفر آپلود) */
function compose(kind: StadiumKind, overlaySvg: string, accent: string): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${proceduralStadium(W, H, kind, accent)}${overlaySvg}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
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
}

export async function renderMatchCardPNG(input: MatchCardInput): Promise<Buffer> {
  const dw = input.doubleWin;
  const accent = dw ? C.gold : C.cyan;
  const homeLogo = logoDataUrl(input.homeLogo ?? null);
  const awayLogo = logoDataUrl(input.awayLogo ?? null);

  // متن تیپ‌ها داخل باکس‌های ۴۲۰px
  const aLines = wrapText(input.labelAEn, 420 - 56, 25, 400, 4);
  const bLines = input.teaser
    ? ["Full complementary pick +", "stake locked for", "VIP members"]
    : wrapText(input.labelBEn, 420 - 56, 25, 400, 4);
  const tLines = wrapText(input.timingDetail, 900 - 220, 23, 400, 2);
  const edgeTotal = (input.edgeA ?? 0) + (input.edgeB ?? 0);
  const edgeColor = edgeTotal >= 0 ? C.emerald : C.rose;
  const edgeTxt =
    input.edgeA !== null && input.edgeB !== null
      ? `A ${sign(input.edgeA)}% · B ${sign(input.edgeB)}% (${input.edgeSource === "PINNACLE" ? "vs Pinnacle" : "vs fair"})`
      : `model edge vs ${input.edgeSource === "PINNACLE" ? "Pinnacle" : "market fair"}`;
  const edgeSize = fitSize(edgeTxt, 900 - 380, 23, 14, 700);
  const timingColor = input.timingState === "OPEN" ? C.emerald : input.timingState === "WAITING" ? C.gold : C.rose;
  const homeSize = fitSize(input.homeTeam, 380, 30, 15, 700);
  const awaySize = fitSize(input.awayTeam, 380, 30, 15, 700);
  const leagueSize = fitSize(input.league, 560, 24, 15, 600);

  const overlay = `
  ${brandHeader(W, accent)}

  <!-- لیگ + زمان -->
  <rect x="90" y="112" width="${textWidth(input.league, leagueSize, 600) + 56}" height="46" rx="23" fill="rgba(6,10,20,0.75)" stroke="rgba(56,214,245,0.5)" stroke-width="1.5"/>
  <circle cx="118" cy="135" r="7" fill="${C.cyan}"/>
  <text x="138" y="144" font-family="${C.sans}" font-size="${leagueSize}" font-weight="600" fill="${C.cyan}">${esc(input.league)}</text>
  <text x="${W - 90}" y="144" text-anchor="end" font-family="${C.sans}" font-size="22" fill="${C.inkDim}">${esc(fmtKickoff(input.kickoffIso))}</text>

  <!-- بج نوع کارت -->
  <rect x="${W / 2 - 170}" y="170" width="340" height="46" rx="23" fill="${dw ? "rgba(245,197,66,0.2)" : "rgba(56,214,245,0.14)"}" stroke="${accent}" stroke-opacity="0.7" stroke-width="1.8"/>
  <text x="${W / 2}" y="201" text-anchor="middle" font-family="${C.sans}" font-size="19" font-weight="bold" fill="${accent}" letter-spacing="3">${dw ? "DOUBLE-WIN OPPORTUNITY" : "PRE-MATCH TIP CARD"}</text>

  <!-- لوگوی باشگاه‌ها (مختصات رسمی v12.0) -->
  ${clubBadge(260, 290, 115, input.homeTeam, C.cyan, homeLogo)}
  ${clubBadge(820, 290, 115, input.awayTeam, C.emerald, awayLogo)}
  <text x="260" y="452" text-anchor="middle" font-family="${C.sans}" font-size="${homeSize}" font-weight="bold" fill="${C.ink}">${esc(input.homeTeam)}</text>
  <text x="820" y="452" text-anchor="middle" font-family="${C.sans}" font-size="${awaySize}" font-weight="bold" fill="${C.ink}">${esc(input.awayTeam)}</text>
  <rect x="${W / 2 - 52}" y="262" width="104" height="56" rx="14" fill="rgba(4,8,16,0.78)" stroke="rgba(255,255,255,0.2)"/>
  <text x="${W / 2}" y="300" text-anchor="middle" font-family="${C.sans}" font-size="26" font-weight="bold" fill="${C.gold}">VS</text>

  <!-- ═══ باکس تیپ A (چپ - آبی) x90 y520 w420 h530 ═══ -->
  ${glassBox(90, 520, 420, 530, C.cyan)}
  <text x="118" y="566" font-family="${C.sans}" font-size="19" font-weight="bold" fill="${C.cyan}" letter-spacing="2.5">TIP A · JUDGE SIDE</text>
  <text x="482" y="614" text-anchor="end" font-family="${C.mono}" font-size="42" font-weight="bold" fill="${C.cyan}">@${input.oddsA.toFixed(2)}</text>
  <text x="118" y="678" font-family="${C.sans}" font-size="25" fill="${C.ink}">${tspans(aLines, 118, 678, 36)}</text>
  <rect x="118" y="912" width="364" height="56" rx="13" fill="rgba(0,0,0,0.5)"/>
  <text x="140" y="948" font-family="${C.sans}" font-size="18" fill="${C.inkDim}">DUTCH STAKE</text>
  <text x="460" y="950" text-anchor="end" font-family="${C.mono}" font-size="27" font-weight="bold" fill="${C.ink}">${input.stakeA.toFixed(1)} u</text>
  <text x="118" y="1010" font-family="${C.sans}" font-size="17" fill="${C.inkDim}">VALUE vs ${input.edgeSource === "PINNACLE" ? "PINNACLE" : "FAIR"} LINE</text>
  <text x="118" y="1032" font-family="${C.mono}" font-size="20" font-weight="bold" fill="${input.edgeA !== null && input.edgeA >= 0 ? C.emerald : C.rose}">${input.edgeA !== null ? sign(input.edgeA) + "%" : "—"}</text>

  <!-- ═══ باکس تیپ B (راست - سبز) x570 y520 w420 h530 ═══ -->
  ${input.teaser ? glassBox(570, 520, 420, 530, C.gold) : glassBox(570, 520, 420, 530, C.emerald)}
  <text x="598" y="566" font-family="${C.sans}" font-size="19" font-weight="bold" fill="${input.teaser ? C.gold : C.emerald}" letter-spacing="2.5">TIP B · COMPLEMENT</text>
  ${
    input.teaser
      ? `<g>${lockIcon(880, 558, 13, C.gold)}<text x="962" y="614" text-anchor="end" font-family="${C.sans}" font-size="27" font-weight="bold" fill="${C.gold}" letter-spacing="2">LOCKED</text></g>`
      : `<text x="962" y="614" text-anchor="end" font-family="${C.mono}" font-size="42" font-weight="bold" fill="${C.emerald}">@${input.oddsB.toFixed(2)}</text>`
  }
  <text x="598" y="678" font-family="${C.sans}" font-size="25" fill="${C.ink}">${tspans(bLines, 598, 678, 36)}</text>
  <rect x="598" y="912" width="364" height="56" rx="13" fill="rgba(0,0,0,0.5)"/>
  <text x="620" y="948" font-family="${C.sans}" font-size="18" fill="${C.inkDim}">DUTCH STAKE</text>
  ${
    input.teaser
      ? `<text x="940" y="950" text-anchor="end" font-family="${C.sans}" font-size="24" font-weight="bold" fill="${C.gold}">VIP ONLY</text>`
      : `<text x="940" y="950" text-anchor="end" font-family="${C.mono}" font-size="27" font-weight="bold" fill="${C.ink}">${input.stakeB.toFixed(1)} u</text>`
  }
  <text x="598" y="1010" font-family="${C.sans}" font-size="17" fill="${C.inkDim}">VALUE vs ${input.edgeSource === "PINNACLE" ? "PINNACLE" : "FAIR"} LINE</text>
  <text x="598" y="1032" font-family="${C.mono}" font-size="20" font-weight="bold" fill="${input.edgeB !== null && input.edgeB >= 0 ? C.emerald : C.rose}">${input.edgeB !== null ? sign(input.edgeB) + "%" : "—"}</text>

  <!-- ارزش ترکیبی -->
  <rect x="90" y="1068" width="900" height="46" rx="14" fill="rgba(6,10,20,0.75)" stroke="${C.line}"/>
  <path d="M120 1082 l14 19 h-28 z" fill="${edgeColor}"/>
  <text x="150" y="1099" font-family="${C.sans}" font-size="18" font-weight="bold" fill="${C.inkDim}" letter-spacing="1.5">COMBINED MODEL VALUE</text>
  <text x="${W - 118}" y="1100" text-anchor="end" font-family="${C.mono}" font-size="${edgeSize}" font-weight="bold" fill="${edgeColor}">${esc(edgeTxt)}</text>

  <!-- ═══ نوار شیشه‌ای پایینی x90 y1135 w900 h145 ═══ -->
  ${glassBox(90, 1135, 900, 145, C.gold, 20)}
  <text x="${W / 2}" y="1178" text-anchor="middle" font-family="${C.sans}" font-size="20" font-weight="bold" fill="${C.gold}" letter-spacing="2.5">GUARANTEED COVER PROFIT · ${esc(input.timingTitle)}</text>
  <text x="${W / 2}" y="1222" text-anchor="middle" font-family="${C.mono}" font-size="36" font-weight="bold" fill="${C.gold}">${input.guaranteedPct >= 0 ? "+" : ""}${input.guaranteedPct.toFixed(1)}%</text>
  <text x="${W / 2}" y="1258" text-anchor="middle" font-family="${C.sans}" font-size="17" fill="${C.inkDim}">${esc(tLines.join(" · "))}</text>

  <!-- هش -->
  <rect x="90" y="1296" width="900" height="52" rx="12" fill="rgba(0,0,0,0.55)" stroke="${C.line}"/>
  <text x="118" y="1330" font-family="${C.mono}" font-size="19" fill="${C.gold}">SHA-256</text>
  <text x="238" y="1330" font-family="${C.mono}" font-size="19" fill="${C.inkDim}">${esc(input.hashShort)}…</text>
  <text x="${W - 118}" y="1330" text-anchor="end" font-family="${C.mono}" font-size="18" fill="${C.cyan}">${input.espnUrl ? "VERIFY: espn.com/soccer" : "ESPN-GRADED"} · ${BRAND_HANDLE}</text>

  ${footer(W, H, "NEOBET QUANT PRO · auto-graded on official ESPN scoreboard · not financial advice")}`;

  return compose("PRE_MATCH", overlay, accent);
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
  const leagueSize = fitSize(`${input.league} · FT · OFFICIAL ESPN SCOREBOARD`, 760, 20, 13, 400);
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
  <text x="337" y="828" text-anchor="middle" font-family="${C.mono}" font-size="52" font-weight="bold" fill="${C.gold}">${input.profitA !== null ? sign(input.profitA) : sign(profit / 2)} u</text>
  <text x="337" y="880" text-anchor="middle" font-family="${C.mono}" font-size="19" fill="${C.inkDim}">${esc(`${(input.stakeAHint ?? 0).toFixed(1)} u @ ${(input.oddsAHint ?? 0).toFixed(2)}`)}</text>
  <text x="337" y="968" text-anchor="middle" font-family="${C.sans}" font-size="16" font-weight="bold" fill="${C.emerald}" letter-spacing="2">BOTH WON · SAME MATCH</text>

  ${glassBox(550, 610, 385, 425, C.gold, 24)}
  <text x="742" y="668" text-anchor="middle" font-family="${C.sans}" font-size="20" font-weight="bold" fill="${C.gold}" letter-spacing="2.5">TIP B · GOLDEN LEG</text>
  <text x="742" y="742" text-anchor="middle" font-family="${C.sans}" font-size="21" fill="${C.inkDim}">${esc(input.awayTeam)} side</text>
  <text x="742" y="828" text-anchor="middle" font-family="${C.mono}" font-size="52" font-weight="bold" fill="${C.gold}">${input.profitB !== null ? sign(input.profitB) : sign(profit / 2)} u</text>
  <text x="742" y="880" text-anchor="middle" font-family="${C.mono}" font-size="19" fill="${C.inkDim}">${esc(`${(input.stakeBHint ?? 0).toFixed(1)} u @ ${(input.oddsBHint ?? 0).toFixed(2)}`)}</text>
  <text x="742" y="968" text-anchor="middle" font-family="${C.sans}" font-size="16" font-weight="bold" fill="${C.emerald}" letter-spacing="2">ZERO RISK TAKEN</text>`
      : `
  ${glassBox(geo.boxX, geo.boxY, geo.boxW, geo.boxH, meta.accent, 24)}
  ${centerContent}`
  }
  <text x="${W / 2}" y="${geo.boxY + geo.boxH + 38}" text-anchor="middle" font-family="${C.sans}" font-size="${leagueSize}" fill="${C.inkDim}">${esc(input.league)} · FT · OFFICIAL ESPN SCOREBOARD</text>

  <!-- نوار شیشه‌ای پایینی -->
  ${glassBox(geo.barX, geo.barY, geo.barW, geo.barH, meta.accent, 18)}
  ${barContent}

  ${footer(W, H, "NEOBET QUANT PRO · every settlement graded on the official ESPN final score — zero simulation")}`;

  return compose(kind, overlay, meta.accent);
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
  ${brandHeader(W, accent)}

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

  return compose("DAILY_REPORT", overlay, accent);
}

/** اعداد انگلیسی ساده برای پوستر */
function faEn(v: number): string {
  return String(Math.round(v));
}

// ═════════════════════ ۶) پوستر نردبان مرکب ۳ پله‌ای (v11.0 Rollover Ladder) ═════════════════════

export interface RolloverLadderInput {
  dateLabelEn: string;
  steps: { index: number; kickoffEn: string; teams: string; league: string; oddsA: number; oddsB: number; marginPct: number }[];
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
      return `
    ${glassBox(90, y, 900, 200, C.emerald, 20)}
    <circle cx="150" cy="${y + 100}" r="40" fill="rgba(245,197,66,0.14)" stroke="${C.gold}" stroke-width="3"/>
    <text x="150" y="${y + 112}" text-anchor="middle" font-family="${C.sans}" font-size="30" font-weight="bold" fill="${C.gold}">${i + 1}</text>
    <text x="220" y="${y + 56}" font-family="${C.sans}" font-size="${teamSize}" font-weight="bold" fill="${C.ink}">${esc(s.teams)}</text>
    <text x="220" y="${y + 92}" font-family="${C.sans}" font-size="17" fill="${C.inkDim}">${esc(s.league)} · ${esc(s.kickoffEn)} Tehran · odds ${s.oddsA.toFixed(2)} / ${s.oddsB.toFixed(2)}</text>
    <text x="220" y="${y + 136}" font-family="${C.sans}" font-size="18" fill="${C.inkDim}">Enter with <tspan font-weight="bold" fill="${C.ink}">${bankAt(input, i).toFixed(1)} u</tspan> → guaranteed profit <tspan font-weight="bold" fill="${C.emerald}">+${s.marginPct.toFixed(1)}%</tspan></text>
    <text x="960" y="${y + 108}" text-anchor="end" font-family="${C.mono}" font-size="32" font-weight="bold" fill="${C.emerald}">${endBank.toFixed(1)} u</text>
    ${i < rows.length - 1 ? `<path d="M940 ${y + 214} l-16 -22 h10 v-30 h12 v30 h10 z" fill="${C.gold}" opacity="0.85"/>` : ""}`;
    })
    .join("");

  const overlay = `
  ${brandHeader(W, C.gold)}

  <text x="${W / 2}" y="200" text-anchor="middle" font-family="${C.sans}" font-size="38" font-weight="bold" fill="${C.gold}" letter-spacing="3">DAILY COMPOUND ROLLOVER</text>
  <text x="${W / 2}" y="240" text-anchor="middle" font-family="${C.sans}" font-size="19" fill="${C.inkDim}">3-step ladder on sub-10% joint-risk approved cards · ${esc(input.dateLabelEn)}</text>
  <rect x="${W / 2 - 240}" y="262" width="480" height="44" rx="22" fill="rgba(61,220,151,0.12)" stroke="rgba(61,220,151,0.5)" stroke-width="1.5"/>
  <text x="${W / 2}" y="291" text-anchor="middle" font-family="${C.sans}" font-size="17" font-weight="bold" fill="${C.emerald}" letter-spacing="1.5">${input.principalLock ? "PRINCIPAL-LOCK BOOSTER MODE" : "EQUAL-PROFIT DUTCH MODE"} · RISK GATE 9.8%</text>

  ${stepBoxes}

  ${glassBox(90, 1135, 900, 145, C.gold, 20)}
  <text x="${W / 2}" y="1180" text-anchor="middle" font-family="${C.sans}" font-size="18" font-weight="bold" fill="${C.gold}" letter-spacing="2.5">END OF DAY COMPOUND RESULT</text>
  <text x="${W / 2}" y="1228" text-anchor="middle" font-family="${C.mono}" font-size="40" font-weight="bold" fill="${C.gold}">${input.startBank.toFixed(0)} u → ${input.finalBank.toFixed(1)} u (+${input.totalGrowthPct.toFixed(1)}%)</text>
  <text x="${W / 2}" y="1262" text-anchor="middle" font-family="${C.sans}" font-size="15" fill="${C.inkDim}">each step settles before the next kickoff · automatic ESPN grading · ${BRAND_HANDLE}</text>

  ${footer(W, H, "NEOBET QUANT PRO · rollover planner on verified sub-10% risk cards · not financial advice")}`;

  return compose("DAILY_REPORT", overlay, C.gold);
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
  ${proceduralStadium(S, S, "WIN", good ? C.emerald : C.rose)}
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
    <text x="206" y="${y + 90}" font-family="${C.sans}" font-size="15.5" fill="${C.inkDim}">${esc(l.league)} · ${esc(l.kickoffEn)} Tehran</text>
    <text x="206" y="${y + 148}" font-family="${C.sans}" font-size="${legSize}" font-weight="bold" fill="${C.cyan}">${esc(l.legLabel)}</text>
    <text x="206" y="${y + 176}" font-family="${C.sans}" font-size="14" fill="${C.inkDim}">model confidence ${l.probPct.toFixed(1)}%</text>
    <rect x="806" y="${y + 58}" width="156" height="80" rx="14" fill="rgba(0,0,0,0.5)" stroke="rgba(61,220,151,0.5)" stroke-width="2"/>
    <text x="884" y="${y + 108}" text-anchor="middle" font-family="${C.mono}" font-size="30" font-weight="bold" fill="${C.emerald}">${l.odds.toFixed(2)}</text>`;
    })
    .join("");

  const overlay = `
  ${brandHeader(W, accent)}

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

  return compose("COMBO", overlay, accent);
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
  ${brandHeader(W, accent)}

  <text x="${W / 2}" y="210" text-anchor="middle" font-family="${C.sans}" font-size="42" font-weight="bold" fill="${accent}" letter-spacing="5">HIGH-ODDS SNIPER</text>
  <text x="${W / 2}" y="250" text-anchor="middle" font-family="${C.sans}" font-size="19" fill="${C.inkDim}">reverse-poisson value hunt · single shot · small stake</text>

  <text x="${W / 2}" y="356" text-anchor="middle" font-family="${C.sans}" font-size="${teamSize}" font-weight="bold" fill="${C.ink}">${esc(input.teams)}</text>
  <text x="${W / 2}" y="396" text-anchor="middle" font-family="${C.sans}" font-size="18" fill="${C.inkDim}">${esc(input.league)} · ${esc(input.kickoffEn)} Tehran</text>

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

  return compose("SNIPER", overlay, accent);
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
}

export async function renderLockedTeaserPNG(input: LockedTeaserInput): Promise<Buffer> {
  const accent = input.freeGift ? C.emerald : C.gold;
  const homeSize = fitSize(input.homeTeam, 380, 30, 15, 700);
  const awaySize = fitSize(input.awayTeam, 380, 30, 15, 700);
  const aLines = wrapText(input.labelAEn, 820, 24, 400, 2);

  const overlay = `
  ${brandHeader(W, accent)}

  <rect x="${W / 2 - 220}" y="150" width="440" height="46" rx="23" fill="${input.freeGift ? "rgba(61,220,151,0.16)" : "rgba(245,197,66,0.16)"}" stroke="${accent}" stroke-opacity="0.7" stroke-width="1.8"/>
  <text x="${W / 2}" y="181" text-anchor="middle" font-family="${C.sans}" font-size="19" font-weight="bold" fill="${accent}" letter-spacing="3">${input.freeGift ? "FREE GIFT CARD · TODAY" : "VIP TEASER · LOCKED"}</text>

  ${clubBadge(260, 330, 105, input.homeTeam, C.cyan, null)}
  ${clubBadge(820, 330, 105, input.awayTeam, C.emerald, null)}
  <text x="260" y="486" text-anchor="middle" font-family="${C.sans}" font-size="${homeSize}" font-weight="bold" fill="${C.ink}">${esc(input.homeTeam)}</text>
  <text x="820" y="486" text-anchor="middle" font-family="${C.sans}" font-size="${awaySize}" font-weight="bold" fill="${C.ink}">${esc(input.awayTeam)}</text>
  <rect x="${W / 2 - 52}" y="302" width="104" height="56" rx="14" fill="rgba(4,8,16,0.78)" stroke="rgba(255,255,255,0.2)"/>
  <text x="${W / 2}" y="340" text-anchor="middle" font-family="${C.sans}" font-size="26" font-weight="bold" fill="${C.gold}">VS</text>

  <text x="${W / 2}" y="540" text-anchor="middle" font-family="${C.sans}" font-size="20" fill="${C.inkDim}">${esc(input.league)} · ${esc(input.kickoffEn)} Tehran</text>

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

  return compose("TEASER", overlay, accent);
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
  ${brandHeader(W, accent)}

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
    <text x="${rcx}" y="${rcy + 44}" text-anchor="middle" font-family="${C.sans}" font-size="14" fill="${C.inkDim}">ESPN FEED · SUPERVISOR GATE 9.8%</text>
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

  return compose("RADAR", overlay, accent);
}
