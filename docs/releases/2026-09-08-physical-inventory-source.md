# Origen físico separado de propietario y transporte

## Causas corregidas

- La modalidad `Entrega: ON_SITE` también decidía el origen del inventario. Ahora `Document.inventorySourceMode` distingue una bodega explícita (`WAREHOUSE`) de una salida directa desde las bodegas de los propietarios (`OWNER_WAREHOUSES`). El transporte no cambia un origen explícito.
- Los resolutores de remisiones buscaban y creaban equipos en la bodega del propietario, aunque el documento saliera de otra bodega. Ambos accesos, desde solicitudes y desde el detalle, usan ahora el origen físico y conservan el propietario. Lo mismo aplica a equipos accesorios y recuperación de motores.
- Un traslado proveedor genera una salida y una entrada atómicas. El orden aleatorio de sus UUID podía convertir la salida en la ubicación final. Aprobación y catálogo ahora resuelven el evento completo, equilibrado y del mismo documento. Eventos incompletos o contradictorios no acreditan disponibilidad.

## Comportamiento

- Remisiones nuevas: origen físico predeterminado en Bodega Principal, con elección explícita del usuario.
- Documentos históricos sin el campo nuevo: mantienen su interpretación anterior; no hay reclasificación ni aprobación masiva.
- Cambiar el origen físico de ítems ya seleccionados requiere confirmación y volver a seleccionarlos.
- Crear un equipo faltante muestra propietario y ubicación inicial antes de guardar. No reemplaza la recepción de un equipo que ya existe.
- Los faltantes por cantidades distinguen propietario y bodega de salida. Cuando son distintos, el enlace revisa la ubicación física y no propone ajustar la bodega del dueño.
- Se mantienen las restricciones cronológicas de movimientos operativos, la validación de ubicación, los propietarios, las cantidades y el flujo de devoluciones.
- Los conflictos siguen mostrando nombres legibles; los identificadores técnicos permanecen en los datos estructurados.

## Publicación y compatibilidad

1. Publicar API con la migración `20260908190000_document_inventory_source` mediante el predeploy existente de Railway.
2. Verificar migración completada, despliegue exitoso y salud de la API nueva.
3. Publicar/promover la interfaz a producción después de la API.

La migración solo agrega un enum y una columna nullable, sin default ni backfill. El cliente anterior de Prisma sigue funcionando con la columna agregada. La API anterior rechaza el campo nuevo enviado por la interfaz nueva: no invertir el orden del despliegue.

**Rollback:** una API anterior no interpreta los orígenes explícitos de los documentos nuevos. No restaurarla automáticamente después de habilitar la interfaz nueva; primero deben suspenderse aprobaciones y evaluarse esos documentos. Una reversión solo de la interfaz conserva los controles del servidor nuevo.

## Verificación

- Pruebas unitarias de persistencia, aprobación, valores inválidos, compatibilidad histórica, origen físico y ausencia de sustituciones de identidad.
- Pruebas de transferencias equilibradas, recepción de proveedor con IN único válida, contrapartes inconsistentes, orden de UUID y movimientos cronológicamente posteriores.
- Pruebas de mensajes de faltantes, rutas de revisión y aislamiento por propietario.
- CI ejecuta las pruebas de API y Web además de compilar ambas aplicaciones.

La reparación excepcional de un registro inicial incorrecto, si corresponde, es independiente de esta migración: requiere comprobar el caso, guardar una auditoría antes/después y no aprobar el documento ni inventar una fecha de recepción.
