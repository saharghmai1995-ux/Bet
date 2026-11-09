// ─────────────────────────────────────────────────────────────────────────────
// 🤖 منطق اصلی ربات @aineobet_bot — نقل کامل بخش‌های ۵ و ۷ پایتون
//   • درگاه کارت‌به‌کارت نیمه‌خودکار (مبلغ یکتا + فیش + تایید ۱ کلیکی ادمین)
//   • درگاه تتر خودکار (TxID → استعلام بلاکچین → لینک VIP)
//   • قفل عضویت کانال عمومی + رفرال ۵ دوستی = ۴۸ ساعت VIP
//   • کنار گذاشتن اعضای منقضی از کانال VIP
// تصمیم ادمین (processAdminReceiptDecision) هم از تلگرام و هم از پنل وب صدا زده می‌شود.
// ─────────────────────────────────────────────────────────────────────────────

import type { Database } from "bun:sqlite";
import type { BotConfig } from "./config";
import {
  computeStats,
  createCardReceipt,
  extendUserVip,
  getCardReceipt,
  getOrCreateUser,
  getUser,
  insertPayment,
  isVipActive,
  setUserLang,
  setUserPlanAndMode,
  setCardReceiptStatus,
  txidAlreadyUsed,
  type VipUser,
} from "./db";
import { buildMessages, fmt, SUBSCRIPTION_PLANS, type Lang } from "./messages";
import {
  createSingleUseVipInviteLink,
  isUserInPublicChannel,
  tgApiCall,
} from "./telegram";
import { verifyUsdtTxid } from "./verify";

interface TgMessage {
  chat: { id: number };
  from?: { id: number; username?: string };
  text?: string;
  photo?: { file_id: string }[];
}

interface TgCallbackQuery {
  id: string;
  from: { id: number; username?: string };
  message?: { chat: { id: number } };
  data?: string;
}

type Update = { message?: TgMessage; callback_query?: TgCallbackQuery };

// ─── کیبوردهای شیشه‌ای ───────────────────────────────────────────────────────

type InlineButton = { text: string; callback_data?: string; url?: string };

function mainMenuKeyboard(lang: Lang, msgs: ReturnType<typeof buildMessages>) {
  const m = msgs[lang];
  return {
    inline_keyboard: [
      [{ text: m.btn_plans, callback_data: "menu_plans" }],
      [{ text: m.btn_free_signal, callback_data: "menu_free_signal" }],
      [{ text: m.btn_status, callback_data: "menu_status" }, { text: m.btn_referral, callback_data: "menu_referral" }],
      [{ text: m.btn_switch_lang, callback_data: "toggle_lang" }],
    ] as InlineButton[][],
  };
}

function plansKeyboard(lang: Lang, msgs: ReturnType<typeof buildMessages>) {
  const m = msgs[lang];
  const rows: InlineButton[][] = [];
  for (const [key, p] of Object.entries(SUBSCRIPTION_PLANS)) {
    const title = lang === "fa" ? p.title_fa : p.title_en;
    const priceLabel =
      lang === "fa"
        ? `$${p.price_usdt.toFixed(0)} | ${(p.price_toman / 1000).toLocaleString("en-US")} هزار تومان`
        : `$${p.price_usdt.toFixed(0)} USDT`;
    rows.push([{ text: `${title} (${priceLabel})`, callback_data: `select_plan_${key}` }]);
  }
  rows.push([{ text: lang === "fa" ? "🔙 بازگشت به منوی اصلی" : "🔙 Back to Main Menu", callback_data: "back_main" }]);
  return { inline_keyboard: rows };
}

// ─── درگاه کارت‌به‌کارت: مبلغ یکتا با کد شناسایی ۳ رقمی ──────────────────────

export function generateUniqueTomanAmount(baseToman: number): number {
  const uniqueSuffix = (11 + Math.floor(Math.random() * 79)) * 10; // 110..880 مثل پایتون
  return baseToman + uniqueSuffix;
}

// ─── اطلاع‌رسانی فیش جدید به ادمین با دکمه‌های ۱ کلیکی ───────────────────────

async function notifyAdminOfCardReceipt(db: Database, cfg: BotConfig, receiptId: number): Promise<void> {
  const rec = getCardReceipt(db, receiptId);
  if (!rec) return;
  const msgs = buildMessages(cfg.publicChannelUsername);
  const plan = SUBSCRIPTION_PLANS[rec.plan_key] ?? SUBSCRIPTION_PLANS.pro_monthly;
  const userTag = rec.username ? `@${rec.username}` : `ID: <code>${rec.user_id}</code>`;
  const adminCaption =
    `🔔 <b>رسید جدید کارت‌به‌کارت (#${rec.id})</b>\n\n` +
    `👤 <b>کاربر:</b> ${userTag} (<code>${rec.user_id}</code>)\n` +
    `📦 <b>پلن درخواستی:</b> ${plan.title_fa}\n` +
    `💰 <b>مبلغ تعیین‌شده با کد شناسایی:</b> <code>${rec.expected_toman.toLocaleString("en-US")}</code> تومان\n` +
    `🕒 <b>زمان ثبت:</b> ${rec.submitted_at.slice(0, 19)} UTC`;
  const adminKb = {
    inline_keyboard: [
      [{ text: `✅ تایید و ارسال لینک VIP (#${rec.id})`, callback_data: `admin_approve_${rec.id}` }],
      [{ text: `❌ رد کردن رسید (#${rec.id})`, callback_data: `admin_reject_${rec.id}` }],
    ] as InlineButton[][],
  };

  if (rec.receipt_type === "PHOTO") {
    await tgApiCall(cfg, "sendPhoto", {
      chat_id: cfg.adminUserId,
      photo: rec.receipt_content,
      caption: adminCaption,
      parse_mode: "HTML",
      reply_markup: adminKb,
    });
  } else {
    await tgApiCall(cfg, "sendMessage", {
      chat_id: cfg.adminUserId,
      text: `${adminCaption}\n📝 <b>مشخصات ارسالی کاربر:</b>\n<code>${rec.receipt_content}</code>`,
      parse_mode: "HTML",
      reply_markup: adminKb,
    });
  }
}

export interface AdminDecisionResult {
  ok: boolean;
  statusMessage: string;
  info?: { user_id: number; expires_at: string; invite_link: string };
}

/**
 * تصمیم ادمین روی فیش کارت‌به‌کارت — از تلگرام (دکمه) و از پنل وب فراخوانی می‌شود.
 * تایید → فعال‌سازی اشتراک + لینک یک‌بارمصرف VIP + پیام به کاربر.
 */
export async function processAdminReceiptDecision(
  db: Database,
  cfg: BotConfig,
  receiptId: number,
  approve: boolean
): Promise<AdminDecisionResult> {
  const rec = getCardReceipt(db, receiptId);
  if (!rec) return { ok: false, statusMessage: "رسید یافت نشد." };
  if (rec.status !== "PENDING") {
    return { ok: false, statusMessage: `این رسید قبلاً در وضعیت ${rec.status} قرار گرفته است.` };
  }

  setCardReceiptStatus(db, receiptId, approve ? "APPROVED" : "REJECTED");

  const msgs = buildMessages(cfg.publicChannelUsername);
  const user = getOrCreateUser(db, rec.user_id);
  const lang: Lang = user.lang === "en" ? "en" : "fa";
  const m = msgs[lang];
  const plan = SUBSCRIPTION_PLANS[rec.plan_key] ?? SUBSCRIPTION_PLANS.pro_monthly;
  const planTitle = lang === "fa" ? plan.title_fa : plan.title_en;

  if (approve) {
    const expStr = extendUserVip(db, rec.user_id, plan.days, rec.plan_key);
    const inviteLink = await createSingleUseVipInviteLink(cfg, rec.user_id, plan.days);
    const userMsg = fmt(m.card_approved_user, {
      receipt_id: receiptId,
      plan_title: planTitle,
      expires_at: expStr,
      invite_link: inviteLink,
    });
    await tgApiCall(cfg, "sendMessage", { chat_id: rec.user_id, text: userMsg, parse_mode: "HTML" });
    return {
      ok: true,
      statusMessage: `✅ رسید #${receiptId} تایید شد و لینک یک‌بارمصرف VIP برای کاربر ${rec.user_id} ارسال گردید.`,
      info: { user_id: rec.user_id, expires_at: expStr, invite_link: inviteLink },
    };
  }

  const userMsg = fmt(m.card_rejected_user, { receipt_id: receiptId });
  await tgApiCall(cfg, "sendMessage", { chat_id: rec.user_id, text: userMsg, parse_mode: "HTML" });
  return { ok: true, statusMessage: `❌ رسید #${receiptId} رد شد و به کاربر اطلاع داده شد.` };
}

// ─── کنار گذاشتن اعضای منقضی از کانال VIP (ساعتی) ───────────────────────────

export async function sweepExpiredVipMembers(db: Database, cfg: BotConfig): Promise<number> {
  const nowIso = new Date().toISOString();
  const expired = db.query("SELECT user_id FROM users WHERE vip_expires_at IS NOT NULL AND vip_expires_at < ?").all(nowIso) as { user_id: number }[];
  let removed = 0;
  for (const row of expired) {
    await tgApiCall(cfg, "banChatMember", { chat_id: cfg.vipChannelId, user_id: row.user_id });
    await tgApiCall(cfg, "unbanChatMember", { chat_id: cfg.vipChannelId, user_id: row.user_id, only_if_banned: true });
    db.run("UPDATE users SET vip_expires_at = NULL WHERE user_id = ?", [row.user_id]);
    removed += 1;
  }
  return removed;
}

// ─── پردازشگر آپدیت‌های تلگرام (بخش ۷ پایتون) ───────────────────────────────

export async function handleUpdate(db: Database, cfg: BotConfig, update: Update): Promise<void> {
  const msgs = buildMessages(cfg.publicChannelUsername);

  if (update.message) {
    const msg = update.message;
    const chatId = msg.chat.id;
    const userId = msg.from?.id ?? chatId;
    const username = msg.from?.username ?? "";
    const text = (msg.text ?? "").trim();
    const photos = msg.photo ?? [];

    let referredBy: number | null = null;
    if (text.startsWith("/start") && text.includes("ref_")) {
      try {
        const refId = parseInt(text.split("ref_")[1].trim(), 10);
        if (Number.isFinite(refId) && refId !== userId) referredBy = refId;
      } catch {
        /* ref نامعتبر */
      }
    }

    const user = getOrCreateUser(db, userId, username, referredBy);
    const lang: Lang = user.lang === "en" ? "en" : "fa";
    const m = msgs[lang];

    if (text.startsWith("/start")) {
      setUserPlanAndMode(db, userId, user.selected_plan, "NONE", user.pending_toman_amount);
      await tgApiCall(cfg, "sendMessage", {
        chat_id: chatId,
        text: m.welcome,
        parse_mode: "HTML",
        reply_markup: mainMenuKeyboard(lang, msgs),
      });
      return;
    }

    // الف) عکس فیش واریزی → ثبت فیش + ارسال به ادمین
    if (photos.length > 0) {
      const bestPhotoFileId = photos[photos.length - 1].file_id;
      const planKey = user.selected_plan || "pro_monthly";
      const expectedToman =
        user.pending_toman_amount ||
        (SUBSCRIPTION_PLANS[planKey] ?? SUBSCRIPTION_PLANS.pro_monthly).price_toman;
      const receiptId = createCardReceipt(db, userId, username, planKey, expectedToman, "PHOTO", bestPhotoFileId);
      await notifyAdminOfCardReceipt(db, cfg, receiptId);
      await tgApiCall(cfg, "sendMessage", {
        chat_id: chatId,
        text: fmt(m.receipt_submitted_user, { receipt_id: receiptId }),
        parse_mode: "HTML",
      });
      return;
    }

    // ب) متن رسید (کد پیگیری / ۴ رقم آخر کارت) در حالت انتظار فیش
    if (user.payment_mode === "AWAITING_CARD_RECEIPT" && text.length >= 4 && text.length !== 64 && text.length !== 66) {
      const planKey = user.selected_plan || "pro_monthly";
      const expectedToman =
        user.pending_toman_amount ||
        (SUBSCRIPTION_PLANS[planKey] ?? SUBSCRIPTION_PLANS.pro_monthly).price_toman;
      const receiptId = createCardReceipt(db, userId, username, planKey, expectedToman, "TEXT", text);
      await notifyAdminOfCardReceipt(db, cfg, receiptId);
      await tgApiCall(cfg, "sendMessage", {
        chat_id: chatId,
        text: fmt(m.receipt_submitted_user, { receipt_id: receiptId }),
        parse_mode: "HTML",
      });
      return;
    }

    // ج) TxID تتر (۶۴ یا ۶۶ کاراکتر hex) → استعلام خودکار بلاکچین
    if (
      (text.length === 64 || text.length === 66) &&
      [...text].every((c) => "0123456789abcdefABCDEFxX".includes(c))
    ) {
      await tgApiCall(cfg, "sendMessage", { chat_id: chatId, text: m.verifying_tx });
      const planKey = user.selected_plan || "pro_monthly";
      const plan = SUBSCRIPTION_PLANS[planKey] ?? SUBSCRIPTION_PLANS.pro_monthly;

      if (txidAlreadyUsed(db, text.trim())) {
        await tgApiCall(cfg, "sendMessage", { chat_id: chatId, text: m.tx_already_used, parse_mode: "HTML" });
        return;
      }

      const vr = await verifyUsdtTxid(text, cfg.walletUsdtTrc20, cfg.walletUsdtPolygon, plan.price_usdt);
      if (!vr.ok) {
        await tgApiCall(cfg, "sendMessage", {
          chat_id: chatId,
          text: fmt(m.tx_failed, { reason: vr.message }),
          parse_mode: "HTML",
        });
        return;
      }

      insertPayment(db, text.trim(), userId, vr.network, vr.amount, planKey);
      const expStr = extendUserVip(db, userId, plan.days, planKey);
      const inviteLink = await createSingleUseVipInviteLink(cfg, userId, plan.days);
      const planTitle = lang === "fa" ? plan.title_fa : plan.title_en;
      await tgApiCall(cfg, "sendMessage", {
        chat_id: chatId,
        text: fmt(m.tx_success, {
          plan_title: planTitle,
          amount: vr.amount.toFixed(2),
          network: vr.network,
          expires_at: expStr,
          invite_link: inviteLink,
        }),
        parse_mode: "HTML",
      });
      return;
    }
    return;
  }

  if (update.callback_query) {
    const cb = update.callback_query;
    const cbId = cb.id;
    const chatId = cb.message?.chat.id ?? cb.from.id;
    const userId = cb.from.id;
    const data = cb.data ?? "";

    // دکمه‌های ۱ کلیکی ادمین روی فیش کارت‌به‌کارت
    if (data.startsWith("admin_approve_") || data.startsWith("admin_reject_")) {
      if (userId !== cfg.adminUserId) {
        await tgApiCall(cfg, "answerCallbackQuery", { callback_query_id: cbId, text: "⛔ فقط ادمین دسترسی دارد." });
        return;
      }
      const approve = data.startsWith("admin_approve_");
      const recId = parseInt(data.split("_").pop() ?? "0", 10);
      const result = await processAdminReceiptDecision(db, cfg, recId, approve);
      await tgApiCall(cfg, "sendMessage", { chat_id: cfg.adminUserId, text: result.statusMessage, parse_mode: "HTML" });
      await tgApiCall(cfg, "answerCallbackQuery", { callback_query_id: cbId, text: result.statusMessage.slice(0, 40) });
      return;
    }

    const user = getOrCreateUser(db, userId, cb.from.username ?? "");
    let lang: Lang = user.lang === "en" ? "en" : "fa";

    if (data === "toggle_lang") {
      lang = lang === "fa" ? "en" : "fa";
      setUserLang(db, userId, lang);
    }

    const m = msgs[lang];

    if (data === "toggle_lang" || data === "back_main") {
      await tgApiCall(cfg, "sendMessage", {
        chat_id: chatId,
        text: m.welcome,
        parse_mode: "HTML",
        reply_markup: mainMenuKeyboard(lang, msgs),
      });
    } else if (data === "menu_plans") {
      await tgApiCall(cfg, "sendMessage", {
        chat_id: chatId,
        text: m.select_plan,
        parse_mode: "HTML",
        reply_markup: plansKeyboard(lang, msgs),
      });
    } else if (data.startsWith("select_plan_")) {
      const planKey = data.replace("select_plan_", "");
      if (SUBSCRIPTION_PLANS[planKey]) {
        setUserPlanAndMode(db, userId, planKey, "NONE", user.pending_toman_amount);
        const plan = SUBSCRIPTION_PLANS[planKey];
        const planTitle = lang === "fa" ? plan.title_fa : plan.title_en;
        const txt = fmt(m.choose_payment_method, {
          plan_title: planTitle,
          days: plan.days,
          amount_usdt: plan.price_usdt.toFixed(2),
          amount_toman: plan.price_toman.toLocaleString("en-US"),
        });
        const kb = {
          inline_keyboard: [
            [{ text: m.btn_verify_tx, callback_data: `pay_usdt_${planKey}` }],
            [{ text: m.btn_card_to_card, callback_data: `pay_card_${planKey}` }],
            [{ text: lang === "fa" ? "🔙 بازگشت" : "🔙 Back", callback_data: "menu_plans" }],
          ] as InlineButton[][],
        };
        await tgApiCall(cfg, "sendMessage", { chat_id: chatId, text: txt, parse_mode: "HTML", reply_markup: kb });
      }
    } else if (data.startsWith("pay_usdt_")) {
      const planKey = data.replace("pay_usdt_", "");
      if (SUBSCRIPTION_PLANS[planKey]) {
        setUserPlanAndMode(db, userId, planKey, "AWAITING_USDT_TXID", user.pending_toman_amount);
        const plan = SUBSCRIPTION_PLANS[planKey];
        const planTitle = lang === "fa" ? plan.title_fa : plan.title_en;
        const invoiceText = fmt(m.payment_invoice_usdt, {
          plan_title: planTitle,
          amount: plan.price_usdt.toFixed(2),
          wallet_trc20: cfg.walletUsdtTrc20,
          wallet_polygon: cfg.walletUsdtPolygon,
        });
        await tgApiCall(cfg, "sendMessage", { chat_id: chatId, text: invoiceText, parse_mode: "HTML" });
      }
    } else if (data.startsWith("pay_card_")) {
      const planKey = data.replace("pay_card_", "");
      if (SUBSCRIPTION_PLANS[planKey]) {
        const plan = SUBSCRIPTION_PLANS[planKey];
        const exactToman = generateUniqueTomanAmount(plan.price_toman);
        setUserPlanAndMode(db, userId, planKey, "AWAITING_CARD_RECEIPT", exactToman);
        const planTitle = lang === "fa" ? plan.title_fa : plan.title_en;
        const invoiceText = fmt(m.payment_invoice_card, {
          plan_title: planTitle,
          exact_toman: exactToman.toLocaleString("en-US"),
          bank_name: cfg.bankName,
          card_number: cfg.bankCardNumber,
          card_holder: cfg.bankCardHolder,
        });
        await tgApiCall(cfg, "sendMessage", { chat_id: chatId, text: invoiceText, parse_mode: "HTML" });
      }
    } else if (data === "menu_free_signal" || data === "check_join") {
      if (!(await isUserInPublicChannel(cfg, userId))) {
        await tgApiCall(cfg, "sendMessage", {
          chat_id: chatId,
          text: m.force_sub_alert,
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: `📢 Join ${cfg.publicChannelUsername}`, url: `https://t.me/${cfg.publicChannelUsername.replace("@", "")}` }],
              [{ text: m.btn_check_join, callback_data: "check_join" }],
            ] as InlineButton[][],
          },
        });
      } else {
        // اعتبار رفرال: عضو جدیدِ معرفی‌شده → شمارنده دعوت‌کننده + جایزه خودکار هر ۵ نفر
        if (user.referred_by) {
          const inviterId = user.referred_by;
          db.run("UPDATE users SET referral_count = referral_count + 1 WHERE user_id = ?", [inviterId]);
          db.run("UPDATE users SET referred_by = NULL WHERE user_id = ?", [userId]);
          const inviter = getUser(db, inviterId);
          if (inviter && Math.floor(inviter.referral_count / 5) > inviter.reward_claimed_count) {
            db.run("UPDATE users SET reward_claimed_count = reward_claimed_count + 1 WHERE user_id = ?", [inviterId]);
            extendUserVip(db, inviterId, 2, "weekend");
          }
        }
        await tgApiCall(cfg, "sendMessage", { chat_id: chatId, text: m.free_signal_unlocked, parse_mode: "HTML" });
      }
    } else if (data === "menu_status") {
      const fresh = getUser(db, userId) as VipUser;
      let expDisplay = "";
      let isVip = false;
      if (fresh.vip_expires_at) {
        try {
          const expDt = new Date(fresh.vip_expires_at);
          if (expDt > new Date()) {
            isVip = true;
            const pad = (n: number) => String(n).padStart(2, "0");
            expDisplay = `${expDt.getUTCFullYear()}-${pad(expDt.getUTCMonth() + 1)}-${pad(expDt.getUTCDate())} ${pad(expDt.getUTCHours())}:${pad(expDt.getUTCMinutes())} UTC`;
          }
        } catch {
          /* تاریخ نامعتبر */
        }
      }
      if (isVip) {
        const pKey = fresh.selected_plan || "pro_monthly";
        const pObj = SUBSCRIPTION_PLANS[pKey] ?? SUBSCRIPTION_PLANS.pro_monthly;
        const pTitle = lang === "fa" ? pObj.title_fa : pObj.title_en;
        await tgApiCall(cfg, "sendMessage", {
          chat_id: chatId,
          text: fmt(m.status_active, { plan: pTitle, expires_at: expDisplay, referrals: fresh.referral_count }),
          parse_mode: "HTML",
        });
      } else {
        await tgApiCall(cfg, "sendMessage", {
          chat_id: chatId,
          text: fmt(m.status_inactive, { referrals: fresh.referral_count }),
          parse_mode: "HTML",
        });
      }
    } else if (data === "menu_referral") {
      const refLink = `https://t.me/${cfg.botUsername}?start=ref_${userId}`;
      const fresh = getUser(db, userId) as VipUser;
      await tgApiCall(cfg, "sendMessage", {
        chat_id: chatId,
        text: fmt(m.referral_info, { ref_link: refLink, referrals: fresh.referral_count }),
        parse_mode: "HTML",
      });
    }

    await tgApiCall(cfg, "answerCallbackQuery", { callback_query_id: cbId });
  }
}

// ─── خودآزمایی چرخه کارت‌به‌کارت (معادل __main__ پایتون — روی DB درون‌حافظه) ──

export async function runSelfTest(): Promise<{ ok: boolean; exactToman: number; message: string }> {
  const { openDatabase } = await import("./db");
  const { defaultConfig } = await import("./config");
  const testDb = openDatabase(":memory:");
  const cfg: BotConfig = { ...defaultConfig(), botToken: "YOUR_TELEGRAM_BOT_TOKEN" }; // بدون ارسال واقعی
  const u = getOrCreateUser(testDb, 888001, "iran_vip_user");
  const uniqueToman = generateUniqueTomanAmount(SUBSCRIPTION_PLANS.pro_monthly.price_toman);
  setUserPlanAndMode(testDb, u.user_id, "pro_monthly", "AWAITING_CARD_RECEIPT", uniqueToman);
  const recId = createCardReceipt(testDb, u.user_id, "iran_vip_user", "pro_monthly", uniqueToman, "PHOTO", "file_id_test_123");
  const result = await processAdminReceiptDecision(testDb, cfg, recId, true);
  const after = getUser(testDb, u.user_id);
  const vipOk = Boolean(after?.vip_expires_at);
  const stats = computeStats(testDb);
  return {
    ok: result.ok && vipOk && stats.activeVip === 1,
    exactToman: uniqueToman,
    message: `✅ Card-to-Card Self-Test Passed! Exact Toman: ${uniqueToman.toLocaleString("en-US")} | ${result.statusMessage}`,
  };
}
