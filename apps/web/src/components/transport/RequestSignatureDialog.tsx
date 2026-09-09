'use client';
import { Button, Group, Modal, Stack } from '@mantine/core';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import { type PointerEvent as ReactPointerEvent } from 'react';

type Props = {
  signatureModalOpen: boolean;
  setSignatureModalOpen: Dispatch<SetStateAction<boolean>>;
  customerSignatureLabel: 'Firma de quien entrega' | 'Firma de recibido';
  signatureCanvasRef: RefObject<HTMLCanvasElement | null>;
  beginSignature: (event: ReactPointerEvent<HTMLCanvasElement>) => void;
  moveSignature: (event: ReactPointerEvent<HTMLCanvasElement>) => void;
  endSignature: () => void;
  clearSignature: () => void;
  setReceivedSignature: Dispatch<SetStateAction<string | null>>;
  signatureDraft: string | null;
};

export default function RequestSignatureDialog({
  signatureModalOpen,
  setSignatureModalOpen,
  customerSignatureLabel,
  signatureCanvasRef,
  beginSignature,
  moveSignature,
  endSignature,
  clearSignature,
  setReceivedSignature,
  signatureDraft,
}: Props) {
  return (
    <Modal
      opened={signatureModalOpen}
      onClose={() => setSignatureModalOpen(false)}
      title={customerSignatureLabel}
      centered
    >
      <Stack gap="md">
        <canvas
          ref={signatureCanvasRef}
          onPointerDown={beginSignature}
          onPointerMove={moveSignature}
          onPointerUp={endSignature}
          onPointerCancel={endSignature}
          onPointerLeave={endSignature}
          style={{
            width: '100%',
            height: 180,
            border: '1px solid var(--mantine-color-gray-4)',
            borderRadius: 8,
            background: '#fff',
            touchAction: 'none',
          }}
        />
        <Group justify="space-between" className="mobile-actions">
          <Button variant="default" onClick={clearSignature}>
            Limpiar
          </Button>
          <Group>
            <Button
              variant="default"
              onClick={() => setSignatureModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => {
                setReceivedSignature(signatureDraft ?? null);
                setSignatureModalOpen(false);
              }}
            >
              Confirmar y guardar
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
