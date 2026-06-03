# Ramas y despliegue

Este repositorio usa un flujo simple con dos ramas permanentes:

- `dev`: integracion diaria, pruebas internas y staging.
- `production`: codigo aprobado para publicar en produccion.

`main` queda como rama historica inicial y no debe usarse para nuevos despliegues.

## Flujo normal

1. Crear una rama corta desde `dev`.

```bash
git switch dev
git pull origin dev
git switch -c feature/nombre-cambio
```

2. Hacer cambios, probar localmente y abrir PR hacia `dev`.

Validaciones minimas antes de mergear:

```bash
npm --workspace apps/api run build
npm --workspace apps/web run build
```

3. Cuando `dev` este listo para release, abrir PR de `dev` hacia `production`.

4. Al mergear en `production`, la plataforma de hosting debe desplegar produccion desde esa rama.

## Hotfix de produccion

Cuando haya que corregir algo urgente en produccion:

```bash
git switch production
git pull origin production
git switch -c hotfix/descripcion-corta
```

Despues del fix:

1. Abrir PR de `hotfix/*` hacia `production`.
2. Desplegar al mergear.
3. Abrir otro PR de `production` hacia `dev` para no perder el arreglo.

## Reglas recomendadas en GitHub

Configurar proteccion para `production`:

- Requerir pull request antes de mergear.
- Requerir al menos una revision si hay mas colaboradores.
- Bloquear push directo.
- Requerir que las validaciones de build pasen antes de mergear, cuando exista CI.

Configurar proteccion ligera para `dev`:

- Preferir PRs desde `feature/*`.
- Mantener `dev` siempre compilable.

## Entornos sugeridos

- Staging: rama `dev`.
- Produccion: rama `production`.

Las variables de entorno deben configurarse por entorno en la plataforma de hosting. El backoffice usa `NEXT_PUBLIC_API_BASE_URL` para apuntar al API correspondiente.
