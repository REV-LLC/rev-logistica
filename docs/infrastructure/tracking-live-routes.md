# Seguimiento operativo y rutas con tráfico

## Diseño de implementación

Un único mapa Google Maps JavaScript, montado una vez y actualizado por capas.
Traccar sigue siendo el receptor y archivo de posiciones: no se duplica el
historial ni se modifican sus tablets o su frontend. Se conserva el panel
nativo como acceso avanzado y alternativa ante fallos de carga del mapa.

La vista consulta `/tracking/fleet` cada 5 segundos mientras es visible.
El backend comparte la lectura durante 3 segundos entre visitantes; cada
petición revalida el usuario activo ADMIN/OFFICE antes de consultar la caché.
Los reportes conservan sus timestamps GPS y de recepción; nunca se toma un
heartbeat reciente como prueba de una ubicación nueva. Tras un fallo se
mantienen los últimos datos, marcados como pendientes de actualización.

El mapa muestra camiones, sedes nativas, recorrido GPS real (línea continua)
y ruta prevista de Google (línea discontinua). Coordenadas WGS84, latitud y
longitud con nombres explícitos. Los indicadores mantienen tamaño en pantalla,
con anclas en la coordenada exacta para las sedes desplazadas. No hay posiciones
simuladas ni extrapolación. El recorrido se ordena, deduplica y deja huecos
tras cortes de más de 10 minutos o saltos GPS inverosímiles. Máximo 24 horas y
12.000 reportes por consulta. El móvil presenta primero mapa y selección,
con detalles y controles plegables; zoom y seguimiento se controlan explícitamente.

Se conserva el camión seleccionado mediante `?truck=<id>`. Elegir un camión
cambia las capas; las actualizaciones no reemplazan filtros ni recentran un
mapa que el usuario movió. La ruta se recalcula al pulsar el botón, no por cada
reporte. El origen procede del servidor y exige GPS de los últimos 5 minutos.
No se guardan resultados de Google en base de datos. La ruta DRIVE es orientativa:
no verifica dimensiones, peso ni restricciones particulares de cada camión.

## Configuración y consumo

Solo API REV, no MiREV ni staging de asistencia:

- `TRACKING_ROUTES_ENABLED=true` después de configurar y probar las claves.
- `TRACKING_ROUTES_API_KEY`: clave privada restringida a Routes API.
- `TRACKING_MAPS_BROWSER_KEY`: clave de navegador restringida a Maps JavaScript
  API y al origen `https://app.revcontractorsllc.com/*`.
- `TRACKING_ROUTES_DAILY_LIMIT`: por defecto 100, máximo 100 en esta versión.
- `TRACKING_MAPS_DAILY_LIMIT`: por defecto 200, máximo 200 en esta versión.

Los límites se reservan atómicamente en `TrackingUsage`, por día de Colombia;
son compartidos entre usuarios/réplicas y sobreviven reinicios. Un intento
fallido consume reserva porque el proveedor podría haberlo facturado.
Al agotarse el cupo no se interrumpe la recepción GPS ni el panel nativo.
El contador limita las solicitudes generadas por REV; las restricciones y
cuotas del proyecto Google deben configurarse también contra uso externo.
No introducir una clave privada del backend en código ni en variables NEXT_PUBLIC.

La cuenta/proyecto es Google Cloud REV del registro maestro, no Google MIA.
Comprobar restricciones y APIs habilitadas antes de activar el servicio.
Según tarifas consultadas 2026-11-18, Compute Routes Pro incluye 5.000 solicitudes
mensuales y Dynamic Maps 10.000 cargas: 100 rutas/día son como máximo 3.100/mes y
200 mapas/día 6.200/mes. Es un presupuesto de uso, no garantía de factura cero:
los cupos gratuitos pueden compartirse y las tarifas cambiar. Verificar la cuenta
pagadora y alertas. Los servicios no deben activarse automáticamente en otros entornos.

Fuentes: https://developers.google.com/maps/documentation/routes/policies
https://developers.google.com/maps/billing-and-pricing/pricing
https://www.traccar.org/client-configuration/

Para mejorar la cadencia real, configurar las tablets (o su MDM): intervalo
30 s, distancia 0, heartbeat detenido 300 s, ubicación precisa siempre y batería
sin restricciones. Android y la cobertura pueden retrasar reportes; mostrar
siempre su edad. REV no puede modificar esos permisos desde una página web.

## Verificación prevista

API: autorización revocada, GPS viejo/futuro/inválido, batería ausente, caché
compartida, orden y huecos del recorrido, fechas inválidas, límites atómicos,
fallos del proveedor sanitizados y origen calculado en servidor.
Web: selección, seguimiento, historial, destino sede/dirección, ETA con tráfico,
recálculo manual, GPS viejo, desconexión, cupo agotado, permisos, móvil y panel
nativo. Usar datos ficticios para pruebas de movimiento y Google simulado;
activar y verificar el proveedor real solo en la cuenta autorizada.

## Evidencia local de esta implementación

- API y Web compilan con la versión fijada del proyecto.
- 45 pruebas de tracking pasan: sesiones y puntos previos, telemetría, historial,
  permisos, destinos, errores y cuotas.
- PostgreSQL 16 local desechable: 40 peticiones simultáneas desde dos instancias
  con cupo 3 permiten exactamente 3 y rechazan 37 con 429; contador persiste al
  recrear los clientes. El SQL usado es el de la migración de producción.
- Escritorio 1440x1100 y móvil 390x844 con Chrome de perfil temporal, API y SDK
  de Google simulados: selección por marcador, URL, historial, ruta, ETA, cupo
  agotado, reconexión sin desmontar el mapa y revocación que limpia ubicaciones.
- Sin errores JavaScript relevantes, sin desbordamiento horizontal. Se corrigió
  que la marca de sede interceptara clics en un camión estacionado.
- La prueba visual es simulada; Google real y la cadencia de las tablets deben
  validarse tras activar las APIs/claves y ajustar el intervalo del cliente.
- Browser plugin no disponible; QA local usa Playwright con Chrome instalado y
  perfil temporal. Computer Use se usa para la consola Google del usuario.
