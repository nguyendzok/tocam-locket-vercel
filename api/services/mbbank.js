/**
 * MBBank Transaction Checker Module
 * Kết nối API MBBank để tự động quét lịch sử giao dịch và xác nhận thanh toán
 */

const DEFAULT_MBB_TOKEN = process.env.MBB_TOKEN || "2q5YDTrQAmVbm9cWKPaoVgFgn2t4";
const MBB_API_BASE = "https://apimbb.vercel.app/historyapimbb";

/**
 * Lấy lịch sử giao dịch từ API MBBank
 * @param {string} token 
 * @returns {Promise<Array>}
 */
async function fetchMbbankHistory(token = DEFAULT_MBB_TOKEN) {
  try {
    const url = `${MBB_API_BASE}/${token.trim()}`;
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      },
      signal: AbortSignal.timeout(12000)
    });

    if (!res.ok) {
      console.error(`[MBBANK] Lỗi HTTP ${res.status} khi lấy lịch sử giao dịch`);
      return [];
    }

    const data = await res.json();
    return Array.isArray(data.transactionInfos) ? data.transactionInfos : [];
  } catch (err) {
    console.error('[MBBANK] Lỗi kết nối API MBBank:', err.message);
    return [];
  }
}

/**
 * Kiểm tra xem người dùng đã chuyển khoản thành công chưa
 * @param {string} username Username Locket của người mua
 * @param {number} expectedAmount Số tiền mong đợi (VNĐ)
 * @param {string} token Token API MBBank
 * @param {number} maxMinutes Số phút tối đa tính từ lúc tạo đơn
 */
async function checkPaymentForUser(username, expectedAmount = 0, token = DEFAULT_MBB_TOKEN, maxMinutes = 120) {
  if (!username) return { found: false };

  const cleanUser = String(username).toLowerCase().replace(/[@\s]/g, '').trim();
  const transactions = await fetchMbbankHistory(token);

  if (!transactions || transactions.length === 0) {
    return { found: false, error: 'Không lấy được lịch sử MBBank' };
  }

  for (const tx of transactions) {
    // Chỉ xét các giao dịch tiền vào (CRDT)
    if (tx.creditDebitIndicator !== 'CRDT') continue;

    const desc = String(tx.description || '').toLowerCase().replace(/[@\s]/g, '');
    const amount = parseInt(tx.amount || '0', 10);

    // Kiểm tra nội dung chuyển khoản có chứa username của khách không
    const matchUser = desc.includes(cleanUser);

    if (matchUser) {
      // Nếu có yêu cầu số tiền, kiểm tra số tiền chuyển có >= 90% số tiền mong đợi không (trừ phí nếu có)
      if (expectedAmount > 0) {
        if (amount < expectedAmount * 0.9) {
          continue; // Chưa đủ tiền
        }
      }

      return {
        found: true,
        transaction: {
          id: tx.id,
          reference: tx.reference || tx.xref || tx.id,
          amount,
          currency: tx.currency || 'VND',
          description: tx.description,
          date: tx.bookingDate || tx.valueDate,
          runningBalance: tx.runningBalance
        }
      };
    }
  }

  return { found: false };
}

module.exports = {
  fetchMbbankHistory,
  checkPaymentForUser,
  DEFAULT_MBB_TOKEN
};
