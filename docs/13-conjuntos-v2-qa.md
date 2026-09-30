# Conjuntos y cobro: control local del 30 de septiembre de 2026

## Alcance

Implementación integrada con el módulo de anexos en `codex/equipment-commercial-ui`.
No se publicó ni se modificaron datos de producción. Contrato común: [12-commercial-profiles-contract.md](12-commercial-profiles-contract.md).

- Creación/inventario conservan una configuración reutilizable por identidad, nunca por nombre de familia.
- Un accesorio individual de trabajo puede tener su propia configuración y perfil comercial. Un consumible o componente puede tener tarifa propia sin convertirse en padre de otros elementos.
- La remisión conserva lo realmente entregado: identificador estable de línea y padre inmediato. `componentParentAssetId` solo conserva el equipo de custodia; no reemplaza el padre de un accesorio anidado.
- Una entrega posterior usa `parentSourceDocumentItemId`; una devolución usa `sourceDocumentItemId`. Autosave, reapertura, aprobación y registro directo conservan estas referencias.
- Un origen anterior revisado usa `LegacyEquipmentOrigin`, vinculado al movimiento físico original (`sourceLedgerId`, único). La nueva entrega usa `parentLegacyOriginId`; un hijo histórico revisado por separado usa `parentOriginId`. Nunca se inventan líneas `DocumentItem` antiguas ni se altera `StockLedger` para completar el grafo.
- El anexo congela la configuración comercial aplicada. Una tarifa explícita de 0 genera una línea visible; falta de tarifa requiere revisión, no se interpreta como 0.
- Entregar un implemento posteriormente divide el anexo en tramos según las condiciones del perfil. El selector de la celda Cobro solo ofrece modalidades congeladas para ese equipo; al cambiar D/M/HR utiliza su tarifa y conserva los reportes anteriores por modalidad, sin convertir días en metros.
- Corte por fecha civil del documento: 1 de octubre de 2026, Bogotá. No se rellenaron ni reescribieron documentos anteriores. Devoluciones de orígenes antiguos siguen su tratamiento anterior.

## Pruebas realizadas

- API integrada: 973 pruebas activas aprobadas; 51 omitidas por la suite existente.
- Web integrada: 156 pruebas aprobadas, sin omisiones; comprobación de tipos correcta.
- Compilación API y Next.js de QA correctas.
- PostgreSQL local aislado: `qa-commercial-profiles.cjs` y `qa-commercial-document-flow.cjs`, transacciones con rollback. Tres niveles, tarifa congelada tras editar catálogo, revisión concurrente obsoleta, entrega adicional, devolución parcial 4→2 y rechazo de devolución excesiva.
- Repetición con `QA_DIRECT=1`: entrega adicional y devolución por `createDirectDocument`; devolución de accesorio de proveedor a tránsito. Detectó y permitió corregir el doble conteo del documento confirmado dentro del saldo previo.
- Interfaz Chrome/Office real: creación de accesorio individual y consumible hijo con 10 unidades, guardado de tarifa 0 y grupo de piezas a 0, reapertura persistida. Comprobación a 390×844 sin desbordamiento horizontal ni errores de consola.
- Regresiones específicas: claves de origen distintas para devoluciones del mismo saldo, cupos físicos y documentales, jerarquía estable al reabrir, eliminación de descendientes, preservación de filas a 0 en anexo.
- `qa-legacy-equipment-origins.cjs`: origen `CUTOVER` sin líneas documentales → inspección individual → empalme idempotente → entrega posterior → anexo DAY/METER usando servicios reales y PostgreSQL → devolución parcial. Verifica también padre histórico explícito, tarifa cero, historia inmutable y retiro del empalme activo al volver el equipo. Por defecto todo se revierte.
- Navegador Chrome/Office contra API3059 y PostgreSQL54414, sin interceptar respuestas: ejemplo ficticio con dos tramos; cambio D→M→D dentro de la celda, cambio de tarifa, guardado como versión 1 y reapertura.

Los ensayos de movimientos y anexos se ejecutaron contra servicios reales y PostgreSQL; no equivalen a haber recorrido cada uno de esos casos por el navegador con todos los roles.

## Pendientes antes de producción

1. Definir con el usuario cómo se aplican mínimos al cambiar de modalidad durante el alquiler. Si ambas modalidades tienen mínimos y no hay una política inequívoca, queda en `REVIEW`.
2. Revisar y aprobar los empalmes reales uno por uno. El mecanismo para orígenes sin `DocumentItem` ya está implementado y probado; eso no significa que el inventario real ya esté conciliado. La auditoría inicial de la copia local encontró 43 equipos en obra: 32 con remisión y 11 del inventario inicial. Se guardó un solo origen real copiado a QA, Atlas Copco #1/RM019390, sin vincularle martillos. La relación de APT60#3 y APT90#2 en EMCALI sigue pendiente de confirmación porque allí figuran dos compresores.
3. Aceptación del usuario de los recorridos en QA y revisión final del corte antes de cualquier despliegue. No considerar el número de pruebas como garantía de ausencia total de fallos.
4. Revalidar cada origen contra datos actualizados antes de una aplicación en producción: esta copia local no acredita todos los movimientos del día. No reutilizar IDs/fingerprints de QA como aprobación de producción.

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
Base local `equipment_commercial_qa_20260930` en puerto 54414. No es producción.

Ejemplo visible creado por UI: `QA DEMO MULTI-01` → `QA IMPLEMENTO ANIDADO OCTUBRE` → `QA CONSUMIBLE DEL IMPLEMENTO`.
El perfil del implemento es de prueba a tarifa 0, y no modifica el precio de ningún equipo real.

Ejemplo adicional persistido para este control: cliente `QA CONJUNTOS OCTUBRE — NO FACTURAR`, obra `QA DOS TRAMOS — DÍAS Y METROS`. Equipo genérico desde inventario inicial, componente histórico explícito a 0 y un implemento nuevo entregado el 2/oct; el anexo muestra D el 1/oct y M el 2–3/oct. Importes ficticios de 100/día y 10/metro, mínimos 0 únicamente para este ensayo.

Para crearlo de forma explícita en la base QA54414: `node scripts/qa-legacy-equipment-origins.cjs --persist-demo`. Repetir no duplica el ejemplo. Sin esa opción siempre hay rollback; producción es rechazada por la protección de destino local.
