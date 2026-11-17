'use client';

import { useRef, useState } from 'react';
import { ActionIcon, TextInput } from '@mantine/core';
import { IconMapPin, IconSearch, IconX } from '@tabler/icons-react';
import { searchAttendanceSites } from '@/lib/attendance-site-search';
import type { AttendanceSite } from '@/lib/attendance';
import styles from './mobile-attendance.module.css';

export default function AttendanceWorksitePicker({ sites, onSelect, onBack }: { sites: AttendanceSite[]; onSelect: (site: AttendanceSite) => void; onBack: () => void }) {
  const [query, setQuery] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const visible = searchAttendanceSites(sites, query);
  return <section>
    <h1>¿En qué obra estás?</h1>
    <p>Busca por cliente o por nombre de la obra.</p>
    <TextInput
      ref={input}
      type="search"
      aria-label="Buscar obra o cliente"
      placeholder="Buscar obra o cliente"
      value={query}
      onChange={event => setQuery(event.currentTarget.value)}
      leftSection={<IconSearch size={18} aria-hidden="true" />}
      rightSection={query ? <ActionIcon variant="subtle" color="gray" aria-label="Limpiar búsqueda" onClick={() => { setQuery(''); input.current?.focus(); }}><IconX size={18} aria-hidden="true" /></ActionIcon> : undefined}
      autoComplete="off"
      autoCapitalize="none"
      spellCheck={false}
      size="md"
      radius="md"
      mt="md"
      styles={{input:{background:'rgba(255,255,255,0.07)',borderColor:'rgba(255,255,255,0.22)',color:'#fff',minHeight:48},section:{color:'#c8d2df'}}}
    />
    <p className={styles.searchCount} role="status" aria-live="polite">{visible.length} de {sites.length} obras</p>
    <div className={styles.choices}>{visible.map(site => <button key={site.id} className={`${styles.secondary} ${styles.choice}`} onClick={() => onSelect(site)}>
      <IconMapPin size={28} aria-hidden="true" /><span>{site.alias || site.worksite.name}<small>{site.customer.name}</small></span>
    </button>)}</div>
    {!sites.length ? <p className={styles.notice}>No hay obras disponibles. Pide ayuda al encargado.</p> : !visible.length ? <p className={styles.notice}>No encontramos obras o clientes con esa búsqueda.</p> : null}
    <button className={styles.link} onClick={onBack}>Volver</button>
  </section>;
}
