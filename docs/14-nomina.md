# Nómina básica de REV

Primera versión autorizada para REV, independiente de la futura transformación de Finge. Solo ADMIN y OFFICE activos acceden. El salario pertenece al empleado; una cuenta User vinculada no crea un segundo salario. Las APIs generales de empleados y usuarios no incluyen valores salariales.

## Alcance

Salario mensual de jornada completa, auxilio legal de transporte configurable, quincenas 1-15 y 16-fin de mes, días nominales editables entre 1 y 15, salud 4%, pensión 4%, previsualización y comprobante PDF. Ambas quincenas usan 15 días nominales y divisor mensual 30, incluso febrero o meses de 31 días. Modificar días requiere observación. No se infieren novedades laborales de remisiones, tiempos comerciales o anexos.

No incluye prestaciones, aportes patronales, PILA, dispersión de dinero, pago registrado, retención en la fuente, fondo de solidaridad pensional, extras, incapacidades, licencias, liquidación de retiro ni regímenes especiales. Los casos que necesiten estos conceptos requieren revisión antes de emitir. Este comprobante no sustituye documentos de nómina electrónica DIAN.

## Configuración provisional e historial

La migración nueva crea salario base 1.750.905 y auxilio 249.095, total mensual 2.000.000, PROVISIONALES para cada empleado existente, desde 2026-10-01. Es configuración inicial autorizada, no evidencia de salario efectivamente pactado ni nómina histórica. Office debe confirmar monto, auxilio y régimen mediante una nueva revisión salarial antes de emitir. Un empleado nuevo recibe el mismo estado provisional durante las fechas 2026 verificadas; otros años quedan pendientes de configuración, sin extrapolar importes.

Cada cambio conserva vigencia, revisión, motivo, autor y fecha. La revisión esperada y bloqueo de fila impiden sobrescribir modificaciones simultáneas. No se permite una nueva vigencia que atraviese períodos ya emitidos. La migración aplica sobre el historial existente de REV: no utiliza la migración inicial de Finge ni reintegra la migración salarial antigua retirada.

Un salario confirmado se aplica al inicio de la quincena. Si hay una vigencia dentro de ella, la emisión se bloquea: falta cálculo por tramos. Se bloquean salarios provisionales, empleado inactivo, cédula faltante, régimen REVIEW_REQUIRED, salario inferior al mínimo, salarios desde 4 SMMLV y auxilio positivo por encima de 2 SMMLV o superior a la referencia legal. Confirmar STANDARD significa que Office ha revisado que corresponde al régimen general contemplado; los importes no prueban elegibilidad por sí solos.

## Cálculo y redondeo

Se usa Decimal, sin aritmética binaria de punto flotante. Cada concepto se redondea al peso con HALF_UP; el total suma los conceptos que se muestran. Salud y pensión se calculan separadamente sobre el salario devengado, excluyendo auxilio; se redondean al peso. El neto es total devengado menos la suma de deducciones.

Ejemplo autorizado de 15 días:

| Concepto | COP |
| --- | ---: |
| Salario mensual | 1.750.905 |
| Auxilio mensual | 249.095 |
| Salario devengado | 875.453 |
| Auxilio devengado | 124.548 |
| Total devengado | 1.000.001 |
| Salud | 35.018 |
| Pensión | 35.018 |
| Neto | 929.965 |

El peso de diferencia frente a redondear el total bruto antes de sus componentes es resultado explícito de redondear cada concepto. No se copian deducciones 35.050 ni totales inconsistentes de la imagen de referencia. No se implementa todavía conciliación de redondeos entre quincenas.

## Comprobantes

Emitir guarda una instantánea inmutable con empleado, cédula, empresa, período, salario y revisión utilizados, importes, reglas, observaciones y autor. No recalcula históricos al descargar PDF. Restricciones únicas por empleado/período y por clave de idempotencia evitan duplicados. Un reintento con la misma clave y datos devuelve el original; cambiar datos con esa clave produce conflicto.

La base impide UPDATE/DELETE de salarios y comprobantes mediante triggers. Los empleados con historia salarial se desactivan, no se borran. No hay endpoint de corrección/reemisión: debe diseñarse un flujo explícito que preserve el documento original antes de habilitarlo.

El PDF usa identidad legal de REV ya presente en sus documentos y espacios de firma vacíos. Emitir no firma ni registra pago. En QA se utilizan personas sintéticas. Todas las respuestas del módulo tienen Cache-Control private,no-store; se comprueba también que el usuario permanezca activo y ADMIN/OFFICE en BD, aunque su JWT conserve un rol anterior.

## API

- GET /employee-payroll?date=YYYY-MM-DD: configuración e historial por empleado.
- GET /employee-payroll/period?from=YYYY-MM-DD&to=YYYY-MM-DD: empleados, previsualización nominal y recibos existentes.
- POST /employee-payroll/:employeeId/salaries: effectiveFrom, monthlySalary, transportAllowance, note, expectedRevision y regime opcional (STANDARD o REVIEW_REQUIRED). Los montos son strings con máximo dos decimales.
- POST /employee-payroll/:employeeId/preview: from, to, days y observations opcional, obligatorio si days != 15.
- POST /employee-payroll/:employeeId/receipts: mismo cuerpo, expectedSalaryRevision y UUID v4 idempotencyKey.
- GET /employee-payroll/:employeeId/receipts?from&to: históricos, hasta 100; ambas fechas son opcionales pero deben enviarse juntas.
- GET /employee-payroll/receipts/:receiptId/pdf: PDF autenticado del snapshot.

## Fuentes oficiales consultadas 2026-10-01

- [Decreto 159 de 2026, salario mínimo](https://www.cancilleria.gov.co/normograma/compilacion/docs/decreto_0159_2026.htm).
- [Decreto 1470 de 2025, auxilio 2026 y límite de 2 SMMLV](https://www.cancilleria.gov.co/normograma/compilacion/docs/decreto_1470_2025.htm).
- [Ministerio de Salud, régimen contributivo](https://www.minsalud.gov.co/Proteccion-Social/Regimencontributivo/Paginas/regimen-contributivo.aspx).
- [Ley 797 de 2003, participación del trabajador en pensión y aportes adicionales](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?emergente=1&i=7223).
- [Acuerdo UGPP 1035 de 2015, auxilio legal fuera de base de cotización](https://normativa.colpensiones.gov.co/colpens/docs/acuerdo_ugpp_1035_2015.htm).

Política limitada a 2026. Antes de habilitar otro año, verificar normativa y versionar reglas. No extrapolar automáticamente.

## Verificación y entorno local

Implementación coordinada entre «Estabilizar flujos logísticos» (frontend,
integración y QA) y «Crear módulo de nomina» (backend, esquema y PDF), sin Finge,
push, despliegue ni modificación de producción.

Se restauró otra copia del snapshot productivo del 30/sep/2026 19:50 Bogotá:
`equipment_payroll_qa_20261001`, PostgreSQL local 54414. Las seis migraciones
pendientes se aplicaron correctamente: cinco de conjuntos/anexos y una nueva de
nómina (147 totales). Los 12 grupos de registros originales y los 16 empleados
conservan sus datos; las nuevas relaciones salariales provisionales son las
únicas asignaciones iniciales autorizadas.

- Build API y web correctos. API: 1.070 pruebas aprobadas / 51 omitidas por la suite existente; web: 169 aprobadas, sin omisiones.
- `qa-payroll-http-flow.cjs`: seis grupos HTTP reales con JWT, ausencia de exposición salarial en empleados compartidos, 401/403, confirmación provisional, revisión obsoleta 409, días editables con motivo, cálculo exacto, emisión concurrente idempotente y período único, historial/PDF congelado y token Office desactivado rechazado.
- PostgreSQL real: UPDATE/DELETE de salario y comprobante rechazados por los triggers; transacción de prueba revertida.
- Chrome aislado con Playwright disponible (sin CLI agent-browser ni Browser plugin listado): 1510×1000 y 390×844; ingreso real, empleado con User vinculado, foto sintética subida y miniatura WEBP, confirmar salario, liquidar ocho días, emitir/descargar PDF, tabla con los ocho días emitidos, PDF histórico y descarga móvil. Sin overlay ni errores de ejecución; ancho móvil 390/scroll 390.
- Fotos productivas no se copiaron al almacenamiento QA: 404 esperado con iniciales de respaldo. El simulador antes devolvía 500 para archivos ausentes y se corrigió a `NoSuchKey`/404. El script de Vercel Analytics no existe en localhost y su 404 se registra como limitación local, no como error de nómina.
- PDFs con observaciones cortas y de unos 1.000 caracteres renderizados e inspeccionados; formato de una página sin solapamientos. No equivale a probar cualquier longitud de nombre o régimen salarial.
- Regresión PostgreSQL con rollback: perfiles comerciales, aprobación de conjuntos y empalmes antiguos/anexos volvieron a pasar con nómina integrada.

Prueba del usuario: `http://127.0.0.1:3159/employees/payroll`, API local 3059.
Office exclusivo QA: `qa-config-office@example.invalid`, clave
`Only-local-QA-20260923!`. Reinicio API desde `apps/api`:
`QA_PAYROLL=1 node scripts/run-equipment-commercial-qa.cjs`; web desde `apps/web`:
`npm run start -- --hostname 127.0.0.1 --port 3159` (build con API pública local).
Los empleados de prueba empiezan por `QA NOMINA`; no trasladarlos a producción.

Antes de publicar: validar con el usuario salarios/auxilios reales y el alcance
del comprobante. Extras en anexos, rectificación de comprobantes emitidos,
registro de pagos y conciliación mensual de redondeos siguen fuera de esta
primera versión. No considerar estas pruebas garantía de ausencia total de fallos.
