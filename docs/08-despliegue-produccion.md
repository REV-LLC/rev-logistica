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
