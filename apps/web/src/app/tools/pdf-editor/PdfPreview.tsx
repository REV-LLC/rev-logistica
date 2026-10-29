'use client';

import { useEffect, useRef, useState } from 'react';
import { Alert, Text } from '@mantine/core';
import type { PdfTextFragment } from './types';
import styles from './pdf-editor.module.css';

type Props = {
  file: Blob; page: number; zoom: number; fragments: PdfTextFragment[];
  selection: number | null; disabled: boolean; original: boolean;
  onSelect: (fragment: PdfTextFragment) => void;
};

export default function PdfPreview({ file, page, zoom, fragments, selection, disabled, onSelect, original }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewport, setViewport] = useState<import('pdfjs-dist').PageViewport | null>(null);

  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!width || !canvas.current) return;
    let disposed = false;
    let task: import('pdfjs-dist').PDFDocumentLoadingTask | undefined;
    let render: import('pdfjs-dist').RenderTask | undefined;
    setLoading(true); setError('');
    async function draw() {
      try {
        const pdfjs = await import('pdfjs-dist');
        if (disposed) return;
        pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
        const data = await file.arrayBuffer();
        if (disposed) return;
        task = pdfjs.getDocument({ data, useSystemFonts: true, isEvalSupported: false });
        const pdf = await task.promise;
        const current = await pdf.getPage(page + 1);
        if (disposed || !canvas.current) return;
        const originalViewport = current.getViewport({ scale: 1 });
        const nextViewport = current.getViewport({ scale: Math.max(100, width - 40) * zoom / originalViewport.width });
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        const target = canvas.current;
        target.width = Math.ceil(nextViewport.width * ratio);
        target.height = Math.ceil(nextViewport.height * ratio);
        target.style.width = `${nextViewport.width}px`;
        target.style.height = `${nextViewport.height}px`;
        setViewport(nextViewport);
        render = current.render({ canvas: target, viewport: nextViewport, transform: [ratio, 0, 0, ratio, 0, 0] });
        await render.promise;
        if (!disposed) setLoading(false);
      } catch {
        if (!disposed) { setLoading(false); setError('No se pudo renderizar esta página. Descarga la copia para revisarla en otro visor.'); }
      }
    }
    void draw();
    return () => { disposed = true; render?.cancel(); void task?.destroy().catch(() => undefined); };
  }, [file, page, width, zoom]);

  return <div ref={container} className={styles.canvasViewport}>
    <Text size="xs" c="dimmed" ta="center" py="sm">{original ? 'Original' : 'Documento actual'} · Página {page + 1}{loading ? ' · Preparando vista previa…' : ''}</Text>
    {error ? <Alert color="red" m="md" role="alert">{error}</Alert> : null}
    <div data-document-paper className={styles.pageCanvas} style={{ width: viewport?.width, height: viewport?.height, visibility: loading || error ? 'hidden' : 'visible' }}>
      <canvas ref={canvas} role="img" aria-label={`Página ${page + 1} del documento PDF`} aria-busy={loading} className={styles.canvas} />
      {viewport && !loading && !error ? fragments.filter((item) => item.editable && item.quad).map((fragment) => {
        const points = fragment.quad!.map(([x, y]) => viewport.convertToViewportPoint(x, y));
        const left = Math.min(...points.map((point) => point[0]));
        const top = Math.min(...points.map((point) => point[1]));
        const right = Math.max(...points.map((point) => point[0]));
        const bottom = Math.max(...points.map((point) => point[1]));
        return <button key={fragment.index} type="button" aria-label={`Seleccionar texto: ${fragment.text}`} aria-pressed={selection === fragment.index} className={styles.textTarget} style={{ left, top, width: Math.max(5, right - left), height: Math.max(8, bottom - top) }} disabled={disabled} onClick={() => onSelect(fragment)} />;
      }) : null}
    </div>
  </div>;
}
