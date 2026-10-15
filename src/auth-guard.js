/**
 * CAPFIT — Server-Side Authentication & Multi-Tenant Authorization Guard
 *
 * Implements:
 * 1. Cryptographic RS256 verification of Firebase Auth ID Tokens against Google's
 *    official X.509 public certificates (project: capfit-6689b).
 * 2. Cryptographic HMAC-SHA256 session token signing and constant-time verification
 *    for authenticated store owners, SuperAdmins, and customers.
 * 3. Per-tenant (storeId) and per-user (uid) authorization middleware helpers.
 */

const crypto = require('crypto');
const https = require('https');
const StoreManager = require('./store-manager');
const FirebaseDb = require('./firebase-db');

const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'capfit-6689b';
const GOOGLE_CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const SESSION_TTL_SECONDS = 12 * 60 * 60; // 12 hours

// Secret key for HMAC-SHA256 session tokens.
// Uses SESSION_SECRET / ADMIN_TOKEN_SECRET from environment if provided,
// otherwise derives a random runtime secret per process boot so plain-text tokens can never be forged.
const EphemeralBootEntropy = crypto.randomBytes(32).toString('hex');
function getHmacSecret() {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim().length >= 16) {
    return process.env.SESSION_SECRET.trim();
  }
  if (process.env.ADMIN_TOKEN_SECRET && process.env.ADMIN_TOKEN_SECRET.trim().length >= 16) {
    return process.env.ADMIN_TOKEN_SECRET.trim();
  }
  return crypto
    .createHash('sha256')
    .update(`capfit-hmac-v1::${process.env.ADMIN_PASSWORD || ''}::${EphemeralBootEntropy}`)
    .digest('hex');
}

// Cache for Google X.509 public certificates
let cachedGoogleCerts = null;
let cachedGoogleCertsExpiresAt = 0;

function fetchGooglePublicCerts() {
  const now = Date.now();
  if (cachedGoogleCerts && now < cachedGoogleCertsExpiresAt) {
    return Promise.resolve(cachedGoogleCerts);
  }

  return new Promise((resolve, reject) => {
    const req = https.get(GOOGLE_CERTS_URL, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try {
          const body = Buffer.concat(chunks).toString('utf8');
          const certs = JSON.parse(body);
          let maxAgeSec = 3600;
          const cc = res.headers['cache-control'] || '';
          const match = cc.match(/max-age=(\d+)/);
          if (match && match[1]) {
            maxAgeSec = parseInt(match[1], 10);
          }
          cachedGoogleCerts = certs;
          cachedGoogleCertsExpiresAt = Date.now() + maxAgeSec * 1000;
          resolve(certs);
        } catch (err) {
          reject(new Error('Failed to parse Google SecureToken certificates: ' + err.message));
        }
      });
    });
    req.on('error', (err) => reject(err));
    req.setTimeout(6000, () => {
      req.destroy(new Error('Timeout fetching Google SecureToken certificates'));
    });
  });
}

function base64UrlEncode(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input), 'utf8');
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecodeToBuffer(str) {
  let base64 = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64');
}

function base64UrlDecodeToString(str) {
  return base64UrlDecodeToBuffer(str).toString('utf8');
}

/**
 * Signs an HMAC-SHA256 session token for CapFit
 * Format: capfit_sess.<base64url(payload)>.<base64url(signature)>
 */
function signSessionToken(claims = {}) {
  const nowSec = Math.floor(Date.now() / 1000);
  const payload = {
    sub: String(claims.uid || claims.sub || `admin:${claims.storeId || 'principal'}`),
    uid: claims.uid ? String(claims.uid) : null,
    email: (claims.email || '').toLowerCase().trim(),
    role: claims.role || 'store_owner',
    storeId: claims.storeId || null,
    ownedStoreIds: Array.isArray(claims.ownedStoreIds) ? claims.ownedStoreIds : (claims.storeId ? [claims.storeId] : []),
    iat: nowSec,
    exp: claims.exp || (nowSec + SESSION_TTL_SECONDS)
  };

  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const hmac = crypto.createHmac('sha256', getHmacSecret());
  hmac.update(`capfit_sess.${encodedPayload}`);
  const signature = base64UrlEncode(hmac.digest());

  return `capfit_sess.${encodedPayload}.${signature}`;
}

/**
 * Verifies a CapFit HMAC-SHA256 session token
 */
function verifySessionToken(token) {
  if (!token || typeof token !== 'string' || !token.startsWith('capfit_sess.')) {
    return { verified: false, error: 'Formato de token de sesión inválido' };
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    return { verified: false, error: 'Estructura de token de sesión incompleta' };
  }

  const [, encodedPayload, providedSig] = parts;
  const hmac = crypto.createHmac('sha256', getHmacSecret());
  hmac.update(`capfit_sess.${encodedPayload}`);
  const expectedSig = base64UrlEncode(hmac.digest());

  const providedBuf = Buffer.from(providedSig, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (providedBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(providedBuf, expectedBuf)) {
    return { verified: false, error: 'Firma HMAC de sesión inválida' };
  }

  try {
    const payload = JSON.parse(base64UrlDecodeToString(encodedPayload));
    const nowSec = Math.floor(Date.now() / 1000);
    if (!payload.exp || payload.exp <= nowSec) {
      return { verified: false, error: 'La sesión ha expirado. Por favor iniciá sesión nuevamente.' };
    }

    return {
      verified: true,
      source: 'hmac_session',
      uid: payload.uid || payload.sub,
      email: (payload.email || '').toLowerCase().trim(),
      role: payload.role || 'store_owner',
      storeId: payload.storeId || null,
      ownedStoreIds: Array.isArray(payload.ownedStoreIds) ? payload.ownedStoreIds : (payload.storeId ? [payload.storeId] : []),
      claims: payload
    };
  } catch (err) {
    return { verified: false, error: 'Payload de sesión corrupto' };
  }
}

/**
 * Verifies a Firebase Auth RS256 ID Token against Google's official X.509 certificates
 */
async function verifyFirebaseIdToken(idToken) {
  if (!idToken || typeof idToken !== 'string') {
    return { verified: false, error: 'ID Token de Firebase requerido' };
  }

  const parts = idToken.split('.');
  if (parts.length !== 3) {
    return { verified: false, error: 'El token no es un JWT válido' };
  }

  let header;
  let payload;
  try {
    header = JSON.parse(base64UrlDecodeToString(parts[0]));
    payload = JSON.parse(base64UrlDecodeToString(parts[1]));
  } catch (e) {
    return { verified: false, error: 'No se pudo decodificar el encabezado o cuerpo del JWT' };
  }

  if (header.alg !== 'RS256' || !header.kid) {
    return { verified: false, error: 'Algoritmo o kid de JWT inválido' };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const expectedIssuer = `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`;

  if (payload.aud !== FIREBASE_PROJECT_ID) {
    return {
      verified: false,
      error: `Audiencia de token inválida (${payload.aud}). Se requiere proyecto ${FIREBASE_PROJECT_ID}.`
    };
  }

  if (payload.iss !== expectedIssuer) {
    return {
      verified: false,
      error: `Emisor de token inválido (${payload.iss}).`
    };
  }

  if (!payload.exp || payload.exp <= nowSec) {
    return { verified: false, error: 'El token de Firebase ha expirado.' };
  }

  if (!payload.iat || payload.iat > nowSec + 300) {
    return { verified: false, error: 'Tiempo de emisión (iat) inválido.' };
  }

  const uid = payload.sub || payload.user_id;
  if (!uid || typeof uid !== 'string') {
    return { verified: false, error: 'El token no contiene un UID (sub) válido.' };
  }

  try {
    const certs = await fetchGooglePublicCerts();
    const certPem = certs[header.kid];
    if (!certPem) {
      return { verified: false, error: 'Certificado público no encontrado para kid=' + header.kid };
    }

    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(`${parts[0]}.${parts[1]}`);
    verifier.end();

    const sigBuf = base64UrlDecodeToBuffer(parts[2]);
    const isValidSig = verifier.verify(certPem, sigBuf);

    if (!isValidSig) {
      return { verified: false, error: 'Firma criptográfica RSA-SHA256 inválida' };
    }

    return {
      verified: true,
      source: 'firebase_jwt',
      uid,
      email: (payload.email || '').toLowerCase().trim(),
      name: payload.name || '',
      picture: payload.picture || '',
      claims: payload
    };
  } catch (err) {
    return { verified: false, error: 'Error verificando firma de Firebase JWT: ' + err.message };
  }
}

/**
 * Extracts Bearer token from request headers
 */
function extractTokenFromRequest(req) {
  if (!req || !req.headers) return null;
  const authHeader = req.headers['authorization'] || req.headers['Authorization'] || '';
  if (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }
  const customHeader = req.headers['x-admin-token'] || req.headers['x-auth-token'];
  if (customHeader && typeof customHeader === 'string') {
    return customHeader.trim();
  }
  return null;
}

/**
 * Resolves role and store permissions for a verified Firebase user
 */
async function resolveUserPermissions({ uid, email, claims = {} }) {
  const cleanEmail = (email || '').toLowerCase().trim();
  const superadminEmail = (process.env.SUPERADMIN_EMAIL || 'lucasg33322@gmail.com').toLowerCase().trim();

  const claimRole = claims.role || (claims.admin === true ? 'superadmin' : null);
  const claimStoreId = claims.storeId || claims.store_id || null;

  let ownerDoc = null;
  if (uid && FirebaseDb && typeof FirebaseDb.getStoreOwner === 'function') {
    try {
      ownerDoc = await FirebaseDb.getStoreOwner(uid);
    } catch (_) {}
  }

  const docRole = ownerDoc ? ownerDoc.role : null;
  const docStoreId = ownerDoc ? (ownerDoc.storeId || (Array.isArray(ownerDoc.stores) && ownerDoc.stores[0])) : null;

  const ownedStores = StoreManager.findStoresByOwner({ email: cleanEmail, uid });
  const ownedStoreIds = new Set(ownedStores.map((s) => s.id));
  if (claimStoreId) ownedStoreIds.add(String(claimStoreId));
  if (docStoreId) ownedStoreIds.add(String(docStoreId));

  const isSuperAdmin =
    claimRole === 'superadmin' ||
    docRole === 'superadmin' ||
    (cleanEmail && (cleanEmail === superadminEmail || cleanEmail === 'admin@capfit.shop'));

  if (isSuperAdmin) {
    return {
      role: 'superadmin',
      storeId: claimStoreId || docStoreId || (ownedStores[0] && ownedStores[0].id) || 'principal',
      ownedStoreIds: Array.from(ownedStoreIds)
    };
  }

  if (ownedStoreIds.size > 0 || claimRole === 'store_owner' || docRole === 'store_owner') {
    const primaryStoreId = claimStoreId || docStoreId || (ownedStores[0] && ownedStores[0].id) || null;
    return {
      role: 'store_owner',
      storeId: primaryStoreId,
      ownedStoreIds: Array.from(ownedStoreIds)
    };
  }

  return {
    role: 'customer',
    storeId: null,
    ownedStoreIds: []
  };
}

/**
 * Authenticates an incoming HTTP request using either a CapFit HMAC session token
 * or a Firebase RS256 ID Token.
 */
async function authenticateRequest(req) {
  const token = extractTokenFromRequest(req);
  if (!token) {
    return { authenticated: false, status: 401, error: 'Autenticación requerida (Authorization: Bearer token ausente).' };
  }

  // 1. Check if it is a CapFit HMAC-signed session token
  if (token.startsWith('capfit_sess.')) {
    const sessionRes = verifySessionToken(token);
    if (!sessionRes.verified) {
      return { authenticated: false, status: 401, error: sessionRes.error };
    }

    // Refresh owned stores from StoreManager in case store ownership was linked during the session
    const dynamicOwned = StoreManager.findStoresByOwner({ email: sessionRes.email, uid: sessionRes.uid }).map(s => s.id);
    const mergedOwned = Array.from(new Set([...(sessionRes.ownedStoreIds || []), ...dynamicOwned]));

    return {
      authenticated: true,
      source: 'hmac_session',
      uid: sessionRes.uid,
      email: sessionRes.email,
      role: sessionRes.role,
      storeId: sessionRes.storeId,
      ownedStoreIds: mergedOwned,
      claims: sessionRes.claims
    };
  }

  // 2. Check if it is a 3-part Firebase RS256 JWT
  if (token.split('.').length === 3) {
    const fbRes = await verifyFirebaseIdToken(token);
    if (!fbRes.verified) {
      return { authenticated: false, status: 401, error: fbRes.error };
    }

    const perms = await resolveUserPermissions({
      uid: fbRes.uid,
      email: fbRes.email,
      claims: fbRes.claims
    });

    return {
      authenticated: true,
      source: 'firebase_jwt',
      uid: fbRes.uid,
      email: fbRes.email,
      name: fbRes.name,
      picture: fbRes.picture,
      role: perms.role,
      storeId: perms.storeId,
      ownedStoreIds: perms.ownedStoreIds,
      claims: fbRes.claims
    };
  }

  // 3. Reject legacy plain-text tokens (e.g. capfit_superadmin_..., capfit_store_...)
  return {
    authenticated: false,
    status: 401,
    error: 'Token no válido o no firmado criptográficamente. Iniciá sesión nuevamente.'
  };
}

/**
 * Checks whether an authenticated user has admin access to a specific storeId
 */
function canManageStore(auth, targetStoreId) {
  if (!auth || !auth.authenticated) return false;
  if (auth.role === 'superadmin') return true;
  if (auth.role !== 'store_owner' && auth.role !== 'tenant_admin') return false;

  const cleanTarget = String(targetStoreId || '').trim().toLowerCase();
  if (!cleanTarget) return false;

  if (auth.storeId && String(auth.storeId).toLowerCase() === cleanTarget) return true;
  if (Array.isArray(auth.ownedStoreIds) && auth.ownedStoreIds.some(id => String(id).toLowerCase() === cleanTarget)) {
    return true;
  }

  const store = StoreManager.getStoreById(cleanTarget) || StoreManager.getStoreBySubdomain(cleanTarget);
  if (store) {
    if (auth.storeId && String(auth.storeId).toLowerCase() === String(store.id).toLowerCase()) return true;
    if (Array.isArray(auth.ownedStoreIds) && auth.ownedStoreIds.some(id => String(id).toLowerCase() === String(store.id).toLowerCase())) return true;
    if (auth.uid && store.ownerUid && String(store.ownerUid) === String(auth.uid)) return true;
    if (auth.email && store.ownerEmail && String(store.ownerEmail).toLowerCase() === String(auth.email).toLowerCase()) return true;
  }

  return false;
}

module.exports = {
  FIREBASE_PROJECT_ID,
  signSessionToken,
  verifySessionToken,
  verifyFirebaseIdToken,
  extractTokenFromRequest,
  resolveUserPermissions,
  authenticateRequest,
  canManageStore
};
