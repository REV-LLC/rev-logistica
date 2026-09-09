'use client';
import type { Dispatch, SetStateAction } from 'react';
import { useMemo, useState } from 'react';
import { normalizeLocalWhatsappPhone } from './request-formatting';
import type { Customer, CustomerWorksite } from './request-types';
import { GenerateFieldErrors } from './request-types';

type Options = {
  selectedWorksite: CustomerWorksite | null;
  selectedCustomer: Customer | null;
  setGenerateFieldErrors: Dispatch<SetStateAction<GenerateFieldErrors>>;
};

export function useRequestRecipients({
  selectedWorksite,
  selectedCustomer,
  setGenerateFieldErrors,
}: Options) {
  const [additionalRecipientPhones, setAdditionalRecipientPhones] = useState<
    string[]
  >([]);

  const [recipientPhoneDraft, setRecipientPhoneDraft] = useState('');

  const defaultWhatsappRecipients = useMemo(
    () => [
      {
        key: 'worksite',
        label: 'Encargado de obra',
        phone: normalizeLocalWhatsappPhone(selectedWorksite?.worksite.phone),
      },
      {
        key: 'customer',
        label: 'Cliente',
        phone: normalizeLocalWhatsappPhone(selectedCustomer?.phone),
      },
    ],
    [selectedCustomer?.phone, selectedWorksite?.worksite.phone],
  );

  const defaultWhatsappPhones = useMemo(
    () =>
      defaultWhatsappRecipients
        .map((recipient) => recipient.phone)
        .filter((phone): phone is string => Boolean(phone)),
    [defaultWhatsappRecipients],
  );

  const manualWhatsappPhones = useMemo(
    () =>
      additionalRecipientPhones.filter(
        (phone) => !defaultWhatsappPhones.includes(phone),
      ),
    [additionalRecipientPhones, defaultWhatsappPhones],
  );

  const whatsappRecipientPhones = useMemo(
    () => [
      ...new Set([...defaultWhatsappPhones, ...additionalRecipientPhones]),
    ],
    [additionalRecipientPhones, defaultWhatsappPhones],
  );

  const addWhatsappRecipient = () => {
    const phone = normalizeLocalWhatsappPhone(recipientPhoneDraft);
    if (!phone) {
      setGenerateFieldErrors((prev) => ({
        ...prev,
        recipientPhones:
          'Ingresa un número colombiano de exactamente 10 dígitos.',
      }));
      return;
    }
    if (whatsappRecipientPhones.includes(phone)) {
      setRecipientPhoneDraft('');
      setGenerateFieldErrors((prev) => ({
        ...prev,
        recipientPhones: undefined,
      }));
      return;
    }
    if (whatsappRecipientPhones.length >= 10) {
      setGenerateFieldErrors((prev) => ({
        ...prev,
        recipientPhones: 'Puedes agregar máximo 10 destinatarios.',
      }));
      return;
    }
    setAdditionalRecipientPhones((prev) => [...prev, phone]);
    setRecipientPhoneDraft('');
    setGenerateFieldErrors((prev) => ({ ...prev, recipientPhones: undefined }));
  };

  const removeWhatsappRecipient = (phone: string) => {
    setAdditionalRecipientPhones((prev) =>
      prev.filter((value) => value !== phone),
    );
    setGenerateFieldErrors((prev) => ({ ...prev, recipientPhones: undefined }));
  };
  return {
    setAdditionalRecipientPhones,
    recipientPhoneDraft,
    setRecipientPhoneDraft,
    defaultWhatsappRecipients,
    manualWhatsappPhones,
    whatsappRecipientPhones,
    addWhatsappRecipient,
    removeWhatsappRecipient,
  };
}
