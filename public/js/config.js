/**
 * ============================================================
 * 👑 CẤU HÌNH HỆ THỐNG LOCKET GOLD VIP & DNS CHỐNG RỤNG
 * Tự động đồng bộ với backend & Admin Dashboard
 * ============================================================
 */

const TO_CAM_CONFIG = {
  // --- THÔNG TIN THƯƠNG HIỆU ---
  BRAND_NAME: "LOCKET GOLD VIP",
  BRAND_SLOGAN: "Cổng Nâng Cấp Locket Gold & DNS VIP Chống Rụng Tự Động",
  WEBSITE_URL: window.location.origin,

  // --- THÔNG TIN THANH TOÁN (MBBANK - HOANG NGOC NGUYEN) ---
  BANK_ID: "MB",
  BANK_NAME: "MBBank (Ngân hàng TMCP Quân Đội)",
  ACCOUNT_NUMBER: "11223344557766",
  ACCOUNT_NUMBER_DISPLAY: "1122 3344 5577 66",
  ACCOUNT_HOLDER: "HOANG NGOC NGUYEN",
  QR_IMAGE_PATH: "", // Dùng VietQR động tự tạo theo chuẩn Napas247

  // --- THÔNG TIN LIÊN HỆ & CSKH (FACEBOOK HỖ TRỢ 24/7) ---
  FACEBOOK_URL: "https://www.facebook.com/messages/t/nguyendzok",
  FACEBOOK_NAME: "Facebook CSKH 24/7",

  // --- THÔNG TIN DOH PROFILE (CÀI ĐẶT DNS BƯỚC 3) ---
  DOH_SERVER_URL: `${window.location.origin}/api/dns-query`,
  MOBILECONFIG_DOWNLOAD_URL: `${window.location.origin}/api/profile/download`,

  // --- THÔNG TIN GÓI DỊCH VỤ ---
  PLANS: {
    "5m": {
      id: "5m",
      name: "Test 5 Phút",
      price: 0,
      formattedPrice: "0đ",
      unit: "/5 phút",
      badge: "TEST RỤNG"
    },
    TEST: {
      id: "1d",
      name: "Gói 1 Ngày",
      price: 9000,
      formattedPrice: "9.000đ",
      unit: "/1 ngày",
      badge: "DÙNG THỬ"
    },
    MONTH6: {
      id: "6month",
      name: "Gói 6 Tháng",
      price: 39000,
      formattedPrice: "39.000đ",
      unit: "/6 tháng",
      badge: "PHỔ BIẾN"
    },
    YEARLY: {
      id: "yearly",
      name: "Gói 1 Năm",
      price: 69000,
      formattedPrice: "69.000đ",
      unit: "/năm",
      badge: "TIẾT KIỆM"
    },
    LIFETIME: {
      id: "lifetime",
      name: "Gói Vĩnh Viễn",
      price: 99000,
      formattedPrice: "99.000đ",
      unit: "/trọn đời",
      badge: "KHUYÊN DÙNG"
    }
  }
};

// Đồng bộ cài đặt từ máy chủ nếu có
(async function syncSettingsFromServer() {
  try {
    const res = await fetch('/api/settings');
    if (res.ok) {
      const data = await res.json();
      if (data.ok) {
        if (data.bank) {
          TO_CAM_CONFIG.BANK_ID = data.bank.bankId || TO_CAM_CONFIG.BANK_ID;
          TO_CAM_CONFIG.BANK_NAME = data.bank.bankName || TO_CAM_CONFIG.BANK_NAME;
          TO_CAM_CONFIG.ACCOUNT_NUMBER = data.bank.accountNumber || TO_CAM_CONFIG.ACCOUNT_NUMBER;
          TO_CAM_CONFIG.ACCOUNT_NUMBER_DISPLAY = data.bank.accountNumber || TO_CAM_CONFIG.ACCOUNT_NUMBER_DISPLAY;
          TO_CAM_CONFIG.ACCOUNT_HOLDER = data.bank.accountHolder || TO_CAM_CONFIG.ACCOUNT_HOLDER;
        }
        if (data.facebookUrl) TO_CAM_CONFIG.FACEBOOK_URL = data.facebookUrl;
        if (data.facebookName) TO_CAM_CONFIG.FACEBOOK_NAME = data.facebookName;
        if (data.brandName) TO_CAM_CONFIG.BRAND_NAME = data.brandName;
      }
    }
  } catch (e) { }
})();

// Đưa config vào window để sử dụng toàn cầu
if (typeof window !== 'undefined') {
  window.TO_CAM_CONFIG = TO_CAM_CONFIG;
}
