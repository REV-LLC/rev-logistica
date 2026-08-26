import { ApiError } from '@/lib/api';

export function normalizeApiErrorMessages(error: ApiError) {
  const messages: string[] = [];
  if (typeof error.message === 'string' && error.message.trim()) {
    messages.push(error.message.trim());
  }
  const data = error.data as
    | { message?: string | string[]; error?: string }
    | string
    | null
    | undefined;
  if (typeof data === 'string' && data.trim()) {
    messages.push(data.trim());
  } else if (data && typeof data === 'object') {
    if (typeof data.error === 'string' && data.error.trim()) {
      messages.push(data.error.trim());
    }
    const apiMessage = data.message;
    if (Array.isArray(apiMessage)) {
      apiMessage.forEach((entry) => {
        if (typeof entry === 'string' && entry.trim()) messages.push(entry.trim());
      });
    } else if (typeof apiMessage === 'string' && apiMessage.trim()) {
      messages.push(apiMessage.trim());
    }
  }
  return [...new Set(messages)];
}

export function formatTransportError(error: unknown, fallback: string) {
  const message = error instanceof ApiError
    ? (normalizeApiErrorMessages(error)[0] ?? '')
    : error instanceof Error
      ? error.message.trim()
      : '';
  const technicalEnglishMessage =
    /\b(missing|required|not found|not available|request failed|failed to|invalid|unknown error)\b/i;
  const visibleMessage = !message || technicalEnglishMessage.test(message) ? fallback : message;
  return error instanceof ApiError ? `${error.status}: ${visibleMessage}` : visibleMessage;
}

export function extractOwnerWarehouseIdFromMessage(message: string) {
  const match = message.match(/ownerWarehouse(?:Id)?\s+([0-9a-fA-F-]{36})/i);
  return match?.[1] ?? null;
}

export function extractSkuIdsFromMessages(messages: string[]) {
  const ids = new Set<string>();
  messages.forEach((message) => {
    const regex = /skuId\s+([0-9a-fA-F-]{36})/gi;
    let match = regex.exec(message);
    while (match) {
      ids.add(match[1]);
      match = regex.exec(message);
    }
  });
  return [...ids];
}
