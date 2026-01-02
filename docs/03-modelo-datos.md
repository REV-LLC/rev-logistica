# 03 — Modelo de Datos (MVP)

Este documento define el modelo de datos para el MVP.
El diseño soporta:
- Inventario **BULK** (por cantidad, sin ID único)
- Inventario **SERIAL** (máquinas por unidad con serial/motor)
- Documentos: DELIVERY, PICKUP, RECEIPT
- Documentos fallidos (FAILED) sin afectar inventario
- Reintentos con nuevo consecutivo (retry_of_document_id)
- Inventario por movimientos (ledger) con trazabilidad

---

## Convenciones
- PK: `uuid`
- Fechas: `timestamptz`
- Enumeraciones se guardan como `text` (o enum DB más adelante)
- Todos los cambios relevantes deben quedar auditados por `created_by`, `created_at`

---

## Enumeraciones (dominio)

### Role
- ADMIN
- OFFICE
- DRIVER

### WarehouseType
- OWN
- ALLY

### SkuControlType
- BULK
- SERIAL

### DocumentType
- DELIVERY
- PICKUP
- RECEIPT

### DocumentStatus
- DRAFT        (creado pero no confirmado)
- CONFIRMED    (ejecutado/confirmado)
- FAILED       (intento fallido, no ejecutado)
- VOID         (anulado con auditoría)

### FailureResponsibility
- CUSTOMER
- COMPANY
- FORCE_MAJEURE

### MovementType (ledger)
- OUT        (sale de bodega hacia cliente/obra)
- TRANSIT    (recolección en tránsito)
- IN         (entra a bodega por recepción)
- ADJUST     (ajuste administrativo documentado, futuro)

---

## Tablas

### 1) users
Usuarios del sistema.

Campos:
- id (PK)
- name
- email (unique)
- role (Role)
- active (bool)
- created_at

---

### 2) customers
Clientes.

Campos:
- id (PK)
- name
- nit_or_id (opcional)
- phone (opcional)
- active (bool)
- created_at

---

### 3) projects
Obras/proyectos por cliente.

Campos:
- id (PK)
- customer_id (FK -> customers.id)
- name
- address (opcional)
- active (bool)
- created_at

Relación:
- customers 1 --- * projects

---

### 4) warehouses
Bodegas propias y aliadas (ej. Vereal).

Campos:
- id (PK)
- name
- type (WarehouseType)  // OWN o ALLY
- active (bool)
- created_at

---

### 5) skus
Catálogo estandarizado de ítems (evita nombres libres).

Campos:
- id (PK)
- name (unique recomendado)  // nombre estandarizado
- category (opcional)
- unit (ej: "und", "par", "juego")
- control_type (SkuControlType)  // BULK o SERIAL
- active (bool)
- created_at

Notas:
- Para máquinas (SERIAL), el SKU representa la "familia" o tipo.
- Para BULK, el SKU representa el ítem contable por cantidad.

---

### 6) assets (solo SERIAL)
Unidades únicas para máquinas (pocas pero críticas).

Campos:
- id (PK)
- sku_id (FK -> skus.id)  // debe ser control_type = SERIAL
- serial_or_engine (unique)  // motor/serial
- brand (opcional)
- model (opcional)
- warehouse_owner_id (FK -> warehouses.id) // dueño (OWN o ALLY)
- warehouse_current_id (FK -> warehouses.id) // ubicación actual (opcional: derivable por ledger)
- active (bool)
- created_at

Relaciones:
- skus 1 --- * assets
- warehouses 1 --- * assets (owner)
- warehouses 1 --- * assets (current)

---

### 7) documents
Cabecera de documentos operativos.

Campos:
- id (PK)
- type (DocumentType)
- status (DocumentStatus)
- consecutive (unique)  // consecutivo global o por tipo (definir política)
- project_id (FK -> projects.id)
- created_by (FK -> users.id)
- doc_date (timestamptz)  // fecha operativa
- notes (opcional)

Campos para fallidos:
- failed_reason (opcional)
- failed_responsibility (FailureResponsibility, opcional)
- failed_fee_applicable (bool default false)

Reintentos:
- retry_of_document_id (FK -> documents.id, opcional)

Auditoría/anulación:
- void_reason (opcional)
- voided_by (FK -> users.id, opcional)
- voided_at (timestamptz, opcional)

- created_at

Relaciones:
- projects 1 --- * documents
- users 1 --- * documents (created_by)
- documents 0..1 --- * documents (retry chain)

Reglas:
- Si status = FAILED:
  - debe existir failed_reason
  - no debe generar movimientos ledger (OUT/TRANSIT/IN)
- Cada reintento crea nuevo documento con nuevo consecutive.

---

### 8) document_items
Líneas de documento.
Debe soportar BULK y SERIAL.

Campos:
- id (PK)
- document_id (FK -> documents.id)

Para BULK:
- sku_id (FK -> skus.id)
- quantity (numeric)

Para SERIAL:
- asset_id (FK -> assets.id)
- quantity (numeric default 1) // en SERIAL normalmente 1

Campos de condición (principalmente para RECEIPT, futuro para devoluciones con daños):
- condition (opcional: OK/DAMAGED/MISSING)  // se puede agregar enum si se necesita
- condition_note (opcional)
- damage_cost_estimate (opcional)

- created_at

Reglas de integridad:
- Debe cumplirse uno de estos:
  - (sku_id != null AND asset_id == null)  -> BULK
  - (asset_id != null)                    -> SERIAL (sku_id opcional, pero recomendado por consistencia)
- Para BULK: quantity > 0
- Para SERIAL: quantity = 1 (en MVP, sugerido validar)

Relaciones:
- documents 1 --- * document_items
- skus 1 --- * document_items (BULK)
- assets 1 --- * document_items (SERIAL)

---

### 9) stock_ledger
Libro de movimientos (ledger). Fuente de verdad para inventario.

Campos:
- id (PK)

Identificador del ítem movido:
- sku_id (FK -> skus.id, nullable)
- asset_id (FK -> assets.id, nullable)

Contexto:
- warehouse_id (FK -> warehouses.id) // bodega involucrada
- project_id (FK -> projects.id, nullable) // opcional para trazabilidad
- movement_type (MovementType) // OUT, TRANSIT, IN
- quantity (numeric)

Referencia del documento:
- ref_document_id (FK -> documents.id)
- ref_document_type (DocumentType)

- created_at
- created_by (FK -> users.id)

Reglas:
- Para BULK: sku_id requerido, asset_id null, quantity > 0
- Para SERIAL: asset_id requerido, quantity = 1
- No se insertan movimientos si:
  - documents.status != CONFIRMED
  - documents.status = FAILED o VOID

Relaciones:
- documents 1 --- * stock_ledger
- warehouses 1 --- * stock_ledger
- skus/assets 1 --- * stock_ledger

---

### 10) file_objects
Evidencias: fotos, firmas.

Campos:
- id (PK)
- document_id (FK -> documents.id)
- file_type (SIGNATURE | PHOTO)
- storage_key (ruta o key en storage)
- mime_type
- created_at
- created_by (FK -> users.id)

Relación:
- documents 1 --- * file_objects

---

## Índices recomendados (MVP)
- documents(consecutive) UNIQUE
- documents(type, created_at)
- documents(project_id, created_at)
- document_items(document_id)
- stock_ledger(ref_document_id)
- stock_ledger(sku_id, created_at)
- stock_ledger(asset_id, created_at)
- assets(serial_or_engine) UNIQUE
- skus(name) UNIQUE

---

## Política de consecutivos (definir)
Opción A (simple): consecutivo global único para todos los tipos
- Ej: 000000123

Opción B (más legible): consecutivo por tipo
- DEL-000123, PIC-000456, REC-000789

Requisito del negocio:
- Un documento FAILED consume consecutivo.
- Un reintento genera nuevo consecutivo.

---

## Cómo se calcula el inventario (concepto)
El inventario disponible por bodega se obtiene del ledger:
- AVAILABLE = IN - OUT (ajustado por estado RENTED/TRANSIT)
En MVP se puede calcular por consulta o mantener una tabla de snapshot futura.

Estados recomendados (derivados por evento):
- DELIVERY CONFIRMED → pasa a RENTED
- PICKUP CONFIRMED → pasa a IN_TRANSIT
- RECEIPT CONFIRMED → pasa a AVAILABLE
- DISCREPANCY → pasa a MISSING (según regla/tiempo)

---

## Notas de implementación (para backend)
- La creación de documents + items + ledger debe ser transaccional:
  - si falla una parte, no se guarda nada incompleto.
- Validar reglas de integridad (BULK vs SERIAL) en servicio de dominio.
- Evitar que un DRIVER cree RECEIPT o modifique ledger.
