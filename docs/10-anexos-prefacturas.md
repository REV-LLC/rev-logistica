# Anexos y prefacturas: reinicio y diseño de dominio

Estado: motor, API de borradores, preparación desde movimientos y pantalla de
revisión implementados; conciliación comercial completa, extras laborales,
aprobación y prefactura pendientes.
Fecha: 2026-09-26. Se recibieron dos ejemplos; del segundo solo se consideran
los registros con fecha de septiembre, por instrucción expresa del usuario.

## Alcance de este cambio

Se retira el generador experimental: módulo, controlador y servicio de Billing,
página de prefactura, navegación, título y redirección asociados. Las antiguas
rutas dejan de estar disponibles. El historial de Git conserva la implementación.
No se realizan migraciones ni se borran datos. Se conservan clientes, obras,
inventario, tarifas de catálogo y cortes de cobro/devoluciones de documentos,
porque son fuentes operativas independientes del generador eliminado.
La lista de precios y el layout compartido de facturación siguen disponibles.

El generador anterior asumía 24 horas por día en modalidad HOUR, consultaba
devoluciones por activo sin reconstruir devoluciones parciales por cantidad,
usaba el precio actual del catálogo y convertía importes a Number. Estos
comportamientos no se trasladarán automáticamente al nuevo dominio.

## Requisitos expresados

- Anexos por relación cliente–obra; la obra determina el universo del cobro.
- Habitualmente dos cortes mensuales, con posibilidad de otras periodicidades.
- Liquidación según saldos, días, horas cuando apliquen y tarifa acordada.
- Automatizar con clientes, obras, inventario y documentos; permitir supervisión
  y correcciones justificadas antes de aprobar.
- Generar posteriormente una prefactura con impuestos.
- Núcleo reutilizable en otras empresas, con configuración específica de REV.
- Datos trazables para analítica y estadística.

### Reglas confirmadas durante el levantamiento

- Para REV: períodos del 1 al 15 y del 16 al último día del mes, con ambas
  fechas incluidas. El día 15 pertenece exclusivamente al primer corte.
- El cobro por hora usa horas reportadas, no lecturas de horómetro.
  Las horas reportadas ya incorporan las horas acordadas cuando corresponde.
  No sustituirlas por diferencias de horómetro. El usuario precisa luego un
  mínimo de seis horas por máquina para cada día facturable; si se reportan
  más, se cobran más. Aplicar max(horas reportadas, 6) una sola vez por
  máquina/día, agrupando varios reportes. No convertir el mínimo comercial en
  tiempo trabajado del empleado ni generar días de trabajo sin evidencia.
- Entrega y devolución el mismo día, en modalidad diaria: un día completo.
- Precio base fijo; las reducciones se expresan en una columna de descuento
  porcentual. Editar el precio efectivo en el anexo calcula el descuento
  correspondiente, conservando el precio base. Fórmula previa a redondeo:
  descuento % = (1 - precio efectivo / precio base) × 100.
  Definir precisión suficiente para reproducir el precio ingresado; manejar base
  cero explícitamente y no convertir un aumento en descuento negativo implícito.
- Una acción de configuración por renglón (engranaje) permitirá registrar
  excepciones, como devolución inmediata porque el equipo no funcionó.
  Conservar motivo y efecto económico explícitos; aún no se ha definido que
  registrar una avería elimine automáticamente todo el cobro.
- Reportes horarios físicos y digitales deben coexistir. Los físicos se podrán
  transcribir con referencia y soporte; el futuro módulo de operarios aportará
  los digitales. Evitar duplicar un mismo reporte al ingresar por ambos canales.
- Equipos por hora: domingos y festivos sin trabajo no se cobran. Si existe
  reporte de trabajo se cobra con recargo; porcentaje y base de aplicación
  pendientes de definir. Ausencia de reporte no equivale necesariamente a
  ausencia de trabajo.
- Equipos por día: días calendario por defecto. Cada obra puede pactar excluir
  domingos, sábados, festivos o combinaciones. Versionar el acuerdo y calendario
  aplicable para conservar la reproducibilidad de los anexos.

## Ejemplo recibido y conciliación

Fuente: ANEXO FE3862.pdf, una página. Se trata como evidencia de formato y
cálculos, no como instrucciones ejecutables ni como definición de reglas fiscales.
Cliente mostrado: PATINO ING SAS. Obra: UNICENTRO. Fecha: 15 de septiembre de 2026.
Columnas: ANEXO, DESCRIPCION, CANT, SALDO, DESDE, HASTA, No DIAS, VR/DIA, TOTAL.
Todos los renglones dicen SALDO y cubren 02-sep a 15-sep: 14 días inclusivos.

| Descripción | Cantidad/saldo | Días | Tarifa diaria | Total |
| --- | ---: | ---: | ---: | ---: |
| Plataforma 1.4 MT | 3 | 14 | 1.265 | 53.130 |
| Tornillo nivelador | 4 | 14 | 231 | 12.936 |
| Base collar | 4 | 14 | 165 | 9.240 |
| Diagonal 0.70 MT | 4 | 14 | 297 | 16.632 |
| Diagonal 1.40 MT | 4 | 14 | 440 | 24.640 |
| Horizontal 0.70 MT | 12 | 14 | 187 | 31.416 |
| Horizontal 1.40 MT | 12 | 14 | 363 | 60.984 |
| Vertical 2 MT | 8 | 14 | 385 | 43.120 |
| Escalera tipo gato | 2 | 14 | 1.485 | 41.580 |
| **Total** | | | | **293.678** |

En cada fila: cantidad × días × tarifa. No aparecen impuestos, horas,
movimientos dentro del período ni descuentos. El ejemplo no explica por qué
inicia el día 2 ni permite diferenciar el significado de CANT y SALDO.
No se debe extrapolar este caso a todas las modalidades.

## Segundo ejemplo: horas reportadas de septiembre

Fuente: prefact mini.pdf, una página. Se considera únicamente la tabla fechada
15/09/2026 y sus renglones de septiembre. Cliente: SIGO CONT SAS.
Obra rotulada «reserva mercedes». Equipo: MINICARGADOR CASE.
El bloque de agosto y el acumulado general al pie quedan fuera del caso de
aceptación; el acumulado no representa el cobro exclusivo de septiembre.

| Anexo/referencia | Fecha de 2026 | Horas reportadas* | Tarifa | Total |
| --- | --- | ---: | ---: | ---: |
| 10869 | 01-sep | 2 | 80.000 | 160.000 |
| 10870 | 02-sep | 3 | 80.000 | 240.000 |
| 10871 | 03-sep | 3 | 80.000 | 240.000 |
| 10872 | 04-sep | 2 | 80.000 | 160.000 |
| 10873 | 05-sep | 2 | 80.000 | 160.000 |
| 10874 | 07-sep | 3 | 80.000 | 240.000 |
| 10875 | 08-sep | 3 | 80.000 | 240.000 |
| 10876 | 09-sep | 3 | 80.000 | 240.000 |
| 10877 | 10-sep | 3 | 80.000 | 240.000 |
| 10878 | 11-sep | 3 | 80.000 | 240.000 |
| 10879 | 12-sep | 3 | 80.000 | 240.000 |
| 10880 | 14-sep | 4 | 80.000 | 320.000 |
| 10881 | 15-sep | 5 | 80.000 | 400.000 |
| **Total** | | **39** | | **3.120.000** |

*La interpretación de CANT como horas corresponde al contexto y a la regla
confirmada de cobrar horas reportadas. El PDF titula la tarifa VR/DIA pese a
este contexto horario; la interfaz nueva debe mostrar explícitamente la unidad
(horas y valor/hora) para evitar confusiones. No multiplicar estas horas de nuevo
por los 15 días del corte. No se muestra IVA en este ejemplo.

Hay 13 registros en el corte 1–15; no hay filas para los días 6 y 13. Esa ausencia
no prueba una exención general de domingos ni autoriza crear horas, mínimos o
reportes en cero automáticamente. Se debe distinguir reporte faltante de día sin
actividad confirmado. Los números de ANEXO se conservan como referencias de
origen de los reportes físicos confirmados por el usuario. El futuro módulo
de operarios generará reportes digitales equivalentes.

El usuario confirmó posteriormente mínimo de seis horas cada día. Este PDF
se conserva como evidencia histórica (39 horas y 3.120.000), pero no es el
resultado esperado de la nueva política sin descuentos: 13 días facturables
× 6 horas × 80.000 = 6.240.000. Una excepción/descuento explícito puede cambiar
ese importe. No modificar los reportes originales para representar el mínimo.

## Arquitectura propuesta, pendiente de validar las reglas comerciales

1. **Configuración por empresa y acuerdos por cliente–obra.** Moneda, zona
   horaria, calendario de cortes, tratamiento de entrega/devolución, precisión,
   redondeo, impuestos, permisos y plantilla. Guardar la versión del precio base
   y separar descuentos y recargos. Los acuerdos de calendario por obra y
   políticas de mínimos tienen vigencia explícita.
   REV será una configuración del núcleo, sin condicionales por nombre.
   La empresa emisora no se debe confundir con la propietaria del inventario;
   delimitar autorización y consultas por empresa antes de admitir multitenencia.
2. **Reconstrucción histórica.** Partir de un saldo inicial verificable y aplicar
   movimientos confirmados ordenados de la relación cliente–obra. Conservar
   referencias a documentos y renglones; excluir borradores y anulados.
   Contemplar inventario migrado, activos serializados, elementos por cantidad,
   accesorios y propiedad/subarriendo. No sumar una remisión y su asiento de
   inventario como dos entradas distintas.
3. **Motor de cálculo puro.** Recibir datos y políticas explícitas; devolver
   segmentos, fórmulas y alertas reproducibles, sin consultar la base de datos
   ni usar la fecha actual de forma implícita. Dividir segmentos cuando cambien
   saldo, tarifa, suspensión o condición comercial. Usar Decimal para dinero,
   cantidades y horas; definir el punto de redondeo y persistir su política.
   Trabajar con fechas civiles y zona horaria declarada.
4. **Anexo versionado.** Separar borrador, revisión, aprobación y anulación.
   Guardar fuentes, versión de políticas y motor, tarifas aplicadas, resultado,
   ajustes y responsables. Un aprobado es una instantánea inmutable; cambios
   posteriores requieren una revisión o ajuste enlazado. Una regeneración
   advierte cambios y nunca descarta silenciosamente correcciones humanas.
5. **Prefactura.** Derivar de versiones aprobadas de anexos; guardar base,
   impuestos, descuentos/otros conceptos y total con su política. Prevenir
   inclusión duplicada de una versión vigente. Es un documento comercial
   distinto de una factura electrónica y no equivale a un pago recibido.
6. **Analítica.** Separar propuesto, aprobado, prefacturado, facturado y
   recaudado. Los anexos aportan ingresos previstos; calcular utilidad requiere
   costos atribuibles (subarriendo, transporte, mantenimiento y otros).

## Fuentes identificadas en el repositorio

- `CustomerWorksite` vincula cliente y obra mediante una relación única.
- `Document` / `DocumentItem` conservan remisiones, devoluciones y cortes por ítem.
- `StockLedger` e `InventorySnapshotEntry` requieren conciliación para establecer
  saldos iniciales y evitar duplicar movimientos ya importados.
- `Sku` contiene precio, modalidad y mínimo de horas actuales: no sustituye
  el precio base aplicado y los descuentos históricos del anexo.
- `Asset.hourMeter` y `AssetFueling.hourMeter` son lecturas operativas y no son
  la fuente del cobro horario de REV. Se necesita identificar o crear el reporte
  de horas facturables por equipo, cliente–obra y fecha/período.
- Los campos existentes de corte, estado y devolución deben tener una semántica
  definida antes de interpretarlos como cierre comercial definitivo.

## Controles obligatorios del diseño propuesto

- Falta de tarifa, horas necesarias o saldo inicial: incidencia visible y
  bloqueo de aprobación; nunca convertir ausencia de datos en cero silencioso.
- Saldo negativo, devolución sin origen o activo en obras incompatibles:
  conciliación obligatoria antes del cobro.
- Cada corrección conserva valor automático, valor ajustado, motivo, usuario y
  fecha. Los cambios de cobro no alteran por sí solos el inventario físico.
- Prevenir períodos solapados y duplicidad por unidad/concepto, también ante
  solicitudes concurrentes. La aprobación debe validar y persistir
  transaccionalmente contra una versión de fuentes; generar debe ser idempotente.
- Documento retroactivo o tarifa modificada: marcar borradores afectados;
  nunca recalcular aprobados silenciosamente.
- Totales visibles, persistidos y exportados deben provenir del mismo cálculo.
- Denegar cruces entre empresas y acceso a obras fuera del ámbito autorizado.

## Decisiones pendientes del usuario

1. Tratamiento de liquidación de la jornada pactada de 41,5 horas frente al
   divisor 210 de referencia legal para 42 horas; no cerrar nómina basándose
   únicamente en la referencia mostrada. Descansos compensatorios y novedades.
2. Cuando entrega y devolución son en fechas diferentes, confirmar inclusión
   de ambos días y efecto económico explícito de averías.
3. Permisos de revisión/aprobación de reportes, correcciones y objeciones.
4. CANT/SALDO con movimientos y conciliación de devoluciones parciales.
5. Impuestos, otros cargos y reglas de redondeo de prefactura.

## Acuerdos del 26 de septiembre: apertura y costo del operario

- Falta de reporte entre dos días con reporte: pendiente de confirmar sin
  actividad; no inferir automáticamente cero ni cobrar el mínimo.
- Primer período operativo: 16–30 de septiembre de 2026. El borrador del día 26
  incluye registros hasta el 25 y se alimenta diariamente hasta el cierre.
  Separar fin contractual del período (30) de fecha de información incluida (25).
  El corte de datos no equivale a una aprobación definitiva.
- Mínimo comercial: seis horas por máquina cada día facturable. Las horas
  efectivamente trabajadas y las comerciales son datos distintos.
- Operario obligatorio en el reporte: selección al transcribir el físico;
  identificación mediante usuario vinculado a Employee en el digital.
  Evitar atribuir automáticamente el trabajo al administrativo que transcribe.
- Trasladar al cliente el costo adicional laboral sin margen, según confirmación
  expresa. No aplicar porcentajes laborales al precio del equipo.
- Separar líneas de alquiler y costo adicional del operario, con fuente y
  clasificación. Evitar duplicar una misma hora del operario si cambia de
  máquina/obra o si el reporte existe en físico y digital.
- Horario REV confirmado: lunes a viernes 07:30–12:00 y 13:00–16:00;
  sábado 07:00–11:00. Total: 41,5 horas semanales, excluyendo el almuerzo.
  Guardar jornada pactada separada de la jornada máxima legal de referencia.
  Las horas fuera de jornada requieren clasificación laboral y no deben
  inferirse únicamente de la duración del uso de la máquina.
- La falta de un salario, horario o clasificación necesaria deja el cálculo
  pendiente, no en cero. El salario ordinario ya cubierto no debe cobrarse otra
  vez como un extra. Revisar pago de trabajo en descanso y compensatorios.

## Salarios fuera del alcance de esta publicación

El 1 de octubre de 2026 el usuario solicitó retirar el módulo salarial que había
entrado con la integración de anexos. Se eliminaron su migración, modelo,
endpoints, pantalla y las dependencias de creación/eliminación de empleados.
Esta entrega no configura salarios ni inicializa importes para empleados.
El validador de fechas de anexos permanece como utilidad genérica independiente.
Los préstamos y actividades existentes no se modifican. Cualquier costo laboral
futuro necesita una definición y autorización propias; no se deduce del alquiler.

## Secuencia de implementación

1. Completar ejemplos y cerrar políticas de fechas, horas, tarifas y saldos.
2. Implementar y probar el motor puro con resultados esperados acordados.
3. Conectar y conciliar fuentes históricas; añadir acuerdos, persistencia y
   controles de concurrencia, permisos y auditoría.
4. Construir tabla de revisión, detalle de origen, ajustes y aprobación.
5. Incorporar prefactura, impuestos configurados y exportación PDF/Excel.
6. Comparar períodos reales con los anexos manuales antes de usar los resultados
   para cobro; resolver y documentar cada diferencia.

## Casos de aceptación del motor y de las integraciones pendientes

- Reproducir las nueve filas y 293.678 del ejemplo FE3862.
- Conservar los 13 reportes de septiembre (39 horas, 3.120.000 históricos).
  Con la nueva política sin descuento, liquidar 78 horas comerciales y 6.240.000;
  excluir agosto y no alterar las horas fuente.
- Entrega/devolución parcial a mitad de corte; varios movimientos el mismo día.
- Dos cortes consecutivos sin cobro duplicado del día de frontera.
- Febrero, año bisiesto, meses de 30/31 días y zona America/Bogota.
- Activo devuelto y entregado nuevamente; devolución posterior al corte.
- Saldo migrado sin remisión histórica y reconciliación con movimientos.
- Precio base conservado al aplicar descuento o escribir el precio efectivo;
  consistencia del porcentaje calculado con el valor ingresado y redondeos.
- Calendario por obra: domingos, sábados y festivos excluidos según acuerdo.
- Trabajo horario dominical/festivo con recargo configurado, sin inventar
  reportes ni cargos en días sin actividad confirmada.
- Reporte físico y digital del mismo trabajo sin doble cobro.
- Devolución el mismo día: un día en modalidad diaria; mínimo horario diario de seis horas; excepción por avería con motivo y efecto auditables.
- Cambios de tarifa y suspensión según política acordada.
- Mínimo aplicado una sola vez por máquina/día al agregar reportes; nunca
  trasladar horas comerciales mínimas a tiempo laboral ni volver a multiplicar
  horas diarias por la duración completa del período.
- Horas reportadas faltantes/negativas, cantidad/tarifa ausente, fechas inválidas.
- Precisión decimal y conciliación entre suma de renglones e impuestos.
- Regeneración, doble solicitud, aprobación concurrente y período solapado.
- Cambio retroactivo después de aprobar y preservación de auditoría.
- Acceso entre empresas, separación cliente–obra y permisos de aprobación.

No se promete ausencia absoluta de errores. La salida a operación requiere
pruebas, conciliación con casos reales y aprobación de reglas comerciales.

## Avance técnico: motor y borradores

Implementado en `apps/api/src/annexes`: motor puro con Decimal, validación
estricta, devoluciones parciales por lote, mínimo por máquina/día, calendario,
descuentos, excepciones y referencias de origen. El cálculo no infiere horas
laborales del operario ni cobra sus extras todavía: emite LABOR_PENDING.

API de vista previa y guardado de revisiones con fecha de datos separada del
fin del período. El servidor recalcula importes; guarda entrada y resultado,
autor y motivo, impide solapamientos por obra y rechaza versiones obsoletas.
Existe migración para las tablas, pendiente de aplicación en base de ensayo y
producción. Las fuentes suministradas todavía se marcan UNVERIFIED: no se
presentan como conciliadas con inventario ni listas para cobro.

La política inicial de precisión redondea cada lote/máquina y día a dos decimales
con HALF_UP, y suma líneas; queda identificada en cada resultado. El núcleo es
configurable, pero el aislamiento entre empresas aún requiere cambios
transversales en autenticación y datos del software.

## Avance: conexión de inventario e interfaz

La preparación ya reconstruye entregas y devoluciones desde StockLedger,
separando propietarios y conservando referencias. Los casos ambiguos se
excluyen del cálculo preparado con incidencia visible; no se simula que el
subtotal sea definitivo. No se suman otra vez documentos ni snapshots.

La pantalla Anexos permite elegir cliente/obra, registrar reportes físicos con
operario, confirmar días sin trabajo, ajustar descuentos y exenciones y guardar
revisiones. Puede ampliar la fecha de datos conservando ajustes existentes;
si desaparecen líneas al reconstruir, detiene la actualización para conciliación.
El calendario y la política se conservan en el borrador; todavía no existe una
configuración comercial permanente de la obra ni integración de reporte digital.

La verificación de navegador usa respuestas simuladas y el motor real. Falta
aplicar/probar las migraciones en PostgreSQL de ensayo y conciliar con datos
reales de REV antes de habilitar aprobación o uso para cobro.

## Hoja editable del anexo

La interfaz usa `react-data-grid@7.0.0-beta.47`, MIT, compatible con React 19
actual del proyecto. No requiere suscripción, activación ni servicio externo.
La versión está fijada; conservar su aviso MIT al distribuir dependencias.

Se muestran tramos diarios consecutivos de igual cantidad/cobro y una fila por
máquina/día. Se pueden editar días cobrados del alquiler diario, descuento y
precio acordado, navegar con teclado, filtrar, ajustar columnas y pegar columnas desde Excel.
El pegado se valida completo antes de modificar el borrador; rechaza columnas
protegidas, cifras inválidas y ajustes contradictorios al mismo lote.
El ajuste de precio aplica a toda la entrega, aunque aparezca en varios tramos.
Los días se ajustan por tramo con flechas o escritura directa en modo edición:
enteros de 0 a 999; una celda vacía al confirmar equivale a 0. Se conservan las
fechas y movimientos de inventario. `dayAdjustments` guarda fechas del tramo,
cantidad original y días cobrados en la revisión JSON, sin migración adicional.
El motor conserva el redondeo por día, permite unidades adicionales en la última
fecha del tramo y mantiene los días nuevos del corte en cálculo automático.
Rechaza ajustes solapados, sobre exenciones, exclusiones o cantidades cambiadas;
la actualización de inventario se valida antes de sustituir el anexo actual.
Si un cambio de calendario invalida un ajuste, la vista permite restablecer los
días automáticos explícitamente. Los equipos por hora mantienen una fila por día
y su cobro se determina por los reportes y el mínimo horario.

Los totales se suman con céntimos enteros a partir del resultado del servidor.
Al editar se oculta el total anterior y se solicita una nueva vista previa;
se cancelan respuestas obsoletas. Recalcular no guarda: el usuario guarda una
revisión explícita. La hoja no calcula IVA ni sustituye la conciliación pendiente.

Validación: cuatro pruebas del adaptador de hoja, 56 pruebas de regresión de
API y recorrido Chrome con respuestas simuladas usando el motor real: reporte,
mínimo diario, edición con teclado, pegado de dos filas, protección de base,
búsqueda, precio acordado, ampliación del corte y cinco guardados. No equivale a
una prueba con PostgreSQL ni con documentos reales de producción.

## Ensayo sobre snapshot real (2026-09-28)

Se restauró un `pg_dump` consistente de Railway/production en PostgreSQL 18
local (`rev_annex_qa`, puerto 55439), sin modificar producción. Las dos
migraciones pendientes se aplicaron en la copia. El dump y el diagnóstico
completo permanecen fuera del repositorio, en un directorio local restringido.

El script `apps/api/scripts/annex-snapshot-qa.cjs` requiere `DATABASE_URL` con
host loopback y nombre de base que empiece por `rev_annex_qa`, además de
`ANNEX_QA_OUTPUT` absoluto. Usa los servicios compilados (`npm --workspace
apps/api run build`). Parámetros opcionales: `ANNEX_QA_FROM`, `ANNEX_QA_TO`,
`ANNEX_QA_THROUGH`. Escribe revisiones únicamente en la copia de ensayo.

Contrasta las cantidades diarias con una suma independiente de movimientos,
los importes por línea y los totales; guarda y reabre cada anexo calculable.
Prueba dos guardados concurrentes y rechaza períodos solapados. No acredita
que los movimientos originales estén completos ni que las tarifas sean correctas.

Resultados iniciales: 42 anexos del 1–15 y 39 del 16–30 (datos hasta el 27),
81 reaperturas correctas, 2.529 comprobaciones de cantidades y 2.325 de
importes. Sin errores de ejecución. En el corte actual: 112 referencias sin
tarifa (313 incidencias por obra/referencia), 51 incidencias de inventario,
68 obras con cortes comerciales pendientes y 61 días horarios pendientes.
También hay cuatro registros digitales de horas reportadas aún no integrados.
Estos anexos son parciales y requieren conciliación antes de usarlos para cobro.

`apps/api/scripts/annex-snapshot-local.cjs` sirve solo los endpoints necesarios
para revisar anexos, clientes, obras y operarios desde localhost:4199. Usa los
servicios reales sobre la copia y un autor local de pruebas sin acceso de login.
No carga AppModule, cron jobs, correos ni WhatsApp. No sustituye una prueba de
autenticación del API completo. La web local en localhost:3197 conserva su UI.

### Tarifas cero (2026-09-29)

Por decisión de negocio, el generador conserva equipos con precio cero y asume
cero cuando el catálogo no tiene tarifa. No modifica el precio del catálogo.
Los días, cantidades y reportes permanecen en el anexo; el importe de esas
líneas es cero. La derivación de descuentos evita dividir entre cero. Las
referencias sin tarifa ya no se excluyen ni generan PRICE_MISSING; siguen
rechazándose precios negativos. Los resultados del ensayo anterior documentan
el comportamiento previo a este cambio. Los anexos guardados no se reescriben
automáticamente: se pueden actualizar desde inventario y guardar otra revisión.
Validado con IKARO: ocho referencias incluidas y total de alquiler cero.
