// ─────────────────────────────────────────────────────────────────────────────
// ⛓️ موتور تایید خودکار تراکنش تتر روی بلاکچین — v13.2 چهار شبکه‌ای
//   • Tron     ← TronScan API                     (contractRet === SUCCESS)
//   • Polygon  ← eth_getTransactionReceipt        (status 0x1 + topic Transfer، ۶ اعشار)
//   • BNB Chain← eth_getTransactionReceipt BEP-20 (تتر بایننس، ۱۸ اعشار)
//   • Solana   ← getTransaction jsonParsed SPL    (mint رسمی USDT + دلتای بالانس)
// فرمت TxID شبکه درست را انتخاب می‌کند؛ برای EVM ابتدا Polygon و سپس BNB آزموده می‌شود.
// ─────────────────────────────────────────────────────────────────────────────

// قراردادهای رسمی تتر
export const TRON_USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
export const POLYGON_USDT_CONTRACT = "0xc2132d05d31c914a87c6611c10748aeb04b58e8f";
/** Binance-Peg BSC-USD (BEP-20) — قرارداد رسمی تتر بایننس روی BNB Smart Chain */
export const BSC_USDT_CONTRACT = "0x55d398326f99059ff775485246999027b3197955";
/** mint رسمی USDT روی سولانا (Solana SPL) */
export const SOLANA_USDT_MINT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
export const ERC20_TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const BSC_RPCS = [
  "https://bsc-dataseed.binance.org",
  "https://bsc-dataseed1.defibit.io",
  "https://bsc-dataseed1.ninicoin.io",
];
const SOLANA_RPCS = ["https://api.mainnet-beta.solana.com", "https://solana-rpc.publicnode.com"];

export interface VerifyResult {
  ok: boolean;
  amount: number;
  message: string;
}

const UA = { "User-Agent": "NeoBetQuantVerifier/1.0" };

/** فرمت TxID شامل 0x + ۶۴ نویسه hex است؟ (EVM: Polygon / BNB) */
function isEvmTxid(tx: string): boolean {
  return tx.startsWith("0x") && tx.length === 66;
}

/** امضای سولانا: Base58 (بدون 0/O/I/l) با طول ~۸۷-۸۸ */
export function isSolanaTxid(tx: string): boolean {
  if (tx.length < 80 || tx.length > 93) return false;
  return /^[1-9A-HJ-NP-Za-km-z]+$/.test(tx);
}

/** خطای «پیدا نشد» — در این حالت برای EVM شبکه بعدی هم آزمایش می‌شود */
function isNotFoundMessage(msg: string): boolean {
  return msg.includes("not found") || msg.includes("No matching");
}

// ─── ۱) ترون — TRC-20 ────────────────────────────────────────────────────────

/** تایید تراکنش USDT روی شبکه ترون (TRC-20) */
export async function verifyTrc20UsdtTransaction(
  txid: string,
  expectedWallet: string,
  minAmountUsdt: number
): Promise<VerifyResult> {
  const cleanTx = txid.trim();
  if (cleanTx.length !== 64) {
    return { ok: false, amount: 0, message: "Invalid TRC20 TxID length (must be 64 hex characters)." };
  }

  let data: Record<string, unknown>;
  try {
    const res = await fetch(
      `https://apilist.tronscanapi.com/api/transaction-info?hash=${encodeURIComponent(cleanTx)}`,
      { headers: UA, signal: AbortSignal.timeout(12_000) }
    );
    data = (await res.json()) as Record<string, unknown>;
  } catch (exc) {
    return { ok: false, amount: 0, message: `Blockchain node connection error: ${exc}` };
  }

  if (!data || data.contractRet !== "SUCCESS") {
    return {
      ok: false,
      amount: 0,
      message: "Transaction not found or status is not SUCCESS on Tron blockchain.",
    };
  }

  const transfers = (data.trc20TransferInfo as Record<string, string>[] | undefined) ?? [];
  for (const tr of transfers) {
    const contractAddr = tr.contract_address ?? "";
    const toAddr = tr.to_address ?? "";
    const decimals = parseInt(tr.decimals ?? "6", 10);
    const rawAmount = parseFloat(tr.amount_str ?? "0") / 10 ** decimals;

    if (contractAddr === TRON_USDT_CONTRACT && toAddr.toLowerCase() === expectedWallet.toLowerCase()) {
      if (rawAmount + 0.05 >= minAmountUsdt) {
        return { ok: true, amount: Math.round(rawAmount * 100) / 100, message: "Confirmed on Tron (TRC-20)" };
      }
      return {
        ok: false,
        amount: rawAmount,
        message: `Transferred amount (${rawAmount.toFixed(2)} USDT) is less than required (${minAmountUsdt.toFixed(2)} USDT).`,
      };
    }
  }

  return {
    ok: false,
    amount: 0,
    message: "No matching USDT-TRC20 transfer to the official NeoBet wallet was found in this TxID.",
  };
}

// ─── ۲) EVM مشترک — Polygon / BNB Chain ──────────────────────────────────────

interface EvmLog {
  address?: string;
  topics?: string[];
  data?: string;
}

/** eth_getTransactionReceipt روی چند RPC پشتیبان — null = هیچ نودی پاسخ نداد */
async function evmGetReceipt(rpcs: string[], txid: string): Promise<Record<string, unknown> | null | "rpc-error"> {
  for (const rpc of rpcs) {
    try {
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...UA },
        body: JSON.stringify({ jsonrpc: "2.0", method: "eth_getTransactionReceipt", params: [txid], id: 1 }),
        signal: AbortSignal.timeout(12_000),
      });
      const json = (await res.json()) as { result?: Record<string, unknown> | null };
      if (json && "result" in json) return json.result ?? null;
      return null;
    } catch {
      continue; // RPC بعدی
    }
  }
  return "rpc-error";
}

/** بررسی لاگ‌های ERC-20 Transfer یک رسید در برابر کیف پول مقصد */
function matchErc20TransferLogs(
  receipt: Record<string, unknown>,
  usdtContract: string,
  expectedWallet: string,
  decimals: number
): VerifyResult {
  const cleanWalletPadded = "0x" + expectedWallet.toLowerCase().replace("0x", "").padStart(64, "0");
  const logs = (receipt.logs as EvmLog[] | undefined) ?? [];
  for (const log of logs) {
    if (String(log.address ?? "").toLowerCase() !== usdtContract.toLowerCase()) continue;
    const topics = ((log.topics as string[] | undefined) ?? []).map((t) => t.toLowerCase());
    if (topics.length >= 3 && topics[0] === ERC20_TRANSFER_TOPIC && topics[2] === cleanWalletPadded) {
      const rawHex = String(log.data ?? "0x0");
      const amountUsdt = parseInt(rawHex, 16) / 10 ** decimals;
      return { ok: true, amount: Math.round(amountUsdt * 100) / 100, message: "ERC20_MATCH" };
    }
  }
  return { ok: false, amount: 0, message: "NO_WALLET_MATCH" };
}

function amountShortResult(amount: number, minAmountUsdt: number): VerifyResult {
  return {
    ok: false,
    amount,
    message: `Transferred amount (${amount.toFixed(2)} USDT) is less than required (${minAmountUsdt.toFixed(2)} USDT).`,
  };
}

/** تایید تراکنش USDT روی Polygon POS (۶ اعشار) */
export async function verifyPolygonUsdtTransaction(
  txid: string,
  expectedWallet: string,
  minAmountUsdt: number
): Promise<VerifyResult> {
  const cleanTx = txid.trim().toLowerCase();
  if (!isEvmTxid(cleanTx)) {
    return { ok: false, amount: 0, message: "Invalid EVM TxID format (must start with 0x and be 66 characters)." };
  }

  const receipt = await evmGetReceipt(["https://polygon-rpc.com", "https://polygon-bor-rpc.publicnode.com"], cleanTx);
  if (receipt === "rpc-error") {
    return { ok: false, amount: 0, message: "Polygon RPC connection error (all nodes failed)." };
  }
  if (!receipt || receipt.status !== "0x1") {
    return { ok: false, amount: 0, message: "Transaction not found or failed on Polygon network." };
  }

  const match = matchErc20TransferLogs(receipt, POLYGON_USDT_CONTRACT, expectedWallet, 6);
  if (match.message === "ERC20_MATCH") {
    if (match.amount + 0.05 >= minAmountUsdt) {
      return { ok: true, amount: match.amount, message: "Confirmed on Polygon POS" };
    }
    return amountShortResult(match.amount, minAmountUsdt);
  }
  return {
    ok: false,
    amount: 0,
    message: "No matching Polygon USDT transfer to the official NeoBet wallet was found.",
  };
}

/** تایید تراکنش تتر بایننس روی BNB Smart Chain — BEP-20 (۱۸ اعشار) */
export async function verifyBscUsdtTransaction(
  txid: string,
  expectedWallet: string,
  minAmountUsdt: number
): Promise<VerifyResult> {
  const cleanTx = txid.trim().toLowerCase();
  if (!isEvmTxid(cleanTx)) {
    return { ok: false, amount: 0, message: "Invalid BNB Chain TxID format (must start with 0x and be 66 characters)." };
  }

  const receipt = await evmGetReceipt(BSC_RPCS, cleanTx);
  if (receipt === "rpc-error") {
    return { ok: false, amount: 0, message: "BNB Chain RPC connection error (all nodes failed)." };
  }
  if (!receipt || receipt.status !== "0x1") {
    return { ok: false, amount: 0, message: "Transaction not found or failed on BNB Chain network." };
  }

  const match = matchErc20TransferLogs(receipt, BSC_USDT_CONTRACT, expectedWallet, 18);
  if (match.message === "ERC20_MATCH") {
    if (match.amount + 0.05 >= minAmountUsdt) {
      return { ok: true, amount: match.amount, message: "Confirmed on BNB Chain (BEP-20)" };
    }
    return amountShortResult(match.amount, minAmountUsdt);
  }
  return {
    ok: false,
    amount: 0,
    message: "No matching BNB Chain (BEP-20) USDT transfer to the official NeoBet wallet was found.",
  };
}

// ─── ۳) سولانا — SPL USDT ─────────────────────────────────────────────────────

interface SolTokenBalance {
  accountIndex: number;
  mint?: string;
  owner?: string;
  uiTokenAmount?: { uiAmount?: number | null };
}

interface SolTxResult {
  meta?: { err?: unknown; preTokenBalances?: SolTokenBalance[]; postTokenBalances?: SolTokenBalance[] } | null;
}

/** تایید تراکنش USDT روی سولانا: دلتای بالانس توکن رسمی USDT برای کیف پول مقصد */
export async function verifySolanaUsdtTransaction(
  txid: string,
  expectedWallet: string,
  minAmountUsdt: number
): Promise<VerifyResult> {
  const cleanTx = txid.trim();
  if (!isSolanaTxid(cleanTx)) {
    return { ok: false, amount: 0, message: "Invalid Solana signature format (expected ~87-88 Base58 characters)." };
  }

  let tx: SolTxResult | null = null;
  for (const rpc of SOLANA_RPCS) {
    try {
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...UA },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getTransaction",
          params: [cleanTx, { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 }],
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const json = (await res.json()) as { result?: SolTxResult | null };
      if (json && "result" in json) {
        tx = json.result ?? null;
        break;
      }
    } catch {
      continue; // RPC بعدی
    }
  }
  if (!tx) {
    return { ok: false, amount: 0, message: "Solana RPC connection error (all nodes failed)." };
  }

  const meta = tx.meta;
  if (!meta || (meta.err !== null && meta.err !== undefined)) {
    return { ok: false, amount: 0, message: "Transaction not found or failed on Solana network." };
  }

  const post = meta.postTokenBalances ?? [];
  const pre = meta.preTokenBalances ?? [];
  let bestDelta = 0;
  let found = false;
  for (const pb of post) {
    if (pb.mint !== SOLANA_USDT_MINT) continue;
    // با encoding=jsonParsed فیلد owner = مالک حساب توکن (کیف پول مقصد)
    if (!pb.owner || pb.owner !== expectedWallet) continue;
    const preEntry = pre.find((x) => x.accountIndex === pb.accountIndex);
    const preAmt = preEntry?.uiTokenAmount?.uiAmount ?? 0;
    const postAmt = pb.uiTokenAmount?.uiAmount ?? 0;
    const delta = postAmt - preAmt;
    if (delta > bestDelta) {
      bestDelta = delta;
      found = true;
    }
  }

  if (!found || bestDelta <= 0) {
    return {
      ok: false,
      amount: 0,
      message: "No matching Solana USDT (SPL) transfer to the official NeoBet wallet was found.",
    };
  }
  const amount = Math.round(bestDelta * 100) / 100;
  if (amount + 0.05 >= minAmountUsdt) {
    return { ok: true, amount, message: "Confirmed on Solana (SPL USDT)" };
  }
  return amountShortResult(amount, minAmountUsdt);
}

// ─── ۴) مسیریابی خودکار بر اساس فرمت TxID ────────────────────────────────────

export type Network = "Tron (TRC-20)" | "Polygon (USDT)" | "BNB Chain (BEP-20)" | "Solana (SPL)";

export interface UsdtWallets {
  trc20: string;
  polygon: string;
  bsc: string;
  solana: string;
}

/** استعلام خودکار: فرمت TxID → شبکه درست (EVM: ابتدا Polygon، سپس BNB Chain) */
export async function verifyUsdtTxid(
  txid: string,
  wallets: UsdtWallets,
  minAmountUsdt: number
): Promise<{ ok: boolean; amount: number; message: string; network: Network }> {
  const cleanTx = txid.trim();

  if (isEvmTxid(cleanTx)) {
    // EVM — ابتدا Polygon؛ اگر تراکنش واقعاً یافت نشد، زنجیره BNB آزموده می‌شود
    const p = await verifyPolygonUsdtTransaction(cleanTx, wallets.polygon, minAmountUsdt);
    if (p.ok || !isNotFoundMessage(p.message)) return { ...p, network: "Polygon (USDT)" };
    const b = await verifyBscUsdtTransaction(cleanTx, wallets.bsc, minAmountUsdt);
    return { ...b, network: "BNB Chain (BEP-20)" };
  }

  if (isSolanaTxid(cleanTx)) {
    const s = await verifySolanaUsdtTransaction(cleanTx, wallets.solana, minAmountUsdt);
    return { ...s, network: "Solana (SPL)" };
  }

  const r = await verifyTrc20UsdtTransaction(cleanTx, wallets.trc20, minAmountUsdt);
  return { ...r, network: "Tron (TRC-20)" };
}
