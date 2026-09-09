'use client';
import type { RequestInventorySourceMode } from './request-inventory-source';
import WarehouseSelect from '@/components/WarehouseSelect';
import DocumentTimeInput from '@/components/DocumentTimeInput';
import {
  Badge,
  Button,
  Group,
  NativeSelect,
  Paper,
  Radio,
  Select,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import type { Dispatch, JSX, SetStateAction } from 'react';
import { formatDocType } from './request-formatting';
import {
  Customer,
  GenerateFieldErrors,
  GenerateStep,
  Warehouse,
} from './request-types';
import { helpLabel } from './RequestHelpLabel';

type Props = {
  inventorySourceMode: RequestInventorySourceMode;
  principalWarehouse: Warehouse | null;
  changePhysicalSource: (mode: RequestInventorySourceMode, warehouseId: string | null) => void;
  docType: 'REMISSION' | 'RETURN';
  editingRequestId: string | null;
  autosaveDraftId: string | null;
  autosaveStatus: 'error' | 'idle' | 'saving' | 'saved' | 'offline';
  resetGenerateForm: () => void;
  generateStep: GenerateStep;
  handleGenerateStepChange: (value: string | null) => void;
  isTabletOrMobile: boolean;
  renderGenerateError: () => JSX.Element | null;
  setDocType: Dispatch<SetStateAction<'REMISSION' | 'RETURN'>>;
  isDriverRole: boolean;
  consecutive: string;
  setConsecutive: Dispatch<SetStateAction<string>>;
  customerId: string | null;
  setCustomerId: Dispatch<SetStateAction<string | null>>;
  setCustomerWorksiteId: Dispatch<SetStateAction<string>>;
  setGenerateFieldErrors: Dispatch<SetStateAction<GenerateFieldErrors>>;
  customers: Customer[];
  generateFieldErrors: GenerateFieldErrors;
  docDate: string;
  setDocDate: Dispatch<SetStateAction<string>>;
  docTime: string;
  setDocTime: Dispatch<SetStateAction<string>>;
  isAdminRole: boolean;
  warehouseId: string | null;
  setWarehouseId: Dispatch<SetStateAction<string | null>>;
  warehouses: Warehouse[];
  observations: string;
  setObservations: Dispatch<SetStateAction<string>>;
  deliveryMode: 'WAREHOUSE' | 'ON_SITE';
  setDeliveryMode: Dispatch<SetStateAction<'WAREHOUSE' | 'ON_SITE'>>;
  isMobile: boolean;
  customerWorksiteId: string;
  worksiteOptions: { value: string; label: string }[];
  worksitesLoading: boolean;
  vehicleId: string | null;
  setVehicleId: Dispatch<SetStateAction<string | null>>;
  vehicleOptions: { value: string; label: string }[];
  driverId: string | null;
  setDriverId: Dispatch<SetStateAction<string | null>>;
  employeeOptions: { value: string; label: string }[];
  dispatcherId: string | null;
  setDispatcherId: Dispatch<SetStateAction<string | null>>;
  goToItemsStep: () => Promise<void>;
};

export default function RequestInformationSection({
  inventorySourceMode,
  principalWarehouse,
  changePhysicalSource,
  docType,
  editingRequestId,
  autosaveDraftId,
  autosaveStatus,
  resetGenerateForm,
  generateStep,
  handleGenerateStepChange,
  isTabletOrMobile,
  renderGenerateError,
  setDocType,
  isDriverRole,
  consecutive,
  setConsecutive,
  customerId,
  setCustomerId,
  setCustomerWorksiteId,
  setGenerateFieldErrors,
  customers,
  generateFieldErrors,
  docDate,
  setDocDate,
  docTime,
  setDocTime,
  isAdminRole,
  warehouseId,
  setWarehouseId,
  warehouses,
  observations,
  setObservations,
  deliveryMode,
  setDeliveryMode,
  isMobile,
  customerWorksiteId,
  worksiteOptions,
  worksitesLoading,
  vehicleId,
  setVehicleId,
  vehicleOptions,
  driverId,
  setDriverId,
  employeeOptions,
  dispatcherId,
  setDispatcherId,
  goToItemsStep,
}: Props) {
  return (
    <Tabs.Panel value="generate" pt="md">
      <Stack gap="sm" mb="lg">
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
          <div>
            <Group gap="xs" mb={6}>
              <Badge
                color={docType === 'REMISSION' ? 'blue' : 'orange'}
                variant="light"
              >
                {formatDocType(docType)}
              </Badge>
              <Badge
                color={
                  editingRequestId ? 'grape' : autosaveDraftId ? 'blue' : 'teal'
                }
                variant="light"
              >
                {editingRequestId
                  ? `Editando ${editingRequestId.slice(0, 8)}`
                  : autosaveDraftId
                    ? `Borrador ${autosaveDraftId.slice(0, 8)}`
                    : 'Nueva solicitud'}
              </Badge>
              {autosaveDraftId ? (
                <Badge
                  color={
                    autosaveStatus === 'error'
                      ? 'red'
                      : autosaveStatus === 'saving' ||
                          autosaveStatus === 'offline'
                        ? 'yellow'
                        : 'green'
                  }
                  variant="dot"
                >
                  {autosaveStatus === 'saving'
                    ? 'Guardando...'
                    : autosaveStatus === 'offline'
                      ? 'Cambios en dispositivo'
                      : autosaveStatus === 'error'
                        ? 'Error al guardar'
                        : 'Guardado'}
                </Badge>
              ) : null}
            </Group>
            <Text fw={800} size="lg">
              Generar documento
            </Text>
            <Text size="sm" c="dimmed">
              Completa informacion, items y firma antes de enviar.
            </Text>
          </div>
          {editingRequestId || autosaveDraftId ? (
            <Button variant="light" color="gray" onClick={resetGenerateForm}>
              {editingRequestId ? 'Cancelar edición' : 'Salir del borrador'}
            </Button>
          ) : null}
        </Group>

        <Tabs
          value={generateStep}
          onChange={handleGenerateStepChange}
          variant="pills"
        >
          <Tabs.List grow={isTabletOrMobile}>
            <Tabs.Tab value="info">1. Informacion</Tabs.Tab>
            <Tabs.Tab value="items">2. Items</Tabs.Tab>
            <Tabs.Tab value="sign">3. Firma</Tabs.Tab>
          </Tabs.List>
        </Tabs>
      </Stack>
      {generateStep === 'info' ? (
        <>
          {renderGenerateError()}
          <Stack gap="md">
            <Paper withBorder radius="lg" p="md" bg="gray.0">
              <Stack gap="md">
                <Group
                  justify="space-between"
                  align="flex-start"
                  wrap="wrap"
                  gap="sm"
                >
                  <div>
                    <Text fw={800}>Documento</Text>
                    <Text size="sm" c="dimmed">
                      Define el tipo, consecutivo y fecha base del movimiento.
                    </Text>
                  </div>
                  <Badge
                    color={docType === 'REMISSION' ? 'blue' : 'orange'}
                    variant="light"
                  >
                    {formatDocType(docType)}
                  </Badge>
                </Group>

                <Radio.Group
                  value={docType}
                  onChange={(value) =>
                    setDocType(value as 'REMISSION' | 'RETURN')
                  }
                  label="Tipo"
                >
                  <Group mt="xs">
                    <Radio value="REMISSION" label="Despacho" />
                    <Radio value="RETURN" label="Devolucion" />
                  </Group>
                </Radio.Group>

                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                  {!isDriverRole ? (
                    <TextInput
                      label={helpLabel(
                        'Consecutivo físico (opcional)',
                        'Ingresa el número del papel. Si queda vacío, la app genera un consecutivo de la serie RM-APP o DV-APP.',
                      )}
                      withAsterisk={false}
                      value={consecutive}
                      onChange={(event) => setConsecutive(event.target.value)}
                    />
                  ) : null}
                  <Select
                    label="Razón social"
                    value={customerId}
                    onChange={(value) => {
                      setCustomerId(value);
                      setCustomerWorksiteId('');
                      setGenerateFieldErrors((prev) => ({
                        ...prev,
                        customerId: undefined,
                        customerWorksiteId: undefined,
                      }));
                    }}
                    data={customers.map((customer) => ({
                      value: customer.id,
                      label: customer.name,
                    }))}
                    searchable
                    clearable
                    required
                    placeholder="Buscar cliente"
                    nothingFoundMessage="No se encontraron clientes"
                    error={generateFieldErrors.customerId}
                  />
                  <TextInput
                    label={helpLabel(
                      'Fecha',
                      'Fecha del documento de despacho o devolucion.',
                      true,
                    )}
                    withAsterisk={false}
                    type="date"
                    value={docDate}
                    onChange={(event) => {
                      setDocDate(event.target.value);
                      setGenerateFieldErrors((prev) => ({
                        ...prev,
                        docDate: undefined,
                      }));
                    }}
                    required
                    error={generateFieldErrors.docDate}
                  />
                  <DocumentTimeInput
                    value={docTime}
                    onChange={(value) => {
                      setDocTime(value);
                      setGenerateFieldErrors((prev) => ({ ...prev, docTime: undefined }));
                    }}
                    error={generateFieldErrors.docTime}
                  />
                </SimpleGrid>
                {editingRequestId && isAdminRole && docType === 'RETURN' ? (
                  <WarehouseSelect
                    label={
                      docType === 'RETURN'
                        ? 'Bodega destino'
                        : 'Bodega del documento'
                    }
                    value={warehouseId}
                    onChange={setWarehouseId}
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
                    docType === 'RETURN'
                      ? 'Ej. Equipos entregados sin novedades'
                      : 'Ej. Entregar en la portería de la obra'
                  }
                  value={observations}
                  onChange={(event) =>
                    setObservations(event.currentTarget.value)
                  }
                  minRows={3}
                  maxRows={6}
                  autosize
                />
              </Stack>
            </Paper>

            {docType === 'REMISSION' ? (
              <Paper withBorder radius="lg" p="md">
                <Stack gap="sm">
                  <Text fw={800}>Salida física del inventario</Text>
                  <Text size="sm" c="dimmed">Indica dónde están los equipos. El propietario y el transporte se seleccionan por separado.</Text>
                  <Radio.Group value={inventorySourceMode}
                    onChange={value => changePhysicalSource(value as RequestInventorySourceMode, warehouseId ?? principalWarehouse?.id ?? null)}
                    label="Origen físico">
                    <Stack gap="xs" mt="xs">
                      <Radio value="WAREHOUSE" label="Desde una bodega" />
                      <Radio value="OWNER_WAREHOUSES" label="Directo desde bodegas de propietarios" />
                    </Stack>
                  </Radio.Group>
                  {inventorySourceMode === 'WAREHOUSE' ? (
                    <WarehouseSelect label="Bodega de salida" value={warehouseId ?? principalWarehouse?.id ?? null}
                      onChange={value => changePhysicalSource('WAREHOUSE', value)}
                      warehouses={warehouses} formatLabels={false} clearable={false} required width="100%" />
                  ) : null}
                </Stack>
              </Paper>
            ) : null}
            <Paper withBorder radius="lg" p="md">
              <Stack gap="sm">
                <Text fw={800}>
                  {docType === 'REMISSION'
                    ? 'Modo de entrega'
                    : 'Modo de devolución'}
                </Text>
                <Text size="sm" c="dimmed">
                  {docType === 'REMISSION'
                    ? 'Indica si el cliente retira en bodega o REV transporta los equipos a la obra.'
                    : 'Indica si el cliente entrega los equipos en bodega o REV los recoge en la obra.'}
                </Text>
                <Radio.Group
                  value={deliveryMode}
                  onChange={(value) =>
                    setDeliveryMode(value as 'WAREHOUSE' | 'ON_SITE')
                  }
                  label={docType === 'REMISSION' ? 'Entrega' : 'Devolución'}
                >
                  <Group mt="xs">
                    <Radio
                      value="WAREHOUSE"
                      label={
                        docType === 'REMISSION'
                          ? 'Cliente retira en bodega'
                          : 'Cliente entrega en bodega'
                      }
                    />
                    <Radio
                      value="ON_SITE"
                      label={
                        docType === 'REMISSION'
                          ? 'REV entrega en obra'
                          : 'Recogida en obra'
                      }
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
                    {docType === 'REMISSION'
                      ? 'Selecciona el destino y quién responde por el despacho.'
                      : 'Selecciona el origen y quién recibe o recoge la devolución.'}
                  </Text>
                </div>
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                  {isMobile ? (
                    <NativeSelect
                      label={helpLabel('Obra', 'Obra destino del movimiento.')}
                      value={customerWorksiteId}
                      onChange={(event) => {
                        setCustomerWorksiteId(event.currentTarget.value);
                        setGenerateFieldErrors((prev) => ({
                          ...prev,
                          customerWorksiteId: undefined,
                        }));
                      }}
                      data={[
                        {
                          value: '',
                          label: customerId
                            ? 'Seleccionar obra'
                            : 'Selecciona primero un cliente',
                        },
                        ...worksiteOptions,
                      ]}
                      disabled={!customerId || worksitesLoading}
                      error={generateFieldErrors.customerWorksiteId}
                    />
                  ) : (
                    <Select
                      label={helpLabel('Obra', 'Obra destino del movimiento.')}
                      value={customerWorksiteId}
                      onChange={(value) => {
                        setCustomerWorksiteId(value ?? '');
                        setGenerateFieldErrors((prev) => ({
                          ...prev,
                          customerWorksiteId: undefined,
                        }));
                      }}
                      data={worksiteOptions}
                      searchable
                      clearable
                      placeholder={
                        customerId
                          ? 'Seleccionar obra'
                          : 'Selecciona primero un cliente'
                      }
                      disabled={!customerId || worksitesLoading}
                      error={generateFieldErrors.customerWorksiteId}
                    />
                  )}
                  {deliveryMode === 'ON_SITE' &&
                    (isMobile ? (
                      <NativeSelect
                        label={helpLabel(
                          'Vehículo',
                          docType === 'REMISSION'
                            ? 'Vehiculo que transporta el despacho a obra.'
                            : 'Vehiculo que recoge la devolución en la obra.',
                        )}
                        value={vehicleId ?? ''}
                        onChange={(event) =>
                          setVehicleId(event.currentTarget.value || null)
                        }
                        data={[
                          { value: '', label: 'Seleccionar vehiculo' },
                          ...vehicleOptions,
                        ]}
                      />
                    ) : (
                      <Select
                        label={helpLabel(
                          'Vehículo',
                          docType === 'REMISSION'
                            ? 'Vehiculo que transporta el despacho a obra.'
                            : 'Vehiculo que recoge la devolución en la obra.',
                        )}
                        value={vehicleId}
                        onChange={(value) => setVehicleId(value)}
                        data={vehicleOptions}
                        searchable
                        clearable
                      />
                    ))}
                  {deliveryMode === 'ON_SITE' &&
                    (isMobile ? (
                      <NativeSelect
                        label={helpLabel(
                          'Conductor',
                          docType === 'REMISSION'
                            ? 'Persona responsable del transporte del despacho.'
                            : 'Persona responsable de recoger la devolución en la obra.',
                        )}
                        value={driverId ?? ''}
                        onChange={(event) => {
                          setDriverId(event.currentTarget.value || null);
                          setGenerateFieldErrors((prev) => ({
                            ...prev,
                            driverId: undefined,
                          }));
                        }}
                        data={[
                          { value: '', label: 'Seleccionar conductor' },
                          ...employeeOptions,
                        ]}
                        disabled={isDriverRole}
                        error={generateFieldErrors.driverId}
                      />
                    ) : (
                      <Select
                        label={helpLabel(
                          'Conductor',
                          docType === 'REMISSION'
                            ? 'Persona responsable del transporte del despacho.'
                            : 'Persona responsable de recoger la devolución en la obra.',
                        )}
                        value={driverId}
                        onChange={(value) => {
                          setDriverId(value);
                          setGenerateFieldErrors((prev) => ({
                            ...prev,
                            driverId: undefined,
                          }));
                        }}
                        data={employeeOptions}
                        searchable
                        clearable
                        disabled={isDriverRole}
                        error={generateFieldErrors.driverId}
                      />
                    ))}
                  {docType === 'RETURN' &&
                    deliveryMode === 'WAREHOUSE' &&
                    (isMobile ? (
                      <NativeSelect
                        label={helpLabel(
                          'Recibido por',
                          'Empleado de REV que recibe la devolución.',
                          true,
                        )}
                        withAsterisk={false}
                        value={driverId ?? ''}
                        onChange={(event) => {
                          setDriverId(event.currentTarget.value || null);
                          setGenerateFieldErrors((prev) => ({
                            ...prev,
                            driverId: undefined,
                          }));
                        }}
                        data={[
                          { value: '', label: 'Seleccionar empleado' },
                          ...employeeOptions,
                        ]}
                        disabled={isDriverRole}
                        error={generateFieldErrors.driverId}
                        required
                      />
                    ) : (
                      <Select
                        label={helpLabel(
                          'Recibido por',
                          'Empleado de REV que recibe la devolución.',
                          true,
                        )}
                        withAsterisk={false}
                        value={driverId}
                        onChange={(value) => {
                          setDriverId(value);
                          setGenerateFieldErrors((prev) => ({
                            ...prev,
                            driverId: undefined,
                          }));
                        }}
                        data={employeeOptions}
                        searchable
                        clearable
                        disabled={isDriverRole}
                        error={generateFieldErrors.driverId}
                        required
                        placeholder="Buscar empleado"
                      />
                    ))}
                  {docType === 'REMISSION' &&
                    deliveryMode === 'WAREHOUSE' &&
                    (isMobile ? (
                      <NativeSelect
                        label={helpLabel(
                          'Despachador',
                          'Empleado que entrega material desde bodega.',
                        )}
                        value={dispatcherId ?? ''}
                        onChange={(event) =>
                          setDispatcherId(event.currentTarget.value || null)
                        }
                        data={[
                          { value: '', label: 'Seleccionar despachador' },
                          ...employeeOptions,
                        ]}
                        disabled={isDriverRole}
                      />
                    ) : (
                      <Select
                        label={helpLabel(
                          'Despachador',
                          'Empleado que entrega material desde bodega.',
                        )}
                        value={dispatcherId}
                        onChange={(value) => setDispatcherId(value)}
                        data={employeeOptions}
                        searchable
                        clearable
                        disabled={isDriverRole}
                      />
                    ))}
                </SimpleGrid>
              </Stack>
            </Paper>
          </Stack>
          <Group mt="md" justify="flex-end" className="mobile-actions">
            <Button onClick={goToItemsStep}>Siguiente: Items</Button>
          </Group>
        </>
      ) : null}
    </Tabs.Panel>
  );
}
