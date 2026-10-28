'use client';

import { MantineProvider } from '@mantine/core';
import { usePathname } from 'next/navigation';
import { appTheme, appThemeVariables, usesDarkGlassTheme } from '@/lib/app-theme';
import OfflineManager from './OfflineManager';
import LoginTransition from './LoginTransition';
import EmployeePhotoPreviewProvider from './EmployeePhotoPreviewProvider';
import { Suspense } from 'react';
import PageLoadingBoundary from './PageLoadingBoundary';
import PageLoadingOverlay from './PageLoadingOverlay';

export default function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <MantineProvider theme={appTheme} cssVariablesResolver={appThemeVariables} forceColorScheme={usesDarkGlassTheme(pathname) ? 'dark' : 'light'}>
      <EmployeePhotoPreviewProvider><LoginTransition>
        <Suspense fallback={<PageLoadingOverlay />}>
          <PageLoadingBoundary>{children}</PageLoadingBoundary>
        </Suspense>
      </LoginTransition></EmployeePhotoPreviewProvider>
      <OfflineManager />
    </MantineProvider>
  );
}
