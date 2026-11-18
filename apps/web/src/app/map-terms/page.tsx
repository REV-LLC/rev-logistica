import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@mantine/core';
import styles from '../privacy/privacy.module.css';

export const metadata: Metadata = { title: 'Condiciones del mapa | REV Logística' };

export default function MapTermsPage() {
  return <div className={styles.page}><main className={styles.main}><Container size="md"><article className={styles.article}>
    <h1 className={styles.title}>Condiciones de la función de mapas</h1>
    <section className={styles.section}><h2>Seguimiento y planificación</h2>
      <p>La función permite a usuarios autorizados de REV consultar los reportes GPS de la flota y solicitar rutas orientativas.
        La conexión de una tablet no garantiza que su ubicación esté actualizada; revisa siempre la hora del último reporte.</p>
      <p>Las rutas y las horas estimadas de llegada dependen de los datos disponibles y pueden variar.
        No comprueban las restricciones particulares de altura, peso o acceso del camión.</p>
    </section>
    <section className={styles.section}><h2>Google Maps</h2>
      <p>Esta función utiliza Google Maps Platform. Su uso está sujeto a las{' '}
        <a href="https://maps.google.com/help/terms_maps/" target="_blank" rel="noopener noreferrer">Condiciones de servicio de Google Maps</a>{' '}
        y a la <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Política de privacidad de Google</a>.</p>
      <p>REV informa del tratamiento de los reportes y de los datos enviados para calcular rutas en su{' '}
        <Link href="/privacy">Política de privacidad</Link>.</p>
    </section><Link href="/transport/tracking">Volver al mapa de REV</Link>
  </article></Container></main></div>;
}
