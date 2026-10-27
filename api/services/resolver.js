const https = require('https');

/**
 * Phân giải Username hoặc Link Locket -> UID 28 ký tự & Ảnh đại diện CDN
 * @param {string} rawInput 
 * @returns {Promise<{ uid: string|null, avatarUrl: string|null, username: string }>}
 */
async function resolveLocketUser(rawInput) {
  if (!rawInput) return { uid: null, avatarUrl: null, username: '' };
  
  let cleanUser = String(rawInput).trim().replace('@', '');
  if (cleanUser.includes('locket.cam/')) {
    cleanUser = cleanUser.split('locket.cam/')[1].split(/[/?#]/)[0];
  } else if (cleanUser.includes('locketcamera.com/')) {
    cleanUser = cleanUser.split('locketcamera.com/')[1].split(/[/?#]/)[0];
  }
  cleanUser = cleanUser.trim().toLowerCase();

  return new Promise((resolve) => {
    const url = `https://locket.cam/${encodeURIComponent(cleanUser)}`;
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html'
      },
      timeout: 10000
    }, (res) => {
      // Check redirect
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const m = res.headers.location.match(/\/invites\/([A-Za-z0-9]{28})/);
        if (m) {
          return resolve({ uid: m[1], avatarUrl: null, username: cleanUser });
        }
      }

      let html = '';
      res.on('data', chunk => { html += chunk; });
      res.on('end', () => {
        let uid = null;
        let avatarUrl = null;

        // 1. Tìm ảnh profile từ class profile-pic-img
        const imgMatch = html.match(/<img[^>]+class="profile-pic-img"[^>]+src="([^"]+)"/i);
        if (imgMatch && imgMatch[1]) {
          avatarUrl = imgMatch[1].replace(/&amp;/g, '&');
          const uidFromImg = avatarUrl.match(/users%2F([A-Za-z0-9]{20,36})%2F/i);
          if (uidFromImg && uidFromImg[1]) {
            uid = uidFromImg[1];
          }
        }

        // 2. Tìm link invites 28 ký tự
        if (!uid) {
          const decoded = html.replace(/%3A/gi, ':').replace(/%2F/gi, '/');
          const invMatch = decoded.match(/\/invites\/([A-Za-z0-9]{28})/);
          if (invMatch && invMatch[1]) {
            uid = invMatch[1];
          }
        }

        // 3. Fallback og:image nếu có
        if (!avatarUrl) {
          const ogImg = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
          if (ogImg && ogImg[1] && ogImg[1].includes('locket')) {
            avatarUrl = ogImg[1];
          }
        }

        resolve({ uid, avatarUrl, username: cleanUser });
      });
    });

    req.on('error', () => resolve({ uid: null, avatarUrl: null, username: cleanUser }));
    req.on('timeout', () => { req.destroy(); resolve({ uid: null, avatarUrl: null, username: cleanUser }); });
  });
}

module.exports = { resolveLocketUser };
