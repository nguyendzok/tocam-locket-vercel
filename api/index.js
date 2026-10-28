/**
 * LOCKET GOLD VIP - Production Gateway & DNS Management Server
 * Hỗ trợ DoH Serverless RFC 8484 (iOS .mobileconfig) & Android Private DNS DoT
 * Tự động rụng Gold khi hết hạn, tích hợp MBBank VietQR tự động & Admin Dashboard
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const { resolveLocketUser } = require('./services/resolver');
const { injectGold, checkStatus } = require('./services/revenuecat');
const { createProfile, unblockRevenueCat } = require('./services/nextdns');
const {
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
  refreshFromCloud
} = require('./store');
const { handleDohRequest } = require('./dns-query');
const { fetchMbbankHistory, checkPaymentForUser } = require('./services/mbbank');

const app = express();
app.disable('x-powered-by');

app.use(cors());

// Raw body parser for RFC 8484 DNS POST requests
app.use(express.raw({ type: 'application/dns-message', limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files (public)
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
app.use(express.static(PUBLIC_DIR));
app.use('/css', express.static(path.join(PUBLIC_DIR, 'css')));
app.use('/js', express.static(path.join(PUBLIC_DIR, 'js')));
app.use('/images', express.static(path.join(PUBLIC_DIR, 'images')));

// Root, Gold & Admin pages
app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.get(['/gold', '/gold.html'], (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'gold.html'));
});

app.get(['/admin', '/admin.html'], (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'admin.html'));
});

app.get('/health', (req, res) => {
  const settings = getSettings();
  res.json({
    status: 'ok',
    brand: settings.brandName,
    service: 'Locket Gold VIP Gateway & DNS Controller',
    time: new Date().toISOString()
  });
});

// ============================================================
// 1. CẤU HÌNH HỆ THỐNG CÔNG KHAI (PUBLIC SETTINGS)
// ============================================================
app.get('/api/settings', async (req, res) => {
  await refreshFromCloud();
  const settings = getSettings();
  res.json({
    ok: true,
    brandName: settings.brandName,
    brandSlogan: settings.brandSlogan,
    facebookUrl: settings.facebookUrl,
    facebookName: settings.facebookName,
    bank: settings.bank,
    plans: settings.plans
  });
});

// ============================================================
// 2. PHÂN GIẢI USERNAME -> UID, AVATAR & TRẠNG THÁI GOLD/FREE
// ============================================================
async function handleResolveUser(rawInput) {
  const { uid, avatarUrl, username: cleanUser } = await resolveLocketUser(rawInput);
  if (!uid) {
    return { success: false, error: 'Không tìm thấy tài khoản Locket này!' };
  }

  const existing = getUser(cleanUser);
  const status = await checkStatus(uid);
  const isGoldActive = Boolean(status?.active || isUserActive(cleanUser));
  const expiresDate = status?.expires || existing?.expiresAt || null;

  return {
    success: true,
    uid,
    avatarUrl: avatarUrl || existing?.avatarUrl || null,
    username: cleanUser,
    isGoldActive,
    expires: expiresDate,
    data: {
      uid,
      avatarUrl: avatarUrl || existing?.avatarUrl || null,
      username: cleanUser,
      active: isGoldActive,
      status: isGoldActive ? 'ACTIVE' : 'INACTIVE',
      isGold: isGoldActive,
      expiresDate: expiresDate,
      planName: existing?.durationName || (isGoldActive ? 'Locket Gold VIP' : 'Locket Free'),
      found: true
    }
  };
}

app.post('/api/resolve', async (req, res) => {
  const { username } = req.body || {};
  if (!username) {
    return res.status(400).json({ success: false, error: 'Thiếu username Locket' });
  }
  const result = await handleResolveUser(username);
  if (!result.success) return res.status(404).json(result);
  res.json(result);
});

app.get('/api/resolve', async (req, res) => {
  const username = req.query.username || req.query.u;
  if (!username) {
    return res.status(400).json({ success: false, error: 'Thiếu username Locket' });
  }
  const result = await handleResolveUser(username);
  if (!result.success) return res.status(404).json(result);
  res.json(result);
});

// Tương thích ngược với frontend Locket
app.get('/api/locket/uid/check', async (req, res) => {
  const username = req.query.username || req.query.u;
  if (!username) {
    return res.status(400).json({ ok: false, message: 'Thiếu username Locket' });
  }
  const result = await handleResolveUser(username);
  if (!result.success) {
    return res.status(404).json({ ok: false, message: result.error });
  }
  res.json({
    ok: true,
    data: result.data
  });
});

// ============================================================
// 3. TỰ ĐỘNG KIỂM TRA THANH TOÁN QUA MBBANK (POLLING)
// ============================================================
async function handleCheckPayment(req, res) {
  const username = req.query.username || req.query.u || req.body?.username;
  const amount = parseInt(req.query.amount || req.body?.amount || '0', 10);
  const settings = getSettings(true);

  if (!username) {
    return res.status(400).json({ paid: false, error: 'Thiếu username' });
  }

  const cleanUser = String(username).toLowerCase().replace(/[@\s]/g, '').trim();

  try {
    const paymentCheck = await checkPaymentForUser(cleanUser, amount, settings.mbbankToken, 120);

    if (paymentCheck.found) {
      // Nếu đã thanh toán, kiểm tra xem user đã được kích hoạt Gold chưa
      let user = getUser(cleanUser);
      if (!user || user.status !== 'ACTIVE') {
        // Tự động kích hoạt Locket Gold cho user
        const resolved = await resolveLocketUser(cleanUser);
        if (resolved.uid) {
          await injectGold(resolved.uid);
          const host = req.get('host') || 'localhost:3000';
          const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
          const vercelDohUrl = `${protocol}://${host}/api/dns-query?u=${encodeURIComponent(cleanUser)}&exp=lifetime`;

          user = recordUser(cleanUser, {
            uid: resolved.uid,
            avatarUrl: resolved.avatarUrl,
            status: 'ACTIVE',
            duration: 'lifetime',
            durationName: 'Gói Vĩnh Viễn',
            activatedAt: new Date().toISOString(),
            expiresAt: 'LIFETIME',
            expParam: 'lifetime',
            dnsMode: 'vercel_doh',
            vercelDohUrl,
            transactions: [paymentCheck.transaction]
          });
        }
      }

      return res.json({
        paid: true,
        transaction: paymentCheck.transaction,
        locketStatus: 'ACTIVE',
        user
      });
    }

    return res.json({ paid: false });
  } catch (err) {
    console.error('[CHECK-PAYMENT] Lỗi kiểm tra thanh toán:', err.message);
    return res.json({ paid: false, error: err.message });
  }
}

app.all(['/check-payment', '/api/check-payment'], handleCheckPayment);

// ============================================================
// 4. KÍCH HOẠT LOCKET GOLD & TẠO CẤU HÌNH DNS TỐI ƯU
// ============================================================
app.post('/api/activate', async (req, res) => {
  const { username, uid: reqUid, duration: reqDuration, plan } = req.body || {};
  if (!username) {
    return res.status(400).json({ success: false, error: 'Thiếu username' });
  }

  let uid = reqUid;
  let avatarUrl = null;
  if (!uid) {
    const resolved = await resolveLocketUser(username);
    uid = resolved.uid;
    avatarUrl = resolved.avatarUrl;
  }

  if (!uid) {
    return res.status(404).json({ success: false, error: 'Không tìm thấy UID tài khoản Locket!' });
  }

  const cleanUser = String(username).toLowerCase().trim().replace('@', '');
  const logs = [];
  const logCallback = (msg) => {
    console.log(`[ACTIVATE] ${msg}`);
    logs.push(msg);
  };

  // 1. Nạp biên lai StoreKit vào RevenueCat
  logCallback(`[*] Kích hoạt Gold cho UID: ${uid}...`);
  const injectResult = await injectGold(uid, logCallback);
  if (!injectResult.success) {
    return res.status(500).json({
      success: false,
      error: injectResult.message || 'Kích hoạt thất bại',
      logs
    });
  }

  // 2. Tính toán ngày hết hạn
  const durationKey = (reqDuration || plan || 'lifetime').toLowerCase();
  const now = Date.now();
  let expiresAt = null;
  let durationName = 'Gói Vĩnh Viễn';

  switch (durationKey) {
    case '5m':
    case '5min':
    case 'test5m':
      expiresAt = new Date(now + 5 * 60 * 1000).toISOString();
      durationName = 'Test 5 Phút';
      break;
    case '1d':
    case 'test':
    case 'day1':
      expiresAt = new Date(now + 24 * 3600 * 1000).toISOString();
      durationName = 'Gói 1 Ngày';
      break;
    case '7d':
    case 'week':
      expiresAt = new Date(now + 7 * 24 * 3600 * 1000).toISOString();
      durationName = 'Gói 7 Ngày';
      break;
    case 'month6':
    case '180d':
      expiresAt = new Date(now + 180 * 24 * 3600 * 1000).toISOString();
      durationName = 'Gói 6 Tháng';
      break;
    case 'yearly':
    case 'year1':
    case '365d':
      expiresAt = new Date(now + 365 * 24 * 3600 * 1000).toISOString();
      durationName = 'Gói 1 Năm';
      break;
    case 'lifetime':
    default:
      expiresAt = 'LIFETIME';
      durationName = 'Gói Vĩnh Viễn';
      break;
  }

  // 3. Khởi tạo cấu hình DNS thống nhất: hỗ trợ cả iOS và Android
  const host = req.get('host') || 'localhost:3000';
  const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';

  let expParam = 'lifetime';
  if (expiresAt && expiresAt !== 'LIFETIME') {
    expParam = Math.floor(new Date(expiresAt).getTime() / 1000);
  }

  const vercelDohUrl = `${protocol}://${host}/api/dns-query?u=${encodeURIComponent(cleanUser)}&exp=${expParam}`;
  const mobileconfigUrl = `${protocol}://${host}/api/profile/download?u=${encodeURIComponent(cleanUser)}&exp=${expParam}`;

  // NextDNS profile riêng biệt cho Android DoT
  let nextdnsData = null;
  try {
    nextdnsData = await createProfile(undefined, cleanUser, logCallback);
  } catch (e) {
    logCallback(`[!] NextDNS tạo profile lỗi, dùng DoH fallback: ${e.message}`);
  }

  const dotHost = nextdnsData?.dotHost || `${cleanUser}.dns.locketvip.online`;

  // 4. Lưu hồ sơ người dùng
  const userRecord = recordUser(cleanUser, {
    uid,
    avatarUrl,
    status: 'ACTIVE',
    duration: durationKey,
    durationName,
    activatedAt: new Date().toISOString(),
    expiresAt,
    expParam,
    nextdnsProfileId: nextdnsData?.profileId || null,
    nextdnsSetupUrl: nextdnsData?.setupUrl || null,
    nextdnsDotHost: dotHost,
    vercelDohUrl,
    mobileconfigUrl
  });

  res.json({
    success: true,
    message: 'Kích hoạt Locket Gold VIP thành công!',
    user: userRecord,
    logs,
    dns: {
      vercelDohUrl,
      mobileconfigUrl,
      androidDot: dotHost,
      iosSetupUrl: nextdnsData?.setupUrl || null
    }
  });
});

// ============================================================
// 5. TẢI HỒ SƠ CẤU HÌNH .mobileconfig (iOS 1-CHẠM)
// ============================================================
app.all(['/api/profile/download', '/api/locket/profile/download'], (req, res) => {
  const username = (req.query.u || req.query.username || req.body?.username || req.body?.uid || 'VIP').replace('@', '').trim();
  const exp = req.query.exp || 'lifetime';
  const host = req.get('host') || 'localhost:3000';
  const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
  const dohUrl = `${protocol}://${host}/api/dns-query?u=${encodeURIComponent(username)}&exp=${encodeURIComponent(exp)}`;

  const mobileconfigXml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>DNSSettings</key>
      <dict>
        <key>DNSProtocol</key>
        <string>HTTPS</string>
        <key>ServerURL</key>
        <string>${dohUrl}</string>
      </dict>
      <key>PayloadDescription</key>
      <string>Cấu hình DNS DoH Locket Gold VIP cho @${username}</string>
      <key>PayloadDisplayName</key>
      <string>LOCKET GOLD VIP DNS - @${username}</string>
      <key>PayloadIdentifier</key>
      <string>vip.locketgold.dns.settings.${Date.now()}</string>
      <key>PayloadType</key>
      <string>com.apple.dnsSettings.managed</string>
      <key>PayloadUUID</key>
      <string>8A9C2B10-4D5E-4F6A-9B8C-1D2E3F4A5B6C</string>
      <key>PayloadVersion</key>
      <integer>1</integer>
    </dict>
  </array>
  <key>PayloadDescription</key>
  <string>Hồ sơ bảo vệ Locket Gold VIP DoH Serverless cho @${username}</string>
  <key>PayloadDisplayName</key>
  <string>👑 LOCKET GOLD VIP (@${username})</string>
  <key>PayloadIdentifier</key>
  <string>vip.locketgold.profile</string>
  <key>PayloadOrganization</key>
  <string>LOCKET GOLD VIP</string>
  <key>PayloadRemovalDisallowed</key>
  <false/>
  <key>PayloadType</key>
  <string>Configuration</string>
  <key>PayloadUUID</key>
  <string>1F2E3D4C-5B6A-4789-8A9B-0C1D2E3F4A5B</string>
  <key>PayloadVersion</key>
  <integer>1</integer>
</dict>
</plist>`;

  res.setHeader('Content-Type', 'application/x-apple-aspen-config');
  res.setHeader('Content-Disposition', `attachment; filename="LocketGold_VIP_${username}.mobileconfig"`);
  res.send(Buffer.from(mobileconfigXml, 'utf-8'));
});

// ============================================================
// 6. SERVERLESS DoH (DNS-OVER-HTTPS) RESOLVER ENDPOINT
// ============================================================
app.all(['/api/dns-query', '/dns-query'], handleDohRequest);

// ============================================================
// 7. TRA CỨU HỒ SƠ DNS & LỊCH SỬ GIAO DỊCH MBBANK
// ============================================================
app.post('/api/user/lookup', async (req, res) => {
  const { username, pin } = req.body || {};
  if (!username) {
    return res.status(400).json({ ok: false, message: 'Vui lòng nhập Username Locket!' });
  }

  const cleanUser = String(username).toLowerCase().replace(/[@\s]/g, '').trim();
  const existingUser = getUser(cleanUser);
  const settings = getSettings(true);

  // Kiểm tra mã PIN nếu người dùng đã thiết lập
  if (existingUser && existingUser.pin) {
    if (!pin) {
      return res.json({ ok: false, requirePin: true });
    }
    if (String(pin).trim() !== String(existingUser.pin).trim()) {
      return res.json({ ok: false, wrongPin: true });
    }
  }

  // Tra cứu thông tin tài khoản Locket (UID, Avatar)
  const resolved = await resolveLocketUser(cleanUser);
  const uid = resolved.uid || existingUser?.uid || null;

  if (!uid && !existingUser) {
    return res.status(404).json({
      ok: false,
      notFound: true,
      message: `Không tìm thấy tài khoản @${cleanUser} trên hệ thống Locket!`
    });
  }

  // Kiểm tra trạng thái gói Locket Gold thực tế trên RevenueCat
  let status = null;
  if (uid) {
    status = await checkStatus(uid);
  }
  const isGoldActive = Boolean(status?.active || isUserActive(cleanUser));
  const expiresAt = existingUser?.expiresAt || status?.expires || (isGoldActive ? 'LIFETIME' : null);

  // Lấy lịch sử giao dịch thực tế từ MBBank theo username
  let history = [];
  try {
    const allTxs = await fetchMbbankHistory(settings.mbbankToken);
    const userTxs = allTxs.filter(tx => {
      const desc = String(tx.description || '').toLowerCase().replace(/[@\s]/g, '');
      return desc.includes(cleanUser);
    });

    history = userTxs.map(tx => ({
      id: tx.id || tx.reference,
      time: tx.bookingDate || tx.valueDate || new Date().toISOString(),
      amount: tx.amount,
      plan: existingUser?.duration?.toUpperCase() || 'LIFETIME',
      description: tx.description
    }));
  } catch (e) {
    console.warn('[LOOKUP] Không lấy được lịch sử MBBank:', e.message);
  }

  // Nếu trong store có lưu giao dịch mà MBBank API chưa có
  if (existingUser?.transactions && existingUser.transactions.length > 0) {
    for (const tx of existingUser.transactions) {
      if (!history.find(h => h.id === tx.id)) {
        history.unshift({
          id: tx.id || tx.reference,
          time: tx.date || new Date().toISOString(),
          amount: tx.amount,
          plan: existingUser.duration?.toUpperCase() || 'LIFETIME',
          description: tx.description
        });
      }
    }
  }

  const host = req.get('host') || 'localhost:3000';
  const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
  const expParam = existingUser?.expParam || 'lifetime';
  const dnsDownloadUrl = `${protocol}://${host}/api/profile/download?u=${encodeURIComponent(cleanUser)}&exp=${expParam}`;
  const dotHost = existingUser?.nextdnsDotHost || `${cleanUser}.dns.locketvip.online`;

  let currentPlan = 'FREE';
  if (existingUser?.duration) {
    currentPlan = existingUser.duration.toUpperCase();
  } else if (isGoldActive) {
    currentPlan = 'LIFETIME';
  }

  return res.json({
    ok: true,
    user: {
      username: cleanUser,
      uid,
      avatarUrl: resolved.avatarUrl || existingUser?.avatarUrl || null,
      currentPlan,
      status: isGoldActive ? 'ACTIVE' : (existingUser?.status || 'INACTIVE'),
      expiresAt: expiresAt === 'LIFETIME' ? 'Vĩnh Viễn' : expiresAt,
      isGold: isGoldActive,
      dnsDownloadUrl,
      dotHost,
      hasPin: Boolean(existingUser?.pin),
      history
    }
  });
});

// Đặt hoặc cập nhật mã PIN cá nhân
app.post('/api/user/set-pin', (req, res) => {
  const { username, newPin, oldPin } = req.body || {};
  if (!username || !newPin) {
    return res.status(400).json({ ok: false, message: 'Thiếu username hoặc mã PIN mới' });
  }
  const result = setUserPin(username, newPin, oldPin);
  if (!result.success) {
    return res.status(400).json({ ok: false, message: result.error });
  }
  res.json({ ok: true, message: 'Đã cập nhật mã PIN bảo mật thành công!' });
});

// ============================================================
// 8. HỆ THỐNG QUẢN TRỊ ADMIN (ADMIN DASHBOARD API)
// ============================================================
function requireAdminAuth(req, res, next) {
  const token = req.headers['x-admin-token'] || req.headers['authorization']?.replace('Bearer ', '') || req.query.admin_token;
  if (!verifyAdminPassword(token)) {
    return res.status(401).json({ success: false, error: 'Sai mật khẩu quản trị hoặc phiên đã hết hạn' });
  }
  next();
}

// Đăng nhập Admin
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};
  if (verifyAdminPassword(password)) {
    return res.json({ success: true, token: password });
  }
  return res.status(401).json({ success: false, message: 'Mật khẩu quản trị không chính xác' });
});

// Lấy toàn bộ dữ liệu quản trị (Thống kê, Users, Settings)
app.get('/api/admin/data', requireAdminAuth, async (req, res) => {
  await refreshFromCloud(true);
  const allUsers = getAllUsers();
  const settings = getSettings(true);
  const activeCount = allUsers.filter(u => u.status === 'ACTIVE' && isUserActive(u.username)).length;
  const expiredCount = allUsers.length - activeCount;

  res.json({
    success: true,
    stats: {
      totalUsers: allUsers.length,
      activeUsers: activeCount,
      expiredUsers: expiredCount
    },
    users: allUsers,
    settings
  });
});

// Cập nhật Cài đặt Admin (Giá bán, Ngân hàng, MBBank Token, Facebook, Đổi pass)
app.post('/api/admin/settings', requireAdminAuth, async (req, res) => {
  const newSettings = req.body || {};
  const updated = await updateSettings(newSettings);
  res.json({ success: true, message: 'Đã lưu cấu hình thành công!', settings: updated });
});

// Xóa hoặc thu hồi ngay một DNS User (Làm rụng Gold lập tức)
app.post('/api/admin/user/delete', requireAdminAuth, async (req, res) => {
  const { username } = req.body || {};
  if (!username) return res.status(400).json({ success: false, error: 'Thiếu username' });

  const result = await deleteUser(username);
  if (!result.success) {
    return res.status(404).json(result);
  }
  res.json({ success: true, message: `Đã xóa và thu hồi DNS của @${username} thành công!` });
});

// Gia hạn thời gian sử dụng cho User
app.post('/api/admin/user/extend', requireAdminAuth, (req, res) => {
  const { username, duration } = req.body || {};
  if (!username || !duration) {
    return res.status(400).json({ success: false, error: 'Thiếu username hoặc gói gia hạn' });
  }

  const result = extendUser(username, duration);
  if (!result.success) {
    return res.status(404).json(result);
  }
  res.json({ success: true, message: `Đã gia hạn thành công cho @${username}!`, user: result.user });
});

// Lấy giao dịch thời gian thực từ MBBank
app.get('/api/admin/mbbank-live', requireAdminAuth, async (req, res) => {
  const settings = getSettings(true);
  try {
    const txs = await fetchMbbankHistory(settings.mbbankToken);
    res.json({ success: true, count: txs.length, transactions: txs });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Kích hoạt thủ công một user từ Admin Dashboard
app.post('/api/admin/user/activate-manual', requireAdminAuth, async (req, res) => {
  const { username, duration } = req.body || {};
  if (!username) return res.status(400).json({ success: false, error: 'Thiếu username' });

  const resolved = await resolveLocketUser(username);
  if (!resolved.uid) {
    return res.status(404).json({ success: false, error: 'Không tìm thấy UID trên Locket' });
  }

  await injectGold(resolved.uid);

  const cleanUser = resolved.username || username.toLowerCase().replace(/[@\s]/g, '');
  const host = req.get('host') || 'localhost:3000';
  const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
  const vercelDohUrl = `${protocol}://${host}/api/dns-query?u=${encodeURIComponent(cleanUser)}&exp=lifetime`;
  const mobileconfigUrl = `${protocol}://${host}/api/profile/download?u=${encodeURIComponent(cleanUser)}&exp=lifetime`;

  const user = recordUser(cleanUser, {
    uid: resolved.uid,
    avatarUrl: resolved.avatarUrl,
    status: 'ACTIVE',
    duration: duration || 'lifetime',
    durationName: duration === '1d' ? 'Gói 1 Ngày' : (duration === 'month6' ? 'Gói 6 Tháng' : 'Gói Vĩnh Viễn'),
    activatedAt: new Date().toISOString(),
    expiresAt: duration === '1d' ? new Date(Date.now() + 86400000).toISOString() : 'LIFETIME',
    expParam: duration === '1d' ? Math.floor((Date.now() + 86400000) / 1000) : 'lifetime',
    vercelDohUrl,
    mobileconfigUrl,
    nextdnsDotHost: `${cleanUser}.dns.locketvip.online`
  });

  res.json({ success: true, message: `Đã kích hoạt thành công cho @${cleanUser}`, user });
});

// Khởi chạy khi chạy môi trường Node.js local
const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`
👑 ==========================================================
   LOCKET GOLD VIP GATEWAY & DNS CONTROLLER
   Port: ${PORT}
   Web Portal: http://localhost:${PORT}/gold
   Admin Panel: http://localhost:${PORT}/admin
   DoH Endpoint: http://localhost:${PORT}/api/dns-query
   Health Check: http://localhost:${PORT}/health
==========================================================
    `);
  });
}

// Export cho Vercel Serverless
module.exports = app;
