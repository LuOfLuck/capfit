/**
 * js/utils/image-utils.js
 * Utilidades de manipulación, compresión y validación de imágenes en el cliente.
 * Evita errores 413 (Payload Too Large) en Vercel reduciendo las fotos a max 1024px JPEG.
 */

/**
 * Comprime y redimensiona una foto en base64 / Data URI usando un Canvas HTML5.
 * @param {string} dataURL - Data URI original (cámara o galería)
 * @param {number} maxAncho - Ancho máximo permitido (default 1024)
 * @param {number} calidad - Calidad de compresión JPEG (0.0 a 1.0, default 0.85)
 * @returns {Promise<string>} Data URI en formato JPEG comprimido
 */
function comprimirFoto(dataURL, maxAncho = 1024, calidad = 0.85) {
  return new Promise((resolve, reject) => {
    if (!dataURL || typeof dataURL !== 'string') {
      return reject(new Error('DataURL inválido o vacío'));
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      const origW = img.naturalWidth || img.width;
      const origH = img.naturalHeight || img.height;

      let targetW = origW;
      let targetH = origH;

      // Mantener relación de aspecto reduciendo si supera maxAncho
      if (origW > maxAncho) {
        targetW = maxAncho;
        targetH = Math.round((origH * maxAncho) / origW);
      }

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;

      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, targetW, targetH);

      const compressedDataURL = canvas.toDataURL('image/jpeg', calidad);
      resolve(compressedDataURL);
    };

    img.onerror = () => {
      reject(new Error('Error al procesar la imagen para compresión'));
    };

    img.src = dataURL;
  });
}

/**
 * Valida si un archivo es una imagen permitida (JPG, PNG, WebP)
 */
function validarFormatoImagen(file) {
  if (!file) return { ok: false, error: 'No se seleccionó ningún archivo.' };
  const name = (file.name || '').toLowerCase();
  const type = (file.type || '').toLowerCase();

  if (name.endsWith('.heic') || name.endsWith('.heif') || type.includes('heic') || type.includes('heif')) {
    return {
      ok: false,
      error: 'El formato HEIC/HEIF de iPhone no es compatible directamente. Por favor usá JPG, PNG o sacate una foto con la cámara.'
    };
  }

  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  const allowedExts = ['.jpg', '.jpeg', '.png', '.webp'];
  const hasExt = allowedExts.some(ext => name.endsWith(ext));
  const hasType = allowedTypes.includes(type);

  if (file.type && !hasType && !hasExt) {
    return { ok: false, error: 'Formato no soportado. Seleccioná una imagen JPG, PNG o WebP.' };
  }

  return { ok: true };
}

// Exportación como puente global para compatibilidad
window.comprimirFoto = comprimirFoto;
window.validarFormatoImagen = validarFormatoImagen;
