# Empalme del inventario anterior con accesorios

Estado: tipos y compatibilidad del martillo confirmados el 2026-09-16; conciliación de unidades y ejecución del empalme pendientes. **Este documento no es una migración ejecutable.** El módulo nuevo por sí solo no transforma equipos, SKUs ni familias anteriores.

## Principios del cambio

- Una misma unidad física solo puede tener un saldo operativo. Conservar registros históricos no significa dejar ambos inventarios disponibles para nuevos despachos.
- Una familia que contiene la palabra “accesorios”, o una regla `AssetFamilyComponent`, solo identifica candidatos. No demuestra que todas sus unidades sean consumibles ni autoriza convertirlas.
- APT/martillos neumáticos pueden acompañar a un compresor y seguir siendo equipos con puntas propias. Los motores de mezcladora tienen asignación y ciclo de vida específicos. Preservar esos flujos salvo una decisión explícita distinta.
- Mantener propietarios, ubicaciones físicas, imágenes/especificaciones, referencias y documentos. No inventar devoluciones, consumos ni pérdidas para cerrar el modelo anterior.
- No inferir compatibilidad o asignación histórica por coincidencia de nombres. Si hay una sola máquina compatible en una remisión, proponerla para revisión; no escribir el vínculo automáticamente.
- Una regla de implementos excluyentes necesita distinguir compatibilidad, custodia en obra y montaje. Dos implementos pueden acompañar una máquina sin estar montados simultáneamente. No sustituir esas reglas por una compatibilidad sin restricciones de forma silenciosa.

## Auditoría reproducible, solo lectura

1. Obtener un respaldo consistente y reciente de producción. Restaurarlo en una base local nueva, sin sustituir la base de pruebas del usuario.
2. Ejecutar desde la raíz, indicando un archivo de salida nuevo:

```sh
ACCESSORY_AUDIT_DATABASE_URL='postgresql://USUARIO:CLAVE@127.0.0.1:PUERTO/accessory_qa_COPIA' \
  npm --workspace apps/api run audit:legacy-accessories -- /ruta/privada/nuevo-informe.json
```

El auditor solo permite `localhost`/`127.0.0.1` y bases `accessory_qa_*`, no reutiliza `DATABASE_URL` ni carga la configuración de la aplicación. Todas las consultas se realizan dentro de una transacción `REPEATABLE READ, READ ONLY`. El archivo se crea con permisos `0600`, sin sobrescribir informes anteriores. No existe opción `--apply`.

El informe contiene:

- Catálogo candidato, motivos de selección, familias padre registradas y restricciones de componentes.
- Identidad de cada SKU y equipo, propietario, ubicación registrada, especificaciones, imágenes, relaciones de motor y contadores de mantenimiento.
- Tarifas, referencias documentales, borradores/en curso, recepciones y recogidas de proveedor.
- Vínculos de equipo existentes y propuestas separadas de las relaciones confirmadas.
- Historia del inventario sin interpretarla como saldo migrable.
- Huella del conjunto de datos leído. No reemplaza la validación contra el estado actual antes de aplicar una migración.

Los datos del informe y el respaldo son privados; no deben adjuntarse al repositorio ni publicarse en un PR.

## Decisiones confirmadas (2026-09-16)

### Retornables actualmente controlados por cantidad

El usuario confirmó:

- **Mangueras:** `RETURNABLE`, retornables por cantidad. Admiten reposición y devolución parcial, no consumo. Se conservan por referencia, propietario y ubicación, sin inventar identidad por unidad.
- **Pinzas:** `INDIVIDUAL`, una ficha/código por unidad, vinculable al equipo soldador. No se interpreta “soldador” como un empleado.
- **Guayas:** `INDIVIDUAL`, una ficha/código por unidad, vinculable al vibrador correspondiente.

El tercer tipo se agregó al esquema, API, formulario, selector documental y movimientos. La migración aditiva `20260916120000_add_returnable_accessories` no cambia el tipo ni las existencias de registros anteriores.

Individualizar un saldo antiguo de pinzas/guayas exige conciliar y etiquetar las unidades. La identidad nueva empieza en el corte; no puede atribuirse retrospectivamente una identidad física que nunca fue registrada. No asignar automáticamente todas las guayas al primer vibrador del catálogo. La correspondencia de cada unidad y equipo se registra por separado de su compatibilidad.

### Compatibilidad

**Martillo hidráulico INDECO:** el usuario restringió su compatibilidad únicamente a la retroexcavadora Liu Gong actual. En el respaldo auditado se identificó un único equipo Liu Gong 766A, código `REXC-8941-0001`. El destino de compatibilidad es `scope=ASSETS` con ese ID exacto; no toda RETROEXCAVADORA, su subfamilia ni futuros equipos Liu Gong.

La copia muestra el martillo en bodega y la Liu Gong en obra: conservar esa separación. Establecer compatibilidad no debe moverlo a la obra ni registrar una entrega. Revalidar identidad/estado antes del corte real. Los IDs exactos y referencias de origen están en el manifiesto privado de `outputs/accessories/`, excluido de Git.

Si una referencia sirve para varias familias, resolverlo explícitamente: el modelo inicial admite una familia por accesorio. No duplicar las existencias para simular varias compatibilidades.

### Documentos y cobros abiertos

La transformación debe decidir qué hacer con borradores/en curso y recepciones pendientes. No aprobarlos, rechazarlos ni cambiarlos en nombre de Office sin revisión. Mantener visibles y operables los retornos todavía pendientes.

Que una tarifa registrada sea cero o nula no demuestra que no haya un acuerdo comercial externo. Conservar los datos de tarifas; el nuevo módulo aún no factura accesorios. Cualquier continuidad comercial debe validarse antes de convertir.

## Implementación del corte, después de cerrar las decisiones

1. Integrar los cambios recientes de `origin/production` preservando las modificaciones de inventario, origen físico, aprobaciones atómicas, PIN de bodega, documentos y permisos. Un build anterior no certifica esa integración.
2. Crear una correspondencia persistente e idempotente entre el registro anterior y el nuevo. Para individualizados: una unidad anterior → un accesorio. Para cantidades: saldo separado por referencia, propietario y ubicación, conforme al tipo aprobado.
3. Resolver saldos usando las reglas actuales de producción, no sumando todas las filas: aperturas de catálogo, `ON_SITE`, retornos, transferencias pareadas y orden de movimientos tienen significados distintos.
4. Conservar los documentos confirmados y su historial; crear enlaces de correspondencia para que las devoluciones nuevas liquiden la custodia anterior sin reescribir remisiones. Conciliar recepción pendiente de proveedor y continuidad comercial.
5. Retirar la disponibilidad anterior únicamente en la misma operación que crea el nuevo saldo, con bloqueos y comprobaciones. No borrar el historial. No ocultar una familia mientras existan registros pendientes no cubiertos por el nuevo flujo.
6. Usar una clasificación explícita para sacar las familias convertidas del selector de alta de equipos. No filtrar por nombre ni desactivar en bloque equipos, familias o motores que no se han convertido.
7. Probar el corte en la copia restaurada. Verificar igualdad de unidades, propietarios y ubicaciones antes/después, ausencia de duplicados y estabilidad al reintentar.
8. Preparar respaldo nuevo, ventana de corte y reversión comprobada. El rollback de código no revierte datos: después de nuevos movimientos no se debe simplemente restaurar un respaldo perdiéndolos.
9. Publicar por el flujo documentado de `dev → production` mediante PR, coordinando esquema/API/web. Validar con autenticación habilitada; jamás publicar el bypass local.

## Pruebas mínimas del empalme

- Equipo principal visible en familias; antiguos implementos convertidos fuera del selector de equipos y dentro de accesorios.
- Accesorio en obra antes del corte → devolución posterior → una sola existencia en la bodega correcta.
- Reposición de accesorios a equipo que ya está en obra.
- Cantidades: consumo explícito, retorno parcial, múltiples propietarios y rechazo de saldos insuficientes.
- Implementos compatibles sin asumir que estén montados o asignados.
- Documentos mixtos e históricos, borradores previos, PDF, evidencias y recibos de proveedor parciales.
- Reintentos, aprobación simultánea y fallo a mitad de conversión: ningún saldo parcial ni doble contabilización.
- Equipos normales, motores y APT mantienen sus flujos y permisos.
- Regresión de los cambios nuevos de producción, incluida fecha/origen físico, tablet con PIN y consultas de Office.

Las pruebas del auditor validan únicamente la detección y las propuestas; no equivalen a pruebas del corte completo.
