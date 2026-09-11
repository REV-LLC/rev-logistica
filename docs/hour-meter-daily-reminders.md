# Recordatorio diario de horómetros por WhatsApp

El backend envía una pregunta recordatoria a las cuentas activas con perfil
**Operario (`OPERATOR`)**, vinculadas a un empleado activo con teléfono.
No se selecciona por cargo laboral, ni se envía a conductores, oficina o tablets.
El teléfono debe incluir el código de país (por ejemplo, `+573001234567`).

Mensaje por defecto:

> ¿Ya registraste el horómetro de hoy en REV Logística? Si aún no lo has hecho,
> ingresa a la página de horómetros y registra la lectura de tu equipo.

El botón lleva a `PUBLIC_WEB_URL/inventory/hour-meter`. Esa ruta ya permite el
perfil Operario; si no hay sesión, el login conserva el destino. Es un recordatorio
general, no una afirmación de que falten lecturas. También llega a quienes ya
registraron y se envía todos los días, incluidos fines de semana.

## Configuración del API

| Variable | Valor por defecto | Uso |
| --- | --- | --- |
| `HOUR_METER_REMINDER_ENABLED` | `true` | `false` desactiva solo este recordatorio |
| `HOUR_METER_REMINDER_TIME` | `17:00` | Hora local, formato de 24 horas `HH:mm` |
| `HOUR_METER_REMINDER_TIME_ZONE` | `America/Bogota` | Zona horaria de la empresa |
| `HOUR_METER_REMINDER_APP_NAME` | `REV Logística` | Nombre en el mensaje, configurable para otras empresas |
| `PUBLIC_WEB_URL` | Sin valor por defecto | Origen público HTTP(S), obligatorio para enviar un enlace válido |

Usa el programador existente: `NOTIFICATION_AUTO_DISPATCH` debe estar habilitado.
Se recomienda `NOTIFICATION_DISPATCH_INTERVAL_MINUTES=1`; un valor de 60 significa
que puede enviarse hasta una hora después del horario configurado. Las variables
se aplican al reiniciar/desplegar el API. No requiere cambios ni migraciones de base
de datos adicionales al esquema de notificaciones existente.

Reutiliza la plantilla de WhatsApp existente (`WHATSAPP_TEMPLATE_NAME`, idioma,
credenciales y botón dinámico) o el webhook de mensajería configurado. No usa correo.
La plantilla aprobada debe aceptar los parámetros de destinatario, mensaje y enlace
que ya utiliza `NotificationTransportService`.

## Persistencia y recuperación

Se registra un tema `SYSTEM / hour-meter-daily / HOUR_METER_DAILY` y un
`NotificationDelivery` por usuario, fecha local y canal. Los estados aceptado,
enviado, entregado o leído no vuelven a enviarse en esa fecha. Se usa la reclamación
atómica de entregas existente para coordinar instancias concurrentes.

Se intenta enviar en la primera revisión a partir del horario configurado hasta
terminar el día local. Un reinicio puede recuperar el recordatorio del día; no se
acumulan días anteriores. Los fallos se reintentan en las siguientes revisiones.
Como en los demás envíos, si el proveedor acepta un mensaje pero se pierde su
respuesta, no se puede garantizar exactamente un envío; una reclamación sin
respuesta puede recuperarse después de diez minutos.

Las pruebas usan un transporte simulado: no envían WhatsApp reales. Antes de
publicar, comprobar variables del entorno y el envío con un destinatario de prueba
autorizado. Implementar el código localmente no activa envíos en producción.
