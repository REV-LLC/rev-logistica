'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { SkuOption } from '@/components/transport/request-document-types';

export type Employee = {
  id: string;
  name: string;
  lastName?: string | null;
  user?: {
    id: string;
    email: string;
    role: string;
    active: boolean;
  } | null;
};

export type Customer = { id: string; name: string; phone?: string | null };

export type CustomerWorksite = {
  id: string;
  alias: string | null;
  worksite: {
    id: string;
    name: string;
    address: string | null;
    phone?: string | null;
  };
};

export type Vehicle = { id: string; plate?: string | null; name?: string | null };
export type Warehouse = { id: string; name: string; type?: 'OWN' | 'ALLY' | string };

const WAREHOUSES_CACHE_KEY = 'requests.warehouses.v1';

function readCachedWarehouses() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(WAREHOUSES_CACHE_KEY);
    if (!raw) return [];
    const cached = JSON.parse(raw) as { items?: unknown };
    return Array.isArray(cached.items) ? cached.items as Warehouse[] : [];
  } catch {
    return [];
  }
}

function writeCachedWarehouses(items: Warehouse[]) {
  try {
    window.localStorage.setItem(WAREHOUSES_CACHE_KEY, JSON.stringify({
      items,
      updatedAt: new Date().toISOString(),
    }));
  } catch {
    // The live response remains usable when browser storage is unavailable.
  }
}

function asList<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

export function useRequestCatalogs(customerId: string | null) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [skuOptions, setSkuOptions] = useState<SkuOption[]>([]);
  const [worksites, setWorksites] = useState<CustomerWorksite[]>([]);
  const [worksitesLoading, setWorksitesLoading] = useState(false);

  useEffect(() => {
    const cachedWarehouses = readCachedWarehouses();
    if (cachedWarehouses.length) setWarehouses(cachedWarehouses);
  }, []);

  useEffect(() => {
    let active = true;

    void Promise.all([
      api<unknown>('/employees', { method: 'GET' }),
      api<unknown>('/vehicles', { method: 'GET' }),
      api<unknown>('/warehouses', { method: 'GET' }),
    ])
      .then(([employeeData, vehicleData, warehouseData]) => {
        if (!active) return;
        const nextWarehouses = asList<Warehouse>(warehouseData);
        setEmployees(asList<Employee>(employeeData));
        setVehicles(asList<Vehicle>(vehicleData));
        setWarehouses(nextWarehouses);
        writeCachedWarehouses(nextWarehouses);
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    void Promise.allSettled([
      api<unknown>('/customers', { method: 'GET' }),
      api<unknown>('/skus', { method: 'GET' }),
    ])
      .then(([customerResult, skuResult]) => {
        if (!active) return;
        if (customerResult.status === 'fulfilled') {
          setCustomers(asList<Customer>(customerResult.value));
        }
        if (skuResult.status === 'fulfilled') {
          setSkuOptions(asList<SkuOption>(skuResult.value));
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!customerId) {
      setWorksites([]);
      setWorksitesLoading(false);
      return () => {
        active = false;
      };
    }

    setWorksitesLoading(true);
    void api<unknown>(`/customers/${customerId}/worksites`, { method: 'GET' })
      .then((data) => {
        if (active) setWorksites(asList<CustomerWorksite>(data));
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setWorksitesLoading(false);
      });

    return () => {
      active = false;
    };
  }, [customerId]);

  const clearWorksites = useCallback(() => setWorksites([]), []);

  return {
    employees,
    vehicles,
    warehouses,
    customers,
    skuOptions,
    worksites,
    worksitesLoading,
    clearWorksites,
  };
}
