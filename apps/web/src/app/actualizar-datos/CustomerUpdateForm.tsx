'use client';

import { useEffect, useMemo, useState } from 'react';
import { ActionIcon, Alert, Button, Loader, Select, TextInput } from '@mantine/core';
import { IconCheck, IconClock, IconDeviceFloppy, IconLock, IconMail, IconPlus, IconTrash, IconUser, IconBrandWhatsapp } from '@tabler/icons-react';
import { api, ApiError } from '@/lib/api';
import styles from './customer-update.module.css';

type ContactType = 'GENERAL' | 'BILLING' | 'INFORMATION' | 'COMMERCIAL' | 'COLLECTIONS' | 'OTHER';
type Contact = { id: string; type: ContactType; label: string; phone: string; email: string };
type CustomerPayload = { name: string; nitOrId: string | null; contacts: Omit<Contact, 'id'>[]; documentsPhone: string; documentsEmail: string };

const types = [
  { value: 'GENERAL', label: 'General' }, { value: 'BILLING', label: 'Facturación' },
  { value: 'INFORMATION', label: 'Información' }, { value: 'COMMERCIAL', label: 'Comercial' },
  { value: 'COLLECTIONS', label: 'Cartera' }, { value: 'OTHER', label: 'Otro' },
];
const emptyContact = (): Contact => ({ id: crypto.randomUUID(), type: 'GENERAL', label: '', phone: '', email: '' });

export default function CustomerUpdateForm({ token }: { token: string }) {
  const [company, setCompany] = useState({ name: '', nitOrId: '' });
  const [updatedBy, setUpdatedBy] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([emptyContact()]);
  const [phoneSource, setPhoneSource] = useState('custom');
  const [emailSource, setEmailSource] = useState('custom');
  const [documentsPhone, setDocumentsPhone] = useState('');
  const [documentsEmail, setDocumentsEmail] = useState('');
  const [loading, setLoading] = useState(Boolean(token));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(token ? null : 'Este enlace no incluye un código de actualización válido.');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) return;
    api<CustomerPayload>(`/public/customer-updates/${token}`, { auth: false, redirectOnAuthError: false })
      .then((data) => {
        setCompany({ name: data.name, nitOrId: data.nitOrId ?? '' });
        const initial = data.contacts.length
          ? data.contacts.map((contact) => ({ ...contact, id: crypto.randomUUID(), phone: contact.phone ?? '', email: contact.email ?? '' }))
          : [emptyContact()];
        setContacts(initial);
        setDocumentsPhone(data.documentsPhone ?? '');
        setDocumentsEmail(data.documentsEmail ?? '');
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'No pudimos abrir este enlace.'))
      .finally(() => setLoading(false));
  }, [token]);

  const phoneOptions = useMemo(() => contacts.filter((c) => c.phone.trim()).map((c) => ({ value: c.id, label: `${types.find((t) => t.value === c.type)?.label} · ${c.phone}` })), [contacts]);
  const emailOptions = useMemo(() => contacts.filter((c) => c.email.trim()).map((c) => ({ value: c.id, label: `${types.find((t) => t.value === c.type)?.label} · ${c.email}` })), [contacts]);

  const updateContact = (id: string, patch: Partial<Contact>) => setContacts((current) => current.map((contact) => contact.id === id ? { ...contact, ...patch } : contact));
  const selectPhone = (value: string | null) => { const next = value ?? 'custom'; setPhoneSource(next); if (next !== 'custom') setDocumentsPhone(contacts.find((c) => c.id === next)?.phone ?? ''); };
  const selectEmail = (value: string | null) => { const next = value ?? 'custom'; setEmailSource(next); if (next !== 'custom') setDocumentsEmail(contacts.find((c) => c.id === next)?.email ?? ''); };

  const submit = async () => {
    setError(null);
    if (!updatedBy.trim() || !documentsPhone.trim() || !documentsEmail.trim()) { setError('Completa quién actualiza y los dos destinos de documentos.'); return; }
    setSaving(true);
    try {
      await api(`/public/customer-updates/${token}`, {
        method: 'PATCH', auth: false, redirectOnAuthError: false,
        json: { updatedBy, contacts: contacts.map(({ id: _id, ...contact }) => contact), documentsPhone, documentsEmail },
      });
      setDone(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) { setError(err instanceof ApiError ? err.message : 'No pudimos guardar la actualización.'); }
    finally { setSaving(false); }
  };

  if (loading) return <main className={styles.loading}><Loader color="red" /><span>Cargando tus datos…</span></main>;
  if (done) return <main className={styles.success}><div className={styles.successIcon}><IconCheck size={38} /></div><h1>Datos actualizados</h1><p>Gracias, {updatedBy}. La información quedó guardada y usaremos estos destinos para los próximos documentos.</p></main>;

  return <main className={styles.page}>
    <header className={styles.topbar}><strong>REV</strong><span /> <p>Actualización de datos</p></header>
    <div className={styles.shell}>
      <section className={styles.intro}>
        <div><h1>Mantengamos tus datos al día</h1><p>Confirma la información de tu empresa y elige dónde quieres recibir tus documentos.</p><small><IconClock size={17} /> Te tomará cerca de 3 minutos</small></div>
        <ol className={styles.steps}><li><b>1</b><span>Empresa</span></li><li className={styles.active}><b>2</b><span>Contactos</span></li><li><b>3</b><span>Documentos</span></li></ol>
      </section>
      {error && <Alert color="red" role="alert" mb="md">{error}</Alert>}
      <section className={styles.section}><h2>Empresa</h2><div className={styles.companyGrid}><TextInput label="Razón social" value={company.name} disabled /><TextInput label="NIT" value={company.nitOrId} disabled /><TextInput required label="Nombre de quien actualiza" placeholder="Tu nombre completo" leftSection={<IconUser size={17} />} value={updatedBy} onChange={(e) => setUpdatedBy(e.currentTarget.value)} /></div></section>
      <section className={styles.section}><h2>Contactos de la empresa</h2><p className={styles.helper}>Agrega solo los que uses. Puedes indicar para qué sirve cada contacto.</p>
        <div className={styles.contacts}>{contacts.map((contact) => <div className={styles.contactRow} key={contact.id}>
          <Select label="Tipo de contacto" data={types} value={contact.type} onChange={(value) => updateContact(contact.id, { type: value as ContactType })} />
          <TextInput label="Nombre o área" placeholder="Ej. Recepción" value={contact.label} onChange={(e) => updateContact(contact.id, { label: e.currentTarget.value })} />
          <TextInput label="Teléfono / WhatsApp" inputMode="tel" placeholder="300 123 4567" value={contact.phone} onChange={(e) => updateContact(contact.id, { phone: e.currentTarget.value })} />
          <TextInput label="Correo" type="email" placeholder="correo@empresa.com" value={contact.email} onChange={(e) => updateContact(contact.id, { email: e.currentTarget.value })} />
          <ActionIcon className={styles.remove} variant="subtle" color="red" aria-label="Eliminar contacto" disabled={contacts.length === 1} onClick={() => setContacts((all) => all.filter((item) => item.id !== contact.id))}><IconTrash size={19} /></ActionIcon>
        </div>)}</div>
        <Button variant="outline" color="dark" leftSection={<IconPlus size={18} />} onClick={() => setContacts((all) => [...all, emptyContact()])}>Agregar otro contacto</Button>
      </section>
      <section className={styles.section}><h2>Envío de documentos</h2>
        <div className={styles.destination}><IconBrandWhatsapp className={styles.whatsapp} size={28} /><strong>WhatsApp</strong><Select label="Usar el teléfono de" data={[...phoneOptions, { value: 'custom', label: 'Usar otro número' }]} value={phoneSource} onChange={selectPhone} /><TextInput label="Número que recibirá documentos" inputMode="tel" value={documentsPhone} onChange={(e) => { setPhoneSource('custom'); setDocumentsPhone(e.currentTarget.value); }} /></div>
        <div className={styles.destination}><IconMail className={styles.mail} size={28} /><strong>Correo</strong><Select label="Usar el correo de" data={[...emailOptions, { value: 'custom', label: 'Usar otro correo' }]} value={emailSource} onChange={selectEmail} /><TextInput label="Correo que recibirá documentos" type="email" value={documentsEmail} onChange={(e) => { setEmailSource('custom'); setDocumentsEmail(e.currentTarget.value); }} /></div>
        <div className={styles.summary}><IconCheck size={24} /><strong>Tus documentos llegarán a</strong><span><IconBrandWhatsapp size={18} /> {documentsPhone || 'Por definir'}</span><span><IconMail size={18} /> {documentsEmail || 'Por definir'}</span></div>
      </section>
      <footer className={styles.footer}><p><IconLock size={17} /> Usaremos estos datos únicamente para la operación y el envío de documentos.</p><div><Button variant="outline" color="dark" leftSection={<IconDeviceFloppy size={18} />} disabled>Guardar y continuar después</Button><Button color="red" leftSection={<IconCheck size={20} />} loading={saving} disabled={!token} onClick={submit}>Confirmar actualización</Button></div></footer>
    </div>
  </main>;
}
