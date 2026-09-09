'use client';
import { api, ApiError } from '@/lib/api';
import { useEffect, useState } from 'react';
import { RequestDocument } from './request-types';

export function useRequestsList() {
  const [requestsLoading, setRequestsLoading] = useState(false);

  const [requestsError, setRequestsError] = useState<string | null>(null);

  const [requests, setRequests] = useState<RequestDocument[]>([]);

  const [documentsRequest, setDocumentsRequest] =
    useState<RequestDocument | null>(null);

  const loadRequests = async () => {
    setRequestsLoading(true);
    setRequestsError(null);
    try {
      const data = await api<RequestDocument[]>(
        '/documents?status=DRAFT&take=200',
        {
          method: 'GET',
        },
      );
      setRequests(
        data.filter((doc) => doc.type === 'REMISSION' || doc.type === 'RETURN'),
      );
    } catch (err) {
      if (err instanceof ApiError) {
        setRequestsError(`${err.status}: ${err.message}`);
      } else if (err instanceof Error) {
        setRequestsError(err.message);
      } else {
        setRequestsError('Error cargando solicitudes');
      }
    } finally {
      setRequestsLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);
  return {
    requestsLoading,
    requestsError,
    setRequestsError,
    requests,
    documentsRequest,
    setDocumentsRequest,
    loadRequests,
  };
}
