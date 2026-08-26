'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import type { RequestDocument } from '@/components/transport/RequestsListPanel';

export function useRequestsList(enabled = true) {
  const [requests, setRequests] = useState<RequestDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<RequestDocument[]>('/documents?status=DRAFT&take=200', {
        method: 'GET',
      });
      if (!mountedRef.current) return;
      setRequests(data.filter((doc) => doc.type === 'REMISSION' || doc.type === 'RETURN'));
    } catch (err) {
      if (!mountedRef.current) return;
      if (err instanceof ApiError) {
        setError(`${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Error cargando solicitudes');
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (enabled) void reload();
    return () => {
      mountedRef.current = false;
    };
  }, [enabled, reload]);

  return { requests, loading, error, setError, reload };
}
