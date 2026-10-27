/**
 * Serverless RFC 8484 DNS-over-HTTPS (DoH) Gateway
 * 100% miễn phí, không giới hạn request, chạy trực tiếp trên Vercel Serverless Function!
 */

const dnsPacket = require('dns-packet');
const { isUserActive } = require('./store');

const UPSTREAM_DOH = 'https://cloudflare-dns.com/dns-query';

/**
 * Xử lý truy vấn DNS-over-HTTPS
 */
async function handleDohRequest(req, res) {
  let dnsRaw = null;

  try {
    if (req.method === 'POST') {
      // POST body contains raw dns packet
      if (Buffer.isBuffer(req.body)) {
        dnsRaw = req.body;
      } else if (req.body && typeof req.body === 'object' && Object.keys(req.body).length === 0) {
        // Express raw body buffer fallback
        dnsRaw = req.rawBody || Buffer.from([]);
      }
    } else if (req.method === 'GET' && req.query.dns) {
      // GET dns query param in base64url
      let b64 = req.query.dns.replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      dnsRaw = Buffer.from(b64, 'base64');
    }

    if (!dnsRaw || dnsRaw.length === 0) {
      return res.status(400).send('Bad Request: Missing DNS query payload');
    }

    // Decode DNS packet
    const decoded = dnsPacket.decode(dnsRaw);
    const questions = decoded.questions || [];
    const targetQuestion = questions[0];

    const username = (req.query.u || req.query.user || req.params.username || '').toLowerCase().trim();
    const queryName = (targetQuestion?.name || '').toLowerCase();

    // Kiểm tra nếu tên miền truy vấn liên quan đến RevenueCat (Locket validation)
    const isRevenueCat = queryName.includes('revenuecat.com') || queryName.includes('api.revenuecat.com');

    if (isRevenueCat) {
      const active = username ? isUserActive(username) : true;

      // 1. Nếu tài khoản còn hạn sử dụng -> CHẶN NGAY (trả về 0.0.0.0 hoặc :: để giữ Gold)
      if (active) {
        const answers = [];
        if (targetQuestion.type === 'A') {
          answers.push({
            type: 'A',
            name: targetQuestion.name,
            ttl: 60,
            data: '0.0.0.0'
          });
        } else if (targetQuestion.type === 'AAAA') {
          answers.push({
            type: 'AAAA',
            name: targetQuestion.name,
            ttl: 60,
            data: '::'
          });
        }

        const blockedResponse = dnsPacket.encode({
          type: 'response',
          id: decoded.id,
          flags: dnsPacket.RECURSION_DESIRED | dnsPacket.RECURSION_AVAILABLE,
          questions: decoded.questions,
          answers: answers
        });

        res.setHeader('Content-Type', 'application/dns-message');
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        return res.send(blockedResponse);
      }
      // 2. Nếu đã hết hạn sử dụng -> Đi tiếp xuống dưới để phân giải IP thật -> Locket rụng Gold!
    }

    // Chuyển tiếp truy vấn DNS upstream tới Cloudflare DoH (Đảm bảo 100% tốc độ mạng cho mọi app khác)
    const upstreamRes = await fetch(UPSTREAM_DOH, {
      method: 'POST',
      headers: {
        'Accept': 'application/dns-message',
        'Content-Type': 'application/dns-message'
      },
      body: dnsRaw,
      signal: AbortSignal.timeout(5000)
    });

    if (upstreamRes.ok) {
      const arrayBuf = await upstreamRes.arrayBuffer();
      const answerBuffer = Buffer.from(arrayBuf);
      res.setHeader('Content-Type', 'application/dns-message');
      res.setHeader('Cache-Control', 'public, max-age=60');
      return res.send(answerBuffer);
    } else {
      return res.status(502).send('Upstream DoH error');
    }
  } catch (err) {
    console.error('[DOH_ERROR]', err.message);
    return res.status(500).send('Internal DNS Resolver Error');
  }
}

module.exports = { handleDohRequest };
