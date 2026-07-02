/**
 * YoBasePay API wrapper.
 * Docs: https://yobasepay.net
 * Endpoint: GET https://yobasepay.net/api.php?action=...
 */

const BASE_URL = "https://yobasepay.net/api.php";
const API_KEY = process.env.YOBASEPAY_API_KEY ?? "";

export interface CreatePaymentResult {
  success: boolean;
  trxId?: string;
  qrImageUrl?: string;
  expiredAt?: string;
  amount?: number;
  error?: string;
}

/**
 * Buat transaksi pembayaran QRIS dinamis.
 * amount: jumlah dalam Rupiah (integer)
 * Memanggil ?action=createpayment&apikey=...&amount=...
 */
export async function createPayment(amount: number): Promise<CreatePaymentResult> {
  if (!API_KEY) {
    return { success: false, error: "YOBASEPAY_API_KEY tidak dikonfigurasi." };
  }

  try {
    const url = `${BASE_URL}?action=createpayment&apikey=${encodeURIComponent(API_KEY)}&amount=${amount}`;
    const res = await fetch(url, {
      method: "GET",
      headers: { "Accept": "application/json" },
      // Timeout 10 detik
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      return {
        success: false,
        error: `YoBasePay API error: HTTP ${res.status}`,
      };
    }

    const data = await res.json() as {
      status?: boolean | number;
      data?: {
        trx_id?: string;
        qr_image?: string;
        expired_at?: string;
        amount?: number;
      };
      message?: string;
    };

    // YoBasePay: { status: true/false, data: {...}, message: "..." }
    const ok = data.status === true || data.status === 1;
    if (!ok || !data.data) {
      return {
        success: false,
        error: data.message ?? "Gagal membuat transaksi YoBasePay.",
      };
    }

    return {
      success: true,
      trxId: data.data.trx_id,
      qrImageUrl: data.data.qr_image,
      expiredAt: data.data.expired_at,
      amount: data.data.amount,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Koneksi ke YoBasePay gagal: ${msg}` };
  }
}

export interface CheckPaymentResult {
  success: boolean;
  status?: "SUCCESS" | "PENDING" | "EXPIRED" | "FAILED";
  amount?: number;
  error?: string;
}

/**
 * Cek status transaksi (PUBLIC — tidak butuh API key).
 * Dipanggil langsung dari BROWSER (frontend polling).
 * Endpoint: ?action=check_public&trxid=YO-XXXX
 *
 * PENTING: Fungsi ini TIDAK dipanggil dari server/API route.
 * Frontend memanggil langsung ke YoBasePay dengan URL:
 * https://yogateway.id/api.php?action=check_public&trxid={trxId}
 *
 * Export URL builder saja untuk dipakai frontend.
 */
export function buildCheckPublicUrl(trxId: string): string {
  return `${BASE_URL}?action=check_public&trxid=${encodeURIComponent(trxId)}`;
}
