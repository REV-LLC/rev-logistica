import type { CSSProperties, ReactNode } from 'react';
import type { TableRowAction } from '@/components/TableRowActions';

export type DataTableAlign = 'left' | 'center' | 'right';

export type DataTableMobileColumn = {
  label?: string;
  priority?: 'primary' | 'secondary' | 'detail' | 'hidden';
};

export type DataTableColumn<T> = {
  id: string;
  header: ReactNode;
  ariaLabel?: string;
  cell: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number | boolean | Date | null | undefined;
  align?: DataTableAlign;
  width?: CSSProperties['width'];
  minWidth?: CSSProperties['minWidth'];
  mobile?: DataTableMobileColumn | false;
};

export type DataTableEmptyState = {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
};

export type DataTableSort = {
  columnId: string;
  direction: 'asc' | 'desc';
};

export type DataTablePagination = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
};

export type DataTableRowActions<T> = (row: T) => TableRowAction[];
