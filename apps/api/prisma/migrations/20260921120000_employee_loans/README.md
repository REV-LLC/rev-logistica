# Préstamos de empleados — carga inicial

Fuente: `prestamos empleados.pdf`, página 1, entregado por el usuario.
SHA-256: `9df832132f1ce752d978fff3eda4c6cbee56eef705ea2479245b67983db705e6`.

Se importan 129 registros: 9 saldos iniciales y 120 movimientos. Los importes se
almacenan como decimales positivos; PAYMENT resta, CHARGE y OPENING suman.
Las filas repetidas del documento se conservan como movimientos distintos.

| Tarjeta | Saldo verificado (COP) |
| --- | ---: |
| Hector Ramirez | 7.300.000 |
| Mauricio Garces | 2.298.300 |
| Fernando Martinez | 792.000 |
| Willinton Segura | 2.010.000 |
| Alexander Guevara | 310.000 |
| Mario Gomez | 5.526.400 |
| Robinson Segura | 1.181.500 |
| Cristian Parra | 250.000 |
| Paola Joaqui | 300.000 |
| Total | 19.968.200 |

El cargo de $200.000 de Alexander no tiene fecha ni concepto. El cargo MOTO de
$3.750.000 de Mario no tiene fecha. Por indicación del usuario, se guardan las
fechas como NULL y el concepto faltante como «Sin concepto registrado».

Cada registro conserva la tarjeta de origen y su número de fila en
sourceReference/sourceRow; la fila 0 es el saldo inicial. createdById es NULL
para esta carga histórica, sin atribuirla a un usuario. Los movimientos nuevos
registrados por la API siguen requiriendo fecha y autor.

La migración crea la tabla y carga el histórico en una sola transacción.
Relaciona las tarjetas con nombres completos verificados en el directorio de
empleados, normalizando mayúsculas, espacios y tildes. No crea empleados. Si
falta alguno o hay nombres ambiguos, aborta toda la transacción. En una base
vacía también abortará: el directorio de empleados debe existir antes de esta
carga. No se debe omitir silenciosamente ninguna tarjeta.

Verificación: ejecución en PostgreSQL temporal (PGlite), comparación de cada
fila con la transcripción del PDF, conciliación de los nueve saldos, y reversión
completa ante empleado faltante o ambiguo. La migración contiene verificaciones
de cantidad de registros y saldos que se ejecutan también al aplicarla.
