# Accesorios: compatibilidad, existencias y custodia

Módulo independiente del alta de equipos serializados. No crea familias/SKUs ficticios para registrar un accesorio y no modifica los componentes anteriores.

## Modelo

- `Accessory`: una unidad individualizada con código único, una referencia retornable por cantidad (`RETURNABLE`) o una referencia consumible. Las dos referencias por cantidad se controlan por unidades enteras de un propietario, sin código individual. Varios individualizados del mismo modelo son registros independientes.
- Compatibilidad: una familia principal de equipos SERIAL y un alcance excluyente: `FAMILY`, `SUBFAMILIES` o `ASSETS`. Los dos últimos admiten múltiples destinos dentro de esa familia. `FAMILY`/`SUBFAMILIES` incluyen automáticamente futuros equipos de ese alcance.
- `AccessoryBalance`: existencias en una bodega, asignadas a un equipo en bodega, con un equipo en una obra concreta o en tránsito bajo una devolución. El propietario no cambia con los traslados. El saldo del accesorio no crea una ubicación física independiente para el equipo.
- `AccessoryMovement`: ingreso, entrega a equipo, devolución a bodega, traslado/intercambio, consumo, baja, tránsito y recepción de proveedor. Cada movimiento tiene motivo, fecha, actor y ubicaciones descriptivas. Los movimientos documentales enlazan el documento que los produjo.
- `DocumentItem`: el nuevo renglón usa `accessoryId`, origen y equipo asociado; no un SKU/equipo ficticio. Guarda nombre, código, tipo y referencia descriptiva capturados por el servidor. Editar la card no cambia documentos ya emitidos.
- `AccessoryProviderReceiptItem`: vincula una recepción con el movimiento de devolución original y su cantidad, permitiendo recepción parcial sin duplicar stock.
- `AccessoryRevision`: datos anteriores y posteriores al editar, incluidas identidades y nombres de compatibilidad.

Crear compatibilidad **no entrega existencias**. Entregar consumibles **no los consume**. Ejemplo: ingreso 10 → entrega 10 → consumo 6 → devolución 4 = saldo de bodega 4 e historial de los cuatro movimientos.

El código del individualizado es opcional en el formulario: si se deja vacío al crear, el servidor genera `ACC-` seguido de 12 caracteres alfanuméricos hexadecimales. Se puede ingresar el código físico existente. Al editar, dejarlo vacío conserva el código actual. Los reintentos de una misma alta conservan identidad, código y una sola existencia; los códigos manuales duplicados siguen rechazándose. No se renumeran accesorios existentes ni se asigna código individual a referencias por cantidad.

Las mangueras retornables permiten reposición y devolución parcial, pero nunca `CONSUME`. Ejemplo: ingreso 10 → entrega 6 → devolución 2 = 6 en bodega y 4 en obra; siguen existiendo 10. Pinzas y guayas se individualizan y se vinculan a sus equipos. Compatibilidad `ASSETS` permite restringir un martillo a una sola máquina, sin ampliar a toda su familia ni mover existencias automáticamente.

## Entradas de interfaz

- Inventario → Accesorios: cards, búsqueda y paginación.
- Card/ficha de equipo → Agregar accesorio: formulario propio con familia y equipo precargados.
- Alta estándar de equipo: invitación opcional después de guardar, sin repetir el alta ni obligar a registrar accesorios.
- Pestaña Accesorios de la ficha del equipo: compatibles y asignados. Vincular uno existente amplía su alcance sin borrar los destinos anteriores; requiere revisar y guardar. No mueve existencias.
- Card de accesorio: edición, movimientos e historial.
- Transporte → generar documento → Items → Agregar accesorios / Devolver accesorios. Se puede remitir junto con el equipo o abastecer uno que ya está en la obra. La devolución puede ser solo de accesorios y parcial para retornables por cantidad o consumibles.
- Entregas a proveedor: incluye accesorios devueltos directamente y los que quedaron primero en custodia de una bodega propia; mantiene la evidencia y el comprobante exigidos por el flujo existente.

Formularios, movimientos, historial, selector de existentes y cards tienen componentes separados bajo `apps/web/src/components/accessories`. Los modales se cargan bajo demanda.

## Integridad y permisos

- Cards y movimientos manuales: ADMIN y OFFICE. DRIVER puede consultar el selector documental, crear/enviar solicitudes y usar la recepción de proveedor según sus permisos existentes; no obtiene acceso de administración de accesorios. JWT y RolesGuard obligatorios; el bypass no se configura dentro del módulo.
- Restricciones SQL para identidad, cantidades no negativas y ubicaciones excluyentes; FKs para familia, subfamilias, equipos, propietario y saldos.
- Transacciones cortas, bloqueo por accesorio para cambios y movimientos; bloqueo de equipos en orden estable para evitar interbloqueos en intercambios.
- Claves de idempotencia para creación/movimientos. Repetir una operación idéntica no duplica registros ni descuenta nuevamente; reutilizar su clave con otros datos se rechaza.
- Versión optimista para ediciones: no sobrescribir silenciosamente cambios de otro usuario.
- No reducir compatibilidad excluyendo un equipo con existencias asignadas. Primero devolver/trasladar.
- No desactivar/eliminar un equipo con accesorios asignados. No archivar un accesorio con existencias.
- Un individualizado siempre tiene cantidad uno y no se repone como cantidad ni se consume. Para sacarlo de inventario existe la baja.
- No cambiar el tipo ni el propietario mediante edición ordinaria: preserva la identidad y el historial. Una transferencia de propiedad necesita un flujo específico, no un cambio silencioso del registro.

## Operación documental

- Los borradores y autoguardados no reservan ni descuentan existencias. Se conserva el origen al editar, resolver otros ítems, recuperar un motor o sincronizar la cola offline.
- Aprobar un documento con accesorios bloquea el documento, accesorios y equipos en orden estable. Los saldos del accesorio, el ledger del equipo y el estado CONFIRMED se escriben en **la misma transacción**. Si falla cualquiera, todo se revierte. Reintentar la aprobación confirmada no vuelve a mover inventario.
- Se comprueban compatibilidad, propietario real, stock suficiente, equipo asociado, obra de origen y documentos posteriores. Para consumibles se usan cantidades enteras; la entrega nunca equivale a consumo.
- Una asignación previa en bodega se mueve desde ese saldo, sin descontar otra vez de la bodega. No se permite despachar un equipo dejando sin documentar sus accesorios previamente asignados: hay que incluirlos o devolverlos a la bodega.
- La asignación/intercambio manual requiere equipos en la misma bodega. Entregas y devoluciones de obra pasan por documentos; consumo y baja se registran en la card contra el saldo de la obra concreta. Tránsito y recepción de proveedor no se pueden invocar como movimientos manuales.
- Una devolución a proveedor queda en tránsito, no disponible en su bodega. La recepción exige ambas evidencias, valida el propietario y el saldo pendiente, y mueve existencias una sola vez. Se puede recibir parcialmente.
- Los documentos con accesorios conservan un solo consecutivo y se imprimen en las páginas necesarias; no se separan automáticamente cada 20 renglones. Los documentos sin accesorios mantienen su división anterior.
- Los saldos y movimientos de accesorios se consultan en sus cards, con enlaces a los documentos. No se duplican como movimientos ficticios en `StockLedger` ni como equipos en el inventario anterior.

La integración está separada en `accessory-document-items.ts` (capturas del documento), `accessory-document-options.ts` (selección), `accessory-documents.service.ts` (movimientos documentales) y `accessory-provider-returns.service.ts` (recepción). El formulario de transporte usa `RequestAccessorySelector.tsx`; la construcción común del payload sigue en `request-items.ts`.

## Límites deliberados de esta implementación

No se agregan tarifas ni cobros automáticos de accesorios: la facturación existente sigue usando equipos/SKUs y omite estas nuevas referencias sin tarifa. Definir alquiler o cobro por consumo requiere reglas comerciales aparte. El ledger general de equipos no mezcla accesorios; su trazabilidad está en el módulo específico y en los documentos.

Las relaciones `AssetFamilyComponent`, sus equipos/SKUs anteriores y los documentos permanecen intactos. Migrarlos exige identificar las unidades y saldos existentes y definir equivalencias sin duplicar inventario. No se hace conversión automática. Tampoco se implementa seguimiento de desgaste porcentual: consumo es disminución explícita por unidades.

## Migración y verificación

Aplicar las cinco migraciones aditivas mediante el proceso habitual **en el entorno de prueba antes de desplegar**: `20260909120000_add_accessory_inventory`, `20260909123000_index_accessory_owner_and_catalog`, `20260914120000_accessory_documents`, `20260914123000_accessory_provider_receipts` y `20260916120000_add_returnable_accessories`. Generar Prisma Client al construir. No hay cambios de dependencias. Estas migraciones crean el modelo, no ejecutan el empalme: ver `docs/accessories-cutover.md`.

Comandos desde la raíz:

```sh
npx prisma generate --schema apps/api/prisma/schema.prisma
npm --workspace apps/api run build
npm --workspace apps/web run build
npm --workspace apps/api test -- --runInBand
npm --workspace apps/web test
```

Las pruebas de PostgreSQL son opt-in mediante `ACCESSORY_TEST_DATABASE_URL`. Solo aceptan host `127.0.0.1`/`localhost` y una base llamada `accessory_qa_*`; jamás reutilizan `DATABASE_URL`. Preparar previamente una copia local con migraciones aplicadas. Los tests crean y eliminan solo sus propios fixtures.

```sh
ACCESSORY_TEST_DATABASE_URL='postgresql://USUARIO:CLAVE@127.0.0.1:PUERTO/accessory_qa_PRUEBA' npm --workspace apps/api test -- --runInBand
```

Cubren consumo parcial/devolución, doble entrega concurrente, reintentos, compatibilidad, versiones, intercambio, archivo y eliminación con custodia pendiente. La suite documental añade aprobación concurrente, rollback mixto, obra incorrecta, devolución excesiva, asignación previa, reposición a equipo en obra, más de 20 renglones, rechazo y recepción de proveedor directa o pasando por bodega propia. Las pruebas de permisos se ejecutan con autenticación habilitada, independientemente del bypass de la UI local. Las pruebas frontend cubren la conservación de accesorios en payload, autoguardado y cola offline; las de PDF comprueban referencias y paginación.

La instalación completa desde una base vacía tiene una limitación previa: `20260805202000_set_three_ton_vibrocompactors_hourly` requiere datos de vibrocompactadores y falla si no existen. No se cambió esa migración; la nueva migración se verificó sobre una copia local del snapshot existente.
