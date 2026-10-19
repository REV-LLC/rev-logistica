export type EmployeeRole =
  | 'DRIVER'
  | 'HEAVY_MACHINERY_OPERATOR'
  | 'MACHINIST'
  | 'OFFICE'
  | 'MANAGER'
  | 'OPERATIONS_MANAGER'
  | 'MECHANIC'
  | 'WAREHOUSE_KEEPER'
  | 'OTHER';

export const employeeRoleLabels: Record<EmployeeRole, string> = {
  DRIVER: 'Conductor',
  HEAVY_MACHINERY_OPERATOR: 'Operario maquinaria amarilla',
  MACHINIST: 'Machinero',
  OFFICE: 'Oficina',
  MANAGER: 'Gerente',
  OPERATIONS_MANAGER: 'Jefe operaciones',
  MECHANIC: 'Mecánico',
  WAREHOUSE_KEEPER: 'Bodeguero',
  OTHER: 'Otro',
};
