import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { loadTransportModule } from './test-support.cjs';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/',
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
const mounted = [];
afterEach(async () => {
  for (const renderer of mounted.splice(0)) await act(() => renderer.unmount());
});
const noop = () => {};
class ApiError extends Error {}

const approvalOptions = {
  skuOptions: [], setRequestsError: noop, canDecide: true, warehouses: [],
  setItemsAddedNotice: noop, setProviderRemissionModal: noop,
  setProviderRemissionError: noop, loadRequests: async () => {},
  providerRemissionModal: null, providerRemissionDrafts: {},
  uploadProviderRemissionDocuments: async () => {}, clearProviderRemissionDocuments: noop,
};

test('aprobación consulta requisitos de proveedor antes de ejecutar el movimiento', async () => {
  const calls = [];
  window.confirm = () => true;
  const { useRequestApproval } = loadTransportModule('use-request-approval.ts', {
    '@/lib/api': { ApiError, api: async (url, options) => {
      calls.push({ url, options });
      return url.endsWith('/provider-remission-requirements') ? { missingProviders: [] } : { items: [] };
    } },
  });
  const hook = await mountHook(useRequestApproval, approvalOptions);
  await act(() => hook.current.decideRequest('document', 'APPROVE'));
  assert.deepEqual(calls.map(call => call.url), ['/documents/document', '/documents/document/provider-remission-requirements', '/documents/document/decision']);
  assert.deepEqual(calls[2].options.json, { action: 'APPROVE' });
  assert.equal(hook.current.decidingId, null);
});

test('remisión física pendiente abre recuperación y bloquea la aprobación', async () => {
  const calls = [], dialogs = [];
  const provider = { providerWarehouseId: 'ally', providerName: 'Proveedor', quantity: 1, itemCount: 1 };
  window.confirm = () => true;
  const { useRequestApproval } = loadTransportModule('use-request-approval.ts', {
    '@/lib/api': { ApiError, api: async url => {
      calls.push(url);
      return url.endsWith('/provider-remission-requirements') ? { required: true, providers: [provider], missingProviders: [provider] } : { items: [] };
    } },
  });
  const hook = await mountHook(useRequestApproval, { ...approvalOptions, setProviderRemissionModal: value => dialogs.push(value) });
  await act(() => hook.current.decideRequest('document', 'APPROVE'));
  assert.equal(dialogs[0].mode, 'REQUIRED');
  assert.equal(dialogs[0].documentId, 'document');
  assert.ok(!calls.some(url => url.endsWith('/decision')));
});

async function mountHook(hook, initial) {
  let result;
  function Harness({ options }) {
    result = hook(options);
    return null;
  }
  let renderer;
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    renderer = createRoot(container);
    renderer.render(React.createElement(Harness, { options: initial }));
  });
  mounted.push({
    unmount() {
      renderer.unmount();
      container.remove();
    },
  });
  return {
    get current() {
      return result;
    },
    async update(options) {
      await act(async () => {
        renderer.render(React.createElement(Harness, { options }));
      });
    },
  };
}

const warehouseOptions = {
  selectedItems: [],
  docType: 'REMISSION',
  sourceMode: 'warehouse',
  principalWarehouse: null,
  sourceOwnerWarehouseId: 'ally',
  warehouses: [{ id: 'ally', name: 'Proveedor', type: 'ALLY' }],
  canDecide: true,
  effectiveSourceWorksiteId: null,
  useManualWarehouseCapture: true,
  activeTab: 'generate',
  generateStep: 'items',
  setSourceOwnerWarehouseId: noop,
  setError: noop,
  setFreeTagInput: noop,
  setFreeInternalNumber: noop,
  clearProviderRemissionDocuments: noop,
  setSourceWorksiteId: noop,
};

test('Office carga inventario de bodega alterna y abre el selector; Driver conserva captura libre', async () => {
  const calls = [],
    errors = [];
  const { useRequestInventory } = loadTransportModule(
    'use-request-inventory.ts',
    {
      '@/lib/api': {
        ApiError,
        api: async (url) => {
          calls.push(url);
          return {
            bulk: [{ skuId: 'bulk', ownerWarehouseId: 'ally' }],
            serial: [
              { assetId: 'bucket', ownerWarehouseId: 'ally' },
              { assetId: 'foreign', ownerWarehouseId: 'own' },
            ],
          };
        },
      },
    },
  );
  const options = {
    ...warehouseOptions,
    setError: (value) => errors.push(value),
  };
  const hook = await mountHook(useRequestInventory, options);
  await act(() => hook.current.loadInventory());
  assert.deepEqual(calls, ['/inventory/warehouse/ally']);
  assert.deepEqual(
    hook.current.serialItems.map((item) => item.assetId),
    ['bucket'],
  );
  assert.equal(hook.current.itemsModalOpen, true);
  await hook.update({ ...options, canDecide: false });
  await act(() => hook.current.loadInventory());
  assert.equal(calls.length, 1);
  assert.match(errors.at(-1), /captura libre/);
});

test('devolución consulta saldo de obra y conserva la presentación de dueños del backend', async () => {
  const calls = [];
  const { useRequestInventory } = loadTransportModule(
    'use-request-inventory.ts',
    {
      '@/lib/api': {
        ApiError,
        api: async (url) => {
          calls.push(url);
          return {
            bulk: [],
            serial: [{ assetId: 'motor', kind: 'MOTOR' }],
            presentation: { showOwnerWarehouse: false },
          };
        },
      },
    },
  );
  const hook = await mountHook(useRequestInventory, {
    ...warehouseOptions,
    docType: 'RETURN',
    sourceMode: 'on-site',
    effectiveSourceWorksiteId: 'site',
    useManualWarehouseCapture: false,
  });
  await act(() => hook.current.loadInventory());
  assert.equal(calls.at(-1), '/inventory/on-site/site/request-options');
  assert.equal(hook.current.showInventoryOwnerWarehouse, false);
  assert.equal(hook.current.pickerSerialItems[0].assetId, 'motor');
});

test('selección preserva grupos exclusivos y vincula un implemento recién creado con su equipo y dueño', async () => {
  const parent = {
    assetId: 'loader',
    ownerWarehouseId: 'ally',
    description: 'Minicargador',
  };
  const bucket = {
    assetId: 'new-bucket',
    ownerWarehouseId: 'ally',
    description: 'Balde',
  };
  const option = {
    id: 'rule',
    family: { id: 'buckets', controlType: 'SERIAL' },
    exclusiveGroup: 'IMPLEMENTO FRONTAL',
  };
  let selected = [];
  const { useRequestAssetSelection } = loadTransportModule(
    'use-request-asset-selection.ts',
    {
      '@/lib/api': { ApiError, api: async () => ({ components: [option] }) },
    },
  );
  const options = {
    serialItems: [parent],
    selectedSerialIds: new Set(),
    setSelectedItems: (update) => {
      selected = update(selected);
    },
    setItemsModalOpen: noop,
    docType: 'REMISSION',
    setError: noop,
    setItemsAddedNotice: noop,
    setSerialItems: noop,
  };
  const hook = await mountHook(useRequestAssetSelection, options);
  await act(async () => {
    hook.current.addSerialItem(parent);
  });
  assert.equal(
    hook.current.componentOptions[0].exclusiveGroup,
    'IMPLEMENTO FRONTAL',
  );
  await hook.update({ ...options, serialItems: [parent, bucket] });
  await act(() =>
    hook.current.confirmAssetComponents([{ type: 'serial', item: bucket }]),
  );
  assert.equal(selected[1].assetId, 'new-bucket');
  assert.equal(selected[1].componentParentAssetId, 'loader');
  assert.equal(selected[1].ownerWarehouseId, 'ally');
});

test('autoguardado conserva firma, destinatarios y vínculo del implemento en su payload', async () => {
  const { useRequestAutosave } = loadTransportModule(
    'use-request-autosave.ts',
    { '@/lib/api': { api: noop } },
  );
  const hook = await mountHook(useRequestAutosave, {
    docType: 'REMISSION',
    consecutive: '123',
    warehouseId: 'own',
    principalWarehouse: null,
    customerWorksiteId: 'site',
    observations: 'Entregar por portería',
    docDate: '2026-09-07',
    deliveryMode: 'ON_SITE',
    vehicleId: 'truck',
    driverId: 'driver',
    dispatcherId: null,
    shouldSendWhatsapp: true,
    whatsappRecipientPhones: ['3001234567'],
    receivedSignature: 'signature',
    selectedItems: [
      {
        type: 'serial',
        name: 'Balde',
        assetId: 'bucket',
        componentParentAssetId: 'loader',
        ownerWarehouseId: 'ally',
      },
    ],
    autosaveDraftId: null,
    autosaveReady: false,
    editingRequestId: null,
    submitting: false,
  });
  const payload = hook.current.autosavePayload;
  assert.equal(payload.number, 'RM123');
  assert.equal(payload.receivedSignature, 'signature');
  assert.deepEqual(payload.recipientPhones, ['3001234567']);
  assert.equal(payload.items[0].componentParentAssetId, 'loader');
  assert.equal(payload.items[0].ownerWarehouseId, 'ally');
  assert.match(payload.notes, /Conductor: driver/);
});

const submissionOptions = {
  setSubmitting: noop,
  observations: 'Entregar',
  vehicleId: null,
  dispatcherId: null,
  mode: 'generate',
  setSubmitResult: noop,
  setError: noop,
  docDate: '2026-09-07',
  customerId: 'customer',
  selectedItems: [
    {
      type: 'serial',
      name: 'Balde',
      assetId: 'bucket',
      componentParentAssetId: 'loader',
      ownerWarehouseId: 'ally',
    },
  ],
  customerWorksiteId: 'site',
  shouldSendWhatsapp: false,
  recipientPhoneDraft: '',
  whatsappRecipientPhones: [],
  editingRequestId: null,
  receivedSignature: 'signature',
  warehouseId: 'own',
  principalWarehouse: null,
  docType: 'REMISSION',
  deliveryMode: 'ON_SITE',
  isDriverRole: false,
  driverId: null,
  consecutive: '123',
  isAdminRole: false,
  autosaveDraftId: null,
  evidencePhotos: [],
  providerRemissionDrafts: {},
  autosavePayload: {},
  resetGenerateForm: noop,
  setItemsModalOpen: noop,
  setWorksites: noop,
  uploadEvidencePhotos: async () => {},
  uploadProviderRemissionDocuments: async () => {},
  creationProviderRequirements: null,
  setActiveTab: noop,
  fixedTab: 'generate',
  loadRequests: async () => {},
  router: { refresh: noop, push: noop },
};

test('envío online mantiene el vínculo, acepta dueño pendiente y omite WhatsApp cuando Office lo desactiva', async () => {
  const calls = [],
    errors = [];
  Object.defineProperty(globalThis.navigator, 'onLine', {
    configurable: true,
    value: true,
  });
  const { useRequestSubmission } = loadTransportModule(
    'use-request-submission.ts',
    {
      '@/lib/api': {
        ApiError,
        api: async (url, options) => {
          calls.push({ url, options });
          return { id: 'document' };
        },
      },
      '@/lib/offline-queue': {
        enqueueOfflineOperation: async () => {
          throw Error('No offline expected');
        },
        syncOfflineOperations: noop,
      },
    },
  );
  const hook = await mountHook(useRequestSubmission, {
    ...submissionOptions,
    setError: (error) => errors.push(error),
    selectedItems: [
      ...submissionOptions.selectedItems,
      {
        type: 'bulk',
        name: 'Cuña',
        skuId: 'wedge',
        quantity: 2,
        ownerWarehouseId: null,
      },
    ],
  });
  await act(() => hook.current.handleSubmit());
  assert.deepEqual(errors.filter(Boolean), []);
  const payload = calls[0].options.json;
  assert.equal(payload.items[0].componentParentAssetId, 'loader');
  assert.equal(payload.items[0].ownerWarehouseId, 'ally');
  assert.equal(payload.items[1].ownerWarehouseId, undefined);
  assert.equal(payload.sendWhatsapp, false);
  assert.ok(!calls.some((call) => call.url.includes('customer-messages')));
});

test('edición Office preserva la firma existente del documento', async () => {
  const calls = [];
  Object.defineProperty(globalThis.navigator, 'onLine', {
    configurable: true,
    value: true,
  });
  const { useRequestSubmission } = loadTransportModule(
    'use-request-submission.ts',
    {
      '@/lib/api': {
        ApiError,
        api: async (url, options) => {
          calls.push({ url, options });
          return { id: 'document' };
        },
      },
      '@/lib/offline-queue': {
        enqueueOfflineOperation: noop,
        syncOfflineOperations: noop,
      },
    },
  );
  const hook = await mountHook(useRequestSubmission, {
    ...submissionOptions,
    editingRequestId: 'document',
  });
  await act(() => hook.current.handleSubmit());
  assert.equal(calls[0].url, '/documents/document/request');
  assert.equal(calls[0].options.method, 'PATCH');
  assert.equal(calls[0].options.json.receivedSignature, undefined);
});

test('envío offline conserva el orden guardar → enviar → correo sin perder implementos', async () => {
  const queued = [],
    errors = [];
  Object.defineProperty(globalThis.navigator, 'onLine', {
    configurable: true,
    value: false,
  });
  const { useRequestSubmission } = loadTransportModule(
    'use-request-submission.ts',
    {
      '@/lib/api': {
        ApiError,
        api: async () => {
          throw Error('No network expected');
        },
      },
      '@/lib/offline-queue': {
        enqueueOfflineOperation: async (op) => {
          queued.push(op);
          return { id: `op-${queued.length}` };
        },
        syncOfflineOperations: noop,
      },
    },
  );
  const hook = await mountHook(useRequestSubmission, {
    ...submissionOptions,
    autosaveDraftId: 'draft',
    setError: (error) => errors.push(error),
  });
  await act(() => hook.current.handleSubmit());
  assert.deepEqual(errors.filter(Boolean), []);
  assert.deepEqual(
    queued.map((op) => op.path),
    [
      '/documents/draft/request/autosave',
      '/documents/draft/request/submit',
      '/documents/draft/customer-email/draft',
    ],
  );
  assert.deepEqual(queued[1].dependsOn, ['op-1']);
  assert.deepEqual(queued[2].dependsOn, ['op-2']);
  assert.equal(queued[0].body.items[0].componentParentAssetId, 'loader');
});

test('devolución dañada exige descripción antes de enviar', async () => {
  const errors = [],
    calls = [];
  Object.defineProperty(globalThis.navigator, 'onLine', {
    configurable: true,
    value: true,
  });
  const { useRequestSubmission } = loadTransportModule(
    'use-request-submission.ts',
    {
      '@/lib/api': {
        ApiError,
        api: async (url) => {
          calls.push(url);
        },
      },
      '@/lib/offline-queue': {
        enqueueOfflineOperation: noop,
        syncOfflineOperations: noop,
      },
    },
  );
  const hook = await mountHook(useRequestSubmission, {
    ...submissionOptions,
    docType: 'RETURN',
    driverId: 'driver',
    setError: (error) => errors.push(error),
    selectedItems: [
      { type: 'serial', assetId: 'asset', name: 'Equipo', isDamaged: true },
    ],
  });
  await act(() => hook.current.handleSubmit());
  assert.match(errors.at(-1), /Describe el daño/);
  assert.deepEqual(calls, []);
});
