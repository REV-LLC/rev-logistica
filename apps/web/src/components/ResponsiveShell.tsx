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
      <AppShell.Header
        hiddenFrom="sm"
        px="sm"
        withBorder={false}
        style={{
          background: "#031426",
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
          boxShadow: "0 8px 24px rgba(3, 20, 38, 0.16)",
          color: "#ffffff",
          overflow: "hidden",
        }}
      >
        <Group h="100%" justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap">
            <Burger
              opened={opened}
              onClick={toggle}
              size="sm"
              color="#ffffff"
              aria-label={opened ? "Cerrar menu" : "Abrir menu"}
            />
            <div>
              <Text fw={700} size="sm" lh={1.1} c="#ffffff">
                {headerCopy.title}
              </Text>
              <Text size="xs" c="#aebdcd" lh={1.1}>
                {headerCopy.subtitle}
              </Text>
            </div>
          </Group>
          <Link
            href="/"
            onClick={close}
            aria-hidden={opened}
            tabIndex={opened ? -1 : undefined}
            style={{
              display: "block",
              flexShrink: 0,
              opacity: opened ? 0 : 1,
              pointerEvents: opened ? "none" : "auto",
              transform: opened ? "translateX(32px)" : "translateX(0)",
              transition:
                "opacity 170ms ease, transform 240ms cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          >
            <img
              src="/fiesta.svg?v=silver"
              alt="Rev Logistica"
              style={{
                height: 30,
                width: "auto",
                display: "block",
              }}
            />
          </Link>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar
        withBorder={false}
        style={{
          background: '#031426',
          boxShadow: '10px 0 30px rgba(7, 29, 51, 0.08)',
        }}
      >
        <Nav onNavigate={close} />
      </AppShell.Navbar>
      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  );
}
