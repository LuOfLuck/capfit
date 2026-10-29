# Integración de Google Analytics 4 (GA4) en CapFit

Implementar la medición y analítica web en CapFit mediante Google Analytics 4 (gtag.js), permitiendo registrar el tráfico total de visitantes, fuentes de adquisición y eventos clave de interacción tanto en la landing comercial (`capfit.store`) como en la aplicación de la tienda y el probador virtual con IA (`app.capfit.store`).

---

## Decisiones del Usuario y Puntos Críticos

> [!IMPORTANT]
> A continuación se resumen las decisiones confirmadas en la fase de aclaración y la configuración necesaria antes de la ejecución:

- **Alcance de la medición**: **Híbrido completo** — se medirá tanto el tráfico de la landing comercial (`landing/index.html`) como el de la aplicación web de la tienda y probador virtual (`index.html`).
- **ID de Medición (Measurement ID)**: Se creará un módulo unificado de analítica con soporte para configurar tu ID de Google Analytics 4 (`G-XXXXXXXXXX`). Podrás proveer tu código directamente o definirlo mediante la variable de entorno `GA_MEASUREMENT_ID`.
- **Eventos a registrar**:
  1. *Visitas a páginas* (`page_view` estándar de GA4).
  2. *Interacciones en la Landing*: Clics en botones CTA ("PROBAR CAPFIT", "Explorar Tienda Demo", "Planes", apertura y cierre del modal de startup).
  3. *Embudo del Probador Virtual con IA*: Selección de prenda/gorra (`select_item`), captura/subida de foto (`upload_photo`), inicio de procesamiento IA (`tryon_start`), y visualización exitosa del resultado (`tryon_complete`).
  4. *E-commerce y Conversión*: Apertura de modal de compra / agregado a carrito y clic en checkout de Mercado Pago.

---

## 1. Visión General y Concepto Central

- **Propósito**: Proporcionar visibilidad precisa del volumen de visitantes, comportamiento de navegación y tasa de conversión del probador virtual sin degradar la velocidad de carga ni comprometer la privacidad o el rendimiento.
- **Público Objetivo**: Administradores de CapFit y dueños de tienda que necesitan métricas de adquisición, uso del probador virtual y retención de clientes.
- **Valor Principal**: Conocer exactamente cuántas personas ingresan a la landing, qué porcentaje se convierte en usuarios del probador virtual y cuántos finalizan en un intento de compra.

---

## 2. Experiencia de Usuario y Diseño

- **Carga Asíncrona y No Bloqueante**: La etiqueta `gtag.js` se cargará de forma asíncrona (`async`), garantizando que la carga inicial de la página, los recursos críticos, las animaciones de GSAP y la cámara del probador no sufran ningún tipo de demora.
- **Privacidad y Respeto a Preferencias**:
  - `anonymize_ip: true` para cumplimiento de estándares de privacidad.
  - No se envían imágenes, datos biométricos ni contraseñas a Google Analytics; únicamente identificadores de evento y nombres de producto.
- **Consola Limpia**: Integración transparente que no expone advertencias ni ensucia la consola del usuario.

---

## 3. Decisiones de Producto y Trade-Offs

- **Estrategia de Inicialización**:
  - *Opción elegida*: Módulo centralizado `js/analytics.js` reutilizable tanto por `landing/` como por la aplicación principal `index.html`.
  - *Razón*: Evita duplicar lógica de eventos en múltiples archivos y permite cambiar o actualizar el ID de medición en un único punto.
- **Manejo del ID de Medición**:
  - *Opción elegida*: Lectura híbrida: si existe una variable en backend (`process.env.GA_MEASUREMENT_ID`) o en la cabecera del servidor, se inyecta dinámicamente; si se define en el cliente (`window.CAPFIT_GA_ID = 'G-...'`), se activa de forma instantánea.
- **Eventos Personalizados vs. Automáticos**:
  - *Opción elegida*: Eventos semánticos estándar de GA4 (`select_item`, `view_item`, `begin_checkout`) combinados con eventos específicos de CapFit (`tryon_start`, `tryon_complete`, `startup_modal_click`).

---

## 4. Arquitectura Técnica y Estrategia de Datos

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        FUENTES DE TRÁFICO                              │
│            capfit.store (Landing)  │  app.capfit.store (Tienda)        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     MÓDULO CENTRAL DE ANALÍTICA                        │
│                   js/analytics.js (o landing/js/)                      │
│   • Carga asíncrona de https://www.googletagmanager.com/gtag/js?id=... │
│   • Inicialización de gtag('js', new Date()) y gtag('config', ID)      │
│   • Helper global window.capfitTrack(eventName, eventParams)           │
└───────┬───────────────────────────┬────────────────────────────┬───────┘
        │                           │                            │
        ▼                           ▼                            ▼
┌──────────────────┐     ┌──────────────────────┐     ┌──────────────────┐
│  EVENTOS LANDING │     │  EVENTOS PROBADOR IA │     │  EVENTOS CHECKOUT│
│  • page_view     │     │  • photo_upload      │     │  • add_to_cart   │
│  • cta_demo_click│     │  • tryon_start       │     │  • begin_checkout│
│  • startup_modal │     │  • tryon_complete    │     │  • mp_redirect   │
└──────────────────┘     └──────────────────────┘     └──────────────────┘
```

### Componentes a Modificar:
1. **`landing/index.html`**:
   - Inclusión del script asíncrono de Google Tag Manager / GA4 en `<head>` con el ID provisto.
2. **`index.html` (Aplicación Principal)**:
   - Inclusión del script asíncrono de GA4 en `<head>`.
3. **`js/analytics.js` (Nuevo helper ligero)**:
   - Funciones helper para disparo seguro de eventos (`trackPageView`, `trackTryOnEvent`, `trackCtaClick`).
4. **`landing/js/landing.js` & `js/tryon.js`**:
   - Conexión de disparadores en los clics clave de la landing y en el ciclo de vida del probador virtual (inicio de procesamiento y visualización de resultado).
