'use client';

import { useEffect, useRef, useState } from 'react';
import { Alert, Badge, Button, FileButton, Group, Paper, ScrollArea, Select, Stack, Switch, Text, Textarea, TextInput } from '@mantine/core';
import { IconArrowBackUp, IconDownload, IconFileTypePdf, IconUpload } from '@tabler/icons-react';
import PageHeaderCard from '@/components/dashboard/PageHeaderCard';
import { api } from '@/lib/api';
import PdfPreview from './PdfPreview';
import type { PdfInspection, PdfTextFragment } from './types';
import styles from './pdf-editor.module.css';

const MAX_SIZE = 15 * 1024 * 1024;
const metric = (value?: number) => value === undefined ? '—' : new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3 }).format(value);

export default function PdfEditorPage() {
  const [file, setFile] = useState<Blob | null>(null);
  const [originalFile, setOriginalFile] = useState<Blob | null>(null);
  const [compareOriginal, setCompareOriginal] = useState(false);
  const [zoom, setZoom] = useState('1');
  const [name, setName] = useState('documento.pdf');
  const [url, setUrl] = useState('');
  const [page, setPage] = useState(0);
  const [inspection, setInspection] = useState<PdfInspection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [selection, setSelection] = useState<number | null>(null);
  const [replacement, setReplacement] = useState('');
  const [history, setHistory] = useState<Blob[]>([]);
  const [changed, setChanged] = useState(false);
  const fileReset = useRef<() => void>(null);
  const editInput = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (changed) event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [changed]);

  async function inspect(blob: Blob, currentPage: number) {
    setInspection(null); setSelection(null);
    const body = new FormData();
    body.append('pdf', blob, 'documento.pdf');
    body.append('page', String(currentPage));
    const result = await api<PdfInspection>('/pdf-editor/inspect', { method: 'POST', body });
    setInspection(result);
    return result;
  }

  async function open(next: File | null) {
    fileReset.current?.();
    if (!next) return;
    if (next.size > MAX_SIZE) { setError('El PDF debe pesar como máximo 15 MB.'); return; }
    if (changed && !window.confirm('Hay cambios sin descargar. ¿Quieres abrir otro archivo y descartarlos?')) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await inspect(next, 0);
      setSearch('');
      setFile(next); setOriginalFile(next); setCompareOriginal(false); setName(next.name);
      setPage(0); setHistory([]); setChanged(false);
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo abrir el PDF.'); }
    finally { setBusy(false); }
  }

  async function changePage(value: string | null) {
    if (!file || value === null) return;
    const next = Number(value);
    setBusy(true); setError(''); setPage(next);
    try {
      await inspect(file, next);
      if (next !== page) setSearch('');
    }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo analizar la página.'); }
    finally { setBusy(false); }
  }

  function selectFragment(fragment: PdfTextFragment, focus = false) {
    setSelection(fragment.index); setReplacement(fragment.text); setError('');
    if (focus) requestAnimationFrame(() => { editInput.current?.focus(); editInput.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
  }

  async function apply() {
    const run = inspection?.texts.find((item) => item.index === selection);
    if (!file || !run?.editable) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const body = new FormData();
      body.append('pdf', file, 'documento.pdf');
      body.append('page', String(page)); body.append('kind', 'text');
      body.append('index', String(run.index)); body.append('original', run.text); body.append('replacement', replacement);
      const result = await api<{ pdf: string; warnings: string[] }>('/pdf-editor/edit', { method: 'POST', body });
      const bytes = Uint8Array.from(atob(result.pdf), (character) => character.charCodeAt(0));
      const next = new Blob([bytes], { type: 'application/pdf' });
      setHistory((previous) => [...previous.slice(-4), file]);
      setFile(next); setChanged(true); setCompareOriginal(false);
      setNotice('Texto actualizado con la fuente, el tamaño y los parámetros de espaciado originales.');
      const nextInspection = await inspect(next, page);
      const updated = nextInspection.texts.find((item) => item.index === run.index && item.text === replacement);
      if (updated) selectFragment(updated);
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo aplicar el cambio.'); }
    finally { setBusy(false); }
  }

  async function undo() {
    const previous = history.at(-1);
    if (!previous) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await inspect(previous, page);
      setFile(previous); setHistory((items) => items.slice(0, -1)); setChanged(true); setCompareOriginal(false);
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo deshacer el cambio.'); }
    finally { setBusy(false); }
  }

  function download() {
    if (!url) return;
    const link = document.createElement('a');
    link.href = url; link.download = `${name.replace(/\.pdf$/i, '')}-editado.pdf`; link.click();
    setChanged(false); setNotice('Copia preparada para descargar. El archivo original no se sobrescribe.');
  }

  const selected = inspection?.texts.find((item) => item.index === selection);
  const visibleTexts = inspection?.texts.filter((item) => item.text.toLocaleLowerCase().includes(search.toLocaleLowerCase())) ?? [];

  return (
    <Stack gap="lg">
      <PageHeaderCard title="Editor de PDF" description="Corrige texto conservando su tipografía y formato originales." icon={<IconFileTypePdf size={22} />} iconColor="blue" accentColor="rgba(59, 130, 246, 0.10)" aside={
        <FileButton onChange={open} accept="application/pdf" resetRef={fileReset}>{(props) => <Button {...props} disabled={busy} leftSection={<IconUpload size={17} />}>Abrir PDF</Button>}</FileButton>
      } />
      {error ? <Alert color="red" title="No se aplicó el cambio" role="alert" withCloseButton onClose={() => setError('')}>{error}</Alert> : null}
      {notice ? <Alert color="blue" role="status" withCloseButton onClose={() => setNotice('')}>{notice}</Alert> : null}
      {!file ? (
        <Paper withBorder radius="lg" p="xl" className={styles.empty}>
          <IconFileTypePdf size={54} stroke={1.3} color="var(--mantine-color-blue-6)" />
          <Text size="xl" fw={650}>Corrige el texto de tu documento</Text>
          <Text c="dimmed" maw={520}>Abre una cotización, certificado u otro PDF generado por un sistema. Selecciona el texto sobre la página y edítalo con su fuente original.</Text>
          <FileButton onChange={open} accept="application/pdf">{(props) => <Button {...props} loading={busy}>Seleccionar PDF</Button>}</FileButton>
          <Text size="sm" c="dimmed" maw={520}>La edición no sustituye fuentes ni reduce el tamaño para hacer caber el texto. Si no se puede conservar el formato, te indicará el motivo.</Text>
          <Text size="xs" c="dimmed">Hasta 15 MB. Procesamiento en el servidor de REV, sin guardar los archivos. Sin OCR.</Text>
        </Paper>
      ) : (
        <Paper withBorder radius="lg" className={styles.editor}>
          <Group p="md" justify="space-between" className={styles.toolbar}>
            <Group gap="sm" className={styles.fileInfo}><IconFileTypePdf size={22} /><Text fw={600} truncate className={styles.filename}>{name}</Text>{changed ? <Badge variant="light" color="orange">Sin descargar</Badge> : null}</Group>
            <Group gap="xs">
              <Button variant="default" size="sm" disabled={!history.length || busy} onClick={undo} leftSection={<IconArrowBackUp size={16} />}>Deshacer</Button>
              <Button size="sm" disabled={busy} onClick={download} leftSection={<IconDownload size={16} />}>Descargar copia</Button>
            </Group>
          </Group>
          <div className={styles.workspace}>
            <aside className={styles.inspector} aria-label="Edición de texto">
              <Stack gap="md">
                <Select label="Página que quieres editar" value={String(page)} onChange={changePage} disabled={busy || !inspection} data={Array.from({ length: inspection?.pageCount ?? page + 1 }, (_, i) => ({ value: String(i), label: `Página ${i + 1}` }))} allowDeselect={false} searchable />
                {busy ? <Text size="sm" c="blue" role="status">Procesando documento…</Text> : null}
                {!inspection && !busy ? <Button variant="light" onClick={() => changePage(String(page))}>Reintentar análisis de página</Button> : null}
                <Text size="sm" c="dimmed">Haz clic en el texto de la página o elige un fragmento.</Text>
                <TextInput aria-label="Buscar texto en esta página" placeholder="Buscar en esta página" value={search} onChange={(event) => setSearch(event.currentTarget.value)} disabled={busy} />
                <ScrollArea h={200} type="auto">
                  <div className={styles.textList}>
                    {visibleTexts.map((run) => <button key={run.index} type="button" className={styles.textRun} aria-pressed={selection === run.index} disabled={busy} onClick={() => selectFragment(run)}>{run.text}{!run.editable ? <span className={styles.readOnly}>Solo lectura</span> : null}</button>)}
                    {!visibleTexts.length && !busy ? <Text size="sm" c="dimmed">{inspection?.texts.length ? 'No hay coincidencias.' : 'No se detectó texto editable. Esta página podría ser un escaneo o contener texto convertido en trazos.'}</Text> : null}
                  </div>
                </ScrollArea>
                {selected ? <>
                  {selected.editable ? <>
                    <Text size="sm" fw={600}>Formato original</Text>
                    <dl className={styles.typography}>
                      <dt>Fuente</dt><dd>{selected.font?.replace(/^[A-Z]{6}\+/, '')}</dd>
                      <dt>Tamaño</dt><dd>{metric(selected.size)} pt</dd>
                      <dt>Entre caracteres</dt><dd>{metric(selected.charSpacing)} pt</dd>
                      <dt>Entre palabras</dt><dd>{metric(selected.wordSpacing)} pt</dd>
                      <dt>Escala horizontal</dt><dd>{metric(selected.horizontalScale)} %</dd>
                      <dt>Kerning del PDF</dt><dd>{selected.kerningAdjustments ?? 0} ajustes</dd>
                    </dl>
                    <Textarea ref={editInput} label="Texto de reemplazo" value={replacement} onChange={(event) => setReplacement(event.currentTarget.value)} minRows={3} maxLength={5000} disabled={busy} description="Se conservan la fuente y el tamaño. Si el texto no cabe, deberás acortarlo." />
                    <Button onClick={apply} loading={busy} disabled={replacement === selected.text}>Aplicar texto</Button>
                  </> : <Alert color="yellow" title="Conservamos el original">{selected.reason}</Alert>}
                </> : null}
                <Text size="xs" c="dimmed">Las fuentes incrustadas solo permiten reutilizar los caracteres que contiene el PDF. No se aplican sustituciones automáticas.</Text>
              </Stack>
            </aside>
            <section className={styles.preview} aria-label="Vista previa del PDF">
              <Group justify="space-between" px="md" py="sm" className={styles.previewToolbar}>
                <Switch label="Comparar con original" checked={compareOriginal} onChange={(event) => setCompareOriginal(event.currentTarget.checked)} disabled={busy} />
                <Select aria-label="Zoom del documento" w={140} size="xs" value={zoom} onChange={(value) => setZoom(value ?? '1')} allowDeselect={false} data={[{ value: '1', label: 'Ajustar ancho' }, { value: '1.25', label: '125 %' }, { value: '1.5', label: '150 %' }, { value: '2', label: '200 %' }]} />
              </Group>
              <PdfPreview file={compareOriginal && originalFile ? originalFile : file} page={page} zoom={Number(zoom)} fragments={compareOriginal ? [] : inspection?.texts ?? []} selection={selection} disabled={busy} onSelect={(fragment) => selectFragment(fragment, true)} original={compareOriginal} />
            </section>
          </div>
        </Paper>
      )}
    </Stack>
  );
}
