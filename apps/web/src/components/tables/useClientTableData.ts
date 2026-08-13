'use client';

import { useMemo, useState } from 'react';
import type { DataTableColumn, DataTableSort } from './table.types';

type ClientTableOptions<T> = {
  rows: T[];
  columns: DataTableColumn<T>[];
  search?: string;
  searchValue?: (row: T) => string;
  filter?: (row: T) => boolean;
  initialPageSize?: number;
};

function compareValues(
  left: string | number | boolean | Date | null | undefined,
  right: string | number | boolean | Date | null | undefined,
) {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;

  const normalizedLeft = left instanceof Date ? left.getTime() : left;
  const normalizedRight = right instanceof Date ? right.getTime() : right;

  if (typeof normalizedLeft === 'string' && typeof normalizedRight === 'string') {
    return normalizedLeft.localeCompare(normalizedRight, 'es', { numeric: true, sensitivity: 'base' });
  }
  if (normalizedLeft < normalizedRight) return -1;
  if (normalizedLeft > normalizedRight) return 1;
  return 0;
}

export function useClientTableData<T>({
  rows,
  columns,
  search = '',
  searchValue,
  filter,
  initialPageSize = 20,
}: ClientTableOptions<T>) {
  const [sort, setSort] = useState<DataTableSort | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('es');
    return rows.filter((row) => {
      if (filter && !filter(row)) return false;
      if (!term || !searchValue) return true;
      return searchValue(row).toLocaleLowerCase('es').includes(term);
    });
  }, [filter, rows, search, searchValue]);

  const sortedRows = useMemo(() => {
    if (!sort) return filteredRows;
    const column = columns.find((candidate) => candidate.id === sort.columnId);
    if (!column?.sortValue) return filteredRows;

    return [...filteredRows].sort((left, right) => {
      const result = compareValues(column.sortValue!(left), column.sortValue!(right));
      return sort.direction === 'asc' ? result : -result;
    });
  }, [columns, filteredRows, sort]);

  const pageCount = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visibleRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return sortedRows.slice(start, start + pageSize);
  }, [pageSize, safePage, sortedRows]);

  const changeSort = (nextSort: DataTableSort | null) => {
    setPage(1);
    setSort(nextSort);
  };

  const changePageSize = (nextPageSize: number) => {
    setPage(1);
    setPageSize(nextPageSize);
  };

  return {
    rows: visibleRows,
    filteredTotal: sortedRows.length,
    sort,
    onSortChange: changeSort,
    pagination: {
      page: safePage,
      pageSize,
      total: sortedRows.length,
      onPageChange: setPage,
    },
    onPageSizeChange: changePageSize,
  };
}
