import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Container } from '@mantine/core';
import styles from './privacy.module.css';

export const metadata: Metadata = {
  title: 'Política de privacidad | REV Logística',
  description:
    'Política de privacidad de REV Logística para el tratamiento de datos en sus operaciones y comunicaciones.',
};

export default function PrivacyPage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Container size="lg" className={styles.headerInner}>
          <Link href="/" className={styles.brand} aria-label="Ir al inicio de REV Logística">
            <Image src="/rev-logo-clean.svg" alt="REV Logística" width={132} height={44} priority />
            <span className={styles.brandName}>REV Logística</span>
          </Link>
          <Link href="/" className={styles.backLink}>
            Volver a la aplicación
          </Link>
        </Container>
      </header>

      <main className={styles.main}>
        <Container size="lg">
          <article className={styles.article}>
            <div className={styles.intro}>
              <h1 className={styles.title}>Política de privacidad</h1>
              <p className={styles.updated}>Última actualización: 3 de agosto de 2026</p>
              <p className={styles.summary}>
                Esta política explica cómo REV Logística, operada por REV Contractors LLC,
                recopila, utiliza y protege la información necesaria para prestar sus servicios
                logísticos, administrar activos y enviar comunicaciones operativas.
              </p>
            </div>

            <section className={styles.section}>
              <h2>1. Información que recopilamos</h2>
              <p>Podemos tratar información proporcionada por usuarios, clientes y proveedores, como:</p>
              <ul>
                <li>Nombre, correo electrónico, número de teléfono y datos de la organización.</li>
                <li>Información de obras, solicitudes, remisiones, entregas y devoluciones.</li>
                <li>Datos relacionados con vehículos, equipos, activos, horómetros y mantenimientos.</li>
                <li>Documentos, fotografías y evidencias cargadas durante la operación.</li>
                <li>Registros técnicos y de seguridad necesarios para operar y proteger la plataforma.</li>
              </ul>
            </section>

            <section className={styles.section}>
              <h2>2. Cómo utilizamos la información</h2>
              <p>Usamos la información para:</p>
              <ul>
                <li>Gestionar inventario, activos, vehículos, obras y documentos operativos.</li>
                <li>Procesar solicitudes y compartir enlaces o copias de documentos con sus destinatarios.</li>
                <li>Enviar alertas de mantenimiento, vencimientos y otros recordatorios configurados.</li>
                <li>Dar soporte, resolver incidentes y mejorar la seguridad y funcionamiento del servicio.</li>
                <li>Cumplir obligaciones contractuales, contables y legales aplicables.</li>
              </ul>
            </section>

            <section className={styles.section}>
              <h2>3. Comunicaciones por WhatsApp</h2>
              <p>
                Cuando un usuario autorizado registra un número de destinatario, o cuando un cliente tiene
                un número asociado, REV Logística puede enviar mensajes operativos mediante WhatsApp. Estos
                mensajes pueden incluir alertas, confirmaciones y enlaces seguros a documentos relacionados
                con la operación.
              </p>
              <p>
                No usamos estos números para venderlos ni para enviar publicidad de terceros. El destinatario
                puede solicitar que se suspendan estas comunicaciones escribiendo al correo indicado al final
                de esta política.
              </p>
            </section>

            <section className={styles.section}>
              <h2>4. Proveedores y divulgación</h2>
              <p>
                Podemos compartir únicamente la información necesaria con proveedores que alojan la plataforma,
                almacenan archivos, procesan bases de datos o entregan comunicaciones. Entre ellos puede estar
                Meta Platforms para el envío de mensajes por WhatsApp. Estos proveedores tratan la información
                conforme a sus propios términos y medidas de seguridad.
              </p>
              <p>
                También podremos divulgar información cuando sea necesario para cumplir una obligación legal,
                proteger derechos o investigar usos indebidos. No vendemos datos personales.
              </p>
            </section>

            <section className={styles.section}>
              <h2>5. Conservación y seguridad</h2>
              <p>
                Conservamos la información durante el tiempo necesario para prestar el servicio, mantener el
                historial operativo y cumplir obligaciones aplicables. Implementamos controles técnicos y
                organizativos razonables para reducir riesgos de acceso, pérdida, alteración o divulgación no
                autorizada. Ningún sistema puede garantizar seguridad absoluta.
              </p>
            </section>

            <section className={styles.section}>
              <h2>6. Derechos y solicitudes</h2>
              <p>
                Las personas pueden solicitar información sobre sus datos, pedir su corrección, actualización
                o eliminación cuando corresponda, y retirar autorizaciones para comunicaciones futuras. Algunas
                solicitudes pueden estar sujetas a requisitos de verificación o conservación legal.
              </p>
            </section>

            <section className={styles.section}>
              <h2>7. Cambios a esta política</h2>
              <p>
                Podemos actualizar esta política para reflejar cambios en la plataforma, los proveedores o los
                requisitos aplicables. La fecha de actualización publicada en esta página indica la versión vigente.
              </p>
            </section>

            <section className={styles.section}>
              <h2>8. Contacto</h2>
              <p>
                Para consultas o solicitudes sobre privacidad, escribe a{' '}
                <a href="mailto:sg@revcontractorsllc.com">sg@revcontractorsllc.com</a>.
              </p>
            </section>
          </article>
        </Container>
      </main>

      <footer className={styles.footer}>
        <Container size="lg">© 2026 REV Contractors LLC. Todos los derechos reservados.</Container>
      </footer>
    </div>
  );
}
