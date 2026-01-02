# 05 — Estados de Inventario y Transiciones

Este documento define los **estados posibles del inventario** y las **transiciones válidas** entre ellos.  
El objetivo es garantizar **control, trazabilidad y prevención de errores o fraudes**, especialmente en inventario por cantidad (BULK).

---

## Tipos de control de inventario

### 1) SERIAL (por unidad)
- Máquinas con identificador único (motor, serial).
- Se controlan **una a una**.

### 2) BULK (por cantidad)
- Equipos sin identificador único (gatos, puntales, andamios).
- Se controlan por **SKU + cantidad**.
- Requieren doble confirmación (PICKUP vs RECEIPT).

---

## Estados de Inventario

### AVAILABLE
- El ítem está en bodega.
- Disponible para entrega.
- Estado inicial al ingresar al sistema o tras una recepción exitosa.

---

### RENTED
- El ítem está en cliente/obra.
- Se genera por un documento **DELIVERY**.
- No está disponible para otras obras.

---

### IN_TRANSIT
- El ítem fue recogido en obra (**PICKUP**).
- Aún no ha sido recibido por ninguna bodega.
- Estado **temporal y crítico**.

---

### MISSING
- El ítem no fue recibido según lo esperado.
- Existe una discrepancia abierta.
- Requiere resolución manual (investigación).

---

### MAINTENANCE
- El ítem está fuera de servicio.
- No puede ser entregado ni considerado disponible.

---

## Transiciones Válidas (reglas estrictas)

### DELIVERY

- Documento: DELIVERY
- Actor: Oficina / Bodega
- Movimiento ledger: OUT

---

### PICKUP (Recolección)

- Documento: PICKUP
- Actor: Conductor
- Movimiento ledger: TRANSIT
- ❌ No se permite AVAILABLE → IN_TRANSIT

---

### RECEIPT (Recepción)

- Documento: RECEIPT
- Actor: Bodega / Oficina
- Movimiento ledger: IN
- La bodega destino puede diferir de la bodega propietaria.

---

### DISCREPANCY (Faltantes)

- Se activa automáticamente cuando:
  - Cantidad recibida < cantidad recogida.
  - Ítem no aparece tras recepción.
- No puede resolverse sin acción humana.

---

### MAINTENANCE

- Documento interno (no operativo).
- Actor: Oficina / Admin.

---

## Transiciones NO permitidas
- ❌ RENTED → AVAILABLE (sin PICKUP + RECEIPT).
- ❌ IN_TRANSIT → RENTED.
- ❌ PICKUP directo a AVAILABLE.
- ❌ Cambiar estado sin documento asociado.
- ❌ Modificar inventario sin ledger.

---

## Estados por tipo de control

### SERIAL (máquinas)
- Cada máquina tiene su propio estado.
- No existen cantidades parciales.
- Ejemplo:
  - Excavadora X → IN_TRANSIT → AVAILABLE

### BULK (cantidades)
- El estado aplica a la **cantidad**.
- Una misma SKU puede estar:
  - parcialmente AVAILABLE
  - parcialmente IN_TRANSIT
  - parcialmente MISSING

Ejemplo:
- Gato 20T:
  - 10 AVAILABLE
  - 2 IN_TRANSIT
  - 1 MISSING

---

## Reglas de seguridad (hard rules)

1. **El conductor nunca finaliza devoluciones**
   - Solo puede mover a IN_TRANSIT.

2. **Toda devolución requiere RECEIPT**
   - Sin recepción, no hay AVAILABLE.

3. **Las discrepancias no se silencian**
   - Siempre visibles hasta resolución.

4. **Todo cambio genera ledger**
   - No existe “ajuste invisible”.

---

## Estados visibles en UI (MVP)

### Tablet (Conductor)
- RENTED
- IN_TRANSIT

### Backoffice / Bodega
- AVAILABLE
- RENTED
- IN_TRANSIT
- MISSING
- MAINTENANCE

---

## Consideraciones futuras (fuera del MVP)
- Alertas automáticas por tiempo excesivo en IN_TRANSIT.
- Penalizaciones o reportes por conductor.
- Integración GPS para validar rutas/tiempos.
- SLA por bodega aliada.

---

## Definición de éxito
El sistema se considera correcto cuando:
- Ningún ítem puede volver a AVAILABLE sin RECEIPT.
- Todo faltante queda visible como MISSING.
- El inventario refleja la realidad física, no la confianza.
