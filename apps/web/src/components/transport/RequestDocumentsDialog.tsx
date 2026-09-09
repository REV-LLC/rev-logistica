'use client';
import FileAttachmentsPanel from '@/components/FileAttachmentsPanel';
import { Modal } from '@mantine/core';
import type { Dispatch, SetStateAction } from 'react';
import { RequestDocument } from './request-types';

type Props = {
  documentsRequest: RequestDocument | null;
  setDocumentsRequest: Dispatch<SetStateAction<RequestDocument | null>>;
  isDriverRole: boolean;
};

export default function RequestDocumentsDialog({
  documentsRequest,
  setDocumentsRequest,
  isDriverRole,
}: Props) {
  return (
    <Modal
      opened={!!documentsRequest}
      onClose={() => setDocumentsRequest(null)}
      title={
        documentsRequest
          ? `${isDriverRole ? 'Fotos del borrador' : 'Documentos'} ${documentsRequest.consecutive ?? ''}`
          : isDriverRole
            ? 'Fotos del borrador'
            : 'Documentos'
      }
      centered
      size="xl"
    >
      {documentsRequest ? (
        <FileAttachmentsPanel
          entityType="DOCUMENT"
          entityId={documentsRequest.id}
          title={
            isDriverRole
              ? 'Evidencias fotográficas'
              : 'Documentos y evidencias de la solicitud'
          }
          description={
            isDriverRole
              ? 'Anexa las fotografías que olvidaste incluir. Solo puedes modificar tus propios borradores.'
              : undefined
          }
          uploadMode={isDriverRole ? 'document-evidence' : 'generic'}
          allowDelete={!isDriverRole}
        />
      ) : null}
    </Modal>
  );
}
