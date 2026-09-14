'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Accordion, Alert, Badge, Button, Container, Group, Loader, Paper,
  ScrollArea, SimpleGrid, Stack, Table, Text, Textarea, ThemeIcon, Title,
} from '@mantine/core';
import { IconArrowUp, IconDatabase, IconMessageCircle, IconPlus, IconShieldCheck } from '@tabler/icons-react';
import { api } from '@/lib/api';
import styles from './office-assistant.module.css';

type Evidence = {
  id: string;
  title: string;
  views: string[];
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
  queriedAt: string;
};
type Reply = { answer: string; evidence: Evidence[]; queriedAt: string; readOnly: boolean };
type Message = { id: string; role: 'user' | 'assistant'; content: string; reply?: Reply };
const examples = [
  { title: 'Ubicar inventario', question: '¿Dónde están todos los tornillos niveladores de REV?' },
  { title: 'Consultar alquileres', question: '¿Cuántos tornillos hay en obra y cuáles obras los tienen? Desglosa por artículo.' },
  { title: 'Revisar proveedores', question: '¿Qué equipos de proveedores tenemos en las obras? Agrupa por proveedor y artículo.' },
  { title: 'Comparar clientes', question: '¿Cuáles clientes tienen más unidades BULK pendientes de devolver? Desglosa por artículo.' },
];

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function Sources({ sources }: { sources: Evidence[] }) {
  return (
    <Accordion variant="separated" radius="md" mt="md">
      {sources.map((source) => (
        <Accordion.Item key={source.id} value={source.id}>
          <Accordion.Control icon={<IconDatabase size={16} />}>
            <Text size="sm" fw={600}>[{source.id}] {source.title}</Text>
            <Text size="xs" c="dimmed">{source.rowCount} filas · {new Date(source.queriedAt).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}</Text>
          </Accordion.Control>
          <Accordion.Panel>
            {source.truncated ? <Alert color="yellow" mb="sm">Resultado parcial. Solicita un resumen agrupado para obtener el total completo.</Alert> : null}
            {source.rows.length ? (
              <ScrollArea type="auto" mah={360}>
                <Table striped highlightOnHover withTableBorder>
                  <Table.Thead><Table.Tr>{source.columns.map((column) => <Table.Th key={column}>{column.replaceAll('_', ' ')}</Table.Th>)}</Table.Tr></Table.Thead>
                  <Table.Tbody>{source.rows.map((row, index) => (
                    <Table.Tr key={index}>{source.columns.map((column) => <Table.Td key={column}>{displayValue(row[column])}</Table.Td>)}</Table.Tr>
                  ))}</Table.Tbody>
                </Table>
              </ScrollArea>
            ) : <Text size="sm" c="dimmed">Sin coincidencias para esta consulta.</Text>}
            <Text size="xs" c="dimmed" mt="xs">Las filas son resultados de esta consulta; no siempre representan el total del inventario.</Text>
          </Accordion.Panel>
        </Accordion.Item>
      ))}
    </Accordion>
  );
}

export default function OfficeAssistantPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<{ ready: boolean; reason?: string } | null>(null);
  const pending = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const request = new AbortController();
    api<{ ready: boolean; reason?: string }>('/office-assistant/status', { signal: request.signal })
      .then(setStatus)
      .catch(() => { if (!request.signal.aborted) setStatus({ ready: false, reason: 'No se pudo conectar con el asistente.' }); });
    return () => { request.abort(); controller.current?.abort(); };
  }, []);

  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, busy]);

  async function send(text = question) {
    const content = text.trim();
    if (!content || content.length > 2000 || pending.current || !status?.ready) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    setQuestion('');
    const userMessage: Message = { id: crypto.randomUUID(), role: 'user', content };
    setMessages((previous) => [...previous, userMessage]);
    const request = new AbortController();
    controller.current = request;
    const timeout = window.setTimeout(() => request.abort(), 105000);
    try {
      const reply = await api<Reply>('/office-assistant/chat', {
        method: 'POST', signal: request.signal,
        json: { message: content, history: messages.slice(-12).map((m) => ({ role: m.role, content: m.content.slice(0, 8000) })) },
      });
      setMessages((previous) => [...previous, { id: crypto.randomUUID(), role: 'assistant', content: reply.answer, reply }]);
    } catch (cause) {
      setError(request.signal.aborted ? 'La consulta tardó demasiado. Intenta una pregunta más concreta.'
        : cause instanceof Error ? cause.message : 'No se pudo completar la consulta.');
      setMessages((previous) => previous.filter((m) => m.id !== userMessage.id));
      setQuestion(content);
    } finally {
      window.clearTimeout(timeout);
      pending.current = false;
      setBusy(false);
      controller.current = null;
    }
  }

  return (
    <Container size="lg" py="lg" className={styles.container}>
      <Group justify="space-between" align="flex-start" mb="xl">
        <Group gap="sm">
          <ThemeIcon size={46} radius="md" variant="light" color="blue"><IconMessageCircle size={26} /></ThemeIcon>
          <div><Title order={2}>Asistente Office</Title><Text size="sm" c="dimmed">Tus preguntas, con los datos de REV.</Text></div>
        </Group>
        <Group gap="xs">
          <Badge variant="light" color="blue">OpenAI</Badge>
          <Badge variant="light" color="teal" leftSection={<IconShieldCheck size={13} />}>Solo lectura</Badge>
          <Button variant="subtle" size="xs" leftSection={<IconPlus size={15} />} disabled={busy || !messages.length}
            onClick={() => { setMessages([]); setError(null); setQuestion(''); }}>Nueva conversación</Button>
        </Group>
      </Group>

      {status && !status.ready ? <Alert color="yellow" title="Configuración pendiente" mb="lg">{status.reason}</Alert> : null}

      {!messages.length ? (
        <Stack className={styles.welcome} gap="lg">
          <div>
            <Text className={styles.eyebrow}>INVENTARIO · OBRAS · CLIENTES</Text>
            <Title order={1} className={styles.headline}>¿Qué necesitas saber hoy?</Title>
            <Text c="dimmed" maw={620} mt="sm">Encuentra equipos, revisa cantidades en obra o cruza información de bodegas y proveedores. Puedes seguir la conversación para profundizar.</Text>
          </div>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            {examples.map((example) => (
              <button key={example.title} className={styles.example} disabled={busy || !status?.ready} onClick={() => void send(example.question)}>
                <span className={styles.exampleTitle}>{example.title}</span>
                <span>{example.question}</span>
              </button>
            ))}
          </SimpleGrid>
          <Text size="xs" c="dimmed">OpenAI procesa tu pregunta y los resultados necesarios de la consulta. El asistente no puede modificar registros. Las unidades en obra no equivalen necesariamente a unidades que siguen facturándose.</Text>
        </Stack>
      ) : (
        <Stack gap="lg" role="log" aria-label="Conversación con el asistente" aria-live="polite" mb="lg">
          {messages.map((message) => (
            <Paper key={message.id} p="lg" radius="lg" withBorder className={message.role === 'user' ? styles.user : styles.assistant}>
              <Text size="xs" fw={700} c={message.role === 'user' ? 'blue' : 'teal'} mb="xs">{message.role === 'user' ? 'TÚ' : 'ASISTENTE OFFICE'}</Text>
              <Text className={styles.message}>{message.content}</Text>
              {message.reply ? <Sources sources={message.reply.evidence} /> : null}
            </Paper>
          ))}
        </Stack>
      )}

      {busy ? <Group gap="sm" role="status" mb="md"><Loader size="sm" /><Text size="sm" c="dimmed">Consultando datos y comprobando los resultados…</Text></Group> : null}
      {error ? <Alert color="red" title="No se completó la consulta" mb="md">{error}</Alert> : null}
      <form className={styles.composer} onSubmit={(event) => { event.preventDefault(); void send(); }}>
        <Textarea
          label="Pregunta al asistente" placeholder="Por ejemplo: ¿en cuáles obras tenemos tornillos niveladores?"
          value={question} onChange={(event) => setQuestion(event.currentTarget.value)}
          minRows={2} maxRows={6} autosize maxLength={2000} disabled={busy}
          onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }}
        />
        <Group justify="space-between" mt="sm">
          <Text size="xs" c="dimmed">{status === null ? 'Comprobando conexión…' : 'Enter para enviar · Shift + Enter para otra línea'}</Text>
          <Button type="submit" loading={busy} disabled={!question.trim() || !status?.ready} rightSection={<IconArrowUp size={17} />}>Consultar</Button>
        </Group>
      </form>
      <div ref={end} />
    </Container>
  );
}
