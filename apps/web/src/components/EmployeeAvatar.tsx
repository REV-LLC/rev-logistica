'use client';

import { useEffect, useState } from 'react';
import { Avatar } from '@mantine/core';
import { apiBlob, ApiError } from '@/lib/api';

type EmployeeAvatarRecord = {
  id: string;
  name: string;
  lastName?: string | null;
};

type EmployeePhotoCacheEntry =
  | { status: 'loading'; promise: Promise<string | null> }
  | { status: 'ready'; url: string | null };

const employeePhotoCache = new Map<string, EmployeePhotoCacheEntry>();
const employeePhotoEpoch = new Map<string, number>();
const employeePhotoListeners = new Map<string, Set<(epoch: number) => void>>();
const employeePhotoEpochStoragePrefix = 'rev:employee-photo-epoch:';

function getEmployeePhotoEpoch(employeeId: string) {
  const inMemoryEpoch = employeePhotoEpoch.get(employeeId);
  if (inMemoryEpoch !== undefined) return inMemoryEpoch;

  let storedEpoch = 0;
  if (typeof window !== 'undefined') {
    try {
      const storedValue = window.localStorage.getItem(
        `${employeePhotoEpochStoragePrefix}${employeeId}`,
      );
      const parsedValue = Number(storedValue);
      storedEpoch =
        Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : 0;
    } catch {
      storedEpoch = 0;
    }
  }
  employeePhotoEpoch.set(employeeId, storedEpoch);
  return storedEpoch;
}

function employeePhotoCacheKey(
  employeeId: string,
  version: number,
  epoch: number,
) {
  return `${employeeId}:${version}:${epoch}`;
}

function getCachedEmployeePhotoUrl(cacheKey: string) {
  const cached = employeePhotoCache.get(cacheKey);
  return cached?.status === 'ready' ? cached.url : null;
}

function loadEmployeePhoto(employeeId: string, version: number, epoch: number) {
  const cacheKey = employeePhotoCacheKey(employeeId, version, epoch);
  const cached = employeePhotoCache.get(cacheKey);
  if (cached?.status === 'ready') {
    return Promise.resolve(cached.url);
  }
  if (cached?.status === 'loading') {
    return cached.promise;
  }

  const promise = apiBlob(
    `/employees/${employeeId}/photo?v=${version}-${epoch}`,
    {
      redirectOnAuthError: false,
    },
  )
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      if (getEmployeePhotoEpoch(employeeId) !== epoch) {
        URL.revokeObjectURL(url);
        return null;
      }
      employeePhotoCache.set(cacheKey, { status: 'ready', url });
      return url;
    })
    .catch((error) => {
      if (error instanceof ApiError && error.status === 404) {
        employeePhotoCache.set(cacheKey, { status: 'ready', url: null });
      } else {
        employeePhotoCache.delete(cacheKey);
      }
      return null;
    });

  employeePhotoCache.set(cacheKey, { status: 'loading', promise });
  return promise;
}

export function invalidateEmployeePhoto(employeeId: string) {
  const cachePrefix = `${employeeId}:`;
  employeePhotoCache.forEach((entry, key) => {
    if (!key.startsWith(cachePrefix)) return;
    if (entry.status === 'ready' && entry.url) {
      URL.revokeObjectURL(entry.url);
    }
    employeePhotoCache.delete(key);
  });

  const nextEpoch = Date.now();
  employeePhotoEpoch.set(employeeId, nextEpoch);
  try {
    window.localStorage.setItem(
      `${employeePhotoEpochStoragePrefix}${employeeId}`,
      String(nextEpoch),
    );
  } catch {
    // The in-memory version still refreshes every mounted avatar.
  }
  employeePhotoListeners
    .get(employeeId)
    ?.forEach((listener) => listener(nextEpoch));
}

function getEmployeeFullName(
  employee: Pick<EmployeeAvatarRecord, 'name' | 'lastName'>,
) {
  return `${employee.name} ${employee.lastName ?? ''}`.trim();
}

function getEmployeeInitials(
  employee: Pick<EmployeeAvatarRecord, 'name' | 'lastName'>,
) {
  const parts = getEmployeeFullName(employee).split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}` || 'E';
}

export function useEmployeePhotoUrl(employeeId: string, version = 0) {
  const [epoch, setEpoch] = useState(() => getEmployeePhotoEpoch(employeeId));
  const cacheKey = employeePhotoCacheKey(employeeId, version, epoch);
  const [photoUrl, setPhotoUrl] = useState<string | null>(() =>
    getCachedEmployeePhotoUrl(cacheKey),
  );

  useEffect(() => {
    setEpoch(getEmployeePhotoEpoch(employeeId));
    const listeners =
      employeePhotoListeners.get(employeeId) ??
      new Set<(epoch: number) => void>();
    listeners.add(setEpoch);
    employeePhotoListeners.set(employeeId, listeners);

    return () => {
      listeners.delete(setEpoch);
      if (listeners.size === 0) {
        employeePhotoListeners.delete(employeeId);
      }
    };
  }, [employeeId]);

  useEffect(() => {
    let cancelled = false;
    setPhotoUrl(getCachedEmployeePhotoUrl(cacheKey));

    loadEmployeePhoto(employeeId, version, epoch).then((url) => {
      if (cancelled) return;
      setPhotoUrl(url);
    });

    return () => {
      cancelled = true;
    };
  }, [cacheKey, employeeId, epoch, version]);

  return photoUrl;
}

export default function EmployeeAvatar({
  employee,
  size = 40,
  version = 0,
}: {
  employee: EmployeeAvatarRecord;
  size?: number;
  version?: number;
}) {
  const photoUrl = useEmployeePhotoUrl(employee.id, version);

  return (
    <Avatar
      src={photoUrl}
      radius="xl"
      size={size}
      color="blue"
      alt={getEmployeeFullName(employee)}
    >
      {getEmployeeInitials(employee)}
    </Avatar>
  );
}
