import { createTheme, type CSSVariablesResolver } from '@mantine/core';

const publicRoutes = ['/login', '/privacy', '/actualizar-datos', '/documents/shared'];

export function usesDarkGlassTheme(pathname: string | null) {
  if (!pathname) return false;
  return !publicRoutes.some(route => pathname === route || pathname.startsWith(`${route}/`));
}

export const appTheme = createTheme({
  fontFamily: 'Space Grotesk, sans-serif',
  headings: { fontFamily: 'Space Grotesk, sans-serif' },
  colors: {
    dark: ['#edf2f6', '#d7e0e6', '#bcc9d3', '#9eacb8', '#65727e', '#4a545c', '#3e484f', '#343b40', '#293136', '#20272c'],
  },
});

export const appThemeVariables: CSSVariablesResolver = () => ({
  variables: {
    '--rev-glass-background': '#343b40',
    '--rev-glass-overlay': 'rgba(39, 47, 53, 0.94)',
    '--rev-glass-line': 'rgba(255, 255, 255, 0.16)',
    '--rev-glass-hover': 'rgba(255, 255, 255, 0.1)',
  },
  light: {},
  dark: {
    '--rev-glass-surface': 'rgba(255, 255, 255, 0.06)',
    '--ui-color-title': '#fff',
    '--ui-color-label': '#f1f5f9',
    '--ui-color-body': '#cbd3d9',
    '--mantine-color-body': '#343b40',
    '--mantine-color-text': '#f1f5f9',
    '--mantine-color-dimmed': '#c0cbd3',
    '--mantine-color-default': 'rgba(255, 255, 255, 0.06)',
    '--mantine-color-default-hover': 'rgba(255, 255, 255, 0.11)',
    '--mantine-color-default-color': '#f1f5f9',
    '--mantine-color-default-border': 'rgba(255, 255, 255, 0.18)',
    '--mantine-color-anchor': '#a6d5ff',
    '--mantine-color-blue-light-color': '#a6d5ff',
    '--mantine-color-teal-light-color': '#9ee7d4',
    '--mantine-color-green-light-color': '#afe9ba',
    '--mantine-color-gray-light-color': '#e0e7ed',
    '--mantine-color-orange-light-color': '#ffd09b',
    '--mantine-color-red-light-color': '#ffb4b4',
    '--mantine-color-yellow-light-color': '#fce5a0',
    '--mantine-color-cyan-light-color': '#9de4ed',
    '--mantine-color-violet-light-color': '#d7c6ff',
    '--mantine-color-indigo-light-color': '#c1caff',
    '--mantine-color-pink-light-color': '#ffc2df',
    '--mantine-color-grape-light-color': '#ecc4ff',
    '--mantine-color-lime-light-color': '#d6efae',
    '--inventory-ink': '#f1f5f9',
    '--inventory-muted': '#c0cbd3',
    '--inventory-line': 'rgba(255, 255, 255, 0.16)',
    '--inventory-surface': 'rgba(255, 255, 255, 0.06)',
    '--inventory-hover': 'rgba(255, 255, 255, 0.1)',
    '--inventory-accent': '#ffc296',
    '--inventory-accent-bg': 'rgba(255, 163, 97, 0.12)',
    '--inventory-image-bg': 'rgba(255, 255, 255, 0.04)',
    '--inventory-status-bg': '#343b40',
    '--rev-calendar-surface': 'rgba(255, 255, 255, 0.04)',
    '--rev-calendar-selected': 'rgba(255, 163, 97, 0.16)',
    '--rev-calendar-ink': '#f1f5f9',
    '--rev-calendar-muted': '#c0cbd3',
  },
});
