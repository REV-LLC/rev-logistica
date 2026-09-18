import type { ReactNode } from 'react';
import classes from './FormGrid.module.css';

/** Aligns each row's labels, controls, descriptions and errors on shared tracks. */
export default function FormGrid({ children, mt }: { children: ReactNode; mt?: 'md' }) {
  return (
    <div className={classes.container} style={mt ? { marginTop: 'var(--mantine-spacing-md)' } : undefined}>
      <div className={classes.grid}>{children}</div>
    </div>
  );
}
