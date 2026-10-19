'use client';

import { MantineProvider, createTheme } from '@mantine/core';
import OfflineManager from './OfflineManager';
import LoginTransition from './LoginTransition';
import EmployeePhotoPreviewProvider from './EmployeePhotoPreviewProvider';

const theme = createTheme({
  fontFamily: 'Space Grotesk, sans-serif',
  headings: { fontFamily: 'Space Grotesk, sans-serif' },
});

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MantineProvider theme={theme}>
      <EmployeePhotoPreviewProvider><LoginTransition>{children}</LoginTransition></EmployeePhotoPreviewProvider>
      <OfflineManager />
    </MantineProvider>
  );
}
