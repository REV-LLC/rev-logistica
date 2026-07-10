# Ramas y despliegue

Este repositorio usa dos ramas permanentes y ramas cortas para cambios:

- `dev`: integracion diaria. Debe estar compilable, pero no despliega automaticamente.
- `production`: codigo aprobado para produccion. Es la unica rama que despliega Vercel y Railway.

`main` queda como rama historica inicial y no debe usarse para nuevos despliegues.

## Flujo oficial

```text
feature/*  -> dev
fix/*      -> dev
hotfix/*   -> production, luego back-merge/cherry-pick a dev
dev        -> production solo por PR de release
production -> deploy real Vercel + Railway
```

## Tipos de rama

Usar nombres cortos y descriptivos:

- `feature/app-shell-navigation`: funcionalidad nueva.
- `fix/asset-image-handling`: correccion normal que entra por `dev`.
- `hotfix/login-production-error`: arreglo urgente directo a `production`.
- `chore/vercel-production-only`: mantenimiento/configuracion sin cambio funcional.
- `release/2026-07-10`: preparacion opcional de release, si hace falta agrupar cambios.

## Flujo normal de feature o fix

1. Crear una rama corta desde `dev`.

```bash
git switch dev
git pull origin dev
git switch -c feature/nombre-cambio
```

Para bugs no urgentes:

```bash
git switch -c fix/descripcion-corta
```

2. Hacer cambios, probar localmente y abrir PR hacia `dev`.

Validaciones minimas antes de mergear:

```bash
npm --workspace apps/api run build
npm --workspace apps/web run build
```

3. Mergear a `dev` solo cuando el PR este verde.

4. Cuando `dev` este listo para produccion, abrir PR de `dev` hacia `production`.

5. Al mergear en `production`, Vercel y Railway despliegan produccion desde esa rama.

## Hotfix de produccion

Cuando haya que corregir algo urgente en produccion:

```bash
git switch production
git pull origin production
git switch -c hotfix/descripcion-corta
```

Despues del fix:

1. Abrir PR de `hotfix/*` hacia `production`.
2. Verificar CI.
3. Mergear y supervisar Vercel/Railway.
4. Llevar el arreglo a `dev` con PR `production -> dev` o cherry-pick.

## Despliegues

- Vercel debe ignorar cualquier rama que no sea `production`.
- Railway debe estar conectado solo al ambiente `production` para la rama `production`.
- `dev`, `feature/*`, `fix/*` y `chore/*` no deben producir deploy real.

La configuracion de Vercel vive en `apps/web/vercel.json`. El `ignoreCommand` cancela builds de ramas distintas a `production`.

## Reglas recomendadas en GitHub

Configurar proteccion para `production`:

- Requerir pull request antes de mergear.
- Bloquear push directo.
- Requerir que las validaciones de build pasen antes de mergear.
- Evitar merges si el branch esta desactualizado, cuando aplique.

Configurar proteccion para `dev`:

- Requerir pull request desde `feature/*`, `fix/*` o `chore/*`.
- Requerir CI verde.
- Evitar commits directos salvo excepcion consciente.

## Higiene del repositorio

- No commitear `.DS_Store`, archivos temporales ni outputs locales.
- Borrar ramas locales y remotas despues de mergear.
- Antes de abrir un PR, revisar:

```bash
git status --short --branch
git log --oneline origin/dev..HEAD
```

Para releases:

```bash
git log --oneline origin/production..origin/dev
```

## Variables de entorno

Las variables deben configurarse por entorno en la plataforma de hosting. El backoffice usa `NEXT_PUBLIC_API_BASE_URL` para apuntar al API correspondiente.
