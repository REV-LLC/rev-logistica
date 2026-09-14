# Asistente Office

Chat en `/office-assistant`, disponible para `OFFICE` y `ADMIN`, conectado a PostgreSQL mediante un usuario independiente de solo lectura. Usa la API de OpenAI desde el servidor para interpretar preguntas y redactar respuestas respaldadas por consultas reales. Los computadores de Office solo necesitan acceder a la aplicación web; no ejecutan un modelo local.

## Configuración

Variables del servidor (`apps/api/.env`, nunca en `NEXT_PUBLIC_*`):

- `OPENAI_API_KEY`: clave de proyecto con acceso a la API y facturación disponible. No enviarla al navegador ni guardarla en Git.
- `OFFICE_ASSISTANT_MODEL`: modelo de OpenAI; por defecto `gpt-5.4-mini`.
- `OFFICE_ASSISTANT_DATABASE_URL`: conexión al mismo PostgreSQL como `rev_office_reader`. Obligatoria: no se usa `DATABASE_URL` como alternativa.

Preparar las vistas y la credencial local:

```sh
npm --workspace apps/api run setup:office-assistant
```

Este comando usa la conexión administrativa `DATABASE_URL` únicamente durante la instalación. Crea `rev_office`, doce vistas con columnas explícitas y el login `rev_office_reader`; no cambia registros de negocio. Genera la contraseña sin imprimirla y agrega la conexión de lectura a `apps/api/.env` (archivo no versionado). Una segunda ejecución reutiliza la credencial configurada; no rota claves existentes. Requiere permiso de creación de roles y vistas. No ejecutarlo en una base distinta de la que se desea consultar.

Para otro entorno, ejecutar la misma instalación con su administrador de base y guardar `OFFICE_ASSISTANT_DATABASE_URL` como secreto del API en ese entorno. El despliegue no ejecuta la instalación automáticamente. Reiniciar el API tras configurar variables. No basta desplegar el frontend.

Las vistas admiten instalaciones anteriores a `Owner.category`, `StockLedger.effectiveAt` e `isOpeningBalance`, con las mismas derivaciones base de sus migraciones (tipo OWN para dueño interno; fecha del documento o registro; apertura no identificada cuando la columna no existe). Esto permite consultar la base local sin migrar sus datos. Para análisis cronológico definitivo usar una base con todas sus migraciones aplicadas y volver a ejecutar la instalación al cambiar las proyecciones.

## Alcance y reglas

- Artículos BULK y SERIAL, familias, variantes, dimensiones y tarifas.
- Saldos por obra/cliente, bodega física y propietario. `INTERNAL` identifica propiedad interna; una bodega propia puede contener equipos ajenos.
- Activos individuales, códigos, seriales, marca, horómetro y último tipo de movimiento.
- Clientes, obras, vínculos cliente/obra, dueños/proveedores y tarifas de proveedores.
- Movimientos y documentos, con estado y fechas, para agregaciones e históricos.

En obra significa pendiente de devolución física, no necesariamente facturación activa. Los saldos siguen las ecuaciones del módulo de inventario: OUT invierte el signo; ON_SITE suma; IN/TRANSIT descuentan de obra. Bodega suma todos sus movimientos y resta reservas ON_SITE del propietario. Un saldo SERIAL diferente de uno es una anomalía; los negativos BULK deben reportarse aparte. No mezclar unidades heterogéneas ni contar filas como unidades. La vista de saldos cubre bodegas y obras; no es un total de material en tránsito. Las tarifas no equivalen a ingresos reales.

Ejemplos:

- ¿Dónde están todos los tornillos niveladores de REV?
- ¿Cuántos tornillos hay en obra? Desglosa por referencia y propietario.
- ¿Cuáles obras tienen este artículo y a qué clientes pertenecen?
- ¿Qué activos de proveedores tenemos en nuestras bodegas?
- ¿Qué devoluciones se registraron durante agosto para este cliente?

## Límites y protección

El modelo solo tiene una herramienta de consulta. PostgreSQL deniega escrituras; cada llamada además verifica permisos y usa `BEGIN READ ONLY`. El parser acepta un subconjunto de SELECT y UNION sobre las vistas autorizadas, con funciones permitidas y conversiones básicas. No admite SQL arbitrario, WITH, funciones de usuario, acceso a tablas del sistema, contraseñas, tokens ni datos de configuración. Se ejecuta el SQL regenerado a partir del árbol validado.

Máximo 8 intentos de consulta por pregunta, 5 segundos por consulta, 200 filas, 24 columnas y 64 KB por fuente; 90 segundos por respuesta. Los totales se agregan antes del límite y los resultados parciales se marcan. Máximo una pregunta activa por usuario y cuatro simultáneas por proceso. La ruta del chat limita solicitudes; el acceso requiere JWT y rol OFFICE/ADMIN.

OpenAI recibe la pregunta, contexto reciente, esquema de las vistas y resultados necesarios (por ejemplo, nombres de artículos, cantidades, obras, bodegas, clientes y proveedores). No se copia la base completa. El usuario autorizó esta modalidad. La interfaz informa de este procesamiento. Las trazas del SDK están desactivadas y las solicitudes Responses usan `store: false`; esto no constituye una garantía de retención cero por parte del proveedor. Cada consulta consume API y requiere Internet. La conexión usa explícitamente `https://api.openai.com/v1`; no hay cambio automático a un motor local.

No se envía la conexión de base ni su contraseña al modelo. Los logs guardan usuario, cantidad de consultas y duración, no textos ni resultados. El historial vive en memoria de la página y se pierde al recargar; no se comparte entre usuarios. Para limitar memoria se conservan hasta seis mensajes recientes (2000 caracteres cada uno) y 32000 caracteres de filas de evidencia por respuesta; el modelo recibe una marca de parcialidad al alcanzar ese presupuesto. La interfaz conserva las fuentes obtenidas completas dentro de su propio límite. Se vuelve a consultar la base al responder; el historial enviado por el navegador no se acepta como evidencia.

## Despliegue

Producción usa Railway para el API/PostgreSQL y Vercel para la web. Las vistas y el usuario de lectura se configuran por entorno antes de desplegar el código; las tres variables anteriores son secretos exclusivos del API. Comprobar permisos y una pregunta real después del despliegue. Las credenciales locales no sustituyen a las de producción.

El modo elegido es OpenAI: no requiere Ollama, GPU, un servidor de IA en las torres ni puertos adicionales en la oficina.

## Verificación

```sh
npm --workspace apps/api test -- --runInBand office-assistant
npm --workspace apps/api run build
npm --workspace apps/web exec tsc -- --noEmit
npm --workspace apps/api run smoke:office-assistant
# Envía una pregunta y los resultados necesarios a OpenAI (consume API):
npm --workspace apps/api run smoke:office-assistant -- --live
```

La prueba local comprueba lectura, denegación de lectura de contraseñas y denegación de escrituras incluso con `BEGIN READ WRITE` (los intentos usan `WHERE false`; no alteran filas). La prueba `--live` además necesita la clave de OpenAI y acceso a Internet. Si falla el proveedor o la conexión, el chat muestra un error, no estadísticas inventadas. Las pruebas unitarias usan respuestas ficticias interceptadas en memoria; no requieren un modelo ni envían datos a Internet.
