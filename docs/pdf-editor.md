# Editor de texto PDF

Acceso: **Herramientas → Editor de PDF**, `/tools/pdf-editor`, para ADMIN y OFFICE.

Orientado a corregir cotizaciones, certificados y otros PDF generados por sistemas. La edición de imágenes se ha retirado; las imágenes existentes permanecen en el documento.

1. Abrir un PDF de hasta 15 MB y elegir la página.
2. Seleccionar el texto sobre el documento o en la lista; el panel muestra fuente, tamaño, espaciado entre caracteres/palabras, escala horizontal y número de ajustes de kerning.
3. Cambiar el texto y aplicar. Revisar con el zoom y con **Comparar con original**.
4. Descargar la copia. Se pueden deshacer los últimos cinco cambios de la sesión.

## Fidelidad

- Se reutilizan el recurso tipográfico y los códigos de caracteres originales. Nunca se incrustan fuentes de reemplazo ni se reduce el tamaño o la escala para hacer caber una modificación.
- Soporta fuentes estándar y fuentes incrustadas con un mapa `ToUnicode` compatible, incluidas fuentes Type0 `Identity-H` usadas por generadores de documentos. Una fuente incrustada parcialmente solo permite reutilizar los caracteres que contiene su mapa.
- Conserva las matrices de posición, el color, tamaño, espaciados `Tc`/`Tw`, escala `Tz`, elevación y ajustes `TJ` del texto no modificado. Si la sustitución tiene la misma cantidad de glifos, conserva también los ajustes de kerning por posición del tramo modificado; para otra longitud, los nuevos caracteres usan los parámetros de espaciado de la línea, sin inventar nuevos pares de kerning.
- Las palabras sin cambios y los operadores de texto siguientes mantienen su posición. Un sufijo coincidente dentro de una palabra que cambió se trata como parte de esa palabra para evitar espacios artificiales.
- Una sustitución que excede el ancho disponible del tramo original en más de 0,25 pt se rechaza. No se comprime el texto ni se desplazan otros elementos. Un texto más corto puede dejar espacio libre antes de la siguiente palabra sin cambios.
- Los flujos de contenido se copian al editar para no alterar otra página que comparta el mismo flujo. Los recursos de fuentes y sus programas incrustados permanecen intactos.

No se garantiza compatibilidad universal. Los elementos no compatibles se muestran como solo lectura: fuentes Type3, codificaciones verticales/no compatibles, fuentes sin mapeo fiable, texto oculto o usado para recorte. No incluye OCR, edición de trazos ni reflujo de párrafos. Se rechazan saltos de línea en los reemplazos. Los PDF protegidos deben abrirse primero en una copia sin contraseña.

La selección agrupa cada operación original de texto, por lo que un fragmento puede ser una palabra o una línea según el generador del PDF. PDF.js renderiza tanto el documento actual como el original con la tipografía real del archivo; el área de entrada del panel sirve para escribir y no pretende simular esa fuente.

## Arquitectura

Usa `ts-pdf-edit` **0.1.2** (MIT) para lectura/guardado y PDF.js (Apache-2.0) para visualización. No requiere claves ni servicios de pago. `pdf-content-adapter.mts` utiliza módulos internos de la versión fijada para interpretar los operadores y sus métricas; implementa su propio reemplazo fiel en lugar de la sustitución de fuentes o la normalización destructiva de `TJ` del motor. No actualizar la dependencia sin ejecutar las pruebas visuales. Recorre Form XObjects anidados, con su matriz y sus recursos; al editar clona solamente la cadena de la aparición seleccionada y conserva sus grupos de transparencia. Las apariciones repetidas del mismo bloque y otras páginas no se modifican. Recupera también los espacios que el generador representó mediante desplazamientos `TJ`, sin insertar glifos inexistentes.

Los archivos se envían a la API de REV para procesarlos en memoria. El editor no los guarda en disco, base de datos ni almacenamiento externo. La sesión se pierde al salir; descargar los cambios antes de navegar a otra pantalla.

## API

- `POST /pdf-editor/inspect`: multipart con `pdf` y `page` (desde cero). Devuelve páginas y fragmentos con propiedades tipográficas, zona de selección y compatibilidad.
- `POST /pdf-editor/edit`: multipart con `pdf`, `page`, `kind=text`, `index`, `original` y `replacement`. Devuelve PDF en base64 y datos de la tipografía conservada. La edición de imágenes se rechaza.

Ambas rutas validan JWT y roles ADMIN/OFFICE, limitan la carga a 15 MB y responden con `Cache-Control: no-store`.

## Verificación

```sh
npm --workspace apps/api run test:pdf-editor
npx tsc --noEmit -p apps/web/tsconfig.json
```

Doce pruebas verifican texto tras guardar/reabrir, segunda edición, permisos HTTP, rechazo de desbordamiento/caracteres ausentes, propiedades tipográficas, reutilización de una fuente incrustada sin cambiar su programa, páginas con flujos compartidos , bloques Form anidados y compartidos, espacios representados por desplazamientos, y los operadores de salto de línea `'`/`"`.

La comprobación visual renderiza antes y después con PDF.js 5, independiente de la extracción con PDF.js 4 del motor, y exige **cero píxeles diferentes fuera de la zona editada** en los documentos de prueba. Esto verifica esos ejemplos concretos; no implica que todos los PDF existentes sean compatibles. Las pruebas necesitan las dependencias opcionales de renderizado (`@napi-rs/canvas`) instaladas; no necesitan base de datos.
