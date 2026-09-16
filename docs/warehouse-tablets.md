# Perfiles de tablet de bodega

La cuenta compartida usa el rol `WAREHOUSE_TABLET` y tiene una bodega propia activa asignada. La bodega pertenece al perfil de acceso; no se registra ni vincula un dispositivo físico.

## Activación

1. Desplegar API y frontend compatibles y aplicar la migración `20260911120000_warehouse_tablet_employee_pin` antes de iniciar la API nueva.
2. Como administrador, entrar en **Configuración → Tablets de bodega** (`/settings/warehouse-tablets`).
3. Crear el perfil compartido con usuario, contraseña y bodega.
4. Asignar un PIN de cuatro dígitos a cada empleado habilitado. Se admiten ceros iniciales. Los PIN son únicos en esta instancia de la empresa.
5. Iniciar sesión en la tablet con la cuenta compartida. Al crear una remisión o devolución, ingresar el PIN personal.

## Identificación y permisos

- El servidor exige identificación al crear, autoguardar y enviar una solicitud desde este rol. La cuenta de tablet no puede aprobarla.
- Una autorización vale dos horas y queda vinculada a un único documento. El token solo vive en la memoria del formulario; al recargar se solicita otro PIN.
- En **Documentos de bodega**, los formularios en preparación se pueden continuar con el PIN del mismo empleado que los inició. **Validar PIN de nuevo** renueva el acceso a un borrador conservando lo guardado.
- Al salir o comenzar otro documento se pide de nuevo el PIN. El envío desde tablet requiere conexión.
- Se guardan la cuenta creadora, el empleado identificado y una copia de su nombre. La lista, la vista imprimible y el PDF muestran quién lo elaboró.
- El backend comprueba la bodega y el estado activo del perfil y del empleado. Cambiar o deshabilitar un PIN invalida sus autorizaciones abiertas.
- Los intentos se limitan en PostgreSQL a cinco por perfil en una ventana de diez minutos, con bloqueo de fila para solicitudes concurrentes. Un PIN correcto reinicia el contador.
- Los PIN se almacenan en una tabla separada con bcrypt. La búsqueda única usa HMAC con `JWT_SECRET`; no se exponen PIN ni hashes en los catálogos de empleados. Si se cambia ese secreto, deben reasignarse los PIN.

## Verificación local

Pruebas de backend: `npm --workspace apps/api test -- --runInBand tablet documents-autosave documents-access document-pdf-snapshot`.

Se probó la migración sobre el esquema anterior en un PostgreSQL temporal y se verificó ausencia de diferencias con el nuevo esquema. La integración con la API verificó cuenta, contraseña con mayúsculas y minúsculas, PIN, límite de intentos, bodega, autoría, rechazo de reutilización, renovación y permisos. El envío por el servicio se probó sustituyendo únicamente el almacenamiento del PDF; no se enviaron mensajes ni archivos a servicios externos.
