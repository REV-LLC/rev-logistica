# 04 — Flujos Operativos (MVP)

Este documento describe **cómo se usa el sistema en la operación real**, paso a paso.  
Define qué hace cada actor, qué documento se crea y **cómo cambian los estados del inventario**.

---

## Actores
- **Conductor (Tablet)**: registra eventos en campo.
- **Bodega / Oficina**: valida físicamente y cierra procesos.
- **Admin**: supervisa y resuelve excepciones.

---

## Tipos de Documento
- **DELIVERY**: Entrega de equipos a cliente/obra.
- **PICKUP**: Recolección en obra (no es devolución final).
- **RECEIPT**: Recepción en bodega (cierre de devolución).
- **DISCREPANCY**: Diferencias entre PICKUP y RECEIPT (automático).

---

## Estados de Inventario (resumen)
- **AVAILABLE**: En bodega y disponible.
- **RENTED**: En cliente/obra.
- **IN_TRANSIT**: Recogido, aún no recibido en bodega.
- **MISSING**: Faltante con discrepancia abierta.
- **MAINTENANCE**: Fuera de servicio.

---

# Entrega/Recogida Fallida (FAILED)

En operación real puede ocurrir que una entrega o recogida no se complete (cliente no está, no autoriza ingreso, obra cerrada, etc.).  
En estos casos el sistema debe registrar el intento sin alterar inventario indebidamente.

## Reglas
1. Todo intento genera un documento con consecutivo.
2. Si no se completa, el documento queda en estado **FAILED** y NO se elimina.
3. Un documento FAILED no puede “reutilizarse”: cualquier reintento crea un nuevo documento con nuevo consecutivo.
4. El reintento puede enlazarse con `retry_of_document_id` para trazabilidad.
5. Si la culpa es del cliente, se marca para cobro de **entrega fallida**.

## Campos mínimos en el documento
- status: FAILED
- failed_reason: texto (motivo)
- failed_responsibility: CUSTOMER | COMPANY | FORCE_MAJEURE
- failed_fee_applicable: true/false
- evidencia opcional: fotos/nota/firma

## Inventario
- DELIVERY FAILED: no debe generar movimientos OUT (inventario queda como estaba).
- PICKUP FAILED: no debe generar movimientos TRANSIT (no se recogió nada).

# 1) Flujo DELIVERY — Entrega a Cliente

### Actor
Bodega / Oficina

### Pasos
1. Crear documento **DELIVERY**.
2. Seleccionar:
   - Cliente
   - Obra
   - Ítems:
     - BULK: SKU + cantidad
     - SERIAL: máquina por unidad
3. (Opcional) Adjuntar firma/fotos.
4. Confirmar documento.

### Resultado
- Consecutivo generado.
- Inventario:
  - AVAILABLE → RENTED
- Ledger:
  - Movimiento OUT desde bodega.

---

# 2) Flujo PICKUP — Recolección en Obra (Tablet)

### Actor
Conductor

### Pasos
1. Seleccionar Obra.
2. Crear documento **PICKUP**.
3. Agregar ítems recogidos:
   - BULK: SKU + cantidad (conteo en campo).
   - SERIAL: seleccionar máquinas.
4. (Opcional) Fotos del cargue.
5. Confirmar PICKUP.

### Reglas Clave
- El conductor **NO cierra devoluciones**.
- El PICKUP **NO devuelve inventario a bodega**.

### Resultado
- Consecutivo generado.
- Inventario:
  - RENTED → IN_TRANSIT
- Ledger:
  - Movimiento TRANSIT.
- Queda **pendiente de RECEIPT**.

---

# 3) Flujo RECEIPT — Recepción en Bodega

### Actor
Bodega / Oficina

### Pasos
1. Abrir PICKUP pendiente (o crear RECEIPT directo).
2. Ver lo “esperado” según PICKUP.
3. Registrar lo **realmente recibido**:
   - BULK: SKU + cantidad recibida.
   - SERIAL: máquinas recibidas.
4. Confirmar RECEIPT.

### Resultado
- Inventario:
  - IN_TRANSIT → AVAILABLE (en bodega correspondiente).
- Ledger:
  - Movimiento IN.
- Si todo coincide → proceso cerrado.

---

# 4) Flujo DISCREPANCY — Diferencias Automáticas

### Cuándo se crea
Cuando RECEIPT ≠ PICKUP:
- Menor cantidad recibida.
- Mayor cantidad recibida.
- Ítems recibidos en bodega distinta.

### Qué hace el sistema
1. Crea registro **DISCREPANCY** automático.
2. Marca los ítems faltantes como:
   - **IN_TRANSIT** (pendiente)
   - o **MISSING** (según regla/tiempo).
3. Bloquea el cierre “silencioso”.

### Resolución
- OFFICE/ADMIN investiga.
- Puede:
  - cerrar como pérdida,
  - corregir recepción,
  - crear ajuste documentado.
- Todo queda auditado.

---

# 5) Ejemplo Completo — Caso Real (3 Gatos)

### Contexto
- Obra X.
- 3 gatos recogidos:
  - 2 propiedad **OWN** (tuya).
  - 1 propiedad **ALLY** (Vereal).

---

### A) PICKUP (Conductor)
Documento:
- Gato 20T (BULK): cantidad = 3

Estado tras PICKUP:
- 3 gatos → **IN_TRANSIT**

---

### B) RECEIPT (Bodegas)
- Bodega OWN recibe: 1 gato
- Bodega Vereal recibe: 1 gato
- 1 gato no llega a ninguna bodega

---

### C) Resultado del Sistema

Inventario:
- 1 gato → AVAILABLE en bodega OWN
- 1 gato → AVAILABLE en bodega Vereal
- 1 gato → **MISSING / IN_TRANSIT**

Discrepancia:
- Faltante: 1 gato
- Asociada a:
  - PICKUP #
  - Conductor
  - Obra
  - Fecha/hora

📌 **El conductor nunca pudo “devolver” 3 gatos sin validación**.

---

## Controles Anti-Fraude (MVP)
- PICKUP ≠ devolución final.
- RECEIPT obligatorio para cerrar.
- Discrepancias automáticas.
- Inventario por estados.
- Auditoría por usuario/fecha.

---

## Métricas visibles (desde MVP)
- Ítems en tránsito.
- Ítems faltantes.
- Discrepancias por conductor.
- Discrepancias por obra.
- Inventario por bodega (OWN vs ALLY).

---

## Notas Finales
- Para BULK se trabaja por conteo + doble confirmación.
- Para SERIAL se trabaja por unidad.
- El flujo está diseñado para un mundo **no ideal** (errores, robos, desvíos).
