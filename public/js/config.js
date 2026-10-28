/**
 * ============================================================
 * 👑 CẤU HÌNH HỆ THỐNG LOCKET GOLD VIP & DNS CHỐNG RỤNG
 * Tự động đồng bộ thời gian thực từ Admin Panel & Máy Chủ
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
      badge: "TEST RỤNG",
      active: true,
      description: "Dùng thử kiểm chứng cơ chế tự động rụng Gold sau đúng 5 phút"
    },
    "1d": {
      id: "1d",
      name: "Gói 1 Ngày",
      price: 5000,
      formattedPrice: "5.000đ",
      unit: "/1 ngày",
      badge: "DÙNG THỬ",
      active: true,
      description: "Trải nghiệm đầy đủ 9 đặc quyền VIP Locket Gold trong 24 giờ"
    },
    "month6": {
      id: "month6",
      name: "Gói 6 Tháng",
      price: 50000,
      formattedPrice: "50.000đ",
      unit: "/6 tháng",
      badge: "PHỔ BIẾN",
      active: true,
      description: "Sử dụng ổn định 180 ngày, bảo hành DNS tự động"
    },
    "yearly": {
      id: "yearly",
      name: "Gói 1 Năm",
      price: 85000,
      formattedPrice: "85.000đ",
      unit: "/năm",
      badge: "TIẾT KIỆM",
      active: true,
      description: "Sử dụng trọn vẹn 365 ngày (1 năm), tiết kiệm tối đa"
    },
    "lifetime": {
      id: "lifetime",
      name: "Gói Vĩnh Viễn",
      price: 120000,
      formattedPrice: "120.000đ",
      unit: "/trọn đời",
      badge: "KHUYÊN DÙNG",
      active: true,
      description: "Bảo hành trọn đời, tường lửa chống rụng vĩnh viễn"
    }
  }
};

/**
 * Cập nhật toàn bộ link Facebook, Ngân hàng và giao diện DOM tức thì
 */
function applyGlobalSettings(settings) {
  if (!settings) return;

  if (settings.facebookUrl) {
    TO_CAM_CONFIG.FACEBOOK_URL = settings.facebookUrl;
    document.querySelectorAll('.cfg-fb-link').forEach(el => {
      el.href = settings.facebookUrl;
    });
  }

  if (settings.facebookName) {
    TO_CAM_CONFIG.FACEBOOK_NAME = settings.facebookName;
    document.querySelectorAll('.cfg-fb-name').forEach(el => {
      el.innerText = settings.facebookName;
    });
  }

  if (settings.bank) {
    TO_CAM_CONFIG.BANK_ID = settings.bank.bankId || TO_CAM_CONFIG.BANK_ID;
    TO_CAM_CONFIG.BANK_NAME = settings.bank.bankName || TO_CAM_CONFIG.BANK_NAME;
    TO_CAM_CONFIG.ACCOUNT_NUMBER = settings.bank.accountNumber || TO_CAM_CONFIG.ACCOUNT_NUMBER;
    TO_CAM_CONFIG.ACCOUNT_NUMBER_DISPLAY = settings.bank.accountNumber || TO_CAM_CONFIG.ACCOUNT_NUMBER_DISPLAY;
    TO_CAM_CONFIG.ACCOUNT_HOLDER = settings.bank.accountHolder || TO_CAM_CONFIG.ACCOUNT_HOLDER;

    const bName = document.getElementById('cfg-bank-name');
    const bAcc = document.getElementById('cfg-acc-number');
    const bHolder = document.getElementById('cfg-acc-holder');
    if (bName) bName.innerText = TO_CAM_CONFIG.BANK_NAME;
    if (bAcc) bAcc.innerText = TO_CAM_CONFIG.ACCOUNT_NUMBER;
    if (bHolder) bHolder.innerText = TO_CAM_CONFIG.ACCOUNT_HOLDER;
  }

  if (settings.plans && typeof settings.plans === 'object') {
    TO_CAM_CONFIG.PLANS = settings.plans;
    renderDynamicPlans(settings.plans);
  }
}

/**
 * Render động toàn bộ thẻ gói trên trang chủ (index.html) và trang nạp (gold.html)
 */
function renderDynamicPlans(plans) {
  if (!plans) return;

  const planKeys = Object.keys(plans);
  if (planKeys.length === 0) return;

  // 1. Render trên trang chủ index.html
  const indexGrid = document.getElementById('index-plans-grid');
  if (indexGrid) {
    // Chỉ render các gói không phải test 5 phút trên trang chủ (hoặc có giá > 0)
    const displayKeys = planKeys.filter(k => k !== '5m');
    indexGrid.innerHTML = displayKeys.map((key, idx) => {
      const p = plans[key];
      const isLifetime = key.includes('life') || key.includes('vinhvien');
      const isYearly = key.includes('year') || key.includes('nam');
      const is6Month = key.includes('6') || key.includes('month');
      const isTest = key.includes('test') || key.includes('1d');

      const badgeClass = isTest ? 'badge-test' : (is6Month ? 'badge-6month' : (isYearly ? 'badge-yearly' : ''));
      const activeClass = (idx === displayKeys.length - 1 || isLifetime) ? 'active' : '';
      const formattedPrice = p.formattedPrice || (Number(p.price || 0).toLocaleString('vi-VN') + 'đ');

      return `
        <div class="plan-card ${activeClass}" id="index-plan-${key}" onclick="selectIndexPlan(this, '${key}')">
          <div class="plan-select-indicator"><i class="fa-solid fa-check"></i></div>
          <div class="plan-badge ${badgeClass}"><i class="fa-solid fa-crown"></i> ${p.badge || 'VIP'}</div>
          <div class="plan-header" style="font-size:18px;">${p.name}</div>
          <div class="plan-price" style="font-size:28px; ${isLifetime ? 'color:#FF7A00;' : ''}">${formattedPrice} <small>${p.unit || ''}</small></div>
          <p style="font-size:12.5px; color:#94A3B8; margin-bottom:14px;">${p.description || 'Trải nghiệm toàn bộ tính năng VIP Locket Gold & Tường lửa DNS.'}</p>
          <ul class="plan-features-mini" style="margin-bottom: 18px;">
            <li><i class="fa-solid fa-check"></i> Mở khoá Locket Gold chính chủ</li>
            <li><i class="fa-solid fa-check"></i> Không quảng cáo làm phiền</li>
            <li><i class="fa-solid fa-check"></i> Upload ảnh / video từ thư viện</li>
            <li><i class="fa-solid fa-check"></i> <span class="text-highlight-video">Quay video Locket 30 giây</span></li>
            <li><i class="fa-solid fa-check"></i> Thay đổi icon Locket độc quyền</li>
            <li><i class="fa-solid fa-check"></i> <span class="text-highlight-caption">Thêm caption hot trend, thú vị</span></li>
            <li><i class="fa-solid fa-check"></i> Mở khoá giới hạn bạn bè &amp; Thêm âm thanh</li>
            <li><i class="fa-solid fa-check"></i> <span style="color:#C084FC; font-weight:700;">Mở khoá Filter màu độc quyền</span></li>
            <li><i class="fa-solid fa-shield-halved" style="color:#10B981;"></i> <b>Bảo vệ DNS chống rụng tự động</b></li>
          </ul>
          <a href="gold.html?plan=${key}" class="btn-card-action">
            <span>Nâng Cấp Gói ${formattedPrice}</span>
            <i class="fa-solid fa-arrow-right"></i>
          </a>
        </div>
      `;
    }).join('');
  }

  // 2. Render trên trang nâng cấp gold.html
  const goldGrid = document.getElementById('gold-plans-grid');
  if (goldGrid && typeof window.selectPlan === 'function') {
    let currentSelectedKey = 'lifetime';
    try {
      const pUrl = new URLSearchParams(window.location.search).get('plan');
      if (pUrl && plans[pUrl]) currentSelectedKey = pUrl;
    } catch (e) { }

    goldGrid.innerHTML = planKeys.map((key) => {
      const p = plans[key];
      const isLifetime = key.includes('life') || key.includes('vinhvien');
      const is5m = key === '5m';
      const formattedPrice = p.formattedPrice || (Number(p.price || 0).toLocaleString('vi-VN') + 'đ');
      const activeClass = (key === currentSelectedKey) ? 'active' : '';

      return `
        <div class="plan-card ${activeClass}" id="plan-card-${key}"
          onclick="selectPlan(this, '${p.name.replace(/'/g, "\\'")}', ${p.price}, '${formattedPrice}', '${key}')">
          <div class="plan-select-indicator"><i class="fa-solid fa-check"></i></div>
          <div class="plan-badge" style="${is5m ? 'background:#EC4899; color:#fff;' : ''}">
            <i class="fa-solid fa-crown"></i> ${p.badge || 'VIP'}
          </div>
          <div class="plan-header">${p.name}</div>
          <div class="plan-price">${formattedPrice} <small>${p.unit || ''}</small></div>
          <ul class="plan-features-mini">
            <li><i class="fa-solid fa-check"></i> Mở khoá Locket Gold chính chủ</li>
            <li><i class="fa-solid fa-check"></i> Không quảng cáo làm phiền</li>
            <li><i class="fa-solid fa-check"></i> Upload ảnh / video từ thư viện</li>
            <li><i class="fa-solid fa-check"></i> <span class="text-highlight-video">Quay video Locket 30 giây</span></li>
            <li><i class="fa-solid fa-check"></i> Thay đổi icon Locket độc quyền</li>
            <li><i class="fa-solid fa-check"></i> <span class="text-highlight-caption">Thêm caption hot trend, thú vị</span></li>
            <li><i class="fa-solid fa-check"></i> Mở khoá giới hạn bạn bè &amp; Thêm âm thanh</li>
            <li><i class="fa-solid fa-check"></i> <span style="color:#C084FC; font-weight:700;">Filter màu độc quyền</span></li>
            <li><i class="fa-solid fa-shield-halved" style="color:#10B981;"></i> <b>${p.description || 'Tường Lửa Chống Rụng Tự Động'}</b></li>
          </ul>
        </div>
      `;
    }).join('');
  }
}

// 1. Áp dụng ngay cài đặt từ cache localStorage (Zero delay)
try {
  const cachedStr = localStorage.getItem('locket_vip_settings');
  if (cachedStr) {
    const cachedSettings = JSON.parse(cachedStr);
    applyGlobalSettings(cachedSettings);
  }
} catch (e) { }

// 2. Fetch cài đặt mới nhất từ API và cập nhật DOM
async function syncSettingsFromServer() {
  try {
    const res = await fetch('/api/settings');
    if (res.ok) {
      const data = await res.json();
      if (data.ok) {
        localStorage.setItem('locket_vip_settings', JSON.stringify(data));
        applyGlobalSettings(data);
      }
    }
  } catch (e) { }
}

// Đồng bộ ngay và đồng bộ lại khi DOM sẵn sàng
syncSettingsFromServer();
document.addEventListener('DOMContentLoaded', () => {
  syncSettingsFromServer();
});

// Đưa config vào window để sử dụng toàn cầu
if (typeof window !== 'undefined') {
  window.TO_CAM_CONFIG = TO_CAM_CONFIG;
  window.applyGlobalSettings = applyGlobalSettings;
  window.renderDynamicPlans = renderDynamicPlans;
}
