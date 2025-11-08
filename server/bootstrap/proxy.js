/*
  Global outbound proxy bootstrap for Node.
  - Enables HTTP/HTTPS/WebSocket egress via a local proxy (e.g., Clash at 127.0.0.1:7890)
  - Works for axios (via httpAgent/httpsAgent) and fetch/undici (via setGlobalDispatcher)
  - Controlled by env vars:
      PROXY_ENABLED=true
      PROXY_PROTOCOL=http|socks5
      PROXY_HOST=127.0.0.1
      PROXY_PORT=7890
*/

const enabled = String(process.env.PROXY_ENABLED || '').toLowerCase() === 'true';
if (!enabled) {
  module.exports = { enabled: false };
  return;
}

const protocol = process.env.PROXY_PROTOCOL || 'http';
const host = process.env.PROXY_HOST || '127.0.0.1';
const port = process.env.PROXY_PORT || '7890';
const proxyUrl = `${protocol}://${host}:${port}`;

// 1) axios default agents
try {
  const axios = require('axios');
  if (protocol.startsWith('http')) {
    const { HttpsProxyAgent } = require('https-proxy-agent');
    const { HttpProxyAgent } = require('http-proxy-agent');
    const httpAgent = new HttpProxyAgent(proxyUrl);
    const httpsAgent = new HttpsProxyAgent(proxyUrl);
    axios.defaults.proxy = false; // disable axios legacy proxy option
    axios.defaults.httpAgent = httpAgent;
    axios.defaults.httpsAgent = httpsAgent;
  }
} catch (e) {
  // ignore
}

// 2) fetch/undici global dispatcher (Node 18+)
try {
  const { setGlobalDispatcher, ProxyAgent } = require('undici');
  setGlobalDispatcher(new ProxyAgent(proxyUrl));
} catch (e) {
  // ignore
}

// 3) env hints for libs that read HTTP(S)_PROXY
process.env.HTTP_PROXY = proxyUrl;
process.env.HTTPS_PROXY = proxyUrl;
process.env.NO_PROXY = process.env.NO_PROXY || 'localhost,127.0.0.1,::1';

// Optional: loosen TLS only if user asks (not default)
if (String(process.env.PROXY_SKIP_CERT_VERIFY || '').toLowerCase() === 'true') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

console.log(`🌐 Outbound proxy enabled via ${proxyUrl}`);

module.exports = { enabled: true, proxyUrl };


