"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { AppShell, Burger, Group, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useEffect, useState } from "react";
import Nav from "@/components/Nav";

const routeTitles: Array<{ prefix: string; title: string; subtitle: string }> =
  [
    {
      prefix: "/fuel",
      title: "Combustible",
      subtitle: "Consumo operativo",
    },
    {
      prefix: "/transport/requests",
      title: "Solicitudes",
      subtitle: "Operacion diaria",
    },
    {
      prefix: "/transport/generate",
      title: "Generar documentos",
      subtitle: "Nuevo documento",
    },
    {
      prefix: "/transport/driver-worksites",
      title: "Obras",
      subtitle: "Ubicaciones y contactos",
    },
    {
      prefix: "/mobility-guides",
      title: "Guias de movilidad",
      subtitle: "Documentos por activo",
    },
    {
      prefix: "/transport/cost",
      title: "Transporte",
      subtitle: "Costos y despacho",
    },
    {
      prefix: "/transport/vehicles",
      title: "Vehiculos",
      subtitle: "Flota y documentos",
    },
    {
      prefix: "/transport/worksites",
      title: "Obras",
      subtitle: "Frentes activos",
    },
    {
      prefix: "/tasks",
      title: "Pendientes",
      subtitle: "Seguimiento operativo",
    },
    {
      prefix: "/notifications/deliveries",
      title: "Notificaciones",
      subtitle: "Historial de envíos",
    },
    {
      prefix: "/inventory/warehouse",
      title: "Bodegas",
      subtitle: "Control de inventario",
    },
    {
      prefix: "/inventory/ledger",
      title: "Movimientos",
      subtitle: "Trazabilidad",
    },
    {
      prefix: "/inventory/provider-pickups",
      title: "Recogidas en proveedor",
      subtitle: "Traslados a bodega REV",
    },
    {
      prefix: "/inventory/provider-returns",
      title: "Entregas a proveedor",
      subtitle: "Devoluciones a bodega aliada",
    },
    {
      prefix: "/inventory/scaffold-modulations",
      title: "Modulaciones",
      subtitle: "Andamio certificado",
    },
    {
      prefix: "/inventory/bulk-adjustments",
      title: "Agregar inventario",
      subtitle: "Ingreso masivo",
    },
    {
      prefix: "/inventory/serialized-assets",
      title: "Agregar inventario",
      subtitle: "Equipos unicos",
    },
    {
      prefix: "/settings/catalog-options",
      title: "Catalogo items",
      subtitle: "Ajustes",
    },
    {
      prefix: "/providers",
      title: "Proveedores",
      subtitle: "Datos y bodegas",
    },
    {
      prefix: "/billing/pre-invoice",
      title: "Prefactura",
      subtitle: "Resumen del periodo",
    },
    { prefix: "/customers", title: "Clientes", subtitle: "Relacion comercial" },
    { prefix: "/employees", title: "Empleados", subtitle: "Equipo interno" },
    { prefix: "/data", title: "Datos", subtitle: "Backups y exportaciones" },
  ];

function getHeaderCopy(
  pathname: string | null,
  inventoryScope: string | null,
  inventoryView: string | null,
) {
  if (
    pathname?.startsWith("/inventory/serialized-assets/")
  ) {
    return inventoryScope === "allied"
      ? { title: "Equipos", subtitle: "Bodega proveedora" }
      : { title: "Equipos", subtitle: "Bodega propia" };
  }

  if (
    pathname?.startsWith("/inventory/warehouse") &&
    inventoryScope === "own"
  ) {
    return inventoryView === "bulk"
      ? { title: "Bulk", subtitle: "Bodega propia" }
      : { title: "Equipos", subtitle: "Bodega propia" };
  }

  return (
    routeTitles.find((item) => pathname?.startsWith(item.prefix)) ?? {
      title: "Rev Logistica",
      subtitle: "Panel operativo",
    }
  );
}

export default function ResponsiveShell({
  children,
  hideNavigation = false,
}: {
  children: React.ReactNode;
  hideNavigation?: boolean;
}) {
  const [opened, { toggle, close }] = useDisclosure(false);
  const [isEmbedded, setIsEmbedded] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const headerCopy = getHeaderCopy(
    pathname,
    searchParams.get("scope"),
    searchParams.get("view"),
  );

  useEffect(() => {
    setIsEmbedded(
      new URLSearchParams(window.location.search).get("embed") === "1",
    );
  }, []);

  if (hideNavigation || isEmbedded) {
    return <>{children}</>;
  }

  return (
    <AppShell
      header={{ height: { base: 56, sm: 0 } }}
      navbar={{ width: 284, breakpoint: "sm", collapsed: { mobile: !opened } }}
      padding={{ base: "xs", sm: "md" }}
    >
      <AppShell.Header hiddenFrom="sm" px="sm">
        <Group h="100%" justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap">
            <Burger
              opened={opened}
              onClick={toggle}
              size="sm"
              aria-label="Abrir menu"
            />
            <div>
              <Text fw={700} size="sm" lh={1.1}>
                {headerCopy.title}
              </Text>
              <Text size="xs" c="dimmed" lh={1.1}>
                {headerCopy.subtitle}
              </Text>
            </div>
          </Group>
          <Link href="/" style={{ display: "block" }} onClick={close}>
            <img
              src="/fiesta.svg"
              alt="Rev Logistica"
              style={{ height: 30, width: "auto", display: "block" }}
            />
          </Link>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar withBorder>
        <Nav onNavigate={close} />
      </AppShell.Navbar>
      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  );
}
