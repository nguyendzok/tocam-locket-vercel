/**
 * Persistent Storage & Auto-Expiration Scheduler
 */

const fs = require('fs');
const path = require('path');
const { unblockRevenueCat } = require('./services/nextdns');

const DATA_FILE = path.join(__dirname, '..', 'data', 'users.json');

// In-memory cache
let usersCache = {};

function initStore() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      usersCache = JSON.parse(raw);
    }
  } catch (e) {
    usersCache = {};
  }
}

initStore();

function saveStore() {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(usersCache, null, 2), 'utf-8');
  } catch (e) {
    // Read-only filesystem on Vercel serverless is normal; in-memory cache preserves state
  }
}

/**
 * Lưu hoặc cập nhật người dùng
 */
function recordUser(username, data) {
  const u = String(username).toLowerCase().trim();
  usersCache[u] = {
    ...usersCache[u],
    ...data,
    username: u,
    updatedAt: new Date().toISOString()
  };
  saveStore();
  return usersCache[u];
}

/**
 * Lấy thông tin người dùng
 */
function getUser(username) {
  const u = String(username).toLowerCase().trim();
  return usersCache[u] || null;
}

/**
 * Lấy danh sách toàn bộ người dùng
 */
function getAllUsers() {
  return Object.values(usersCache);
}

/**
 * Kiểm tra trạng thái hoạt động: còn hạn hay đã hết hạn
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
        // Nếu user dùng NextDNS -> gọi NextDNS gỡ chặn để Locket rụng Gold
        if (user.nextdnsProfileId) {
          await unblockRevenueCat(user.nextdnsProfileId, undefined, logCallback);
        }
        saveStore();
      }
    }
  }
}

// Chạy kiểm tra mỗi 30 giây khi server chạy local/node
setInterval(checkExpirations, 30000);

module.exports = {
  recordUser,
  getUser,
  getAllUsers,
  isUserActive,
  checkExpirations
};
