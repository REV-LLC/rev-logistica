'use client';

import { MantineProvider, createTheme } from '@mantine/core';
import OfflineManager from './OfflineManager';
import LoginTransition from './LoginTransition';
import EmployeePhotoPreviewProvider from './EmployeePhotoPreviewProvider';
import { Suspense } from 'react';
import PageLoadingBoundary from './PageLoadingBoundary';
import PageLoadingOverlay from './PageLoadingOverlay';

const theme = createTheme({
  fontFamily: 'Space Grotesk, sans-serif',
  headings: { fontFamily: 'Space Grotesk, sans-serif' },
});

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MantineProvider theme={theme}>
      <EmployeePhotoPreviewProvider><LoginTransition>
        <Suspense fallback={<PageLoadingOverlay />}>
          <PageLoadingBoundary>{children}</PageLoadingBoundary>
        </Suspense>
      </LoginTransition></EmployeePhotoPreviewProvider>
      <OfflineManager />
    </MantineProvider>
  );
}
