// ─────────────────────────────────────────────────────────────────────────────
// ⚙️ پیکربندی موتور اشتراک @aineobet_bot — ذخیره در SQLite + fallback به env
// معادل بخش ۱ فایل پایتون (BOT_TOKEN، کیف پول‌ها، کارت بانکی، نرخ تتر)
// تمام مقادیر از پنل وب (تب ربات اشتراک VIP) قابل ویرایش‌اند — بدون ری‌استارت.
// ─────────────────────────────────────────────────────────────────────────────

import type { Database } from "bun:sqlite";

export interface BotConfig {
  botToken: string;
  botUsername: string;
  publicChannelUsername: string;
  vipChannelId: string;
  adminUserId: number;
  walletUsdtTrc20: string;
  walletUsdtPolygon: string;
  bankCardNumber: string;
  bankCardHolder: string;
  bankName: string;
  usdtToTomanRate: number;
  pollingEnabled: boolean;
}

/** پیش‌فرض‌ها — دقیقاً مطابق فایل پایتون مرجع */
export function defaultConfig(): BotConfig {
  return {
    botToken: process.env.TELEGRAM_BOT_TOKEN ?? "YOUR_TELEGRAM_BOT_TOKEN",
    botUsername: process.env.BOT_USERNAME ?? "aineobet_bot",
    publicChannelUsername: process.env.PUBLIC_CHANNEL_USERNAME ?? "@aineobet",
    vipChannelId: process.env.VIP_CHANNEL_ID ?? "-1001234567890",
    adminUserId: Number(process.env.ADMIN_USER_ID ?? "123456789"),
    walletUsdtTrc20: process.env.WALLET_USDT_TRC20 ?? "TYourTronWalletAddressHereXXXXXXXXXX",
    walletUsdtPolygon: process.env.WALLET_USDT_POLYGON ?? "0xYourPolygonWalletAddressHereXXXXXXXXXXXX",
    bankCardNumber: process.env.BANK_CARD_NUMBER ?? "6037-9975-XXXX-XXXX",
    bankCardHolder: process.env.BANK_CARD_HOLDER ?? "نام صاحب حساب",
    bankName: process.env.BANK_NAME ?? "بانک ملی / ملت / سامان",
    usdtToTomanRate: Number(process.env.USDT_TO_TOMAN_RATE ?? "65000"),
    pollingEnabled: true,
  };
}

type ConfigRow = { key: string; value: string };

/** بارگذاری پیکربندی: مقدار ذخیره‌شده در DB > متغیر محیطی > پیش‌فرض پایتون */
export function loadConfig(db: Database): BotConfig {
  const cfg = defaultConfig();
  let rows: ConfigRow[] = [];
  try {
    rows = db.query("SELECT key, value FROM config").all() as ConfigRow[];
  } catch {
    return cfg; // جدول هنوز ساخته نشده
  }
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const s = (k: keyof BotConfig, cur: string) => (map.get(k) ?? cur).trim() || cur;
  cfg.botToken = s("botToken", cfg.botToken);
  cfg.botUsername = s("botUsername", cfg.botUsername);
  cfg.publicChannelUsername = s("publicChannelUsername", cfg.publicChannelUsername);
  cfg.vipChannelId = s("vipChannelId", cfg.vipChannelId);
  cfg.adminUserId = Number(map.get("adminUserId") ?? cfg.adminUserId) || cfg.adminUserId;
  cfg.walletUsdtTrc20 = s("walletUsdtTrc20", cfg.walletUsdtTrc20);
  cfg.walletUsdtPolygon = s("walletUsdtPolygon", cfg.walletUsdtPolygon);
  cfg.bankCardNumber = s("bankCardNumber", cfg.bankCardNumber);
  cfg.bankCardHolder = s("bankCardHolder", cfg.bankCardHolder);
  cfg.bankName = s("bankName", cfg.bankName);
  cfg.usdtToTomanRate = Number(map.get("usdtToTomanRate") ?? cfg.usdtToTomanRate) || cfg.usdtToTomanRate;
  cfg.pollingEnabled = (map.get("pollingEnabled") ?? "1") === "1" || map.get("pollingEnabled") === "true";
  return cfg;
}

const CONFIG_KEYS: (keyof BotConfig)[] = [
  "botToken",
  "botUsername",
  "publicChannelUsername",
  "vipChannelId",
  "adminUserId",
  "walletUsdtTrc20",
  "walletUsdtPolygon",
  "bankCardNumber",
  "bankCardHolder",
  "bankName",
  "usdtToTomanRate",
  "pollingEnabled",
];

/** ذخیره یک وصله پیکربندی — فقط کلیدهای مجاز */
export function saveConfig(db: Database, patch: Partial<BotConfig>): BotConfig {
  const stmt = db.query(
    "INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  );
  for (const key of CONFIG_KEYS) {
    if (patch[key] === undefined || patch[key] === null) continue;
    const v = patch[key];
    stmt.run(key, String(v));
  }
  return loadConfig(db);
}

/** آیا توکن واقعی ست شده؟ (برای وضعیت polling) */
export function isTokenConfigured(cfg: BotConfig): boolean {
  return Boolean(cfg.botToken && cfg.botToken.length > 20 && !cfg.botToken.includes("YOUR_"));
}

/** ماسک کردن توکن برای نمایش وب */
export function maskToken(token: string): string {
  if (!token || token.includes("YOUR_")) return "";
  if (token.length <= 10) return "•••••";
  return `${token.slice(0, 6)}••••••••${token.slice(-4)}`;
}
