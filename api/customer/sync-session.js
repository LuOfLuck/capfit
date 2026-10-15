/**
 * API Serverless Endpoint: POST /api/customer/sync-session
 * Sincroniza la identidad global del comprador (CapFit ID) con la tienda actual (store_customers)
 * y detecta si es dueño de alguna tienda (Opción A: cruzando email con store_secrets).
 */

const CustomerService = require('../../src/customer-service');
const AuthGuard = require('../../src/auth-guard');

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Store-Id,X-Admin-Token,X-Auth-Token');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const raw = await readBody(req);
    const body = JSON.parse(raw.toString() || '{}');
    const idToken = AuthGuard.extractTokenFromRequest(req) || body.idToken || '';

    const auth = idToken && idToken.startsWith('capfit_sess.')
      ? await AuthGuard.authenticateRequest(req)
      : (idToken ? await AuthGuard.verifyFirebaseIdToken(idToken) : { verified: false });

    const isVerified = Boolean(auth && (auth.authenticated || auth.verified));
    if (!isVerified) {
      res.status(401).json({ ok: false, error: 'Token de identidad Firebase requerido para sincronizar sesión.' });
      return;
    }

    const verifiedUid = auth.uid;
    const verifiedEmail = auth.email || (body.email || '').toLowerCase().trim();
    if (body.uid && String(body.uid) !== String(verifiedUid) && auth.role !== 'superadmin') {
      res.status(403).json({ ok: false, error: 'No tenés permisos para sincronizar la sesión de otro usuario.' });
      return;
    }

    const { displayName, phone, dni, photoURL, currentStoreId } = body;

    const result = await CustomerService.syncSession({
      uid: verifiedUid,
      email: verifiedEmail,
      displayName: displayName || auth.name || '',
      phone,
      dni,
      photoURL: photoURL || auth.picture || '',
      currentStoreId: currentStoreId || req.headers['x-store-id'] || 'principal'
    });

    res.status(200).json(result);
  } catch (err) {
    console.error('Error en sync-session:', err);
    res.status(500).json({ error: 'Error al sincronizar sesión de cliente', message: err.message });
  }
};
