# Empalme revisado de un implemento individualizado

Empalme local del 9 de octubre cerrado: doce unidades con identidad y dos
referencias BULK retornables en `accessory_qa_cutover_20261009`. No queda saldo
positivo sin empalmar; el balde CASE anterior, con saldo cero, conserva su
retiro. Véase `implements-cutover-20261009.json`. Producción no se modificó.
La publicación requiere respaldo/preflight actuales y aplicar el manifiesto
revisado sobre esos datos, sin copiar UUID nuevos de QA. Auth real y firma/PDF
externo no se ensayaron con el bypass local.

Este empalme es distinto de convertir requisitos y máximos en recomendaciones.
Una recomendación no cambia identidad ni existencias. La promoción crea un
`Asset.isImplement=true` para **una unidad física revisada**, enlazado mediante
`ImplementIdentityBridge` a su `Accessory` histórico.

## Garantías del empalme individual

- Solo `Accessory.INDIVIDUAL` activo, con cantidad total uno y ubicación única.
- Propietario y ubicación actual se conservan; la familia/SKU SERIAL y su
  subfamilia se revisan explícitamente. Máquina e implemento pueden compartir
  familia SERIAL; compartir familia no crea compatibilidad ni hereda tarifas.
- No se expanden familias a unidades, no se crean nuevas compatibilidades ni se
  deducen relaciones por el nombre. Solo se retargetean vínculos concretos que
  ya apuntaban a esa misma unidad, conservando sus IDs y preferencias.
- Documentos, balances, movimientos, revisiones y perfil comercial histórico
  del `Accessory` no se eliminan ni se reescriben. El puente vuelve su inventario
  histórico de solo lectura y lo excluye de disponibilidad operativa.
- En bodega se genera una apertura contable `ADJUST`. En obra se generan dos
  filas contables: `ADJUST` en la bodega propietaria y `ON_SITE` en la obra. El
  balance resultante es cero en bodega y uno en obra. Ninguna fila inventa una
  remisión, recepción o devolución: `refDocumentId` permanece nulo.
- Un único puente y una huella de revisión permiten reintentar sin crear otra
  unidad, otro saldo, otro contador ni otra revisión comercial.
- El perfil propio vigente se copia al nuevo `Asset`; los perfiles vigentes
  que seleccionaban exactamente al implemento anterior reciben una nueva
  revisión con selector `ASSET`, efectiva desde el día de empalme. Las
  revisiones anteriores no cambian. Un cero para precio no configurado requiere
  `unconfiguredPrice: '0'` explícito en el manifiesto, autorizado por el usuario;
  no sustituye un perfil propio existente ni altera snapshots anteriores.
- El puente congela las condiciones comerciales para los anexos. Un padre
  documental histórico solo se conserva si se proporciona su origen revisado
  explícitamente y coincide con custodio, propietario, obra y posición actual.

El empalme documental admite una única entrega pendiente revisada mediante
`sourceDocumentItemId`, con remisión confirmada, cantidad uno, movimiento ASSIGN
exacto, misma obra y mismo custodio físico. Rechaza borradores, múltiples líneas,
devoluciones previas, recepciones, tránsito o custodia discrepante. La devolución
nativa conserva como origen el ID original; solo su lectura proyecta la identidad
Asset. No se modifica el DocumentItem histórico.

En anexos el lote anterior termina comercialmente en D-1 y la apertura nativa
inicia D, mediante proyecciones del servidor que no son devoluciones persistidas.
La devolución física nativa cierra esa apertura. Con mínimos positivos se exige
REVIEW hasta revisar continuidad de alquiler, reportes y ajustes guardados;
esta protección no se presenta como una migración terminada de esos reportes.

En esta copia no existen revisiones de anexos guardadas. Los dos baldes que
continúan en obra tienen mínimo cero y origen de minicargador revisado. Se
registró una `ImplementCommercialOriginReview` inmutable por balde: confirma
solo el origen comercial exacto, no asigna unidades ni cambia compatibilidad,
perfil histórico, puente original o ledger. El endpoint de anexos reconoce
cada balde con ese padre, una sola fila y tarifa cero. Los avisos históricos
de otros materiales continúan visibles; no se sustituyen por precios actuales.

## Cantidades retornables y ubicación confirmada

`BulkImplementPromotionService` convierte una referencia antigua en un
`Sku.isImplement=true, isConsumable=false` de familia BULK. Exige saldo entero
completo, positivo y exclusivamente en la bodega del propietario, sin historial
documental o grafo anidado ambiguo. La apertura es aditiva e inmutable; el puente
apunta a SKU, nunca a Asset. No crea una unidad por cada cantidad ni cambia el
tipo de control de la familia original. Las mangueras de succión y descarga
quedaron con una unidad cada una en VEREAL, conservando los vínculos concretos
preexistentes. Se probó remitir tres, devolver dos y luego una y rechazar un
segundo retorno del mismo origen, con reversión completa del ensayo.

Para el bache, trípode y guaya #7, `reviewedWarehouse` guarda la confirmación
expresa del usuario y exige el único origen documental exacto. Crea la apertura
actual en la bodega confirmada sin fabricar una devolución pasada. El origen
antiguo deja de ofrecer otra devolución únicamente después del empalme y su
tramo comercial termina en D-1. Los documentos y movimientos viejos no cambian.

La creación anterior devuelve HTTP 410. Sus páginas redirigen al inventario
nativo, los formularios anteriores se retiraron y la card abre la pestaña
Implementos. Office/Admin pueden editar la clasificación de un BULK desde su
detalle; ese cambio no recibe ni mueve existencias.

La entrada documental anterior `RequestAccessorySelector` se sustituyó por
`RequestImplementSelector`: elige unidades Asset o cantidades SKU disponibles
para el equipo concreto. El padre es una línea real del documento o un origen
documental/revisado del equipo que ya está en obra; nunca se fabrica otra línea
de máquina para entregar posteriormente un implemento. En devoluciones, la
pestaña Implementos muestra esas existencias nativas separadas del equipo
principal y conserva el origen documental exacto cuando existe.

Los dos baldes que continuaban en obra completaron, dentro de una transacción
revertida, devolución nativa sin inventar origen documental, tránsito/recepción
del proveedor, remisión posterior al padre revisado, segunda devolución y
recepción. La máquina principal no se movió. La devolución también se ensayó
desde la UI en escritorio y móvil: selección, autoguardado y reapertura del
borrador con Asset, no Accessory. Se retiraron únicamente los borradores QA,
comprobando hashes de documentos, líneas, saldos, movimientos y ledger.
Las evidencias de recepción del ensayo fueron metadatos temporales; no se
ensayaron la firma ni la carga a almacenamiento externo.

## Operación local protegida

`apps/api/scripts/promote-local-implement.cjs` no lee `DATABASE_URL`. Solo permite
la base QA autorizada y el UUID de la única unidad confirmada para este ensayo.
La vista previa es el comportamiento predeterminado. Aplicar exige respaldo
custom de PostgreSQL validado y la misma huella de revisión.

El script compara las tablas protegidas antes y después dentro de la misma
transacción, además de comprobar que equipos, ledger y revisiones anteriores
permanecen idénticos. Registra el resultado en el directorio privado del
respaldo. No se ejecuta durante un build, una migración ni un despliegue.

## Antes de producción

1. Auditar la base actual y clasificar cada identidad que todavía use
   `Accessory`, sin seleccionar unidades por nombres o familias.
2. Resolver uno por uno documentos, tránsito, cantidades retornables y
   consumibles, relaciones anidadas y agenda comercial que esta versión rechaza.
3. Ensayar apertura, devolución, remisión posterior, nueva devolución y
   reintento; comprobar una sola existencia y documentos históricos intactos.
4. Preparar un manifiesto explícito de unidades autorizadas, respaldo nuevo,
   ventana controlada y reversión compatible con movimientos posteriores.
5. Publicar esquema, guardas, lectores documentales/comerciales e interfaz
   juntos. No desplegar solo el formulario ni ejecutar este script local contra
   producción cambiando una URL.

## Unidad ensayada en QA

La sección siguiente describe el ensayo anterior del 2 de octubre, no el estado
de producción actual. En el snapshot del 9 de octubre el registro CASE anterior
está retirado. El empalme local usa el nuevo registro con cantidad uno en bodega,
conserva el número #2 y reemplaza únicamente el vínculo predeterminado del CASE
#2. Nunca revive la existencia retirada. Los manifiestos privados verifican
historial y reintentos; ningún UUID de Asset generado en QA se copia a producción.

El balde predeterminado del CASE SR240B #2 ya fue promovido únicamente en la
base local `configuration_ui_qa_20261002`. Conserva una existencia en la misma
obra, el vínculo predeterminado y la tarifa revisada cero incluida en el conjunto.
La preparación real del anexo reconoce un único lote nativo resuelto. El
registro anterior conserva su historial y ya no puede originar otro movimiento.
El reintento reutiliza la misma identidad sin agregar saldos ni revisiones.

Se probaron en PostgreSQL, con rollback de fixtures: devolución, nueva remisión,
nueva devolución, rechazo atómico de una devolución duplicada, inmutabilidad de
ambas aperturas y preparación de anexos sin reabrir lotes cerrados ni alterar
precios congelados. Las guardas DB requieren una apertura contable compatible y
un puente revisado antes de confirmar la apertura en obra.

La imagen original y el candidato de empalme se conservan en
`docs/release-assets/bucket-case-sr240b-2.*`. Ese manifiesto **no ejecuta una
migración ni acredita el estado actual de producción**. Su preflight debe
repetirse con datos actuales antes de publicar; ni las URLs localhost ni el
UUID del Asset generado en QA se copian a producción.

El usuario confirmó posteriormente que este balde debe llevar el número **#2**,
igual que el CASE #2, y el #1 corresponde al balde del BOBCAT S650 #1. En QA se
corrigieron únicamente `Asset.internalNumber`, su código público correspondiente
y el contador de su propietario/subfamilia. Se preservaron el mismo UUID,
imagen, vínculo predeterminado, puente histórico, existencias y documentos. El
manifiesto contiene este número revisado para el futuro preflight de publicación.

La sección de ruta recomendada y su opción de agregar familias quedan archivadas
en la interfaz. Sus componentes se conservan sin importarlos desde el editor
activo y sus entradas guardadas permanecen en la configuración al editar
implementos. No se borraron rutas, relaciones ni documentos al archivarla.
