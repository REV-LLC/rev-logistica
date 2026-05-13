'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Container,
  Group,
  Modal,
  Paper,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import styles from './remdev-print.module.css';
import Image from 'next/image';
import { IconArrowLeft, IconCalendar } from '@tabler/icons-react';

type DocumentDetail = {
  id: string;
  type: string;
  status: string;
  consecutive: string | null;
  createdAt: string;
  docDate: string;
  notes: string | null;
  warehouse?: { id: string; name: string } | null;
  customerWorksite?: {
    id: string;
    alias: string | null;
    customer?: { id: string; name: string } | null;
    worksite?: { id: string; name: string; address: string | null } | null;
  } | null;
  creator?: { id: string; email: string; name: string | null } | null;
  files?: Array<{
    id: string;
    fileType: string;
    storageKey: string;
    mimeType?: string | null;
    createdAt: string;
  }>;
  items: Array<{
    id: string;
    skuId?: string | null;
    assetId?: string | null;
    quantity?: string | number | null;
    condition?: string | null;
    conditionNote?: string | null;
    requestedTag?: string | null;
    sku?: { id: string; name: string } | null;
    asset?: {
      id: string;
      description?: string | null;
      serialOrEngine?: string | null;
      internalNumber?: number | null;
      sku?: { id: string; name: string } | null;
    } | null;
    billingCutoffDate?: string | null;
    returnedAt?: string | null;
    billingStatus?: 'OPEN' | 'CUT' | 'CLOSED' | string | null;
    billingNote?: string | null;
  }>;
  ledger: Array<{
    id: string;
    createdAt: string;
    movementType: string;
    quantity: string | number;
    ownerWarehouse?: {
      id: string;
      name: string;
      ownerCompany?: { name: string } | null;
    } | null;
    sku?: { id: string; name: string } | null;
    asset?: {
      id: string;
      description?: string | null;
      serialOrEngine?: string | null;
      internalNumber?: number | null;
      sku?: { id: string; name: string } | null;
    } | null;
  }>;
};

type VehicleOption = {
  id: string;
  plate?: string | null;
  brand?: string | null;
  model?: string | null;
};

type EmployeeOption = {
  id: string;
  name: string;
};

type WarehouseOption = {
  id: string;
  name: string;
};

function formatDocType(value: string) {
  if (value === 'REMISSION') return 'RM';
  if (value === 'RETURN') return 'DV';
  return value;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('es-CO');
}

function toDisplayDateInput(value?: string | null) {
  if (!value) return '';
  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('es-CO');
}

function toPickerDateInput(value?: string | null) {
  if (!value) return '';
  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function toApiDateInput(value: string, fieldLabel: string) {
  const raw = value.trim();
  if (!raw) return null;
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }
  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) {
    throw new Error(`${fieldLabel} debe estar en formato dd/mm/aaaa`);
  }
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('es-CO');
}

function parseNotes(notes: string | null) {
  if (!notes) return {};
  const parts = notes.split('|').map((value) => value.trim());
  const map = new Map<string, string>();
  parts.forEach((part) => {
    const [k, ...rest] = part.split(':');
    if (!k || rest.length === 0) return;
    map.set(k.trim().toLowerCase(), rest.join(':').trim());
  });
  return {
    deliveryMode: map.get('entrega') ?? '',
    vehicleId: map.get('vehículo') ?? '',
    driverId: map.get('conductor') ?? '',
    dispatcherId: map.get('despachador') ?? '',
    cutOffDate: map.get('fecha corte') ?? '',
  };
}

function buildObservationText(notes: string | null) {
  if (!notes) return '';
  const hiddenPrefixes = [
    'fecha doc:',
    'fecha corte:',
    'entrega:',
    'vehículo:',
    'conductor:',
    'despachador:',
  ];
  return notes
    .split('|')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .filter((part) => !hiddenPrefixes.some((prefix) => part.toLowerCase().startsWith(prefix)))
    .join(' | ');
}

const TERMS_TEXT = `TÉRMINOS Y CONDICIONES DEL CONTRATO DE ALQUILER DE EQUIPOS

Entre los suscritos a saber JESUS ALVARO GUERRERO VILLAMICENCIO, quien obra en este acto en representación de la empresa persona natural JESUS ALVARO GUERRERO VILLAMICENCIO, con establecimiento comercial denominado RENTA EQUIPOS DEL VALLE, identificada con la cédula de ciudadanía No 94.371.184, que en lo sucesivo para los efectos de este contrato se denominará LA ARRENDADORA, por una parte y quien firma el presente documento en nombre propio o en representación de la obra donde se remisiona el equipo en adelante se denominará LA ARRENDATARIA, acuerdan por medio del presente documento celebrar un contrato de arrendamiento de equipos para la construcción el cual se regirá por las siguientes cláusulas:

PRIMERA: LA ARRENDADORA entrega a título de arrendamiento a LA ARRENDATARIA y esta recibe al mismo título los materiales o elementos para construcción que se relacionan en la remisión.

SEGUNDA: El término de duración de este contrato será a partir del recibido de los equipos mediante la forma “remisión de equipos” y su terminación será hasta la devolución de los mismos.

TERCERA: LA ARRENDATARIA declara recibir el equipo a entera satisfacción, perfectas condiciones y apto para el trabajo a que está destinado y se obliga a restituirlo en las mismas condiciones, salvo el deterioro normal por buen uso.

CUARTA: Los equipos dados en arrendamiento deberán permanecer en la obra para la cual fueron contratados, en el caso en que LA ARRENDATARIA desee trasladar el lugar de los equipos deberá notificar a LA ARRENDADORA.

QUINTA: LA ARRENDADORA se compromete a hacer el mantenimiento debido al equipo, con el fin de que este cumpla el servicio para el cual fue contratado.

SEXTA: LA ARRENDATARIA es la única y directa responsable, así actúe como intermediaria o por contrato de administración delegada, de los equipos dados en arrendamiento y pagará el valor del respectivo equipo en caso de faltantes, hurto, pérdida parcial o total del equipo; de igual forma será de su cargo las reparaciones que deban efectuarse fuera del deterioro normal.

SÉPTIMA: LA ARRENDADORA no asume ninguna responsabilidad por retrasos o demoras por estar el equipo en mantenimiento, ni se hace responsable de accidentes o daños por el mal uso o descuido en el manejo de equipos.

OCTAVA: El equipo deberá ser devuelto una vez concluida la obra o en la fecha de terminación del presente contrato en las instalaciones de LA ARRENDADORA; los gastos de transporte serán por cuenta de LA ARRENDATARIA.

PARÁGRAFO: LA ARRENDATARIA a quien LA ARRENDADORA designe, a retirar el equipo entregado en calidad de arrendamiento, del lugar donde este se encuentre, sin previa orden judicial o policiva, en los siguientes casos. LA ARRENDATARIA mediante el presente contrato acepta todas las facturas que se generen como consecuencia del arrendamiento de los equipos, prestación de servicios, faltantes, reparaciones e intereses por mora en el pago de dichas facturas.

NOVENA: Este contrato junto con las facturas dejadas de cancelar prestan mérito ejecutivo y LA ARRENDADORA podrá iniciar acción judicial contra LA ARRENDATARIA por incumplimiento de algunas de las cláusulas pactadas en él.`;

export default function DocumentDetailPage() {
  const router = useRouter();
  const params = useParams<{ documentId: string }>();
  const documentId = params?.documentId;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [document, setDocument] = useState<DocumentDetail | null>(null);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [billingModalOpen, setBillingModalOpen] = useState(false);
  const [billingItemId, setBillingItemId] = useState<string | null>(null);
  const [billingCutoffDate, setBillingCutoffDate] = useState('');
  const [billingReturnedAt, setBillingReturnedAt] = useState('');
  const [billingNote, setBillingNote] = useState('');
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);
  const billingCutoffPickerRef = useRef<HTMLInputElement | null>(null);
  const billingReturnedPickerRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!documentId) return;
    let mounted = true;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [docData, vehiclesData, employeesData, warehousesData] = await Promise.all([
          api<DocumentDetail>(`/documents/${documentId}`, { method: 'GET' }),
          api<VehicleOption[]>('/vehicles', { method: 'GET' }),
          api<EmployeeOption[]>('/employees', { method: 'GET' }),
          api<WarehouseOption[]>('/warehouses', { method: 'GET' }),
        ]);
        if (!mounted) return;
        setDocument(docData);
        setVehicles(vehiclesData);
        setEmployees(employeesData);
        setWarehouses(warehousesData);
      } catch (err) {
        if (!mounted) return;
        if (err instanceof ApiError) {
          setError(`${err.status}: ${err.message}`);
        } else if (err instanceof Error) {
          setError(err.message);
        } else {
          setError('Error cargando documento');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, [documentId]);

  const title = useMemo(() => {
    if (!document) return 'Documento';
    if (document.consecutive) return document.consecutive.trim();
    return `${formatDocType(document.type)} ${document.id.slice(0, 8)}`;
  }, [document]);
  const selectedBillingItem = useMemo(
    () => document?.items.find((item) => item.id === billingItemId) ?? null,
    [billingItemId, document?.items],
  );

  const parsedNotes = useMemo(() => parseNotes(document?.notes ?? null), [document?.notes]);
  const observationText = useMemo(() => buildObservationText(document?.notes ?? null), [document?.notes]);
  const vehicleDisplay = useMemo(() => {
    const vehicleId = parsedNotes.vehicleId ?? '';
    if (!vehicleId) return '-';
    const found = vehicles.find(
      (vehicle) => vehicle.id.toLowerCase() === vehicleId.toLowerCase(),
    );
    if (!found) return '-';
    const details = [found.plate, found.brand, found.model].filter(Boolean).join(' ');
    return details || '-';
  }, [parsedNotes.vehicleId, vehicles]);
  const vehiclePlateDisplay = useMemo(() => {
    const vehicleId = parsedNotes.vehicleId ?? '';
    if (!vehicleId) return '-';
    const found = vehicles.find(
      (vehicle) => vehicle.id.toLowerCase() === vehicleId.toLowerCase(),
    );
    return found?.plate ?? '-';
  }, [parsedNotes.vehicleId, vehicles]);
  const driverDisplay = useMemo(() => {
    const driverId = parsedNotes.driverId ?? '';
    if (!driverId) return '-';
    const found = employees.find(
      (employee) => employee.id.toLowerCase() === driverId.toLowerCase(),
    );
    return found?.name ?? '-';
  }, [parsedNotes.driverId, employees]);
  const dispatcherDisplay = useMemo(() => {
    const dispatcherId = parsedNotes.dispatcherId ?? '';
    if (!dispatcherId) return '-';
    const found = employees.find(
      (employee) => employee.id.toLowerCase() === dispatcherId.toLowerCase(),
    );
    return found?.name ?? '-';
  }, [parsedNotes.dispatcherId, employees]);
  const transportadoPorDisplay = useMemo(() => {
    const driver = driverDisplay && driverDisplay !== '-' ? driverDisplay : '';
    const plate = vehiclePlateDisplay && vehiclePlateDisplay !== '-' ? vehiclePlateDisplay : '';
    if (driver && plate) return `${driver} | ${plate}`;
    if (driver) return driver;
    if (plate) return plate;
    return '-';
  }, [driverDisplay, vehiclePlateDisplay]);
  const isRemission = document?.type === 'REMISSION';
  const isReturn = document?.type === 'RETURN';
  const isChange = document?.type === 'CUTOVER' || document?.type === 'CHANGE';
  const receivedSignature = document?.files?.[0]?.storageKey ?? null;
  const hasRenderableSignature = Boolean(receivedSignature?.startsWith('data:image/'));
  const deliveredByDisplay = document?.creator?.name ?? document?.creator?.email ?? dispatcherDisplay ?? '-';
  const warehouseNameById = useMemo(
    () => new Map(warehouses.map((warehouse) => [warehouse.id.toLowerCase(), warehouse.name])),
    [warehouses],
  );

  const lines = useMemo(() => {
    const sourceRows = document?.type === 'RETURN'
      ? document?.items ?? []
      : (document?.ledger?.length ? document.ledger : document?.items ?? []);
    const rows = sourceRows.map((entry: any) => {
      const qty = entry.assetId && entry.quantity == null
        ? 1
        : Math.abs(Number(entry.quantity || 0));
      const baseDesc =
        entry.asset?.description ??
        entry.asset?.sku?.name ??
        entry.sku?.name ??
        entry.requestedTag ??
        '-';
      const damageNote = entry.conditionNote?.trim();
      const desc = damageNote ? `${baseDesc} | Averia: ${damageNote}` : baseDesc;
      const eq = entry.asset?.internalNumber != null ? `#${entry.asset.internalNumber}` : '';
      const origin = entry.ownerWarehouse
        ? entry.ownerWarehouse.ownerCompany?.name
          ? `${entry.ownerWarehouse.ownerCompany.name} | ${entry.ownerWarehouse.name}`
          : entry.ownerWarehouse.name
        : (() => {
            const raw = (entry.condition ?? '').trim();
            if (!raw) return '';
            return warehouseNameById.get(raw.toLowerCase()) ?? raw;
          })();
      return { qty, desc, eq, origin };
    });
    while (rows.length < 11) {
      rows.push({ qty: 0, desc: '', eq: '', origin: '' });
    }
    return rows.slice(0, 11);
  }, [document?.items, document?.ledger, document?.type, warehouseNameById]);
  const describeItem = (item: DocumentDetail['items'][number]) => {
    return (
      item.asset?.description ??
      item.asset?.sku?.name ??
      item.sku?.name ??
      item.requestedTag ??
      '-'
    );
  };
  const displayQuantity = (value?: string | number | null) => {
    if (value == null) return '-';
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return String(value);
    return Number.isInteger(parsed) ? String(parsed) : parsed.toFixed(2);
  };
  const billingStatusColor = (status?: string | null) => {
    if (status === 'CUT') return 'yellow';
    if (status === 'CLOSED') return 'gray';
    return 'green';
  };
  const openBillingModal = (item: DocumentDetail['items'][number]) => {
    const defaultReturnedAt =
      document?.type === 'RETURN'
        ? toPickerDateInput(item.returnedAt ?? document.docDate ?? document.createdAt)
        : toPickerDateInput(item.returnedAt);
    setBillingItemId(item.id);
    setBillingCutoffDate(toPickerDateInput(item.billingCutoffDate));
    setBillingReturnedAt(defaultReturnedAt);
    setBillingNote(item.billingNote ?? '');
    setBillingError(null);
    setBillingModalOpen(true);
  };
  const reloadDocumentOnly = async () => {
    if (!documentId) return;
    const docData = await api<DocumentDetail>(`/documents/${documentId}`, { method: 'GET' });
    setDocument(docData);
  };
  const saveBilling = async () => {
    if (!document?.id || !selectedBillingItem) return;
    setBillingLoading(true);
    setBillingError(null);
    try {
      const cutoffValue = toApiDateInput(billingCutoffDate, 'Fecha corte');
      const returnedValue = toApiDateInput(billingReturnedAt, 'Fecha devolución real');
      await api(`/documents/${document.id}/items/${selectedBillingItem.id}/billing`, {
        method: 'PATCH',
        json: {
          billingCutoffDate: cutoffValue,
          returnedAt: returnedValue,
          note: billingNote || undefined,
        },
      });
      await reloadDocumentOnly();
      setBillingModalOpen(false);
      setBillingItemId(null);
    } catch (err) {
      if (err instanceof ApiError) {
        setBillingError(`${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setBillingError(err.message);
      } else {
        setBillingError('Error guardando corte del item');
      }
    } finally {
      setBillingLoading(false);
    }
  };

  return (
    <main>
      <Container size="lg" py="xl">
        <ActionIcon variant="light" size="lg" mb="sm" aria-label="Volver" onClick={() => router.back()}>
          <IconArrowLeft size={18} />
        </ActionIcon>
        <Paper shadow="sm" p="xl" radius="md" withBorder className={styles.noPrint}>
          <Group justify="space-between" className="mobile-stack">
            <div>
              <Title order={2}>{title}</Title>
              <Text c="dimmed">
                Estado: {document?.status ?? '-'} | Creado: {document ? formatDate(document.createdAt) : '-'}
              </Text>
            </div>
            <Group>
              <Button onClick={() => window.print()} disabled={!document}>
                Exportar PDF
              </Button>
            </Group>
          </Group>

          {loading ? <Text mt="md">Cargando...</Text> : null}
          {error ? (
            <Text c="red" mt="md">
              {error}
            </Text>
          ) : null}
          {document ? (
            <Paper withBorder p="md" mt="md">
              <Title order={5}>Corte por item (facturación)</Title>
              <Table mt="sm" striped>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Item</Table.Th>
                    <Table.Th>Cantidad</Table.Th>
                    <Table.Th>Corte</Table.Th>
                    <Table.Th>Devolución real</Table.Th>
                    <Table.Th>Estado</Table.Th>
                    <Table.Th></Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {document.items.map((item) => (
                    <Table.Tr key={`billing-${item.id}`}>
                      <Table.Td>
                        <Text>{describeItem(item)}</Text>
                        {item.conditionNote ? (
                          <Text size="xs" c="red">
                            Averia: {item.conditionNote}
                          </Text>
                        ) : null}
                      </Table.Td>
                      <Table.Td>{displayQuantity(item.quantity)}</Table.Td>
                      <Table.Td>{item.billingCutoffDate ? formatDate(item.billingCutoffDate) : '-'}</Table.Td>
                      <Table.Td>{item.returnedAt ? formatDate(item.returnedAt) : '-'}</Table.Td>
                      <Table.Td>
                        <Badge size="sm" variant="light" color={billingStatusColor(item.billingStatus)}>
                          {item.billingStatus ?? 'OPEN'}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Button size="xs" variant="light" onClick={() => openBillingModal(item)}>
                          Definir corte
                        </Button>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Paper>
          ) : null}
        </Paper>

        {document ? (
          <div className={styles.sheet}>
            <header className={styles.header}>
              <div>
                <div className={styles.logoWrap}>
                  <Image
                    src="/rev-logo-clean.svg"
                    alt="Renta Equipos del Valle"
                    width={240}
                    height={74}
                    className={styles.logoImage}
                    priority
                  />
                </div>
                <div className={styles.company}>RENTA EQUIPOS DEL VALLE S.A.S</div>
                <div className={styles.meta}>
                  NIT 901.062.058-0 | Cra. 22 No. 5A-07 B/ Alameda | 310 533 2297
                </div>
              </div>
              <div className={styles.statusBox}>
                <div className={styles.statusLine}>
                  <span className={styles.checkbox}>{isRemission ? 'X' : ''}</span> REMISION
                </div>
                <div className={styles.statusLine}>
                  <span className={styles.checkbox}>{isReturn ? 'X' : ''}</span> DEVOLUCION
                </div>
                <div className={styles.statusLine}>
                  <span className={styles.checkbox}>{isChange ? 'X' : ''}</span> CAMBIO
                </div>
              </div>
            </header>

            <div className={styles.topRow}>
              <div>
                <strong>Fecha:</strong> {formatDateTime(document.docDate)}
              </div>
              <div>
                <strong>Consecutivo:</strong> {title}
              </div>
            </div>

            <section className={styles.block}>
              <div className={styles.blockTitle}>INFORMACION DE CLIENTE</div>
              <div className={styles.grid2}>
                <div>
                  <strong>Razón Social:</strong> {document.customerWorksite?.customer?.name ?? '-'}
                </div>
                <div>
                  <strong>Obra:</strong> {document.customerWorksite?.worksite?.name ?? '-'}
                </div>
                <div>
                  <strong>Dirección de envío:</strong>{' '}
                  {document.customerWorksite?.worksite?.address ?? '-'}
                </div>
                <div>
                  <strong>Bodega:</strong> {document.warehouse?.name ?? '-'}
                </div>
              </div>
            </section>

            <section className={styles.block}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th style={{ width: '12%' }}>CANTIDAD</th>
                    <th>DESCRIPCION</th>
                    <th style={{ width: '10%' }}># EQ</th>
                    <th style={{ width: '20%' }}>ORIGEN</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => (
                    <tr key={`${line.desc}-${idx}`}>
                      <td>{line.qty > 0 ? line.qty : ''}</td>
                      <td>{line.desc}</td>
                      <td>{line.eq}</td>
                      <td>{line.origin}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className={styles.termsBlock}>
              <div className={styles.termsTitle}>TERMINOS Y CONDICIONES DEL CONTRATO DE ALQUILER DE EQUIPOS</div>
              <div className={styles.termsText}>{TERMS_TEXT}</div>
            </section>

            <section className={styles.block}>
              <div className={styles.blockTitle}>OBSERVACIONES</div>
              <div className={styles.observations}>
                {observationText || 'Sin observaciones.'}
                {parsedNotes.deliveryMode ? ` | Entrega: ${parsedNotes.deliveryMode}` : ''}
                {parsedNotes.vehicleId ? ` | Vehículo: ${vehicleDisplay}` : ''}
                {parsedNotes.driverId ? ` | Conductor: ${driverDisplay}` : ''}
                {parsedNotes.dispatcherId ? ` | Despachador: ${parsedNotes.dispatcherId}` : ''}
                {parsedNotes.cutOffDate ? ` | Fecha corte: ${parsedNotes.cutOffDate}` : ''}
              </div>
            </section>

            <section className={styles.signatures}>
              <div>ELABORADO POR<br />{document.creator?.name ?? document.creator?.email ?? '-'}</div>
              <div>TRANSPORTADO POR<br />{transportadoPorDisplay}</div>
              <div>ENTREGADO POR<br />{deliveredByDisplay}</div>
              <div>
                RECIBIDO POR
                <br />
                {hasRenderableSignature ? (
                  <img
                    src={receivedSignature ?? undefined}
                    alt="Firma recibido por"
                    className={styles.signatureImage}
                  />
                ) : (
                  '_____________________'
                )}
              </div>
            </section>
          </div>
        ) : null}
      </Container>
      <Modal
        opened={billingModalOpen}
        onClose={() => {
          if (billingLoading) return;
          setBillingModalOpen(false);
        }}
        title="Definir corte por item"
        centered
      >
        <Stack gap="sm">
          <Text size="sm" fw={600}>
            {selectedBillingItem ? describeItem(selectedBillingItem) : '-'}
          </Text>
          <TextInput
            label="Fecha corte (opcional)"
            value={billingCutoffDate ? toDisplayDateInput(billingCutoffDate) : ''}
            placeholder="dd/mm/aaaa"
            readOnly
            rightSection={
              <ActionIcon
                variant="subtle"
                aria-label="Seleccionar fecha corte"
                onClick={() => billingCutoffPickerRef.current?.showPicker?.()}
              >
                <IconCalendar size={16} />
              </ActionIcon>
            }
          />
          <input
            ref={billingCutoffPickerRef}
            type="date"
            value={billingCutoffDate}
            onChange={(event) => setBillingCutoffDate(event.currentTarget.value)}
            style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
            tabIndex={-1}
            aria-hidden="true"
          />
          <TextInput
            label="Fecha devolución real (opcional)"
            value={billingReturnedAt ? toDisplayDateInput(billingReturnedAt) : ''}
            placeholder="dd/mm/aaaa"
            readOnly
            rightSection={
              <ActionIcon
                variant="subtle"
                aria-label="Seleccionar fecha devolución real"
                onClick={() => billingReturnedPickerRef.current?.showPicker?.()}
              >
                <IconCalendar size={16} />
              </ActionIcon>
            }
          />
          <input
            ref={billingReturnedPickerRef}
            type="date"
            value={billingReturnedAt}
            onChange={(event) => setBillingReturnedAt(event.currentTarget.value)}
            style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
            tabIndex={-1}
            aria-hidden="true"
          />
          <TextInput
            label="Nota (opcional)"
            value={billingNote}
            onChange={(event) => setBillingNote(event.currentTarget.value)}
          />
          {billingError ? <Text c="red">{billingError}</Text> : null}
          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => setBillingModalOpen(false)}
              disabled={billingLoading}
            >
              Cancelar
            </Button>
            <Button onClick={saveBilling} loading={billingLoading}>
              Guardar
            </Button>
          </Group>
        </Stack>
      </Modal>
    </main>
  );
}
