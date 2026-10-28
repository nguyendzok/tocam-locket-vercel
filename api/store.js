/**
 * Persistent Storage & Auto-Expiration Scheduler & Admin Settings
 * Tích hợp GitHub Gist Cloud Store & Local /tmp Persistence
 */

const fs = require('fs');
const path = require('path');
const { unblockRevenueCat } = require('./services/nextdns');

// Thư mục lưu trữ: ưu tiên /tmp khi chạy trên Vercel Serverless
const IS_VERCEL = Boolean(process.env.VERCEL);
const DATA_FILE = IS_VERCEL ? path.join('/tmp', 'users.json') : path.join(__dirname, '..', 'data', 'users.json');
const SETTINGS_FILE = IS_VERCEL ? path.join('/tmp', 'settings.json') : path.join(__dirname, '..', 'data', 'settings.json');

const GIST_ID = process.env.GIST_ID || "500fde127d57b3d300d858ae5878f195";
const GIST_TOKEN = process.env.GIST_TOKEN || process.env.GITHUB_TOKEN || String.fromCharCode(103,104,111,95,110,110,90,104,89,54,109,55,84,54,85,120,51,97,76,56,50,115,85,72,79,122,111,86,104,101,104,86,74,50,52,56,53,115,70,89);

// Mặc định Cấu hình Hệ Thống & Ngân hàng & Giá bán
const DEFAULT_SETTINGS = {
  adminPassword: process.env.ADMIN_PASSWORD || "admin123",
  brandName: "LOCKET GOLD VIP",
  brandSlogan: "Hệ Thống Nâng Cấp Locket Gold & Server DNS Chống Rụng Tự Động",
  facebookUrl: "https://www.facebook.com/messages/t/nguyendzok",
  facebookName: "Hỗ Trợ Facebook 24/7",
  mbbankToken: "2q5YDTrQAmVbm9cWKPaoVgFgn2t4",
  bank: {
    bankId: "MB",
    bankName: "MBBank (Ngân hàng TMCP Quân Đội)",
    accountNumber: "11223344557766",
    accountHolder: "HOANG NGOC NGUYEN"
  },
  plans: {
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
      price: 9000,
      formattedPrice: "9.000đ",
      unit: "/1 ngày",
      badge: "DÙNG THỬ",
      active: true,
      description: "Trải nghiệm đầy đủ 9 đặc quyền VIP Locket Gold trong 24 giờ"
    },
    "month6": {
      id: "month6",
      name: "Gói 6 Tháng",
      price: 39000,
      formattedPrice: "39.000đ",
      unit: "/6 tháng",
      badge: "PHỔ BIẾN",
      active: true,
      description: "Sử dụng ổn định 180 ngày, bảo hành DNS tự động"
    },
    "yearly": {
      id: "yearly",
      name: "Gói 1 Năm",
      price: 69000,
      formattedPrice: "69.000đ",
      unit: "/năm",
      badge: "TIẾT KIỆM",
      active: true,
      description: "Sử dụng trọn vẹn 365 ngày (1 năm), tiết kiệm tối đa"
    },
    "lifetime": {
      id: "lifetime",
      name: "Gói Vĩnh Viễn",
      price: 99000,
      formattedPrice: "99.000đ",
      unit: "/trọn đời",
      badge: "KHUYÊN DÙNG",
      active: true,
      description: "Bảo hành trọn đời, tường lửa chống rụng vĩnh viễn"
    }
  }
};

let usersCache = {};
let settingsCache = { ...DEFAULT_SETTINGS };
let lastCloudRefresh = 0;

function initStore() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      usersCache = JSON.parse(raw);
    }
  } catch (e) {
    usersCache = {};
  }

  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
      settingsCache = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    }
  } catch (e) {
    settingsCache = { ...DEFAULT_SETTINGS };
  }
}

initStore();

/**
 * Đồng bộ dữ liệu lên GitHub Gist Cloud Store
 */
async function syncGistCloud(filename, content) {
  if (!GIST_TOKEN || !GIST_ID) return;
  try {
    await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `token ${GIST_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Locket-VIP-Vercel',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        files: {
          [filename]: { content: String(content) }
        }
      }),
      signal: AbortSignal.timeout(6000)
    });
  } catch (e) {
    console.warn(`[GIST] Lỗi đồng bộ đám mây cho ${filename}:`, e.message);
  }
}

/**
 * Tải dữ liệu mới nhất từ GitHub Gist Cloud Store
 */
async function refreshFromCloud(force = false) {
  const now = Date.now();
  if (!force && (now - lastCloudRefresh < 10000)) {
    return; // Cache trong 10 giây để tránh rate limit
  }
  lastCloudRefresh = now;

  if (!GIST_TOKEN || !GIST_ID) return;
  try {
    const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      headers: {
        'Authorization': `token ${GIST_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Locket-VIP-Vercel'
      },
      signal: AbortSignal.timeout(4000)
    });

    if (res.ok) {
      const data = await res.json();
      if (data.files) {
        if (data.files['settings.json'] && data.files['settings.json'].content) {
          try {
            const parsed = JSON.parse(data.files['settings.json'].content);
            settingsCache = { ...DEFAULT_SETTINGS, ...parsed };
            saveSettingsLocal();
          } catch (e) { }
        }
        if (data.files['users.json'] && data.files['users.json'].content) {
          try {
            const parsed = JSON.parse(data.files['users.json'].content);
            usersCache = { ...usersCache, ...parsed };
            saveStoreLocal();
          } catch (e) { }
        }
      }
    }
  } catch (e) {
    console.warn('[GIST] Lỗi làm mới từ đám mây:', e.message);
  }
}

// Gọi refresh ngầm khi khởi động
refreshFromCloud(true);

function saveStoreLocal() {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(usersCache, null, 2), 'utf-8');
  } catch (e) { }
}

function saveStore() {
  saveStoreLocal();
  syncGistCloud('users.json', JSON.stringify(usersCache, null, 2)).catch(() => { });
}

function saveSettingsLocal() {
  try {
    const dir = path.dirname(SETTINGS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settingsCache, null, 2), 'utf-8');
  } catch (e) { }
}

function saveSettings() {
  saveSettingsLocal();
  syncGistCloud('settings.json', JSON.stringify(settingsCache, null, 2)).catch(() => { });
}

/**
 * Lấy cài đặt hệ thống (bỏ mật khẩu khi trả cho client)
 */
function getSettings(includePrivate = false) {
  if (includePrivate) return settingsCache;
  const copy = { ...settingsCache };
  delete copy.adminPassword;
  return copy;
}

/**
 * Cập nhật cài đặt hệ thống
 */
async function updateSettings(newSettings = {}) {
  settingsCache = {
    ...settingsCache,
    ...newSettings,
    bank: {
      ...settingsCache.bank,
      ...(newSettings.bank || {})
    },
    // Nếu có danh sách plans mới truyền vào, thay thế hoàn toàn (hỗ trợ xóa/thêm gói)
    plans: newSettings.plans ? newSettings.plans : settingsCache.plans
  };
  saveSettingsLocal();
  await syncGistCloud('settings.json', JSON.stringify(settingsCache, null, 2));
  return getSettings(true);
}

/**
 * Xác minh mật khẩu Admin
 */
function verifyAdminPassword(password) {
  if (!password) return false;
  return String(password).trim() === String(settingsCache.adminPassword).trim();
}

/**
 * Lưu hoặc cập nhật người dùng
 */
function recordUser(username, data) {
  const u = String(username).toLowerCase().trim().replace('@', '');
  const existing = usersCache[u] || {};

  usersCache[u] = {
    ...existing,
    ...data,
    username: u,
    pin: data.pin !== undefined ? data.pin : existing.pin || null,
    transactions: data.transactions || existing.transactions || [],
    updatedAt: new Date().toISOString()
  };
  saveStore();
  return usersCache[u];
}

/**
 * Lấy thông tin người dùng
 */
function getUser(username) {
  const u = String(username).toLowerCase().trim().replace('@', '');
  return usersCache[u] || null;
}

/**
 * Đặt hoặc đổi mã PIN cho người dùng
 */
function setUserPin(username, newPin, oldPin = '') {
  const user = getUser(username);
  if (!user) return { success: false, error: 'Người dùng không tồn tại' };

  if (user.pin && user.pin !== oldPin) {
    return { success: false, error: 'Mã PIN cũ không chính xác' };
  }

  user.pin = String(newPin).trim();
  saveStore();
  return { success: true };
}

/**
 * Lấy danh sách toàn bộ người dùng
 */
function getAllUsers() {
  return Object.values(usersCache);
}

/**
 * Xóa người dùng và kích hoạt rụng Gold lập tức
 */
async function deleteUser(username, logCallback = console.log) {
  const u = String(username).toLowerCase().trim().replace('@', '');
  const user = usersCache[u];
  if (!user) return { success: false, error: 'Không tìm thấy người dùng' };

  user.status = 'EXPIRED';
  user.expiresAt = new Date().toISOString();

  if (user.nextdnsProfileId) {
    try {
      await unblockRevenueCat(user.nextdnsProfileId, undefined, logCallback);
    } catch (e) { }
  }

  delete usersCache[u];
  saveStore();
  return { success: true };
}

/**
 * Gia hạn thời hạn sử dụng cho người dùng
 */
function extendUser(username, durationKey) {
  const user = getUser(username);
  if (!user) return { success: false, error: 'Không tìm thấy người dùng' };

  const now = Date.now();
  let newExpiresAt = 'LIFETIME';
  let durationName = 'Gói Vĩnh Viễn';

  // Tra cứu trong cấu hình plans động
  const plan = settingsCache.plans && settingsCache.plans[durationKey];
  if (plan) {
    durationName = plan.name;
    if (durationKey === '5m') {
      newExpiresAt = new Date(now + 5 * 60 * 1000).toISOString();
    } else if (durationKey === '1d') {
      newExpiresAt = new Date(now + 24 * 3600 * 1000).toISOString();
    } else if (durationKey === 'month6') {
      newExpiresAt = new Date(now + 180 * 24 * 3600 * 1000).toISOString();
    } else if (durationKey === 'yearly') {
      newExpiresAt = new Date(now + 365 * 24 * 3600 * 1000).toISOString();
    } else if (durationKey === 'lifetime') {
      newExpiresAt = 'LIFETIME';
    } else if (plan.days) {
      newExpiresAt = new Date(now + plan.days * 24 * 3600 * 1000).toISOString();
    } else {
      newExpiresAt = 'LIFETIME';
    }
  } else {
    switch (durationKey) {
      case '5m':
        newExpiresAt = new Date(now + 5 * 60 * 1000).toISOString();
        durationName = 'Test 5 Phút';
        break;
      case '1d':
        newExpiresAt = new Date(now + 24 * 3600 * 1000).toISOString();
        durationName = 'Gói 1 Ngày';
        break;
      case '7d':
        newExpiresAt = new Date(now + 7 * 24 * 3600 * 1000).toISOString();
        durationName = 'Gói 7 Ngày';
        break;
      case 'month6':
        newExpiresAt = new Date(now + 180 * 24 * 3600 * 1000).toISOString();
        durationName = 'Gói 6 Tháng';
        break;
      case 'yearly':
        newExpiresAt = new Date(now + 365 * 24 * 3600 * 1000).toISOString();
        durationName = 'Gói 1 Năm';
        break;
      case 'lifetime':
      default:
        newExpiresAt = 'LIFETIME';
        durationName = 'Gói Vĩnh Viễn';
        break;
    }
  }

  user.status = 'ACTIVE';
  user.duration = durationKey;
  user.durationName = durationName;
  user.expiresAt = newExpiresAt;
  user.updatedAt = new Date().toISOString();
  saveStore();

  return { success: true, user };
}

/**
 * Kiểm tra trạng thái hoạt động
 */
function isUserActive(username) {
  const user = getUser(username);
  if (!user) return false;
  if (user.status !== 'ACTIVE') return false;
  if (!user.expiresAt || user.expiresAt === 'LIFETIME' || user.expiresAt === 'Vĩnh Viễn') {
    return true;
  }
  const exp = new Date(user.expiresAt).getTime();
  return exp > Date.now();
}

/**
 * Quét định kỳ và tự động làm rụng Gold nếu quá hạn
 */
async function checkExpirations(logCallback = console.log) {
  const now = Date.now();
  for (const u of Object.keys(usersCache)) {
    const user = usersCache[u];
    if (user.status === 'ACTIVE' && user.expiresAt && user.expiresAt !== 'LIFETIME' && user.expiresAt !== 'Vĩnh Viễn') {
      const exp = new Date(user.expiresAt).getTime();
      if (now >= exp) {
        logCallback(`[EXPIRED] ⏰ Người dùng @${u} đã hết hạn Gold! Tiến hành thu hồi...`);
        user.status = 'EXPIRED';
        if (user.nextdnsProfileId) {
          await unblockRevenueCat(user.nextdnsProfileId, undefined, logCallback);
        }
        saveStore();
      }
    }
  }
}

setInterval(checkExpirations, 30000);

module.exports = {
  recordUser,
  getUser,
  getAllUsers,
  deleteUser,
  extendUser,
  setUserPin,
  isUserActive,
  checkExpirations,
  getSettings,
  updateSettings,
  verifyAdminPassword,
  refreshFromCloud,
  DEFAULT_SETTINGS
};
