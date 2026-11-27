# Documentos y respuestas de oficina en WhatsApp

## Documentos recibidos

El webhook firmado conserva referencia, nombre y descripción de documentos. Admin y office pueden descargarlos en Chats de clientes o en Mensajes por revisar de empleados. Los PDF se pueden abrir después de cargarlos. Se admiten PDF, Word, Excel, PowerPoint y texto de hasta 20 MB; se valida el formato, tamaño y destino Meta antes de servir el archivo por un endpoint autenticado. Los nombres se limpian y la extensión de descarga deriva del formato validado.

La descarga ocurre bajo demanda, sin copia a R2. No es un archivo permanente: si Meta retira un medio o el registro antiguo no conservó su referencia, se pide reenvío. El contenido del documento y su descripción no confirman pedidos, ni se interpretan como órdenes para el bot.

## Responder desde REV

Chats de clientes incluye un campo Mensaje para el cliente y el botón Enviar por WhatsApp, para admin y office. Esta versión envía texto; no envía archivos de oficina. El servidor comprueba el último mensaje entrante de ese número en el canal configurado y permite respuesta libre durante 24 horas. Fuera de esa ventana, el cliente debe escribir de nuevo; no se crean ni envían plantillas.

Enviar una respuesta pausa el bot, invalida su resumen pendiente y suprime respuestas automáticas pendientes. Bot y oficina comparten un bloqueo temporal por conversación, sin mantener una transacción SQL abierta durante la llamada a Meta. Oficina puede reanudar el bot desde el encabezado. Actualizar chat permite consultar mensajes y estados recientes.

Cada respuesta conserva usuario autor, nombre, texto, fecha, identificador interno de solicitud y estado. El identificador de solicitud evita reenviar al reintentar o pulsar dos veces. Un envío aceptado por Meta se muestra como Enviado a WhatsApp; entregado/leído requieren su notificación. Las notificaciones tardías no reducen un estado leído. Una respuesta rechazada se marca como fallida; una confirmación perdida o un resultado ambiguo nunca se reenvía automáticamente. La interfaz conserva la solicitud para comprobarla y muestra cuándo hay que verificar el envío antes de repetir el texto.

La migración agrega mediaFilename al registro entrante y una tabla independiente WhatsappOfficeMessage con índice por conversación/fecha, identificador de proveedor único y restricciones de estado/texto. No modifica reportes ni pedidos existentes. Se publica por el flujo de imagen verificada, limitado a producción de API principal y web; no cambia MiREV ni staging.

## Validación

Pruebas de permisos y límites de descarga; integración PostgreSQL local con la migración SQL real, recepción firmada, confirmaciones, duplicados, auditoría, ventana de respuesta, concurrencia, resultados ambiguos, estados de entrega y paginación. Pruebas de navegador en escritorio y celular con un PDF ficticio y respuestas simuladas, incluyendo descarga real, pausa del bot, doble clic y pérdida de confirmación HTTP. Sin mensajes reales enviados a clientes para probar.
