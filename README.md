# Resumen Técnico - CapFit

## JavaScript Files

### [...route].js
**Ruta:** `api/[...route].js`
**Líneas:** 108
**Descripción:** Archivo JavaScript
```js
// api/fal/[...route].js
// Proxy para fal.ai — la API key viene de variable de entorno, nunca del browser
// Vercel: configurar FAL_KEY en Settings → Environment Variables...
```

### anthropic.js
**Ruta:** `api/anthropic.js`
**Líneas:** 59
**Descripción:** Archivo JavaScript
```js
// api/anthropic.js
// Proxy para Anthropic API — la key viene de variable de entorno
// Vercel: configurar ANTHROPIC_KEY en Settings → Environment Variables...
```

### background.js
**Ruta:** `js/background.js`
**Líneas:** 41
**Descripción:** Archivo JavaScript
```js
// ── Fondo animado con ondas ──
(function () {
  const c = document.getElementById('bg-canvas');...
```

### camera.js
**Ruta:** `js/camera.js`
**Líneas:** 53
**Descripción:** Archivo JavaScript
```js
// ── Cámara y captura de foto ──
let mediaStream = null;
...
```

### catalogo.js
**Ruta:** `js/catalogo.js`
**Líneas:** 59
**Descripción:** Archivo JavaScript
```js

let gorras       = [];       // datos del JSON
let gorraActiva  = null;     // gorra seleccionada actualmente...
```

### config.js
**Ruta:** `js/config.js`
**Líneas:** 17
**Descripción:** Archivo JavaScript
```js
// ── CAPFIT CONFIG ──
// Editá estos valores para personalizar el sitio
...
```

### piropos.js
**Ruta:** `js/piropos.js`
**Líneas:** 24
**Descripción:** Archivo JavaScript
```js
// ── Lista de piropos ──
// Editá, agregá o quitá los que quieras
const PIROPOS = [...
```

### tryon.js
**Ruta:** `js/tryon.js`
**Líneas:** 128
**Descripción:** Archivo JavaScript
```js
// ── fal.ai FASHN Virtual Try-On ──
// La API key vive en el servidor (variable de entorno), nunca en el browser.
// Flujo: browser → /api/fal/submit → queue.fal.run...
```

### ui.js
**Ruta:** `js/ui.js`
**Líneas:** 11
**Descripción:** Archivo JavaScript
```js
// ── UI helpers: fade-in observer ──
document.addEventListener('DOMContentLoaded', () => {
  const obs = new IntersectionObserver(entries => {...
```

### server.js
**Ruta:** `server.js`
**Líneas:** 178
**Descripción:** Archivo JavaScript
```js
/**
 * CAPFIT — Proxy Server (solo para desarrollo local)
 * Lee las API keys del archivo .env...
```

## HTML Files

### index.html
**Ruta:** `index.html`
**Líneas:** 293
**Descripción:** Archivo HTML
```html
<!DOCTYPE html>
<html lang="es">
<head>...
```

## CSS Files

### style.css
**Ruta:** `css/style.css`
**Líneas:** 119
**Descripción:** Archivo CSS
```css
/* ── RESET & VARIABLES ── */
:root {
  --black: #0a0a0a;...
```

## Database & Persistence
El catálogo de productos, órdenes y configuración de tiendas se gestiona 100% en la nube mediante **Firebase Firestore** (`stores`, `products`, `orders`, `ai_logs`, `store_owners`), sin dependencia de archivos JSON locales.

## JSON Files

### package.json
**Ruta:** `package.json`
**Líneas:** 6
**Descripción:** Archivo JSON
```json
{
  "dependencies": {
    "dotenv": "^17.4.2"...
```

### vercel.json
**Ruta:** `vercel.json`
**Líneas:** 29
**Descripción:** Archivo JSON
```json
{
  "version": 2,
  "builds": [...
```

