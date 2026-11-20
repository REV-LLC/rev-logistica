"use client";
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { signaturePoint } from "./signature-geometry";

export function useRequestSignature() {
  const [receivedSignature, setReceivedSignature] = useState<string | null>(
    null,
  );

  const [signatureModalOpen, setSignatureModalOpen] = useState(false);

  const [signatureDraft, setSignatureDraft] = useState<string | null>(null);

  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const signatureDrawingRef = useRef(false);
  const activePointerRef = useRef<number | null>(null);
  const imageGenerationRef = useRef(0);
  const pendingImageRef = useRef<string | null>(null);
  const initialSourceRef = useRef<string | null>(null);
  initialSourceRef.current = signatureDraft ?? receivedSignature;

  const restoreImage = (canvas: HTMLCanvasElement, source: string | null) => {
    const generation = ++imageGenerationRef.current;
    pendingImageRef.current = source;
    if (!source) return;
    const image = new Image();
    image.onload = () => {
      if (
        generation !== imageGenerationRef.current ||
        canvas !== signatureCanvasRef.current
      )
        return;
      const context = canvas.getContext("2d");
      if (!context) return;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const scale = Math.min(width / image.width, height / image.height);
      context.drawImage(
        image,
        (width - image.width * scale) / 2,
        (height - image.height * scale) / 2,
        image.width * scale,
        image.height * scale,
      );
      pendingImageRef.current = null;
    };
    image.onerror = () => {
      if (generation === imageGenerationRef.current)
        pendingImageRef.current = null;
    };
    image.src = source;
  };

  const ensureSignatureCanvas = (source?: string | null) => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return null;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const ratio =
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const targetWidth = Math.max(1, Math.floor(width * ratio));
    const targetHeight = Math.max(1, Math.floor(height * ratio));
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      const previous =
        source === undefined
          ? (pendingImageRef.current ?? canvas.toDataURL("image/png"))
          : source;
      signatureDrawingRef.current = false;
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const context = canvas.getContext("2d");
      if (!context) return canvas;
      context.scale(ratio, ratio);
      context.lineWidth = 2;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.strokeStyle = "#111";
      context.fillStyle = "#fff";
      context.fillRect(0, 0, width, height);
      restoreImage(canvas, previous);
    }
    return canvas;
  };

  const getCanvasPoint = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return signaturePoint(
      event.clientX,
      event.clientY,
      rect,
      canvas.clientWidth,
      canvas.clientHeight,
      window.matchMedia("(max-width: 767px) and (orientation: portrait)")
        .matches,
    );
  };

  const beginSignature = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (signatureDrawingRef.current || pendingImageRef.current) return;
    event.preventDefault();
    const canvas = ensureSignatureCanvas();
    if (!canvas) return;
    const context = canvas.getContext("2d");
    const point = getCanvasPoint(event);
    if (!context || !point) return;
    signatureDrawingRef.current = true;
    activePointerRef.current = event.pointerId;
    context.beginPath();
    context.moveTo(point.x, point.y);
    canvas.setPointerCapture(event.pointerId);
  };

  const moveSignature = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (
      !signatureDrawingRef.current ||
      activePointerRef.current !== event.pointerId
    )
      return;
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    const point = getCanvasPoint(event);
    if (!context || !point) return;
    context.lineTo(point.x, point.y);
    context.stroke();
  };

  const endSignature = (event?: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = signatureCanvasRef.current;
    if (!canvas || !signatureDrawingRef.current) return;
    if (event && activePointerRef.current !== event.pointerId) return;
    signatureDrawingRef.current = false;
    activePointerRef.current = null;
    setSignatureDraft(canvas.toDataURL("image/png"));
  };

  const clearSignature = () => {
    const canvas = ensureSignatureCanvas(null);
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    imageGenerationRef.current += 1;
    pendingImageRef.current = null;
    signatureDrawingRef.current = false;
    context.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    setSignatureDraft(null);
  };

  useEffect(() => {
    if (!signatureModalOpen) return;
    const frame = window.requestAnimationFrame(() => {
      const canvas = ensureSignatureCanvas(initialSourceRef.current);
      if (!canvas) return;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      restoreImage(canvas, initialSourceRef.current);
    });
    const observer = new ResizeObserver(() => {
      ensureSignatureCanvas();
    });
    const observeFrame = window.requestAnimationFrame(() => {
      if (signatureCanvasRef.current)
        observer.observe(signatureCanvasRef.current);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(observeFrame);
      observer.disconnect();
      imageGenerationRef.current += 1;
      pendingImageRef.current = null;
      signatureDrawingRef.current = false;
    };
  }, [signatureModalOpen]);
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
