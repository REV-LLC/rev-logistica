# Mínimos de alquiler indicados por REV

Recibidos el 30 de septiembre de 2026. Implementados en la versión local de anexos; sin cambios en producción.

## Valores generales por familia

| Familia | Unidad | Mínimo |
| --- | --- | ---: |
| ANDAMIO CERTIFICADO | Días | 10 |
| ANDAMIO CONVENCIONAL | Días | 10 |
| ANDAMIO COLGANTE | Días | 10 |
| ENCOFRADO | Días | 15 |
| FORMALETA | Días | 15 |
| PIEZAS CAMARA TIPO B | Días | 6 |
| ESCALERA | Días | 3 |
| CONTENEDOR | Días | 30 |
| COMPRESOR | Horas por día reportado | 6 |
| MINI CARGADOR | Horas por día reportado | 6 |
| RETRO EXCAVADORA | Horas por día reportado | 6 |
| EXCAVADORA | Horas por día reportado | 6 |
| VIBROCOMPACTADOR | Horas por día reportado | 6 |
| RANA VIBROCOMPACTADORA | Días | 3 |
| SALTARIN | Días | 3 |
| MEZCLADORA | Días | 3 |
| MOTOR PARA MEZCLADORA | Días | 3 |
| VIBRADOR DE CONCRETO | Días | 3 |
| CORTADORA DE CONCRETO | Sin disco: días / con disco: metros | 3 / 40 |
| DEMOLEDOR | Días | 3 |
| ROTOMARTILLO | Días | 3 |
| MARTILLO HIDRAULICO | Horas por día reportado | 3 |
| MARTILLO NEUMATICO | Horas por día reportado | 6 |
| PULIDORA | Días | 3 |
| SIERRA CIRCULAR | Días | 3 |
| TRONZADORA | Días | 3 |
| DIFERENCIAL | Días | 3 |
| PLUMA GRUA | Días | 3 |
| MOTOBOMBA | Días | 3 |
| HIDROLAVADORA | Días | 3 |
| MOTOSOLDADOR | Días | 3 |
| PLANTA ELECTRICA | Días | 3 |
| TABLERO ELECTRICO | Días | 3 |
| TORRE DE ILUMINACION | Días | 2 |

Las familias no incluidas no reciben un mínimo inventado. El valor de 3 horas
corresponde a MARTILLO HIDRAULICO; no se extiende automáticamente a otras
familias de implementos con nombres parecidos.

## Configuración e historial

El ajuste explícito en el anexo actual prevalece. Para sugerir el mínimo se
consulta la quincena anterior del mismo equipo y obra; si no existe, se usa la
configuración de la obra y después el valor general del equipo. Los valores
por familia anteriores sirven como base general indicada por REV. Esta
prioridad no implica promediar numéricamente los mínimos de varios anexos.

Conservar las fechas físicas y permitir la configuración desde la tuerca.
Los precios cero o ausentes se mantienen como cero y no excluyen equipos.
Los cambios a modalidades horarias requieren revisar la unidad de la tarifa
existente: una tarifa diaria no se convierte automáticamente en tarifa horaria.

## Aplicación del mínimo

El mínimo de días se aplica una vez por alquiler, por cada unidad entregada.
Se cobran los días transcurridos y se completa el faltante al devolver cada
cantidad. Entrega el 15 y devolución el 16 con mínimo 10: primer corte 1 día,
segundo corte 1 día real + 8 de ajuste = 10 total. Si una parte vuelve antes,
solo esa cantidad recibe el ajuste; las unidades que siguen en obra continúan
acumulando días. No se modifican las fechas de entrega/devolución.

Los ajustes manuales de días se cuentan al calcular lo ya cubierto por el
mínimo. Para eximir el mínimo se configura 0. La línea de complemento no se
edita como días físicos: se cambia el mínimo desde la tuerca.

La cortadora tiene modalidades alternativas por alquiler:
- Sin disco: tarifa diaria, mínimo general 3 días.
- Con disco: tarifa propia por metro, mínimo 40 metros por alquiler.
  Se registran fecha, metros y número de cada reporte físico o digital.
  Se cobran los metros reportados y se completa el faltante al devolverla.
  Los reportes anteriores se conservan entre cortes. No se suman días y metros.
  La modalidad no cambia desde la interfaz si ya hay días cobrados o reportes
  en un corte anterior. Por metros se identifica una cortadora por alquiler.

## Persistencia y conciliación

Los mínimos por referencia y activo se guardan con cada revisión del anexo.
La casilla de obra guarda el valor como configuración comercial de la obra
al guardar el anexo, en la misma transacción y con su revisión de respaldo.
Se usa AppSetting con clave annex-minimums:worksite:<id>.
La quincena anterior prevalece sobre esa configuración, incluso si su mínimo
es 0. Los anexos ya guardados no se recalculan ni migran automáticamente.
Para incorporar reglas nuevas a una consulta anterior se actualizan los
registros y se revisa el resultado antes de guardar.

La tabla de 34 familias se carga como datos iniciales de perfiles comerciales
editables por IDs. El motor y el generador no consultan nombres de familias.
Véase docs/12-commercial-profiles-contract.md para la integración genérica. Las tarifas se mantienen
separadas por modalidad. Una referencia catalogada por días en una familia
ahora acordada por horas conserva su unidad actual y produce una incidencia
CHARGE_UNIT_REVIEW; requiere corregir su unidad y tarifa en el catálogo.
No se reinterpreta un precio diario como precio horario.

El cálculo acredita los días ordinarios de resultados previamente guardados,
sin sumar complementos de mínimos de otras devoluciones. Si faltan cortes,
el adaptador reconstruye días desde el inventario y señala
MINIMUM_HISTORY_RECONSTRUCTED para conciliar acuerdos/cobros anteriores.
Esta reconstrucción no certifica exclusiones o ajustes manuales externos.
Si una entrada directa al motor no incluye días previos de un alquiler que
cruza el corte, señala MINIMUM_HISTORY_PENDING y no inventa un complemento.

## Verificación local

Pruebas de motor: cruce de quincenas, devoluciones parciales, devolución en
el mismo día, mínimos 0, precios 0, exclusiones, ajustes manuales, y cortadora
con reportes en dos cortes sin duplicar el mínimo de 40 metros.
Pruebas de tabla: complemento separado, edición protegida y tarifa por metro
independiente de la diaria.
Prueba transaccional sobre copia local: familia 10 → obra 7 → corte anterior 8;
el guardado conserva el ajuste de obra y se revierte toda la prueba.
Chrome local: IKARO muestra ocho referencias con mínimo 10; se edita desde la
tuerca. La cortadora con 12 metros reportados y devolución completa 40 metros.
