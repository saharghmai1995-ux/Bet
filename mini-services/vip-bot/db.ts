// ─────────────────────────────────────────────────────────────────────────────
// 🗄️ لایه دیتابیس موتور اشتراک VIP — bun:sqlite (معادل ۱:۱ بخش ۳ پایتون)
// جداول: users / payments / card_receipts / config
// ─────────────────────────────────────────────────────────────────────────────

import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface VipUser {
  user_id: number;
  username: string | null;
  lang: "fa" | "en";
  selected_plan: string;
  payment_mode: string; // NONE | AWAITING_USDT_TXID | AWAITING_CARD_RECEIPT
  pending_toman_amount: number;
  vip_expires_at: string | null;
  referred_by: number | null;
  referral_count: number;
  reward_claimed_count: number;
  joined_at: string;
}

export interface VipPayment {
  id: number;
  txid: string;
  user_id: number;
  network: string;
  amount_usdt: number;
  plan_key: string;
  verified_at: string;
}

export interface CardReceipt {
  id: number;
  user_id: number;
  username: string | null;
  plan_key: string;
  expected_toman: number;
  receipt_type: "PHOTO" | "TEXT";
  receipt_content: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  submitted_at: string;
  reviewed_at: string | null;
}

/** ایجاد اتصال و ساخت جداول (اسکیمای دقیق پایتون) */
export function openDatabase(dbPath: string): Database {
  if (dbPath !== ":memory:") mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA busy_timeout = 5000;");
  createSchema(db);
  return db;
}

export function createSchema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      user_id INTEGER PRIMARY KEY,
      username TEXT,
      lang TEXT DEFAULT 'fa',
      selected_plan TEXT DEFAULT 'pro_monthly',
      payment_mode TEXT DEFAULT 'NONE',
      pending_toman_amount INTEGER DEFAULT 0,
      vip_expires_at TEXT,
      referred_by INTEGER,
      referral_count INTEGER DEFAULT 0,
      reward_claimed_count INTEGER DEFAULT 0,
      joined_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      txid TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL,
      network TEXT NOT NULL,
      amount_usdt REAL NOT NULL,
      plan_key TEXT NOT NULL,
      verified_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS card_receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      username TEXT,
      plan_key TEXT NOT NULL,
      expected_toman INTEGER NOT NULL,
      receipt_type TEXT NOT NULL,
      receipt_content TEXT NOT NULL,
      status TEXT DEFAULT 'PENDING',
      submitted_at TEXT NOT NULL,
      reviewed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
}

// ─── کاربران ────────────────────────────────────────────────────────────────

export function getUser(db: Database, userId: number): VipUser | null {
  return (db.query("SELECT * FROM users WHERE user_id = ?").get(userId) as VipUser | null) ?? null;
}

/** دریافت یا ساخت کاربر + به‌روزرسانی username (معادل get_or_create_user) */
export function getOrCreateUser(
  db: Database,
  userId: number,
  username = "",
  referredBy: number | null = null
): VipUser {
  const existing = getUser(db, userId);
  if (existing) {
    if (username && existing.username !== username) {
      db.run("UPDATE users SET username = ? WHERE user_id = ?", [username, userId]);
    }
    return getUser(db, userId)!;
  }
  const nowIso = new Date().toISOString();
  db.run(
    "INSERT INTO users (user_id, username, lang, referred_by, joined_at) VALUES (?, ?, 'fa', ?, ?)",
    [userId, username, referredBy, nowIso]
  );
  return getUser(db, userId)!;
}

export function setUserLang(db: Database, userId: number, lang: string): void {
  db.run("UPDATE users SET lang = ? WHERE user_id = ?", [lang, userId]);
}

export function setUserPlanAndMode(
  db: Database,
  userId: number,
  planKey: string,
  mode: string,
  tomanAmount = 0
): void {
  db.run(
    "UPDATE users SET selected_plan = ?, payment_mode = ?, pending_toman_amount = ? WHERE user_id = ?",
    [planKey, mode, tomanAmount, userId]
  );
}

/** تمدید VIP — اگر اشتراک فعال داشته باشد از انقضای قبلی جمع می‌شود */
export function extendUserVip(db: Database, userId: number, days: number, planKey: string): string {
  const row = getUser(db, userId);
  const now = new Date();
  let baseTime = now;
  if (row?.vip_expires_at) {
    try {
      const existingExp = new Date(row.vip_expires_at);
      if (!Number.isNaN(existingExp.getTime()) && existingExp > now) baseTime = existingExp;
    } catch {
      /* تاریخ نامعتبر — از الان */
    }
  }
  const newExp = new Date(baseTime.getTime() + days * 86_400_000);
  // فرمت نمایش پایتون: "%Y-%m-%d %H:%M UTC"
  const pad = (n: number) => String(n).padStart(2, "0");
  const display = `${newExp.getUTCFullYear()}-${pad(newExp.getUTCMonth() + 1)}-${pad(newExp.getUTCDate())} ${pad(newExp.getUTCHours())}:${pad(newExp.getUTCMinutes())} UTC`;
  db.run(
    "UPDATE users SET vip_expires_at = ?, selected_plan = ?, payment_mode = 'NONE' WHERE user_id = ?",
    [newExp.toISOString(), planKey, userId]
  );
  return display;
}

export function isVipActive(user: VipUser): boolean {
  if (!user.vip_expires_at) return false;
  const exp = new Date(user.vip_expires_at);
  return !Number.isNaN(exp.getTime()) && exp > new Date();
}

// ─── پرداخت‌های تتر ─────────────────────────────────────────────────────────

export function txidAlreadyUsed(db: Database, txid: string): boolean {
  return db.query("SELECT id FROM payments WHERE txid = ?").get(txid) != null;
}

export function insertPayment(
  db: Database,
  txid: string,
  userId: number,
  network: string,
  amountUsdt: number,
  planKey: string
): void {
  db.run(
    "INSERT INTO payments (txid, user_id, network, amount_usdt, plan_key, verified_at) VALUES (?, ?, ?, ?, ?, ?)",
    [txid, userId, network, amountUsdt, planKey, new Date().toISOString()]
  );
}

// ─── فیش‌های کارت‌به‌کارت ────────────────────────────────────────────────────

export function createCardReceipt(
  db: Database,
  userId: number,
  username: string,
  planKey: string,
  expectedToman: number,
  receiptType: "PHOTO" | "TEXT",
  receiptContent: string
): number {
  const nowIso = new Date().toISOString();
  const res = db.run(
    `INSERT INTO card_receipts (
       user_id, username, plan_key, expected_toman, receipt_type, receipt_content, status, submitted_at
     ) VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
    [userId, username, planKey, expectedToman, receiptType, receiptContent, nowIso]
  );
  db.run("UPDATE users SET payment_mode = 'NONE' WHERE user_id = ?", [userId]);
  return Number(res.lastInsertRowid);
}

export function getCardReceipt(db: Database, receiptId: number): CardReceipt | null {
  return (
    (db.query("SELECT * FROM card_receipts WHERE id = ?").get(receiptId) as CardReceipt | null) ?? null
  );
}

export function setCardReceiptStatus(db: Database, receiptId: number, status: string): void {
  db.run("UPDATE card_receipts SET status = ?, reviewed_at = ? WHERE id = ?", [
    status,
    new Date().toISOString(),
    receiptId,
  ]);
}

// ─── گزارش‌های وب ───────────────────────────────────────────────────────────

export interface BotStats {
  totalMembers: number;
  activeVip: number;
  totalPayments: number;
  totalUsdt: number;
  pendingReceipts: number;
  totalReferrals: number;
}

export function computeStats(db: Database): BotStats {
  const nowIso = new Date().toISOString();
  const r = (sql: string, ...params: (string | number)[]): number => {
    const row = db.query(sql).get(...params) as { c: number } | null;
    return row?.c ?? 0;
  };
  return {
    totalMembers: r("SELECT COUNT(*) AS c FROM users"),
    activeVip: r("SELECT COUNT(*) AS c FROM users WHERE vip_expires_at IS NOT NULL AND vip_expires_at > ?", nowIso),
    totalPayments: r("SELECT COUNT(*) AS c FROM payments"),
    totalUsdt: (db.query("SELECT COALESCE(SUM(amount_usdt), 0) AS c FROM payments").get() as { c: number }).c,
    pendingReceipts: r("SELECT COUNT(*) AS c FROM card_receipts WHERE status = 'PENDING'"),
    totalReferrals: r("SELECT COALESCE(SUM(referral_count), 0) AS c FROM users"),
  };
}
