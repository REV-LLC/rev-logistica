'use client';
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';

export function useRequestSignature() {
  const [receivedSignature, setReceivedSignature] = useState<string | null>(
    null,
  );

  const [signatureModalOpen, setSignatureModalOpen] = useState(false);

  const [signatureDraft, setSignatureDraft] = useState<string | null>(null);

  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const signatureDrawingRef = useRef(false);

  const ensureSignatureCanvas = (source?: string | null) => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const ratio =
      typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const targetWidth = Math.max(1, Math.floor(rect.width * ratio));
    const targetHeight = Math.max(1, Math.floor(rect.height * ratio));
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const context = canvas.getContext('2d');
      if (!context) return canvas;
      context.scale(ratio, ratio);
      context.lineWidth = 2;
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.strokeStyle = '#111';
      context.fillStyle = '#fff';
      context.fillRect(0, 0, rect.width, rect.height);
      const previous = source ?? null;
      if (previous) {
        const image = new Image();
        image.onload = () => {
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          ctx.drawImage(image, 0, 0, rect.width, rect.height);
        };
        image.src = previous;
      }
    }
    return canvas;
  };

  const getCanvasPoint = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  };

  const beginSignature = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = ensureSignatureCanvas();
    if (!canvas) return;
    const context = canvas.getContext('2d');
    const point = getCanvasPoint(event);
    if (!context || !point) return;
    signatureDrawingRef.current = true;
    context.beginPath();
    context.moveTo(point.x, point.y);
    canvas.setPointerCapture(event.pointerId);
  };

  const moveSignature = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!signatureDrawingRef.current) return;
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    const point = getCanvasPoint(event);
    if (!context || !point) return;
    context.lineTo(point.x, point.y);
    context.stroke();
  };

  const endSignature = () => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    signatureDrawingRef.current = false;
    setSignatureDraft(canvas.toDataURL('image/png'));
  };

  const clearSignature = () => {
    const canvas = ensureSignatureCanvas(null);
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const rect = canvas.getBoundingClientRect();
    context.clearRect(0, 0, rect.width, rect.height);
    context.fillStyle = '#fff';
    context.fillRect(0, 0, rect.width, rect.height);
    setSignatureDraft(null);
  };

  useEffect(() => {
    if (!signatureModalOpen) return;
    const frame = window.requestAnimationFrame(() => {
      const canvas = ensureSignatureCanvas();
      if (!canvas) return;
      const context = canvas.getContext('2d');
      if (!context) return;
      const rect = canvas.getBoundingClientRect();
      context.clearRect(0, 0, rect.width, rect.height);
      context.fillStyle = '#fff';
      context.fillRect(0, 0, rect.width, rect.height);
      const source = signatureDraft ?? receivedSignature;
      if (!source) return;
      const image = new Image();
      image.onload = () => {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(image, 0, 0, rect.width, rect.height);
      };
      image.src = source;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [signatureModalOpen, signatureDraft, receivedSignature]);
  return {
    receivedSignature,
    setReceivedSignature,
    signatureModalOpen,
    setSignatureModalOpen,
    signatureDraft,
    setSignatureDraft,
    signatureCanvasRef,
    beginSignature,
    moveSignature,
    endSignature,
    clearSignature,
  };
}
