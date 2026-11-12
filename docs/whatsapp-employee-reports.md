# Reportes de empleados por WhatsApp

## Alcance

El mismo número de WhatsApp Cloud API recibe mensajes individuales de empleados. El empleado puede escribir de forma natural, adjuntar fotos, completar la información y responder **SÍ** al resumen. **CANCELAR** descarta el borrador. No necesita una cuenta de usuario del software: sí un registro de empleado activo con teléfono único y normalizable. Se admiten texto, imagen, ubicación nativa y respuestas interactivas. Audio, video y documentos reciben una explicación; no se registran como reportes.

1. **Daños de equipos y vehículos.** Código de equipo o placa y descripción obligatorios; hasta seis fotos opcionales. Un daño de equipo actualiza su condición e historial. Los vehículos conservan el daño como reporte y alerta; su modelo actual no dispone de un estado de avería equivalente al de los equipos.
2. **Horómetros.** Equipo por horas o vehículo, valor no negativo y foto obligatoria. La IA propone la lectura de la foto; la confirmación del empleado es obligatoria. Una discrepancia entre foto y valor escrito exige corregirla. Una foto sin lectura clara puede acompañar un valor escrito y confirmado. Nunca se permite disminuir el último horómetro. El registro queda en las lecturas existentes y en Reportes WhatsApp, con la evidencia vinculada.
3. **Peticiones generales.** Descripción y confirmación. Crea un reporte y una alerta para usuarios ADMIN/OFFICE activos, empleados MANAGER/OPERATIONS_MANAGER/OFFICE activos, Héctor Ramírez y destinatarios adicionales configurados. Los empleados sin usuario también reciben alerta por WhatsApp si tienen teléfono; los usuarios vinculados disponen de la alerta dentro del software. El estado de cada envío se consulta en el reporte; un contacto sin teléfono figura como `NO_PHONE`.
4. **Entrada/salida de obra.** Obra activa identificada sin ambigüedad y ubicación **o** foto por movimiento: una sola alternativa es suficiente. Si se envía la otra opción, reemplaza a la anterior y exige una nueva confirmación. Se guarda la hora del primer mensaje de ese flujo, suministrada por Meta, y la hora de recepción del mensaje por separado. No se aceptan horas arbitrarias generadas por IA o escritas por el empleado. La entrada crea una jornada abierta vinculada al reporte. La salida exige una entrada anterior abierta en la misma obra y cierra la jornada. Solo puede existir una jornada abierta por empleado. Las fotos adjuntas no verifican identidad, ubicación ni presencia real. El intervalo entrada/salida es tiempo reportado, sin deducir descansos ni calcular nómina.

## Saludo y opciones táctiles

Al escribir «Hola», «Buenos días», «MENÚ» o «Ayuda», el empleado recibe un saludo por el nombre registrado en su ficha y el botón nativo **Ver opciones**. Este abre una lista con cuatro filas: daño, horómetro, petición y entrada/salida. No se envían saludos a teléfonos desconocidos o ambiguos.

La elección se procesa por el identificador de la fila, sin depender del título mostrado ni hacer una consulta de IA. Entrada/salida muestra dos botones. Cuando el resumen cabe en el límite de Meta, se ofrecen **Sí, registrar** y **Cancelar**; los resúmenes largos conservan el texto completo y la confirmación escrita. Los botones de confirmación están vinculados al resumen actual: un botón de un resumen antiguo no confirma otro reporte.

Un saludo o MENÚ conserva el borrador pendiente. Elegir otro flujo inicia un nuevo borrador; CANCELAR lo descarta. También se mantiene la posibilidad de escribir el reporte directamente y adjuntar fotos.

## Consulta en el software

**Operación → Reportes WhatsApp** (`/employees/whatsapp-reports`), accesible por ADMIN/OFFICE:

- Reportes, filtro por tipo, paginación y detalle con fotos descargadas mediante la API autenticada o ubicación compartida con coordenadas, hora de recepción y enlace al mapa.
- Jornadas de asistencia: últimas 100, obra, entrada, salida y duración transcurrida.
- Mensajes por revisar: últimos 50 fallidos, rechazados o sin respuesta después de cinco intentos.
- Destinatarios y estado de las alertas de cada reporte.
- Resolución de peticiones o daños: conserva el historial y desactiva la alerta. Resolver una alerta de daño no registra una reparación ni habilita el equipo; la reparación se realiza en su ficha.

API protegida: `GET /whatsapp-reports?kind=...&cursor=UUID`, `GET /whatsapp-reports/attendance`, `GET /whatsapp-reports/inbox`, `GET /whatsapp-reports/health`, `PATCH /whatsapp-reports/:id/resolve` con `{ "resolution": "..." }`.

## Preparación y activación

La implementación queda desactivada por defecto. La clave de Office no se reutiliza. No se modifica automáticamente la cuenta de Meta ni se despliega a producción.

1. Aplicar la migración `20261111120000_whatsapp_employee_reports` mediante el procedimiento habitual de despliegue (`prisma migrate deploy`), antes de activar el canal.
2. Configurar `WHATSAPP_OPENAI_API_KEY` con la clave exclusiva elegida mediante el flujo seguro de OpenAI. `WHATSAPP_ASSISTANT_MODEL` usa por defecto `gpt-5.4-mini`, siguiendo la convención del asistente Office del proyecto. El modelo configurado debe admitir imágenes y salidas estructuradas en Responses.
3. Configurar las credenciales existentes `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_API_VERSION`, `META_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`. Suscribir el campo `messages` a la URL pública HTTPS existente `/webhooks/whatsapp`; conservar la verificación de firma y los eventos de estado de entrega.
4. Configurar R2 como en el módulo de archivos: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL`. Las fotos ingresadas se validan, se decodifican, se orientan y se guardan como JPEG sin EXIF usando el almacenamiento existente.
5. Configurar `WHATSAPP_REPORT_ACTOR_USER_ID`: UUID de un usuario ADMIN/OFFICE activo para los campos de auditoría que requieren usuario cuando el empleado no tiene cuenta. El reporte conserva siempre al empleado real como autor. Si el empleado tiene usuario activo se utiliza ese usuario.
6. Revisar números activos y únicos de los empleados (se normalizan celulares colombianos de diez dígitos a prefijo 57; otros números requieren código de país). Duplicados o números desconocidos se rechazan sin enviarles datos del sistema. Para empleados con usuario desactivado se rechaza el ingreso.
7. Verificar los registros de los gerentes, Office y Héctor Ramírez. Se identifica a Héctor por los dos nombres sin diferencias por acento; si existe ambigüedad o el registro usa otro nombre, utilizar `WHATSAPP_ALERT_RECIPIENT_EMPLOYEE_IDS` o `WHATSAPP_ALERT_RECIPIENT_USER_IDS`. Los contactos sin teléfono quedan visibles para corrección y no pueden recibir WhatsApp.
8. Mantener la plantilla de notificaciones existente configurada y aprobada en Meta para alertas iniciadas por la empresa. Las respuestas al empleado usan mensajes de texto dentro de su ventana de atención, limitada por este canal a 23 horas para dejar margen. Configurar `APP_BASE_URL` o `FRONTEND_URL` para los enlaces.
9. Activar `WHATSAPP_REPORTS_ENABLED=true`. Reiniciar la API cuando se cambien credenciales. Probar cada flujo desde un teléfono autorizado, comprobar sus fotos, lecturas, jornadas, alertas y las confirmaciones reales de Meta antes de ampliar su uso.

## Fiabilidad y límites

- Al elegir daño u horómetro se ofrece una lista táctil de máquinas con nombre, número y marca/modelo o descripción. Horómetro filtra activos no eliminados cuyo SKU cobra por hora; también conserva el soporte existente de vehículos activos. Las listas tienen hasta ocho equipos por página y botones para avanzar/retroceder, sin exigir escribir códigos o placas.
- Cada número conserva la última máquina de un reporte **confirmado**, fuera del borrador de 30 minutos. El siguiente reporte propone «Usar esta máquina» / «Elegir otra», sin asignar el equipo automáticamente. Cancelar o abrir otra lista no cambia la memoria. Al reasignar el número a otro empleado no se reutiliza la memoria anterior. Se verifica otra vez que el equipo siga activo y sea apto para el flujo.
- Las opciones y sus identificadores se guardan con la respuesta para reintentar exactamente la misma lista. Cada lista está vinculada al borrador vigente con un identificador aleatorio; botones viejos o ajenos no seleccionan equipos. Cambiar de máquina descarta la lectura y las fotos del equipo anterior, y siempre se exige confirmar el resumen antes de registrar.

- Webhook firmado; solo acepta mensajes del `phone_number_id` configurado. Primero guarda la cola durable y responde; el modelo y las descargas se ejecutan fuera de la petición del webhook.
- La ID de Meta es única: los reintentos del webhook no duplican mensajes. Reporte, actualización del dominio, alerta, borrador y respuesta pendiente se confirman en una transacción.
- Borradores persistidos de 30 minutos, una conversación por teléfono, lease de procesamiento, recuperación tras reinicio y hasta cinco intentos con espera progresiva. La cola conserva el texto original y las IDs de las fotos. El reporte enlaza las IDs de los mensajes que lo formaron.
- Los bloqueos de filas serializan horómetros y asistencia, además de un índice parcial que impide dos entradas abiertas. La identificación de equipo y obra se vuelve a verificar al confirmar; la IA no elige IDs ni escribe SQL.
- Se procesan hasta 20 mensajes por minuto por teléfono antes de pedir una pausa. Máximo seis fotos por borrador; máximo 5 MB por foto de entrada. La descarga de fotos admite exclusivamente hosts HTTPS de Meta conocidos, sin redirecciones.
- El servidor usa exclusivamente la clave de IA del canal, desactiva el almacenamiento de respuestas de OpenAI (`store: false`) y no escribe prompts, fotos ni credenciales en logs.
- Las respuestas y alertas utilizan bandejas de salida persistidas. Un corte entre la aceptación de Meta y guardar el resultado podría repetir un mensaje saliente; los registros del software siguen siendo únicos.
- Las alertas pendientes dejan de enviarse al resolver el reporte. Las ya enviadas se conservan. Corregir un contacto sin teléfono o un envío agotado requiere intervención de oficina; la bandeja muestra el problema.
- Los empleados pueden reportar a los equipos/obras activos del catálogo, con confirmación del nombre seleccionado. No existe actualmente una asignación operario-equipo-obra utilizada para restringir este canal.

## Verificación

`npm --workspace apps/api run build`

`npm --workspace apps/api test -- --runInBand whatsapp-webhook whatsapp-reports files.service notifications`

Las pruebas PostgreSQL son opt-in: configurar `WHATSAPP_TEST_DATABASE_URL` a una base **desechable local** cuyo nombre empiece por `whatsapp_qa_`. El archivo `whatsapp-reports.integration.spec.ts` trunca únicamente esa base validada y usa Meta, almacenamiento remoto e IA simulados. Verifica los cuatro flujos completos desde webhook firmado hasta el dominio, evidencia y alertas, además de duplicados, autenticación por teléfono, lecturas decrecientes, salidas sin entrada, reintentos y concurrencia. Nunca apunta a `DATABASE_URL` por defecto.

La asistencia de WhatsApp se guarda en `WorksiteAttendance`, vinculada al reporte y a sus evidencias. No crea una actividad operativa `WORKSITE`: esas actividades requieren una máquina y conservan su validación independiente.

La ubicación se recibe únicamente desde el mensaje nativo firmado de WhatsApp y se conserva con latitud, longitud, ID del mensaje y horas de envío/recepción. Se valida su procedencia al confirmar; no se extrae de texto ni de IA. Cambiar de obra, cancelar o vencer el borrador exige nueva evidencia. La ubicación no sustituye la foto de horómetro.
