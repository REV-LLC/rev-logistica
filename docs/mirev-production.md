# MiREV producción

Publicado el 17 de noviembre de 2026 en https://mirev.revcontractorsllc.com.

## Recursos e independencia

Dos servicios nuevos del proyecto Railway `rev-logistica`, entorno `production`: `mirev-web` y `mirev-api`. No se redesplegó el API principal ni el frontend Vercel de REV Logística. Staging sigue en su entorno y base aislados, con `attendance-test-api` y su esquema `attendance_test`.

MiREV usa la base real existente (`public`), cuentas de empleados, fotos R2, referencias faciales y worker privados existentes. La configuración sensible se resuelve mediante referencias Railway a `api`, sin archivos de credenciales. No se creó ningún usuario de pruebas, referencia facial ni marcación en producción durante la publicación.

El API arranca con `MIREV_API_ONLY=true`: módulos de autenticación, asistencia y lecturas personales, sin scheduler, consumidores WhatsApp ni otros módulos del negocio. Los despliegues no ejecutan migraciones o predeploy. Para el registro facial inicial se aplicó individualmente la migración aditiva `20261117220000_mirev_face_enrollment`, que crea únicamente la tabla `MiRevFaceEnrollment`, y se registró con Prisma migrate resolve. No se aplicaron otras migraciones pendientes. CORS permite únicamente el frontend MiREV. Los GET personales de EMPLOYEE siguen comprobando cuenta y empleado activos; las fotos siempre exigen el empleado propio, también para sesiones administrativas. Los endpoints generales de empleados y usuarios no están publicados en este API.

La PWA tiene nombre, iconos REV, manifiesto, worker, caché y sesión propios. `/`, `/login` y `/profile` redirigen al portal solo cuando `MIREV_STANDALONE=true`. El manifiesto raíz del servicio MiREV también redirige a su manifiesto independiente. Las marcaciones y datos personales requieren Internet; el worker no cachea esas respuestas. REV Logística mantiene su origen y manifiesto originales.

## DNS

GoDaddy conserva los nameservers existentes. Se añadieron únicamente `mirev CNAME ibiwbqik.up.railway.app` y TXT de propiedad bajo `_railway-verify.mirev`; no se alteraron `app`, raíz, correo ni otros servicios. Railway confirmó certificado válido y dominio verificado.

## Estado inicial de empleados y obras

Consulta agregada de solo lectura: 18 empleados activos, 18 cuentas activas vinculadas, 13 referencias faciales aprobadas con modelo `sface-0ba9fbfa01b5270c` y ninguna obra activa con geocerca configurada. El worker confirmó ese mismo modelo por red privada. Umbral configurado: 0,45, preservado del API existente.

Con el nuevo requisito, cada empleado debe capturar su rostro una vez en MiREV, aunque ya tuviera una referencia antigua derivada de su foto de perfil. Quedan por completar esas capturas y las geocercas reales. Hasta entonces las marcaciones correspondientes permanecen pendientes de revisión; no se presentarán como verificadas. Se verificó una sesión real iniciada normalmente por el usuario: asistencia, foto/avatar, perfil, préstamos y calendario de bitácora cargaron correctamente. No se crearon marcaciones ni se alteraron datos durante esta revisión.

## Despliegues siguientes

El despliegue de estos servicios es manual y separado de la promoción de imágenes del API principal. No desplegar desde la raíz del repositorio con su `railway.json` de REV.

Preparar cada carpeta nueva con `python3 scripts/mirev/prepare.py api --output /private/tmp/mirev-api-NUEVO` o `web`. Desde esa carpeta ejecutar `railway up` indicando explícitamente proyecto, entorno y service ID del registro maestro. Las carpetas generadas usan `deploy/mirev/Dockerfile.api` o `.web` y no contienen `.env`, builds locales ni migraciones de predeploy. Antes de publicar una actualización, sincronizar selectivamente con producción y validar compatibilidad con su esquema real. No promover la rama de staging completa.

El costo es consumo adicional de estos dos servicios dentro del plan Railway existente; aún no se midió un importe propio de MiREV.

## Validación

Builds API y Next.js completos; 12 pruebas de PWA/sesión/GPS, tres pruebas de acceso personal y 20 pruebas de asistencia aprobadas. HTTPS, redirección inicial, metadatos de instalación, endpoints protegidos y CORS comprobados en el dominio público. Evidencia y despliegues en `docs/infrastructure/mirev-produccion-2026-11-17.json`.

## Registro facial inicial y card de perfil (17 de noviembre)

Tras iniciar sesión, antes de abrir asistencia o perfil, MiREV consulta `GET /attendance/face-enrollment`. Si falta el registro, muestra la cámara y una vista previa con «Guardar mi rostro y continuar». `POST /attendance/face-enrollment` solo acepta la selfie, sin ID de empleado: el servidor resuelve la cuenta activa. La imagen se normaliza, OpenCV exige un rostro válido y se guarda cifrada en R2; la referencia vectorial queda en EmployeeFaceReference. La tabla MiRevFaceEnrollment conserva empleado, cuenta, hash, modelo, clave de evidencia y fecha. No modifica la foto de perfil ni crea una marcación.

La transacción bloquea el empleado, comprueba nuevamente su cuenta y evita reemplazar una captura inicial existente. Al repetir la solicitud retorna el registro existente; si falla la detección no se habilita el acceso ni se guarda una referencia incompleta. El API de MiREV bloquea también las marcaciones directas sin registro, aunque se intente omitir la pantalla. Cerrar sesión o cambiar de dispositivo conserva el estado porque reside en el servidor.

El perfil reutiliza EmployeeProfile, EmployeePhotoControl y el CSS actual de producción (d8b76ef), con retrato 200x200 centrado. El contenedor de perfil admite 1200 px; asistencia y captura mantienen su ancho compacto. QA local a 2560 y 390 px confirmó foto contenida y ausencia de desbordamiento, con fixture descartado. El flujo inicial se comprobó con la sesión real ya abierta, sin capturar selfies ajenas ni crear marcaciones. Se aprobaron 27 pruebas de inscripción/asistencia y 11 de acceso/sesión/GPS. La prueba final con una selfie real corresponde al propio empleado al usar el flujo publicado.

La migración puntual puede aplicarse mediante `scripts/mirev/apply-face-enrollment.cjs` usando Railway run con el servicio Postgres de producción del registro maestro. El script valida proyecto, entorno y esquema; no usar migrate deploy para aplicar indiscriminadamente otras migraciones.

## Hotfix del selector y color del inicio

El selector usa TextInput de Mantine como REV y filtra inmediatamente por cliente, obra y alias. Normaliza tildes y mayusculas y combina palabras, sin consultas por cada tecla. Muestra cantidad y ausencia de resultados y permite limpiar. Bodega Renta Equipos del Valle se ordena primero, sin autoseleccionarla. Se creo como sitio independiente bajo el cliente existente RENTA EQUIPOS DEL VALLE; LOTE permanece intacto y no se inventaron coordenadas. IDs en el registro maestro.

La franja clara provenia del tema light del inicio. MiREV ahora usa dark tambien en inicio y html #101820 como el perfil. La foto real fue comprobada a 320 px dentro de la card, sin desborde horizontal; el encabezado tiene overflow hidden. La busqueda real se verifico a 390 px: 208 obras, 2 resultados para renta y alamos, cero para consulta inexistente, limpieza completa y seleccion correcta de Bodega. Sin marcaciones creadas ni errores de consola. Cuatro pruebas del filtro y build Next.js aprobados.

## Ubicaciones de Bodega y Lote

El 17 de noviembre de 2026 se configuraron las dos ubicaciones solicitadas en Cali: Bodega, Carrera 22 #5A-07, y Lote, Calle 8A #22-29. Google Address Validation confirmo ambas con validacion PREMISE y geocodigo SUB_PREMISE, sin componentes reemplazados ni no confirmados. Se uso la clave del proyecto REV existente en memoria; no se cambiaron APIs, claves o suscripciones.

Los puntos estan separados 263 metros y tienen radios de 100 metros para no solaparse. Se corrigio la direccion anterior de LOTE, que repetia la de Bodega. Se comprobo lectura persistente de coordenadas, direcciones y radios, y que el algoritmo sugiere el sitio correcto para cada punto. Dos muestras existentes quedan a 11,8 y 6,6 metros de Bodega: evaluadas con la configuracion nueva y las reglas existentes cumplirian VERIFIED, pero sus estados historicos PENDING no se modificaron. No se crearon marcaciones de prueba ni se hicieron despliegues.

Evidencia y valores anteriores/nuevos en docs/infrastructure/mirev-ubicaciones-internas-2026-11-17.json. Para repetir la configuracion de forma controlada existe scripts/mirev/configure-internal-locations.cjs, que valida proyecto/entorno y vinculos y evita sobrescribir coordenadas distintas cambiadas despues de la inspeccion.

## Cristal del encabezado (18 de noviembre)

La compilacion anterior del modulo movil conservaba solo -webkit-backdrop-filter cuando la declaracion prefijada se encontraba al final. En Chrome, getComputedStyle confirmaba backdrop-filter none, por lo que la card quedaba transparente sin difuminado efectivo. Se ordenaron las declaraciones como en el resto de REV (WebKit primero y estandar al final), usando saturate(115%). El build confirma ambas propiedades.

El saludo/titulo Mi asistencia conserva su composicion y tipografia, con fondo oscuro rgba(46,52,59,.68), blur 28 px, borde existente y reflejo interior suave. El resto de superficies moviles recupera el blur 18 px previsto. Solo se publica el frontend independiente MiREV.

### Punto medio solicitado

El usuario considero demasiado densa la primera correccion. El saludo vigente usa rgba(46,52,59,.36) y blur 16 px, entre la transparencia original y la variante de 68% / 28 px. Se suavizo tambien la sombra y el reflejo interior. Se conserva el filtro estandar y WebKit corregidos; no cambian componentes, textos o funciones.

### Cristal uniforme, exclusivo de MiREV

El cristal aprobado se centraliza en variables de la clase page del modulo mobile-attendance: fondo rgba(46,52,59,.36), blur 16 px, saturacion 115% y sombra/reflejo suaves. Se aplica a saludo, asistencia, formulario de ingreso, ayuda, recibos, opciones de obra, avisos y errores, encabezado personal y panel del perfil. Se conservan colores semanticos de bordes/textos de avisos y de los botones de entrada/salida.

Los selectores de Paper/Card y encabezados compartidos requieren un ancestro page de MiREV. No se edita EmployeeProfile, los estilos generales ni componentes de REV Logistica. Los paneles dentro del workspace del perfil heredan la transparencia del cristal exterior, evitando una segunda capa mas opaca. Una fixture local comprobo los valores en todas las superficies, incluidos perfil y bitacora a 390 px: sin desborde ni errores; una superficie fuera del portal mantuvo su fondo 6% y blur 18 px original. Fixture y API ficticia descartadas antes de guardar el cambio y ausentes de la carpeta publicada.
