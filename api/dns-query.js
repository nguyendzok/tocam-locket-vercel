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
      if (Buffer.isBuffer(req.body)) {
        dnsRaw = req.body;
      } else if (typeof req.body === 'string') {
        dnsRaw = Buffer.from(req.body, 'binary');
      } else if (req.rawBody) {
        dnsRaw = Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.from(req.rawBody);
      } else {
        const chunks = [];
        for await (const chunk of req) {
          chunks.push(chunk);
        }
        if (chunks.length > 0) {
          dnsRaw = Buffer.concat(chunks);
        }
      }
    } else if (req.method === 'GET' && req.query.dns) {
      dnsRaw = Buffer.from(req.query.dns, 'base64url');
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
    const isRevenueCat = queryName.includes('revenuecat.com');

    if (isRevenueCat) {
      const user = username ? isUserActive(username) : true;
      // Chặn nếu còn hạn, hoặc mặc định bảo vệ nếu chưa bị đánh dấu EXPIRED
      if (user) {
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
      // Nếu đã hết hạn sử dụng -> chuyển tiếp xuống dưới lấy IP thật để Locket rụng Gold
    }

    // Chuyển tiếp truy vấn DNS upstream tới Cloudflare DoH (Đảm bảo 100% tốc độ mạng cho mọi app khác)
    const upstreamRes = await fetch(UPSTREAM_DOH, {
      method: 'POST',
      headers: {
        'Accept': 'application/dns-message',
        'Content-Type': 'application/dns-message'
      },
      body: new Uint8Array(dnsRaw),
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
    console.error('[DOH_ERROR]', err);
    res.setHeader('Content-Type', 'text/plain');
    return res.status(500).send(`DNS Resolver Error: ${err.message}`);
  }
}

module.exports = handleDohRequest;
module.exports.handleDohRequest = handleDohRequest;
