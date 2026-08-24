"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Collapse,
  Divider,
  Group,
  NavLink,
  ScrollArea,
  Stack,
  Text,
} from "@mantine/core";
import {
  AppRole,
  clearToken,
  getCurrentUserRole,
  getCurrentUserSession,
  isAuthBypassEnabled,
} from "@/lib/auth";
import OfficeDraftBrowserNotifications from "@/components/OfficeDraftBrowserNotifications";
import { api } from "@/lib/api";
import {
  IconArrowsShuffle,
  IconBell,
  IconBuilding,
  IconBuildingWarehouse,
  IconChevronDown,
  IconChecklist,
  IconClipboardList,
  IconBox,
  IconDatabaseExport,
  IconFileDollar,
  IconFilePlus,
  IconFileCertificate,
  IconGauge,
  IconHome,
  IconRulerMeasure,
  IconMap2,
  IconReceipt,
  IconSettings,
  IconTag,
  IconTools,
  IconTruck,
  IconUsers,
  IconUser,
} from "@tabler/icons-react";

type NavLinkItem = {
  href: string;
  label: string;
  icon: typeof IconClipboardList;
  roles: AppRole[];
  activePrefixes?: string[];
  activeHrefs?: string[];
  activeRoutes?: Array<{
    pathnamePrefix: string;
    searchParam: { key: string; value: string };
  }>;
  exact?: boolean;
  children?: NavLinkItem[];
};

type NavSection = {
  title: string;
  links: NavLinkItem[];
};

const sections: NavSection[] = [
  {
    title: "Operación",
    links: [
      {
        href: "/transport/requests",
        label: "Documentos",
        icon: IconClipboardList,
        roles: ["ADMIN", "OFFICE", "DRIVER"],
        children: [
          {
            href: "/transport/requests",
            label: "Solicitudes",
            icon: IconClipboardList,
            roles: ["ADMIN", "OFFICE", "DRIVER"],
            exact: true,
          },
          {
            href: "/transport/generate",
            label: "Generar documento",
            icon: IconFilePlus,
            roles: ["ADMIN", "OFFICE", "DRIVER"],
          },
          {
            href: "/mobility-guides",
            label: "Guías de movilidad",
            icon: IconFileCertificate,
            roles: ["ADMIN", "OFFICE", "DRIVER"],
          },
          {
            href: "/inventory/provider-returns",
            label: "Entregas a proveedor",
            icon: IconBuildingWarehouse,
            roles: ["ADMIN", "OFFICE", "DRIVER"],
          },
          {
            href: "/inventory/provider-pickups",
            label: "Recogidas en proveedor",
            icon: IconArrowsShuffle,
            roles: ["ADMIN", "OFFICE", "DRIVER"],
          },
        ],
      },
      {
        href: "/transport/vehicles",
        label: "Flota y obras",
        icon: IconTruck,
        roles: ["ADMIN", "OFFICE"],
        children: [
          {
            href: "/transport/vehicles",
            label: "Vehículos",
            icon: IconTruck,
            roles: ["ADMIN", "OFFICE"],
          },
          {
            href: "/transport/worksites",
            label: "Obras",
            icon: IconBuilding,
            roles: ["ADMIN", "OFFICE"],
          },
        ],
      },
      {
        href: "/transport/driver-worksites",
        label: "Obras",
        icon: IconMap2,
        roles: ["DRIVER"],
      },
      {
        href: "/notifications/deliveries",
        label: "Notificaciones",
        icon: IconBell,
        roles: ["ADMIN", "OFFICE"],
      },
      {
        href: "/tasks",
        label: "Pendientes",
        icon: IconChecklist,
        roles: ["ADMIN", "OFFICE"],
      },
    ],
  },
  {
    title: "Inventario",
    links: [
      {
        href: "/inventory/warehouse?scope=own",
        label: "Existencias",
        icon: IconBox,
        roles: ["ADMIN", "OFFICE"],
        children: [
          {
            href: "/inventory/warehouse?scope=own&view=serial",
            label: "Equipos",
            icon: IconTools,
            roles: ["ADMIN", "OFFICE"],
            activePrefixes: [
              "/inventory/warehouse?scope=own&view=serial",
            ],
            activeRoutes: [
              {
                pathnamePrefix: "/inventory/serialized-assets/",
                searchParam: { key: "scope", value: "own" },
              },
            ],
          },
          {
            href: "/inventory/warehouse?scope=own&view=bulk",
            label: "Materiales y consumibles",
            icon: IconBox,
            roles: ["ADMIN", "OFFICE"],
            exact: true,
          },
        ],
      },
      {
        href: "/inventory/warehouse?scope=allied",
        label: "Bodegas",
        icon: IconBuildingWarehouse,
        roles: ["ADMIN", "OFFICE"],
        children: [
          {
            href: "/inventory/warehouse?scope=allied",
            label: "Bodegas proveedoras",
            icon: IconBuildingWarehouse,
            roles: ["ADMIN", "OFFICE"],
            exact: true,
            activeRoutes: [
              {
                pathnamePrefix: "/inventory/serialized-assets/",
                searchParam: { key: "scope", value: "allied" },
              },
            ],
          },
          {
            href: "/inventory/bulk-adjustments",
            label: "Agregar inventario",
            icon: IconBox,
            roles: ["ADMIN", "OFFICE"],
            activePrefixes: [
              "/inventory/bulk-adjustments",
            ],
            activeHrefs: ["/inventory/serialized-assets"],
          },
        ],
      },
      {
        href: "/inventory/ledger",
        label: "Movimientos",
        icon: IconArrowsShuffle,
        roles: ["ADMIN", "OFFICE"],
      },
      {
        href: "/inventory/hour-meter",
        label: "Horómetros",
        icon: IconGauge,
        roles: ["ADMIN", "OFFICE", "OPERATOR"],
      },
    ],
  },
  {
    title: "Gestión",
    links: [
      {
        href: "/customers",
        label: "Clientes y facturación",
        icon: IconUsers,
        roles: ["ADMIN", "OFFICE"],
        children: [
          {
            href: "/customers",
            label: "Clientes",
            icon: IconUsers,
            roles: ["ADMIN", "OFFICE"],
          },
          {
            href: "/providers",
            label: "Proveedores",
            icon: IconBuildingWarehouse,
            roles: ["ADMIN", "OFFICE"],
          },
          {
            href: "/billing/pre-invoice",
            label: "Prefactura",
            icon: IconReceipt,
            roles: ["ADMIN", "OFFICE"],
          },
          {
            href: "/billing/price-list",
            label: "Lista de precios",
            icon: IconTag,
            roles: ["ADMIN", "OFFICE"],
          },
        ],
      },
      {
        href: "/employees/empleado-card",
        label: "Empleados",
        icon: IconUser,
        roles: ["ADMIN", "OFFICE"],
        activePrefixes: ["/employees"],
      },
    ],
  },
  {
    title: "Configuración",
    links: [
      {
        href: "/settings/task-notifications",
        label: "Alertas de tareas",
        icon: IconChecklist,
        roles: ["ADMIN"],
      },
      {
        href: "/settings/catalog-options",
        label: "Catálogo de ítems",
        icon: IconSettings,
        roles: ["ADMIN"],
      },
      {
        href: "/settings/asset-components",
        label: "Componentes de equipos",
        icon: IconArrowsShuffle,
        roles: ["ADMIN"],
      },
    ],
  },
];

const toolLinks: NavLinkItem[] = [
  {
    href: "/tools/quotation",
    label: "Cotización",
    icon: IconFileDollar,
    roles: ["ADMIN", "OFFICE"],
  },
  {
    href: "/transport/cost",
    label: "Costo de transporte",
    icon: IconMap2,
    roles: ["ADMIN", "OFFICE"],
  },
  {
    href: "/inventory/scaffold-modulations",
    label: "Modulaciones",
    icon: IconRulerMeasure,
    roles: ["ADMIN", "OFFICE"],
  },
  { href: "/data", label: "Datos", icon: IconDatabaseExport, roles: ["ADMIN"] },
];

const prodDisabledRoutes = ["/transport/cost", "/billing/pre-invoice"];
const isProduction = process.env.NODE_ENV === "production";
const defaultServiceName = "finge";
const homeLink: NavLinkItem = {
  href: "/",
  label: "Inicio",
  icon: IconHome,
  roles: ["ADMIN", "OFFICE", "DRIVER", "OPERATOR"],
  exact: true,
};
const defaultExpandedSections = new Set(["Operación"]);

type NavProps = {
  onNavigate?: () => void;
};

function NavItemIcon({
  icon: Icon,
  active,
}: {
  icon: NavLinkItem["icon"];
  active: boolean;
}) {
  return (
    <Box
      style={{
        width: 24,
        height: 24,
        borderRadius: 9,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        color: active ? "#b87500" : "var(--mantine-color-gray-6)",
        background: active
          ? "linear-gradient(135deg, rgba(217,154,24,0.24) 0%, rgba(255,229,153,0.9) 100%)"
          : "rgba(148,163,184,0.10)",
        boxShadow: active ? "0 8px 18px rgba(217,154,24,0.22)" : "none",
        border: active
          ? "1px solid rgba(217,154,24,0.32)"
          : "1px solid transparent",
      }}
    >
      <Icon size={15} stroke={1.9} aria-hidden="true" />
    </Box>
  );
}

export default function Nav({ onNavigate }: NavProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const authBypass = isAuthBypassEnabled();
  const currentRole = getCurrentUserRole();
  const currentSession = getCurrentUserSession();
  const [serviceName, setServiceName] = useState(defaultServiceName);
  const [sectionAccordion, setSectionAccordion] = useState<{
    routeKey: string;
    title: string | null;
  } | null>(null);
  const [linkAccordion, setLinkAccordion] = useState<{
    routeKey: string;
    href: string | null;
  } | null>(null);
  const currentSearch = searchParams.toString();
  const routeKey = currentSearch ? `${pathname}?${currentSearch}` : pathname;
  const openedLinkHref =
    linkAccordion?.routeKey === routeKey ? linkAccordion.href : undefined;
  const openedSectionTitle =
    sectionAccordion?.routeKey === routeKey
      ? sectionAccordion.title
      : undefined;
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const expandableItemRefs = useRef(new Map<string, HTMLDivElement>());

  const registerExpandableItem = useCallback(
    (key: string, node: HTMLDivElement | null) => {
      if (node) {
        expandableItemRefs.current.set(key, node);
      } else {
        expandableItemRefs.current.delete(key);
      }
    },
    [],
  );

  const revealExpandedItem = useCallback((key: string) => {
    const viewport = scrollViewportRef.current;
    const item = expandableItemRefs.current.get(key);
    if (!viewport || !item) return;

    const viewportRect = viewport.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    const visibilityMargin = 8;

    if (itemRect.bottom > viewportRect.bottom - visibilityMargin) {
      viewport.scrollTo({
        top:
          viewport.scrollTop +
          itemRect.bottom -
          viewportRect.bottom +
          visibilityMargin,
        behavior: "smooth",
      });
    } else if (itemRect.top < viewportRect.top + visibilityMargin) {
      viewport.scrollTo({
        top:
          viewport.scrollTop +
          itemRect.top -
          viewportRect.top -
          visibilityMargin,
        behavior: "smooth",
      });
    }
  }, []);

  useEffect(() => {
    let active = true;

    api<{ serviceName: string }>("/settings/branding")
      .then((branding) => {
        const nextName = branding.serviceName.trim();
        if (active && nextName) setServiceName(nextName);
      })
      .catch(() => {
        // Keep the local fallback so navigation is never blocked by branding.
      });

    return () => {
      active = false;
    };
  }, []);
  const canShowLink = (link: NavLinkItem) => {
    if (isProduction && prodDisabledRoutes.includes(link.href)) {
      return false;
    }

    return currentRole ? link.roles.includes(currentRole) : true;
  };
  const getVisibleLink = (link: NavLinkItem): NavLinkItem | null => {
    if (!canShowLink(link)) return null;
    if (!link.children) return link;

    const children = link.children
      .map(getVisibleLink)
      .filter((child): child is NavLinkItem => Boolean(child));

    return children.length ? { ...link, children } : null;
  };
  const isLinkActive = (link: NavLinkItem) => {
    if (link.children?.some(isLinkActive)) {
      return true;
    }

    const currentHref = routeKey;
    if (link.activeHrefs?.includes(currentHref)) {
      return true;
    }
    if (
      link.activeRoutes?.some(
        (route) =>
          pathname?.startsWith(route.pathnamePrefix)
          && searchParams.get(route.searchParam.key) === route.searchParam.value,
      )
    ) {
      return true;
    }
    if (link.exact) {
      return currentHref === link.href;
    }

    const prefixes = link.activePrefixes ?? [link.href];
    return prefixes.some((prefix) =>
      prefix.includes("?")
        ? currentHref.startsWith(prefix)
        : pathname?.startsWith(prefix),
    );
  };
  const visibleSections = sections
    .map((section) => ({
      ...section,
      links: section.links
        .map(getVisibleLink)
        .filter((link): link is NavLinkItem => Boolean(link)),
    }))
    .filter((section) => section.links.length > 0);
  const visibleMainSections = visibleSections.filter(
    (section) => section.title !== "Configuración",
  );
  const visibleSettingsSection = visibleSections.find(
    (section) => section.title === "Configuración",
  );
  const visibleToolLinks = toolLinks.filter(canShowLink);
  const visibleToolSection: NavSection | null = visibleToolLinks.length
    ? { title: "Herramientas", links: visibleToolLinks }
    : null;
  const orderedSections = [
    ...visibleMainSections,
    ...(visibleToolSection ? [visibleToolSection] : []),
    ...(visibleSettingsSection ? [visibleSettingsSection] : []),
  ];
  const hasActiveSection = orderedSections.some((section) =>
    section.links.some(isLinkActive),
  );
  const roleColor =
    currentRole === "ADMIN"
      ? "red"
      : currentRole === "OFFICE"
        ? "blue"
        : currentRole === "DRIVER"
          ? "teal"
          : currentRole === "OPERATOR"
            ? "orange"
            : "gray";
  const userDisplayName =
    currentSession?.name?.trim() ||
    [currentSession?.firstName, currentSession?.lastName]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    currentSession?.email ||
    null;

  const handleLogout = () => {
    clearToken();
    onNavigate?.();
    router.replace("/login");
  };

  const renderNavItem = (link: NavLinkItem, depth = 0) => {
    const Icon = link.icon;
    const isActive = isLinkActive(link);
    const hasChildren = Boolean(link.children?.length);
    const isExpanded =
      openedLinkHref === undefined ? isActive : openedLinkHref === link.href;

    if (hasChildren) {
      const expandableKey = `link:${link.href}`;

      return (
        <Stack
          key={link.href}
          ref={(node) => registerExpandableItem(expandableKey, node)}
          gap={0}
        >
          <NavLink
            component="button"
            label={link.label}
            active={isActive}
            aria-expanded={isExpanded}
            styles={{
              root: {
                borderRadius: 14,
                borderLeft: "3px solid transparent",
                background: "transparent",
                paddingLeft: depth
                  ? "8px"
                  : "calc(var(--mantine-spacing-sm) - 3px)",
                paddingRight: "8px",
                paddingTop: "6px",
                paddingBottom: "6px",
                boxShadow: "none",
                transition: "background 160ms ease",
              },
              body: {
                minHeight: "auto",
                display: "flex",
                alignItems: "center",
              },
              label: {
                color: isActive ? "#8a5a00" : "var(--mantine-color-gray-8)",
                fontWeight: isActive ? 750 : 560,
                lineHeight: 1.2,
                fontSize: depth ? "0.76rem" : "0.8rem",
              },
              section: {
                display: "flex",
                alignItems: "center",
              },
            }}
            leftSection={<NavItemIcon icon={Icon} active={isActive} />}
            rightSection={
              <IconChevronDown
                size={14}
                stroke={2}
                style={{
                  transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 160ms ease",
                }}
              />
            }
            onClick={() =>
              setLinkAccordion({
                routeKey,
                href: isExpanded ? null : link.href,
              })
            }
          />
          <Collapse
            in={isExpanded}
            onTransitionEnd={() => {
              if (isExpanded) revealExpandedItem(expandableKey);
            }}
          >
            <Box
              ml={22}
              pl={8}
              style={{ borderLeft: "1px solid var(--mantine-color-gray-3)" }}
            >
              <Stack gap={1} py={2}>
                {link.children?.map((child) => renderNavItem(child, depth + 1))}
              </Stack>
            </Box>
          </Collapse>
        </Stack>
      );
    }

    return (
      <NavLink
        key={link.href}
        component={Link}
        href={link.href}
        label={link.label}
        active={isActive}
        styles={{
          root: {
            borderRadius: 14,
            borderLeft: "3px solid transparent",
            background: "transparent",
            paddingLeft: depth
              ? "8px"
              : "calc(var(--mantine-spacing-sm) - 3px)",
            paddingRight: "8px",
            paddingTop: "6px",
            paddingBottom: "6px",
            boxShadow: "none",
            transition: "background 160ms ease",
          },
          body: {
            minHeight: "auto",
            display: "flex",
            alignItems: "center",
          },
          label: {
            color: isActive ? "#8a5a00" : "var(--mantine-color-gray-8)",
            fontWeight: isActive ? 750 : 560,
            lineHeight: 1.2,
            fontSize: depth ? "0.76rem" : "0.8rem",
          },
          section: {
            display: "flex",
            alignItems: "center",
          },
        }}
        leftSection={<NavItemIcon icon={Icon} active={isActive} />}
        onClick={onNavigate}
      />
    );
  };

  const renderSection = (section: NavSection) => {
    const isActive = section.links.some(isLinkActive);
    const isExpanded =
      openedSectionTitle === undefined
        ? isActive ||
          (!hasActiveSection && defaultExpandedSections.has(section.title))
        : openedSectionTitle === section.title;
    const expandableKey = `section:${section.title}`;

    return (
      <Stack
        key={section.title}
        ref={(node) => registerExpandableItem(expandableKey, node)}
        gap={2}
      >
        <NavLink
          component="button"
          label={section.title}
          active={isActive}
          aria-expanded={isExpanded}
          onClick={() =>
            setSectionAccordion({
              routeKey,
              title: isExpanded ? null : section.title,
            })
          }
          styles={{
            root: {
              borderRadius: 14,
              borderLeft: "3px solid transparent",
              background: "transparent",
              paddingLeft: "calc(var(--mantine-spacing-sm) - 3px)",
              paddingRight: "8px",
              paddingTop: "5px",
              paddingBottom: "5px",
              boxShadow: "none",
            },
            body: {
              minHeight: "auto",
              display: "flex",
              alignItems: "center",
            },
            label: {
              color: isActive ? "#8a5a00" : "var(--mantine-color-gray-7)",
              fontWeight: isActive ? 800 : 760,
              lineHeight: 1.2,
              fontSize: "0.88rem",
              letterSpacing: "0.01em",
              textTransform: "uppercase",
            },
            section: {
              display: "flex",
              alignItems: "center",
            },
          }}
          rightSection={
            <IconChevronDown
              size={14}
              stroke={2}
              style={{
                transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 160ms ease",
              }}
            />
          }
        />
        <Collapse
          in={isExpanded}
          onTransitionEnd={() => {
            if (isExpanded) revealExpandedItem(expandableKey);
          }}
        >
          <Stack gap={0} pl={18} pt={2}>
            {section.links.map(renderNavItem)}
          </Stack>
        </Collapse>
      </Stack>
    );
  };

  return (
    <Stack
      h="100%"
      gap="md"
      p="md"
      style={{
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.98) 100%)",
      }}
    >
      <Group
        justify="space-between"
        align="center"
        wrap="nowrap"
        style={{
          minWidth: 0,
          padding: "6px",
          borderRadius: 16,
          background: "rgba(255,255,255,0.72)",
        }}
      >
        <Link
          href="/"
          onClick={onNavigate}
          style={{ display: "block", flexShrink: 0 }}
        >
          <img
            src="/fiesta.svg"
            alt="Rev Logistica"
            style={{ height: 54, width: "auto", display: "block" }}
          />
        </Link>
        <Stack
          gap={2}
          align="flex-end"
          style={{ minWidth: 0, flex: "1 1 auto", overflow: "hidden" }}
        >
          <Badge
            color={roleColor}
            variant="light"
            radius="sm"
            tt="uppercase"
            size="md"
            style={{ flexShrink: 0, maxWidth: "100%" }}
          >
            {currentRole ?? "SIN ROL"}
          </Badge>
          {userDisplayName ? (
            <Text
              size="10px"
              c="dimmed"
              ta="right"
              lh={1.2}
              title={userDisplayName}
              w="100%"
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {userDisplayName}
            </Text>
          ) : null}
        </Stack>
      </Group>
      <Divider color="rgba(226,232,240,0.8)" />
      <ScrollArea
        viewportRef={scrollViewportRef}
        type="auto"
        offsetScrollbars
        scrollbarSize={6}
        style={{
          flex: "1 1 auto",
          minHeight: 0,
          marginRight: -8,
          paddingRight: 8,
        }}
      >
        <Stack gap="md" pr={4}>
          {canShowLink(homeLink) ? (
            <Stack gap={0}>{renderNavItem(homeLink)}</Stack>
          ) : null}
          {orderedSections.map(renderSection)}
        </Stack>
      </ScrollArea>
      <Box mt="auto" style={{ flexShrink: 0 }}>
        <Divider mb="sm" color="rgba(226,232,240,0.8)" />
        <Stack gap="xs">
          <OfficeDraftBrowserNotifications />
          {!authBypass ? (
            <Button
              variant="subtle"
              color="red"
              onClick={handleLogout}
              size="sm"
              fullWidth
              styles={{ inner: { justifyContent: "flex-start" } }}
            >
              Cerrar sesion
            </Button>
          ) : null}
          <Box
            component="footer"
            ta="center"
            py={4}
            style={{ opacity: 0.58, userSelect: "none" }}
          >
            <Text
              size="11px"
              fw={850}
              tt="uppercase"
              lh={1.1}
              style={{ letterSpacing: "0.16em" }}
            >
              {serviceName}
            </Text>
            <Text size="9px" c="dimmed" lh={1.2} mt={2}>
              Finanzas · Inventario · Gestión
            </Text>
          </Box>
        </Stack>
      </Box>
    </Stack>
  );
}
