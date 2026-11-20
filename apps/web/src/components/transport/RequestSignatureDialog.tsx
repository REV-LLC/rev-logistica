"use client";
import { ActionIcon, Button, Modal, Text, Tooltip } from "@mantine/core";
import { IconCheck, IconEraser, IconX } from "@tabler/icons-react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { type PointerEvent as ReactPointerEvent } from "react";
import styles from "./RequestSignatureDialog.module.css";

type Props = {
  signatureModalOpen: boolean;
  setSignatureModalOpen: Dispatch<SetStateAction<boolean>>;
  customerSignatureLabel: "Firma de quien entrega" | "Firma de recibido";
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
      withCloseButton={false}
      transitionProps={{ duration: 0 }}
      classNames={{
        content: styles.content,
        header: styles.hiddenHeader,
        body: styles.body,
      }}
      size="xl"
      centered
    >
      <div className={styles.editor}>
        <div className={styles.toolbar}>
          <Text fw={600} className={styles.title}>
            {customerSignatureLabel}
          </Text>
          <Button
            variant="default"
            leftSection={<IconEraser size={18} />}
            onClick={clearSignature}
          >
            Limpiar
          </Button>
          <Button
            leftSection={<IconCheck size={18} />}
            onClick={() => {
              setReceivedSignature(signatureDraft ?? null);
              setSignatureModalOpen(false);
            }}
          >
            Guardar firma
          </Button>
          <Tooltip label="Cancelar">
            <ActionIcon
              aria-label="Cancelar firma"
              variant="default"
              size={40}
              onClick={() => setSignatureModalOpen(false)}
            >
              <IconX size={20} />
            </ActionIcon>
          </Tooltip>
        </div>
        <div className={styles.surface}>
          <canvas
            aria-label={customerSignatureLabel}
            ref={signatureCanvasRef}
            onPointerDown={beginSignature}
            onPointerMove={moveSignature}
            onPointerUp={endSignature}
            onPointerCancel={endSignature}
            onPointerLeave={endSignature}
            className={styles.canvas}
          />
          <div className={styles.guide} aria-hidden="true" />
        </div>
      </div>
    </Modal>
  );
}
