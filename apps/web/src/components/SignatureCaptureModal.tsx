'use client';

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Button, Group, Modal, Stack } from '@mantine/core';

type SignatureCaptureModalProps = {
  opened: boolean;
  title: string;
  value: string | null;
  onClose: () => void;
  onConfirm: (signature: string | null) => void;
};

export default function SignatureCaptureModal({
  opened,
  title,
  value,
  onClose,
  onConfirm,
}: SignatureCaptureModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const [draft, setDraft] = useState<string | null>(value);

  const prepareCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const targetWidth = Math.max(1, Math.floor(rect.width * ratio));
    const targetHeight = Math.max(1, Math.floor(rect.height * ratio));
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const context = canvas.getContext('2d');
      if (context) {
        context.scale(ratio, ratio);
        context.lineWidth = 2;
        context.lineCap = 'round';
        context.lineJoin = 'round';
        context.strokeStyle = '#111';
      }
    }
    return canvas;
  };

  const paintBackground = (canvas: HTMLCanvasElement) => {
    const context = canvas.getContext('2d');
    if (!context) return;
    const rect = canvas.getBoundingClientRect();
    context.clearRect(0, 0, rect.width, rect.height);
    context.fillStyle = '#fff';
    context.fillRect(0, 0, rect.width, rect.height);
  };

  useEffect(() => {
    if (!opened) return;
    const frame = window.requestAnimationFrame(() => {
      const canvas = prepareCanvas();
      if (!canvas) return;
      paintBackground(canvas);
      if (!draft) return;
      const rect = canvas.getBoundingClientRect();
      const image = new Image();
      image.onload = () => {
        canvas.getContext('2d')?.drawImage(image, 0, 0, rect.width, rect.height);
      };
      image.src = draft;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [draft, opened]);

  const getCanvasPoint = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const beginDrawing = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = prepareCanvas();
    const context = canvas?.getContext('2d');
    const point = getCanvasPoint(event);
    if (!canvas || !context || !point) return;
    drawingRef.current = true;
    context.beginPath();
    context.moveTo(point.x, point.y);
    canvas.setPointerCapture(event.pointerId);
  };

  const continueDrawing = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const context = canvasRef.current?.getContext('2d');
    const point = getCanvasPoint(event);
    if (!context || !point) return;
    context.lineTo(point.x, point.y);
    context.stroke();
  };

  const endDrawing = () => {
    const canvas = canvasRef.current;
    if (!canvas || !drawingRef.current) return;
    drawingRef.current = false;
    setDraft(canvas.toDataURL('image/png'));
  };

  const clear = () => {
    const canvas = prepareCanvas();
    if (canvas) paintBackground(canvas);
    setDraft(null);
  };

  return (
    <Modal opened={opened} onClose={onClose} title={title} centered>
      <Stack gap="md">
        <canvas
          ref={canvasRef}
          onPointerDown={beginDrawing}
          onPointerMove={continueDrawing}
          onPointerUp={endDrawing}
          onPointerCancel={endDrawing}
          onPointerLeave={endDrawing}
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
          <Button variant="default" onClick={clear}>
            Limpiar
          </Button>
          <Group>
            <Button variant="default" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={() => onConfirm(draft)}>Confirmar y guardar</Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
