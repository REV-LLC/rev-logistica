# Chats de clientes por WhatsApp — primera versión

## Canal y revisión

`/customers/whatsapp` (Clientes y facturación → Chats de clientes) muestra la bandeja para ADMIN y OFFICE. Incluye conversaciones por teléfono, coincidencias con contactos de clientes, mensajes entrantes, respuestas enviadas o pendientes del asistente, pedidos confirmados por el remitente, borrador, notas internas, pausa y revisión personal. Una coincidencia telefónica no verifica identidad ni autoriza acceso a documentos del cliente.

El bot recibe solicitudes de alquiler: equipos y cantidades (hasta 20 ítems), cliente declarado, obra/dirección, fecha/hora, duración y transporte. Extrae datos con la credencial y modelo ya existentes de WhatsApp; las respuestas y preguntas son plantillas del servidor. No consulta precios, inventario ni datos privados de clientes. No crea remisiones, cotizaciones, reservas, tareas de transporte ni facturas. La confirmación crea una `WhatsappCustomerRequest` pendiente, enlazada al mensaje de confirmación y visible en la bandeja. El cliente debe confirmar después de que se envíe el resumen.

Fechas como «mañana» conservan la expresión original; revisar la fecha del mensaje en el historial antes de coordinar. El borrador vence tras 23 horas sin actividad. Pedidos enviados previamente permanecen guardados al cancelar o iniciar otro.

## Separación y seguridad

Reutiliza el webhook con firma Meta, validación del número de negocio, cola persistente, deduplicación por ID de Meta y outbox. Los teléfonos de cualquier empleado, incluso inactivo o ambiguo, no pasan al bot de clientes. El cliente no recibe información del directorio interno. El teléfono normalizado identifica la conversación; puede haber varias solicitudes por chat.

Cada teléfono tiene lease y la escritura de solicitud, borrador y respuesta es transaccional. Si falla IA, se conserva el borrador, el chat queda en pausa para oficina y el mensaje permanece visible. Pausar no envía mensajes de oficina: suspende nuevas respuestas automáticas y descarta las aún pendientes. Un envío ya en curso puede terminar. Reanudar permite atender mensajes nuevos; no reproduce mensajes antiguos.

Solo texto completa el pedido en esta versión. Las fotos se pueden abrir desde la bandeja a través del servidor autenticado, reducidas a 900 px, sin nueva copia R2. Su disponibilidad depende de la retención de Meta. Audio y documentos se indican en el historial pero no se transcriben ni descargan. Las respuestas emitidas fuera de este software no se sincronizan en esta versión.

Marcar como revisado guarda usuario y el último mensaje visto; mensajes recibidos posteriormente vuelven a aparecer por revisar. Las notas son internas. No equivale a aceptar comercialmente un pedido.

## Configuración y publicación

Aplicar la migración aditiva `20261120120000_whatsapp_customer_chats` y habilitar `WHATSAPP_CUSTOMERS_ENABLED=true` en el API principal. También debe estar activo `WHATSAPP_REPORTS_ENABLED` y la configuración existente de Meta/IA. No necesita nuevos servicios, cuentas ni claves. El valor por defecto es desactivado; desactivar vuelve al comportamiento previo para contactos externos y evita respuestas de cliente pendientes.

La bandeja conserva mensajes de contactos externos previamente rechazados que estén en `WhatsappInboundMessage`. No importa el historial de WhatsApp personal ni recupera mensajes que Meta nunca entregó al webhook. Las lecturas de la bandeja no reenvían mensajes históricos.

No cambiar MiREV ni el canal de reportes de empleados; entrada/salida sigue retirada de WhatsApp. Publicar solo API principal y web REV; omitir staging y servicios MiREV.

## Validación

Pruebas de PostgreSQL local: webhook firmado → cola → extracción simulada → preguntas/resumen → confirmación → solicitud → revisión. Cubren duplicados, concurrencia, resumen no enviado, teléfonos empleados, fallos de IA, pausa, mensajes nuevos, contactos de clientes, historial previo y cursor ajeno. Controladores verifican ADMIN/OFFICE frente a anónimo, EMPLOYEE, DRIVER, OPERATOR y WAREHOUSE_TABLET. IA simulada: esquema acotado, credencial aislada, sin herramientas y `store:false`.

QA visual con Playwright local y API simulada en escritorio y celular: abrir chat, ver pedido, pausar, guardar notas, marcar revisión y volver a la bandeja; sin mensajes reales ni datos ficticios en producción. Se usó Playwright porque no había plugin Browser disponible. Capturas/evidencia se conservan fuera del repositorio.

## Personalización y revisión del contacto — 25 de noviembre de 2026

La toma de pedidos distingue `contactName` (persona), `customer` (empresa o cliente declarado) y `worksite` (obra indicada). Se pueden recibir pedidos aunque no exista ninguno de esos perfiles. Se solicita el nombre de la persona antes del resumen; los borradores de la versión anterior mantienen sus datos y piden solo ese dato pendiente. Una confirmación anterior no crea automáticamente un perfil.

La bandeja muestra persona, empresa, obra, equipos y número de pedidos recibidos, incluso si el número aún no está en el directorio. Permite buscar por cualquiera de esos datos, filtrar pedidos recibidos/contactos por registrar y saltar directamente a los pedidos. `?search=` permite abrir la página con una búsqueda inicial.

ADMIN/OFFICE puede abrir **Vincular pedido y contacto** o **Registrar contacto**. El panel sugiere clientes/obras existentes (acentos, abreviaciones y errores menores), permite corregir el nombre recibido y guarda un perfil de contacto de WhatsApp asociado al cliente y opcionalmente a una de sus obras. No reemplaza teléfonos de facturación ni el contacto oficial de obra. El perfil sirve para reconocer a la persona y recordar su empresa en nuevos pedidos; cada pedido sigue necesitando obra, detalles y confirmación. Los enlaces de pedidos se deciden explícitamente por oficina; no se aplican automáticamente a todos los pedidos del teléfono.

Desde ese panel también se puede crear un cliente o una obra usando los endpoints y validaciones existentes (`POST /customers`, `POST /worksites`). Cada botón crea un registro real solo cuando oficina lo pulsa. No se crean perfiles desde un mensaje ni desde una salida de IA. Clientes nuevos admiten documento opcional; otros datos se completan en sus fichas habituales. Si se cancela el panel después de crear cliente/obra, esos registros ya creados permanecen disponibles en el directorio.

El perfil se conserva en `WhatsappCustomerChat` con versión, usuario y fecha de actualización. Una solicitud revisada conserva por separado `customerId`, `customerWorksiteId`, nombres elegidos por oficina, usuario y fecha. Los mensajes y `details` originales de cada pedido permanecen intactos. El guardado valida pertenencia de la obra, propiedad de la solicitud, vigencia de los registros y versión; rechaza cambios durante el lease del worker y evita sobrescribir otra revisión de oficina.

Migración aditiva: `20261125220000_whatsapp_customer_contact_review`. Añade campos y FK opcionales con índices; los pedidos previos siguen visibles sin backfill ni nombres inventados. El borrador nuevo incorpora la persona sin perder borradores históricos. No cambia el canal de empleados (solo peticiones), MiREV, precios ni reservas.

Validación: pruebas de webhook y PostgreSQL local para personas nuevas, confirmaciones anteriores, vinculación, memoria, conflictos, obra ajena, solicitud de otro teléfono y conservación de mensajes/declaraciones. Pruebas de permisos para directorios y perfil. QA visual con API/PostgreSQL locales y datos ficticios en escritorio y móvil: elegir cliente/obra existentes, crear cliente/obra y guardar el perfil/pedido. Sin pruebas que creen contactos o pedidos falsos en producción.
