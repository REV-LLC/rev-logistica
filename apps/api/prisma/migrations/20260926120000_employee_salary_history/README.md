# Configuración salarial inicial REV

Aplicar con el flujo habitual `prisma migrate deploy`, antes de desplegar el API
que consulta EmployeeSalary. La migración no se ha ejecutado contra producción
como parte del desarrollo.

- Crea historial salarial y restricciones de integridad.
- Inicializa todos los empleados existentes a 1.750.905 COP desde 16/09/2026,
  por instrucción del usuario. No acredita pagos ni liquida salarios anteriores.
- Mantiene referencias para impedir borrar empleados con historial salarial;
  pueden desactivarse desde su ficha.
- No incluye auxilio de transporte en la base de recargos.
- Las tablas de referencia legal tienen vigencia limitada a 2026: requieren
  actualización explícita antes de liquidar/configurar el siguiente año.

Validación local: generación de Prisma Client, compilación API, TypeScript web
sin emisión y pruebas de política salarial/historial. La migración necesita
verificación en una base de ensayo antes de promoverla a producción.

Pendiente: reportes físicos/digitales, asignación de operario, clasificación de
horas reales, liquidación completa y traslado sin margen al anexo. El horario
REV de 41,5 horas está separado de la referencia legal general de 42 horas.
