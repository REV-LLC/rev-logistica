import type { EmployeeRole } from './employee-roles';

export type EmployeeProfileVehicle = { id: string; plate: string; brand: string | null; model: string | null };
export type EmployeeProfileIdentity = {
  id: string;
  name: string;
  lastName: string | null;
  role: EmployeeRole;
  active: boolean;
  documentId: string | null;
  phone: string | null;
  vehicles: EmployeeProfileVehicle[];
};

export function employeeProfileHref(employeeId: string) {
  return `/employees/${encodeURIComponent(employeeId)}`;
}

export function employeeProfileName(employee: Pick<EmployeeProfileIdentity, 'name' | 'lastName'>) {
  return `${employee.name} ${employee.lastName ?? ''}`.trim();
}

export function employeeProfileVehicleLabel(vehicle: EmployeeProfileVehicle) {
  const description = [vehicle.brand?.trim(), vehicle.model?.trim()].filter(Boolean).join(' ');
  return `${description || 'Camión'} · ${vehicle.plate}`;
}

export function employeeProfileBackground(role?: EmployeeRole) {
  if (!role) return null;
  return role === 'DRIVER' ? '/employees/transport-v1.webp' : '/login/excavator.webp';
}
