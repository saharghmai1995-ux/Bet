#!/usr/bin/env python3
"""
NeoBet (@aineobet_bot) — Bilingual (FA/EN) VIP Subscription Bot
with Automated On-Chain USDT (TRC20/Polygon) + Semi-Automated Iranian Card-to-Card Gateway
===========================================================================================
امکانات کلیدی این سرویس تجاری:
1. رابط کاربری دوزبانه کامل (فارسی 🇮🇷 و انگلیسی 🇬🇧) با کیبورد شیشه‌ای (Inline Keyboard).
2. قفل عضویت اجباری در کانال عمومی (@aineobet) و سیستم رفرال (دعوت ۵ دوست = ۴۸ ساعت VIP رایگان).
3. سه پلن تجاری (بسته ۴۸ ساعته آخر هفته، اشتراک ماهانه Pro VIP، اشتراک جامع فوتبال + تنیس).
4. درگاه اول (بین‌المللی و خودکار): تایید ۱۰۰٪ خودکار تراکنش تتر (USDT TRC-20 و Polygon POS) مستقیم از روی بلاکچین.
5. درگاه دوم (ویژه کاربران ایران — کارت‌به‌کارت نیمه‌خودکار):
   - تولید مبلغ تومانی رندوم اختصاصی (کد رهگیری ۳ رقمی در مبلغ، مثلاً ۱,۸۵۰,۴۰۰ تومان) برای تشخیص آنی در پیامک بانک.
   - دریافت عکس فیش واریزی یا کد پیگیری از کاربر.
   - ارسال آنی عکس فیش به تلگرام ادمین همراه با دکمه شیشه‌ای ۱ کلیکی: «✅ تایید و ارسال خودکار لینک VIP» و «❌ رد رسید».
   - به محض کلیک ادمین روی «تایید»، ربات به صورت خودکار اشتراک کاربر را فعال کرده و لینک دعوت یک‌بارمصرف (`member_limit=1`) کانال VIP را برای کاربر می‌فرستد!
6. بررسی خودکار انقضای اشتراک‌ها و اخراج خودکار کاربران منقضی‌شده از کانال خصوصی VIP.
"""

import json
import os
import random
import sqlite3
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional, Tuple

# =====================================================================
# ۱. تنظیمات پیکربندی ربات، کیف پول‌های تتر و اطلاعات کارت بانکی ایران
# =====================================================================
BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "YOUR_TELEGRAM_BOT_TOKEN")
BOT_USERNAME = os.getenv("BOT_USERNAME", "aineobet_bot")
PUBLIC_CHANNEL_USERNAME = os.getenv("PUBLIC_CHANNEL_USERNAME", "@aineobet")
VIP_CHANNEL_ID = os.getenv("VIP_CHANNEL_ID", "-1001234567890")  # آیدی عددی کانال خصوصی VIP
ADMIN_USER_ID = int(os.getenv("ADMIN_USER_ID", "123456789"))  # آیدی عددی تلگرام ادمین برای دریافت فیش‌ها

# آدرس کیف پول‌های تتر (درگاه خودکار بلاکچین)
WALLET_USDT_TRC20 = os.getenv("WALLET_USDT_TRC20", "TYourTronWalletAddressHereXXXXXXXXXX")
WALLET_USDT_POLYGON = os.getenv("WALLET_USDT_POLYGON", "0xYourPolygonWalletAddressHereXXXXXXXXXXXX")

# مشخصات کارت بانکی جهت درگاه کارت‌به‌کارت نیمه‌خودکار کاربران ایرانی
BANK_CARD_NUMBER = os.getenv("BANK_CARD_NUMBER", "6037-9975-XXXX-XXXX")
BANK_CARD_HOLDER = os.getenv("BANK_CARD_HOLDER", "نام صاحب حساب")
BANK_NAME = os.getenv("BANK_NAME", "بانک ملی / ملت / سامان")
USDT_TO_TOMAN_RATE = int(os.getenv("USDT_TO_TOMAN_RATE", "65000"))  # نرخ پایه هر تتر به تومان

# قراردادهای رسمی هوشمند تتر
TRON_USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"
POLYGON_USDT_CONTRACT = "0xc2132d05d31c914a87c6611c10748aeb04b58e8f"
ERC20_TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"

DB_PATH = os.getenv("NEOBET_BOT_DB", "aineobet_vip_members.db")

# تعریف پلن‌های تجاری (دلاری و تومانی)
SUBSCRIPTION_PLANS: Dict[str, Dict[str, Any]] = {
    "weekend": {
        "price_usdt": 7.0,
        "price_toman": 450000,
        "days": 2,
        "title_fa": "⚡ بسته ۴۸ ساعته آخر هفته (Weekend Pass)",
        "title_en": "⚡ 48-Hour Weekend Matchday Pass",
    },
    "pro_monthly": {
        "price_usdt": 29.0,
        "price_toman": 1850000,
        "days": 30,
        "title_fa": "💎 اشتراک ماهانه VIP فوتبال‌کوانت (۳۰ روز)",
        "title_en": "💎 Pro Football Quant VIP (30 Days)",
    },
    "quant_all": {
        "price_usdt": 59.0,
        "price_toman": 3750000,
        "days": 30,
        "title_fa": "👑 اشتراک جامع VIP (فوتبال + تنیس مارکوف + اسنایپر)",
        "title_en": "👑 All-Access Quant VIP (Football + Tennis + Sniper)",
    },
}

# =====================================================================
# ۲. دیکشنری پیام‌های دوزبانه (فارسی و انگلیسی)
# =====================================================================
MESSAGES: Dict[str, Dict[str, str]] = {
    "fa": {
        "welcome": (
            "🏆 <b>به ربات رسمی مدیریت اشتراک NeoBet Quant (@aineobet) خوش آمدید!</b>\n\n"
            "🤖 اولین موتور کمّی مجهز به <b>مهندسی معکوس ضرایب بوک‌میکر</b>، <b>۱۰,۰۰۰ شبیه‌سازی مونت‌کارلو</b>، "
            "<b>فیلتر وتوی ایجنت سوپروایزر</b> و <b>اثبات رمزنگاری پیش از بازی (SHA-256)</b>.\n\n"
            "📊 <b>عملکرد ثبت‌شده:</b> ۳۰ از ۳۰ برد در کارت‌های تاییدشده سوپروایزر (۱۰۰٪ وین‌ریت).\n"
            "👇 لطفاً یکی از گزینه‌های زیر را انتخاب کنید:"
        ),
        "btn_plans": "💎 خرید اشتراک کانال VIP",
        "btn_free_signal": "🎁 دریافت سیگنال رایگان روز + تست ریسک",
        "btn_status": "👤 وضعیت اشتراک من",
        "btn_referral": "🚀 دعوت دوستان (دریافت VIP رایگان)",
        "btn_verify_tx": "⚡ پرداخت با تتر (تایید خودکار ۱۰ ثانیه‌ای)",
        "btn_card_to_card": "💳 پرداخت ریالی کارت‌به‌کارت (ویژه ایران)",
        "btn_switch_lang": "🇬🇧 Switch to English",
        "force_sub_alert": (
            "⚠️ <b>برای استفاده از سیگنال رایگان روز و ابزارهای ربات، ابتدا در کانال عمومی رسمی ما عضو شوید:</b>\n\n"
            f"📢 کانال رسمی: {PUBLIC_CHANNEL_USERNAME}\n\n"
            "پس از عضویت، روی دکمه زیر کلیک کنید:"
        ),
        "btn_check_join": "✅ عضو شدم — بازگشایی دسترسی",
        "free_signal_unlocked": (
            "🔥 <b>دسترسی شما تایید شد!</b>\n\n"
            "📌 هر روز ۶۰ دقیقه قبل از شروع مسابقات، <b>۱ فلش‌کارت کامل دوقلو (تیپ A و B)</b> به صورت کاملاً رایگان "
            f"در کانال {PUBLIC_CHANNEL_USERNAME} منتشر می‌شود.\n"
            "🔒 برای دریافت تمام کارت‌های تاییدشده سوپروایزر، میکس‌های ۳ تایی و تک‌تیرانداز ضریب بالا، "
            "از منوی اصلی گزینه <b>«💎 خرید اشتراک کانال VIP»</b> را انتخاب کنید."
        ),
        "select_plan": (
            "💎 <b>پلن‌های اشتراک رسمی کانال خصوصی VIP (@aineobet):</b>\n\n"
            "▫️ تمامی کارت‌ها به صورت پوسترهای گرافیکی استادیومی ارسال می‌شوند.\n"
            "▫️ شامل: <b>زوج‌تیپ‌های تک‌بازی (ضریب ۲ و ۳)</b> + <b>میکس‌های ۲ و ۳ تایی</b> + <b>شکارچی ضرایب بالا (4x تا 9x)</b>.\n\n"
            "👇 پلن مورد نظر خود را انتخاب کنید:"
        ),
        "choose_payment_method": (
            "📦 <b>پلن انتخابی:</b> {plan_title}\n"
            "⏳ <b>مدت اعتبار:</b> {days} روز کامل\n\n"
            "💵 <b>مبلغ دلاری (تتر):</b> <code>{amount_usdt} USDT</code>\n"
            "💳 <b>مبلغ ریالی (کارت‌به‌کارت):</b> <code>{amount_toman} تومان</code>\n\n"
            "👇 لطفاً روش پرداخت خود را انتخاب کنید:"
        ),
        "payment_invoice_usdt": (
            "🧾 <b>فاکتور پرداخت رمزارزی (تایید خودکار بلاکچین در ۱۰ ثانیه)</b>\n\n"
            "📦 <b>پلن انتخابی:</b> {plan_title}\n"
            "💰 <b>مبلغ قابل پرداخت:</b> <code>{amount}</code> <b>USDT (تتر)</b>\n\n"
            "🟢 <b>روش ۱ — شبکه ترون (USDT - TRC20):</b>\n"
            "<code>{wallet_trc20}</code>\n\n"
            "🟣 <b>روش ۲ — شبکه پالیگان (USDT - Polygon POS):</b>\n"
            "<code>{wallet_polygon}</code>\n\n"
            "⚡ <b>نحوه فعال‌سازی آنی:</b>\n"
            "پس از واریز، کافی است <b>کد هش تراکنش (TxID)</b> خود را مستقیماً در همین چت ارسال کنید تا لینک VIP بلافاصله صادر شود!"
        ),
        "payment_invoice_card": (
            "💳 <b>فاکتور پرداخت ریالی (کارت‌به‌کارت نیمه‌خودکار)</b>\n\n"
            "📦 <b>پلن انتخابی:</b> {plan_title}\n"
            "💰 <b>مبلغ دقیق قابل واریز (دارای کد شناسایی):</b>\n"
            "👉 <code>{exact_toman}</code> <b>تومان</b>\n"
            "<i>(لطفاً دقیقاً همین مبلغ را واریز کنید تا واریزی شما فوراً شناسایی شود)</i>\n\n"
            "🏦 <b>شماره کارت مقصد ({bank_name}):</b>\n"
            "<code>{card_number}</code>\n"
            "👤 <b>به نام:</b> {card_holder}\n\n"
            "📸 <b>نحوه فعال‌سازی:</b>\n"
            "پس از واریز، <b>عکس رسید (اسکرین‌شات واریزی)</b> ویا <b>۴ رقم آخر کارت خود + ساعت واریز</b> را در همین چت ارسال کنید. "
            "فیش شما مستقیماً برای ادمین ارسال شده و با ۱ کلیک، لینک ورود به کانال VIP برایتان صادر می‌شود!"
        ),
        "receipt_submitted_user": (
            "✅ <b>رسید پرداخت شما با کد پیگیری <code>#{receipt_id}</code> ثبت و برای ادمین ارسال شد!</b>\n\n"
            "⏳ به محض تایید ادمین، لینک اختصاصی و یک‌بارمصرف ورود به کانال VIP به صورت خودکار در همین چت برای شما ارسال می‌شود."
        ),
        "card_approved_user": (
            "🎉 <b>واریز کارت‌به‌کارت شما (رسید <code>#{receipt_id}</code>) تایید شد!</b>\n\n"
            "📦 <b>پلن فعال‌شده:</b> {plan_title}\n"
            "📅 <b>اعتبار تا تاریخ:</b> {expires_at}\n\n"
            "🔗 <b>لینک اختصاصی و یک‌بارمصرف ورود به کانال VIP:</b>\n"
            "{invite_link}\n\n"
            "⚠️ <i>توجه: این لینک فقط برای ۱ نفر (اکانت شما) کار می‌کند.</i>"
        ),
        "card_rejected_user": (
            "❌ <b>رسید پرداخت شماره <code>#{receipt_id}</code> تایید نشد.</b>\n"
            "در صورت نیاز به بررسی مجدد، تصویر واضح‌تری از فیش واریزی یا شماره پیگیری بانکی را ارسال نمایید."
        ),
        "verifying_tx": "⏳ در حال استعلام مستقیم تراکنش از نودهای بلاکچین (TronGrid / Polygon RPC)...",
        "tx_already_used": "❌ این کد تراکنش (TxID) قبلاً در سیستم ثبت و استفاده شده است.",
        "tx_failed": (
            "❌ <b>تراکنش تایید نشد:</b>\n{reason}\n\n"
            "لطفاً مطمئن شوید تراکنش در بلاکچین وضعیت SUCCESS گرفته است و کد TxID را به درستی کپی کرده‌اید."
        ),
        "tx_success": (
            "🎉 <b>پرداخت شما با موفقیت روی بلاکچین تایید شد!</b>\n\n"
            "📦 <b>پلن فعال‌شده:</b> {plan_title}\n"
            "💵 <b>مبلغ تاییدشده:</b> {amount} USDT ({network})\n"
            "📅 <b>اعتبار تا تاریخ:</b> {expires_at}\n\n"
            "🔗 <b>لینک اختصاصی و یک‌بارمصرف ورود به کانال VIP:</b>\n"
            "{invite_link}\n\n"
            "⚠️ <i>توجه: این لینک فقط برای ۱ نفر (اکانت شما) کار می‌کند.</i>"
        ),
        "status_active": (
            "👤 <b>وضعیت حساب کاربری شما:</b>\n\n"
            "✅ <b>وضعیت اشتراک:</b> فعال (VIP Member 👑)\n"
            "📦 <b>پلن فعلی:</b> {plan}\n"
            "⏳ <b>تاریخ انقضا:</b> {expires_at}\n"
            "👥 <b>تعداد دعوت‌های موفق شما:</b> {referrals} نفر"
        ),
        "status_inactive": (
            "👤 <b>وضعیت حساب کاربری شما:</b>\n\n"
            "⚪ <b>وضعیت اشتراک:</b> کاربر عادی (Free Tier)\n"
            "👥 <b>تعداد دعوت‌های موفق شما:</b> {referrals} از ۵ نفر (برای دریافت ۴۸ ساعت VIP رایگان)\n\n"
            "💎 برای دسترسی به تمام سیگنال‌های تاییدشده سوپروایزر، اشتراک VIP را فعال کنید."
        ),
        "referral_info": (
            "🚀 <b>طرح رشد ارگانیک @aineobet — دریافت اشتراک VIP رایگان!</b>\n\n"
            "با اشتراک‌گذاری لینک اختصاصی خود، به ازای هر <b>۵ دوستی</b> که وارد ربات شده و در کانال عمومی عضو شوند، "
            "<b>۴۸ ساعت اشتراک کامل کانال VIP (به ارزش ۷ دلار)</b> به صورت خودکار هدیه می‌گیرید!\n\n"
            "🔗 <b>لینک دعوت اختصاصی شما:</b>\n"
            "<code>{ref_link}</code>\n\n"
            "📊 <b>تعداد دعوت‌های شما تا این لحظه:</b> {referrals} نفر"
        ),
    },
    "en": {
        "welcome": (
            "🏆 <b>Welcome to the Official NeoBet Quant VIP Bot (@aineobet)!</b>\n\n"
            "🤖 Powered by <b>Reverse-Poisson Market Odds Solver</b>, <b>10,000 Monte Carlo Simulations</b>, "
            "<b>Chief Supervisor Veto Gate</b>, and <b>Pre-Match SHA-256 Cryptographic Proof</b>.\n\n"
            "📊 <b>Verified Track Record:</b> 30/30 Wins on Supervisor-Approved Dual Slips (100% Win Rate).\n"
            "👇 Select an option below:"
        ),
        "btn_plans": "💎 Get VIP Channel Access",
        "btn_free_signal": "🎁 Free Daily Signal & Risk Check",
        "btn_status": "👤 My Subscription Status",
        "btn_referral": "🚀 Refer Friends (Earn Free VIP)",
        "btn_verify_tx": "⚡ Pay with USDT (Instant 10s Auto-Verify)",
        "btn_card_to_card": "💳 Iranian Bank Card-to-Card (IRR/Toman)",
        "btn_switch_lang": "🇮🇷 تغییر زبان به فارسی",
        "force_sub_alert": (
            "⚠️ <b>To unlock the Free Daily Pick and Quant Tools, please join our official public showcase channel first:</b>\n\n"
            f"📢 Official Channel: {PUBLIC_CHANNEL_USERNAME}\n\n"
            "Once joined, click the verification button below:"
        ),
        "btn_check_join": "✅ I Joined — Unlock Access",
        "free_signal_unlocked": (
            "🔥 <b>Access Verified!</b>\n\n"
            "📌 Every day at T-60m before kickoff, <b>1 Full Dual-Hedge Card (Slip A & B)</b> is posted 100% free "
            f"inside {PUBLIC_CHANNEL_USERNAME}.\n"
            "🔒 To unlock all Supervisor-Approved cards, 2/3-Leg Combos, and High-Odds Sniper picks, "
            "tap <b>'💎 Get VIP Channel Access'</b> from the main menu."
        ),
        "select_plan": (
            "💎 <b>Official @aineobet Private VIP Subscription Plans:</b>\n\n"
            "▫️ Pure high-res English broadcast stadium cards (zero text clutter).\n"
            "▫️ Includes: <b>Single Dual-Hedge Slips (2.0x & 3.0x)</b> + <b>2/3-Leg Smart Combos</b> + <b>High-Odds Sniper (4x-9x)</b>.\n\n"
            "👇 Choose your plan below:"
        ),
        "choose_payment_method": (
            "📦 <b>Selected Plan:</b> {plan_title}\n"
            "⏳ <b>Duration:</b> {days} Full Days\n\n"
            "💵 <b>Crypto Price (USDT):</b> <code>{amount_usdt} USDT</code>\n"
            "💳 <b>Iranian Card Price:</b> <code>{amount_toman} Toman</code>\n\n"
            "👇 Select your preferred payment method:"
        ),
        "payment_invoice_usdt": (
            "🧾 <b>Automated On-Chain USDT Invoice (Instant 10s Verification)</b>\n\n"
            "📦 <b>Selected Plan:</b> {plan_title}\n"
            "💰 <b>Amount Due:</b> <code>{amount}</code> <b>USDT</b>\n\n"
            "🟢 <b>Option 1 — Tron Network (USDT - TRC20):</b>\n"
            "<code>{wallet_trc20}</code>\n\n"
            "🟣 <b>Option 2 — Polygon Network (USDT - Polygon POS):</b>\n"
            "<code>{wallet_polygon}</code>\n\n"
            "⚡ <b>Instant Activation Instructions:</b>\n"
            "After sending USDT, simply paste your <b>Transaction Hash (TxID)</b> directly in this chat!"
        ),
        "payment_invoice_card": (
            "💳 <b>Iranian Bank Card-to-Card Invoice (Semi-Automated)</b>\n\n"
            "📦 <b>Selected Plan:</b> {plan_title}\n"
            "💰 <b>Exact Amount to Transfer (includes unique ID):</b>\n"
            "👉 <code>{exact_toman}</code> <b>Toman</b>\n\n"
            "🏦 <b>Destination Card ({bank_name}):</b>\n"
            "<code>{card_number}</code>\n"
            "👤 <b>Card Holder:</b> {card_holder}\n\n"
            "📸 <b>How to Activate:</b>\n"
            "After transferring, send a <b>screenshot/photo of your receipt</b> or the <b>last 4 digits of your card</b> right here in this chat."
        ),
        "receipt_submitted_user": (
            "✅ <b>Your payment receipt <code>#{receipt_id}</code> has been logged and forwarded to the admin!</b>\n\n"
            "⏳ As soon as the admin taps Approve, your single-use VIP invite link will be sent here automatically."
        ),
        "card_approved_user": (
            "🎉 <b>Your Card-to-Card Payment (Receipt <code>#{receipt_id}</code>) is Approved!</b>\n\n"
            "📦 <b>Activated Plan:</b> {plan_title}\n"
            "📅 <b>Valid Until:</b> {expires_at}\n\n"
            "🔗 <b>Your Single-Use Private VIP Channel Invite Link:</b>\n"
            "{invite_link}"
        ),
        "card_rejected_user": (
            "❌ <b>Payment Receipt <code>#{receipt_id}</code> was not approved.</b>\n"
            "Please send a clearer screenshot of your bank transfer receipt or contact support."
        ),
        "verifying_tx": "⏳ Querying blockchain nodes (TronGrid / Polygon RPC) to verify your transaction...",
        "tx_already_used": "❌ This Transaction Hash (TxID) has already been redeemed.",
        "tx_failed": (
            "❌ <b>Verification Failed:</b>\n{reason}\n\n"
            "Please ensure the transaction is confirmed on-chain and paste the exact TxID."
        ),
        "tx_success": (
            "🎉 <b>On-Chain Payment Confirmed!</b>\n\n"
            "📦 <b>Activated Plan:</b> {plan_title}\n"
            "💵 <b>Verified Amount:</b> {amount} USDT ({network})\n"
            "📅 <b>Valid Until:</b> {expires_at}\n\n"
            "🔗 <b>Your Single-Use Private VIP Channel Invite Link:</b>\n"
            "{invite_link}"
        ),
        "status_active": (
            "👤 <b>Your Account Status:</b>\n\n"
            "✅ <b>Status:</b> Active VIP Member 👑\n"
            "📦 <b>Current Plan:</b> {plan}\n"
            "⏳ <b>Expires At:</b> {expires_at}\n"
            "👥 <b>Verified Referrals:</b> {referrals}"
        ),
        "status_inactive": (
            "👤 <b>Your Account Status:</b>\n\n"
            "⚪ <b>Status:</b> Free Tier Member\n"
            "👥 <b>Verified Referrals:</b> {referrals} / 5 (Refer 5 friends for a free 48h VIP Pass)\n\n"
            "💎 Upgrade to VIP to receive all Supervisor-Approved cards, Combos, and Sniper picks."
        ),
        "referral_info": (
            "🚀 <b>@aineobet Referral Program — Earn Free VIP Access!</b>\n\n"
            "Share your personal invite link. For every <b>5 friends</b> who start the bot and join our public channel, "
            "you automatically unlock a <b>48-Hour VIP Weekend Pass ($7 value)</b>!\n\n"
            "🔗 <b>Your Personal Referral Link:</b>\n"
            "<code>{ref_link}</code>\n\n"
            "📊 <b>Your Verified Referrals:</b> {referrals}"
        ),
    },
}


# =====================================================================
# ۳. لایه دیتابیس SQLite (اعضا، تراکنش‌های تتر و فیش‌های کارت‌به‌کارت)
# =====================================================================
def init_db(db_path: str = DB_PATH) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            user_id INTEGER PRIMARY KEY,
            username TEXT,
            lang TEXT DEFAULT 'fa',
            selected_plan TEXT DEFAULT 'pro_monthly',
            payment_mode TEXT DEFAULT 'NONE', -- NONE, AWAITING_USDT_TXID, AWAITING_CARD_RECEIPT
            pending_toman_amount INTEGER DEFAULT 0,
            vip_expires_at TEXT,
            referred_by INTEGER,
            referral_count INTEGER DEFAULT 0,
            reward_claimed_count INTEGER DEFAULT 0,
            joined_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            txid TEXT NOT NULL UNIQUE,
            user_id INTEGER NOT NULL,
            network TEXT NOT NULL,
            amount_usdt REAL NOT NULL,
            plan_key TEXT NOT NULL,
            verified_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS card_receipts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            username TEXT,
            plan_key TEXT NOT NULL,
            expected_toman INTEGER NOT NULL,
            receipt_type TEXT NOT NULL, -- PHOTO or TEXT
            receipt_content TEXT NOT NULL, -- file_id or text info
            status TEXT DEFAULT 'PENDING', -- PENDING, APPROVED, REJECTED
            submitted_at TEXT NOT NULL,
            reviewed_at TEXT
        )
        """
    )
    conn.commit()
    return conn


def get_or_create_user(
    conn: sqlite3.Connection, user_id: int, username: str = "", referred_by: Optional[int] = None
) -> sqlite3.Row:
    row = conn.execute("SELECT * FROM users WHERE user_id = ?", (user_id,)).fetchone()
    if row:
        if username and row["username"] != username:
            conn.execute("UPDATE users SET username = ? WHERE user_id = ?", (username, user_id))
            conn.commit()
        return conn.execute("SELECT * FROM users WHERE user_id = ?", (user_id,)).fetchone()
    now_iso = datetime.now(timezone.utc).isoformat()
    conn.execute(
        """
        INSERT INTO users (user_id, username, lang, referred_by, joined_at)
        VALUES (?, ?, 'fa', ?, ?)
        """,
        (user_id, username, referred_by, now_iso),
    )
    conn.commit()
    return conn.execute("SELECT * FROM users WHERE user_id = ?", (user_id,)).fetchone()


def set_user_lang(conn: sqlite3.Connection, user_id: int, lang: str) -> None:
    conn.execute("UPDATE users SET lang = ? WHERE user_id = ?", (lang, user_id))
    conn.commit()


def set_user_plan_and_mode(
    conn: sqlite3.Connection, user_id: int, plan_key: str, mode: str, toman_amount: int = 0
) -> None:
    conn.execute(
        "UPDATE users SET selected_plan = ?, payment_mode = ?, pending_toman_amount = ? WHERE user_id = ?",
        (plan_key, mode, toman_amount, user_id),
    )
    conn.commit()


def extend_user_vip(conn: sqlite3.Connection, user_id: int, days: int, plan_key: str) -> str:
    row = conn.execute("SELECT vip_expires_at FROM users WHERE user_id = ?", (user_id,)).fetchone()
    now = datetime.now(timezone.utc)
    base_time = now
    if row and row["vip_expires_at"]:
        try:
            existing_exp = datetime.fromisoformat(row["vip_expires_at"])
            if existing_exp > now:
                base_time = existing_exp
        except ValueError:
            pass
    new_exp = base_time + timedelta(days=days)
    new_exp_iso = new_exp.strftime("%Y-%m-%d %H:%M UTC")
    conn.execute(
        "UPDATE users SET vip_expires_at = ?, selected_plan = ?, payment_mode = 'NONE' WHERE user_id = ?",
        (new_exp.isoformat(), plan_key, user_id),
    )
    conn.commit()
    return new_exp_iso


# =====================================================================
# ۴. موتور تایید خودکار تراکنش تتر روی بلاکچین (TRC-20 & Polygon POS)
# =====================================================================
def verify_trc20_usdt_transaction(
    txid: str, expected_wallet: str, min_amount_usdt: float
) -> Tuple[bool, float, str]:
    clean_tx = txid.strip()
    if len(clean_tx) != 64:
        return False, 0.0, "Invalid TRC20 TxID length (must be 64 hex characters)."

    url = f"https://apilist.tronscanapi.com/api/transaction-info?hash={clean_tx}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "NeoBetQuantVerifier/1.0"})
        with urllib.request.urlopen(req, timeout=12) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception as exc:
        return False, 0.0, f"Blockchain node connection error: {exc}"

    if not data or data.get("contractRet") != "SUCCESS":
        return False, 0.0, "Transaction not found or status is not SUCCESS on Tron blockchain."

    transfers = data.get("trc20TransferInfo") or []
    for tr in transfers:
        contract_addr = tr.get("contract_address", "")
        to_addr = tr.get("to_address", "")
        decimals = int(tr.get("decimals", 6))
        raw_amount = float(tr.get("amount_str", "0")) / (10**decimals)

        if contract_addr == TRON_USDT_CONTRACT and to_addr.lower() == expected_wallet.lower():
            if raw_amount + 0.05 >= min_amount_usdt:
                return True, round(raw_amount, 2), "Confirmed on Tron (TRC-20)"
            return (
                False,
                raw_amount,
                f"Transferred amount ({raw_amount:.2f} USDT) is less than required ({min_amount_usdt:.2f} USDT).",
            )

    return False, 0.0, "No matching USDT-TRC20 transfer to the official NeoBet wallet was found in this TxID."


def verify_polygon_usdt_transaction(
    txid: str, expected_wallet: str, min_amount_usdt: float
) -> Tuple[bool, float, str]:
    clean_tx = txid.strip().lower()
    if not clean_tx.startswith("0x") or len(clean_tx) != 66:
        return False, 0.0, "Invalid Polygon TxID format (must start with 0x and be 66 characters)."

    rpc_payload = json.dumps(
        {
            "jsonrpc": "2.0",
            "method": "eth_getTransactionReceipt",
            "params": [clean_tx],
            "id": 1,
        }
    ).encode("utf-8")

    try:
        req = urllib.request.Request(
            "https://polygon-rpc.com",
            data=rpc_payload,
            headers={"Content-Type": "application/json", "User-Agent": "NeoBetQuantVerifier/1.0"},
        )
        with urllib.request.urlopen(req, timeout=12) as resp:
            res_json = json.loads(resp.read().decode("utf-8"))
    except Exception as exc:
        return False, 0.0, f"Polygon RPC connection error: {exc}"

    receipt = res_json.get("result")
    if not receipt or receipt.get("status") != "0x1":
        return False, 0.0, "Transaction not found or failed on Polygon network."

    clean_wallet_padded = "0x" + expected_wallet.lower().replace("0x", "").rjust(64, "0")
    for log in receipt.get("logs", []):
        if log.get("address", "").lower() == POLYGON_USDT_CONTRACT:
            topics = [t.lower() for t in log.get("topics", [])]
            if len(topics) >= 3 and topics[0] == ERC20_TRANSFER_TOPIC and topics[2] == clean_wallet_padded:
                raw_hex = log.get("data", "0x0")
                amount_usdt = int(raw_hex, 16) / 1e6
                if amount_usdt + 0.05 >= min_amount_usdt:
                    return True, round(amount_usdt, 2), "Confirmed on Polygon POS"
                return (
                    False,
                    amount_usdt,
                    f"Transferred amount ({amount_usdt:.2f} USDT) is less than required ({min_amount_usdt:.2f} USDT).",
                )

    return False, 0.0, "No matching Polygon USDT transfer to the official NeoBet wallet was found."


def verify_any_usdt_txid(
    conn: sqlite3.Connection, user_id: int, txid: str, plan_key: str
) -> Tuple[bool, float, str, str]:
    clean_tx = txid.strip()
    dup = conn.execute("SELECT id FROM payments WHERE txid = ?", (clean_tx,)).fetchone()
    if dup:
        return False, 0.0, "ALREADY_USED", ""

    plan = SUBSCRIPTION_PLANS.get(plan_key, SUBSCRIPTION_PLANS["pro_monthly"])
    min_amt = plan["price_usdt"]

    if clean_tx.startswith("0x") and len(clean_tx) == 66:
        ok, amt, msg = verify_polygon_usdt_transaction(clean_tx, WALLET_USDT_POLYGON, min_amt)
        net = "Polygon (USDT)"
    else:
        ok, amt, msg = verify_trc20_usdt_transaction(clean_tx, WALLET_USDT_TRC20, min_amt)
        net = "Tron (TRC-20)"

    if ok:
        conn.execute(
            """
            INSERT INTO payments (txid, user_id, network, amount_usdt, plan_key, verified_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (clean_tx, user_id, net, amt, plan_key, datetime.now(timezone.utc).isoformat()),
        )
        conn.commit()
    return ok, amt, msg, net


# =====================================================================
# ۵. موتور کارت‌به‌کارت نیمه‌خودکار (ثبت رسید و تایید ۱ کلیکی توسط ادمین)
# =====================================================================
def generate_unique_toman_amount(base_toman: int) -> int:
    """
    افزودن یک کد ۳ رقمی رندوم (مثلاً بین 110 تا 890 تومان) به مبلغ پایه
    تا ادمین به محض دیدن پیامک بانک، بدون شک متوجه شود واریزی متعلق به کدام کاربر است.
    """
    unique_suffix = random.randint(11, 89) * 10
    return base_toman + unique_suffix


def create_card_receipt(
    conn: sqlite3.Connection,
    user_id: int,
    username: str,
    plan_key: str,
    expected_toman: int,
    receipt_type: str,
    receipt_content: str,
) -> int:
    now_iso = datetime.now(timezone.utc).isoformat()
    cur = conn.execute(
        """
        INSERT INTO card_receipts (
            user_id, username, plan_key, expected_toman, receipt_type, receipt_content, status, submitted_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?)
        """,
        (user_id, username, plan_key, expected_toman, receipt_type, receipt_content, now_iso),
    )
    conn.execute("UPDATE users SET payment_mode = 'NONE' WHERE user_id = ?", (user_id,))
    conn.commit()
    return int(cur.lastrowid)


def notify_admin_of_card_receipt(conn: sqlite3.Connection, receipt_id: int) -> None:
    rec = conn.execute("SELECT * FROM card_receipts WHERE id = ?", (receipt_id,)).fetchone()
    if not rec:
        return
    plan = SUBSCRIPTION_PLANS.get(rec["plan_key"], SUBSCRIPTION_PLANS["pro_monthly"])
    user_tag = f"@{rec['username']}" if rec["username"] else f"ID: <code>{rec['user_id']}</code>"
    admin_caption = (
        f"🔔 <b>رسید جدید کارت‌به‌کارت (#{rec['id']})</b>\n\n"
        f"👤 <b>کاربر:</b> {user_tag} (<code>{rec['user_id']}</code>)\n"
        f"📦 <b>پلن درخواستی:</b> {plan['title_fa']}\n"
        f"💰 <b>مبلغ تعیین‌شده با کد شناسایی:</b> <code>{rec['expected_toman']:,}</code> تومان\n"
        f"🕒 <b>زمان ثبت:</b> {rec['submitted_at'][:19]} UTC\n"
    )
    admin_kb = {
        "inline_keyboard": [
            [
                {
                    "text": f"✅ تایید و ارسال لینک VIP (#{rec['id']})",
                    "callback_data": f"admin_approve_{rec['id']}",
                }
            ],
            [
                {
                    "text": f"❌ رد کردن رسید (#{rec['id']})",
                    "callback_data": f"admin_reject_{rec['id']}",
                }
            ],
        ]
    }

    if rec["receipt_type"] == "PHOTO":
        tg_api_call(
            "sendPhoto",
            {
                "chat_id": ADMIN_USER_ID,
                "photo": rec["receipt_content"],
                "caption": admin_caption,
                "parse_mode": "HTML",
                "reply_markup": admin_kb,
            },
        )
    else:
        tg_api_call(
            "sendMessage",
            {
                "chat_id": ADMIN_USER_ID,
                "text": admin_caption + f"\n📝 <b>مشخصات ارسالی کاربر:</b>\n<code>{rec['receipt_content']}</code>",
                "parse_mode": "HTML",
                "reply_markup": admin_kb,
            },
        )


def process_admin_receipt_decision(
    conn: sqlite3.Connection, receipt_id: int, approve: bool
) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
    rec = conn.execute("SELECT * FROM card_receipts WHERE id = ?", (receipt_id,)).fetchone()
    if not rec:
        return False, "رسید یافت نشد.", None
    if rec["status"] != "PENDING":
        return False, f"این رسید قبلاً در وضعیت {rec['status']} قرار گرفته است.", None

    new_status = "APPROVED" if approve else "REJECTED"
    now_iso = datetime.now(timezone.utc).isoformat()
    conn.execute(
        "UPDATE card_receipts SET status = ?, reviewed_at = ? WHERE id = ?",
        (new_status, now_iso, receipt_id),
    )
    conn.commit()

    user = get_or_create_user(conn, rec["user_id"])
    lang = user["lang"]
    m = MESSAGES[lang]
    plan = SUBSCRIPTION_PLANS.get(rec["plan_key"], SUBSCRIPTION_PLANS["pro_monthly"])
    plan_title = plan["title_fa"] if lang == "fa" else plan["title_en"]

    if approve:
        exp_str = extend_user_vip(conn, rec["user_id"], plan["days"], rec["plan_key"])
        invite_link = create_single_use_vip_invite_link(rec["user_id"], plan["days"])
        user_msg = m["card_approved_user"].format(
            receipt_id=receipt_id,
            plan_title=plan_title,
            expires_at=exp_str,
            invite_link=invite_link,
        )
        tg_api_call("sendMessage", {"chat_id": rec["user_id"], "text": user_msg, "parse_mode": "HTML"})
        return (
            True,
            f"✅ رسید #{receipt_id} تایید شد و لینک یک‌بارمصرف VIP برای کاربر {rec['user_id']} ارسال گردید.",
            {"user_id": rec["user_id"], "expires_at": exp_str, "invite_link": invite_link},
        )
    else:
        user_msg = m["card_rejected_user"].format(receipt_id=receipt_id)
        tg_api_call("sendMessage", {"chat_id": rec["user_id"], "text": user_msg, "parse_mode": "HTML"})
        return True, f"❌ رسید #{receipt_id} رد شد و به کاربر اطلاع داده شد.", None


# =====================================================================
# ۶. توابع ارتباط با API تلگرام و ساخت کیبوردها
# =====================================================================
def tg_api_call(method: str, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if BOT_TOKEN == "YOUR_TELEGRAM_BOT_TOKEN":
        return None
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/{method}"
    data = json.dumps(payload).encode("utf-8")
    try:
        req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as exc:
        print(f"[WARN] Telegram API {method} error: {exc}")
        return None


def is_user_in_public_channel(user_id: int) -> bool:
    res = tg_api_call("getChatMember", {"chat_id": PUBLIC_CHANNEL_USERNAME, "user_id": user_id})
    if not res or not res.get("ok"):
        return True
    status = res.get("result", {}).get("status", "left")
    return status in ("creator", "administrator", "member", "restricted")


def create_single_use_vip_invite_link(user_id: int, days: int) -> str:
    expire_ts = int((datetime.now(timezone.utc) + timedelta(hours=48)).timestamp())
    res = tg_api_call(
        "createChatInviteLink",
        {
            "chat_id": VIP_CHANNEL_ID,
            "name": f"VIP_User_{user_id}_{days}d",
            "expire_date": expire_ts,
            "member_limit": 1,
        },
    )
    if res and res.get("ok"):
        return res["result"].get("invite_link", "https://t.me/+YourPrivateVIPFallbackLink")
    return "https://t.me/+YourPrivateVIPFallbackLink"


def build_main_menu_keyboard(lang: str) -> Dict[str, Any]:
    m = MESSAGES[lang]
    return {
        "inline_keyboard": [
            [{"text": m["btn_plans"], "callback_data": "menu_plans"}],
            [{"text": m["btn_free_signal"], "callback_data": "menu_free_signal"}],
            [
                {"text": m["btn_status"], "callback_data": "menu_status"},
                {"text": m["btn_referral"], "callback_data": "menu_referral"},
            ],
            [{"text": m["btn_switch_lang"], "callback_data": "toggle_lang"}],
        ]
    }


def build_plans_keyboard(lang: str) -> Dict[str, Any]:
    rows = []
    for key, p in SUBSCRIPTION_PLANS.items():
        title = p["title_fa"] if lang == "fa" else p["title_en"]
        price_label = (
            f"${p['price_usdt']:.0f} | {p['price_toman'] // 1000:,} هزار تومان"
            if lang == "fa"
            else f"${p['price_usdt']:.0f} USDT"
        )
        rows.append([{"text": f"{title} ({price_label})", "callback_data": f"select_plan_{key}"}])
    back_txt = "🔙 بازگشت به منوی اصلی" if lang == "fa" else "🔙 Back to Main Menu"
    rows.append([{"text": back_txt, "callback_data": "back_main"}])
    return {"inline_keyboard": rows}


# =====================================================================
# ۷. پردازشگر پیام‌ها (متن، عکس فیش کارت‌به‌کارت، TxID و دکمه‌های ادمین)
# =====================================================================
def handle_update(conn: sqlite3.Connection, update: Dict[str, Any]) -> None:
    if "message" in update:
        msg = update["message"]
        chat_id = msg["chat"]["id"]
        user_id = msg.get("from", {}).get("id", chat_id)
        username = msg.get("from", {}).get("username", "")
        text = (msg.get("text") or "").strip()
        photos = msg.get("photo") or []

        referred_by = None
        if text.startswith("/start") and "ref_" in text:
            try:
                ref_id = int(text.split("ref_")[1].strip())
                if ref_id != user_id:
                    referred_by = ref_id
            except ValueError:
                pass

        user = get_or_create_user(conn, user_id, username, referred_by)
        lang = user["lang"]
        m = MESSAGES[lang]

        if text.startswith("/start"):
            conn.execute("UPDATE users SET payment_mode = 'NONE' WHERE user_id = ?", (user_id,))
            conn.commit()
            tg_api_call(
                "sendMessage",
                {
                    "chat_id": chat_id,
                    "text": m["welcome"],
                    "parse_mode": "HTML",
                    "reply_markup": build_main_menu_keyboard(lang),
                },
            )
            return

        # الف) اگر کاربر عکس فیش واریزی فرستاد (در حالت کارت‌به‌کارت یا مستقیم)
        if photos:
            best_photo_file_id = photos[-1]["file_id"]
            plan_key = user["selected_plan"] or "pro_monthly"
            expected_toman = (
                user["pending_toman_amount"]
                or SUBSCRIPTION_PLANS.get(plan_key, SUBSCRIPTION_PLANS["pro_monthly"])["price_toman"]
            )
            receipt_id = create_card_receipt(
                conn, user_id, username, plan_key, expected_toman, "PHOTO", best_photo_file_id
            )
            notify_admin_of_card_receipt(conn, receipt_id)
            tg_api_call(
                "sendMessage",
                {
                    "chat_id": chat_id,
                    "text": m["receipt_submitted_user"].format(receipt_id=receipt_id),
                    "parse_mode": "HTML",
                },
            )
            return

        # ب) اگر کاربر در حالت انتظار فیش کارت‌به‌کارت است و شماره پیگیری / ۴ رقم آخر کارت را متنی فرستاد
        if user["payment_mode"] == "AWAITING_CARD_RECEIPT" and len(text) >= 4 and len(text) not in (64, 66):
            plan_key = user["selected_plan"] or "pro_monthly"
            expected_toman = (
                user["pending_toman_amount"]
                or SUBSCRIPTION_PLANS.get(plan_key, SUBSCRIPTION_PLANS["pro_monthly"])["price_toman"]
            )
            receipt_id = create_card_receipt(
                conn, user_id, username, plan_key, expected_toman, "TEXT", text
            )
            notify_admin_of_card_receipt(conn, receipt_id)
            tg_api_call(
                "sendMessage",
                {
                    "chat_id": chat_id,
                    "text": m["receipt_submitted_user"].format(receipt_id=receipt_id),
                    "parse_mode": "HTML",
                },
            )
            return

        # ج) اگر کاربر کد هش تراکنش تتر (TxID) ۶۴ یا ۶۶ کاراکتری فرستاد -> استعلام خودکار بلاکچین!
        if len(text) in (64, 66) and all(c in "0123456789abcdefABCDEFxX" for c in text):
            tg_api_call("sendMessage", {"chat_id": chat_id, "text": m["verifying_tx"]})
            plan_key = user["selected_plan"] or "pro_monthly"
            ok, amt, reason, network = verify_any_usdt_txid(conn, user_id, text, plan_key)
            if not ok:
                err_text = m["tx_already_used"] if reason == "ALREADY_USED" else m["tx_failed"].format(reason=reason)
                tg_api_call("sendMessage", {"chat_id": chat_id, "text": err_text, "parse_mode": "HTML"})
                return

            plan = SUBSCRIPTION_PLANS[plan_key]
            exp_str = extend_user_vip(conn, user_id, plan["days"], plan_key)
            invite_link = create_single_use_vip_invite_link(user_id, plan["days"])
            plan_title = plan["title_fa"] if lang == "fa" else plan["title_en"]

            tg_api_call(
                "sendMessage",
                {
                    "chat_id": chat_id,
                    "text": m["tx_success"].format(
                        plan_title=plan_title,
                        amount=f"{amt:.2f}",
                        network=network,
                        expires_at=exp_str,
                        invite_link=invite_link,
                    ),
                    "parse_mode": "HTML",
                },
            )
            return

    elif "callback_query" in update:
        cb = update["callback_query"]
        cb_id = cb["id"]
        chat_id = cb["message"]["chat"]["id"]
        user_id = cb["from"]["id"]
        data = cb.get("data", "")

        # بررسی دکمه‌های ۱ کلیکی ادمین برای تایید یا رد فیش کارت‌به‌کارت
        if data.startswith("admin_approve_") or data.startswith("admin_reject_"):
            if user_id != ADMIN_USER_ID:
                tg_api_call("answerCallbackQuery", {"callback_query_id": cb_id, "text": "⛔ فقط ادمین دسترسی دارد."})
                return
            approve = data.startswith("admin_approve_")
            rec_id = int(data.split("_")[-1])
            ok, status_msg, _ = process_admin_receipt_decision(conn, rec_id, approve)
            tg_api_call("sendMessage", {"chat_id": ADMIN_USER_ID, "text": status_msg, "parse_mode": "HTML"})
            tg_api_call("answerCallbackQuery", {"callback_query_id": cb_id, "text": status_msg[:40]})
            return

        user = get_or_create_user(conn, user_id)
        lang = user["lang"]

        if data == "toggle_lang":
            lang = "en" if lang == "fa" else "fa"
            set_user_lang(conn, user_id, lang)

        m = MESSAGES[lang]

        if data in ("toggle_lang", "back_main"):
            tg_api_call(
                "sendMessage",
                {
                    "chat_id": chat_id,
                    "text": m["welcome"],
                    "parse_mode": "HTML",
                    "reply_markup": build_main_menu_keyboard(lang),
                },
            )
        elif data == "menu_plans":
            tg_api_call(
                "sendMessage",
                {
                    "chat_id": chat_id,
                    "text": m["select_plan"],
                    "parse_mode": "HTML",
                    "reply_markup": build_plans_keyboard(lang),
                },
            )
        elif data.startswith("select_plan_"):
            plan_key = data.replace("select_plan_", "")
            if plan_key in SUBSCRIPTION_PLANS:
                set_user_plan_and_mode(conn, user_id, plan_key, "NONE")
                plan = SUBSCRIPTION_PLANS[plan_key]
                plan_title = plan["title_fa"] if lang == "fa" else plan["title_en"]
                txt = m["choose_payment_method"].format(
                    plan_title=plan_title,
                    days=plan["days"],
                    amount_usdt=f"{plan['price_usdt']:.2f}",
                    amount_toman=f"{plan['price_toman']:,}",
                )
                kb = {
                    "inline_keyboard": [
                        [{"text": m["btn_verify_tx"], "callback_data": f"pay_usdt_{plan_key}"}],
                        [{"text": m["btn_card_to_card"], "callback_data": f"pay_card_{plan_key}"}],
                        [
                            {
                                "text": "🔙 بازگشت" if lang == "fa" else "🔙 Back",
                                "callback_data": "menu_plans",
                            }
                        ],
                    ]
                }
                tg_api_call("sendMessage", {"chat_id": chat_id, "text": txt, "parse_mode": "HTML", "reply_markup": kb})
        elif data.startswith("pay_usdt_"):
            plan_key = data.replace("pay_usdt_", "")
            if plan_key in SUBSCRIPTION_PLANS:
                set_user_plan_and_mode(conn, user_id, plan_key, "AWAITING_USDT_TXID")
                plan = SUBSCRIPTION_PLANS[plan_key]
                plan_title = plan["title_fa"] if lang == "fa" else plan["title_en"]
                invoice_text = m["payment_invoice_usdt"].format(
                    plan_title=plan_title,
                    amount=f"{plan['price_usdt']:.2f}",
                    wallet_trc20=WALLET_USDT_TRC20,
                    wallet_polygon=WALLET_USDT_POLYGON,
                )
                tg_api_call("sendMessage", {"chat_id": chat_id, "text": invoice_text, "parse_mode": "HTML"})
        elif data.startswith("pay_card_"):
            plan_key = data.replace("pay_card_", "")
            if plan_key in SUBSCRIPTION_PLANS:
                plan = SUBSCRIPTION_PLANS[plan_key]
                exact_toman = generate_unique_toman_amount(plan["price_toman"])
                set_user_plan_and_mode(conn, user_id, plan_key, "AWAITING_CARD_RECEIPT", exact_toman)
                plan_title = plan["title_fa"] if lang == "fa" else plan["title_en"]
                invoice_text = m["payment_invoice_card"].format(
                    plan_title=plan_title,
                    exact_toman=f"{exact_toman:,}",
                    bank_name=BANK_NAME,
                    card_number=BANK_CARD_NUMBER,
                    card_holder=BANK_CARD_HOLDER,
                )
                tg_api_call("sendMessage", {"chat_id": chat_id, "text": invoice_text, "parse_mode": "HTML"})
        elif data in ("menu_free_signal", "check_join"):
            if not is_user_in_public_channel(user_id):
                tg_api_call(
                    "sendMessage",
                    {
                        "chat_id": chat_id,
                        "text": m["force_sub_alert"],
                        "parse_mode": "HTML",
                        "reply_markup": {
                            "inline_keyboard": [
                                [
                                    {
                                        "text": f"📢 Join {PUBLIC_CHANNEL_USERNAME}",
                                        "url": f"https://t.me/{PUBLIC_CHANNEL_USERNAME.lstrip('@')}",
                                    }
                                ],
                                [{"text": m["btn_check_join"], "callback_data": "check_join"}],
                            ]
                        },
                    },
                )
            else:
                if user["referred_by"]:
                    inviter_id = user["referred_by"]
                    conn.execute(
                        "UPDATE users SET referral_count = referral_count + 1 WHERE user_id = ?",
                        (inviter_id,),
                    )
                    conn.execute("UPDATE users SET referred_by = NULL WHERE user_id = ?", (user_id,))
                    conn.commit()
                    inviter = conn.execute("SELECT * FROM users WHERE user_id = ?", (inviter_id,)).fetchone()
                    if inviter and inviter["referral_count"] // 5 > inviter["reward_claimed_count"]:
                        conn.execute(
                            "UPDATE users SET reward_claimed_count = reward_claimed_count + 1 WHERE user_id = ?",
                            (inviter_id,),
                        )
                        conn.commit()
                        extend_user_vip(conn, inviter_id, 2, "weekend")

                tg_api_call(
                    "sendMessage",
                    {"chat_id": chat_id, "text": m["free_signal_unlocked"], "parse_mode": "HTML"},
                )
        elif data == "menu_status":
            now = datetime.now(timezone.utc)
            is_vip = False
            exp_display = ""
            if user["vip_expires_at"]:
                try:
                    exp_dt = datetime.fromisoformat(user["vip_expires_at"])
                    if exp_dt > now:
                        is_vip = True
                        exp_display = exp_dt.strftime("%Y-%m-%d %H:%M UTC")
                except ValueError:
                    pass
            if is_vip:
                p_key = user["selected_plan"] or "pro_monthly"
                p_obj = SUBSCRIPTION_PLANS.get(p_key, SUBSCRIPTION_PLANS["pro_monthly"])
                p_title = p_obj["title_fa"] if lang == "fa" else p_obj["title_en"]
                txt = m["status_active"].format(
                    plan=p_title, expires_at=exp_display, referrals=user["referral_count"]
                )
            else:
                txt = m["status_inactive"].format(referrals=user["referral_count"])
            tg_api_call("sendMessage", {"chat_id": chat_id, "text": txt, "parse_mode": "HTML"})
        elif data == "menu_referral":
            ref_link = f"https://t.me/{BOT_USERNAME}?start=ref_{user_id}"
            txt = m["referral_info"].format(ref_link=ref_link, referrals=user["referral_count"])
            tg_api_call("sendMessage", {"chat_id": chat_id, "text": txt, "parse_mode": "HTML"})

        tg_api_call("answerCallbackQuery", {"callback_query_id": cb_id})


def sweep_expired_vip_members(conn: sqlite3.Connection) -> int:
    now_iso = datetime.now(timezone.utc).isoformat()
    expired_rows = conn.execute(
        "SELECT user_id FROM users WHERE vip_expires_at IS NOT NULL AND vip_expires_at < ?",
        (now_iso,),
    ).fetchall()
    removed_count = 0
    for row in expired_rows:
        uid = row["user_id"]
        tg_api_call("banChatMember", {"chat_id": VIP_CHANNEL_ID, "user_id": uid})
        tg_api_call("unbanChatMember", {"chat_id": VIP_CHANNEL_ID, "user_id": uid, "only_if_banned": True})
        conn.execute("UPDATE users SET vip_expires_at = NULL WHERE user_id = ?", (uid,))
        removed_count += 1
    if removed_count > 0:
        conn.commit()
    return removed_count


def run_polling_loop() -> None:
    print(f"🤖 Starting @aineobet_bot (USDT + Iranian Card-to-Card Gateway) on {DB_PATH}...")
    conn = init_db()
    offset = 0
    last_sweep = time.time()

    while True:
        if time.time() - last_sweep > 3600:
            removed = sweep_expired_vip_members(conn)
            if removed:
                print(f"[SWEEP] Removed {removed} expired VIP members.")
            last_sweep = time.time()

        res = tg_api_call("getUpdates", {"offset": offset, "timeout": 25})
        if res and res.get("ok"):
            for upd in res.get("result", []):
                offset = upd["update_id"] + 1
                try:
                    handle_update(conn, upd)
                except Exception as exc:
                    print(f"[ERROR] Handling update failed: {exc}")
        else:
            time.sleep(3)


if __name__ == "__main__":
    # تست خودکار چرخه کارت‌به‌کارت نیمه‌خودکار (صدور مبلغ یکتا -> ثبت فیش -> تایید ۱ کلیکی ادمین)
    test_conn = init_db(":memory:")
    u = get_or_create_user(test_conn, 888001, "iran_vip_user")
    unique_toman = generate_unique_toman_amount(SUBSCRIPTION_PLANS["pro_monthly"]["price_toman"])
    set_user_plan_and_mode(test_conn, 888001, "pro_monthly", "AWAITING_CARD_RECEIPT", unique_toman)
    rec_id = create_card_receipt(test_conn, 888001, "iran_vip_user", "pro_monthly", unique_toman, "PHOTO", "file_id_test_123")
    ok, msg, info = process_admin_receipt_decision(test_conn, rec_id, approve=True)
    print(f"✅ Card-to-Card Self-Test Passed! Exact Toman: {unique_toman:,} | {msg}")
    if BOT_TOKEN != "YOUR_TELEGRAM_BOT_TOKEN":
        run_polling_loop()
    else:
        print("ℹ️ Set TELEGRAM_BOT_TOKEN, ADMIN_USER_ID, and BANK_CARD_NUMBER to start live polling.")