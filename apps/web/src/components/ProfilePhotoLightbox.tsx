'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Modal, Text, VisuallyHidden } from '@mantine/core';
import { IconArrowUpRight } from '@tabler/icons-react';
import styles from './ProfilePhotoLightbox.module.css';

export default function ProfilePhotoLightbox({ opened, name, profileHref, children, onClose }: {
  opened: boolean;
  name: string;
  profileHref?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return <Modal.Root opened={opened} onClose={onClose} centered size="auto" xOffset="md" yOffset="md" classNames={{ content: styles.content }}
    closeOnClickOutside closeOnEscape trapFocus returnFocus>
    <Modal.Overlay backgroundOpacity={0.78} blur={4} />
    <Modal.Content aria-label={`Foto de ${name}`} onClick={onClose}>
      <Modal.Body className={styles.body}>
        <VisuallyHidden><button type="button" data-autofocus
          onClick={event => { event.stopPropagation(); onClose(); }}>Cerrar foto ampliada</button></VisuallyHidden>
        <div className={styles.photo} onClick={event => event.stopPropagation()}>
          {children}
        </div>
        <Text className={styles.name} fw={700} onClick={event => event.stopPropagation()}>
          {profileHref ? <Link href={profileHref} className={styles.nameLink} onClick={onClose}>
            <span>{name}</span><IconArrowUpRight size={20} stroke={1.5} aria-hidden />
          </Link> : name}
        </Text>
      </Modal.Body>
    </Modal.Content>
  </Modal.Root>;
}
