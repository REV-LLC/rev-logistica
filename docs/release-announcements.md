# Aviso de actualización

Antes de publicar en producción, edita `apps/web/UPDATE.md` e incluye ese archivo
en el mismo commit que la actualización.

Formato: primera línea `# Título`, seguida de párrafos de texto separados por una
línea vacía. El modal siempre se llama **Actualización**. El contenido se muestra
como texto, sin ejecutar HTML; los párrafos no procesan enlaces ni Markdown avanzado.

El texto actual anuncia el control de préstamos para colaboradores.

- Un mensaje distinto genera automáticamente un identificador nuevo.
- Volver a desplegar el mismo mensaje no repite el aviso.
- Deja `UPDATE.md` vacío para desactivar el aviso.
- Solo se publica cuando `NEXT_PUBLIC_DEPLOYMENT_ENV=production`; si esa variable
  no está definida, se usa `VERCEL_ENV=production`. En proyectos de Vercel
  separados para dev y producción, configura `NEXT_PUBLIC_DEPLOYMENT_ENV=dev`
  en el proyecto de dev, aunque Vercel llame “Production” a su despliegue.
- Cada usuario autenticado lo recibe hasta confirmar con **Entendido** o cerrar.
  La confirmación se guarda en la base de datos por usuario y mensaje, por lo que
  persiste entre dispositivos y navegadores. No se muestra en el login.
- Las sesiones abiertas consultan novedades al recuperar el foco y cada cinco
  minutos mientras la pestaña está visible. Una pestaña con una versión anterior
  a la implementación de este mecanismo necesita recargarse una primera vez.
- El aviso aparece después de que el despliegue esté disponible, no al hacer el
  push si el build falla. Publicar este archivo no realiza el push automáticamente.

Aplicar la migración `20260921140000_release_acknowledgements` y desplegar la API
antes o junto con la web. Si el servicio no está disponible, el aviso reintenta
sin bloquear la carga de la aplicación.

Validación local: probar el endpoint de contenido con `NEXT_PUBLIC_DEPLOYMENT_ENV=production`
y una sesión autenticada. El bypass de autenticación está deshabilitado en ese entorno.
