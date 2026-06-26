'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
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
};

type NavSection = {
  title: string;
  links: NavLinkItem[];
};

const sections: NavSection[] = [
  {
    title: 'Operacion',
    links: [
      { href: '/transport/requests', label: 'Solicitudes', icon: IconClipboardList, roles: ['ADMIN', 'OFFICE', 'DRIVER'] },
      { href: '/transport/vehicles', label: 'Vehiculos', icon: IconTruck, roles: ['ADMIN', 'OFFICE'] },
      { href: '/transport/worksites', label: 'Obras', icon: IconBuilding, roles: ['ADMIN', 'OFFICE'] },
      { href: '/tasks', label: 'Pendientes', icon: IconChecklist, roles: ['ADMIN', 'OFFICE'] },
    ],
  },
  {
    title: 'Inventario',
    links: [
      { href: '/inventory/warehouse', label: 'Bodegas', icon: IconBuildingWarehouse, roles: ['ADMIN', 'OFFICE'] },
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
    title: 'Administracion',
    links: [
      { href: '/billing/pre-invoice', label: 'Prefactura', icon: IconReceipt, roles: ['ADMIN', 'OFFICE'] },
      { href: '/billing/price-list', label: 'Lista de precios', icon: IconTag, roles: ['ADMIN', 'OFFICE'] },
      { href: '/customers', label: 'Clientes', icon: IconUsers, roles: ['ADMIN', 'OFFICE'] },
      { href: '/employees', label: 'Empleados', icon: IconUser, roles: ['ADMIN', 'OFFICE'] },
    ],
  },
  {
    title: 'Ajustes',
    links: [
      { href: '/settings/catalog-options', label: 'Catalogo items', icon: IconSettings, roles: ['ADMIN'] },
    ],
  },
];

const toolLinks: NavLinkItem[] = [
  { href: '/tools/quotation', label: 'Cotizacion', icon: IconFileDollar, roles: ['ADMIN', 'OFFICE'] },
  { href: '/transport/cost', label: 'Transporte', icon: IconMap2, roles: ['ADMIN', 'OFFICE'] },
  { href: '/inventory/scaffold-modulations', label: 'Modulaciones', icon: IconRulerMeasure, roles: ['ADMIN', 'OFFICE'] },
  { href: '/data', label: 'Datos', icon: IconDatabaseExport, roles: ['ADMIN'] },
];

const prodDisabledRoutes = ['/transport/cost', '/billing/pre-invoice'];
const isProduction = process.env.NODE_ENV === 'production';
const appVersion = process.env.NEXT_PUBLIC_APP_VERSION;
const mostUsedLinks = ['/transport/requests', '/inventory/warehouse', '/inventory/ledger'];

type NavProps = {
  onNavigate?: () => void;
};

export default function Nav({ onNavigate }: NavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const currentRole = getCurrentUserRole();
  const currentSession = getCurrentUserSession();
  const [openedSections, setOpenedSections] = useState<Record<string, boolean>>({});
  const canShowLink = (link: NavLinkItem) => {
    if (isProduction && prodDisabledRoutes.includes(link.href)) {
      return false;
    }

    return currentRole ? link.roles.includes(currentRole) : true;
  };
  const isLinkActive = (link: NavLinkItem) => {
    const prefixes = link.activePrefixes ?? [link.href];
    return prefixes.some((prefix) => pathname?.startsWith(prefix));
  };
  const visibleSections = sections
    .map((section) => ({
      ...section,
      links: section.links.filter(canShowLink),
    }))
    .filter((section) => section.links.length > 0);
  const visibleMainSections = visibleSections.filter((section) => section.title !== 'Ajustes');
  const visibleSettingsSection = visibleSections.find((section) => section.title === 'Ajustes');
  const visibleToolLinks = toolLinks.filter(canShowLink);
  const visibleToolSection: NavSection | null = visibleToolLinks.length
    ? { title: 'Herramientas', links: visibleToolLinks }
    : null;
  const orderedSections = [
    ...visibleMainSections,
    ...(visibleToolSection ? [visibleToolSection] : []),
    ...(visibleSettingsSection ? [visibleSettingsSection] : []),
  ];
  const allVisibleLinks = orderedSections.flatMap((section) => section.links);
  const quickLinks = mostUsedLinks
    .map((href) => allVisibleLinks.find((link) => link.href === href))
    .filter((link, index, list): link is NavLinkItem => Boolean(link) && list.findIndex((item) => item?.href === link?.href) === index)
    .slice(0, 3);
  const roleColor =
    currentRole === 'ADMIN' ? 'red' : currentRole === 'OFFICE' ? 'blue' : currentRole === 'DRIVER' ? 'teal' : 'gray';

  const handleLogout = () => {
    clearToken();
    onNavigate?.();
    router.replace('/login');
  };

  const renderNavItem = (link: NavLinkItem) => {
    const Icon = link.icon;
    const isActive = isLinkActive(link);

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
            paddingLeft: 'calc(var(--mantine-spacing-sm) - 3px)',
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
            fontSize: '0.8rem',
          },
          section: {
            display: 'flex',
            alignItems: 'center',
          },
        }}
        leftSection={
          <Box
            style={{
              width: 28,
              height: 28,
              borderRadius: 11,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              color: isActive ? '#b87500' : 'var(--mantine-color-gray-6)',
              background: isActive
                ? 'linear-gradient(135deg, rgba(217,154,24,0.24) 0%, rgba(255,229,153,0.9) 100%)'
                : 'rgba(148,163,184,0.10)',
              boxShadow: isActive ? '0 10px 22px rgba(217,154,24,0.28)' : 'none',
              border: isActive ? '1px solid rgba(217,154,24,0.32)' : '1px solid transparent',
            }}
          >
            <Icon size={18} stroke={1.9} />
          </Box>
        }
        onClick={onNavigate}
      />
    );
  };

  const renderSection = (section: NavSection) => {
    const isActive = section.links.some(isLinkActive);
    const isExpanded = openedSections[section.title] ?? isActive;

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
