# CONTEXT.md — CapFit SaaS & Virtual Try-On

Este documento resume la arquitectura, estructura, reglas de negocio y estado técnico del proyecto para continuar su desarrollo en una sesión limpia.

---

## 1. Arquitectura y Stack Tecnológico

- **Frontend de la Aplicación (`/index.html`, `/js/`)**:
  - Vanilla JavaScript modular (ES6+), HTML5 y CSS nativo sin dependencias de frameworks externos.
  - Cámara web, captura y manipulación de imagen vía Canvas HTML5 (compresión a JPEG 0.85, resolución máxima 1024px).
  - Integración cliente con Firebase Authentication v10 (Google Sign-In, Email/Password) y Checkout Pro de Mercado Pago.
- **Landing Comercial (`/landing/`)**:
  - Experiencia editorial con motion graphics cinematográficos.
  - Animaciones y scrolleytelling con **GSAP 3.12.5**, **ScrollTrigger** y **Lenis Smooth Scroll** vía CDN.
  - Componentes interactivos: comparador antes/después de calce facial, tilt 3D con retícula HUD, simulador de telemetría biométrica de 468 puntos y filtrado en vivo de catálogo.
- **Backend (`server.js`, `/src/`, `/api/`)**:
  - Servidor Node.js autónomo en puerto `3000` (compatible con Docker, Cloud Run o VPS) y handlers serverless para **Vercel** (`/api/serverless.js`).
  - Proxy seguro para modelos de visión en `fal.ai` (oculta API keys y evita exposición en el cliente).
  - Rate limiting en memoria por IP (10 peticiones/minuto en endpoints de IA).
- **Base de Datos & Seguridad**:
  - **Google Cloud Firestore**: Persistencia multi-tenant (`stores`, `products`, `orders`, `ai_logs`).
  - **AuthGuard (`src/auth-guard.js`)**: Tokens firmados con HMAC-SHA256 para SuperAdmin y validación criptográfica RS256 de ID Tokens de Firebase Auth contra certificados públicos de Google (`googleapis.com/robot/v1/metadata/x509/...`).
- **Inferencia de IA (Probador Virtual)**:
  - Modelos en `fal.ai`: `openai/gpt-image-2.5/sunburst/edit` (con fallback a `openai/gpt-image-2/edit`) o `fal-ai/fashn/tryon/v1.5`.

---

## 2. Estructura Principal de Archivos y Carpetas

```text
├── landing/                    # Landing comercial de CapFit (capfit.store)
│   ├── index.html              # HTML de la landing (6 etapas narrativas + GSAP)
│   ├── css/landing.css         # Estilos editoriales, paleta cálida y efectos 3D
│   ├── js/landing.js           # Orquestación de scroll, tabs, filtros y cursor
│   └── assets/                 # Recursos fotográficos de la landing
├── index.html                  # Aplicación web principal (Tienda demo y cliente)
├── server.js                   # Servidor central Node.js (proxy, routing y API)
├── vercel.json                 # Configuración de despliegue y enrutamiento en Vercel
├── api/                        # Funciones serverless de Vercel
│   ├── serverless.js           # Wrapper que delega en server.js
│   └── [...route].js           # Proxy fal.ai alternativo
├── src/                        # Núcleo del backend y servicios de dominio
│   ├── store-manager.js        # Gestión y caché de tiendas, resolución multi-tenant y cuotas
│   ├── firebase-db.js          # Adaptador Firestore (lectura/escritura de catálogos y órdenes)
│   ├── auth-guard.js           # Guardias de autorización, verificación JWT y roles
│   ├── mercadopago-subscriptions.js # Suscripciones y planes comerciales
│   └── customer-service.js     # Soporte y gestión de clientes
├── js/                         # JavaScript de la aplicación principal
│   ├── store.js                # Estado de la tienda activa en frontend
│   ├── catalogo.js             # Renderizado y filtros de productos en la tienda
│   ├── camera.js               # Captura de video/foto y guías de encuadre
│   ├── tryon.js                # Envío de imágenes al probador virtual y renderizado
│   ├── admin.js                # Backoffice y panel administrativo de la tienda
│   ├── ui.js                   # Enrutador por hash (#probador, #carrito, #admin, etc.)
│   ├── firebase-auth.js        # Conexión con Firebase Auth SDK en cliente
│   └── suscripcion.js          # Selección y pago de planes con Mercado Pago
├── tests/                      # Suites de testing automatizadas
│   ├── domains-and-landing.test.js # Validación de enrutamiento por host
│   └── security.test.js        # Validación de aislamiento y reglas multi-tenant
└── assets/                     # Catálogo de gorras y anteojos de demostración
```

---

## 3. Lógica de Negocio y Reglas Críticas

1. **Resolución y Separación de Dominios**:
   - `capfit.store` & `www.capfit.store`: Landing comercial oficial para captación de marcas y ventas (ambos dominios sirven la landing directamente sin redirección).
   - `app.capfit.store`: Tienda de demostración insignia (`id: 'principal'`).
   - `admin.capfit.store`: Portal exclusivo para el backoffice y login de dueños. Cualquier acceso a `/admin` o `/account` desde dominios de tiendas públicas es redirigido con HTTP 302 a este subdominio.
   - `[subdominio].capfit.store`: Tiendas privadas de clientes aisladas en Firestore.
2. **Protección Anti-Spoofing Multi-Tenant**:
   - `StoreManager.resolveStoreFromRequest` prioriza estrictamente el encabezado `Host`.
   - Si un cliente intenta inyectar `?store=tienda_ajena` desde el subdominio de su tienda, el servidor ignora el parámetro y fuerza la tienda del host, previniendo suplantaciones o consumo no autorizado de cuotas.
3. **Gestión de Cuota de IA y Reintegros Automáticos**:
   - Cada tienda tiene un límite mensual (`aiMonthlyLimit`).
   - Al solicitar una prueba virtual se valida el crédito de forma preliminar.
   - Si la llamada a `fal.ai` falla (5xx, timeout o rechazo del modelo), el backend ejecuta inmediatamente `StoreManager.refundAiCredit` para restaurar el crédito al balance de la tienda.
4. **Seguridad y Control de Acceso (RBAC)**:
   - SuperAdmin accede únicamente mediante contraseña maestra (`ADMIN_PASSWORD`), recibiendo token HMAC-SHA256 con expiración.
   - Los dueños de tienda no pueden modificar datos financieros, cuotas mensuales (`aiMonthlyLimit`) ni administrar recursos de otros inquilinos (aislamiento verificado con 11/11 tests de seguridad).

---

## 4. Últimos Cambios y Estado Actual

- **Separación de la Landing Comercial**:
  - Código desacoplado completamente de la aplicación principal dentro de `/landing/`.
  - Servido condicionalmente según el `Host` (`capfit.store` o ruta local `/landing`).
- **Implementación Visual Editorial y Scrolleytelling**:
  - Header institucional respetado con navegación anclada.
  - 6 etapas narrativas animadas (Hero con tilt 3D, probador virtual guiado en 3 pasos, tienda interactiva con filtros, maqueta de backoffice y comparador de planes).
- **Resolución del Bucle `ERR_TOO_MANY_REDIRECTS`**:
  - Se identificó un conflicto entre la regla de redirección `301` en `vercel.json` y la redirección `308` automática de Vercel en `capfit.store`.
  - Se actualizó `vercel.json` y `server.js` para servir `/landing/` de forma nativa en ambos dominios (`capfit.store` y `www.capfit.store`), desactivando el rebote infinito.
- **Acción sugerida para el usuario en Vercel**:
  - En **Settings → Domains** de Vercel, configurar `capfit.store` como dominio principal de producción (sin redirección) y dejar que Vercel gestione si desea redirigir `www.capfit.store` hacia `capfit.store` en un único sentido.
- **Popup Modal "Early Stage Startup" en la Landing Comercial**:
  - Modal editorial incorporado exactamente según el diseño aprobado en `/landing/index.html` con backdrop blur, tipografía serif Cormorant Garamond, acento naranja en *Virtual Try-On.* y botón CTA `PROBAR CAPFIT →`.
  - El botón CTA redirige directamente a `https://app.capfit.store/` para explorar la tienda demo.
  - Apertura programada automáticamente tras cargar la imagen principal del Hero / completar la animación de entrada inicial.
  - Cierre interactivo mediante botón `✕`, clic fuera del modal o tecla `Escape`.
- **Integración de Google Analytics 4 (GA4)**:
  - Carga asíncrona no bloqueante de `gtag.js` con anonimización de IP (`anonymize_ip: true`) implementada en `/js/analytics.js` y `/landing/js/analytics.js`.
  - Configurado en `landing/index.html` (landing comercial `capfit.store`) y en `index.html` (tienda y probador `app.capfit.store`).
  - ID de medición activo: `G-RJFGW1349J` configurado directamente en `js/analytics.js`, `landing/js/analytics.js` y endpoint `GET /api/analytics-config` (con override opcional vía variable de entorno `GA_MEASUREMENT_ID`).
  - Registro de eventos personalizados: vistas de página, clics en CTAs de la landing (`cta_click`), apertura del modal de startup (`startup_modal_view`), inicio de probador virtual (`tryon_start`), renderizado exitoso (`tryon_complete`) y compra/carrito (`add_to_cart`).
- **Estado de Pruebas**:
  - `npm test`: **21/21 pruebas pasando** (10 de enrutamiento/landing/analytics + 11 de seguridad multi-tenant).
  - Linter: `npm run lint` ejecutado con éxito sin errores de sintaxis.


