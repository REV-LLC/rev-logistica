# Conjuntos y cobro: control local del 30 de septiembre y 1 de octubre de 2026

## Alcance

Implementación integrada con el módulo de anexos en `codex/equipment-commercial-ui`.
No se publicó ni se modificaron datos de producción. Contrato común: [12-commercial-profiles-contract.md](12-commercial-profiles-contract.md).

## Snapshot actual verificado

Copia consistente de la base vinculada a la API de Railway **producción**, tomada el 30/sep/2026 a las **19:50:08 Bogotá** (`2026-10-01T00:50:08.994Z`). La conexión y transacción de origen fueron de solo lectura. No se usó la copia anterior para las conclusiones de este control.

- Dump privado local: `/private/tmp/rev-commercial-live-20260930-7uvLla/production.dump` (3.674.571 bytes).
- SHA256: `61e3cdea4f0293e55da97363758e0212e8faa7af26c4eda5f8e9a9dfd3315386`.
- Restauración inicial: `equipment_commercial_live_20260930`, PostgreSQL local 54414. El 1 de octubre se restauró otra copia limpia del mismo dump: `equipment_commercial_no_payroll_20261001`, ahora activa en QA. Ambas bases anteriores se conservaron, sin eliminar sus ensayos.
- Referencia de código de producción integrada: `704e060`, antes de construir QA.
- 141 migraciones originales → **146 locales** en la copia activa. Las cinco pendientes corresponden a anexos, perfiles comerciales, composición documental y empalmes de orígenes antiguos. La primera restauración había aplicado 147; la migración salarial se retiró antes de construir esta segunda copia. Comparación de todas las columnas originales antes/después de migrar y después de repetir QA: mismos hashes y cantidades.
- Después de los ensayos se restauró una segunda base de referencia y se compararon los IDs originales: **124 assets, 221 SKU, 2.250 movimientos, 436 documentos, 1.210 líneas documentales y los registros originales de accesorios, configuraciones y obras permanecen idénticos**. Las filas ficticias nuevas no se cuentan como historia original.

- Creación/inventario conservan una configuración reutilizable por identidad, nunca por nombre de familia.
- Un accesorio individual de trabajo puede tener su propia configuración y perfil comercial. Un consumible o componente puede tener tarifa propia sin convertirse en padre de otros elementos.
- La remisión conserva lo realmente entregado: identificador estable de línea y padre inmediato. `componentParentAssetId` solo conserva el equipo de custodia; no reemplaza el padre de un accesorio anidado.
- Una entrega posterior usa `parentSourceDocumentItemId`; una devolución usa `sourceDocumentItemId`. Autosave, reapertura, aprobación y registro directo conservan estas referencias.
- Un origen anterior revisado usa `LegacyEquipmentOrigin`, vinculado al movimiento físico original (`sourceLedgerId`, único). La nueva entrega usa `parentLegacyOriginId`; un hijo histórico revisado por separado usa `parentOriginId`. Nunca se inventan líneas `DocumentItem` antiguas ni se altera `StockLedger` para completar el grafo.
- El anexo congela la configuración comercial aplicada. Una tarifa explícita de 0 genera una línea visible; falta de tarifa requiere revisión, no se interpreta como 0.
- Entregar un implemento posteriormente divide el anexo en tramos según las condiciones del perfil. El selector de la celda Cobro solo ofrece modalidades congeladas para ese equipo; al cambiar D/M/HR utiliza su tarifa y conserva los reportes anteriores por modalidad, sin convertir días en metros.
- Corte por fecha civil del documento: 1 de octubre de 2026, Bogotá. No se rellenaron ni reescribieron documentos anteriores. Devoluciones de orígenes antiguos siguen su tratamiento anterior.

## Pruebas realizadas

- API integrada después de retirar salarios: **1.044 pruebas activas aprobadas**; 51 omitidas por la suite existente.
- Web integrada: **165 pruebas aprobadas**, sin omisiones; comprobación de tipos correcta.
- Compilación API y Next.js de QA correctas.
- PostgreSQL local aislado: `qa-commercial-profiles.cjs` y `qa-commercial-document-flow.cjs`, transacciones con rollback. Tres niveles, tarifa congelada tras editar catálogo, revisión concurrente obsoleta, entrega adicional, devolución parcial 4→2 y rechazo de devolución excesiva.
- Repetición con `QA_DIRECT=1`: entrega adicional y devolución por `createDirectDocument`; devolución de accesorio de proveedor a tránsito. Detectó y permitió corregir el doble conteo del documento confirmado dentro del saldo previo.
- Interfaz Chrome/Office en la primera restauración del snapshot: creación desde cero de familia y equipo genéricos, motor intercambiable, accesorio individual predeterminado y modalidades configurables DAY/METER. Guardado y reapertura conservan la configuración. Estos ejemplos de UI se conservan en la base anterior, no en la copia activa restaurada el 1 de octubre.
- Creación/asignación de motor como asset desde su ficha, compatibilidad con el equipo y selector de avería separado para máquina/motor. Aprobar sin motor asignado fue rechazado sin salida física. Después de asignarlo e incorporarlo al borrador, la remisión de tres líneas se confirmó.
- Devolución por UI: pestañas Equipos y materiales / Accesorios; selección del conjunto, quitar/reincluir desde la tuerca, autosave, reapertura y firma. `DV-APP-000024` devuelve equipo, motor y accesorio, conserva sus tres orígenes documentales y deja el motor asignado. Todos regresan a bodega; saldo del accesorio en obra 0, bodega 1.
- Selector de devolución a 390×844: ancho de documento 390, sin desbordamiento horizontal, botón Agregar accesible.
- Regresiones específicas: claves de origen distintas para devoluciones del mismo saldo, cupos físicos y documentales, jerarquía estable al reabrir, eliminación de descendientes, preservación de filas a 0 en anexo.
- `qa-legacy-equipment-origins.cjs`: origen `CUTOVER` sin líneas documentales → inspección individual → empalme idempotente → entrega posterior → anexo DAY/METER usando servicios reales y PostgreSQL → devolución parcial. Verifica también padre histórico explícito, tarifa cero, historia inmutable y retiro del empalme activo al volver el equipo. Por defecto todo se revierte.
- `qa-commercial-http-flow.cjs`: JWT real Office/Admin/Driver, permisos y DTOs reales, creación genérica asset → accesorio individual → cuatro piezas retornables. Autosave y envío idempotentes, reapertura, aprobación, entrega posterior, repetición sin movimientos duplicados, devolución parcial 4→2, exceso rechazado sin cambio de saldo y receptor resuelto desde notas normalizadas. Anexo DAY→METER: 100 + 10×200 = 2.100, partes a 0 visibles, guardado/reapertura y revisión obsoleta 409; cambiar el catálogo no cambia la tarifa congelada. Última ejecución completa en la copia sin salarios: `31a87541`, nueve verificaciones aprobadas. Los ensayos PostgreSQL con rollback también se repitieron: perfiles, aprobación, modo directo y empalmes.
- Documento público conserva nombres/código congelados aunque no exista `requestedTag`. PDF real descargado, texto validado y página renderizada inspeccionada: accesorio individual y piezas por cantidad visibles, sin solapamientos. Correo tiene regresión específica para nombre/código congelados (sin envío real).
- Coordinación con «Rediseñar anexos y prefacturas»: 84 pruebas específicas aprobadas y 650 preparaciones sobre las 325 obras del snapshot para septiembre/octubre sin excepción. Sin perfiles comerciales reales aprobados, los casos requieren `REVIEW`: **esto no valida todavía importes reales de todo el inventario**.

### Defectos encontrados y corregidos durante este control

1. Reabrir borrador perdía el número interno en la etiqueta del equipo, no su identidad guardada.
2. La vista interna confirmada usaba solo `StockLedger` y omitía accesorios (sus movimientos están en `AccessoryMovement`). Ahora conserva las filas físicas antiguas y agrega las líneas de accesorios sin duplicar equipos. API pública, PDF y correo leen el nombre congelado también sin `requestedTag`.
3. El configurador de devolución y las pestañas identificaban de forma distinta el padre del mismo lote. Ahora ambos conservan el padre documental de la entrega: muestran piezas ya seleccionadas y no duplican el saldo.
4. Las notas se almacenan en mayúsculas y sus UUID dejaban de coincidir con el catálogo al reabrir/resolver responsables. Se restaura solo la forma canónica de UUID, preservando IDs históricos opacos y el texto original. Receptor, conductor, vehículo y despachador tienen regresión.

Los ensayos de movimientos y anexos se ejecutaron contra servicios reales y PostgreSQL; no equivalen a haber recorrido cada uno de esos casos por el navegador con todos los roles.

## Retiro del módulo salarial: 1 de octubre de 2026

Por instrucción expresa del usuario, se retiró el módulo salarial que llegó con
el commit integrado `e14077d`: migración `20260926120000_employee_salary_history`,
modelo `EmployeeSalary`, política e importes automáticos, servicio/controlador,
pantalla y enlace de Nómina base. No se aplicó esa migración a producción ni se
eliminaron datos productivos. La eliminación del código es recuperable en Git.
Empleados, préstamos y actividades existentes se conservan; el validador de
fechas de anexos ahora está en `common/civil-date.ts`, sin política salarial.

`qa-no-payroll-release.cjs` verificó contra la copia activa: ausencia de tabla,
migración y modelo generado; API y página salarial devuelven 404; crear, editar,
listar y eliminar un empleado ficticio funciona por HTTP con Office autenticado.
El empleado ficticio se eliminó al terminar. Compilaciones API/web y todas las
pruebas citadas se ejecutaron con el modelo salarial ya retirado.

## Pendientes antes de producción

1. Definir con el usuario cómo se aplican mínimos al cambiar de modalidad durante el alquiler. Si ambas modalidades tienen mínimos y no hay una política inequívoca, queda en `REVIEW`.
2. Configurar condiciones comerciales y revisar/aprobar los empalmes reales uno por uno. El mecanismo está probado, pero no equivale a inventario conciliado. La auditoría del **snapshot actual** encontró 43 equipos en obra: **35 con remisión y 8 del inventario inicial**. Ningún empalme real se aplicó de forma persistente a esta copia nueva. El Atlas propio (`30c082d3-fc28-4cb9-9ddb-b534e915dd73`) está en **KILOMETRO 6 / RM000722**; otro Atlas de AAA (`c2315eb0-8eb8-49eb-a2b7-891c5c333899`) está en **EMCALI LOS CERROS / RM019390**. Los APT propios 60#3 y 90#2 ya volvieron a bodega con DV-APP-000017; no deben asignarse desde la auditoría vieja. Coincidir en obra/remisión no confirma por sí solo un padre.
3. Aceptación del usuario de los recorridos en QA y revisión final del corte antes de cualquier despliegue. No considerar el número de pruebas como garantía de ausencia total de fallos.
4. Revalidar cada origen contra producción antes de aplicarlo: el snapshot solo acredita el estado de las 19:50 Bogotá, no movimientos posteriores. No reutilizar aprobaciones/fingerprints ficticios de QA.

## Procedimiento de empalme individual

1. Ejecutar `audit-legacy-equipment-origins.cjs` solo contra la base QA autorizada. El script genera una cola de revisión de solo lectura; no aplica conversiones.
2. Inspeccionar un movimiento exacto con `GET /legacy-equipment-origins/inspect/:sourceLedgerId?effectiveFrom=2026-10-01`. Comprobar equipo, propietario, obra, documento, posición física y condiciones comerciales.
3. Confirmar con el usuario cualquier relación ambigua. Compartir obra, familia o documento no basta para asignar un padre.
4. `POST /legacy-equipment-origins/review`: enviar el ID, fecha, fingerprint recién inspeccionado y nota de evidencia. `parentOriginId` solo con relación confirmada y compatibilidad configurada. OFFICE/ADMIN revisan; DRIVER/TABLET solo consultan orígenes activos.
5. Verificar la remisión nueva, devolución y anexo sin alterar el origen antiguo. El registro guarda revisor, fecha, evidencia y configuración congelada; una revisión obsoleta/conflictiva se rechaza.

Los empalmes son inmutables desde estos endpoints. Un padre mal elegido no se corrige sobrescribiendo historia; debe detenerse el caso y diseñarse una rectificación auditable. No existe una pantalla de revisión masiva ni un script de aplicación masiva.

## Entorno para probar

Frontend local: `http://127.0.0.1:3159`. API local: `http://127.0.0.1:3059`.
Autenticación real con usuarios exclusivos de QA; servicios externos y envío de mensajes aislados.
Base local **`equipment_commercial_no_payroll_20261001`** en puerto 54414. No es producción. Correo, WhatsApp, almacenamiento y tareas programadas están aislados. Los archivos ficticios ahora sobreviven al reinicio del servidor QA.

Usuarios exclusivamente locales: `qa-config-office@example.invalid`, `qa-config-admin@example.invalid`, `qa-config-driver@example.invalid`. Clave de QA: `Only-local-QA-20260923!`. No son cuentas ni credenciales de producción. Reinicio API: `QA_NO_PAYROLL=1 node scripts/run-equipment-commercial-qa.cjs` desde `apps/api`; frontend: `npm run start -- --hostname 127.0.0.1 --port 3159` desde `apps/web`, después de construir con `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3059`.

Ejemplo actual del ensayo HTTP: cliente `QA HTTP CONJUNTOS 31a87541` / obra `QA OBRA CONJUNTOS 31a87541`, con equipo genérico, accesorio individual y piezas retornables. Valores ficticios de 100/día y 200/metro, mínimos 0 para probar el cambio de modalidad, sin modificar tarifas reales. Los ensayos tienen familias/clientes prefijados `QA HTTP`.

Ejemplo por UI preservado solo en `equipment_commercial_live_20260930`: familia `QA SISTEMA MODULAR 30SEP`, equipo `QA MODULAR #1`, accesorio `QA CABEZAL MODULAR 30SEP`, motor `QA 5 HP MOTOR MODULAR 30SEP #1`. Cliente/obra `QA HTTP CONJUNTOS c7bd6a74` / `QA OBRA CONJUNTOS c7bd6a74`; remisión `RM-APP-000017` y devolución `DV-APP-000024`. Sus IDs/enlaces no existen en la copia activa nueva; esto no representa pérdida de documentos productivos.

Los ejemplos anteriores `QA DEMO MULTI-01` y `QA DOS TRAMOS` pertenecen a la copia QA vieja preservada: no son evidencia del snapshot actual ni deben trasladarse a producción.

Para crearlo de forma explícita en la base QA54414: `node scripts/qa-legacy-equipment-origins.cjs --persist-demo`. Repetir no duplica el ejemplo. Sin esa opción siempre hay rollback; producción es rechazada por la protección de destino local.
