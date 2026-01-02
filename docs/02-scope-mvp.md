# 02 — Scope MVP (Fase 1)

## Objetivo del MVP
Eliminar el papel y los errores humanos en **entregas, recolecciones y devoluciones**, logrando:
- Documentos digitales con consecutivos.
- Catálogo estandarizado (sin nombres libres).
- Inventario confiable con estados (sin “devolver” hasta que bodega reciba).
- Control de inventario mixto: **propio** y de **bodegas aliadas** (ej. Vereal).

El MVP debe funcionar con tablets en camiones y un backoffice en oficina/bodega.

---

## Principios clave del diseño
1. **Tablets NO cierran devoluciones**  
   El conductor registra **PICKUP (recolección)** → estado **IN_TRANSIT**.  
   La devolución final ocurre solo con **RECEIPT (recepción en bodega)**.

2. **Catálogo estandarizado**  
   No se permite texto libre para nombrar equipos en documentos operativos.  
   Se selecciona desde un catálogo (SKU).

3. **Dos tipos de inventario**
   - **SERIAL (por unidad)**: Máquinas con identificador único (motor/serial).
   - **BULK (por cantidad)**: Equipos tipo gatos, puntales, marcos, etc. (conteo).

4. **Inventario por movimientos (ledger)**
   El inventario se define por movimientos y estados; no por “editar cantidades” sin trazabilidad.

---

## Dentro del MVP (IN SCOPE)

### A) Usuarios, roles y seguridad
- Login básico.
- Roles:
  - **DRIVER** (conductor): crea PICKUP, consulta sus documentos.
  - **OFFICE/WAREHOUSE** (oficina/bodega): crea RECEIPT, crea DELIVERY, maneja discrepancias.
  - **ADMIN**: configura, anula con auditoría.
- Auditoría mínima: quién creó/confirmó, fecha/hora.

### B) Catálogo de ítems (SKU)
- CRUD básico de SKUs:
  - nombre estandarizado
  - categoría
  - unidad de medida
  - tipo de control: **BULK** o **SERIAL**
- Catálogo de **máquinas** (SERIAL) con su identificador único (motor/serial).

### C) Bodegas (propias y aliadas)
- CRUD básico de bodegas:
  - tipo: **OWN** o **ALLY**
  - activas/inactivas
- Relación de ítems con bodega propietaria (para control interno).

### D) Clientes y obras
- CRUD básico de clientes.
- CRUD básico de obras/proyectos (ligados al cliente).

### E) Documentos (con consecutivo)
Se implementan 3 tipos de documento:

#### 1) DELIVERY (entrega a cliente)
- Se crea desde oficina/bodega (o tablet si se necesita).
- Selección de ítems:
  - BULK: SKU + cantidad
  - SERIAL: máquina por unidad
- Consecutivo automático.
- Evidencia opcional: firma/fotos.
- Cambios de estado:
  - pasa a “EN CLIENTE / RENTED” o equivalente.

#### 2) PICKUP (recolección en obra)
- Se crea desde tablet por el conductor.
- Contiene ítems recogidos:
  - BULK: SKU + cantidad
  - SERIAL: máquinas seleccionadas
- Consecutivo automático.
- Resultado:
  - Ítems quedan **IN_TRANSIT** (en tránsito).
  - No se consideran “devueltos” aún.

#### 3) RECEIPT (recepción en bodega)
- Se crea desde bodega/oficina.
- Se asocia a un PICKUP o se crea como recepción directa (opcional).
- Confirmación de lo recibido realmente:
  - BULK: SKU + cantidad recibida
  - SERIAL: máquinas recibidas
- Resultado:
  - Ítems recibidos pasan a **IN_WAREHOUSE** (bodega correspondiente).

### F) Discrepancias (faltantes, sobrantes, bodega equivocada)
- Si RECEIPT no coincide con PICKUP:
  - Se crea una discrepancia automáticamente:
    - faltante (recogido > recibido)
    - sobrante (recibido > recogido)
    - recibido en bodega distinta a la esperada (si aplica)
- Estados de faltantes:
  - permanecen como **IN_TRANSIT** y/o pasan a **MISSING** según regla de negocio.
- Resolución:
  - cierre manual por OFFICE/ADMIN con motivo y auditoría.

### G) Inventario y consultas
- Vista de inventario por:
  - bodega (own/ally)
  - estado (AVAILABLE, RENTED, IN_TRANSIT, MISSING, MAINTENANCE)
- Historial por:
  - obra
  - cliente
  - documento (consecutivo)
  - SKU
  - máquina (SERIAL)

### H) Evidencias (mínimas)
- Adjuntar fotos/firma opcional a documentos (PICKUP/DELIVERY/RECEIPT).
- Guardar metadata (quién, cuándo).

---

## Fuera del MVP (OUT OF SCOPE)
No se construye en fase 1:

- Integración GPS (camiones / telemetría).
- Facturación y anexos quincenales (tablas dinámicas).
- Módulo de modular andamios y formaleta.
- Reportes avanzados (BI).
- Multi-empresa completa o portal para bodegas aliadas (por ahora es interno).
- Optimización avanzada offline-first (solo soporte básico si aplica).
- Integración completa con Cervino (solo se considera export/import temporal si se necesita).

---

## Criterios de “MVP listo”
El MVP se considera listo cuando:

1. Un conductor puede crear un **PICKUP** desde tablet en menos de 2 minutos.
2. Bodega puede crear un **RECEIPT** y confirmar lo que llegó.
3. El inventario NO marca devuelto si no hubo recepción.
4. Si faltan ítems, se crea discrepancia y queda visible (alerta/lista).
5. Oficina puede ver historial y estado de inventario por obra/cliente.
6. Consecutivos son únicos y auditables.

---

## Notas operativas (realidad del negocio)
- Para BULK (cantidades), el sistema depende de conteo y doble confirmación (pickup vs receipt).
- El control por bodegas aliadas debe existir desde el MVP para evitar “mezclar” propiedad de equipos.
- El sistema debe evitar nombres libres; el catálogo es obligatorio.
