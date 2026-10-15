# Landing Comercial de CapFit (`capfit.store`)

Este directorio contiene los archivos exclusivos de la **Landing Comercial de CapFit**, completamente separados de la aplicación principal y las tiendas multi-tenant.

## Distribución de Dominios

| Dominio | Destino / Contenido |
| :--- | :--- |
| `capfit.store` | Landing Comercial (sirve los archivos de esta carpeta `/landing`) |
| `www.capfit.store` | Redirección permanente HTTP 301 a `https://capfit.store/` |
| `app.capfit.store` | Aplicación principal (`/index.html` en la raíz), incluida la tienda demo (`principal`) |
| `admin.capfit.store` | Panel de administración central y backoffice |
| `*.capfit.store` (ej. `tienda1.capfit.store`) | Tienda del cliente correspondiente resuelta desde Firestore |
| Dominios personalizados de clientes (ej. `mimarca.com`) | Tienda del cliente correspondiente según su configuración en Firestore |

## Estructura de Archivos

- `landing/index.html`: Entrada HTML principal de la landing.
- `landing/css/landing.css`: Hojas de estilo dedicadas para la landing.
- `landing/js/landing.js`: Scripts de interacción exclusivos de la landing.
- `landing/assets/`: Recursos gráficos, imágenes y multimedia exclusivos de la landing.
