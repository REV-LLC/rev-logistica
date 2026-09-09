'use client';
import { api } from '@/lib/api';
import { useEffect, useState } from 'react';
import {
  readJsonCache,
  WAREHOUSES_CACHE_KEY,
  writeJsonCache,
} from './request-cache';
import {
  Customer,
  CustomerWorksite,
  Employee,
  SkuOption,
  Vehicle,
  Warehouse,
} from './request-types';

type Options = {
  customerId: string | null;
};

export function useRequestCatalogs({ customerId }: Options) {
  const [employees, setEmployees] = useState<Employee[]>([]);

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  const [customers, setCustomers] = useState<Customer[]>([]);

  const [worksites, setWorksites] = useState<CustomerWorksite[]>([]);

  const [worksitesLoading, setWorksitesLoading] = useState(false);

  const [skuOptions, setSkuOptions] = useState<SkuOption[]>([]);

  useEffect(() => {
    const cachedWarehouses = readJsonCache<{ items?: Warehouse[] }>(
      WAREHOUSES_CACHE_KEY,
    );
    if (cachedWarehouses?.items?.length) {
      setWarehouses(cachedWarehouses.items);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const [emps, vehs, whs] = await Promise.all([
          api<Employee[]>('/employees', { method: 'GET' }),
          api<Vehicle[]>('/vehicles', { method: 'GET' }),
          api<Warehouse[]>('/warehouses', { method: 'GET' }),
        ]);
        if (!mounted) return;
        setEmployees(emps);
        setVehicles(vehs);
        setWarehouses(whs);
        writeJsonCache(WAREHOUSES_CACHE_KEY, {
          items: whs,
          updatedAt: new Date().toISOString(),
        });
      } catch (err) {
        if (!mounted) return;
        const cachedWarehouses = readJsonCache<{ items?: Warehouse[] }>(
          WAREHOUSES_CACHE_KEY,
        );
        if (cachedWarehouses?.items?.length) {
          setWarehouses(cachedWarehouses.items);
        }
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadCustomers = async () => {
      try {
        const data = await api<Customer[]>('/customers', { method: 'GET' });
        if (!mounted) return;
        setCustomers(data);
      } catch {
        if (!mounted) return;
      }
    };
    loadCustomers();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadWorksites = async () => {
      if (!customerId) {
        setWorksites([]);
        return;
      }
      setWorksitesLoading(true);
      try {
        const data = await api<CustomerWorksite[]>(
          `/customers/${customerId}/worksites`,
          { method: 'GET' },
        );
        if (!mounted) return;
        setWorksites(data);
      } catch {
        if (!mounted) return;
      } finally {
        if (mounted) setWorksitesLoading(false);
      }
    };
    loadWorksites();
    return () => {
      mounted = false;
    };
  }, [customerId]);

  useEffect(() => {
    let mounted = true;
    const loadSkuOptions = async () => {
      try {
        const data = await api<
          Array<{
            id: string;
            name: string;
            assetFamilyId: string;
            controlType: 'BULK' | 'SERIAL';
            category?: string | null;
          }>
        >('/skus', { method: 'GET' });
        if (!mounted) return;
        setSkuOptions(
          data.map((item) => ({
            id: item.id,
            name: item.name,
            assetFamilyId: item.assetFamilyId,
            controlType: item.controlType,
            category: item.category ?? null,
          })),
        );
      } catch {
        if (!mounted) return;
      }
    };
    loadSkuOptions();
    return () => {
      mounted = false;
    };
  }, []);
  return {
    employees,
    vehicles,
    warehouses,
    customers,
    worksites,
    setWorksites,
    worksitesLoading,
    skuOptions,
  };
}
