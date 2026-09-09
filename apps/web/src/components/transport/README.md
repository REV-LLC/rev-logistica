# Flujo de solicitudes de transporte

Separación realizada de nuevo sobre `origin/dev` en `b01d0b7`, en la rama
`codex/transport-modules-from-dev`. La rama anterior de refactorización no se
fusionó ni se usó como fuente de los módulos.

## Responsabilidades

| Área | Implementación |
| --- | --- |
| Coordinación del formulario, restauración y transiciones | `TransportRequestsWorkspace.tsx` |
| Información, ítems y firma/envío | `RequestInformationSection`, `RequestItemsSection`, `RequestSigningSection` |
| Listado con la tabla reutilizable de dev | `RequestsListSection`, `use-requests-list` |
| Catálogos y bodegas | `use-request-catalogs` |
| Inventario disponible y apertura del selector | `use-request-inventory` |
| Implementos compatibles y motor de mezcladora | `use-request-asset-selection` |
| Agregar, resolver, dividir y retirar ítems | `use-request-item-editing` |
| Aprobación, resolución de pendientes y recuperaciones | `use-request-approval` y diálogos `Approval*` |
| Evidencias y remisiones físicas | `use-request-files`, `ProviderRemissionDialog` |
| Firma de recibido | `use-request-signature`, `RequestSignatureDialog` |
| Destinatarios WhatsApp | `use-request-recipients` |
| Autoguardado y payload del borrador | `use-request-autosave` |
| Validación y envío online/offline | `use-request-submission` |
| Tipos, notas, errores, caché y URL | `request-types`, `request-formatting`, `request-errors`, `request-cache`, `request-navigation` |

Los hooks conservan las decisiones y los efectos de la versión de origen.
El workspace mantiene los estados compartidos entre áreas y conecta sus
callbacks. No hay una segunda copia del formulario completo dentro de un hook.

## Comportamientos de dev que deben conservarse

- Office/Admin puede cargar inventario de una bodega alterna. Driver conserva
  la captura libre para ese origen.
- El modal compartido `AssetComponentsSelectionModal` recibe `canCreate`,
  `excludedAssetIds` y `onAssetCreated`. Su implementación nueva de dev permanece
  intacta, incluidos los grupos exclusivos y la creación contextual.
- La devolución consulta saldo de obra y respeta la presentación de propietarios
  que entrega el backend.
- Los implementos serializados conservan `componentParentAssetId` y
  `ownerWarehouseId` en selección, autoguardado y envío.
- La aprobación consulta las remisiones físicas pendientes antes de ejecutar
  el movimiento.
- Se mantienen la tabla reutilizable, las rutas y los contratos API de dev.

## Verificación

Desde la raíz del repositorio:

```sh
npm --workspace apps/web test
npm --workspace apps/web run build
```

La suite mantiene las tres pruebas de payload que ya estaban en dev y añade
diez regresiones con React DOM y JSDOM. Ejecuta efectos y actualizaciones de
estado reales; sustituye las llamadas API y la cola offline por límites de
prueba controlados. `test-support.cjs` transpila los módulos con el TypeScript
del proyecto, sin generar archivos de build ni cambiar el runtime de la app.

Estas pruebas cubren selección por rol/origen, vínculo de implementos,
autoguardado, envío online/offline, firma al editar, daño en devoluciones y
aprobación con documentos físicos pendientes. No sustituyen los recorridos en
un navegador contra la base local, ni validan autenticación, R2 o entregas reales
de mensajes. La refactorización no certifica como corregidos defectos que ya
existieran en dev.
