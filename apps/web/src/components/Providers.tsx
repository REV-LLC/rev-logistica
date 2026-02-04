'use client';

import { MantineProvider, createTheme } from '@mantine/core';

const theme = createTheme({
  fontFamily: 'Space Grotesk, sans-serif',
  headings: { fontFamily: 'Space Grotesk, sans-serif' },
});

export default function Providers({ children }: { children: React.ReactNode }) {
  return <MantineProvider theme={theme}>{children}</MantineProvider>;
}
