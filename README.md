# rev-logistica

Monorepo con aplicaciones y paquetes compartidos.

## Apps
- `apps/api`: backend NestJS
- `apps/web`: backoffice Next.js (App Router)

## Requisitos
- Node.js >= 18
- npm

## Instalación
```bash
npm install
```

## Desarrollo
Backend:
```bash
npm --workspace apps/api run start:dev
```

Backoffice (Next.js):
```bash
npm --workspace apps/web run dev
```

## Configuración
Backoffice usa `NEXT_PUBLIC_API_BASE_URL` para apuntar al API.

Ejemplo:
```bash
cp apps/web/.env.example apps/web/.env.local
```

## Rutas principales (Backoffice)
- `/login`
- `/inventory/warehouse`
- `/inventory/on-site`
- `/inventory/ops`
