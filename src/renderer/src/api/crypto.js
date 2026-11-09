// 写接口 + 所有鉴权接口加密并签名；公开 GET（片库列表等）保持明文。
// 协议见 Service/video_service/docs/ENCRYPTION.md

const ENCRYPT_VERSION = '1';
const ENCRYPT_KID = 'v1';
const ENCRYPT_SALT = '91b470b57d8d4b75a3a7ac4d58c2b891b8e134a0ebc12ae4';

// 服务端 JWTAuth / Admin 鉴权路径（不含公开 OptionalJWT 列表接口）
const AUTH_ENCRYPT_PATHS = [
  '/video/search',
  '/video/episodes',
  '/video/play',
  '/user/me',
  '/user/profile',
  '/user/avatar',
  '/user/logout',
  '/user/favorites',
  '/user/watch-history',
  '/user/watch-progress',
  '/membership/me',
  '/membership/status',
  '/membership/order',
  '/membership/orders',
  '/billing/order',
  '/billing/purchases/videos',
  '/billing/purchases/episodes',
  '/admin/cache/flush',
];

const RSA_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA1vFOzZzXApmgJyLthDdj
lvYtPljJa4xG84o5+J35LG8HjLfmPwaHjPEw/xIgXKNupET0eLHkPnDr2iN0KgwS
PvIo3dV29GgvAxPxm2hcU+STPLKD9UyO9CjiXOmSDqe4Y88qw/ygftsp9eGwRP/W
Ex/4uJSYXqn7nqpz4pMfxYEsMX02pur2y/zpSymJbwhaQ3HFphcy1mj+x9pMKqIn
2CTeU+eg6UYJXoOYblu1v76OdF3XGHCw8ieVbCLnnaYl1ZuJ69oFScE/GyNnM6tW
MItMIlMVoM178lYnZ+zDGbSYyl89AJjnI9pXN0Jc6sVo42i0308YQY0rSU6qmW1o
IQIDAQAB
-----END PUBLIC KEY-----`;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

let publicKeyPromise;

function bytesToB64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function b64ToBytes(value) {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function bufToHex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function escapeString(value) {
  let out = '"';
  for (const ch of value) {
    const code = ch.codePointAt(0);
    if (ch === '"') out += '\\"';
    else if (ch === '\\') out += '\\\\';
    else if (ch === '\b') out += '\\b';
    else if (ch === '\f') out += '\\f';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\t') out += '\\t';
    else if (code < 0x20 || code === 0x2028 || code === 0x2029) {
      out += `\\u${code.toString(16).padStart(4, '0')}`;
    } else out += ch;
  }
  return `${out}"`;
}

function stringify(value) {
  if (value === null) return 'null';
  const type = typeof value;
  if (type === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('invalid number');
    }
    return JSON.stringify(value);
  }
  if (type === 'boolean') return value ? 'true' : 'false';
  if (type === 'string') return escapeString(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stringify(item === undefined ? null : item)).join(',')}]`;
  }
  if (type === 'object') {
    const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort();
    return `{${keys.map((key) => `${escapeString(key)}:${stringify(value[key])}`).join(',')}}`;
  }
  throw new Error('unsupported json value');
}

export function canonicalJSON(value) {
  return stringify(value);
}

function randomNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return bufToHex(bytes);
}

async function getPublicKey() {
  if (!publicKeyPromise) {
    const b64 = RSA_PUBLIC_KEY_PEM
      .replace('-----BEGIN PUBLIC KEY-----', '')
      .replace('-----END PUBLIC KEY-----', '')
      .replace(/\s+/g, '');
    publicKeyPromise = crypto.subtle.importKey(
      'spki',
      b64ToBytes(b64),
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      false,
      ['encrypt'],
    );
  }
  return publicKeyPromise;
}

export async function signHex(canonical, timestamp, nonce) {
  const message = `${canonical}&timestamp=${timestamp}&nonce=${nonce}&salt=${ENCRYPT_SALT}`;
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(ENCRYPT_SALT),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, textEncoder.encode(message));
  return bufToHex(sig);
}

async function seal(value) {
  const plain = canonicalJSON(value);
  const aesKey = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aesCryptoKey = await crypto.subtle.importKey('raw', aesKey, { name: 'AES-GCM' }, false, ['encrypt']);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    aesCryptoKey,
    textEncoder.encode(plain),
  ));
  const encryptedKey = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    await getPublicKey(),
    aesKey,
  ));
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = randomNonce();
  const sign = await signHex(plain, timestamp, nonce);
  return {
    aesKey,
    body: {
      encrypted_key: bytesToB64(encryptedKey),
      iv: bytesToB64(iv),
      ciphertext: bytesToB64(ciphertext),
    },
    headers: {
      'X-Encrypt-Version': ENCRYPT_VERSION,
      kid: ENCRYPT_KID,
      'X-Timestamp': timestamp,
      'X-Nonce': nonce,
      'X-Sign': sign,
    },
  };
}

export async function openJson(aesKey, envelope) {
  const iv = b64ToBytes(envelope.iv);
  const ciphertext = b64ToBytes(envelope.ciphertext);
  const key = await crypto.subtle.importKey('raw', aesKey, { name: 'AES-GCM' }, false, ['decrypt']);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    key,
    ciphertext,
  );
  return JSON.parse(textDecoder.decode(plain));
}

function isBinaryBody(data) {
  if (typeof FormData !== 'undefined' && data instanceof FormData) return true;
  if (typeof Blob !== 'undefined' && data instanceof Blob) return true;
  if (typeof ArrayBuffer !== 'undefined' && data instanceof ArrayBuffer) return true;
  return false;
}

function requestPath(config) {
  const raw = `${config.baseURL || ''}${config.url || ''}`;
  let path = raw;
  try {
    path = raw.startsWith('http') ? new URL(raw).pathname : String(raw).split('?')[0];
  } catch (err) {
    path = String(config.url || '').split('?')[0];
  }
  path = path.replace(/\/+$/, '') || '/';
  if (path.startsWith('/api/')) path = path.slice(4);
  else if (path === '/api') path = '/';
  if (!path.startsWith('/')) path = `/${path}`;
  return path;
}

function isAuthEncryptPath(path) {
  return AUTH_ENCRYPT_PATHS.some((item) => path === item || path.startsWith(`${item}/`));
}

export function shouldEncrypt(config) {
  if (!config || config.skipCrypto) return false;
  const method = String(config.method || 'get').toLowerCase();
  if (method === 'post' || method === 'put' || method === 'patch' || method === 'delete') {
    return true;
  }
  return isAuthEncryptPath(requestPath(config));
}

function setHeader(config, name, value) {
  if (!config.headers) config.headers = {};
  if (typeof config.headers.set === 'function') {
    config.headers.set(name, value);
    return;
  }
  config.headers[name] = value;
}

function payloadFromData(data) {
  if (data == null || data === '') return {};
  if (typeof data === 'string') {
    const trimmed = data.trim();
    return trimmed ? JSON.parse(trimmed) : {};
  }
  if (typeof data === 'object' && !isBinaryBody(data)) return data;
  return undefined;
}

export async function encryptConfig(config) {
  if (!shouldEncrypt(config)) return config;
  const payload = payloadFromData(config.data);
  if (payload === undefined) return config;
  const sealed = await seal(payload);
  config.data = sealed.body;
  config.cryptoAesKey = sealed.aesKey;
  // 鉴权 GET/DELETE 也带加密 Body（通常为 {}），用于协商 AES Key 并加密响应
  setHeader(config, 'Content-Type', 'application/json');
  Object.entries(sealed.headers).forEach(([name, value]) => setHeader(config, name, value));
  return config;
}

function asObject(data) {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch (err) {
      return null;
    }
  }
  return data;
}

export function isEncryptedEnvelope(data) {
  const body = asObject(data);
  return !!(
    body
    && typeof body === 'object'
    && typeof body.iv === 'string'
    && typeof body.ciphertext === 'string'
    && !Object.prototype.hasOwnProperty.call(body, 'code')
    && !Object.prototype.hasOwnProperty.call(body, 'encrypted_key')
  );
}

export async function decryptResponseData(response) {
  const aesKey = response?.config?.cryptoAesKey;
  if (!aesKey || !isEncryptedEnvelope(response.data)) return response;
  response.data = await openJson(aesKey, asObject(response.data));
  return response;
}
