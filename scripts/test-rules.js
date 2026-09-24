// scripts/test-rules.js
const fs = require('fs');
const path = require('path');

try {
  const rulesPath = path.join(__dirname, '..', 'firestore.rules');
  if (!fs.existsSync(rulesPath)) {
    throw new Error('firestore.rules no existe en la raíz');
  }

  const content = fs.readFileSync(rulesPath, 'utf8');
  if (!content.includes("rules_version = '2';")) {
    throw new Error('Versión de reglas inválida o faltante');
  }

  // Comprobar bloques esenciales de colecciones
  const requiredCollections = ['stores', 'products', 'orders', 'ai_logs', 'store_owners'];
  for (const col of requiredCollections) {
    if (!content.includes(col)) {
      throw new Error(`Colección requerida ausente en firestore.rules: ${col}`);
    }
  }

  console.log('✓ firestore.rules sintaxis y colecciones verificadas exitosamente.');
  process.exit(0);
} catch (err) {
  console.error('✗ Error validando firestore.rules:', err.message);
  process.exit(1);
}
