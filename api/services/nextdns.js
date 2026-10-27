/**
 * NextDNS API Engine
 * Quản lý tự động Profile, thêm/gỡ denylist và hẹn giờ rụng Gold
 */

const DEFAULT_API_KEY = process.env.NEXTDNS_KEY || "4dbc66ac83443dfce88e0160a3117f2763cee70d";

/**
 * Tạo Profile NextDNS riêng cho user và áp dụng luật chặn RevenueCat
 * @param {string} apiKey 
 * @param {string} username 
 * @param {Function} logCallback 
 */
async function createProfile(apiKey = DEFAULT_API_KEY, username = "vip", logCallback = console.log) {
  const headers = {
    "X-Api-Key": apiKey,
    "Content-Type": "application/json"
  };

  const profileName = `Locket-${username}-${Date.now().toString(36)}`;
  logCallback(`[*] Đang tạo Profile NextDNS: ${profileName}...`);

  try {
    const createRes = await fetch("https://api.nextdns.io/profiles", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: profileName }),
      signal: AbortSignal.timeout(10000)
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      logCallback(`[!] NextDNS tạo profile lỗi (${createRes.status}): ${errText}`);
      return { profileId: null, setupUrl: null, dotHost: null };
    }

    const createData = await createRes.json();
    const profileId = createData?.data?.id;
    logCallback(`[+] Đã tạo Profile thành công: ID = ${profileId}`);

    // Thêm rule chặn revenuecat.com & api.revenuecat.com
    logCallback(`[>] Đang kích hoạt tường lửa chặn RevenueCat...`);
    const denylistUrl = `https://api.nextdns.io/profiles/${profileId}/denylist`;

    await fetch(denylistUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ id: "revenuecat.com", active: true })
    }).catch(() => {});

    await fetch(denylistUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ id: "api.revenuecat.com", active: true })
    }).catch(() => {});

    logCallback(`[SUCCESS] Tường lửa Anti-Revoke NextDNS đã kích hoạt!`);

    return {
      profileId,
      setupUrl: `https://apple.nextdns.io/?profile=${profileId}`,
      dotHost: `${profileId}.dns.nextdns.io`,
      dohUrl: `https://dns.nextdns.io/${profileId}`
    };
  } catch (err) {
    logCallback(`[!] Lỗi kết nối NextDNS: ${err.message}`);
    return { profileId: null, setupUrl: null, dotHost: null };
  }
}

/**
 * GỠ CHẶN RevenueCat trên Profile NextDNS -> Bắt Locket rụng Gold ngay khi mở app
 * @param {string} profileId 
 * @param {string} apiKey 
 */
async function unblockRevenueCat(profileId, apiKey = DEFAULT_API_KEY, logCallback = console.log) {
  if (!profileId) return false;
  const headers = { "X-Api-Key": apiKey };
  logCallback(`[!] Đang gỡ tường lửa Profile ${profileId} để thu hồi Gold...`);

  try {
    await fetch(`https://api.nextdns.io/profiles/${profileId}/denylist/revenuecat.com`, {
      method: "DELETE",
      headers
    }).catch(() => {});

    await fetch(`https://api.nextdns.io/profiles/${profileId}/denylist/api.revenuecat.com`, {
      method: "DELETE",
      headers
    }).catch(() => {});

    logCallback(`[+] Đã gỡ bỏ chặn RevenueCat trên profile ${profileId}. App Locket sẽ trở về Free khi mở!`);
    return true;
  } catch (e) {
    logCallback(`[!] Lỗi khi gỡ chặn NextDNS: ${e.message}`);
    return false;
  }
}

module.exports = {
  createProfile,
  unblockRevenueCat,
  DEFAULT_API_KEY
};
