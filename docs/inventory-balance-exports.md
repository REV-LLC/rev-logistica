# Exportación de saldos de inventario

## Uso

En **Exportar datos**, Admin y Office pueden elegir un reporte, filtrar y pulsar
**Vista previa** o **Exportar Excel**. La vista previa muestra hasta 12 registros;
el archivo contiene todos los resultados de la consulta, no solo esa vista previa.

También hay exportación directa en las acciones de cada obra del listado de Obras
y en el detalle de la obra, junto a la descarga PDF existente.

| Reporte | Alcance |
| --- | --- |
| Saldo general | Nuestras bodegas, obras y tránsito pendiente de entregar al proveedor. |
| Saldos en obra por cliente | Cliente, obra, referencia y propietario. |
| Saldos por cliente | Consolidado por cliente, con detalle de sus obras. |
| Saldos de proveedores | Inventario de proveedores en nuestra custodia, en obra o pendiente de entrega. No incluye su catálogo disponible en sus bodegas. |
| Saldos de bodega | Existencias físicas de las bodegas seleccionadas, propias o de proveedores. |

Son cantidades de inventario, no cuentas por cobrar/pagar. No hay filtro histórico
de fecha: la fecha de consulta identifica el saldo actual descargado.

## Archivo

- Hoja **Saldos**: consolidado según el reporte, preservando referencia/unidad y bodega propietaria.
- Hoja **Detalle por ubicación**: cliente, obra, alias, ubicación, propietario,
  referencia, identificación legible, tipo de control, condición de implemento y cantidad.
- Encabezados inmovilizados, filtros y cantidades numéricas. Los nombres procedentes
  de la base se escriben como texto, nunca como fórmulas de Excel.
- Se agrupa por identidades internas, no por nombres: clientes, obras, referencias o
  propietarios homónimos no se fusionan. Los UUID no se imprimen en el archivo.
- No se inventa un gran total sumando equipos y referencias de distinta naturaleza.

## Datos y permisos

- `GET /inventory/reports/options` y `GET /inventory/reports/balances`: Admin/Office,
  JWT obligatorio, validación estricta de UUID, tipos de reporte y filtros.
- La consulta usa una transacción PostgreSQL `REPEATABLE READ`, `READ ONLY`, sin
  leer ni poblar las cachés de inventario de la interfaz.
- Se reutilizan las proyecciones operativas existentes de bodega y obra. El
  parámetro de lectura transaccional es opcional: los consumidores anteriores no cambian.
- Las recepciones **confirmadas** restan del tránsito; los borradores no lo cierran.
- Los implementos históricos aún no convertidos se incluyen; los que tienen puente
  al nuevo Asset/SKU se excluyen para evitar duplicación. No se convierten ni vinculan registros.
- No se omiten obras o bodegas inactivas si mantienen saldo. Las reglas operativas
  existentes de visibilidad de referencias/equipos se conservan.
- Exportaciones demasiado grandes fallan con un mensaje para filtrar; no se recortan silenciosamente.
- Respaldos técnicos JSON/CSV e importación siguen protegidos exclusivamente para Admin
  en la API; Office no ve esa pestaña.

No requiere migración ni modifica documentos, existencias, movimientos, anexos,
tarifas o cobros. No se publica automáticamente por desarrollar esta función.

## Verificación

```sh
npm --workspace apps/api test -- --runInBand
npm --workspace apps/api run build
npm --workspace apps/web run test
npm --workspace apps/web run build
```

Las pruebas nuevas verifican filtros/roles, agrupaciones, propietarios distintos,
obras homónimas/inactivas, tránsito parcialmente recibido, implementos convertidos,
ausencia de resultados, cantidades numéricas, fórmulas inyectadas como texto y
reapertura del XLSX. Las descargas también deben probarse desde Exportar datos,
el listado de Obras y el detalle, en escritorio y móvil.
