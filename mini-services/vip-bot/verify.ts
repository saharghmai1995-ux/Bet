// ─────────────────────────────────────────────────────────────────────────────
// ⛓️ موتور تایید خودکار تراکنش تتر روی بلاکچین (معادل ۱:۱ بخش ۴ پایتون)
//   • TRC-20  ← TronScan API  (contractRet === SUCCESS)
//   • Polygon ← eth_getTransactionReceipt روی polygon-rpc.com (status 0x1 + topic Transfer)
// ─────────────────────────────────────────────────────────────────────────────

// قراردادهای رسمی تتر
export const TRON_USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
export const POLYGON_USDT_CONTRACT = "0xc2132d05d31c914a87c6611c10748aeb04b58e8f";
export const ERC20_TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export interface VerifyResult {
  ok: boolean;
  amount: number;
  message: string;
}

const UA = { "User-Agent": "NeoBetQuantVerifier/1.0" };

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

/** تایید تراکنش USDT روی شبکه پالیگان (Polygon POS) */
export async function verifyPolygonUsdtTransaction(
  txid: string,
  expectedWallet: string,
  minAmountUsdt: number
): Promise<VerifyResult> {
  const cleanTx = txid.trim().toLowerCase();
  if (!cleanTx.startsWith("0x") || cleanTx.length !== 66) {
    return { ok: false, amount: 0, message: "Invalid Polygon TxID format (must start with 0x and be 66 characters)." };
  }

  let resultJson: { result?: Record<string, unknown> | null };
  try {
    const res = await fetch("https://polygon-rpc.com", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...UA },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_getTransactionReceipt",
        params: [cleanTx],
        id: 1,
      }),
      signal: AbortSignal.timeout(12_000),
    });
    resultJson = (await res.json()) as { result?: Record<string, unknown> | null };
  } catch (exc) {
    return { ok: false, amount: 0, message: `Polygon RPC connection error: ${exc}` };
  }

  const receipt = resultJson.result;
  if (!receipt || receipt.status !== "0x1") {
    return { ok: false, amount: 0, message: "Transaction not found or failed on Polygon network." };
  }

  const cleanWalletPadded =
    "0x" + expectedWallet.toLowerCase().replace("0x", "").padStart(64, "0");
  const logs = (receipt.logs as Record<string, unknown>[] | undefined) ?? [];
  for (const log of logs) {
    if (String(log.address ?? "").toLowerCase() !== POLYGON_USDT_CONTRACT) continue;
    const topics = ((log.topics as string[] | undefined) ?? []).map((t) => t.toLowerCase());
    if (topics.length >= 3 && topics[0] === ERC20_TRANSFER_TOPIC && topics[2] === cleanWalletPadded) {
      const rawHex = String(log.data ?? "0x0");
      const amountUsdt = parseInt(rawHex, 16) / 1e6;
      if (amountUsdt + 0.05 >= minAmountUsdt) {
        return {
          ok: true,
          amount: Math.round(amountUsdt * 100) / 100,
          message: "Confirmed on Polygon POS",
        };
      }
      return {
        ok: false,
        amount: amountUsdt,
        message: `Transferred amount (${amountUsdt.toFixed(2)} USDT) is less than required (${minAmountUsdt.toFixed(2)} USDT).`,
      };
    }
  }

  return {
    ok: false,
    amount: 0,
    message: "No matching Polygon USDT transfer to the official NeoBet wallet was found.",
  };
}

export type Network = "Tron (TRC-20)" | "Polygon (USDT)";

/** استعلام خودکار: بسته به فرمت TxID شبکه درست را انتخاب می‌کند */
export async function verifyUsdtTxid(
  txid: string,
  expectedTrc20Wallet: string,
  expectedPolygonWallet: string,
  minAmountUsdt: number
): Promise<{ ok: boolean; amount: number; message: string; network: Network }> {
  const cleanTx = txid.trim();
  if (cleanTx.startsWith("0x") && cleanTx.length === 66) {
    const r = await verifyPolygonUsdtTransaction(cleanTx, expectedPolygonWallet, minAmountUsdt);
    return { ...r, network: "Polygon (USDT)" };
  }
  const r = await verifyTrc20UsdtTransaction(cleanTx, expectedTrc20Wallet, minAmountUsdt);
  return { ...r, network: "Tron (TRC-20)" };
}
