'use client';

import {
  Alert,
  Badge,
  Button,
  Group,
  NativeSelect,
  Paper,
  Radio,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
  Tooltip,
} from '@mantine/core';
import WarehouseSelect from '@/components/WarehouseSelect';

type SelectOption = { value: string; label: string };
type WarehouseOption = { id: string; name: string; type?: 'OWN' | 'ALLY' | string };

export type RequestInfoErrors = {
  customerId?: string;
  docDate?: string;
  customerWorksiteId?: string;
  recipientPhones?: string;
  driverId?: string;
};

type RequestInfoStepProps = {
  documentType: 'REMISSION' | 'RETURN';
  consecutive: string;
  customerId: string | null;
  documentDate: string;
  warehouseId: string | null;
  observations: string;
  deliveryMode: 'WAREHOUSE' | 'ON_SITE';
  worksiteId: string;
  vehicleId: string | null;
  driverId: string | null;
  dispatcherId: string | null;
  customerOptions: SelectOption[];
  worksiteOptions: SelectOption[];
  vehicleOptions: SelectOption[];
  employeeOptions: SelectOption[];
  warehouses: WarehouseOption[];
  errors: RequestInfoErrors;
  error: string | null;
  editing: boolean;
  isAdmin: boolean;
  isDriver: boolean;
  isMobile: boolean;
  worksitesLoading: boolean;
  onDismissError: () => void;
  onDocumentTypeChange: (value: 'REMISSION' | 'RETURN') => void;
  onConsecutiveChange: (value: string) => void;
  onCustomerChange: (value: string | null) => void;
  onDocumentDateChange: (value: string) => void;
  onWarehouseChange: (value: string | null) => void;
  onObservationsChange: (value: string) => void;
  onDeliveryModeChange: (value: 'WAREHOUSE' | 'ON_SITE') => void;
  onWorksiteChange: (value: string) => void;
  onVehicleChange: (value: string | null) => void;
  onDriverChange: (value: string | null) => void;
  onDispatcherChange: (value: string | null) => void;
  onNext: () => void;
};

const HelpLabel = ({
  label,
  help,
  required = false,
}: {
  label: string;
  help: string;
  required?: boolean;
}) => (
  <Group gap={6} align="center">
    <Text span>{label}</Text>
    {required ? <Text span c="red" fw={700}>*</Text> : null}
    <Tooltip label={help} multiline w={280} withArrow>
      <Text span c="dimmed" fw={700} style={{ cursor: 'help' }}>?</Text>
    </Tooltip>
  </Group>
);

export default function RequestInfoStep({
  documentType,
  consecutive,
  customerId,
  documentDate,
  warehouseId,
  observations,
  deliveryMode,
  worksiteId,
  vehicleId,
  driverId,
  dispatcherId,
  customerOptions,
  worksiteOptions,
  vehicleOptions,
  employeeOptions,
  warehouses,
  errors,
  error,
  editing,
  isAdmin,
  isDriver,
  isMobile,
  worksitesLoading,
  onDismissError,
  onDocumentTypeChange,
  onConsecutiveChange,
  onCustomerChange,
  onDocumentDateChange,
  onWarehouseChange,
  onObservationsChange,
  onDeliveryModeChange,
  onWorksiteChange,
  onVehicleChange,
  onDriverChange,
  onDispatcherChange,
  onNext,
}: RequestInfoStepProps) {
  const isReturn = documentType === 'RETURN';
  const isOnSite = deliveryMode === 'ON_SITE';

  return (
    <>
      {error ? (
        <Alert color="red" variant="light" mb="md" withCloseButton onClose={onDismissError}>
          {error}
        </Alert>
      ) : null}

      <Stack gap="md">
        <Paper withBorder radius="lg" p="md" bg="gray.0">
          <Stack gap="md">
            <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
              <div>
                <Text fw={800}>Documento</Text>
                <Text size="sm" c="dimmed">Define el tipo, consecutivo y fecha base del movimiento.</Text>
              </div>
              <Badge color={isReturn ? 'orange' : 'blue'} variant="light">
                {isReturn ? 'Devolución' : 'Remisión'}
              </Badge>
            </Group>

            <Radio.Group
              value={documentType}
              onChange={(value) => onDocumentTypeChange(value as 'REMISSION' | 'RETURN')}
              label="Tipo"
            >
              <Group mt="xs">
                <Radio value="REMISSION" label="Despacho" />
                <Radio value="RETURN" label="Devolución" />
              </Group>
            </Radio.Group>

            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              {!isDriver ? (
                <TextInput
                  label={<HelpLabel label="Consecutivo (opcional)" help="Si queda vacío, oficina puede asignarlo en la confirmación." />}
                  withAsterisk={false}
                  value={consecutive}
                  onChange={(event) => onConsecutiveChange(event.currentTarget.value)}
                />
              ) : null}
              <Select
                label="Razón social"
                value={customerId}
                onChange={onCustomerChange}
                data={customerOptions}
                searchable
                clearable
                required
                placeholder="Buscar cliente"
                nothingFoundMessage="No se encontraron clientes"
                error={errors.customerId}
              />
              <TextInput
                label={<HelpLabel label="Fecha" help="Fecha del documento de despacho o devolución." required />}
                withAsterisk={false}
                type="date"
                value={documentDate}
                onChange={(event) => onDocumentDateChange(event.currentTarget.value)}
                required
                error={errors.docDate}
              />
            </SimpleGrid>

            {editing && isAdmin ? (
              <WarehouseSelect
                label={isReturn ? 'Bodega destino' : 'Bodega del documento'}
                value={warehouseId}
                onChange={onWarehouseChange}
                warehouses={warehouses}
                clearable={false}
                required
                width="100%"
              />
            ) : null}

            <Textarea
              label="Observaciones"
              description="Información adicional que aparecerá en el documento."
              placeholder={
                isReturn
                  ? 'Ej. Equipos entregados sin novedades'
                  : 'Ej. Entregar en la portería de la obra'
              }
              value={observations}
              onChange={(event) => onObservationsChange(event.currentTarget.value)}
              minRows={3}
              maxRows={6}
              autosize
            />
          </Stack>
        </Paper>

        <Paper withBorder radius="lg" p="md">
          <Stack gap="sm">
            <Text fw={800}>{isReturn ? 'Modo de devolución' : 'Modo de entrega'}</Text>
            <Text size="sm" c="dimmed">
              {isReturn
                ? 'Indica si el cliente entrega los equipos en bodega o REV los recoge en la obra.'
                : 'Indica si el cliente retira en bodega o REV transporta los equipos a la obra.'}
            </Text>
            <Radio.Group
              value={deliveryMode}
              onChange={(value) => onDeliveryModeChange(value as 'WAREHOUSE' | 'ON_SITE')}
              label={isReturn ? 'Devolución' : 'Entrega'}
            >
              <Group mt="xs">
                <Radio
                  value="WAREHOUSE"
                  label={isReturn ? 'Cliente entrega en bodega' : 'Despacho desde bodega'}
                />
                <Radio
                  value="ON_SITE"
                  label={isReturn ? 'Recogida en obra' : 'Entrega en obra'}
                />
              </Group>
            </Radio.Group>
          </Stack>
        </Paper>

        <Paper withBorder radius="lg" p="md">
          <Stack gap="md">
            <div>
              <Text fw={800}>Cliente, obra y responsables</Text>
              <Text size="sm" c="dimmed">
                {isReturn
                  ? 'Selecciona el origen y quién recibe o recoge la devolución.'
                  : 'Selecciona el destino y quién responde por el despacho.'}
              </Text>
            </div>
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              {isMobile ? (
                <NativeSelect
                  label={<HelpLabel label="Obra" help="Obra destino del movimiento." />}
                  value={worksiteId}
                  onChange={(event) => onWorksiteChange(event.currentTarget.value)}
                  data={[
                    { value: '', label: customerId ? 'Seleccionar obra' : 'Selecciona primero un cliente' },
                    ...worksiteOptions,
                  ]}
                  disabled={!customerId || worksitesLoading}
                  error={errors.customerWorksiteId}
                />
              ) : (
                <Select
                  label={<HelpLabel label="Obra" help="Obra destino del movimiento." />}
                  value={worksiteId}
                  onChange={(value) => onWorksiteChange(value ?? '')}
                  data={worksiteOptions}
                  searchable
                  clearable
                  placeholder={customerId ? 'Seleccionar obra' : 'Selecciona primero un cliente'}
                  disabled={!customerId || worksitesLoading}
                  error={errors.customerWorksiteId}
                />
              )}

              {isOnSite && (isMobile ? (
                <NativeSelect
                  label={<HelpLabel label="Vehículo" help={isReturn ? 'Vehículo que recoge la devolución en la obra.' : 'Vehículo que transporta el despacho a obra.'} />}
                  value={vehicleId ?? ''}
                  onChange={(event) => onVehicleChange(event.currentTarget.value || null)}
                  data={[{ value: '', label: 'Seleccionar vehículo' }, ...vehicleOptions]}
                />
              ) : (
                <Select
                  label={<HelpLabel label="Vehículo" help={isReturn ? 'Vehículo que recoge la devolución en la obra.' : 'Vehículo que transporta el despacho a obra.'} />}
                  value={vehicleId}
                  onChange={onVehicleChange}
                  data={vehicleOptions}
                  searchable
                  clearable
                />
              ))}

              {isOnSite && (isMobile ? (
                <NativeSelect
                  label={<HelpLabel label="Conductor" help={isReturn ? 'Persona responsable de recoger la devolución en la obra.' : 'Persona responsable del transporte del despacho.'} />}
                  value={driverId ?? ''}
                  onChange={(event) => onDriverChange(event.currentTarget.value || null)}
                  data={[{ value: '', label: 'Seleccionar conductor' }, ...employeeOptions]}
                  disabled={isDriver}
                  error={errors.driverId}
                />
              ) : (
                <Select
                  label={<HelpLabel label="Conductor" help={isReturn ? 'Persona responsable de recoger la devolución en la obra.' : 'Persona responsable del transporte del despacho.'} />}
                  value={driverId}
                  onChange={onDriverChange}
                  data={employeeOptions}
                  searchable
                  clearable
                  disabled={isDriver}
                  error={errors.driverId}
                />
              ))}

              {isReturn && !isOnSite && (isMobile ? (
                <NativeSelect
                  label={<HelpLabel label="Recibido por" help="Empleado de REV que recibe la devolución." required />}
                  withAsterisk={false}
                  value={driverId ?? ''}
                  onChange={(event) => onDriverChange(event.currentTarget.value || null)}
                  data={[{ value: '', label: 'Seleccionar empleado' }, ...employeeOptions]}
                  disabled={isDriver}
                  error={errors.driverId}
                  required
                />
              ) : (
                <Select
                  label={<HelpLabel label="Recibido por" help="Empleado de REV que recibe la devolución." required />}
                  withAsterisk={false}
                  value={driverId}
                  onChange={onDriverChange}
                  data={employeeOptions}
                  searchable
                  clearable
                  disabled={isDriver}
                  error={errors.driverId}
                  required
                  placeholder="Buscar empleado"
                />
              ))}

              {!isReturn && !isOnSite && (isMobile ? (
                <NativeSelect
                  label={<HelpLabel label="Despachador" help="Empleado que entrega material desde bodega." />}
                  value={dispatcherId ?? ''}
                  onChange={(event) => onDispatcherChange(event.currentTarget.value || null)}
                  data={[{ value: '', label: 'Seleccionar despachador' }, ...employeeOptions]}
                  disabled={isDriver}
                />
              ) : (
                <Select
                  label={<HelpLabel label="Despachador" help="Empleado que entrega material desde bodega." />}
                  value={dispatcherId}
                  onChange={onDispatcherChange}
                  data={employeeOptions}
                  searchable
                  clearable
                  disabled={isDriver}
                />
              ))}
            </SimpleGrid>
          </Stack>
        </Paper>
      </Stack>

      <Group mt="md" justify="flex-end" className="mobile-actions">
        <Button type="button" onClick={onNext}>Siguiente: Ítems</Button>
      </Group>
    </>
  );
}
