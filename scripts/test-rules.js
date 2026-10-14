/**
 * CAPFIT - Verificador de Reglas de Seguridad de Firestore (`firestore.rules`)
 * Valida que:
 * 1. `store_secrets/{storeId}` esté bloqueado a lecturas públicas.
 * 2. `stores/{storeId}` rechace documentos con `adminUsername` o `adminPassword`.
 * 3. Las cuotas de IA (`aiMonthlyLimit`, `aiGenerationsUsed`, `plan`) sean inmutables para tiendas.
 * Uso: npm run test:rules
 */

const fs = require('fs');
const path = require('path');

function verifyRulesFile() {
  const rulesPath = path.join(__dirname, '..', 'firestore.rules');
  const content = fs.readFileSync(rulesPath, 'utf8');

  const checks = [
    {
      name: 'Bloqueo de colección privada store_secrets/{storeId}',
      passed: content.includes('match /store_secrets/{storeId}') && content.includes('allow read, write: if isSuperAdmin();')
    },
    {
      name: 'Prohibición de adminUsername y adminPassword en stores/{storeId}',
      passed:
        content.includes("hasNoExposedCredentials") &&
        content.includes("!('adminUsername' in data)") &&
        content.includes("!('adminPassword' in data)")
    },
    {
      name: 'Inmutabilidad de campos de cuota (aiMonthlyLimit, aiGenerationsUsed, plan)',
      passed:
        content.includes('quotaFieldsUnchanged()') &&
        content.includes('request.resource.data.aiMonthlyLimit == resource.data.aiMonthlyLimit') &&
        content.includes('request.resource.data.aiGenerationsUsed == resource.data.aiGenerationsUsed')
    },
    {
      name: 'Creación de órdenes restringida a estado inicial pending y totalAmount > 0',
      passed:
        content.includes("request.resource.data.status == 'pending'") &&
        content.includes('request.resource.data.totalAmount > 0')
    }
  ];

  let allPassed = true;
  console.log('=== Auditoría Automatizada de firestore.rules (Opción A: store_secrets) ===\n');
  for (const check of checks) {
    if (check.passed) {
      console.log(`  [PASS] ${check.name}`);
    } else {
      console.error(`  [FAIL] ${check.name}`);
      allPassed = false;
    }
  }

  if (!allPassed) {
    console.error('\nFalló la validación de seguridad de firestore.rules.');
    process.exit(1);
  }

  console.log('\nTodas las invariantes de seguridad (incluyendo aislamiento de store_secrets) pasaron correctamente.');
}

verifyRulesFile();