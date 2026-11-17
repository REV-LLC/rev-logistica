# MiREV producción

Publicado el 17 de noviembre de 2026 en https://mirev.revcontractorsllc.com.

## Recursos e independencia

Dos servicios nuevos del proyecto Railway `rev-logistica`, entorno `production`: `mirev-web` y `mirev-api`. No se redesplegó el API principal ni el frontend Vercel de REV Logística. Staging sigue en su entorno y base aislados, con `attendance-test-api` y su esquema `attendance_test`.

MiREV usa la base real existente (`public`), cuentas de empleados, fotos R2, referencias faciales y worker privados existentes. La configuración sensible se resuelve mediante referencias Railway a `api`, sin archivos de credenciales. No se creó ningún usuario de pruebas, referencia facial ni marcación en producción durante la publicación.

El API arranca con `MIREV_API_ONLY=true`: módulos de autenticación, asistencia y lecturas personales, sin scheduler, consumidores WhatsApp ni otros módulos del negocio. No ejecuta migraciones o predeploy. CORS permite únicamente el frontend MiREV. Los GET personales de EMPLOYEE siguen comprobando cuenta y empleado activos; las fotos siempre exigen el empleado propio, también para sesiones administrativas. Los endpoints generales de empleados y usuarios no están publicados en este API.

La PWA tiene nombre, iconos REV, manifiesto, worker, caché y sesión propios. `/`, `/login` y `/profile` redirigen al portal solo cuando `MIREV_STANDALONE=true`. El manifiesto raíz del servicio MiREV también redirige a su manifiesto independiente. Las marcaciones y datos personales requieren Internet; el worker no cachea esas respuestas. REV Logística mantiene su origen y manifiesto originales.

## DNS

GoDaddy conserva los nameservers existentes. Se añadieron únicamente `mirev CNAME ibiwbqik.up.railway.app` y TXT de propiedad bajo `_railway-verify.mirev`; no se alteraron `app`, raíz, correo ni otros servicios. Railway confirmó certificado válido y dominio verificado.

## Estado inicial de empleados y obras

Consulta agregada de solo lectura: 18 empleados activos, 18 cuentas activas vinculadas, 13 referencias faciales aprobadas con modelo `sface-0ba9fbfa01b5270c` y ninguna obra activa con geocerca configurada. El worker confirmó ese mismo modelo por red privada. Umbral configurado: 0,45, preservado del API existente.

Quedan por preparar cinco referencias y las geocercas reales. Hasta entonces las marcaciones correspondientes permanecen pendientes de revisión; no se presentarán como verificadas. Una prueba con sesión real de empleado requiere el inicio de sesión normal del usuario; no se reutilizan sesiones ocultas del navegador ni se generan tokens para simular empleados.

## Despliegues siguientes

El despliegue de estos servicios es manual y separado de la promoción de imágenes del API principal. No desplegar desde la raíz del repositorio con su `railway.json` de REV.

Preparar cada carpeta nueva con `python3 scripts/mirev/prepare.py api --output /private/tmp/mirev-api-NUEVO` o `web`. Desde esa carpeta ejecutar `railway up` indicando explícitamente proyecto, entorno y service ID del registro maestro. Las carpetas generadas usan `deploy/mirev/Dockerfile.api` o `.web` y no contienen `.env`, builds locales ni migraciones de predeploy. Antes de publicar una actualización, sincronizar selectivamente con producción y validar compatibilidad con su esquema real. No promover la rama de staging completa.

El costo es consumo adicional de estos dos servicios dentro del plan Railway existente; aún no se midió un importe propio de MiREV.

## Validación

Builds API y Next.js completos; 12 pruebas de PWA/sesión/GPS, tres pruebas de acceso personal y 20 pruebas de asistencia aprobadas. HTTPS, redirección inicial, metadatos de instalación, endpoints protegidos y CORS comprobados en el dominio público. Evidencia y despliegues en `docs/infrastructure/mirev-produccion-2026-11-17.json`.
