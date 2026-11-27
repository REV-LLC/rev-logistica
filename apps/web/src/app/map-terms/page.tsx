import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@mantine/core';
import styles from '../privacy/privacy.module.css';

export const metadata: Metadata = { title: 'Condiciones del mapa | REV Logística' };

export default function MapTermsPage() {
  return <div className={styles.page}><main className={styles.main}><Container size="md"><article className={styles.article}>
    <h1 className={styles.title}>Condiciones de la función de mapas</h1>
    <section className={styles.section}><h2>Seguimiento y recorridos</h2>
      <p>La función permite a usuarios autorizados de REV consultar la ubicación y los recorridos GPS registrados de la flota.
        La conexión de una tablet no garantiza que su ubicación esté actualizada; revisa siempre la hora del último reporte.</p>
      <p>El recorrido muestra los puntos recibidos de los dispositivos GPS. Los períodos sin continuidad GPS se muestran como tramos separados.</p>
    </section>
    <section className={styles.section}><h2>Mapbox</h2>
      <p>Esta función utiliza Mapbox Platform. Su uso está sujeto a las{' '}
        <a href="https://www.mapbox.com/legal/tos" target="_blank" rel="noopener noreferrer">Condiciones de servicio de Mapbox</a>{' '}
        y a la <a href="https://www.mapbox.com/legal/privacy" target="_blank" rel="noopener noreferrer">Política de privacidad de Mapbox</a>.</p>
      <p>REV informa del tratamiento de los reportes GPS en su{' '}
        <Link href="/privacy">Política de privacidad</Link>.</p>
    </section><Link href="/transport/tracking">Volver al mapa de REV</Link>
  </article></Container></main></div>;
}
