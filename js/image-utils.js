// js/image-utils.js
// Utilidades de compresión y manipulación de imágenes en el cliente para CAPFIT

/**
 * Comprime una imagen en formato dataURL / base64 redimensionándola a un ancho máximo
 * preservando la relación de aspecto original y exportándola como JPEG optimizado.
 *
 * Resuelve el problema de fotos de cámara de alta resolución (3-8MB) que exceden
 * el límite de payload (4.5MB en Vercel / 6MB en proxy) generando errores 413.
 *
 * @param {string} dataURL - URI data de la imagen original (data:image/...)
 * @param {number} maxAncho - Ancho máximo permitido en píxeles (default 1024)
 * @param {number} calidad - Calidad de compresión JPEG entre 0.1 y 1.0 (default 0.85)
 * @returns {Promise<string>} Promesa que resuelve con el dataURL comprimido en JPEG
 */
function comprimirFoto(dataURL, maxAncho = 1024, calidad = 0.85) {
  return new Promise((resolve) => {
    if (!dataURL || typeof dataURL !== 'string' || !dataURL.startsWith('data:image/')) {
      return resolve(dataURL);
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        if (!width || !height) {
          return resolve(dataURL);
        }

        // Redimensionar si supera maxAncho manteniendo aspect ratio
        if (width > maxAncho) {
          height = Math.round((height * maxAncho) / width);
          width = maxAncho;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(dataURL);

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        const compressed = canvas.toDataURL('image/jpeg', calidad);
        resolve(compressed);
      } catch (err) {
        console.warn('[ImageUtils] Error al comprimir en canvas, usando original:', err);
        resolve(dataURL);
      }
    };

    img.onerror = () => {
      console.warn('[ImageUtils] Error al cargar Image para compresión, usando original.');
      resolve(dataURL);
    };

    img.src = dataURL;
  });
}

// Exponer en el scope global
window.comprimirFoto = comprimirFoto;
