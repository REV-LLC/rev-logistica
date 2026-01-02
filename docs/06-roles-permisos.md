# 06 — Roles y Permisos (MVP)

Este documento define **qué puede y qué no puede hacer cada rol** dentro del sistema.
El objetivo es:
- Evitar errores operativos.
- Evitar fraudes.
- Garantizar separación de responsabilidades.
- Facilitar la implementación de Guards en NestJS.

---

## Roles del Sistema

### ADMIN
Rol con control total del sistema.
Pensado para gerencia / dueño / TI.

### OFFICE
Rol operativo de oficina y bodega.
Valida físicamente y cierra procesos.

### DRIVER
Rol de conductor (tablet).
Registra eventos en campo, **no valida inventario final**.

---

## Principios de seguridad (hard rules)

1. **El inventario solo cambia con documentos CONFIRMED**
2. **El DRIVER nunca crea RECEIPT**
3. **El DRIVER nunca genera movimientos finales**
4. **Los documentos FAILED no afectan inventario**
5. **Toda anulación requiere auditoría**
6. **No existen cambios directos a inventario sin ledger**

---

## Permisos por Rol

### DRIVER (Conductor – Tablet)

#### Puede:
- Iniciar sesión.
- Ver sus propios documentos.
- Crear documentos:
  - `PICKUP` (recolección en obra).
- Adjuntar evidencias (fotos) a PICKUP.
- Marcar un PICKUP como `FAILED` con motivo.

#### No puede:
- Crear `DELIVERY`.
- Crear `RECEIPT`.
- Confirmar documentos que afecten inventario final.
- Modificar documentos CONFIRMED.
- Anular documentos.
- Crear o modificar catálogo (SKUs, bodegas, clientes).
- Resolver discrepancias.

---

### OFFICE (Oficina / Bodega)

#### Puede:
- Iniciar sesión.
- Ver documentos de todas las obras.
- Crear documentos:
  - `DELIVERY` (entrega a cliente).
  - `RECEIPT` (recepción en bodega).
- Confirmar documentos (CONFIRMED).
- Registrar RECEIPT parcial (genera DISCREPANCY).
- Ver y gestionar discrepancias.
- Adjuntar evidencias (fotos/firma).
- Consultar inventario por bodega, estado, obra.

#### No puede:
- Eliminar documentos.
- Modificar documentos CONFIRMED (solo ADMIN).
- Cambiar propiedad de equipos (OWN ↔ ALLY).
- Resolver ajustes administrativos definitivos (si se define así).

---

### ADMIN

#### Puede:
- Todo lo que puede OFFICE.
- Crear, editar y desactivar:
  - usuarios
  - roles
  - bodegas
  - SKUs
  - máquinas (SERIAL)
- Anular documentos (`VOID`) con:
  - motivo obligatorio
  - registro de usuario y fecha.
- Resolver discrepancias:
  - cerrar como pérdida
  - generar ajuste documentado
- Realizar ajustes administrativos (`ADJUST`) con auditoría.
- Consultar reportes completos.

---

## Permisos por Tipo de Documento

### DELIVERY
- Crear:
  - OFFICE, ADMIN
- Confirmar:
  - OFFICE, ADMIN
- Marcar FAILED:
  - OFFICE, ADMIN
- Anular (VOID):
  - ADMIN

---

### PICKUP
- Crear:
  - DRIVER
  - OFFICE (si se hace desde oficina)
- Confirmar:
  - DRIVER (solo hasta IN_TRANSIT)
- Marcar FAILED:
  - DRIVER, OFFICE
- Anular (VOID):
  - ADMIN

---

### RECEIPT
- Crear:
  - OFFICE, ADMIN
- Confirmar:
  - OFFICE, ADMIN
- Marcar FAILED:
  - ❌ No permitido (usar DRAFT/CONFIRMED)
- Anular (VOID):
  - ADMIN

---

## Discrepancias

### Creación
- Automática por el sistema cuando:
  - RECEIPT ≠ PICKUP

### Gestión
- Ver:
  - OFFICE, ADMIN
- Resolver:
  - ADMIN (o OFFICE si así lo decides, pero con auditoría)

---

## Matriz Resumen (rápida)

| Acción                          | DRIVER | OFFICE | ADMIN |
|---------------------------------|:------:|:------:|:-----:|
| Crear DELIVERY                  | ❌     | ✅     | ✅    |
| Crear PICKUP                    | ✅     | ✅     | ✅    |
| Crear RECEIPT                   | ❌     | ✅     | ✅    |
| Confirmar DELIVERY              | ❌     | ✅     | ✅    |
| Confirmar PICKUP                | ✅     | ❌     | ❌    |
| Confirmar RECEIPT               | ❌     | ✅     | ✅    |
| Marcar documento FAILED         | ✅*    | ✅     | ✅    |
| Anular documento (VOID)         | ❌     | ❌     | ✅    |
| Resolver discrepancia           | ❌     | ❌     | ✅    |
| Ver inventario global           | ❌     | ✅     | ✅    |
| Crear/editar SKUs y bodegas     | ❌     | ❌     | ✅    |

\* DRIVER solo para PICKUP.

---

## Reglas de implementación (NestJS)

- Usar **Guards** por rol (`@Roles()`).
- Validar tipo de documento vs rol antes de crear.
- Validar transición de estado antes de confirmar.
- Rechazar cualquier intento de:
  - crear ledger sin documento CONFIRMED
  - crear RECEIPT desde DRIVER
  - cerrar discrepancias sin rol ADMIN

---

## Definición de sistema seguro
El sistema se considera seguro cuando:
- Un DRIVER no puede, ni por error ni por API, devolver inventario a AVAILABLE.
- Todo documento que afecta inventario tiene:
  - autor
  - fecha
  - estado
  - movimientos asociados
- No existen “ajustes invisibles”.
