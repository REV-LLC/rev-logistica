'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActionIcon, Alert, Button, Loader, Select, TextInput } from '@mantine/core';
import { IconBrandWhatsapp, IconCheck, IconCircleCheckFilled, IconClock, IconLock, IconMail, IconPlus, IconTrash, IconUser } from '@tabler/icons-react';
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

type RecipientOption = { value: string; label: string; detail: string };

function RecipientChoice({
  icon,
  title,
  question,
  options,
  selected,
  onSelect,
  customLabel,
  customPlaceholder,
  customType = 'text',
  customValue,
  onCustomChange,
}: {
  icon: ReactNode;
  title: string;
  question: string;
  options: RecipientOption[];
  selected: string;
  onSelect: (value: string) => void;
  customLabel: string;
  customPlaceholder: string;
  customType?: 'text' | 'email';
  customValue: string;
  onCustomChange: (value: string) => void;
}) {
  return (
    <div className={styles.recipientBlock}>
      <div className={styles.recipientHeading}>
        <span className={styles.channelIcon}>{icon}</span>
        <div>
          <strong>{title}</strong>
          <p>{question}</p>
        </div>
      </div>

      <div className={styles.recipientOptions}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`${styles.recipientOption} ${selected === option.value ? styles.selectedOption : ''}`}
            aria-pressed={selected === option.value}
            onClick={() => onSelect(option.value)}
          >
            <span>
              <small>{option.label}</small>
              <b>{option.detail}</b>
            </span>
            {selected === option.value ? <IconCircleCheckFilled size={22} /> : <span className={styles.emptyCheck} />}
          </button>
        ))}
        <button
          type="button"
          className={`${styles.recipientOption} ${selected === 'custom' ? styles.selectedOption : ''}`}
          aria-pressed={selected === 'custom'}
          onClick={() => onSelect('custom')}
        >
          <span>
            <small>Otra opción</small>
            <b>{customLabel}</b>
          </span>
          {selected === 'custom' ? <IconCircleCheckFilled size={22} /> : <span className={styles.emptyCheck} />}
        </button>
      </div>

      {selected === 'custom' ? (
        <TextInput
          className={styles.customRecipient}
          label={customLabel}
          placeholder={customPlaceholder}
          type={customType}
          inputMode={customType === 'email' ? 'email' : 'tel'}
          value={customValue}
          onChange={(event) => onCustomChange(event.currentTarget.value)}
        />
      ) : null}
    </div>
  );
}

export default function CustomerUpdateForm({ token }: { token: string }) {
  const [company, setCompany] = useState({ name: '', nitOrId: '' });
  const [updatedBy, setUpdatedBy] = useState('');
  const [contacts, setContacts] = useState<Contact[]>(() => [emptyContact()]);
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
        setPhoneSource(initial.find((contact) => contact.phone && contact.phone === data.documentsPhone)?.id ?? 'custom');
        setEmailSource(initial.find((contact) => contact.email && contact.email === data.documentsEmail)?.id ?? 'custom');
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'No pudimos abrir este enlace.'))
      .finally(() => setLoading(false));
  }, [token]);

  const phoneOptions = useMemo(() => contacts.filter((contact) => contact.phone.trim()).map((contact) => ({ value: contact.id, label: contact.label || types.find((type) => type.value === contact.type)?.label || 'Contacto', detail: contact.phone })), [contacts]);
  const emailOptions = useMemo(() => contacts.filter((contact) => contact.email.trim()).map((contact) => ({ value: contact.id, label: contact.label || types.find((type) => type.value === contact.type)?.label || 'Contacto', detail: contact.email })), [contacts]);

  const updateContact = (id: string, patch: Partial<Contact>) => {
    setContacts((current) => current.map((contact) => contact.id === id ? { ...contact, ...patch } : contact));
    if (phoneSource === id && patch.phone !== undefined) setDocumentsPhone(patch.phone);
    if (emailSource === id && patch.email !== undefined) setDocumentsEmail(patch.email);
  };
  const removeContact = (id: string) => {
    setContacts((current) => current.filter((contact) => contact.id !== id));
    if (phoneSource === id) setPhoneSource('custom');
    if (emailSource === id) setEmailSource('custom');
  };
  const selectPhone = (value: string) => { setPhoneSource(value); if (value !== 'custom') setDocumentsPhone(contacts.find((contact) => contact.id === value)?.phone ?? ''); };
  const selectEmail = (value: string) => { setEmailSource(value); if (value !== 'custom') setDocumentsEmail(contacts.find((contact) => contact.id === value)?.email ?? ''); };

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

  if (loading) return <main className={styles.loading}><Loader color="blue" /><span>Cargando tus datos…</span></main>;
  if (done) return <main className={styles.success}><div className={styles.successIcon}><IconCheck size={38} /></div><h1>Datos actualizados</h1><p>Gracias, {updatedBy}. La información quedó guardada y usaremos estos destinos para los próximos documentos.</p></main>;

  return <main className={styles.page}>
    <header className={styles.topbar}><img src="/fiesta.svg" alt="Rev Logística" /><span /> <p>Actualización de datos</p></header>
    <div className={styles.shell}>
      <section className={styles.intro}>
        <h1>Mantengamos tus datos al día</h1><p>Confirma la información de tu empresa y elige dónde quieres recibir tus documentos.</p><small><IconClock size={17} /> Te tomará cerca de 3 minutos</small>
      </section>
      {error && <Alert color="red" role="alert" mb="md">{error}</Alert>}
      <section className={styles.section}><h2>Empresa</h2><div className={styles.companyGrid}><TextInput label="Razón social" value={company.name} disabled /><TextInput label="NIT" value={company.nitOrId} disabled /><TextInput required label="Nombre de quien actualiza" placeholder="Tu nombre completo" leftSection={<IconUser size={17} />} value={updatedBy} onChange={(e) => setUpdatedBy(e.currentTarget.value)} /></div></section>
      <section className={styles.section}><h2>Contactos de la empresa</h2><p className={styles.helper}>Agrega solo los que uses. Puedes indicar para qué sirve cada contacto.</p>
        <div className={styles.contacts}>{contacts.map((contact) => <div className={styles.contactRow} key={contact.id}>
          <Select label="Tipo de contacto" data={types} value={contact.type} onChange={(value) => updateContact(contact.id, { type: value as ContactType })} />
          <TextInput label="Nombre o área" placeholder="Ej. Recepción" value={contact.label} onChange={(e) => updateContact(contact.id, { label: e.currentTarget.value })} />
          <TextInput label="Teléfono / WhatsApp" inputMode="tel" placeholder="300 123 4567" value={contact.phone} onChange={(e) => updateContact(contact.id, { phone: e.currentTarget.value })} />
          <TextInput label="Correo" type="email" placeholder="correo@empresa.com" value={contact.email} onChange={(e) => updateContact(contact.id, { email: e.currentTarget.value })} />
          <ActionIcon className={styles.remove} variant="subtle" color="gray" aria-label="Eliminar contacto" disabled={contacts.length === 1} onClick={() => removeContact(contact.id)}><IconTrash size={19} /></ActionIcon>
        </div>)}</div>
        <Button variant="outline" color="dark" leftSection={<IconPlus size={18} />} onClick={() => setContacts((all) => [...all, emptyContact()])}>Agregar otro contacto</Button>
      </section>
      <section className={styles.section}><h2>Envío de documentos</h2><p className={styles.helper}>Selecciona directamente el teléfono y el correo donde quieres recibirlos.</p>
        <RecipientChoice icon={<IconBrandWhatsapp size={24} />} title="WhatsApp" question="¿A qué número enviamos los documentos?" options={phoneOptions} selected={phoneSource} onSelect={selectPhone} customLabel="Usar otro número" customPlaceholder="Ej. 300 123 4567" customValue={documentsPhone} onCustomChange={setDocumentsPhone} />
        <RecipientChoice icon={<IconMail size={24} />} title="Correo" question="¿A qué correo enviamos los documentos?" options={emailOptions} selected={emailSource} onSelect={selectEmail} customLabel="Usar otro correo" customPlaceholder="Ej. documentos@empresa.com" customType="email" customValue={documentsEmail} onCustomChange={setDocumentsEmail} />
        <div className={styles.summary}><IconCheck size={24} /><strong>Tus documentos llegarán a</strong><span><IconBrandWhatsapp size={18} /> {documentsPhone || 'Por definir'}</span><span><IconMail size={18} /> {documentsEmail || 'Por definir'}</span></div>
      </section>
      <footer className={styles.footer}><p><IconLock size={17} /> Usaremos estos datos únicamente para la operación y el envío de documentos.</p><Button color="blue" leftSection={<IconCheck size={20} />} loading={saving} disabled={!token} onClick={submit}>Confirmar actualización</Button></footer>
    </div>
  </main>;
}
