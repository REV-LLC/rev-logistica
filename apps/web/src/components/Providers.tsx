'use client';

import { MantineProvider, createTheme } from '@mantine/core';
import OfflineManager from './OfflineManager';

const theme = createTheme({
  fontFamily: 'Space Grotesk, sans-serif',
  headings: { fontFamily: 'Space Grotesk, sans-serif' },
});

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MantineProvider theme={theme}>
      {children}
      <OfflineManager />
    </MantineProvider>
  );
}
