'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Badge, Box, Button, Collapse, Divider, Group, NavLink, ScrollArea, Stack, Text, Tooltip } from '@mantine/core';
import { AppRole, clearToken, getCurrentUserRole, getCurrentUserSession } from '@/lib/auth';
import {
  IconArrowsShuffle,
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
  IconRulerMeasure,
  IconMap2,
  IconReceipt,
  IconSettings,
  IconTag,
  IconTools,
  IconTruck,
  IconUsers,
  IconUser,
} from '@tabler/icons-react';

type NavLinkItem = {
  href: string;
  label: string;
  icon: typeof IconClipboardList;
  roles: AppRole[];
  activePrefixes?: string[];
  exact?: boolean;
  children?: NavLinkItem[];
};

type NavSection = {
  title: string;
  links: NavLinkItem[];
};

const sections: NavSection[] = [
  {
    title: 'Operación',
    links: [
      {
        href: '/transport/requests',
        label: 'Documentos',
        icon: IconClipboardList,
        roles: ['ADMIN', 'OFFICE', 'DRIVER'],
        children: [
          { href: '/transport/requests', label: 'Solicitudes', icon: IconClipboardList, roles: ['ADMIN', 'OFFICE', 'DRIVER'], exact: true },
          { href: '/transport/generate', label: 'Generar documento', icon: IconFilePlus, roles: ['ADMIN', 'OFFICE', 'DRIVER'] },
          { href: '/mobility-guides', label: 'Guías de movilidad', icon: IconFileCertificate, roles: ['ADMIN', 'OFFICE', 'DRIVER'] },
        ],
      },
      {
        href: '/transport/vehicles',
        label: 'Logística',
        icon: IconTruck,
        roles: ['ADMIN', 'OFFICE'],
        children: [
          { href: '/transport/vehicles', label: 'Vehículos', icon: IconTruck, roles: ['ADMIN', 'OFFICE'] },
          { href: '/transport/worksites', label: 'Obras', icon: IconBuilding, roles: ['ADMIN', 'OFFICE'] },
          { href: '/tasks', label: 'Pendientes', icon: IconChecklist, roles: ['ADMIN', 'OFFICE'] },
        ],
      },
    ],
  },
  {
    title: 'Inventario',
    links: [
      {
        href: '/inventory/warehouse?scope=own',
        label: 'Inventario propio',
        icon: IconBox,
        roles: ['ADMIN', 'OFFICE'],
        children: [
          {
            href: '/inventory/warehouse?scope=own&view=serial',
            label: 'Equipos',
            icon: IconTools,
            roles: ['ADMIN', 'OFFICE'],
            exact: true,
          },
          {
            href: '/inventory/warehouse?scope=own&view=bulk',
            label: 'Materiales',
            icon: IconBox,
            roles: ['ADMIN', 'OFFICE'],
            exact: true,
          },
        ],
      },
      {
        href: '/inventory/warehouse?scope=allied',
        label: 'Bodegas y stock',
        icon: IconBuildingWarehouse,
        roles: ['ADMIN', 'OFFICE'],
        children: [
          { href: '/inventory/warehouse?scope=allied', label: 'Bodegas proveedoras', icon: IconBuildingWarehouse, roles: ['ADMIN', 'OFFICE'], exact: true },
          { href: '/inventory/ledger', label: 'Movimientos', icon: IconArrowsShuffle, roles: ['ADMIN', 'OFFICE'] },
          {
            href: '/inventory/bulk-adjustments',
            label: 'Agregar inventario',
            icon: IconBox,
            roles: ['ADMIN', 'OFFICE'],
            activePrefixes: ['/inventory/bulk-adjustments', '/inventory/serialized-assets'],
          },
        ],
      },
      {
        href: '/inventory/hour-meter',
        label: 'Mantenimiento',
        icon: IconGauge,
        roles: ['ADMIN', 'OFFICE', 'OPERATOR'],
        children: [
          { href: '/inventory/hour-meter', label: 'Registrar horómetro', icon: IconGauge, roles: ['ADMIN', 'OFFICE', 'OPERATOR'] },
        ],
      },
    ],
  },
  {
    title: 'Administración',
    links: [
      {
        href: '/customers',
        label: 'Comercial',
        icon: IconUsers,
        roles: ['ADMIN', 'OFFICE'],
        children: [
          { href: '/customers', label: 'Clientes', icon: IconUsers, roles: ['ADMIN', 'OFFICE'] },
          { href: '/billing/pre-invoice', label: 'Prefactura', icon: IconReceipt, roles: ['ADMIN', 'OFFICE'] },
          { href: '/billing/price-list', label: 'Lista de precios', icon: IconTag, roles: ['ADMIN', 'OFFICE'] },
        ],
      },
      {
        href: '/employees',
        label: 'Equipo',
        icon: IconUser,
        roles: ['ADMIN', 'OFFICE'],
        children: [
          {
            href: '/employees/empleado-card',
            label: 'Empleados',
            icon: IconUser,
            roles: ['ADMIN', 'OFFICE'],
          },
        ],
      },
    ],
  },
  {
    title: 'Configuración',
    links: [
      { href: '/settings/catalog-options', label: 'Catálogo de ítems', icon: IconSettings, roles: ['ADMIN'] },
    ],
  },
];

const toolLinks: NavLinkItem[] = [
  { href: '/tools/quotation', label: 'Cotización', icon: IconFileDollar, roles: ['ADMIN', 'OFFICE'] },
  { href: '/transport/cost', label: 'Costo de transporte', icon: IconMap2, roles: ['ADMIN', 'OFFICE'] },
  { href: '/inventory/scaffold-modulations', label: 'Modulaciones', icon: IconRulerMeasure, roles: ['ADMIN', 'OFFICE'] },
  { href: '/data', label: 'Datos', icon: IconDatabaseExport, roles: ['ADMIN'] },
];

const prodDisabledRoutes = ['/transport/cost', '/billing/pre-invoice'];
const isProduction = process.env.NODE_ENV === 'production';
const appVersion = process.env.NEXT_PUBLIC_APP_VERSION;
const mostUsedLinks = ['/transport/requests', '/inventory/warehouse?scope=allied', '/inventory/ledger'];
const defaultExpandedSections = new Set(['Operación', 'Inventario', 'Administración']);

type NavProps = {
  onNavigate?: () => void;
};

function NavItemIcon({
  icon: Icon,
  active,
}: {
  icon: NavLinkItem['icon'];
  active: boolean;
}) {
  return (
    <Box
      style={{
        width: 24,
        height: 24,
        borderRadius: 9,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        color: active ? '#b87500' : 'var(--mantine-color-gray-6)',
        background: active
          ? 'linear-gradient(135deg, rgba(217,154,24,0.24) 0%, rgba(255,229,153,0.9) 100%)'
          : 'rgba(148,163,184,0.10)',
        boxShadow: active ? '0 8px 18px rgba(217,154,24,0.22)' : 'none',
        border: active ? '1px solid rgba(217,154,24,0.32)' : '1px solid transparent',
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
  const currentRole = getCurrentUserRole();
  const currentSession = getCurrentUserSession();
  const [openedSections, setOpenedSections] = useState<Record<string, boolean>>({});
  const [openedLinks, setOpenedLinks] = useState<Record<string, boolean>>({});
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
  const flattenLinks = (links: NavLinkItem[]): NavLinkItem[] =>
    links.flatMap((link) => [link, ...(link.children ? flattenLinks(link.children) : [])]);
  const isLinkActive = (link: NavLinkItem) => {
    if (link.children?.some(isLinkActive)) {
      return true;
    }

    const currentHref = searchParams.size > 0 ? `${pathname}?${searchParams.toString()}` : pathname;
    if (link.exact) {
      return currentHref === link.href;
    }

    const prefixes = link.activePrefixes ?? [link.href];
    return prefixes.some((prefix) =>
      prefix.includes('?') ? currentHref.startsWith(prefix) : pathname?.startsWith(prefix),
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
  const visibleMainSections = visibleSections.filter((section) => section.title !== 'Configuración');
  const visibleSettingsSection = visibleSections.find((section) => section.title === 'Configuración');
  const visibleToolLinks = toolLinks.filter(canShowLink);
  const visibleToolSection: NavSection | null = visibleToolLinks.length
    ? { title: 'Herramientas', links: visibleToolLinks }
    : null;
  const orderedSections = [
    ...visibleMainSections,
    ...(visibleToolSection ? [visibleToolSection] : []),
    ...(visibleSettingsSection ? [visibleSettingsSection] : []),
  ];
  const allVisibleLinks = flattenLinks(orderedSections.flatMap((section) => section.links));
  const quickLinks = mostUsedLinks
    .map((href) => allVisibleLinks.find((link) => link.href === href && !link.children))
    .filter((link, index, list): link is NavLinkItem => Boolean(link) && list.findIndex((item) => item?.href === link?.href) === index)
    .slice(0, 3);
  const roleColor =
    currentRole === 'ADMIN'
      ? 'red'
      : currentRole === 'OFFICE'
        ? 'blue'
        : currentRole === 'DRIVER'
          ? 'teal'
          : currentRole === 'OPERATOR'
            ? 'orange'
            : 'gray';

  const handleLogout = () => {
    clearToken();
    onNavigate?.();
    router.replace('/login');
  };

  const renderNavItem = (link: NavLinkItem, depth = 0) => {
    const Icon = link.icon;
    const isActive = isLinkActive(link);
    const hasChildren = Boolean(link.children?.length);
    const isExpanded = openedLinks[link.href] ?? isActive;

    if (hasChildren) {
      return (
        <Stack key={link.href} gap={0}>
          <NavLink
            component="button"
            label={link.label}
            active={isActive}
            styles={{
              root: {
                borderRadius: 14,
                borderLeft: '3px solid transparent',
                background: 'transparent',
                paddingLeft: depth ? '8px' : 'calc(var(--mantine-spacing-sm) - 3px)',
                paddingRight: '8px',
                paddingTop: '6px',
                paddingBottom: '6px',
                boxShadow: 'none',
                transition: 'background 160ms ease',
              },
              body: {
                minHeight: 'auto',
                display: 'flex',
                alignItems: 'center',
              },
              label: {
                color: isActive ? '#8a5a00' : 'var(--mantine-color-gray-8)',
                fontWeight: isActive ? 750 : 560,
                lineHeight: 1.2,
                fontSize: depth ? '0.76rem' : '0.8rem',
              },
              section: {
                display: 'flex',
                alignItems: 'center',
              },
            }}
            leftSection={
              <NavItemIcon icon={Icon} active={isActive} />
            }
            rightSection={
              <IconChevronDown
                size={14}
                stroke={2}
                style={{
                  transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 160ms ease',
                }}
              />
            }
            onClick={() =>
              setOpenedLinks((current) => ({ ...current, [link.href]: !isExpanded }))
            }
          />
          <Collapse in={isExpanded}>
            <Box ml={22} pl={8} style={{ borderLeft: '1px solid var(--mantine-color-gray-3)' }}>
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
            borderLeft: '3px solid transparent',
            background: 'transparent',
            paddingLeft: depth ? '8px' : 'calc(var(--mantine-spacing-sm) - 3px)',
            paddingRight: '8px',
            paddingTop: '6px',
            paddingBottom: '6px',
            boxShadow: 'none',
            transition: 'background 160ms ease',
          },
          body: {
            minHeight: 'auto',
            display: 'flex',
            alignItems: 'center',
          },
          label: {
            color: isActive ? '#8a5a00' : 'var(--mantine-color-gray-8)',
            fontWeight: isActive ? 750 : 560,
            lineHeight: 1.2,
            fontSize: depth ? '0.76rem' : '0.8rem',
          },
          section: {
            display: 'flex',
            alignItems: 'center',
          },
        }}
        leftSection={
          <NavItemIcon icon={Icon} active={isActive} />
        }
        onClick={onNavigate}
      />
    );
  };

  const renderSection = (section: NavSection) => {
    const isActive = section.links.some(isLinkActive);
    const isExpanded =
      openedSections[section.title] ??
      (isActive || defaultExpandedSections.has(section.title));

    return (
      <Stack key={section.title} gap={2}>
        <NavLink
          component="button"
          label={section.title}
          active={isActive}
          onClick={() => setOpenedSections((current) => ({ ...current, [section.title]: !isExpanded }))}
          styles={{
            root: {
              borderRadius: 14,
              borderLeft: '3px solid transparent',
              background: 'transparent',
              paddingLeft: 'calc(var(--mantine-spacing-sm) - 3px)',
              paddingRight: '8px',
              paddingTop: '5px',
              paddingBottom: '5px',
              boxShadow: 'none',
            },
            body: {
              minHeight: 'auto',
              display: 'flex',
              alignItems: 'center',
            },
            label: {
              color: isActive ? '#8a5a00' : 'var(--mantine-color-gray-7)',
              fontWeight: isActive ? 800 : 760,
              lineHeight: 1.2,
              fontSize: '0.88rem',
              letterSpacing: '0.01em',
              textTransform: 'uppercase',
            },
            section: {
              display: 'flex',
              alignItems: 'center',
            },
          }}
          rightSection={
            <IconChevronDown
              size={14}
              stroke={2}
              style={{
                transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 160ms ease',
              }}
            />
          }
        />
        <Collapse in={isExpanded}>
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
        background: 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.98) 100%)',
      }}
    >
      <Group
        justify="space-between"
        align="center"
        wrap="nowrap"
        style={{
          minWidth: 0,
          padding: '6px',
          borderRadius: 16,
          background: 'rgba(255,255,255,0.72)',
          border: '1px solid rgba(226,232,240,0.78)',
        }}
      >
        <Link href="/" onClick={onNavigate} style={{ display: 'block', flexShrink: 0 }}>
          <img
            src="/fiesta.svg"
            alt="Rev Logistica"
            style={{ height: 54, width: 'auto', display: 'block' }}
          />
        </Link>
        <Stack gap={2} align="flex-end" style={{ minWidth: 0, flex: '1 1 auto', overflow: 'hidden' }}>
          <Badge
            color={roleColor}
            variant="light"
            radius="sm"
            tt="uppercase"
            size="md"
            style={{ flexShrink: 0, maxWidth: '100%' }}
          >
            {currentRole ?? 'SIN ROL'}
          </Badge>
          {currentSession?.email ? (
            <>
              <Text
                size="10px"
                c="dimmed"
                ta="right"
                lh={1.2}
                title={currentSession.email}
                w="100%"
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {currentSession.email}
              </Text>
              {appVersion ? (
                <Tooltip
                  label={appVersion}
                  position="bottom-end"
                  withArrow
                  multiline
                  maw={260}
                  openDelay={250}
                >
                  <Text
                    size="9px"
                    c="dimmed"
                    ta="right"
                    lh={1.1}
                    w="100%"
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {appVersion}
                  </Text>
                </Tooltip>
              ) : null}
            </>
          ) : null}
        </Stack>
      </Group>
      <Divider color="rgba(226,232,240,0.8)" />
      <ScrollArea
        type="auto"
        offsetScrollbars
        scrollbarSize={6}
        style={{ flex: '1 1 auto', minHeight: 0, marginRight: -8, paddingRight: 8 }}
      >
        <Stack gap="md" pr={4}>
          {quickLinks.length > 0 ? (
            <Stack gap={4}>
              <Text
                size="10px"
                fw={800}
                c="dimmed"
                tt="uppercase"
                px="xs"
                lh={1.2}
                style={{ letterSpacing: '0.06em' }}
              >
                Mas usado
              </Text>
              <Stack gap={0}>
                {quickLinks.map(renderNavItem)}
              </Stack>
            </Stack>
          ) : null}
          {orderedSections.map(renderSection)}
        </Stack>
      </ScrollArea>
      <Box mt="auto" style={{ flexShrink: 0 }}>
        <Divider mb="sm" color="rgba(226,232,240,0.8)" />
        <Stack gap="xs">
          <Button
            variant="subtle"
            color="red"
            onClick={handleLogout}
            size="sm"
            fullWidth
            styles={{ inner: { justifyContent: 'flex-start' } }}
          >
            Cerrar sesion
          </Button>
        </Stack>
      </Box>
    </Stack>
  );
}
