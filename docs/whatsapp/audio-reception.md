# Recepción de audios de WhatsApp

Los mensajes de audio conservan el identificador de medio recibido por el webhook firmado de Meta en `WhatsappInboundMessage.mediaId`. No se transcriben ni se convierten automáticamente en pedidos o peticiones. Un audio recibido mientras hay un resumen por confirmar invalida esa confirmación pendiente.

Admin y office pueden escuchar o descargar el original en Chats de clientes. Los audios de empleados aparecen en Mensajes por revisar de Reportes WhatsApp. La descarga pasa por un endpoint autenticado que limita formato, tamaño y destino Meta; no entrega el token ni la URL remota al navegador. La descarga se hace solo al pulsar Escuchar audio. Los formatos que el navegador no reproduzca se pueden descargar.

Se obtiene el archivo de Meta bajo demanda, sin copiarlo a R2. Esto no constituye un archivo permanente: si Meta ya no dispone del medio, hay que solicitar su reenvío. Los mensajes antiguos cuyos identificadores se descartaron muestran una explicación y no un reproductor vacío. Un reintento firmado con el mismo mensaje puede completar una referencia faltante sin volver a procesarlo ni responder otra vez; no reemplaza una referencia ya guardada.

No requiere migración, credenciales nuevas ni reactivación de flujos retirados de empleados. No se envían mensajes de prueba a producción.

Validación: pruebas unitarias de límites de medios y permisos; integración con PostgreSQL local aislado para recepción firmada, duplicados y ausencia de pedidos automáticos; reproducción real de un audio ficticio y descarga en las dos páginas, con vistas de escritorio y celular mediante Playwright.
