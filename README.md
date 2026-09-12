# CapFit — E-Commerce Multi-Tenant de Gorras con Probador Virtual IA

CapFit es una plataforma de comercio electrónico multi-tenant de gorras y accesorios urbanos con probador virtual en tiempo real potenciado por Inteligencia Artificial (fal.ai FASHN y OpenAI / GPT-Image-2).

---

## 🏗️ Arquitectura del Sistema

El proyecto opera bajo una arquitectura híbrida optimizada para máximo rendimiento y simplicidad de despliegue:
- **Frontend:** Vanilla JavaScript (ES6+), HTML5 semántico y CSS3 responsivo. Sin frameworks pesados ni build step intrusivo.
- **Backend de Producción:** Vercel Serverless Functions (`/api/*`).
- **Backend de Desarrollo Local:** Servidor Node.js nativo (`server.js`) con paridad total de endpoints y proxy seguro de IA.
- **Persistencia en la Nube:** Firebase Firestore para gestión multi-tienda, catálogo de productos, órdenes, cuotas mensuales de IA y contenidos dinámicos.
- **Pagos:** Checkout integrado con Mercado Pago (`js/mercadopago.js`).

---

## 📁 Estructura Modular de Archivos

```
capfit/
├── index.html                   # Entry point de la aplicación SPA
├── server.js                    # Servidor de desarrollo local (Node.js nativo)
├── vercel.json                  # Configuración de rutas y builds para Vercel
├── api/                         # Funciones Serverless (Vercel)
│   ├── fal/
│   │   ├── submit.js            # Encola peticiones a fal.ai (FASHN)
│   │   ├── status.js            # Consulta estado (IN_QUEUE / IN_PROGRESS / COMPLETED)
│   │   └── result.js            # Recupera URL de la imagen generada
│   ├── gpt/
│   │   └── edit.js              # Proxy para modelo gpt-image-2
│   ├── stores/                  # API multi-tenant (tiendas, secciones, productos)
│   └── mercadopago/             # Endpoints de creación de preferencias y webhooks
├── js/
│   ├── config.js                # Parámetros globales y configuración de la app
│   ├── ui.js                    # Inicialización visual y observadores de interacción
│   ├── mercadopago.js           # Integración con Mercado Pago SDK
│   ├── core/                    # Módulos centrales
│   │   ├── router.js            # Enrutador SPA basado en hash y rutas virtuales
│   │   ├── store.js             # Estado global reactivo y sincronización de datos
│   │   └── firebase-client.js   # Wrapper para Firestore y Authentication
│   ├── utils/                   # Utilidades puras
│   │   ├── dom.js               # Helpers para manipulación segura del DOM
│   │   ├── format.js            # Formato de precios (ARS) y fechas
│   │   └── image-utils.js       # Compresión canvas de fotos (<= 1024px, 85% JPEG)
│   └── features/                # Módulos funcionales desacoplados (< 300 líneas)
│       ├── tryon/               # Probador Virtual
│       │   ├── camera.js        # Acceso y control de webcam
│       │   ├── face-detection.js# Validación geométrica y detección de rostro
│       │   └── tryon.js         # Orquestador del flujo IA, compresión y polling
│       ├── catalog/             # Catálogo de productos y filtrado por categoría
│       ├── cart/                # Carrito de compras y cálculo de totales
│       ├── admin/               # Panel de administración multi-tienda
│       │   ├── admin-auth.js    # Autenticación y control de roles
│       │   ├── admin-quota.js   # Monitor de consumo de cuota mensual de IA
│       │   ├── admin-orders.js  # Gestión y cambio de estado de pedidos
│       │   └── admin-products.js# CRUD de productos y carga de imágenes
│       └── pages/               # Páginas dinámicas e institucionales
│           ├── sections-data.js # Textos y secciones por defecto
│           └── pages-render.js  # Renderizado DOM de FAQ, envíos, términos, etc.
└── css/
    └── style.css                # Estilos globales y temas visuales
```

---

## 🧠 Flujo del Probador Virtual con IA

1. **Captura / Subida de Foto:** El usuario se toma una foto con su cámara o sube un archivo desde su galería.
2. **Validación de Rostro:** `FaceDetection.verifyFace` comprueba la presencia de rostro antes de enviar datos al servidor para no malgastar cuota.
3. **Compresión en Cliente:** `comprimirFoto` redimensiona la imagen a máximo 1024px con 85% de calidad JPEG, garantizando que el payload nunca exceda el límite de Vercel (4.5 MB).
4. **Control de Cuota:** Cada tienda dispone de un límite configurable (ej. 100 fotos/mes). Si la cuota se agota, se retorna HTTP 429 con mensaje claro al usuario.
5. **Polling de Estado Real:**
   - La UI muestra el tiempo transcurrido en segundos reales (reemplazando barras de progreso aleatorias).
   - Consulta `/api/fal/status` reconociendo estados `IN_QUEUE` ("En cola…") y `IN_PROGRESS` ("Generando prenda y ajustando rostro…").
6. **Resiliencia y Reintentos:**
   - Si se alcanzan los 60 segundos de espera, el cliente ejecuta 2 consultas adicionales al endpoint de resultado con 3 segundos de pausa antes de notificar error.
   - En caso de fallo, se preserva el `reqId` y la foto procesada, permitiendo al usuario reintentar con un solo clic.
   - Fallback visual con banner de advertencia si la IA no logra procesar la prenda.

---

## 🔒 Seguridad y Manejo de Claves

- **Zero Client-Side Secrets:** Las API keys de fal.ai (`FAL_KEY`) y OpenAI (`OPENAI_API_KEY`) residen exclusivamente en variables de entorno del servidor.
- **Aislamiento Multi-Tenant:** Todas las consultas a Firestore validan el `storeId` para evitar acceso cruzado entre comercios.
- **Transacciones Seguras:** El flujo de pago de Mercado Pago se inicializa mediante preferencias firmadas en backend.

---

## 🚀 Despliegue y Configuración

### Variables de Entorno Requeridas:
```env
FAL_KEY=tu_clave_de_fal_ai
OPENAI_API_KEY=tu_clave_de_openai
MERCADOPAGO_ACCESS_TOKEN=tu_access_token
FIREBASE_CONFIG={"apiKey":"...","projectId":"..."}
```

### Ejecución Local:
```bash
npm install
npm run dev
# Servidor escuchando en http://localhost:3000
```
