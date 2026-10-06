# Conjuntos BULK por familia

## Alcance

Una plantilla de conjunto contiene referencias BULK existentes y cantidades enteras por conjunto. No es un equipo ni una nueva referencia con existencias. No modifica el modelo de implementos individualizados que sigue en otra rama de trabajo.

- Configuración de familia: habilitar conjuntos y texto inicial común.
- Crear BULK: checkbox y texto inicial guardados en la misma transacción del stock; si falla la operación, no guarda ninguna parte.
- Inventario: «Configurar conjunto» en familias habilitadas, para Office/Admin. Crear, editar y archivar plantillas; nunca asigna unidades físicas automáticamente.
- Remisiones: pestaña «Conjuntos» del selector para Office/Driver; elegir plantilla, número de conjuntos y procedencia cuando hay más de un propietario posible. Se añaden las piezas como líneas BULK normales y editables, con sus cantidades multiplicadas. Un conjunto se agrega en una selección aparte de las piezas individuales.
- Devoluciones: por pieza y cantidad, conservando el origen documental y la posibilidad de devolución parcial.
- Cobro: permanecen las tarifas de las piezas. Esta entrega no inventa una tarifa global de conjunto ni cambia cálculos de anexos.

## Datos revisados para publicación

Snapshot actual de producción tomado el 6 de octubre de 2026 a las 17:05 UTC. Respaldo protegido fuera del repositorio: `/private/tmp/rev-bulk-kits-20261006-nVrOs3/production-before.dump`, SHA-256 `9012841fe6d95bb245d5dad3061fd73122c8b9ea8735712964bd8cedd87df7bc`.

Migraciones aditivas:

1. Columnas de configuración familiar; tablas `BulkKit` y `BulkKitEntry`. Índices, claves foráneas y restricción positiva de cantidades.
2. Habilitar ANDAMIO COLGANTE con «Andamio colgante de»; clasificar el SKU existente YOYO ANDAMIO COLGANTE en la subfamilia YOYOS ya existente. Identidades verificadas y precondiciones explícitas; no crea recetas ni inventa cantidades. No crea ni altera movimientos, existencias o documentos históricos.

La composición exacta de cada andamio debe registrarla Office desde la UI; las plantillas QA no se publican ni se copian a producción.

## Verificación

- Builds API/Web y regresiones automatizadas de inventario/documentos.
- Base local nueva restaurada del snapshot; ambas migraciones aplicadas correctamente.
- API real: crear/editar/archivar plantilla, duplicados, cantidades inválidas y conflicto de versión.
- Configurar plantillas conserva hashes de documentos, líneas, ledger, equipos y saldos de accesorios.
- Familia de prueba independiente: habilitación y alta de stock atómicas, rollback por prefijo inválido, remisión de tres conjuntos, rollback por falta de una pieza, devolución parcial y completa con remisión de origen. Recuperación del saldo inicial; filas históricas intactas.
- UI real: guardar y reabrir plantilla, escoger conjunto, validar faltantes, añadir cantidades 3/6 al borrador; sin errores relevantes de consola. Revisión de escritorio y móvil.
- Guardas: Driver solo consulta; Office/Admin administran. El bypass solo se usa en el servidor local de QA, nunca en producción.

## Operación y recuperación

Publicar únicamente esta rama basada en el commit de producción `a88f3e4`; verificar CI antes de merge. Railway aplica las migraciones antes de arrancar; verificar API y despliegue Vercel del mismo commit.

Si hay un problema de código, volver al despliegue anterior sin eliminar tablas ni columnas aditivas. Deshabilitar conjuntos desde la configuración familiar conserva recetas. No restaurar el respaldo completo sobre producción activa: reemplazaría movimientos posteriores. Cualquier recuperación de datos requiere revisión específica.
