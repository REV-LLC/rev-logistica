# Estilo del directorio y los perfiles de empleados

Referencia visual aprobada el 19 de octubre de 2026 para el perfil `/employees/:employeeId`, sus pestañas de Nómina, Préstamos y Bitácora, y el directorio `/employees`. El estilo combina un fondo fotográfico oscuro y difuminado con una única superficie de cristal, contenido flotante y controles cómodos en móvil.

Este es el patrón que se debe conservar al ampliar el directorio y el perfil. Su adopción en otros módulos requiere definir el alcance; no convierte toda la aplicación en un tema oscuro ni reemplaza automáticamente las tablas y modales existentes.

## Fondo y superficie de cristal

La fotografía permanece detrás del contenido durante el desplazamiento. El fondo base también es oscuro, incluido el borde del scroll móvil: no deben aparecer zonas blancas al llegar al final, cambiar la altura visible o desplazar la página. Al salir del perfil, se recupera el fondo normal de la aplicación.

El área de gestión utiliza una sola superficie translúcida. Dentro de ella, cifras, calendario, tablas y detalles se presentan directamente sobre el cristal, sin nuevas tarjetas opacas, fondos azules ni acumulación de bordes y sombras. Los separadores sutiles de una tabla sí se conservan cuando ayudan a leer los registros.

| Elemento | Valor actual |
| --- | --- |
| Fondo base | `#101820` |
| Desenfoque de la fotografía | `4px` |
| Oscurecimiento de la fotografía | `rgb(3 12 21 / 72%)` |
| Fondo del área de gestión | Blanco al `6%` |
| Desenfoque del cristal | `18px`, saturación `115%` |
| Borde del cristal | Blanco al `14%`, `1px` |
| Radio del área y de la pestaña activa | `20px` en escritorio, `16px` en móvil |
| Texto principal del área | `#f1f5f9` |
| Texto secundario del área | `#c0ccd8` |

Los conductores usan la imagen de transporte `transport-v1.webp`; operarios y los demás roles usan actualmente `excavator.webp`, también utilizada en login. Las imágenes se sirven con Next Image y formatos optimizados. No se agregan fotografías nuevas ni cargas pesadas para cada pestaña.

### Directorio de empleados

El directorio usa un fondo de marca propio con el logo REV amarillo y plateado sobre una pared oscura. La misma imagen cubre todo el ancho de la pantalla, también detrás del sidebar, para que el cristal desenfoque la fotografía real. El emblema se centra en el área disponible de contenido, sin contar el sidebar ni el encabezado móvil: el encuadre de marca se extiende hacia la derecha por el ancho reservado del menú, mientras la capa visible se recorta al viewport. No se duplica la imagen ni se agrega otro fondo al menú. Hay versiones horizontal y vertical en WebP para mantenerlo completo en distintos tamaños; en móvil no se descarga también la versión horizontal.

Una sola superficie de cristal contiene búsqueda y grid. Las cards conservan fotos, estados, datos y acciones, pero su variante `glass` es transparente, sin tarjetas blancas anidadas. Los separadores son sutiles y los nombres usan peso `600`; la variante predeterminada del componente conserva su apariencia fuera de este contexto. En escritorio se mantienen tres columnas y en móvil una. El título y las acciones del encabezado mantienen sus textos y funciones.

La capa de fondo es compartida con los perfiles. La imagen de marca usa un oscurecimiento del `40%`; los perfiles conservan el `72%`. El color de la página se restaura al navegar a otro módulo. Los archivos, dimensiones y prompts de generación están en [el registro del fondo REV](design-assets/rev-directory-v1.json).

### Sidebar flotante

El menú real conserva sus rutas, buscador, permisos, grupos, estados seleccionados y desplazamiento. Su contenedor compartido en `ResponsiveShell` es un panel de cristal con radio de `24px`, borde blanco al `16%`, blur de `24px` y un margen de `6px` respecto de los bordes superior, izquierdo e inferior. No se reduce el espacio reservado de `284px` para la navegación, por lo que el contenido y el centrado del logo de la página no se desplazan.

Sobre los fondos oscuros marcados con `data-page-background="dark"`, el tinte azul tiene una opacidad del `48%`. En páginas claras se utiliza `84%` para mantener legibles los textos del menú. `Nav` no dibuja un segundo fondo opaco dentro del cristal. En móvil, el panel aparece debajo del encabezado existente, deja `6px` a ambos lados y respeta el área segura inferior; cerrado queda completamente fuera de la pantalla, sin una tira visible. El sidebar no se imprime y respeta movimiento reducido.

### Transición de carga compartida

La navegación utiliza una única `PageLoadingBoundary` montada en `Providers`, no una por sidebar o módulo. `PageLoadingOverlay` desenfoca toda la pantalla, incluido el sidebar, con cristal completamente transparente: no agrega tinte, no altera la saturación ni cambia el fondo de `html` o `body`. Cada página conserva sus propios colores y fondo durante la transición. El logo REV amarillo/plateado y una barra discreta permanecen nítidos encima. El logo de carga se centra en toda la pantalla, sin descontar sidebar ni encabezado: su marco de `156 × 78px` queda reservado desde el primer fotograma y se posiciona con unidades del viewport, independientemente del shell, las fuentes y el contenido. La barra y el texto quedan debajo sin desplazarlo. El emblema decorativo del fondo del Directorio mantiene su propio encuadre en el área de contenido. La salida cambia solo opacidad, sin escalar ni mover el grupo. La entrada aumenta el desenfoque de `0` a `18px` en `220ms`; el loader permanece visible al menos `1000ms` y, al estar listo el destino, reduce el desenfoque de `18` a `0px` en `320ms` y desvanece el logo. La capa se desmonta al terminar, sin cambiar las posiciones de elementos fijos ni dejar filtros activos. Las cargas lentas no agregan otro segundo al resolver los datos. Respeta movimiento reducido (sin transición ni demora visual) y no aparece en la impresión.

El fallback raíz de Next y la validación de sesión participan en esta misma carga. Al pasar del directorio al perfil se conserva hasta resolver la identidad y las imágenes visibles, incluido el fondo. Errores de datos e imágenes deben liberar la capa y mostrar el error de la página; las imágenes tienen un límite de espera de 12 segundos. Se mantienen los límites de seguridad para una navegación cancelada, sin bloquear indefinidamente la pantalla.

El directorio de empleados comparte `EmployeeDirectoryLoading` entre su fallback de ruta, la consulta inicial y la apertura de enlaces antiguos de perfil. Este estado muestra únicamente el fondo de marca y un marcador de carga accesible: no dibuja tarjetas blancas, esqueletos ni un segundo indicador detrás del cristal global. Las cards reales se montan al resolver la consulta.

Los enlaces del menú y de Empleados usan `PageTransitionLink`: conserva el comportamiento de Next para teclas modificadoras, otras pestañas, enlaces externos y clics cancelados. En una navegación interna coordinada, primero se monta el cristal sobre la página anterior y se completa su entrada de `220ms`; solo después se solicita el cambio de ruta. No se interceptan globalmente todos los clics ni se reproducen eventos. `SidebarSearch` comparte esta secuencia mediante `usePageNavigation`. Con movimiento reducido no se añade la espera de entrada.

Para integrar otro flujo, utilizar `PageTransitionLink` o `usePageNavigation` para iniciar la ruta después de la entrada del cristal. Marcar su contenedor de carga inicial con `data-page-loading="true"` y retirarlo o cambiarlo a `"false"` tanto al completar como al fallar la solicitud. Las imágenes `AppImage` y `EmployeeAvatar` ya comunican su carga. Una navegación imperativa puede combinar el coordinador con `useTransition` y el mismo marcador, como `SidebarSearch`. Las operaciones locales (editar un formulario, cambiar pestañas, guardar o filtrar datos) conservan su indicador local: no deben activar la pantalla completa por defecto. El historial del navegador y las rutas aún no integradas conservan la cobertura reactiva existente; no se modifica la API de historial para demorarlos.

## Nómina independiente

La página independiente de Nómina reutiliza el fondo responsive de marca, la tipografía y la superficie de cristal del Directorio. Período, avisos, búsqueda y tabla conviven en una sola superficie; no se agregan tarjetas blancas anidadas. Los encabezados y las columnas no tienen fondos, sombras ni capas de desenfoque propios: solo se conserva el cristal del contenedor general. Toda la tabla se desplaza junta horizontalmente, incluidas las columnas Empleado y Acciones; no se congelan columnas transparentes para evitar que sus letras se superpongan a las demás. En móvil, las filas se separan con líneas discretas y sus datos se organizan en dos columnas. Los cálculos, acciones y comprobantes no cambian; la nómina embebida en el perfil no monta otro fondo de página.

La barra de desplazamiento mantiene una pista transparente y un control oscuro al pasar el cursor o arrastrarlo; no debe heredar el fondo blanco de interacción del tema claro.

## Adopción en Vehículos

`/transport/vehicles` reutiliza la misma superficie y título con el fondo de camiones `transport-v1.webp`, incluida la variante de encuadre `transport`. Indicadores y tabla comparten un único cristal; los indicadores usan la variante opcional `glass` de `StatCard`, sin cambiar su apariencia predeterminada en otros módulos. La tabla y los registros móviles son transparentes y conservan las acciones, ordenación y paginación existentes. El estado inicial de carga comunica su marcador al loader global sin dibujar tarjetas blancas detrás. Formularios, detalles, documentos, mantenimiento y alertas conservan sus modales legibles y su funcionamiento.

## Adopción en Proveedores

`/providers` utiliza el fondo responsive REV del directorio, el título compartido y una sola superficie para indicadores, búsqueda, filtro por estado y lista. Reutiliza la variante `glass` de `StatCard` y `GlassDataTable.module.css`, también usado en Vehículos. Esta clase de tabla se aplica de forma explícita; no vuelve transparentes las tablas de otros módulos ni los modales. Los logos de empresas conservan su presentación de marca y no adoptan el recorte circular de las fotos de empleados. Se mantienen la exclusión de dueños internos, los datos de contacto, las relaciones de bodegas y las acciones existentes.

## Identidad del empleado

- Foto circular, a color, de `200px`, sin un recuadro azul alrededor del encabezado. Su soporte visual permite que crezca hacia arriba sin empujar innecesariamente los datos inferiores.
- La forma circular es obligatoria en miniaturas, perfiles y ampliaciones, no una variante configurable. `EmployeePhotoShape` comparte el recorte circular; los contenedores y tarjetas no deben modificar esa forma.
- Nombre legible con peso `500`, no un título excesivamente grueso. Fuente compartida de la aplicación: Space Grotesk.
- Debajo: documento, teléfono y cargo. Para un conductor, añadir camión y placa con sus nombres legibles.
- En móvil, centrar foto y datos; permitir que nombres largos pasen de línea sin desbordar la pantalla.
- La foto abre el visor compartido: círculo ampliado y nombre debajo sobre el fondo difuminado. Pulsar fuera o Escape cierra el visor. El nombre enlaza al perfil, con subrayado fino y flecha diagonal; la foto no navega por sí sola.

No repetir el nombre y la foto al entrar en cada pestaña. No inventar datos faltantes ni mostrar identificadores internos como sustituto del nombre, documento o descripción de un vehículo.

## Pestañas y movimiento

Nómina, Préstamos y Bitácora comparten una navegación sin línea divisora ni subrayado de selección. La pestaña activa se marca con una burbuja translúcida que tiene el mismo radio que el contenedor principal.

En escritorio, icono y texto van juntos en horizontal. Hasta `48em`, las tres pestañas tienen el mismo ancho, icono arriba, texto centrado debajo y altura mínima de `64px`. Los iconos son distintos: recibo, dinero y calendario.

La burbuja se desplaza en `260ms` y el contenido entra en `220ms` con un movimiento vertical de `6px`. El foco de teclado es visible dentro de la pestaña; tocarla en móvil no debe dejar un segundo contorno exterior. Con `prefers-reduced-motion`, se desactivan las animaciones.

## Contenido y acciones en móvil

Mostrar primero la información útil y después sus acciones. Evitar bloques explicativos permanentes, etiquetas duplicadas y detalles técnicos. Las advertencias deben comunicar una situación real y distinguirse de los errores que bloquean una operación.

### Nómina

Las cifras del perfil se distribuyen en dos columnas en móvil y cuatro en escritorio amplio. Mantener juntos símbolo monetario y valor, sin cortar números entre líneas. Los formularios de modificación e impresión conservan sus validaciones y su comportamiento; el estilo no cambia cálculos ni comprobantes históricos.

### Préstamos

La lista conserva un mínimo visual de cinco filas compactas. Los importes permanecen en una línea, con cifras tabulares. Signo y color respetan la configuración de presentación: positivo verde y negativo rojo, sin cambiar el efecto real de un cargo o un abono sobre la deuda.

En móvil, la descripción aparece en una línea con puntos suspensivos y sin lápiz al lado. Al tocarla, se expande un detalle debajo de la misma fila con la descripción completa, tipo, fecha, valor y la acción «Editar descripción». Se puede volver a cerrar tocando la descripción. La edición no permite modificar el valor ni la fecha.

«Agregar movimiento» aparece debajo de la lista y el saldo. En móvil ocupa todo el ancho, tiene una altura mínima de `48px` y reserva espacio inferior para el asistente flotante y el área segura del dispositivo. No se fija encima de filas ni se duplica arriba y abajo.

### Bitácora

El período se elige con dos selectores independientes: mes y año. Mantener las flechas de navegación y «Hoy». El botón para agregar es únicamente «+», junto a «Hoy», con nombre accesible «Agregar actividad» y las opciones existentes en su menú.

En pantallas de hasta `600px`, los selectores quedan en una fila y las flechas con «Hoy» y «+» en otra. No conservar un segundo botón «Agregar» separado. El formulario usa el día seleccionado y no cambia de empleado al abrirse.

## Accesibilidad y reutilización

Usar componentes Mantine y los controles compartidos de la aplicación. No crear un segundo visor de fotos, otro formulario financiero o una nueva lógica de calendario solo para reproducir el estilo. Los paneles pueden reutilizarse en el perfil y en sus páginas independientes sin duplicar reglas del negocio.

Las descripciones expandibles deben funcionar con toque, Enter y Espacio e indicar su estado con `aria-expanded`. Los botones de solo icono necesitan nombre accesible. Conservar foco visible, cierre y retorno de foco de los modales, estados de carga, errores y acciones deshabilitadas.

El efecto de cristal se limita al directorio y al perfil. Los modales compartidos mantienen su superficie legible; no aplicarles transparencias globales ni cambiar el resto de las pantallas para lograr este efecto.

## Referencias de implementación

| Responsabilidad | Archivo |
| --- | --- |
| Estructura y datos visibles del perfil | [page.tsx](../apps/web/src/app/employees/[employeeId]/page.tsx) |
| Identidad y ámbito visual del perfil | [profile.module.css](../apps/web/src/app/employees/[employeeId]/profile.module.css) |
| Fondo compartido y selección de variante móvil | [EmployeePageBackground.tsx](../apps/web/src/components/EmployeePageBackground.tsx) |
| Fondo REV, cristal y controles del directorio | [directory.module.css](../apps/web/src/app/employees/directory.module.css) |
| Variante transparente de las cards | [EmployeeCard.module.css](../apps/web/src/components/EmployeeCard.module.css) |
| Pestañas y composición de paneles | [EmployeeProfileWorkspace.tsx](../apps/web/src/app/employees/[employeeId]/EmployeeProfileWorkspace.tsx) |
| Cristal, pestañas y adaptación móvil | [workspace.module.css](../apps/web/src/app/employees/[employeeId]/workspace.module.css) |
| Selección del fondo según el rol | [employee-profile.ts](../apps/web/src/lib/employee-profile.ts) |
| Visor reutilizable de foto | [ProfilePhotoLightbox.tsx](../apps/web/src/components/ProfilePhotoLightbox.tsx) |
| Presentación de nómina | [EmployeePayrollPanel.tsx](../apps/web/src/app/employees/payroll/EmployeePayrollPanel.tsx) |
| Lista y expansión de préstamos | [EmployeeLoansPanel.tsx](../apps/web/src/app/employees/[employeeId]/loans/EmployeeLoansPanel.tsx) |
| Controles y calendario de bitácora | [EmployeeActivitiesPanel.tsx](../apps/web/src/app/employees/activities/EmployeeActivitiesPanel.tsx) |

## Revisión antes de aceptar cambios visuales

- Comprobar escritorio y móviles de `320px` y `390px`: sin desbordamiento de página, importes partidos ni acciones tapadas.
- Desplazar el perfil hasta abajo y variar la altura visible: el fondo sigue oscuro; al salir, la página siguiente recupera su fondo normal.
- Cambiar las tres pestañas con toque y teclado. Revisar la burbuja, el foco y la preferencia de movimiento reducido.
- Abrir y cerrar la foto, el detalle del préstamo y los formularios sin perder el contexto del empleado.
- Revisar textos largos y datos faltantes, y confirmar que las acciones financieras mantienen sus límites originales.
- Usar capturas sin datos personales reales en la documentación compartida. No publicar fotografías, documentos, salarios o préstamos de producción como ejemplos del estilo.
