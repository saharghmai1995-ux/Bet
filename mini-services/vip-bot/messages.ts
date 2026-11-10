// ─────────────────────────────────────────────────────────────────────────────
// 💬 پیام‌های دوزبانه ربات (@aineobet_bot) — نقل کامل بخش ۲ فایل پایتون
// جای‌گذاری {placeholder}ها با fmt() انجام می‌شود (معادل str.format پایتون).
// ─────────────────────────────────────────────────────────────────────────────

export type Lang = "fa" | "en";

/** معادل سبک str.format پایتون — همه {key}ها را جایگزین می‌کند */
export function fmt(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? `{${key}}`));
}

export interface MessageBook {
  welcome: string;
  btn_plans: string;
  btn_free_signal: string;
  btn_status: string;
  btn_referral: string;
  btn_verify_tx: string;
  btn_card_to_card: string;
  btn_switch_lang: string;
  force_sub_alert: string;
  btn_check_join: string;
  free_signal_unlocked: string;
  select_plan: string;
  choose_payment_method: string;
  payment_invoice_usdt: string;
  payment_invoice_card: string;
  receipt_submitted_user: string;
  card_approved_user: string;
  card_rejected_user: string;
  verifying_tx: string;
  tx_already_used: string;
  tx_failed: string;
  tx_success: string;
  status_active: string;
  status_inactive: string;
  referral_info: string;
}

export function buildMessages(publicChannelUsername: string): Record<Lang, MessageBook> {
  return {
    fa: {
      welcome: (
        "🏆 <b>به ربات رسمی مدیریت اشتراک NeoBet Quant (@aineobet) خوش آمدید!</b>\n\n" +
        "🤖 اولین موتور کمّی مجهز به <b>مهندسی معکوس ضرایب بوک‌میکر</b>، <b>۱۰,۰۰۰ شبیه‌سازی مونت‌کارلو</b>، " +
        "<b>فیلتر وتوی ایجنت سوپروایزر</b> و <b>اثبات رمزنگاری پیش از بازی (SHA-256)</b>.\n\n" +
        "📊 <b>عملکرد ثبت‌شده:</b> ۳۰ از ۳۰ برد در کارت‌های تاییدشده سوپروایزر (۱۰۰٪ وین‌ریت).\n" +
        "👇 لطفاً یکی از گزینه‌های زیر را انتخاب کنید:"
      ),
      btn_plans: "💎 خرید اشتراک کانال VIP",
      btn_free_signal: "🎁 دریافت سیگنال رایگان روز + تست ریسک",
      btn_status: "👤 وضعیت اشتراک من",
      btn_referral: "🚀 دعوت دوستان (دریافت VIP رایگان)",
      btn_verify_tx: "⚡ پرداخت با تتر (تایید خودکار ۱۰ ثانیه‌ای)",
      btn_card_to_card: "💳 پرداخت ریالی کارت‌به‌کارت (ویژه ایران)",
      btn_switch_lang: "🇬🇧 Switch to English",
      force_sub_alert: (
        "⚠️ <b>برای استفاده از سیگنال رایگان روز و ابزارهای ربات، ابتدا در کانال عمومی رسمی ما عضو شوید:</b>\n\n" +
        `📢 کانال رسمی: ${publicChannelUsername}\n\n` +
        "پس از عضویت، روی دکمه زیر کلیک کنید:"
      ),
      btn_check_join: "✅ عضو شدم — بازگشایی دسترسی",
      free_signal_unlocked: (
        "🔥 <b>دسترسی شما تایید شد!</b>\n\n" +
        "📌 هر روز ۶۰ دقیقه قبل از شروع مسابقات، <b>۱ فلش‌کارت کامل دوقلو (تیپ A و B)</b> به صورت کاملاً رایگان " +
        `در کانال ${publicChannelUsername} منتشر می‌شود.\n` +
        "🔒 برای دریافت تمام کارت‌های تاییدشده سوپروایزر، میکس‌های ۳ تایی و تک‌تیرانداز ضریب بالا، " +
        "از منوی اصلی گزینه <b>«💎 خرید اشتراک کانال VIP»</b> را انتخاب کنید."
      ),
      select_plan: (
        "💎 <b>پلن‌های اشتراک رسمی کانال خصوصی VIP (@aineobet):</b>\n\n" +
        "▫️ تمامی کارت‌ها به صورت پوسترهای گرافیکی استادیومی ارسال می‌شوند.\n" +
        "▫️ شامل: <b>زوج‌تیپ‌های تک‌بازی (ضریب ۲ و ۳)</b> + <b>میکس‌های ۲ و ۳ تایی</b> + <b>شکارچی ضرایب بالا (4x تا 9x)</b>.\n\n" +
        "👇 پلن مورد نظر خود را انتخاب کنید:"
      ),
      choose_payment_method: (
        "📦 <b>پلن انتخابی:</b> {plan_title}\n" +
        "⏳ <b>مدت اعتبار:</b> {days} روز کامل\n\n" +
        "💵 <b>مبلغ دلاری (تتر):</b> <code>{amount_usdt} USDT</code>\n" +
        "💳 <b>مبلغ ریالی (کارت‌به‌کارت):</b> <code>{amount_toman} تومان</code>\n\n" +
        "👇 لطفاً روش پرداخت خود را انتخاب کنید:"
      ),
      payment_invoice_usdt: (
        "🧾 <b>فاکتور پرداخت رمزارزی (تایید خودکار بلاکچین در ۱۰ ثانیه)</b>\n\n" +
        "📦 <b>پلن انتخابی:</b> {plan_title}\n" +
        "💰 <b>مبلغ قابل پرداخت:</b> <code>{amount}</code> <b>USDT (تتر)</b>\n\n" +
        "🟢 <b>روش ۱ — شبکه ترون (USDT - TRC20):</b>\n{wallet_trc20}\n\n" +
        "🟣 <b>روش ۲ — شبکه پالیگان (USDT - Polygon POS):</b>\n{wallet_polygon}\n\n" +
        "⚡ <b>نحوه فعال‌سازی آنی:</b>\n" +
        "پس از واریز، کافی است <b>کد هش تراکنش (TxID)</b> خود را مستقیماً در همین چت ارسال کنید تا لینک VIP بلافاصله صادر شود!"
      ),
      payment_invoice_card: (
        "💳 <b>فاکتور پرداخت ریالی (کارت‌به‌کارت نیمه‌خودکار)</b>\n\n" +
        "📦 <b>پلن انتخابی:</b> {plan_title}\n" +
        "💰 <b>مبلغ دقیق قابل واریز (دارای کد شناسایی):</b>\n" +
        "👉 <code>{exact_toman}</code> <b>تومان</b>\n" +
        "<i>(لطفاً دقیقاً همین مبلغ را واریز کنید تا واریزی شما فوراً شناسایی شود)</i>\n\n" +
        "🏦 <b>شماره کارت مقصد ({bank_name}):</b>\n<code>{card_number}</code>\n" +
        "👤 <b>به نام:</b> {card_holder}\n\n" +
        "📸 <b>نحوه فعال‌سازی:</b>\n" +
        "پس از واریز، <b>عکس رسید (اسکرین‌شات واریزی)</b> ویا <b>۴ رقم آخر کارت خود + ساعت واریز</b> را در همین چت ارسال کنید. " +
        "فیش شما مستقیماً برای ادمین ارسال شده و با ۱ کلیک، لینک ورود به کانال VIP برایتان صادر می‌شود!"
      ),
      receipt_submitted_user: (
        "✅ <b>رسید پرداخت شما با کد پیگیری <code>#{receipt_id}</code> ثبت و برای ادمین ارسال شد!</b>\n\n" +
        "⏳ به محض تایید ادمین، لینک اختصاصی و یک‌بارمصرف ورود به کانال VIP به صورت خودکار در همین چت برای شما ارسال می‌شود."
      ),
      card_approved_user: (
        "🎉 <b>واریز کارت‌به‌کارت شما (رسید <code>#{receipt_id}</code>) تایید شد!</b>\n\n" +
        "📦 <b>پلن فعال‌شده:</b> {plan_title}\n" +
        "📅 <b>اعتبار تا تاریخ:</b> {expires_at}\n\n" +
        "🔗 <b>لینک اختصاصی و یک‌بارمصرف ورود به کانال VIP:</b>\n{invite_link}\n\n" +
        "⚠️ <i>توجه: این لینک فقط برای ۱ نفر (اکانت شما) کار می‌کند.</i>"
      ),
      card_rejected_user: (
        "❌ <b>رسید پرداخت شماره <code>#{receipt_id}</code> تایید نشد.</b>\n" +
        "در صورت نیاز به بررسی مجدد، تصویر واضح‌تری از فیش واریزی یا شماره پیگیری بانکی را ارسال نمایید."
      ),
      verifying_tx: "⏳ در حال استعلام مستقیم تراکنش از نودهای بلاکچین (TronGrid / Polygon RPC)...",
      tx_already_used: "❌ این کد تراکنش (TxID) قبلاً در سیستم ثبت و استفاده شده است.",
      tx_failed: (
        "❌ <b>تراکنش تایید نشد:</b>\n{reason}\n\n" +
        "لطفاً مطمئن شوید تراکنش در بلاکچین وضعیت SUCCESS گرفته است و کد TxID را به درستی کپی کرده‌اید."
      ),
      tx_success: (
        "🎉 <b>پرداخت شما با موفقیت روی بلاکچین تایید شد!</b>\n\n" +
        "📦 <b>پلن فعال‌شده:</b> {plan_title}\n" +
        "💵 <b>مبلغ تاییدشده:</b> {amount} USDT ({network})\n" +
        "📅 <b>اعتبار تا تاریخ:</b> {expires_at}\n\n" +
        "🔗 <b>لینک اختصاصی و یک‌بارمصرف ورود به کانال VIP:</b>\n{invite_link}\n\n" +
        "⚠️ <i>توجه: این لینک فقط برای ۱ نفر (اکانت شما) کار می‌کند.</i>"
      ),
      status_active: (
        "👤 <b>وضعیت حساب کاربری شما:</b>\n\n" +
        "✅ <b>وضعیت اشتراک:</b> فعال (VIP Member 👑)\n" +
        "📦 <b>پلن فعلی:</b> {plan}\n" +
        "⏳ <b>تاریخ انقضا:</b> {expires_at}\n" +
        "👥 <b>تعداد دعوت‌های موفق شما:</b> {referrals} نفر"
      ),
      status_inactive: (
        "👤 <b>وضعیت حساب کاربری شما:</b>\n\n" +
        "⚪ <b>وضعیت اشتراک:</b> کاربر عادی (Free Tier)\n" +
        "👥 <b>تعداد دعوت‌های موفق شما:</b> {referrals} از ۵ نفر (برای دریافت ۴۸ ساعت VIP رایگان)\n\n" +
        "💎 برای دسترسی به تمام سیگنال‌های تاییدشده سوپروایزر، اشتراک VIP را فعال کنید."
      ),
      referral_info: (
        "🚀 <b>طرح رشد ارگانیک @aineobet — دریافت اشتراک VIP رایگان!</b>\n\n" +
        "با اشتراک‌گذاری لینک اختصاصی خود، به ازای هر <b>۵ دوستی</b> که وارد ربات شده و در کانال عمومی عضو شوند، " +
        "<b>۴۸ ساعت اشتراک کامل کانال VIP (به ارزش ۷ دلار)</b> به صورت خودکار هدیه می‌گیرید!\n\n" +
        "🔗 <b>لینک دعوت اختصاصی شما:</b>\n<code>{ref_link}</code>\n\n" +
        "📊 <b>تعداد دعوت‌های شما تا این لحظه:</b> {referrals} نفر"
      ),
    },
    en: {
      welcome: (
        "🏆 <b>Welcome to the Official NeoBet Quant VIP Bot (@aineobet)!</b>\n\n" +
        "🤖 Powered by <b>Reverse-Poisson Market Odds Solver</b>, <b>10,000 Monte Carlo Simulations</b>, " +
        "<b>Chief Supervisor Veto Gate</b>, and <b>Pre-Match SHA-256 Cryptographic Proof</b>.\n\n" +
        "📊 <b>Verified Track Record:</b> 30/30 Wins on Supervisor-Approved Dual Slips (100% Win Rate).\n" +
        "👇 Select an option below:"
      ),
      btn_plans: "💎 Get VIP Channel Access",
      btn_free_signal: "🎁 Free Daily Signal & Risk Check",
      btn_status: "👤 My Subscription Status",
      btn_referral: "🚀 Refer Friends (Earn Free VIP)",
      btn_verify_tx: "⚡ Pay with USDT (Instant 10s Auto-Verify)",
      btn_card_to_card: "💳 Iranian Bank Card-to-Card (IRR/Toman)",
      btn_switch_lang: "🇮🇷 تغییر زبان به فارسی",
      force_sub_alert: (
        "⚠️ <b>To unlock the Free Daily Pick and Quant Tools, please join our official public showcase channel first:</b>\n\n" +
        `📢 Official Channel: ${publicChannelUsername}\n\n` +
        "Once joined, click the verification button below:"
      ),
      btn_check_join: "✅ I Joined — Unlock Access",
      free_signal_unlocked: (
        "🔥 <b>Access Verified!</b>\n\n" +
        "📌 Every day at T-60m before kickoff, <b>1 Full Dual-Hedge Card (Slip A & B)</b> is posted 100% free " +
        `inside ${publicChannelUsername}.\n` +
        "🔒 To unlock all Supervisor-Approved cards, 2/3-Leg Combos, and High-Odds Sniper picks, " +
        "tap <b>'💎 Get VIP Channel Access'</b> from the main menu."
      ),
      select_plan: (
        "💎 <b>Official @aineobet Private VIP Subscription Plans:</b>\n\n" +
        "▫️ Pure high-res English broadcast stadium cards (zero text clutter).\n" +
        "▫️ Includes: <b>Single Dual-Hedge Slips (2.0x & 3.0x)</b> + <b>2/3-Leg Smart Combos</b> + <b>High-Odds Sniper (4x-9x)</b>.\n\n" +
        "👇 Choose your plan below:"
      ),
      choose_payment_method: (
        "📦 <b>Selected Plan:</b> {plan_title}\n" +
        "⏳ <b>Duration:</b> {days} Full Days\n\n" +
        "💵 <b>Crypto Price (USDT):</b> <code>{amount_usdt} USDT</code>\n" +
        "💳 <b>Iranian Card Price:</b> <code>{amount_toman} Toman</code>\n\n" +
        "👇 Select your preferred payment method:"
      ),
      payment_invoice_usdt: (
        "🧾 <b>Automated On-Chain USDT Invoice (Instant 10s Verification)</b>\n\n" +
        "📦 <b>Selected Plan:</b> {plan_title}\n" +
        "💰 <b>Amount Due:</b> <code>{amount}</code> <b>USDT</b>\n\n" +
        "🟢 <b>Option 1 — Tron Network (USDT - TRC20):</b>\n{wallet_trc20}\n\n" +
        "🟣 <b>Option 2 — Polygon Network (USDT - Polygon POS):</b>\n{wallet_polygon}\n\n" +
        "⚡ <b>Instant Activation Instructions:</b>\n" +
        "After sending USDT, simply paste your <b>Transaction Hash (TxID)</b> directly in this chat!"
      ),
      payment_invoice_card: (
        "💳 <b>Iranian Bank Card-to-Card Invoice (Semi-Automated)</b>\n\n" +
        "📦 <b>Selected Plan:</b> {plan_title}\n" +
        "💰 <b>Exact Amount to Transfer (includes unique ID):</b>\n" +
        "👉 <code>{exact_toman}</code> <b>Toman</b>\n\n" +
        "🏦 <b>Destination Card ({bank_name}):</b>\n<code>{card_number}</code>\n" +
        "👤 <b>Card Holder:</b> {card_holder}\n\n" +
        "📸 <b>How to Activate:</b>\n" +
        "After transferring, send a <b>screenshot/photo of your receipt</b> or the <b>last 4 digits of your card</b> right here in this chat."
      ),
      receipt_submitted_user: (
        "✅ <b>Your payment receipt <code>#{receipt_id}</code> has been logged and forwarded to the admin!</b>\n\n" +
        "⏳ As soon as the admin taps Approve, your single-use VIP invite link will be sent here automatically."
      ),
      card_approved_user: (
        "🎉 <b>Your Card-to-Card Payment (Receipt <code>#{receipt_id}</code>) is Approved!</b>\n\n" +
        "📦 <b>Activated Plan:</b> {plan_title}\n" +
        "📅 <b>Valid Until:</b> {expires_at}\n\n" +
        "🔗 <b>Your Single-Use Private VIP Channel Invite Link:</b>\n{invite_link}"
      ),
      card_rejected_user: (
        "❌ <b>Payment Receipt <code>#{receipt_id}</code> was not approved.</b>\n" +
        "Please send a clearer screenshot of your bank transfer receipt or contact support."
      ),
      verifying_tx: "⏳ Querying blockchain nodes (TronGrid / Polygon RPC) to verify your transaction...",
      tx_already_used: "❌ This Transaction Hash (TxID) has already been redeemed.",
      tx_failed: (
        "❌ <b>Verification Failed:</b>\n{reason}\n\n" +
        "Please ensure the transaction is confirmed on-chain and paste the exact TxID."
      ),
      tx_success: (
        "🎉 <b>On-Chain Payment Confirmed!</b>\n\n" +
        "📦 <b>Activated Plan:</b> {plan_title}\n" +
        "💵 <b>Verified Amount:</b> {amount} USDT ({network})\n" +
        "📅 <b>Valid Until:</b> {expires_at}\n\n" +
        "🔗 <b>Your Single-Use Private VIP Channel Invite Link:</b>\n{invite_link}"
      ),
      status_active: (
        "👤 <b>Your Account Status:</b>\n\n" +
        "✅ <b>Status:</b> Active VIP Member 👑\n" +
        "📦 <b>Current Plan:</b> {plan}\n" +
        "⏳ <b>Expires At:</b> {expires_at}\n" +
        "👥 <b>Verified Referrals:</b> {referrals}"
      ),
      status_inactive: (
        "👤 <b>Your Account Status:</b>\n\n" +
        "⚪ <b>Status:</b> Free Tier Member\n" +
        "👥 <b>Verified Referrals:</b> {referrals} / 5 (Refer 5 friends for a free 48h VIP Pass)\n\n" +
        "💎 Upgrade to VIP to receive all Supervisor-Approved cards, Combos, and Sniper picks."
      ),
      referral_info: (
        "🚀 <b>@aineobet Referral Program — Earn Free VIP Access!</b>\n\n" +
        "Share your personal invite link. For every <b>5 friends</b> who start the bot and join our public channel, " +
        "you automatically unlock a <b>48-Hour VIP Weekend Pass ($7 value)</b>!\n\n" +
        "🔗 <b>Your Personal Referral Link:</b>\n<code>{ref_link}</code>\n\n" +
        "📊 <b>Your Verified Referrals:</b> {referrals}"
      ),
    },
  };
}

// ─── پلن‌های تجاری (بخش ۱ پایتون — بدون تغییر) ──────────────────────────────

export interface PlanDef {
  price_usdt: number;
  price_toman: number;
  days: number;
  title_fa: string;
  title_en: string;
}

export const SUBSCRIPTION_PLANS: Record<string, PlanDef> = {
  weekend: {
    price_usdt: 7.0,
    price_toman: 450000,
    days: 2,
    title_fa: "⚡ بسته ۴۸ ساعته آخر هفته (Weekend Pass)",
    title_en: "⚡ 48-Hour Weekend Matchday Pass",
  },
  pro_monthly: {
    price_usdt: 29.0,
    price_toman: 1850000,
    days: 30,
    title_fa: "💎 اشتراک ماهانه VIP فوتبال‌کوانت (۳۰ روز)",
    title_en: "💎 Pro Football Quant VIP (30 Days)",
  },
  quant_all: {
    price_usdt: 59.0,
    price_toman: 3750000,
    days: 30,
    title_fa: "👑 اشتراک جامع VIP (فوتبال + تنیس مارکوف + اسنایپر)",
    title_en: "👑 All-Access Quant VIP (Football + Tennis + Sniper)",
  },
};
