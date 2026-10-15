# Blindaje de Seguridad y Control de Acceso Multi-Tienda — CapFit

Este plan detalla la iteración de remediación de seguridad para **CapFit**, enfocada en cerrar los vectores de escalada de privilegios, proteger los endpoints administrativos, financieros y de pedidos en el servidor, eliminar contraseñas de prueba cableadas y resguardar las credenciales de pasarela de pagos sin interrumpir la experiencia de compra ni la administración legítima de cada tienda.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> Las siguientes decisiones estratégicas fueron confirmadas y gobiernan la implementación de esta fase:

- **Decisión Confirmada 1 — Unificación en el proyecto Firebase `capfit-6689b`**: Tanto el cliente (autenticación de compradores y dueños de tienda) como el servidor y las reglas de Firestore operarán exclusivamente sobre el proyecto `capfit-6689b`, eliminando la desincronización de identidades con `capfit-ab244`.
- **Decisión Confirmada 2 — Autenticación Dual Verificada en Servidor (Firebase JWT + HMAC)**: El backend validará criptográficamente los ID Tokens de Firebase Auth (mediante las claves públicas RSA oficiales de Google Secure Token) y emitirá tokens de sesión firmados con HMAC-SHA256 para los inicios de sesión validados contra `store_secrets` o variables de entorno. Ningún endpoint confiará en valores de `sessionStorage` no firmados ni en cabeceras públicas.
- **Decisión Confirmada 3 — Creación de Pedidos con Estado de Pago Pendiente**: Toda orden creada desde el checkout público (`POST /api/orders`) se registrará forzosamente con `status: 'pending'` y `paymentStatus: 'Pendiente'`. Solo el dueño autenticado de la tienda o un webhook verificado de Mercado Pago podrá cambiar el estado de pago a `'Aprobado'`.

> [!WARNING]
> **Efectos Secundarios Esperados y Mitigación:**
> 1. **Re-inicio de sesión único en navegadores con sesiones previas**: Al unificar el proyecto Firebase a `capfit-6689b` y exigir tokens firmados por el servidor en `Authorization: Bearer <token>`, las sesiones antiguas guardadas en `sessionStorage` con tokens planos (`capfit_store_...`) deberán volver a iniciar sesión una vez.
> 2. **Bloqueo de contraseñas de prueba (`123456`, `tienda1pass`, `tienda2pass`)**: Los inicios de sesión que dependían de claves de demostración serán rechazados con `401 Unauthorized`. El acceso administrativo funcionará mediante Firebase Auth (Google / Email del dueño registrado) o mediante las credenciales reales configuradas en `store_secrets` / `ADMIN_PASSWORD`.
> 3. **Restricción de `/api/subscriptions/simulate-approval`**: Este endpoint quedará deshabilitado en producción (`403 Forbidden`) y solo podrá ejecutarse cuando `NODE_ENV === 'development'` (o `ALLOW_SUBSCRIPTION_SIMULATION === 'true'`) **y** la petición esté autenticada como dueño de la tienda o SuperAdmin.

---

## 1. Overview & Core Concept

- **What It Does**: Transforma el servidor de CapFit de un proxy permisivo a una capa de control de acceso multi-tenant (Zero-Trust por tienda). Cada operación administrativa, de catálogo, de suscripción o de pedidos verifica la identidad criptográfica del usuario y comprueba que tenga permisos sobre el `storeId` objetivo antes de leer o mutar datos.
- **Target Audience / Persona**:
  - **Dueños de Tienda (Tenants)**: Administran su propio catálogo, secciones, pedidos y suscripción con aislamiento total respecto de otras tiendas.
  - **Compradores (CapFit ID)**: Inician sesión, gestionan su perfil de calce y direcciones, y consultan únicamente sus propios pedidos y generaciones de probador virtual.
  - **SuperAdmin de Plataforma**: Supervisa el ecosistema global de tiendas y la configuración de pasarela.
- **Key Value**: Impide la toma de control de tiendas ajenas, evita la activación gratuita de planes pagos (`Enterprise`/`Pro`), protege los datos personales (PII) de los compradores en los pedidos y prepara la migración limpia de secretos de Mercado Pago hacia variables de entorno.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Flujo de Dueño de Tienda / Backoffice**: El dueño inicia sesión con Google o Email/Contraseña en el panel de administración. El frontend obtiene el `idToken` de Firebase (o el token HMAC emitido por `/api/admin/login` tras verificar `store_secrets`) y lo adjunta automáticamente en la cabecera `Authorization: Bearer <token>` en todas las llamadas del panel (crear/editar/eliminar productos, editar secciones informativas, actualizar seguimiento de pedidos y gestionar planes).
  2. **Flujo de Comprador (Checkout y Mi Cuenta)**: El comprador realiza su pedido desde el carrito; la orden nace con estado `Pendiente` de verificación de pago y vinculada estrictamente al `storeId` activo. En el modal de "Mi Cuenta", las consultas y actualizaciones de perfil, selfies, direcciones e historial de compras envían el `idToken` de Firebase del comprador para que solo pueda acceder a su propio `uid`.
- **Visual Identity & Theme**:
  - Se preserva íntegramente la estética actual de CapFit (tipografía `Plus Jakarta Sans`, paleta neutra `#0F172A` / `#FFFFFF` con acento `#10B981`, y números tabulares `tabular-nums` en precios, cuotas y métricas de órdenes).
- **Interactive Feedback & Motion**:
  - Cuando una sesión administrativa expira o carece de permisos sobre una tienda (`401` / `403`), el panel muestra un aviso claro e invita a reautenticarse sin exponer trazas internas del servidor.
  - En el recibo del checkout, la etiqueta de estado reflejará con transparencia `Pendiente de verificación` hasta su confirmación.

---

## 3. Key Product Decisions & Trade-Offs

- **Decisión 1: Verificación de Identidad sin Dependencias Externas Frágiles**
  - *Chosen Approach*: Implementar un módulo dedicado de autenticación en el servidor que:
    1. Verifique la firma RS256, expiración (`exp`), audiencia (`aud: 'capfit-6689b'`) y emisor (`iss`) de los ID Tokens de Firebase Auth usando el módulo nativo `crypto` de Node.js contra los certificados públicos oficiales de Google (`https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com`, con caché en memoria respetando `Cache-Control`).
    2. Emita y verifique tokens de sesión administrativa firmados con `crypto.createHmac('sha256', secret)` con tiempo de expiración (`exp`), `role` (`store_owner` | `superadmin`) y `storeId` vinculado.
  - *Why*: Garantiza validación criptográfica real en cualquier entorno Node.js / Vercel Serverless sin depender de que exista un archivo JSON de cuenta de servicio privado para poder validar JWTs de usuarios, y documenta explícitamente el requisito de cuenta de servicio (`FIREBASE_SERVICE_ACCOUNT_KEY`) para operaciones privilegiadas de `firebase-admin`.
  - *Alternatives Considered*: Confiar en decodificar el payload del JWT sin verificar la firma (descartado por inseguro, ya que permitiría falsificar cualquier `uid` o `email`).

- **Decisión 2: Protección Granular de Pedidos y Estado de Pago**
  - *Chosen Approach*:
    - `POST /api/orders`: Público para permitir compras de visitantes, pero el servidor ignora cualquier `paymentStatus` o `status` enviado por el cliente y fuerza `status: 'pending'` y `paymentStatus: 'Pendiente'`. Además, valida que los precios unitarios y el subtotal coincidan con el catálogo real de la tienda (`StoreManager.readStoreProducts(targetStoreId)`), evitando manipulación de precios desde el cliente.
    - `GET /api/orders`: Restringido exclusivamente al dueño autenticado de `targetStoreId` o SuperAdmin.
    - `PUT /api/orders/:id`: Restringido exclusivamente al dueño autenticado de la tienda a la que pertenece el pedido o SuperAdmin.
    - `GET /api/customer/orders`: Requiere token de comprador autenticado y devuelve únicamente las órdenes cuyo `userId` o `buyerEmail` coincida con el token verificado.
  - *Why*: Cierra simultáneamente la fuga de datos personales de compradores entre tiendas y el fraude de órdenes marcadas como pagadas desde el navegador.

- **Decisión 3: Gestión de Credenciales de Mercado Pago y Archivos Duplicados**
  - *Chosen Approach*:
    - Priorizar la lectura de `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_PUBLIC_KEY` y `MERCADO_PAGO_WEBHOOK_SECRET` desde variables de entorno (`process.env`).
    - Mantener la lectura de respaldo del archivo de configuración local solo si las variables de entorno no están definidas para no romper el entorno actual, pero añadir `data/mercadopago_config.json` a `.gitignore`, bloquear cualquier escritura en disco en producción y exigir rol `superadmin` verificado en `POST /api/admin/subscriptions/config` y `/api/subscriptions/config/test`.
    - Mantener los archivos de `/api/*` existentes sin eliminarlos, pero redirigir o proteger aquellos que pudieran invocarse directamente para que pasen por las mismas validaciones de seguridad.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Security Gate Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         CLIENTE (Navegador / UI)                             │
│                                                                              │
│  ┌──────────────────────────────┐        ┌────────────────────────────────┐  │
│  │ Backoffice (AdminPanel)      │        │ Tienda & Cuenta Comprador      │  │
│  │ Envía Authorization: Bearer  │        │ Firebase Auth (capfit-6689b)   │  │
│  │ (Token Firebase o HMAC)      │        │ Envía Authorization: Bearer    │  │
│  └──────────────┬───────────────┘        └───────────────┬────────────────┘  │
└─────────────────┼────────────────────────────────────────┼───────────────────┘
                  │                                        │
                  ▼                                        ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                  MIDDLEWARE DE AUTORIZACIÓN EN SERVIDOR                      │
│                                                                              │
│  1. Extrae Bearer Token de cabecera Authorization                            │
│  2. Si es JWT Firebase ──► Verifica firma RS256 (Google Public Certs),       │
│                            exp, iss y aud === 'capfit-6689b'                 │
│  3. Si es Token Admin  ──► Verifica firma HMAC-SHA256 y expiración           │
│  4. Resuelve permisos  ──► ¿Es SuperAdmin? / ¿Es dueño de targetStoreId?     │
│                            / ¿Es el propio comprador (uid === targetUid)?    │
└─────────┬──────────────────────────────┬───────────────────────────┬─────────┘
          │                              │                           │
          ▼                              ▼                           ▼
┌─────────────────────────┐  ┌──────────────────────────┐  ┌───────────────────┐
│ Endpoints Admin Tienda  │  │ Endpoints Financieros    │  │ Endpoints Pedidos │
│ - POST/PUT/DEL products │  │ - /subscriptions/config  │  │ - POST /orders    │
│ - PUT /stores/:id       │  │   (Solo SuperAdmin)      │  │   (Forzado a      │
│ - PUT /stores/:id/sect. │  │ - /simulate-approval     │  │    Pendiente +    │
│ - POST /admin/upload    │  │   (Bloqueado en prod;    │  │    precio real)   │
│ - GET/PUT /orders       │  │    dev requiere Auth)    │  │ - GET /customer/* │
│ (Requiere StoreOwner)   │  │ - /cancel (StoreOwner)   │  │   (Solo Self UID) │
└─────────────────────────┘  └──────────────────────────┘  └───────────────────┘
```

### Mapa de Endpoints y Reglas de Autorización a Aplicar

| Endpoint | Método | Datos que Lee / Modifica | Protección de Servidor a Implementar |
| :--- | :---: | :--- | :--- |
| `/api/admin/login` | `POST` | Emite token de sesión administrativa | Elimina claves demo (`123456`, `tienda1pass`, `tienda2pass`, fallback `'capfit2026'`). Verifica contra `store_secrets` o `process.env.ADMIN_PASSWORD` y devuelve token firmado con HMAC. |
| `/api/admin/auth/firebase-verify` | `POST` | Vincula dueño y emite sesión | Exige y verifica criptográficamente el `idToken` de Firebase; ignora `customClaims` o `firestoreUserData` enviados en el body por el cliente. |
| `/api/admin/auth/firebase-register` | `POST` | Crea nueva tienda y asigna dueño | Exige `idToken` de Firebase verificado y toma `uid` y `email` exclusivamente del token verificado. |
| `/api/admin/stores` | `GET`, `POST` | Lista todas las tiendas con métricas / Crea tienda | Requiere sesión verificada con rol `superadmin` (en `POST` permite también a un usuario Firebase verificado registrar su tienda). |
| `/api/admin/stores/:id` | `PUT` | Modifica plan, cuotas y configuración de tienda | Requiere `superadmin` para alterar `plan`, `planId` o `aiMonthlyLimit`. El `store_owner` de esa tienda solo puede editar metadatos no financieros (`name`, `tagline`, `brandColor`). |
| `/api/stores/:id/about` y `/api/stores/:id/sections` | `PUT`, `POST` | Modifica secciones institucionales de la tienda | `GET` se mantiene público; `PUT`/`POST` exige `store_owner` de `:id` o `superadmin`. |
| `/api/admin/products`, `/api/admin/products/:id`, `/api/admin/products/sync`, `/api/admin/upload` | `POST`, `PUT`, `DELETE` | Crea, edita, sincroniza o elimina productos y sube imágenes | Exige `store_owner` de la tienda objetivo (`targetStoreId`) o `superadmin`. |
| `/api/admin/subscriptions/config` y `/api/subscriptions/config/test` | `POST`, `GET` | Actualiza o prueba el `accessToken` global de Mercado Pago | Exige estrictamente rol `superadmin` autenticado. |
| `/api/subscriptions/create-preapproval` y `/api/subscriptions/cancel` | `POST` | Inicia o cancela suscripción de una tienda | Exige `store_owner` de `storeId` o `superadmin`. |
| `/api/subscriptions/simulate-approval` | `POST` | Activa un plan sin pasarela de pago | **Deshabilitado en producción (`403 Forbidden`)**. Solo habilitado si `NODE_ENV === 'development'` (o `ALLOW_SUBSCRIPTION_SIMULATION === 'true'`) **y** autenticado como `store_owner` o `superadmin`. |
| `/api/orders` | `GET` | Lista todos los pedidos de una tienda (con PII) | Exige `store_owner` de `targetStoreId` o `superadmin`. |
| `/api/orders` | `POST` | Crea un nuevo pedido desde checkout y descuenta stock | Público para compradores, pero **fuerza** `paymentStatus: 'Pendiente'` y `status: 'pending'`, recalcula el total según precios oficiales del catálogo de `targetStoreId`, y si incluye `userId` verifica el token del comprador. |
| `/api/orders/:id` | `PUT` | Actualiza estado de pago, envío y código de seguimiento | Exige `store_owner` de la tienda dueña del pedido o `superadmin`. |
| `/api/customer/*` y `/api/tryon/generations` | `GET`, `POST`, `PUT`, `DELETE` | Perfil CapFit ID, selfies, direcciones, wishlist e historial de órdenes del comprador | Exige token Firebase verificado cuyo `uid` (y `email`) coincida con el usuario objetivo de la petición. |

### Estrategia de Verificación y Pruebas Automatizadas

Se creará una suite de pruebas automatizadas ejecutable con Node.js que levantará el manejador del servidor y verificará empíricamente:
1. **Rechazo de peticiones anónimas (`401 Unauthorized`)** en `/api/admin/products`, `/api/admin/stores/:id`, `/api/admin/subscriptions/config`, `GET /api/orders` y `PUT /api/orders/:id`.
2. **Eliminación de contraseñas de prueba (`401 Unauthorized`)** al intentar iniciar sesión con `123456`, `tienda1pass` o `tienda2pass`.
3. **Aislamiento entre tiendas (`403 Forbidden`)** cuando el dueño autenticado de `tienda1` intenta modificar productos, secciones, pedidos o suscripciones de `tienda2`.
4. **Bloqueo de escalada financiera (`403 Forbidden`)** al invocar `/api/subscriptions/simulate-approval` en modo producción o cuando un dueño de tienda intenta aumentarse su propio `aiMonthlyLimit` o `plan` vía `PUT /api/admin/stores/:id`.
5. **Integridad de pedidos (`POST /api/orders`)** comprobando que una petición anónima que envía `paymentStatus: 'Aprobado'` y un precio adulterado resulta en una orden creada con `paymentStatus: 'Pendiente'` y con el precio real del catálogo de la tienda.
