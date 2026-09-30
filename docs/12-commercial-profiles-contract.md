# Contrato compartido: modalidades comerciales y anexos (v1)

Responsabilidad backend/anexos: checkout 2e73. UI inventario: chat Estabilizar flujos logísticos.
Estado: contrato de implementación local, no desplegado. Fechas civiles America/Bogota; importes decimales como strings.

## API para la UI de inventario

`GET /commercial-profiles?scopeType=ASSET|SKU|FAMILY&scopeId=<uuid>`
Devuelve `{id: string|null, scopeType, scopeId, version: number, effectiveFrom: string|null, groups: [], modes: []}`.
Sin configuración propia: version 0, arrays vacíos. No confundir con reglas heredadas.

`PUT /commercial-profiles` (Admin/Office), body:

```json
{
  "scopeType": "ASSET",
  "scopeId": "uuid",
  "expectedVersion": 0,
  "effectiveFrom": "2026-09-30",
  "groups": [{
    "id": "uuid-estable-del-grupo",
    "name": "Implemento de trabajo",
    "selectors": [{"kind": "ACCESSORY", "id": "uuid-del-accesorio"}]
  }],
  "modes": [{
    "id": "uuid-estable-modalidad",
    "name": "Servicio con implemento",
    "unit": "METER",
    "minimum": {"value": "40", "basis": "PER_RENTAL"},
    "pricing": {"source": "FIXED", "amount": "1500.00"},
    "conditions": [{"groupId": "uuid-estable-del-grupo", "presence": "PRESENT", "minimumQuantity": 1}],
    "parts": [{"groupId": "uuid-estable-del-grupo", "treatment": "INCLUDED"}]
  }]
}
```

Respuesta PUT: mismo objeto que GET, version incrementada. 409 si versión desactualizada.
La UI crea IDs UUID una vez; al editar conserva los IDs de grupo y modalidad.
`selectors.kind`: ASSET | SKU | FAMILY | ACCESSORY. Solo IDs reales, nunca nombres.
`unit`: DAY | HOUR | METER. `minimum.value`: string >=0; DAY entero.
`minimum.basis`: PER_RENTAL para DAY/METER; PER_REPORTED_DAY para HOUR.
`pricing`: `{source:'FIXED',amount:string}` o `{source:'CATALOG'}`. CATALOG solo sirve si coincide la unidad del catálogo; no convertir tarifas.
`conditions`: AND; grupo presente si alcanza minimumQuantity (default 1), ausente si cantidad 0.
Una modalidad sin condiciones es incondicional, no fallback: varias coincidentes requieren revisión y no se suman.
`parts`: INCLUDED | INDEPENDENT por grupo. Conflictos requieren revisión. Por defecto una pieza vinculada sin tratamiento comercial explícito requiere revisión.
Para configuración básica sin implementos: groups [], modes [modalidad sin condiciones ni parts].
Para días/metros alternativos: dos modalidades con ABSENT/PRESENT del mismo grupo.
Para compresor con accesorios incluidos: modalidad horaria y groups de accesorios/APT con treatment INCLUDED. No alterar tarifas globales de hijos.
GET no crea configuración; PUT guarda una revisión inmutable con vigencia efectiva. Familia < SKU < Asset: una configuración más específica reemplaza completa la heredada.
Perfiles históricos ya aplicados se conservan en snapshots de anexos; futuras ediciones no los reemplazan automáticamente.

## Composición y snapshots

La selección comercial se basa en vínculos documentales confirmados (`DocumentItem.componentParentAssetId`) y movimientos efectivos, jamás en nombres ni simple copresencia. La configuración actual de inventario solo sirve para armar nuevas entregas.
El vínculo de origen se identifica por ID del DocumentItem y padre Asset; los IDs de EquipmentConfigurationEntry no sustituyen la evidencia del documento.
Los grupos comerciales son identidades estables independientes de los vínculos físicos. Admiten selectores por equipo, SKU, familia y accesorio; así una familia puede permitir escoger distintas unidades.
Jerarquías documentales Asset→Asset se pueden recorrer con control de ciclos. Asset→Accessory se representa como hoja. Accessory→Accessory no tiene padre documental suficiente hoy: se señala como no resuelto; no inferir árbol desde configuración actual.
Snapshot comercial de la línea: profileId, revision/version, modeId, effectiveFrom, unit, minimum, pricing, parent/part IDs, vínculos documentales, fecha y tratamiento. Las piezas incluidas siguen visibles con texto Incluido; no reciben mínimo/cobro independiente.
Transporte/presencia no es uso: HOUR/METER requiere reportes; no copiar horas automáticamente de un equipo a otro independiente.
La herencia de mínimos del anexo sigue por modalidad/equipo/obra; nunca cruzar unidades. Un cambio de modalidad no repite el mínimo por quincena.

## Integración

Endpoints forman módulo CommercialProfilesModule. No renombrar ni editar endpoints existentes de EquipmentConfiguration.
La UI puede combinar en el mismo panel Configuración física y Modalidades de cobro, pero son operaciones/versiones separadas. Mostrar errores de guardado parcial y permitir reintentar.
No desplegar ni modificar producción. La tabla REV se trasladará a datos iniciales locales por IDs, sin diccionario operativo en el generador.

## Estado implementado y límites de la prueba (30 septiembre)

Implementados modelos CommercialProfile/Revision, endpoints protegidos y resolución por IDs. GET incluye `inherited` opcional con el perfil menos específico vigente hoy en Bogotá; el perfil propio mostrado es la última versión editable (puede ser futura).
Al confirmar una remisión se guarda `DocumentItem.commercialSnapshot` en su misma transacción. Falta de perfil también queda registrada como REVIEW: un perfil creado después no reinterpreta silenciosamente esa entrega.
Anexos preparan lotes físicos antes de resolver la unidad comercial y leen relaciones padre/hijo, snapshots y evidencia AccessoryMovement. INCLUDED suprime solo el cobro contextual del hijo, preservando su catálogo. Fuente ambigua o modalidad ambigua se presenta para revisión, sin cobro automático.

Límites explícitos: una composición que cambia durante el mismo alquiler requiere conciliación del tramo (no se conserva silenciosamente la tarifa original); accesorio separado sin concepto medible propio queda pendiente; Accessory→Accessory queda pendiente por falta de padre documental. No se inventan estas relaciones.
Las tarifas/mínimos por nombre de familia se retiraron del código operativo. `scripts/data/rev-commercial-family-defaults.json` es solo dato inicial; `seed-local-commercial-profiles.cjs` crea perfiles FAMILY por IDs exclusivamente en rev_annex_qa local y no sobrescribe perfiles.
Prueba transaccional reproducible `scripts/qa-commercial-profiles.cjs`: equipo arbitrario + implemento por IDs → METER40, hijo INCLUDED, edición antigua409, snapshot conserva tarifa1000 tras cambio9000, sin cargo adicional del hijo; revierte todos los datos de prueba.
