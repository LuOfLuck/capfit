/**
 * Script para setear el Custom Claim { admin: true } a un usuario de Firebase Auth.
 *
 * Requisitos:
 * 1. Descargar las credenciales de Service Account desde Firebase Console:
 *    Project Settings -> Service accounts -> Generate new private key
 * 2. Guardar el archivo JSON como serviceAccountKey.json o exportar la ruta:
 *    export GOOGLE_APPLICATION_CREDENTIALS="./serviceAccountKey.json"
 *
 * Uso:
 *    node scripts/set-admin-claim.js <uid-o-email>
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

async function main() {
  const target = process.argv[2];
  if (!target) {
    console.error('Uso: node scripts/set-admin-claim.js <uid-o-email>');
    process.exit(1);
  }

  // Inicializar Firebase Admin
  let serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!serviceAccountPath && fs.existsSync(path.join(__dirname, '../serviceAccountKey.json'))) {
    serviceAccountPath = path.join(__dirname, '../serviceAccountKey.json');
  }

  if (serviceAccountPath && fs.existsSync(serviceAccountPath)) {
    const serviceAccount = require(path.resolve(serviceAccountPath));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  } else {
    // Si corre en GCP / Cloud Run con Application Default Credentials
    admin.initializeApp();
  }

  let userRecord;
  try {
    if (target.includes('@')) {
      userRecord = await admin.auth().getUserByEmail(target);
    } else {
      userRecord = await admin.auth().getUser(target);
    }
  } catch (err) {
    console.error(`Error buscando usuario "${target}":`, err.message);
    process.exit(1);
  }

  const existingClaims = userRecord.customClaims || {};
  const newClaims = { ...existingClaims, admin: true };

  await admin.auth().setCustomUserClaims(userRecord.uid, newClaims);

  console.log(`✅ Claim admin=true asignado exitosamente al usuario:`);
  console.log(`   UID:   ${userRecord.uid}`);
  console.log(`   Email: ${userRecord.email}`);
  console.log(`   Claims actuales:`, JSON.stringify(newClaims));
  console.log(`\nNota: El usuario debe volver a iniciar sesión o forzar refresco de token para que el claim tome efecto.`);
}

main().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
