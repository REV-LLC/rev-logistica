# Asistencia PWA con OpenCV

## Flujo

- `/attendance`: empleados con cuenta activa vinculada pueden marcar entrada/salida con cámara frontal y ubicación reciente. Usa la hora recibida por el servidor. Requiere conexión.
- `/employees/attendance`: ADMIN/OFFICE revisan marcaciones, jornadas compartidas con WhatsApp, fotos de referencia y coordenadas/radio de obras.
- Perfil `EMPLOYEE`: solo asistencia, sin permisos de oficina. Habilitar el acceso desde la ficha existente de Empleados; no se crean contraseñas ni cuentas masivamente.

## Fotos actuales

La foto original existente de `employees/{id}/profile` (o el legado `profile.webp`) se procesa con YuNet y SFace. Comprobar fotos informa cuáles pueden procesarse; no aprueba automáticamente identidades. Oficina debe revisar cada imagen y confirmar identidad. Se guarda el vector, SHA256 de la foto original, versión del modelo y autor/fecha de aprobación. Una sustitución de la foto del perfil no reemplaza esa referencia. Se puede retirar y volver a aprobar la referencia.

## Registro y revisión

Una sola jornada abierta por empleado, tanto en PWA como WhatsApp. La PWA usa el mismo bloqueo de fila Employee y el índice parcial existente. Un UUID por solicitud evita duplicados tras perder una respuesta; la salida exige la ID de la jornada mostrada, para no cerrar una entrada posterior accidentalmente.

La foto debe contener un solo rostro legible. Si no existe una referencia aprobada compatible, no coincide el rostro, falta configurar la obra, la ubicación está fuera del radio, el GPS tiene baja precisión o falla el servicio facial, se guarda PENDING. Una foto ilegible pide repetir. Sin almacenamiento disponible no se confirma una marcación. Oficina puede aprobar/rechazar una sola vez con motivo y autor/fecha. Rechazar conserva los horarios y la evidencia: no borra jornadas ni calcula nómina.

El umbral inicial de similitud coseno es 0,45, configurable con FACE_MATCH_THRESHOLD. No es un porcentaje de certeza y debe calibrarse con fotos representativas antes de usarlo como control automático estricto. La captura no incluye prueba de vida: puede ser vulnerable a presentar una fotografía o pantalla. La ubicación proviene del dispositivo y no es una prueba infalible de presencia.

## Infraestructura

`services/face-recognition`: Python, FastAPI, OpenCV headless, YuNet y SFace. Docker instala los modelos desde una revisión fija de OpenCV Zoo, verifica su SHA256 Git LFS y conserva licencias. API `/extract` autenticada con token; `/health` informa el modelo. Un proceso, un hilo OpenCV y concurrencia limitada. No usa GPU, APIs de IA generativa ni cobro de reconocimiento por petición.

En el proyecto Railway existente crear `face-recognition`, desplegando esa carpeta como raíz. Mantenerlo sin dominio público, con PORT=8000 y FACE_SERVICE_TOKEN aleatorio de al menos 32 caracteres. Configurar en API, para cada entorno:

```
ATTENDANCE_ENABLED=true
FACE_SERVICE_URL=http://face-recognition.railway.internal:8000
FACE_SERVICE_TOKEN=<mismo token del servicio en ese entorno>
FACE_MATCH_THRESHOLD=0.45
ATTENDANCE_EVIDENCE_KEY=<32 bytes aleatorios en hexadecimal>
```

El servicio usa el mismo R2 configurado en la API. Como ese bucket también sirve recursos públicos, las selfies se cifran con AES-256-GCM, IV aleatorio y clave de objeto como AAD antes de almacenarse bajo `attendance-encrypted/`. No se generan URLs públicas de fotos; solo las devuelve descifradas la API a oficina o al propio empleado, con no-store. No rotar ni perder ATTENDANCE_EVIDENCE_KEY sin un procedimiento de recifrado. Los vectores se guardan en PostgreSQL y nunca se devuelven al navegador. Las nuevas pantallas no entran en la caché offline del service worker.

Aplicar `20261116120000_pwa_attendance` mediante el despliegue habitual. Hace nullable el vínculo obligatorio de entrada a WhatsApp para aceptar origen PWA; conserva las relaciones y los registros existentes. No requiere nueva base, volumen ni Redis.

## Habilitación

1. Verificar servicio facial y conexión privada desde API.
2. Preparar y aprobar las fotos existentes desde Fotos de referencia.
3. Habilitar cuentas individuales que falten con perfil solo asistencia.
4. Configurar coordenadas y radios de obra. Sin coordenadas se conserva el registro como pendiente.
5. Piloto con empleados reales y varios celulares; ajustar umbral, radio y límites según resultados y picos de marcación.

## Verificación de desarrollo

API y web compiladas; pruebas de reglas, idempotencia, identidad, desactivación, referencias, jornadas compartidas y acceso a evidencia. Prueba de navegador con PostgreSQL local desechable y OpenCV real: aprobar foto, cámara, GPS, entrada verificada, respuesta perdida y reintento sin duplicar, salida fuera del radio pendiente y aprobación de oficina. Evidencia almacenada en memoria únicamente en esa prueba; producción usa R2 cifrado. Browser plugin no disponible: se usó Playwright con Chrome local.

La cadena histórica de migraciones contiene transformaciones que exigen inventario existente y no se reconstruye en una base vacía. Se comprobó la migración nueva por separado sobre el esquema de producción, sin modificar datos de producción para probar.
