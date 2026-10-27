/**
 * Tổ Cam Locket Gold Server & Vercel Serverless Gateway
 * Tích hợp 2 giải pháp DNS:
 * 1. Serverless DoH Gateway trên Vercel (RFC 8484 - Không giới hạn query)
 * 2. NextDNS API Engine (Profile riêng - Tự gỡ chặn khi hết hạn)
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const { resolveLocketUser } = require('./services/resolver');
const { injectGold, checkStatus } = require('./services/revenuecat');
const { createProfile, unblockRevenueCat } = require('./services/nextdns');
const { recordUser, getUser, getAllUsers, isUserActive, checkExpirations } = require('./store');
const { handleDohRequest } = require('./dns-query');

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

// Root & Gold pages
app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.get(['/gold', '/gold.html'], (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'gold.html'));
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Tổ Cam Locket Gold Gateway (NextDNS + Vercel DoH)',
    time: new Date().toISOString()
  });
});

// ============================================================
// 1. API PHÂN GIẢI USERNAME -> UID & AVATAR
// ============================================================
async function handleResolveUser(rawInput) {
  const { uid, avatarUrl, username: cleanUser } = await resolveLocketUser(rawInput);
  if (!uid) {
    return { success: false, error: 'Không tìm thấy tài khoản Locket này!' };
  }

  const existing = getUser(cleanUser);
  const status = await checkStatus(uid);
  const isGoldActive = status.active || isUserActive(cleanUser);

  return {
    success: true,
    uid,
    avatarUrl: avatarUrl || existing?.avatarUrl || null,
    username: cleanUser,
    isGoldActive,
    expires: status.expires || existing?.expiresAt || null,
    data: {
      uid,
      avatarUrl: avatarUrl || existing?.avatarUrl || null,
      username: cleanUser,
      active: isGoldActive,
      status: isGoldActive ? 'ACTIVE' : 'INACTIVE',
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

// Tương thích ngược với frontend cũ của Tổ Cam
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
// 2. API KÍCH HOẠT LOCKET GOLD KÈM CHỌN HẠN DÙNG & DNS
// ============================================================
app.post('/api/activate', async (req, res) => {
  const { username, uid: reqUid, duration: reqDuration, plan, dnsMode } = req.body || {};
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

  // 1. Nạp biên lai StoreKit của Apple vào RevenueCat
  logCallback(`[*] Bắt đầu nạp Gold cho UID: ${uid}...`);
  const injectResult = await injectGold(uid, logCallback);
  if (!injectResult.success) {
    return res.status(500).json({
      success: false,
      error: injectResult.message || 'Kích hoạt thất bại',
      logs
    });
  }

  // 2. Tính toán ngày hết hạn (Duration / Plan)
  const durationKey = (reqDuration || plan || 'lifetime').toLowerCase();
  const now = Date.now();
  let expiresAt = null;
  let durationName = 'Vĩnh Viễn';

  switch (durationKey) {
    case '5m':
    case '5min':
    case 'test5m':
      expiresAt = new Date(now + 5 * 60 * 1000).toISOString();
      durationName = 'Dùng thử 5 phút';
      break;
    case '1d':
    case 'test':
    case 'day1':
      expiresAt = new Date(now + 24 * 3600 * 1000).toISOString();
      durationName = 'Gói 1 Ngày';
      break;
    case '7d':
    case 'week':
    case 'week1':
      expiresAt = new Date(now + 7 * 24 * 3600 * 1000).toISOString();
      durationName = 'Gói 7 Ngày';
      break;
    case '30d':
    case 'month':
    case 'month1':
      expiresAt = new Date(now + 30 * 24 * 3600 * 1000).toISOString();
      durationName = 'Gói 30 Ngày';
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

  // 3. Khởi tạo cấu hình DNS theo phương thức khách chọn
  let nextdnsData = null;
  const host = req.get('host') || 'localhost:3000';
  const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';

  let expParam = 'lifetime';
  if (expiresAt && expiresAt !== 'LIFETIME') {
    expParam = Math.floor(new Date(expiresAt).getTime() / 1000);
  }

  const vercelDohUrl = `${protocol}://${host}/api/dns-query?u=${encodeURIComponent(cleanUser)}&exp=${expParam}`;

  const selectedDns = dnsMode === 'nextdns' ? 'nextdns' : 'vercel_doh';

  if (selectedDns === 'nextdns') {
    nextdnsData = await createProfile(undefined, cleanUser, logCallback);
  }

  // 4. Lưu vào cơ sở dữ liệu
  const userRecord = recordUser(cleanUser, {
    uid,
    avatarUrl,
    status: 'ACTIVE',
    duration: durationKey,
    durationName,
    activatedAt: new Date().toISOString(),
    expiresAt,
    expParam,
    dnsMode: selectedDns,
    nextdnsProfileId: nextdnsData?.profileId || null,
    nextdnsSetupUrl: nextdnsData?.setupUrl || null,
    nextdnsDotHost: nextdnsData?.dotHost || null,
    vercelDohUrl
  });

  res.json({
    success: true,
    message: 'Kích hoạt Locket Gold thành công!',
    user: userRecord,
    logs,
    dns: {
      mode: selectedDns,
      vercelDohUrl,
      mobileconfigUrl: `${protocol}://${host}/api/profile/download?u=${encodeURIComponent(cleanUser)}&exp=${expParam}`,
      androidDot: nextdnsData?.dotHost || null,
      iosSetupUrl: nextdnsData?.setupUrl || null
    }
  });
});

// ============================================================
// 3. API TẢI HỒ SƠ CẤU HÌNH .mobileconfig (iOS 1-CHẠM)
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
      <string>Cấu hình DNS DoH Locket Gold cho @${username}</string>
      <key>PayloadDisplayName</key>
      <string>TỔ CAM DNS Gateway - @${username}</string>
      <key>PayloadIdentifier</key>
      <string>vip.tocam.dns.settings.${Date.now()}</string>
      <key>PayloadType</key>
      <string>com.apple.dnsSettings.managed</string>
      <key>PayloadUUID</key>
      <string>8A9C2B10-4D5E-4F6A-9B8C-1D2E3F4A5B6C</string>
      <key>PayloadVersion</key>
      <integer>1</integer>
    </dict>
  </array>
  <key>PayloadDescription</key>
  <string>Hồ sơ bảo vệ Locket Gold DoH Serverless bởi Tổ Cam (@${username})</string>
  <key>PayloadDisplayName</key>
  <string>🍊 TỔ CAM - Locket Gold (@${username})</string>
  <key>PayloadIdentifier</key>
  <string>vip.tocam.locketgold.profile</string>
  <key>PayloadOrganization</key>
  <string>TỔ CAM LOCKET GOLD</string>
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
  res.setHeader('Content-Disposition', `attachment; filename="TOCAM_LocketGold_${username}.mobileconfig"`);
  res.send(Buffer.from(mobileconfigXml, 'utf-8'));
});

// ============================================================
// 4. SERVERLESS DoH (DNS-OVER-HTTPS) RESOLVER ENDPOINT
// ============================================================
app.all(['/api/dns-query', '/dns-query'], handleDohRequest);

// ============================================================
// 5. API QUẢN TRỊ & TRA CỨU NGƯỜI DÙNG
// ============================================================
app.get('/api/users', (req, res) => {
  res.json({ success: true, count: getAllUsers().length, users: getAllUsers() });
});

app.get('/api/user/:username', (req, res) => {
  const username = req.params.username;
  const user = getUser(username);
  if (!user) {
    return res.status(404).json({ success: false, error: 'Không tìm thấy người dùng' });
  }
  res.json({
    success: true,
    user,
    isActive: isUserActive(username)
  });
});

app.post('/api/revoke', async (req, res) => {
  const { username } = req.body || {};
  const user = getUser(username);
  if (!user) {
    return res.status(404).json({ success: false, error: 'Không tìm thấy người dùng!' });
  }

  user.status = 'EXPIRED';
  user.expiresAt = new Date().toISOString();
  if (user.nextdnsProfileId) {
    await unblockRevenueCat(user.nextdnsProfileId);
  }
  recordUser(username, user);

  res.json({ success: true, message: `Đã thu hồi Gold của @${username}!` });
});

// Khởi chạy khi chạy môi trường Node.js local
const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`
🍊 ==========================================================
   TỔ CAM LOCKET GOLD GATEWAY - PRODUCTION READY
   Port: ${PORT}
   Web Portal: http://localhost:${PORT}/gold
   DoH Endpoint: http://localhost:${PORT}/api/dns-query
   Health Check: http://localhost:${PORT}/health
==========================================================
    `);
  });
}

// Export cho Vercel Serverless
module.exports = app;
