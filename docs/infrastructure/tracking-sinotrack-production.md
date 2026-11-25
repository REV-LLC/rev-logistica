# Seguimiento de flota con SinoTrack y Traccar

Publicación autorizada el 25 de noviembre de 2026 en `/transport/tracking` de REV.
El receptor y el historial siguen en el Traccar oficial de Railway. La interfaz
usa Google Maps con colores suaves, sedes y recorridos GPS; se retiran el código
Routes, la planificación de destinos y los tiempos estimados de llegada.

## Acceso y actualizaciones

Todos los endpoints requieren JWT REV, rol ADMIN/OFFICE y usuario actual activo.
El API abre una sola conexión WebSocket nativa de Traccar por proceso mientras
hay vistas conectadas. La cookie técnica permanece en memoria del backend. SSE
notifica al navegador cambios de dispositivos; el navegador consulta la flota
con su Authorization habitual. No se pasan credenciales de Traccar ni JWT en URL.
El acceso se revalida cada 15 s y al consultar flota, historial o Roads. Al vencer
la sesión o perder permisos se cierra el flujo y se retiran datos de la vista.
Hay reconexión y consultas de respaldo cada 15 s.

La animación une dos mediciones frescas durante 3,5 s; no predice ni aumenta la
frecuencia del equipo. Se desactiva para GPS inválido, datos históricos, saltos
improbables y cortes. Respeta la preferencia de reducir movimiento. La hora del
último mensaje y la del último GPS válido se muestran separadas, junto a ACC.
ACC se debe contrastar físicamente con la llave del camión.

## Historial y recorridos

Se consulta el historial nativo por días dentro de una ventana de 30 días; no se
publica el SQLite de la demo ni se configura una purga de Traccar. Se conservan
los volúmenes actuales y los datos disponibles. Una parada se confirma con 15 min
de reportes estacionarios, no con silencio. Inicio/fin parciales y cortes GPS se
marcan explícitamente. Los recorridos se calculan del GPS original, nunca del
trazado de Google. Un inicio en el borde del período disponible es parcial.

Las tablets retiradas (disabled o atributo revRetired) se excluyen de flota,
puntos conocidos, historial de REV y permisos de sesiones nuevas/renovadas. No
se borran dispositivos ni posiciones nativas. ZNN938 usa el SinoTrack, dispositivo
3, identificador 9210199160; la tablet anterior es dispositivo 1, 78865181.

## Google Roads y límites de consumo

Proyecto Cloud autorizado: rev-logistica, cuenta samuelguerrero1127@gmail.com.
API: roads.googleapis.com. Clave privada exclusiva: REV Fleet Roads server
2026-11-25, ID cc60e6b8-dda5-47be-bbe6-ad43218c61d6, restringida a Roads API.
La clave se guarda solo en TRACKING_ROADS_API_KEY del API Railway/production.
TRACKING_ROADS_ENABLED=true habilita el adaptador. TRACKING_MAP_ENABLED=true y
TRACKING_MAPS_BROWSER_KEY conservan la clave de navegador existente.

El ajuste es manual y procesa hasta 100 puntos válidos de los últimos 15 min del
período seleccionado. Se divide ante huecos superiores a 30 s o 300 m y no ajusta
ruido estacionario. Máximo 10 grupos por acción. El contador roads:fecha en la
tabla TrackingUsage reserva atómicamente cada llamada antes de enviarla. Máximo
100 llamadas/día en America/Bogota compartidas por usuarios y réplicas del API.
Si falla el contador no se llama a Google. Las llamadas fallidas cuentan para el
límite local de manera conservadora.

La geometría de Roads se muestra azul como estimación separada del GPS original;
no cambia distancias, paradas ni registros de Traccar. No se persiste en base,
archivos ni logs. Se rechazan respuestas parciales o ajustes mayores de 100 m.
El proveedor puede inferir una calle incorrecta: no es prueba del camino exacto.

Tarifa pública consultada el 24 de noviembre: 5000 consultas/mes gratuitas para
Roads - Route Traveled; primer tramo posterior USD 10/1000. El límite equivale a
USD 1/día de tarifa base antes de franquicia e impuestos. No garantiza factura
cero ni limita otros productos: Maps conserva su contador separado de 200/día.
No se contrata otro plan de Railway ni otro proveedor de rastreo.

Referencias oficiales:
- https://www.traccar.org/traccar-api/
- https://developers.google.com/maps/documentation/roads/snap
- https://developers.google.com/maps/documentation/roads/policies
- https://developers.google.com/maps/billing-and-pricing/pricing
