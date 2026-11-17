# Pruebas móviles de asistencia aisladas

Preparado el 17 de noviembre de 2026 en el proyecto Railway existente `rev-logistica` (`bec9984e-3e3a-48c8-9d75-8c87d591b931`), cuenta `samuel040902@hotmail.com`.

- Interfaz: https://web-staging-staging-cf10.up.railway.app/attendance/mobile
- API exclusivo: https://attendance-test-api-staging.up.railway.app
- Entorno: staging (`53c93c9d-33e7-4137-a598-6648a6491886`).
- Servicio API: `338d9153-c51d-4e8f-8608-aabc17a0f98f` (`attendance-test-api`).
- Frontend existente: `ad18242d-981c-4675-9408-81bd9ad56033` (`web-staging`).
- PostgreSQL de staging, esquema nuevo `attendance_test`; no copia de datos reales.
- Volumen exclusivo `7c8bbf10-6466-4544-9a9a-b01b77582188`, montaje `/attendance-test-data`.
- Worker facial de staging `3b47c0b8-6be3-41bf-b68d-374c24f84802`; conexión privada.
- Usuario ficticio `samuel.prueba`, rol EMPLOYEE, sin nómina, teléfono ni correo reales.
- Cliente y obra ficticios. La primera selfie configura la referencia y usa el GPS del celular como centro del radio de prueba de 200 m. La foto de inscripción se descarta después de extraer el vector; las selfies de marcación se guardan cifradas en el volumen exclusivo.
- Claves de JWT y evidencias independientes. Sin credenciales de R2, Meta, Zoho, SMTP ni OpenAI. Autenticación obligatoria; notificaciones automáticas deshabilitadas.
- La función de autoinscripción requiere simultáneamente el ID exacto de staging, su nombre, bandera de pruebas y autenticación; solo la cuenta ficticia designada puede usarla. En producción responde 404.
- El API se niega a iniciar en modo prueba si usa otro esquema o incluye credenciales de integraciones de producción.

El API habitual `api-staging-6ee9.up.railway.app` es otro servicio, históricamente configurado con integraciones compartidas. No forma parte de esta prueba: ni la interfaz móvil ni el API exclusivo lo utilizan. La promoción automática habitual del API no despliega este servicio de prueba.

Los recursos de pruebas facturan consumo dentro del plan Railway existente; no se contrató otro plan ni proveedor. No se verificó aún un importe de consumo atribuible a esta prueba.

## Uso desde el celular

Abrir el enlace de interfaz con Safari o Chrome, iniciar sesión con la cuenta de pruebas y permitir cámara y ubicación. Tocar **PREPARAR MI ROSTRO**, tomar la selfie de referencia y después **MARCAR ENTRADA**. Usar **LISTO** y **MARCAR SALIDA** para cerrar la jornada. Una selfie fuera del radio o con ubicación imprecisa conserva la marcación como pendiente, igual que el flujo normal.

No usar credenciales de producción. La contraseña de prueba se entrega por separado y no se guarda en el repositorio.

## Despliegues

Los paquetes subidos contienen solo el código y manifiestos necesarios, sin `.env`, secretos, node_modules ni archivos de producción. Se usa `Dockerfile.attendance-test` para el API y `Dockerfile.attendance-web-test` para la web, copiados como `Dockerfile` en sus paquetes respectivos. La configuración de los servicios se fija mediante la API de Railway, sin modificar el `railway.json` de producción. No hay predeploy de migraciones; el esquema de pruebas se creó vacío con Prisma y se añadió explícitamente el índice parcial de una jornada abierta por empleado.

No fusionar esta rama ni activar este modo en producción. La prueba no cambia fotos, empleados, accesos, jornadas o despliegues de producción.

## Verificación

Cuatro suites de asistencia e aislamiento: 25 pruebas aprobadas. Prueba del flujo HTTPS con viewport de 390×844, cámara e imagen sintéticas y GPS simulado: login real, inscripción del rostro, entrada VERIFIED (similitud 0.978768), evidencia privada, salida fuera del radio PENDING e idempotencia correctas. Sin errores de JavaScript ni solicitudes del navegador a producción. El token de staging fue rechazado por producción. Se eliminaron las referencias, marcaciones y jornadas sintéticas; la obra vuelve a quedar sin coordenadas para registrar la ubicación real del celular en la primera prueba del usuario.

`PORT=3000` está fijado en ambos servicios y `HOST=::` en el API. Las cuatro opciones de bypass del frontend quedan deshabilitadas tanto en sus variables como en la imagen de pruebas. Los despliegues de producción mantienen sus identificadores anteriores. Evidencia: `docs/infrastructure/verificacion-attendance-staging-2026-11-17.json`.

### Mensajes de detección facial, 17 de noviembre

El worker de staging distingue cero rostros («No pudimos detectar tu rostro…») de varios rostros («Detectamos N rostros…»). Cuatro pruebas del worker y ambos casos a través del API HTTPS de staging aprobados. Despliegue de staging `555cc838-55c5-41ee-ab53-16ce48de5f5e`; producción conserva `b69b54e9-1f7f-4f2d-af3a-4a4cad4766d2`. Los modelos, umbrales y datos del usuario no se modificaron.

### Guía de cámara y resultado visible

La guía mide 44 % del ancho y 48 % del alto del visor, frente al 64 % y 76 % anteriores. El vídeo usa `object-fit: contain`, por lo que la vista previa incluye la imagen completa que se captura. La inscripción y la marcación comparten la guía.

Por decisión expresa del usuario, una discrepancia facial sigue guardando la marcación PENDING para revisión de oficina. La pantalla muestra «Entrada/Salida sin verificar» y el motivo «Tu rostro no coincide con la referencia registrada». Las aprobaciones de oficina y las verificaciones automáticas tienen textos distintos. El último registro también explica si el rostro no coincidió.

Validación visual local y en el frontend de staging con cámara y respuestas API simuladas: guía, inscripción y estados PENDING/FACE_MISMATCH, APPROVED y VERIFIED correctos, sin errores JavaScript. Despliegue web `267aa3ef-47d2-48f3-97b8-02f738cad1bf`. No se cambiaron ni borraron los datos de prueba del usuario ni se desplegó producción.

### Puntuación del detector y cámara nativa en iPhone

El worker devuelve `detectionScore` (columna 14 de la detección de YuNet) y `detectionThreshold` (0.90), distintos de la similitud de identidad de SFace (umbral 0.45). El API guarda ambos valores en cada nueva marcación procesada. La ampliación nullable de `AttendancePunch` se ejecutó solo en `attendance_test`, mediante `scripts/staging/attendance-detection-score.sql`, que verifica el identificador físico de PostgreSQL antes del ALTER. No se añadió una migración automática de producción.

El endpoint `POST /attendance/test-diagnostics/backfill` requiere el entorno exacto de staging y el usuario ficticio designado. Reprocesa hasta 20 evidencias propias sin puntuación, actualiza únicamente detección, umbral y fecha del reprocesamiento; no modifica similitud, estado, horarios, GPS, referencia ni evidencia. Se completaron ocho registros anteriores y una segunda ejecución no realizó cambios. La interfaz etiqueta los valores históricos como recalculados. No se guardan aquí coordenadas, fotos, vectores ni puntuaciones individuales del usuario.

El apartado **Datos de mis pruebas**, exclusivo del modo de staging, muestra puntuación de detección, similitud de identidad, umbrales, distancia, precisión reportada por GPS, coordenadas y motivo de revisión.

En iPhone/iPad con la PWA instalada se usa `<input type="file" accept="image/*" capture="user">` para abrir la cámara del sistema. La imagen se normaliza a JPEG de hasta 1024 px, sin EXIF, antes de enviarse por el flujo existente. No se invoca getUserMedia en ese modo. La geolocalización sigue solicitándose al marcar y se renueva si la captura tarda. Abrir la PWA o consultar el historial no solicita cámara ni ubicación. El retorno de la cámara nativa no cancela la operación por visibilidad de la página; cancelar antes de terminar de decodificar no envía la foto ni cambia la referencia. En otros navegadores continúa la cámara web con la guía pequeña.

Verificaciones: 31 pruebas API, cuatro pruebas del worker, TypeScript y compilaciones Railway correctas. Pruebas visuales locales y en la web publicada con API/cámara simuladas: historial, captura web, modo iPhone instalado, cero llamadas a cámara/GPS en apertura y recarga, y cancelación antes de inscripción. La cámara nativa y cualquier aviso de iOS deben comprobarse finalmente en el dispositivo real; no se promete persistir permisos del navegador con código o localStorage.

Referencias: [salida de FaceDetectorYN](https://docs.opencv.org/4.12.0/df/d20/classcv_1_1FaceDetectorYN.html), [reporte de WebKit sobre permisos de cámara en PWA instalada](https://bugs.webkit.org/show_bug.cgi?id=327237).

Despliegues de esta revisión: worker `63449cbe-b770-47cd-9ff3-3ea36bc3c1fb`, API exclusivo `e698e328-fc07-47b7-a7d7-a2b193bda85f`, web `d82fc385-8047-4aad-abf9-e69019962daf`. No se realizaron acciones de escritura ni despliegues en producción. Durante la revisión se observó una actualización concurrente del API habitual de producción (`3df4ab4a-6c9f-402d-8660-275b9eedc2bd`), independiente de este servicio exclusivo de pruebas.
