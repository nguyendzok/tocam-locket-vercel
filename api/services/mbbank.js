/**
 * MBBank Transaction Checker Module
 * Kết nối API MBBank để tự động quét lịch sử giao dịch và xác nhận thanh toán
 * Hỗ trợ bộ đệm Cache 4.5 giây để khớp tần suất tự động quét 5 giây/lần
 */

const DEFAULT_MBB_TOKEN = process.env.MBB_TOKEN || "2q5YDTrQAmVbm9cWKPaoVgFgn2t4";
const MBB_API_BASE = "https://apimbb.vercel.app/historyapimbb";

let mbbCache = {
  data: [],
  timestamp: 0,
  token: null
};

/**
 * Lấy lịch sử giao dịch từ API MBBank (Có cache 4.5s tránh rate-limit)
 * @param {string} token 
 * @param {boolean} force
 * @returns {Promise<Array>}
 */
async function fetchMbbankHistory(token = DEFAULT_MBB_TOKEN, force = false) {
  const currentToken = (token && token.trim()) ? token.trim() : DEFAULT_MBB_TOKEN;
  const now = Date.now();

  // Khớp với tần suất polling 5s của client: nếu chưa quá 4.5s thì trả về cache ngay lập tức (0ms)
  if (!force && mbbCache.data.length > 0 && mbbCache.token === currentToken && (now - mbbCache.timestamp < 4500)) {
    return mbbCache.data;
  }

  try {
    const url = `${MBB_API_BASE}/${currentToken}`;
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      },
      signal: AbortSignal.timeout(9000)
    });

    if (!res.ok) {
      console.warn(`[MBBANK] Lỗi HTTP ${res.status} khi lấy lịch sử giao dịch`);
      return mbbCache.data.length > 0 ? mbbCache.data : [];
    }

    const data = await res.json();
    const list = Array.isArray(data.transactionInfos) ? data.transactionInfos : [];
    if (list.length > 0) {
      mbbCache = {
        data: list,
        timestamp: now,
        token: currentToken
      };
      return list;
    }
    return mbbCache.data.length > 0 ? mbbCache.data : [];
  } catch (err) {
    console.warn('[MBBANK] Lỗi kết nối API MBBank:', err.message);
    return mbbCache.data.length > 0 ? mbbCache.data : [];
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
