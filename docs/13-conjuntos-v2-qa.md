# Conjuntos y cobro: control local del 30 de septiembre de 2026

## Alcance

Implementación integrada con el módulo de anexos en `codex/equipment-commercial-ui`.
No se publicó ni se modificaron datos de producción. Contrato común: [12-commercial-profiles-contract.md](12-commercial-profiles-contract.md).

- Creación/inventario conservan una configuración reutilizable por identidad, nunca por nombre de familia.
- Un accesorio individual de trabajo puede tener su propia configuración y perfil comercial. Un consumible o componente puede tener tarifa propia sin convertirse en padre de otros elementos.
- La remisión conserva lo realmente entregado: identificador estable de línea y padre inmediato. `componentParentAssetId` solo conserva el equipo de custodia; no reemplaza el padre de un accesorio anidado.
- Una entrega posterior usa `parentSourceDocumentItemId`; una devolución usa `sourceDocumentItemId`. Autosave, reapertura, aprobación y registro directo conservan estas referencias.
- El anexo congela la configuración comercial aplicada. Una tarifa explícita de 0 genera una línea visible; falta de tarifa requiere revisión, no se interpreta como 0.
- Corte por fecha civil del documento: 1 de octubre de 2026, Bogotá. No se rellenaron ni reescribieron documentos anteriores. Devoluciones de orígenes antiguos siguen su tratamiento anterior.

## Pruebas realizadas

- API: 954 pruebas activas aprobadas; 51 omitidas por la suite existente.
- Web: 154 pruebas aprobadas, sin omisiones.
- Compilación API y Next.js de QA correctas.
- PostgreSQL local aislado: `qa-commercial-profiles.cjs` y `qa-commercial-document-flow.cjs`, transacciones con rollback. Tres niveles, tarifa congelada tras editar catálogo, revisión concurrente obsoleta, entrega adicional, devolución parcial 4→2 y rechazo de devolución excesiva.
- Repetición con `QA_DIRECT=1`: entrega adicional y devolución por `createDirectDocument`; devolución de accesorio de proveedor a tránsito. Detectó y permitió corregir el doble conteo del documento confirmado dentro del saldo previo.
- Interfaz Chrome/Office real: creación de accesorio individual y consumible hijo con 10 unidades, guardado de tarifa 0 y grupo de piezas a 0, reapertura persistida. Comprobación a 390×844 sin desbordamiento horizontal ni errores de consola.
- Regresiones específicas: claves de origen distintas para devoluciones del mismo saldo, cupos físicos y documentales, jerarquía estable al reabrir, eliminación de descendientes, preservación de filas a 0 en anexo.

Los ensayos de movimientos y anexos se ejecutaron contra servicios reales y PostgreSQL; no equivalen a haber recorrido cada uno de esos casos por el navegador con todos los roles.

## Pendientes antes de producción

1. Definir con el usuario cómo se aplican mínimos al cambiar de modalidad durante el alquiler. Si ambas modalidades tienen mínimos y no hay una política inequívoca, queda en `REVIEW`.
2. Transición de equipos entregados antes del corte: un padre antiguo con `DocumentItem` puede conservar su referencia, pero sin snapshot comercial no se inventa una tarifa histórica. Los registros directos antiguos que solo tienen `StockLedger`, sin línea documental, necesitan resolver su incorporación al nuevo conjunto antes de permitirles entregas anidadas desde la UI. No crear ni modificar filas antiguas como parche.
3. Aceptación del usuario de los recorridos en QA y revisión final del corte antes de cualquier despliegue. No considerar el número de pruebas como garantía de ausencia total de fallos.

## Entorno para probar

Frontend local: `http://127.0.0.1:3159`. API local: `http://127.0.0.1:3059`.
Autenticación real con usuarios exclusivos de QA; servicios externos y envío de mensajes aislados.
Base local `equipment_commercial_qa_20260930` en puerto 54414. No es producción.

Ejemplo visible creado por UI: `QA DEMO MULTI-01` → `QA IMPLEMENTO ANIDADO OCTUBRE` → `QA CONSUMIBLE DEL IMPLEMENTO`.
El perfil del implemento es de prueba a tarifa 0, y no modifica el precio de ningún equipo real.
