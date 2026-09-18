# Despliegue de produccion

## Entornos

- Web: Vercel, rama `production`.
- API: Railway, rama `production`.
- Base de datos: Railway Postgres para primera version.

## Dominios sugeridos

- Backoffice: `app.revcontractorsllc.com`
- API: `api.revcontractorsllc.com`

## Variables del API

Configurar en Railway:

```bash
DATABASE_URL=postgresql://...
ALLOWED_ORIGINS=https://app.revcontractorsllc.com
MAPBOX_ACCESS_TOKEN=...
CSC_API_KEY=...
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=...
R2_PUBLIC_BASE_URL=https://...
PORT=3000
```

`PORT` normalmente lo inyecta Railway. Si Railway ya define `PORT`, no hay que crearla manualmente.

## Variables del Web

Configurar en Vercel:

```bash
NEXT_PUBLIC_API_BASE_URL=https://api.revcontractorsllc.com
```

## Comandos de build

API en Railway:

```bash
npm ci
npm --workspace apps/api exec prisma generate
npm --workspace apps/api run build
npm --workspace apps/api run start:prod
```

Web en Vercel:

```bash
npm install
npm --workspace apps/web run build
```

## Health check

El API expone:

```text
GET /health
```

Debe responder `ok: true`.

## Optimización de imágenes en Next.js / Vercel

La web usa `next/image` mediante `AppImage` y `AppAvatar`, con tamaños de descarga
adaptados a cada componente, calidad 75, WebP y carga diferida por defecto.
Las tarjetas de inventario envían el original al optimizador; ya no necesitan
seleccionar el archivo `.thumbnail.webp` en el navegador. Se conservan las
miniaturas del API para sus consumidores actuales y las fotos privadas.

`apps/web/next.config.js` permite el bucket público actual de REV. Para usar otro
bucket o CDN, configurar en el proyecto **web** de Vercel, antes de compilar:

```dotenv
NEXT_PUBLIC_IMAGE_BASE_URLS=https://cdn.example.com/inventory
```

Acepta varias bases separadas por comas y limita cada una a su origen y prefijo
de ruta. Deben corresponder al `R2_PUBLIC_BASE_URL` del API. Si la variable pública
no está definida, se utiliza `R2_PUBLIC_BASE_URL` cuando existe en el entorno web,
o el bucket actual. Solo incluir URLs públicas sin credenciales ni query strings.
Cambiar estas variables requiere un nuevo despliegue. Los nuevos archivos deben
seguir usando claves únicas: la caché de Next no se invalida al reemplazar bytes
en la misma URL. Se mantiene un TTL mínimo de cuatro horas; los archivos con
`Cache-Control: immutable` del almacenamiento pueden permanecer más tiempo.

Excepciones deliberadas:

- Fotos privadas de empleados y adjuntos obtenidos con JWT: conservan el flujo
  autenticado y sus URLs `blob:`. El optimizador de Next no reenvía autenticación.
- Vistas previas locales y firmas `data:`: solo existen en el navegador.
- SVG: conservan el formato vectorial; no se habilita `dangerouslyAllowSVG`.
- URLs externas fuera de las bases permitidas o con parámetros: se muestran
  directamente para mantener compatibilidad. Para optimizar un CDN nuevo, agregar
  su base pública explícitamente.
- `public/offline.html` conserva HTML nativo y el logo precacheado para funcionar
  sin React ni conexión. Los canvas de firmas y exportaciones usan el original.

Validación local: compilación de producción, TypeScript y suite web. El endpoint
`/_next/image?url=%2Finventory%2Fcertified-scaffold.png&w=256&q=75`, solicitado con
`Accept: image/webp`, entregó HTTP 200 y 10.114 bytes frente a 111.267 del PNG
original (90,9 % menos para esa resolución). Esto no representa un porcentaje
universal ni una medición de latencia en producción.

Referencia: https://nextjs.org/docs/app/api-reference/components/image
