# Notificaciones reutilizables y mantenimiento por horómetro

El sistema separa el cálculo de cada alerta de su entrega. El módulo genérico de notificaciones administra temas, usuarios, WhatsApp, deduplicación y la bandeja personal. Vehículos y mantenimientos aportan sus propios vencimientos.

El mantenimiento admite tanto `assetId` como `vehicleId` y separa lecturas acumuladas, planes, revisiones recurrentes y ejecuciones. Cada activo posee directamente `Asset.hourMeter` como valor actual obligatorio; `AssetHourReading` conserva el historial auditable. Ambos se actualizan en la misma transacción. Los recordatorios se calculan con:

`próximo vencimiento = (última ejecución o línea base) + intervalo`

## Flujo API

Todos los endpoints requieren JWT. La administración corresponde a `ADMIN` y `OFFICE`; cualquier usuario activo puede consultar únicamente sus recordatorios.

1. Crear un plan con sus revisiones y destinatarios:

```http
POST /maintenance/plans
```

```json
{
  "assetId": "UUID_DEL_ACTIVO",
  "name": "PLAN MOTOR",
  "items": [
    {
      "name": "CAMBIO DE ACEITE",
      "instructions": "CAMBIAR ACEITE Y FILTRO; REVISAR FUGAS",
      "intervalHours": 250,
      "warningHours": 20,
      "baselineHours": 0,
      "recipients": [
        { "userId": "UUID_DEL_USUARIO", "whatsappEnabled": true }
      ]
    }
  ]
}
```

2. Registrar el horómetro (no se aceptan valores inferiores a la lectura máxima):

```http
POST /maintenance/assets/:assetId/hours
Content-Type: application/json

{ "hours": 238.5, "note": "LECTURA AL REGRESAR DEL ALQUILER" }
```

Para un mantenimiento vehicular se envía `vehicleId` en lugar de `assetId` y las horas se registran en `POST /maintenance/vehicles/:vehicleId/hours`.

3. Consultar la bandeja unificada del usuario autenticado:

```http
GET /notifications/reminders/me
```

Los estados calculados son `UPCOMING`, `DUE` y `OVERDUE`. Solo `DUE` y `OVERDUE` generan notificaciones externas.

4. Registrar el mantenimiento realizado. Si se omite `completedAtHours`, se usa el horómetro actual:

```http
POST /maintenance/items/:itemId/completions
Content-Type: application/json

{ "completedAtHours": 245, "notes": "ACEITE Y FILTRO CAMBIADOS" }
```

## Envío de alertas

Las alertas externas se envían únicamente por WhatsApp. El correo queda reservado para documentos de clientes. Se puede configurar un webhook compartido:

```env
MESSAGING_WEBHOOK_URL=https://proveedor.example/mensajes
MESSAGING_WEBHOOK_TOKEN=token-opcional
```

También se puede usar `NOTIFICATION_WHATSAPP_WEBHOOK_URL` para configurar un proveedor específico.

La integración preferida es Meta WhatsApp Cloud API directa:

```env
WHATSAPP_ACCESS_TOKEN=token-permanente-del-system-user
WHATSAPP_PHONE_NUMBER_ID=id-del-numero
WHATSAPP_TEMPLATE_NAME=rev_logistica_notification
WHATSAPP_TEMPLATE_LANGUAGE=es_CO
WHATSAPP_API_VERSION=v25.0
```

La plantilla debe tener tres variables de cuerpo, en este orden: título, mensaje y enlace o instrucción de consulta.

El webhook recibe `{ "channel": "WHATSAPP", "to": "+57...", "message": "...", "link"?: "..." }`. El campo `link` queda disponible para reutilizar el transporte al compartir documentos. El API procesa automáticamente las alertas cada 60 minutos. Se controla con `NOTIFICATION_AUTO_DISPATCH` y `NOTIFICATION_DISPATCH_INTERVAL_MINUTES`. También se puede ejecutar manualmente:

```http
POST /notifications/dispatch
```

Cada canal y vencimiento tiene una clave única. Los envíos exitosos no se repiten; los fallidos se pueden reintentar, y un envío interrumpido se recupera después de diez minutos.

## Endpoints administrativos adicionales

- `GET /maintenance/assets/:assetId`: plan, historial de horas y revisiones del activo.
- `GET /maintenance/vehicles/:vehicleId`: plan, historial de horas y revisiones del vehículo.
- `GET /notifications/reminders`: recordatorios de todos los destinatarios.
- `PATCH /maintenance/plans/:planId`: nombre o activación del plan.
- `POST /maintenance/plans/:planId/items`: agregar una revisión.
- `PATCH /maintenance/items/:itemId`: editar revisión y reemplazar destinatarios.
- `DELETE /maintenance/plans/:planId` y `DELETE /maintenance/items/:itemId`: archivan sin borrar el historial de mantenimiento.

## Alertas automáticas de vehículos

Al crear un vehículo se crean automáticamente los temas `SOAT_EXPIRY` y `TECH_INSPECTION_EXPIRY`. En `POST /vehicles` o `PATCH /vehicles/:id` se pueden asignar los mismos destinatarios a ambos:

```json
{
  "plate": "ABC123",
  "soatVigencia": "2026-12-20",
  "tecnomecanicaVigencia": "2027-01-15",
  "notificationRecipients": [
    { "userId": "UUID", "whatsappEnabled": true }
  ]
}
```

Para configurar cada tema por separado, la interfaz puede abrir el módulo sobre el ID del vehículo:

- `GET /notifications/entities/VEHICLE/:vehicleId/topics`
- `PUT /notifications/topics/:topicId/recipients`

Los vehículos existentes reciben ambos temas durante la migración. `VEHICLE_DOCUMENT_WARNING_DAYS` controla cuántos días antes se considera que la alerta requiere atención; el valor predeterminado es 30.

## Reutilización desde otros módulos

Un módulo nuevo puede registrar una alerta por fecha sin implementar nuevamente destinatarios o transportes:

```http
POST /notifications/entities/CONTRACT/:contractId/topics
```

```json
{
  "eventType": "CONTRACT_EXPIRY",
  "titleTemplate": "CONTRATO PRÓXIMO A VENCER",
  "messageTemplate": "EL CONTRATO {{entityId}} VENCE EL {{dueDate}}; FALTAN {{remainingDays}} DÍAS",
  "dueAt": "2027-03-15",
  "warningDays": 45,
  "recipients": [
    { "userId": "UUID", "whatsappEnabled": true }
  ]
}
```

Las variables disponibles son `{{entityId}}`, `{{dueDate}}`, `{{remainingDays}}` y `{{status}}`. Los temas automáticos de SOAT y tecnomecánica no permiten cambiar lógica o plantilla desde este endpoint; únicamente sus destinatarios.
