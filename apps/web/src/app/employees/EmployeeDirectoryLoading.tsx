import { Container } from '@mantine/core';
import EmployeePageBackground from '@/components/EmployeePageBackground';
import styles from './directory.module.css';

/** The shared transition owns the loading UI; only the real background sits behind it. */
export default function EmployeeDirectoryLoading({ label = 'Cargando empleados' }: { label?: string }) {
  return <Container size="xl" py="xl" className={styles.page}>
    <EmployeePageBackground src="/employees/rev-directory-v1.webp" mobileSrc="/employees/rev-directory-mobile-v1.webp" variant="brand" />
    <div className={styles.loadingSpace} data-page-loading="true" role="status" aria-label={label} aria-busy="true" />
  </Container>;
}
