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
El API usa `DATABASE_URL` y variables de R2 para archivos públicos como logos de empresas dueñas.
Backoffice usa `NEXT_PUBLIC_API_BASE_URL` para apuntar al API.

Ejemplo:
```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

## Rutas principales (Backoffice)
- `/login`
- `/inventory/warehouse`
- `/inventory/on-site`
- `/inventory/ops`

## Despliegue
El flujo de ramas y despliegue esta documentado en [docs/07-ramas-despliegue.md](docs/07-ramas-despliegue.md).
La configuracion de produccion esta documentada en [docs/08-despliegue-produccion.md](docs/08-despliegue-produccion.md).
