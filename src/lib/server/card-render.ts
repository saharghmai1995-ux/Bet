// ─────────────────────────────────────────────────────────────────────────────
// Pure Visual English Telegram Card Renderer — v10.0
//
// کاملاً قطعی (Deterministic): متن‌ها با SVG برداری رندر و با sharp به PNG
// تبدیل می‌شوند — صفر وابستگی به تولید تصویر هوش مصنوعی:
//   · صفر باگ متنی (نام تیم‌ها/اعداد/هش دقیقاً همان رشته‌های واقعی‌اند)
//   · صفر خطای content-filter · صفر تأخیر ۲۰ ثانیه‌ای · صفر هزینه
// زبان تصاویر: انگلیسی خالص (Pure Visual English — سازگار با librsvg بدون bidi)
// ─────────────────────────────────────────────────────────────────────────────

import sharp from "sharp";

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

/** پس‌زمینه گرادیانی با موتیف زمین چمن */
function pitchBackground(w: number, h: number, accent: string): string {
  const cx = w / 2;
  return `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${C.bgTop}"/>
      <stop offset="1" stop-color="${C.bgBottom}"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="0%" r="80%">
      <stop offset="0" stop-color="${accent}" stop-opacity="0.15"/>
      <stop offset="1" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <rect width="${w}" height="${h}" fill="url(#glow)"/>
  <g stroke="rgba(255,255,255,0.045)" stroke-width="2" fill="none">
    <circle cx="${cx}" cy="${h * 0.46}" r="180"/>
    <line x1="60" y1="${h * 0.46}" x2="${w - 60}" y2="${h * 0.46}"/>
    <rect x="${cx - 150}" y="${h - 10}" width="300" height="150"/>
  </g>`;
}

/** نوار عنوان بالای کارت */
function header(w: number, title: string, right: string, accent: string): string {
  return `
  <rect x="0" y="0" width="${w}" height="88" fill="rgba(245,197,66,0.10)"/>
  <rect x="0" y="86" width="${w}" height="2" fill="${accent}" opacity="0.55"/>
  <circle cx="52" cy="44" r="17" fill="none" stroke="${C.gold}" stroke-width="2.5"/>
  <path d="M52 33 v11 l8 5" stroke="${C.gold}" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  <text x="84" y="52" font-family="${C.sans}" font-size="26" font-weight="bold" fill="${C.gold}" letter-spacing="2">${esc(title)}</text>
  <text x="${w - 40}" y="52" text-anchor="end" font-family="${C.sans}" font-size="19" fill="${C.inkDim}" letter-spacing="1.5">${esc(right)}</text>`;
}

/** فوتر سلب مسئولیت */
function footer(w: number, h: number, note: string): string {
  return `
  <rect x="0" y="${h - 52}" width="${w}" height="52" fill="rgba(0,0,0,0.35)"/>
  <text x="${w / 2}" y="${h - 19}" text-anchor="middle" font-family="${C.sans}" font-size="17" fill="${C.inkFaint}">${esc(note)}</text>`;
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

// ═════════════════════ ۱) کارت اصلی فلش‌کارت — هندسه ثابت ═════════════════════
// W=1080 · H=1350 | header 0-88 · league 118-162 · teams 200-290
// TIP A 316-570 · TIP B 590-844 · dutch 864-944 · value 964-1030
// timing 1050-1146 · hash 1166-1222 · footer 1298-1350

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
  teaser?: boolean;
}

const W = 1080;
const H = 1350;

const TIP_BOX = (y: number) => ({
  y,
  h: 254,
  labelY: y + 44,
  oddsY: y + 48,
  descY: y + 96,
  descLh: 34,
  stakeY: y + 178,
});

export async function renderMatchCardPNG(input: MatchCardInput): Promise<Buffer> {
  const maxW = W - 96;
  const leagueSize = fitSize(input.league, maxW - 340, 26, 17, 600);
  const homeSize = fitSize(input.homeTeam, W / 2 - 80 - 190, 42, 15, 700);
  const awaySize = fitSize(input.awayTeam, 260, 42, 15, 700);
  const aLines = wrapText(input.labelAEn, maxW - 72, 26, 400, 3);
  const bLines = input.teaser ? ["Full complementary pick + stake locked for VIP members"] : wrapText(input.labelBEn, maxW - 72, 26, 400, 3);
  const tLines = wrapText(input.timingDetail, maxW - 130, 22, 400, 2);
  const edgeTotal = (input.edgeA ?? 0) + (input.edgeB ?? 0);
  const edgeColor = edgeTotal >= 0 ? C.emerald : C.rose;
  const edgeTxt =
    input.edgeA !== null && input.edgeB !== null
      ? `A ${sign(input.edgeA)}% · B ${sign(input.edgeB)}%  (${input.edgeSource === "PINNACLE" ? "vs Pinnacle" : "vs market fair"})`
      : `model edge vs ${input.edgeSource === "PINNACLE" ? "Pinnacle" : "market fair"}`;
  const timingColor = input.timingState === "OPEN" ? C.emerald : input.timingState === "WAITING" ? C.gold : C.rose;
  const dw = input.doubleWin;
  const A = TIP_BOX(316);
  const B = TIP_BOX(590);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${pitchBackground(W, H, dw ? C.gold : C.cyan)}
  ${header(W, "FOOTBALL QUANT", "QUANTITATIVE SYNDICATE · v10", C.gold)}

  <!-- لیگ + زمان -->
  <rect x="48" y="112" width="${Math.min(maxW - 200, textWidth(input.league, leagueSize, 600) + 52)}" height="44" rx="22" fill="${C.cyanSoft}" stroke="rgba(56,214,245,0.4)" stroke-width="1.5"/>
  <circle cx="76" cy="134" r="6" fill="${C.cyan}"/>
  <text x="94" y="142" font-family="${C.sans}" font-size="${leagueSize}" font-weight="600" fill="${C.cyan}">${esc(input.league)}</text>
  <text x="${W - 48}" y="142" text-anchor="end" font-family="${C.sans}" font-size="22" fill="${C.inkDim}">${esc(fmtKickoff(input.kickoffIso))}</text>

  <!-- تیم‌ها -->
  <circle cx="120" cy="242" r="46" fill="rgba(255,255,255,0.05)" stroke="${C.cyan}" stroke-width="2"/>
  <text x="120" y="254" text-anchor="middle" font-family="${C.sans}" font-size="32" font-weight="bold" fill="${C.cyan}">${esc(crestInitials(input.homeTeam))}</text>
  <text x="${W / 2 - 80}" y="256" text-anchor="end" font-family="${C.sans}" font-size="${homeSize}" font-weight="bold" fill="${C.ink}">${esc(input.homeTeam)}</text>

  <rect x="${W / 2 - 44}" y="212" width="88" height="60" rx="13" fill="rgba(0,0,0,0.4)" stroke="rgba(255,255,255,0.14)"/>
  <text x="${W / 2}" y="253" text-anchor="middle" font-family="${C.sans}" font-size="26" font-weight="bold" fill="${C.gold}">VS</text>

  <circle cx="${W - 120}" cy="242" r="46" fill="rgba(255,255,255,0.05)" stroke="${C.emerald}" stroke-width="2"/>
  <text x="${W - 120}" y="254" text-anchor="middle" font-family="${C.sans}" font-size="32" font-weight="bold" fill="${C.emerald}">${esc(crestInitials(input.awayTeam))}</text>
  <text x="${W - 190}" y="256" text-anchor="end" font-family="${C.sans}" font-size="${awaySize}" font-weight="bold" fill="${C.ink}">${esc(input.awayTeam)}</text>

  <!-- ═══ TIP A ═══ -->
  <rect x="48" y="${A.y}" width="${W - 96}" height="${A.h}" rx="18" fill="${C.cyanSoft}" stroke="rgba(56,214,245,0.45)" stroke-width="1.6"/>
  <rect x="48" y="${A.y}" width="10" height="${A.h}" rx="5" fill="${C.cyan}"/>
  <text x="86" y="${A.labelY}" font-family="${C.sans}" font-size="21" font-weight="bold" fill="${C.cyan}" letter-spacing="3">TIP A · OPEN-GAME SIDE</text>
  <text x="${W - 86}" y="${A.oddsY}" text-anchor="end" font-family="${C.mono}" font-size="38" font-weight="bold" fill="${C.cyan}">@${input.oddsA.toFixed(2)}</text>
  <text x="86" y="${A.descY}" font-family="${C.sans}" font-size="26" fill="${C.ink}">${tspans(aLines, 86, A.descY, A.descLh)}</text>
  <rect x="86" y="${A.stakeY}" width="330" height="52" rx="12" fill="rgba(0,0,0,0.35)"/>
  <text x="106" y="${A.stakeY + 34}" font-family="${C.sans}" font-size="19" fill="${C.inkDim}">DUTCH STAKE</text>
  <text x="396" y="${A.stakeY + 34}" text-anchor="end" font-family="${C.mono}" font-size="25" font-weight="bold" fill="${C.ink}">${input.stakeA.toFixed(1)} u</text>

  <!-- ═══ TIP B ═══ -->
  <rect x="48" y="${B.y}" width="${W - 96}" height="${B.h}" rx="18" fill="${input.teaser ? "rgba(245,197,66,0.07)" : C.emeraldSoft}" stroke="${input.teaser ? "rgba(245,197,66,0.5)" : "rgba(61,220,151,0.45)"}" stroke-width="1.6"/>
  <rect x="48" y="${B.y}" width="10" height="${B.h}" rx="5" fill="${input.teaser ? C.gold : C.emerald}"/>
  <text x="86" y="${B.labelY}" font-family="${C.sans}" font-size="21" font-weight="bold" fill="${input.teaser ? C.gold : C.emerald}" letter-spacing="3">TIP B · COMPLEMENTARY SIDE</text>
  ${input.teaser
    ? `<g>${lockIcon(W - 250, B.oddsY - 14, 12, C.gold)}<text x="${W - 220}" y="${B.oddsY}" font-family="${C.sans}" font-size="28" font-weight="bold" fill="${C.gold}" letter-spacing="2">LOCKED</text></g>`
    : `<text x="${W - 86}" y="${B.oddsY}" text-anchor="end" font-family="${C.mono}" font-size="38" font-weight="bold" fill="${C.emerald}">@${input.oddsB.toFixed(2)}</text>`}
  <text x="86" y="${B.descY}" font-family="${C.sans}" font-size="26" fill="${C.ink}">${tspans(bLines, 86, B.descY, B.descLh)}</text>
  <rect x="86" y="${B.stakeY}" width="330" height="52" rx="12" fill="rgba(0,0,0,0.35)"/>
  <text x="106" y="${B.stakeY + 34}" font-family="${C.sans}" font-size="19" fill="${C.inkDim}">DUTCH STAKE</text>
  ${input.teaser
    ? `<text x="396" y="${B.stakeY + 34}" text-anchor="end" font-family="${C.sans}" font-size="23" font-weight="bold" fill="${C.gold}">VIP ONLY</text>`
    : `<text x="396" y="${B.stakeY + 34}" text-anchor="end" font-family="${C.mono}" font-size="25" font-weight="bold" fill="${C.ink}">${input.stakeB.toFixed(1)} u</text>`}

  <!-- بنر داچینگ -->
  <rect x="48" y="864" width="${W - 96}" height="80" rx="16" fill="${dw ? "rgba(245,197,66,0.16)" : C.goldSoft}" stroke="${C.gold}" stroke-opacity="0.55" stroke-width="1.6"/>
  ${dw ? `<rect x="48" y="864" width="${W - 96}" height="6" rx="3" fill="${C.gold}"/>` : ""}
  <text x="${W / 2}" y="898" text-anchor="middle" font-family="${C.sans}" font-size="20" font-weight="bold" fill="${C.gold}" letter-spacing="2.5">${dw ? "DOUBLE-WIN OPPORTUNITY · BOTH SIDES CAN WIN" : "DUTCHING COVERAGE · 100-UNIT TICKET"}</text>
  <text x="${W / 2}" y="930" text-anchor="middle" font-family="${C.sans}" font-size="24" fill="${C.ink}">Guaranteed cover profit: <tspan font-weight="bold" fill="${C.gold}">${input.guaranteedPct >= 0 ? "+" : ""}${input.guaranteedPct.toFixed(1)}%</tspan></text>

  <!-- ارزش عددی نسبت به خط پیناکل -->
  <rect x="48" y="964" width="${W - 96}" height="66" rx="14" fill="${C.cardBg}" stroke="${C.line}"/>
  <path d="M78 984 l13 17 h-26 z" fill="${edgeColor}"/>
  <text x="110" y="1004" font-family="${C.sans}" font-size="20" font-weight="bold" fill="${C.inkDim}" letter-spacing="1.5">VALUE vs PINNACLE LINE</text>
  <text x="${W - 80}" y="1005" text-anchor="end" font-family="${C.mono}" font-size="23" font-weight="bold" fill="${edgeColor}">${esc(edgeTxt)}</text>

  <!-- پنجره زمانی طلایی ثبت -->
  <rect x="48" y="1050" width="${W - 96}" height="96" rx="14" fill="${C.cardBg}" stroke="${timingColor}" stroke-opacity="0.5" stroke-width="1.6"/>
  ${clockIcon(88, 1086, 19, timingColor)}
  <text x="122" y="1080" font-family="${C.sans}" font-size="19" font-weight="bold" fill="${timingColor}" letter-spacing="1.5">BEST EXECUTION WINDOW · ${esc(input.timingTitle)}</text>
  <text x="122" y="1112" font-family="${C.sans}" font-size="23" font-weight="bold" fill="${C.ink}">${esc(tLines[0] ?? "")}</text>
  ${tLines[1] ? `<text x="122" y="1134" font-family="${C.sans}" font-size="17" fill="${C.inkDim}">${esc(tLines[1])}</text>` : ""}

  <!-- هش + راستی‌آزمایی -->
  <rect x="48" y="1166" width="${W - 96}" height="56" rx="12" fill="rgba(0,0,0,0.4)" stroke="${C.line}"/>
  <text x="76" y="1201" font-family="${C.mono}" font-size="20" fill="${C.gold}">SHA-256</text>
  <text x="196" y="1201" font-family="${C.mono}" font-size="20" fill="${C.inkDim}">${esc(input.hashShort)}…</text>
  <text x="${W - 76}" y="1201" text-anchor="end" font-family="${C.mono}" font-size="19" fill="${C.cyan}">${input.espnUrl ? "VERIFY: espn.com/soccer" : "ESPN-graded"}</text>

  ${footer(W, H, "Quantitative analysis tool · auto-graded on official ESPN scoreboard · not financial advice")}
</svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

// ═════════════════════ ۲) تصویر نتیجه پس از FT ═════════════════════

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
}

const RESULT_META: Record<ResultKind, { title: string; sub: string; accent: string; soft: string }> = {
  WON_A: { title: "TIP A WON", sub: "Settled automatically on the official ESPN final score", accent: C.emerald, soft: C.emeraldSoft },
  WON_B: { title: "TIP B WON", sub: "Settled automatically on the official ESPN final score", accent: C.emerald, soft: C.emeraldSoft },
  DOUBLE_WIN: { title: "DOUBLE-WIN JACKPOT", sub: "Both complementary tips won the same moment — golden sweep", accent: C.gold, soft: C.goldSoft },
  MIDDLE_TRAP: { title: "MIDDLE TRAP", sub: "Both tips lost — honestly recorded for full transparency", accent: C.rose, soft: C.roseSoft },
};

export async function renderResultPNG(input: ResultImageInput): Promise<Buffer> {
  const S = 1080;
  const meta = RESULT_META[input.kind];
  const jackpot = input.kind === "DOUBLE_WIN";
  const homeSize = fitSize(input.homeTeam, S / 2 - 240 - 40, 40, 18, 700);
  const awaySize = fitSize(input.awayTeam, S / 2 - 240 - 40, 40, 18, 700);
  const [hg, ag] = input.score.split(/[-:–]/).map((x) => x.trim());
  const profit = input.netProfit;
  // هندسه دوگانه: نسخه جکپات (با جام) و نسخه استاندارد
  const teamsY = jackpot ? 580 : 430;
  const scoreY = jackpot ? 608 : 458;
  const scoreTY = jackpot ? 684 : 534;
  const dashY = jackpot ? 680 : 530;
  const leagueY = jackpot ? 750 : 600;
  const netY = jackpot ? 782 : 648;
  const netLY = netY + 42;
  const netVY = netY + 96;
  const formulaY = netY + 128;
  const hashY = netY + 158;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  ${pitchBackground(S, S, meta.accent)}
  ${header(S, jackpot ? "GOLDEN SWEEP" : "FULL-TIME SETTLEMENT", "ESPN AUTO-GRADED", meta.accent)}

  <text x="${S / 2}" y="188" text-anchor="middle" font-family="${C.sans}" font-size="46" font-weight="bold" fill="${meta.accent}" letter-spacing="4">${esc(meta.title)}</text>
  <text x="${S / 2}" y="224" text-anchor="middle" font-family="${C.sans}" font-size="20" fill="${C.inkDim}">${esc(meta.sub)}</text>

  ${jackpot ? trophyVector(S / 2, 420, 1.0, C.gold) : ""}

  <!-- تیم‌ها و نتیجه -->
  <text x="${S / 2 - 240}" y="${teamsY}" text-anchor="end" font-family="${C.sans}" font-size="${homeSize}" font-weight="bold" fill="${C.ink}">${esc(input.homeTeam)}</text>
  <text x="${S / 2 + 240}" y="${teamsY}" text-anchor="start" font-family="${C.sans}" font-size="${awaySize}" font-weight="bold" fill="${C.ink}">${esc(input.awayTeam)}</text>

  <g text-anchor="middle" font-family="${C.mono}" font-weight="bold">
    <rect x="${S / 2 - 210}" y="${scoreY}" width="180" height="108" rx="18" fill="rgba(0,0,0,0.45)" stroke="${meta.accent}" stroke-opacity="0.6" stroke-width="2"/>
    <text x="${S / 2 - 120}" y="${scoreTY}" font-size="60" fill="${C.ink}">${esc(hg ?? "0")}</text>
    <rect x="${S / 2 + 30}" y="${scoreY}" width="180" height="108" rx="18" fill="rgba(0,0,0,0.45)" stroke="${meta.accent}" stroke-opacity="0.6" stroke-width="2"/>
    <text x="${S / 2 + 120}" y="${scoreTY}" font-size="60" fill="${C.ink}">${esc(ag ?? "0")}</text>
    <text x="${S / 2}" y="${dashY}" font-size="42" fill="${C.inkFaint}">−</text>
  </g>
  <text x="${S / 2}" y="${leagueY}" text-anchor="middle" font-family="${C.sans}" font-size="20" fill="${C.inkDim}">${esc(input.league)} · FT · official ESPN scoreboard</text>

  <!-- سود خالص -->
  <rect x="84" y="${netY}" width="${S - 168}" height="140" rx="18" fill="${meta.soft}" stroke="${meta.accent}" stroke-opacity="0.55" stroke-width="1.8"/>
  <text x="${S / 2}" y="${netLY}" text-anchor="middle" font-family="${C.sans}" font-size="19" font-weight="bold" fill="${C.inkDim}" letter-spacing="3">NET RESULT · 100-UNIT DUTCH TICKET</text>
  <text x="${S / 2}" y="${netVY}" text-anchor="middle" font-family="${C.mono}" font-size="50" font-weight="bold" fill="${profit >= 0 ? (jackpot ? C.gold : C.emerald) : C.rose}">${sign(profit)} units</text>

  ${input.formula ? `<text x="${S / 2}" y="${formulaY}" text-anchor="middle" font-family="${C.mono}" font-size="20" fill="${C.inkDim}">${esc(input.formula)}</text>` : ""}

  <rect x="84" y="${hashY}" width="${S - 168}" height="50" rx="12" fill="rgba(0,0,0,0.4)" stroke="${C.line}"/>
  <text x="112" y="${hashY + 32}" font-family="${C.mono}" font-size="20" fill="${C.gold}">SHA-256</text>
  <text x="240" y="${hashY + 32}" font-family="${C.mono}" font-size="20" fill="${C.inkDim}">${esc(input.hashShort)}…</text>

  ${footer(S, S, "Every settlement is graded on the official ESPN final score — zero simulation")}
</svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

// ═════════════════════ ۳) گزارش وین‌ریت کانال (تصویر اختصاصی) ═════════════════════

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
  ${pitchBackground(S, S, good ? C.emerald : C.rose)}
  ${header(S, "CHANNEL PERFORMANCE", "ESPN AUTO-SETTLED · v10", good ? C.emerald : C.rose)}

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

  <!-- سود خالص تجمعی -->
  <rect x="48" y="814" width="${S - 96}" height="126" rx="16" fill="${good ? C.emeraldSoft : C.roseSoft}" stroke="${good ? C.emerald : C.rose}" stroke-opacity="0.5" stroke-width="1.6"/>
  <text x="84" y="858" font-family="${C.sans}" font-size="19" font-weight="bold" fill="${C.inkDim}" letter-spacing="2">CUMULATIVE NET PROFIT</text>
  <text x="84" y="914" font-family="${C.mono}" font-size="44" font-weight="bold" fill="${good ? C.emerald : C.rose}">${sign(input.netProfit)} units</text>
  <text x="${S - 84}" y="858" text-anchor="end" font-family="${C.sans}" font-size="19" fill="${C.inkDim}">ROI on total staked</text>
  <text x="${S - 84}" y="914" text-anchor="end" font-family="${C.mono}" font-size="38" font-weight="bold" fill="${C.ink}">${input.netPct >= 0 ? "+" : ""}${input.netPct.toFixed(1)}%</text>

  <!-- مبنای واحد برای حساب شخصی -->
  <rect x="48" y="956" width="${S - 96}" height="58" rx="12" fill="rgba(0,0,0,0.4)" stroke="${C.line}"/>
  <text x="84" y="982" font-family="${C.sans}" font-size="18" font-weight="bold" fill="${C.gold}">UNIT BASIS: 1 unit = 1% of your own bankroll</text>
  <text x="84" y="1006" font-family="${C.sans}" font-size="17" fill="${C.inkDim}">Example · $10 balance: 1 unit = $0.10 → ${sign(input.netProfit)} units = $${(Math.abs(input.netProfit) * 0.1).toFixed(2)}</text>

  ${footer(S, S, `Generated ${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tehran" }).format(new Date(input.generatedAtIso))} · graded only on official ESPN results`)}
</svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

// ═════════════════════ ۴) تصویر تیزر VIP ═════════════════════

export async function renderTeaserPNG(input: Omit<MatchCardInput, "teaser">): Promise<Buffer> {
  return renderMatchCardPNG({ ...input, teaser: true });
}
