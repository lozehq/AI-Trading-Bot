const crypto = require('crypto');
const networkOptimizer = require('../../utils/networkOptimizer');

function ensureCredentials() {
  const apiKey = process.env.OKX_API_KEY;
  const secret = process.env.OKX_API_SECRET;
  const passphrase = process.env.OKX_API_PASSPHRASE;

  if (!apiKey || !secret || !passphrase) {
    throw new Error('OKX API credentials not configured');
  }

  return { apiKey, secret, passphrase };
}

function createOkxAuthHeaders(method, requestPath, body = '') {
  const { apiKey, secret, passphrase } = ensureCredentials();

  const timestamp = new Date().toISOString();
  const signString = timestamp + method.toUpperCase() + requestPath + body;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signString)
    .digest('base64');

  return {
    'OK-ACCESS-KEY': apiKey,
    'OK-ACCESS-SIGN': signature,
    'OK-ACCESS-TIMESTAMP': timestamp,
    'OK-ACCESS-PASSPHRASE': passphrase,
    'Content-Type': 'application/json'
  };
}

function buildRequestPath(path, params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach(v => query.append(key, v));
    } else {
      query.append(key, value);
    }
  });
  const qs = query.toString();
  return qs ? `${path}?${qs}` : path;
}

async function signedGet(path, params = {}, timeout = 10000) {
  const requestPath = buildRequestPath(path, params);
  const headers = createOkxAuthHeaders('GET', requestPath);
  return networkOptimizer.get(`https://www.okx.com${path}`, {
    params,
    timeout,
    headers
  });
}

module.exports = {
  createOkxAuthHeaders,
  signedGet,
  buildRequestPath
};

