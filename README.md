# CAPFIT - Plataforma SaaS Multi-Tienda con Probador Virtual IA

CAPFIT es una plataforma SaaS de comercio electrónico para marcas y tiendas de moda urbana y gorras, equipada con un motor de Probador Virtual (Virtual Try-On) impulsado por modelos de visión e inteligencia artificial de última generación.

---

## 1. Arquitectura del Sistema

### 1.1 Flujo Cliente → Proxy → fal.ai

```
[ Cliente / Navegador ]
        │  1. Captura de foto con cámara o carga de galería
        │  2. Comprime imagen en canvas con comprimirFoto() (max 1024px, JPEG 0.85)
        ▼
[ Backend Proxy Node.js / Vercel Serverless ]
        │  3. Valida tamaño del body (máx 6MB, rechazo 413) y formato JSON
        │  4. Rate limiter por IP (máx 10 req/min en endpoints de IA)
        │  5. Sube las imágenes a fal storage con uploadDataURItoFal() obteniendo URLs públicas
        │  6. Verifica y descuenta cuota mensual de IA de la tienda
        ▼
[ fal.ai Inference Engine ]
        │  7. Ejecuta openai/gpt-image-2.5/sunburst/edit (con fallback a openai/gpt-image-2/edit)
        │     o fal-ai/fashn/tryon/v1.5
        ▼
[ Backend Proxy ]
        │  8. Si fal.ai responde 200 OK: el crédito queda descontado definitivamente.
        │     Si fal.ai responde error (5xx, timeout, fallo de modelo): StoreManager.refundAiCredit().
        ▼
[ Cliente / Navegador ]
           Muestra el resultado del probador virtual y permite compartir o comprar vía WhatsApp/Checkout.
```

### 1.2 Control de Cuota Mensual y Reintegros Automáticos

- Cada tienda cuenta con un límite mensual de generaciones de IA (`aiMonthlyLimit`, por defecto 100 créditos en plan Starter).
- **Manejo de deducción y reintegro**:
  1. El backend valida el payload localmente. Si la solicitud es inválida (campos faltantes o payload > 6MB), devuelve 400/413 y **nunca descuenta crédito**.
  2. Si la solicitud es válida y hay saldo disponible, descuenta 1 crédito de forma preliminar (`checkAndDeductAiCredit`).
  3. Se invoca a `fal.ai`.
  4. Si la llamada es exitosa (`status: 200`), el crédito queda registrado como consumido en la tienda y se asienta en la colección `ai_logs` de Firestore.
  5. Si la llamada al servicio externo falla (error 5xx, timeout, o respuesta de error de fal), el servidor invoca automáticamente `refundAiCredit` para devolver el crédito a la tienda de forma inmediata.

### 1.3 Resolución de Tiendas por Subdominio y Protección Anti-Abuso

- **`admin.capfit.store`**: Subdominio dedicado exclusivamente a la administración y login (`isAdminPortal: true`). Todas las rutas `/admin` y `/account` provenientes de dominios de tiendas públicas son redirigidas con HTTP 302 a `admin.capfit.store`.
- **`capfit.store` / `www.capfit.store`**: Tienda insignia principal (`id: 'principal'`).
- **`[subdominio].capfit.store`**: Tienda específica asignada al tenant, con su propio catálogo, banners, información y cuota mensual.
- **Protección Anti-Abuso**:
  - `StoreManager.resolveStoreFromRequest(req)` resuelve prioritariamente la tienda a partir del `Host` header del request.
  - Si un usuario o atacante envía un parámetro `?store=tienda_victima` desde el host de otra tienda, el servidor detecta la discrepancia y **fuerza el uso de la tienda del host**, evitando el consumo cruzado de créditos o la suplantación de identidad (spoofing).
  - En entornos locales o de desarrollo compartido (`localhost`, Cloud Run), se valida estrictamente que el parámetro pertenezca a una tienda registrada y activa antes de seleccionarla.

### 1.4 Rate Limiting en Endpoints de IA

- Limitador en memoria por dirección IP en `/api/gpt/edit`, `/api/fal/submit` y `/api/anthropic` (10 solicitudes por minuto por IP).
- **Limitación documentada**: En arquitecturas serverless con múltiples instancias efímeras, el contador en memoria se reinicia ante *cold starts*. La implementación está encapsulada en el objeto `aiRateLimiter`, lista para conectarse directamente a un cluster Redis / Upstash (`redis.incr` / `redis.expire`) cuando el tráfico lo requiera.

### 1.5 Registro Estructurado y Seguro de Logs

- Se eliminaron todos los volcados masivos de datos (`[DEBUG]` con API keys parciales, headers HTTP y primeros caracteres del body).
- El servidor emite logs estructurados mínimos y sanitizados:
  `[REQ] endpoint=/api/gpt/edit status=200 duration=1140ms storeId=urban`
- Ninguna credencial privada ni token viaja a la salida estándar ni al cliente.

---

## 2. Comandos del Proyecto

| Comando | Descripción |
| :--- | :--- |
| `npm run dev` | Inicia el servidor Node.js en modo desarrollo en el puerto 3000 (`node server.js`). |
| `npm start` | Inicia el servidor de producción full-stack en Node.js. |
| `npm run test:rules` | Ejecuta el script de validación sintáctica y verificación de colecciones en `firestore.rules`. |
| `npm run deploy` | Despliega la aplicación a Vercel (`vercel --prod`). |
| `npm run lint` | Valida la integridad del código fuente. |

---

## 3. Variables de Entorno

Crear un archivo `.env` basado en `.env.example`:

| Variable | Requerida | Descripción | Ejemplo |
| :--- | :---: | :--- | :--- |
| `FAL_KEY` | **SÍ** | API key de fal.ai para la generación con modelos de imagen. | `key_abc123...` |
| `ALLOWED_ORIGINS` | **SÍ** | Orígenes permitidos para CORS (separados por coma). | `https://capfit.store,https://admin.capfit.store` |
| `ADMIN_PASSWORD` | **SÍ** | Contraseña maestra para acceso SuperAdmin al SaaS. | `capfit2026` |
| `SUPERADMIN_EMAIL`| No | Correo con privilegios globales de SuperAdmin. | `lucasg33322@gmail.com` |
| `ANTHROPIC_KEY` | No | API key de Anthropic para asistentes inteligentes. | `sk-ant-...` |
| `PORT` | No | Puerto de escucha del servidor HTTP (default: `3000`). | `3000` |

---

## 4. Modelo de Seguridad en Firestore (`firestore.rules`)

El archivo `firestore.rules` implementa control de acceso basado en roles (RBAC) y validación de esquemas:

- **`stores/{storeId}`**:
  - **Lectura (`get`, `list`)**: Pública (`true`) para permitir que cualquier comprador cargue la marca y catálogo de la tienda.
  - **Escritura (`create`, `update`, `delete`)**: Requiere autenticación de administrador o validación de estructura con `isValidStore(incoming())`.
- **`stores/{storeId}/products/{productId}` y `products/{productId}`**:
  - **Lectura**: Pública (`true`).
  - **Escritura**: Restringida a administradores de la tienda correspondiente (`isStoreAdmin()`) o usuarios autenticados validados con `isValidProduct()`.
- **`orders/{orderId}`**:
  - **Creación (`create`)**: Permitida a clientes públicos durante el checkout mediante `isValidOrder(incoming())`.
  - **Lectura y Modificación**: Exclusiva para el dueño de la tienda destinataria o SuperAdmin.
- **`ai_logs/{logId}`**:
  - **Creación (`create`)**: Registros de auditoría de consumo y reintegro generados por el backend.
  - **Lectura (`get`, `list`)**: Solo usuarios autenticados y administradores. Modificaciones o eliminaciones prohibidas.
- **`store_owners/{userId}`**:
  - **Lectura y Escritura**: Exclusiva para el usuario propietario correspondiente (`request.auth.uid == userId`) y SuperAdmin global (`lucasg33322@gmail.com`).

---

## 5. Nota sobre `backup_firebase_previous_project.json`

El archivo `backup_firebase_previous_project.json` contenía un volcado estático preliminar de datos de prueba utilizado durante la fase de migración hacia Firestore y subdominios multi-tenant. Debido a que contenía datos de prueba locales y contraseñas de desarrollo, fue removido del repositorio de control de versiones por buenas prácticas de seguridad. La persistencia actual se realiza directamente en Firebase Firestore en tiempo real con aislamiento de credenciales por variables de entorno.
