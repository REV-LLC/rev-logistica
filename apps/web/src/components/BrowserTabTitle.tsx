'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

// The most specific routes come first so detail pages keep their own label.
const routeTitles: Array<[prefix: string, title: string]> = [
  ['/inventory/ledger/document', 'Documento de movimiento'],
  ['/inventory/ledger/asset', 'Movimientos de equipo'],
  ['/inventory/ledger/sku', 'Movimientos de ítem'],
  ['/inventory/ledger', 'Movimientos'],
  ['/inventory/warehouse/provider', 'Bodega proveedora'],
  ['/inventory/provider-pickups', 'Recogidas en proveedor'],
  ['/inventory/provider-returns', 'Entregas a proveedor'],
  ['/inventory/dispatch-return', 'Remisión y devolución'],
  ['/inventory/scaffold-modulations', 'Modulaciones'],
  ['/inventory/bulk-adjustments', 'Agregar inventario'],
  ['/inventory/hour-meter', 'Horómetros'],
  ['/inventory/serialized-assets', 'Agregar inventario'],
  ['/transport/requests', 'Solicitudes'],
  ['/transport/generate', 'Generar documento'],
  ['/transport/driver-worksites', 'Obras'],
  ['/transport/cost', 'Costo de transporte'],
  ['/transport/vehicles', 'Vehículos'],
  ['/transport/worksites', 'Obras'],
  ['/mobility-guides', 'Guías de movilidad'],
  ['/notifications/deliveries', 'Notificaciones'],
  ['/tasks', 'Pendientes'],
  ['/fuel', 'Combustible'],
  ['/billing/pre-invoice', 'Prefactura'],
  ['/billing/price-list', 'Lista de precios'],
  ['/customers', 'Clientes'],
  ['/providers', 'Proveedores'],
  ['/employees', 'Empleados'],
  ['/settings/task-notifications', 'Alertas de tareas'],
  ['/settings/catalog-options', 'Catálogo de ítems'],
  ['/settings/asset-components', 'Componentes de equipos'],
  ['/tools/quotation', 'Cotización'],
  ['/data', 'Datos'],
  ['/documents/shared', 'Documento compartido'],
  ['/actualizar-datos', 'Actualizar datos'],
  ['/privacy', 'Política de privacidad'],
  ['/login', 'Iniciar sesión'],
  ['/', 'Inicio'],
];

function getPageTitle(pathname: string, scope: string | null, view: string | null) {
  if (pathname === '/inventory/warehouse') {
    if (scope !== 'own') return 'Bodegas proveedoras';
    if (view === 'bulk') return 'Materiales y consumibles';
    if (view === 'serial') return 'Equipos';
    return 'Existencias';
  }

  if (pathname.startsWith('/inventory/serialized-assets/')) {
    return 'Equipo';
  }

  return routeTitles.find(
    ([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )?.[1];
}

export default function BrowserTabTitle() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const pageTitle = getPageTitle(
    pathname,
    searchParams.get('scope'),
    searchParams.get('view'),
  );

  useEffect(() => {
    document.title = pageTitle ? `${pageTitle} | REV Logística` : 'REV Logística';
  }, [pathname, searchParams, pageTitle]);

  return null;
}
