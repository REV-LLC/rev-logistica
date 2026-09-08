'use client';

import { FormEvent, Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { Button, PasswordInput, TextInput } from '@mantine/core';
import {
  IconArrowRight,
  IconChartBar,
  IconCube,
  IconFileDescription,
  IconLock,
  IconMail,
  IconMapPin,
  IconShieldLock,
} from '@tabler/icons-react';
import { api, ApiError } from '@/lib/api';
import {
  consumeSessionExpiredNotice,
  getCurrentUserRole,
  getPostLoginDestination,
  getToken,
  isAuthBypassEnabled,
  isTokenExpired,
  setToken,
} from '@/lib/auth';
import styles from './login.module.css';

const features = [
  { icon: IconCube, title: 'Inventario', description: 'en tiempo real' },
  { icon: IconFileDescription, title: 'Remisiones', description: 'y devoluciones' },
  { icon: IconMapPin, title: 'Seguimiento', description: 'en obra' },
  { icon: IconChartBar, title: 'Reportes', description: 'y control' },
];

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showExpiredNotice, setShowExpiredNotice] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);

  useEffect(() => {
    setIsMounted(true);

    if (isAuthBypassEnabled()) {
      router.replace(getPostLoginDestination(searchParams.get('next'), getCurrentUserRole()));
      return;
    }

    const token = getToken();
    if (token && !isTokenExpired(token)) {
      router.replace(getPostLoginDestination(searchParams.get('next'), getCurrentUserRole()));
      return;
    }

    const reason = searchParams.get('reason');
    if (reason === 'expired') {
      setShowExpiredNotice(consumeSessionExpiredNotice());
    }

    if (reason) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete('reason');
      const query = params.toString();
      router.replace(query ? `/login?${query}` : '/login');
    }
  }, [router, searchParams]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      const data = await api<{ accessToken: string }>('/auth/login', {
        method: 'POST',
        auth: false,
        json: { identifier, password }
      });
      if (!data?.accessToken) {
        throw new Error('No se pudo iniciar sesión. Inténtalo de nuevo.');
      }
      setToken(data.accessToken);
      router.replace(
        getPostLoginDestination(searchParams.get('next'), getCurrentUserRole()),
      );
    } catch (err) {
      if (err instanceof ApiError) {
        setError(
          err.status === 401
            ? 'El usuario o la contraseña son incorrectos.'
            : `No se pudo iniciar sesión. ${err.message}`,
        );
      } else if (err instanceof TypeError) {
        setError('No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.');
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Ocurrió un error inesperado. Inténtalo de nuevo.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (!isMounted) {
    return null;
  }

  return (
    <main className={styles.page}>
      <div className={styles.photograph} aria-hidden="true">
        <Image
          src="/login/excavator.webp"
          alt=""
          fill
          priority
          sizes="(max-width: 999px) 100vw, 74vw"
          className={styles.backgroundImage}
        />
      </div>
      <div className={styles.lightPanel} aria-hidden="true" />

      <section className={styles.hero} aria-labelledby="login-hero-title">
        <div className={styles.heroContent}>
          <p className={styles.brand}>REV LOGÍSTICA</p>
          <h2 id="login-hero-title" className={styles.headline}>
            Equipos<br />
            <span>que mueven</span><br />
            tu proyecto
          </h2>
          <p className={styles.description}>
            Control, trazabilidad y disponibilidad<br className={styles.desktopBreak} />
            {' '}de tu maquinaria, herramientas<br className={styles.desktopBreak} />
            {' '}y materiales, en un solo lugar.
          </p>
          <ul className={styles.features}>
            {features.map(({ icon: Icon, title, description }) => (
              <li key={title} className={styles.feature}>
                <span className={styles.featureIcon}>
                  <Icon size={38} stroke={1.45} aria-hidden="true" />
                </span>
                <span><strong>{title}</strong><br />{description}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className={styles.tagline}>PARA QUE NADA TE DETENGA</p>
      </section>

      <section className={styles.accessPanel} aria-labelledby="login-title">
        <div className={styles.panelBrand} aria-hidden="true">REV LOGÍSTICA<span /></div>
        <div className={styles.card}>
          <Image
            src="/rev-logo-clean.svg"
            alt="REV · Renta Equipos del Valle"
            width={190}
            height={190}
            priority
            className={styles.logo}
          />
          <header className={styles.welcome}>
            <h1 id="login-title">Bienvenido</h1>
            <p>Ingresa a tu cuenta para continuar</p>
          </header>
          <form className={styles.form} onSubmit={handleSubmit} aria-busy={loading}>
            {showExpiredNotice && (
              <p className={styles.notice} role="status">
                Tu sesión expiró. Inicia sesión de nuevo para continuar.
              </p>
            )}
            <TextInput
              id="login-identifier"
              name="identifier"
              label={<span className={styles.label}><IconMail size={17} stroke={1.7} aria-hidden="true" />Usuario o correo</span>}
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              placeholder="Cédula o usuario@empresa.com"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              classNames={{ input: styles.input, label: styles.fieldLabel }}
              aria-describedby={error ? 'login-error' : undefined}
              required
              withAsterisk={false}
            />
            <PasswordInput
              id="login-password"
              name="password"
              label={<span className={styles.label}><IconLock size={17} stroke={1.7} aria-hidden="true" />Contraseña</span>}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Ingresa tu contraseña"
              autoComplete="current-password"
              visible={passwordVisible}
              onVisibilityChange={setPasswordVisible}
              visibilityToggleButtonProps={{
                'aria-label': passwordVisible ? 'Ocultar contraseña' : 'Mostrar contraseña',
                'aria-pressed': passwordVisible,
              }}
              classNames={{ input: styles.input, innerInput: styles.passwordInner, label: styles.fieldLabel, visibilityToggle: styles.visibilityToggle }}
              aria-describedby={error ? 'login-error' : undefined}
              required
              withAsterisk={false}
            />
            {error && <p id="login-error" className={styles.error} role="alert">{error}</p>}
            <Button
              type="submit"
              loading={loading}
              className={styles.submit}
              rightSection={<IconArrowRight size={21} stroke={1.8} aria-hidden="true" />}
              loaderProps={{ color: '#17191f', size: 20 }}
            >
              {loading ? 'Ingresando…' : 'Iniciar sesión'}
            </Button>
          </form>
          <p className={styles.secure}><IconShieldLock size={20} stroke={1.65} aria-hidden="true" />Acceso seguro y protegido</p>
        </div>
        <p className={styles.panelFooter}>GESTIONA <span>·</span> CONTROLA <span>·</span> CONSTRUYE</p>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageContent />
    </Suspense>
  );
}
