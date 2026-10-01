# Motor y borradores de anexos

Estado: cálculo y persistencia de borradores implementados. No es un generador
completo para cobro: falta el adaptador de fuentes operativas, la pantalla de
revisión, reportes digitales, costos laborales, aprobación y prefactura.

## Contrato

- `POST /annexes/preview`: calcula desde AnnexInput validado, sin persistir.
- `POST /annexes/drafts`: recibe `{ customerWorksiteId, expectedRevision, reason,
  input }`; primera revisión usa expectedRevision=0. Recalcula en servidor,
  valida existencia de obra, máquinas, referencias y empleados, y guarda entrada
  y resultado. El cliente no envía totales autoritativos.
- `GET /annexes/drafts?customerWorksiteId=UUID`: últimos 100 borradores de la obra.
- `GET /annexes/drafts/:id`: última revisión con entrada y resultado.
- `GET /annexes/drafts/:id/history`: metadatos de revisiones anteriores.

ADMIN/OFFICE. Este repositorio aún no ofrece aislamiento multitenant completo;
los permisos existentes son por rol. No presentar este módulo como SaaS aislado
por empresa hasta añadir ámbito de empresa a usuarios y fuentes.

`period.to` es el fin del corte; `period.through` es el último día con datos.
El borrador 16–30 puede tener through=25 y posteriormente through=26. Guardar
una revisión conserva las anteriores, incluidas correcciones de períodos.

## Entrada y procedencia

El esquema estricto está en annex-input.ts. La política se guarda con versión:
calendario, festivos, mínimo de horas y tratamiento del día de devolución.
El motor admite políticas distintas de REV; la configuración de REV establece
mínimo seis horas por máquina/día. La inclusión de devolución se debe escoger
explícitamente hasta cerrar esa regla para fechas distintas de entrega.

Los alquileres diarios representan lotes de entrega identificados, no el saldo
actual de inventario. Cada devolución parcial corresponde a su lote. Un saldo
migrado deberá convertirse a lote inicial conciliado por el futuro adaptador.
`source.reference` identifica un renglón de origen, no solo el encabezado de un
documento con varios renglones. Una copia digital conserva la referencia del
reporte físico para evitar duplicidad.

Los reportes por máquina/día distinguen REPORTED, NO_WORK confirmado y PENDING.
Omitir una máquina/día no prueba ausencia de trabajo: el resultado declara
sourceCompleteness=UNVERIFIED. El adaptador debe generar pendientes para los
huecos de máquinas presentes en obra y verificar fuentes completas.

Las horas son reportadas/comerciales, no un sustituto del registro real de
jornada del operario. Cada día reportado produce LABOR_PENDING hasta conectar
la clasificación de trabajo real y traslado de costos adicionales sin margen.
No se calcula recargo del operario sobre la tarifa de alquiler.

## Decimales y excepciones

Todos los valores económicos viajan como cadenas decimales. Se usa Decimal y
redondeo HALF_UP a dos decimales por máquina/lote y día (PER_DAY_HALF_UP_2),
registrado en el resultado. El total suma importes redondeados de las líneas.
El descuento monetario es bruto menos neto para conservar conciliación exacta.

Si se edita el precio efectivo, este valor es autoritativo y el porcentaje se
deriva con 12 decimales para presentación; nunca se recalcula el precio a partir
del porcentaje presentado. Base positiva; descuento 0–100%; reducciones y
exenciones por avería requieren motivo. La exención muestra bruto y reducción
sin alterar cantidades, horas fuente ni inventario.

## Persistencia

Aplicar la migración 20260926140000_annex_drafts antes del API. No se ejecutó
contra producción. Guardar bloquea la relación cliente–obra, verifica períodos
solapados y revisión esperada, y añade una instantánea en una transacción.
Una segunda petición con revisión obsoleta se rechaza: no duplica cobro ni pisa
una corrección concurrente. Todavía no existe aprobación ni emisión final.

Pruebas: ejemplos reales, parcialidades, mínimos, calendario, fechas imposibles,
año bisiesto, descuentos, duplicados, exenciones, pendientes, solapamientos y
actualizaciones obsoletas. Los tests del servicio usan transacciones simuladas;
la migración y concurrencia real deben verificarse además en PostgreSQL de ensayo.

## Preparación desde inventario y revisión web

`GET /annexes/prepare?customerWorksiteId=UUID&from=YYYY-MM-DD&to=YYYY-MM-DD&through=YYYY-MM-DD`
reconstruye lotes desde StockLedger con lectura RepeatableRead. Usa la fecha
civil de Bogotá y los signos del modelo de obra (OUT negativo entra; ON_SITE
positivo entra; IN/TRANSIT positivo sale). Asigna devoluciones FIFO dentro de
referencia/activo y propietario; no suma DocumentItem ni snapshots otra vez.
No garantiza conciliación comercial: anulaciones, signos compensatorios,
saldos insuficientes, doble alquiler serializado el mismo día y precios ausentes
producen incidencias y excluyen el grupo afectado del subtotal preparado.
La UI advierte que este subtotal puede ser incompleto y no es una prefactura.

No utiliza los cortes comerciales de DocumentItem como fechas físicas: detecta
su presencia y exige revisión hasta implementar una asignación inequívoca por
lote. Usa tarifa actual del catálogo con advertencia sobre vigencia histórica.
Para máquinas por hora genera PENDING por cada día de presencia, incluidos
fines de semana, sin inventar horas ni confirmar ausencia de trabajo.

Pantalla `/billing/annexes`: cliente/obra, período, calendario, entregas y
reportes físicos con empleado, descuento por porcentaje o precio efectivo,
exenciones justificadas, vista previa y guardado. Las incidencias se conservan
como sourceIssues por revisión (observaciones de revisión, no una certificación
confiable del cliente). El servidor siempre recalcula los importes.

Actualizar la fecha de datos requiere guardar primero. Se conservan precios,
descuentos, exenciones y reportes de líneas existentes; se agregan los días
nuevos pendientes. Si la nueva reconstrucción elimina líneas anteriores,
se detiene la actualización y se conserva el borrador para conciliación.
No hay actualización desatendida ni aprobación final automática.

QA de la interfaz: navegador con respuestas HTTP simuladas y motor real de
cálculo compilado. No equivale a una prueba de integración con PostgreSQL.
