import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type BackupTable =
  | 'users'
  | 'owners'
  | 'customers'
  | 'worksites'
  | 'customerWorksites'
  | 'warehouses'
  | 'assetFamilies'
  | 'skus'
  | 'assets'
  | 'tasks'
  | 'taskAssets'
  | 'documents'
  | 'documentItems'
  | 'stockLedger'
  | 'assetInternalCounters'
  | 'employees'
  | 'vehicles'
  | 'employeeVehicles'
  | 'fileObjects';

type TableConfig = {
  key: BackupTable;
  label: string;
  delegate: string;
  orderBy?: Record<string, 'asc' | 'desc'> | Array<Record<string, 'asc' | 'desc'>>;
  csvExclude?: string[];
  compoundWhere?: (row: Record<string, unknown>) => Record<string, unknown>;
};

const TABLES: TableConfig[] = [
  { key: 'users', label: 'Usuarios', delegate: 'user', orderBy: { createdAt: 'asc' }, csvExclude: ['passwordHash'] },
  { key: 'owners', label: 'Propietarios', delegate: 'owner', orderBy: { createdAt: 'asc' } },
  { key: 'customers', label: 'Clientes', delegate: 'customer', orderBy: { createdAt: 'asc' } },
  { key: 'worksites', label: 'Obras', delegate: 'worksite', orderBy: { createdAt: 'asc' } },
  { key: 'customerWorksites', label: 'Clientes por obra', delegate: 'customerWorksite', orderBy: { createdAt: 'asc' } },
  { key: 'warehouses', label: 'Bodegas', delegate: 'warehouse', orderBy: { createdAt: 'asc' } },
  { key: 'assetFamilies', label: 'Familias de activos', delegate: 'assetFamily', orderBy: { createdAt: 'asc' } },
  { key: 'skus', label: 'Referencias', delegate: 'sku', orderBy: { createdAt: 'asc' } },
  { key: 'assets', label: 'Equipos serializados', delegate: 'asset', orderBy: { createdAt: 'asc' } },
  { key: 'tasks', label: 'Pendientes', delegate: 'task', orderBy: { createdAt: 'asc' } },
  { key: 'taskAssets', label: 'Activos en pendientes', delegate: 'taskAsset', orderBy: { createdAt: 'asc' } },
  { key: 'documents', label: 'Documentos', delegate: 'document', orderBy: { createdAt: 'asc' } },
  { key: 'documentItems', label: 'Items de documentos', delegate: 'documentItem', orderBy: { createdAt: 'asc' } },
  { key: 'stockLedger', label: 'Movimientos de inventario', delegate: 'stockLedger', orderBy: { createdAt: 'asc' } },
  { key: 'assetInternalCounters', label: 'Consecutivos internos', delegate: 'assetInternalCounter', orderBy: { createdAt: 'asc' } },
  { key: 'employees', label: 'Empleados', delegate: 'employee', orderBy: { createdAt: 'asc' } },
  { key: 'vehicles', label: 'Vehiculos', delegate: 'vehicle', orderBy: { createdAt: 'asc' } },
  {
    key: 'employeeVehicles',
    label: 'Vehiculos asignados',
    delegate: 'employeeVehicle',
    orderBy: [{ employeeId: 'asc' }, { vehicleId: 'asc' }],
    compoundWhere: (row) => ({
      employeeId_vehicleId: {
        employeeId: row.employeeId,
        vehicleId: row.vehicleId,
      },
    }),
  },
  { key: 'fileObjects', label: 'Archivos', delegate: 'fileObject', orderBy: { createdAt: 'asc' } },
];

const TABLE_BY_KEY = new Map(TABLES.map((table) => [table.key, table]));

@Injectable()
export class BackupsService {
  constructor(private readonly prisma: PrismaService) {}

  listTables() {
    return TABLES.map(({ key, label }) => ({ key, label }));
  }

  async createJsonBackup() {
    const data: Partial<Record<BackupTable, unknown[]>> = {};
    for (const table of TABLES) {
      data[table.key] = await this.delegate(table).findMany({
        orderBy: table.orderBy,
      });
    }

    const createdAt = new Date().toISOString();
    return {
      metadata: {
        app: 'rev-logistica',
        format: 'json-backup',
        version: 1,
        createdAt,
        fileName: `rev-logistica-backup-${createdAt.slice(0, 10)}.json`,
      },
      data,
    };
  }

  async createCsvExport(tableKey: string) {
    const table = this.resolveTable(tableKey);
    const rows = await this.delegate(table).findMany({ orderBy: table.orderBy });
    return toCsv(rows, table.csvExclude ?? []);
  }

  async importJsonBackup(payload: unknown) {
    const backup = this.validateBackup(payload);
    const result: Record<string, { received: number; upserted: number }> = {};

    await this.prisma.$transaction(async (tx) => {
      for (const table of TABLES) {
        const rows = backup.data[table.key] ?? [];
        let upserted = 0;
        for (const rawRow of rows) {
          if (!rawRow || typeof rawRow !== 'object') continue;
          const row = rawRow as Record<string, unknown>;
          const where = table.compoundWhere ? table.compoundWhere(row) : { id: row.id };
          if (!table.compoundWhere && !row.id) {
            throw new BadRequestException(`Fila sin id en ${table.key}`);
          }
          await this.delegate(table, tx).upsert({
            where,
            create: row,
            update: row,
          });
          upserted += 1;
        }
        result[table.key] = { received: rows.length, upserted };
      }
    });

    return {
      ok: true,
      mode: 'upsert',
      tables: result,
    };
  }

  private resolveTable(tableKey: string) {
    const table = TABLE_BY_KEY.get(tableKey as BackupTable);
    if (!table) throw new BadRequestException('Tabla no soportada');
    return table;
  }

  private delegate(table: TableConfig, client: Record<string, any> = this.prisma) {
    return client[table.delegate];
  }

  private validateBackup(payload: unknown): { data: Partial<Record<BackupTable, unknown[]>> } {
    if (!payload || typeof payload !== 'object') {
      throw new BadRequestException('Backup invalido');
    }
    const candidate = payload as { metadata?: { format?: unknown }; data?: unknown };
    if (!candidate.data || typeof candidate.data !== 'object') {
      throw new BadRequestException('Backup sin data');
    }
    if (candidate.metadata?.format && candidate.metadata.format !== 'json-backup') {
      throw new BadRequestException('Formato de backup no soportado');
    }

    const data = candidate.data as Record<string, unknown>;
    for (const key of Object.keys(data)) {
      if (!TABLE_BY_KEY.has(key as BackupTable)) continue;
      if (!Array.isArray(data[key])) {
        throw new BadRequestException(`La tabla ${key} debe ser una lista`);
      }
    }
    return { data: data as Partial<Record<BackupTable, unknown[]>> };
  }
}

function toCsv(rows: Array<Record<string, unknown>>, exclude: string[]) {
  if (rows.length === 0) return '';
  const excludeSet = new Set(exclude);
  const columns = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((key) => {
        if (!excludeSet.has(key)) set.add(key);
      });
      return set;
    }, new Set<string>()),
  );

  const lines = [
    columns.map(csvEscape).join(','),
    ...rows.map((row) =>
      columns
        .map((column) => csvEscape(formatCsvValue(row[column])))
        .join(','),
    ),
  ];
  return `${lines.join('\n')}\n`;
}

function formatCsvValue(value: unknown) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    const jsonValue = value as { toJSON?: () => unknown };
    if (typeof jsonValue.toJSON === 'function') return String(jsonValue.toJSON());
    return JSON.stringify(value);
  }
  return String(value);
}

function csvEscape(value: unknown) {
  const text = String(value ?? '');
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}
