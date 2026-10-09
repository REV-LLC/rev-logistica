# Seguimiento de camiones: piloto Traccar

Configurado en Railway el 9 de octubre de 2026. El piloto captura ubicación
fuera del navegador con Traccar Client; REV incorpora un acceso al panel original en `/transport/tracking`.
La vinculación con sesiones de conductores todavía no está implementada.

## Recursos

Proyecto Railway: `rev-logistica` (`bec9984e-3e3a-48c8-9d75-8c87d591b931`).
Entorno: `production` (`72a66cb9-3fc8-4c61-979a-56435cd20e8a`).

| Recurso | Configuración |
| --- | --- |
| Servicio `traccar` | `traccar/traccar:6.16.0-alpine` |
| Servicio `traccar-db` | `postgres:17-alpine`; base y usuario `traccar` |
| Persistencia | Volumen `traccar-db-volume` en `/var/lib/postgresql/data` |
| Directorio PostgreSQL | `/var/lib/postgresql/data/pgdata` |
| Panel/API | https://traccar-production-260b.up.railway.app → puerto 8082 |
| Recepción de tablets | https://traccar-production-da22.up.railway.app → puerto 5055 |

Traccar usa exclusivamente el protocolo `osmand`. La base de datos no tiene
dominio público; la conexión entre servicios usa la red privada de Railway.
El registro automático de dispositivos está desactivado. El registro público
de usuarios está desactivado en la configuración del servidor Traccar.

## Variables de Traccar

Estas variables pertenecen al servicio `traccar`, no al API de REV:

```dotenv
CONFIG_USE_ENVIRONMENT_VARIABLES=true
DATABASE_DRIVER=org.postgresql.Driver
DATABASE_URL=jdbc:postgresql://${{traccar-db.RAILWAY_PRIVATE_DOMAIN}}:5432/traccar
DATABASE_USER=${{traccar-db.POSTGRES_USER}}
DATABASE_PASSWORD=${{traccar-db.POSTGRES_PASSWORD}}
DATABASE_MAXPOOLSIZE=5
PROTOCOLS_ENABLE=osmand
OSMAND_PORT=5055
OSMAND_ADDRESS=0.0.0.0
WEB_PORT=8082
WEB_ADDRESS=0.0.0.0
WEB_SHOWSTACKTRACES=false
DATABASE_REGISTERUNKNOWN=false
LOGGER_CONSOLE=true
SERVER_NETTYBOSSTHREADS=1
SERVER_NETTYTHREADS=2
JAVA_TOOL_OPTIONS=-Xms128m -Xmx512m
```

La cuenta inicial de integración se almacena en las variables privadas
`TRACCAR_INTEGRATION_EMAIL` y `TRACCAR_INTEGRATION_PASSWORD` del servicio.
No copiar valores de contraseñas a Git ni al frontend. Antes de integrar REV,
reemplazar el acceso administrador de integración por una cuenta de lectura
con permisos limitados a los dispositivos necesarios.

## Tablet piloto

- Camión: `ZNN938`.
- Identificador Traccar Client: `78865181`.
- ID de dispositivo en este servidor: `1`.
- Administrador del panel: `sg@revcontractorsllc.com`.
- Servidor en Traccar Client: `https://traccar-production-da22.up.railway.app`.
  Usar HTTPS sin añadir `:5055`: Railway termina TLS en el puerto 443.
- Configuración propuesta: precisión alta, distancia 0, intervalo 60 segundos,
  heartbeat detenido 300 segundos y almacenamiento sin conexión activado.
- Permitir ubicación precisa y uso de batería sin restricciones en Android.

## Validación

El panel/API respondió HTTP 200, el acceso del administrador fue validado y
la tablet quedó registrada. Los dos dominios apuntan a sus respectivos puertos.
El receptor devolvió HTTP 400 a una petición sin identificador ni coordenadas,
lo cual verifica accesibilidad, pero no verifica recepción de posiciones reales.

Para aprobar el piloto:

1. Recibir una posición real y comprobar placa, hora y precisión.
2. Mantener pantalla apagada al menos 15 minutos y comprobar reportes; probar
   también en movimiento, ya que el intervalo detenido es distinto.
3. Interrumpir y recuperar datos móviles; comprobar que los reportes almacenados
   conservan su hora original y que llegan nuevas posiciones después.
4. Verificar batería y recuperación tras reiniciar la tablet.

La frecuencia es un objetivo, no una garantía: Android, GPS y cobertura pueden
introducir retrasos. Una posición almacenada no debe presentarse como actual.
El rastreo del camión no depende de una sesión web; identificar al conductor
requiere una integración posterior explícita.

## Operación

Consultar sin mostrar variables secretas:

```sh
railway service status --service traccar --environment production --json
railway logs --service traccar --environment production --lines 50
railway domain list --service traccar --environment production --json
railway volume --service traccar-db --environment production list --json
```

Los dos servicios generan consumo adicional en Railway. Quedan pendientes la
política de retención del historial y los respaldos. No eliminar el volumen al actualizar las imágenes.

Referencias: [Docker](https://www.traccar.org/docker/),
[configuración del servidor](https://www.traccar.org/configuration-file/),
[configuración del cliente](https://www.traccar.org/client-configuration/).

## Acceso desde REV

`Operación → Seguimiento de camiones` abre la página `/transport/tracking`,
visible para ADMIN y OFFICE. El panel original se muestra dentro de un iframe
en REV. Un enlace secundario permite abrirlo en otra pestaña.
Traccar conserva su sesión nativa, permisos de dispositivos, mapa, WebSocket,
recorridos, exportaciones y reportes. REV establece la sesión automáticamente
mediante el endpoint nativo `/api/session?token=…`. No se copian posiciones a
la base de REV ni se envían contraseñas o credenciales administradoras al frontend.

La dirección pública se puede cambiar con `NEXT_PUBLIC_TRACCAR_WEB_URL` en
Vercel y un nuevo build. El valor por defecto es `https://gps.revcontractorsllc.com`.
Solo se aceptan URLs HTTPS sin credenciales, query ni fragmento. La URL de
recepción de tablets no es la URL del panel.

`POST /tracking/session` requiere JWT REV válido y rol ADMIN/OFFICE. Además
consulta el usuario actual en la base de REV para rechazar cuentas inactivas
o cambios de rol, aunque el JWT anterior siga firmado. El backend crea una
cuenta nativa de lectura por ID de usuario REV (`rev-<id>@rev.invalid`), con
`administrator=false`, `readonly=true`, `deviceReadonly=true` y comandos
limitados. Vincula los dispositivos de la flota mediante la API de permisos.
No reutiliza ni modifica la cuenta administradora humana de Traccar.

Configurar **solo en el servicio API de Railway**:

- `TRACCAR_WEB_URL=https://gps.revcontractorsllc.com` (mismo valor que la web).
- `TRACCAR_INTEGRATION_EMAIL` y `TRACCAR_INTEGRATION_PASSWORD`: credenciales
  privadas del servicio de integración, nunca variables `NEXT_PUBLIC_*`.

El token temporal nunca supera cinco minutos ni la expiración del JWT REV.
Una navegación invisible al endpoint nativo establece su cookie desde el
mismo origen de Traccar, sin cambiar CORS ni SameSite. Después se abre el
panel original. Mientras el mapa está abierto, REV revalida permisos y
renueva el acceso cada dos minutos y al volver a la pestaña. Al salir de REV
o de la página, cesa la renovación; la sesión nativa emitida puede permanecer
válida hasta cinco minutos. No guardar tokens en localStorage, enlaces
compartidos, logs o capturas. El acceso directo externo sigue ofreciendo
el login nativo cuando no hay una sesión vigente.

El panel usa `gps.revcontractorsllc.com` y REV usa
`app.revcontractorsllc.com`: ambos son HTTPS bajo el mismo dominio de sitio.
Así la sesión nativa funciona en el iframe sin relajar la protección de cookies.
No configurar `WEB_SAMESITECOOKIE=None`. El cambio a ese valor fue rechazado
por la revisión automática y no fue aplicado.

### DNS necesario para el panel incrustado

Railway tiene creado el dominio personalizado con destino al puerto 8082.
Registros creados en el DNS autoritativo de GoDaddy:

| Tipo | Nombre | Destino |
| --- | --- | --- |
| CNAME | gps | 41uas181.up.railway.app |
| TXT | _railway-verify.gps | railway-verify=f60ac8cc7b1b7077f972f5a86e3f0b95cb48292828ff0f90fff4e749cc71a7ce |

Después verificar resolución, certificado HTTPS y sesión dentro de REV. No
cambiar la URL de recepción de las tablets. Si existe una variable
`NEXT_PUBLIC_TRACCAR_WEB_URL` anterior en Vercel, actualizarla a
`https://gps.revcontractorsllc.com` y reconstruir el frontend.

La prueba de pantalla apagada fue confirmada por el usuario. La integración
no garantiza conexión GPS: comprobar siempre la hora real del último reporte
que muestra Traccar.
