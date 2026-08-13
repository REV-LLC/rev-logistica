import { getCurrentUserSession, getToken } from './auth';

const DATABASE_NAME = 'rev-logistica-offline';
const DATABASE_VERSION = 2;
const STORE_NAME = 'operations';
export const OFFLINE_QUEUE_EVENT = 'revlogistica:offline-queue-changed';

export type OfflineOperationStatus =
  | 'pending'
  | 'syncing'
  | 'completed'
  | 'conflict'
  | 'failed';

export type OfflineOperation = {
  id: string;
  userId: string;
  label: string;
  path: string;
  method: string;
  body: Record<string, unknown>;
  dependsOn: string[];
  status: OfflineOperationStatus;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  response?: Record<string, unknown>;
  error?: string;
};

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
        store.createIndex('userId', 'userId');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const database = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = action(transaction.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => reject(transaction.error);
  });
}

function notifyQueueChanged() {
  window.dispatchEvent(new Event(OFFLINE_QUEUE_EVENT));
}

export async function enqueueOfflineOperation(input: {
  label: string;
  path: string;
  method?: string;
  body?: Record<string, unknown>;
  dependsOn?: string[];
}) {
  const userId = getCurrentUserSession()?.sub;
  if (!userId) throw new Error('No hay una sesión válida para guardar la operación.');
  const now = new Date().toISOString();
  const operation: OfflineOperation = {
    id: crypto.randomUUID(),
    userId,
    label: input.label,
    path: input.path,
    method: input.method ?? 'POST',
    body: input.body ?? {},
    dependsOn: input.dependsOn ?? [],
    status: 'pending',
    attempts: 0,
    createdAt: now,
    updatedAt: now,
  };
  await withStore('readwrite', (store) => store.put(operation));
  notifyQueueChanged();
  return operation;
}

export async function listOfflineOperations() {
  const userId = getCurrentUserSession()?.sub;
  if (!userId) return [];
  const operations = await withStore<OfflineOperation[]>('readonly', (store) =>
    store.getAll(),
  );
  return operations
    .filter((operation) => operation.userId === userId)
    .map((operation) => ({ ...operation, dependsOn: operation.dependsOn ?? [] }))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

async function saveOperation(operation: OfflineOperation) {
  const updated = { ...operation, updatedAt: new Date().toISOString() };
  await withStore('readwrite', (store) => store.put(updated));
  notifyQueueChanged();
  return updated;
}

let activeSync: Promise<void> | null = null;

export function syncOfflineOperations() {
  if (activeSync) return activeSync;
  activeSync = runSync().finally(() => {
    activeSync = null;
  });
  return activeSync;
}

async function runSync() {
  if (!navigator.onLine) return;
  const token = getToken();
  if (!token) return;
  const operations = await listOfflineOperations();
  const completedIds = new Set(
    operations
      .filter((operation) => operation.status === 'completed')
      .map((operation) => operation.id),
  );
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';

  for (const originalOperation of operations) {
    if (!['pending', 'failed'].includes(originalOperation.status)) continue;
    if (!originalOperation.dependsOn.every((id) => completedIds.has(id))) continue;

    let operation = await saveOperation({
      ...originalOperation,
      status: 'syncing',
      attempts: originalOperation.attempts + 1,
      error: undefined,
    });

    try {
      const response = await fetch(`${apiBase}${operation.path}`, {
        method: operation.method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': operation.id,
        },
        body: JSON.stringify(operation.body),
      });
      const contentType = response.headers.get('content-type') ?? '';
      const data = contentType.includes('application/json')
        ? await response.json()
        : { message: await response.text() };

      if (!response.ok) {
        operation = await saveOperation({
          ...operation,
          status: response.status === 400 || response.status === 409 ? 'conflict' : 'failed',
          error: String(data?.message ?? data?.error ?? response.statusText),
        });
        if (response.status === 401 || response.status >= 500) break;
        continue;
      }

      operation = await saveOperation({
        ...operation,
        status: 'completed',
        response: data as Record<string, unknown>,
      });
      completedIds.add(operation.id);
    } catch (error) {
      await saveOperation({
        ...operation,
        status: 'pending',
        error: error instanceof Error ? error.message : 'Sin conexión',
      });
      break;
    }
  }
}

export async function retryOfflineOperation(id: string) {
  const operations = await listOfflineOperations();
  const operation = operations.find((item) => item.id === id);
  if (!operation || operation.status === 'completed') return;
  await saveOperation({ ...operation, status: 'pending', error: undefined });
  await syncOfflineOperations();
}
