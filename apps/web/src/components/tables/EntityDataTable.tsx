'use client';

import { Fragment, type ReactNode } from 'react';
import {
  Group,
  Pagination,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  ThemeIcon,
  UnstyledButton,
} from '@mantine/core';
import { IconArrowsSort, IconChevronDown, IconChevronUp, IconInbox } from '@tabler/icons-react';
import TableRowActions from '@/components/TableRowActions';
import type {
  DataTableColumn,
  DataTableEmptyState,
  DataTablePagination,
  DataTableRowActions,
  DataTableSort,
} from './table.types';

type EntityDataTableProps<T> = {
  rows: T[];
  columns: DataTableColumn<T>[];
  getRowId: (row: T) => string;
  loading?: boolean;
  emptyState: DataTableEmptyState;
  actions?: DataTableRowActions<T>;
  sort?: DataTableSort | null;
  onSortChange?: (sort: DataTableSort | null) => void;
  pagination?: DataTablePagination;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  tableMinWidth?: number;
  isRowExpanded?: (row: T) => boolean;
  renderExpandedRow?: (row: T) => ReactNode;
};

const fallbackEmptyIcon = <IconInbox size={20} />;

function getMobilePriority<T>(column: DataTableColumn<T>) {
  return column.mobile === false ? 'hidden' : column.mobile?.priority;
}

export default function EntityDataTable<T>({
  rows,
  columns,
  getRowId,
  loading = false,
  emptyState,
  actions,
  sort,
  onSortChange,
  pagination,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50],
  tableMinWidth = 760,
  isRowExpanded,
  renderExpandedRow,
}: EntityDataTableProps<T>) {
  const visibleMobileColumns = columns.filter((column) => getMobilePriority(column) !== 'hidden');
  const primaryMobileColumns = visibleMobileColumns.filter(
    (column) => getMobilePriority(column) === 'primary',
  );
  const detailMobileColumns = visibleMobileColumns.filter(
    (column) => getMobilePriority(column) !== 'primary',
  );
  const columnCount = columns.length + (actions ? 1 : 0);
  const pageCount = pagination ? Math.max(1, Math.ceil(pagination.total / pagination.pageSize)) : 1;

  const toggleSort = (column: DataTableColumn<T>) => {
    if (!column.sortValue || !onSortChange) return;
    if (sort?.columnId !== column.id) {
      onSortChange({ columnId: column.id, direction: 'asc' });
      return;
    }
    if (sort.direction === 'asc') {
      onSortChange({ columnId: column.id, direction: 'desc' });
      return;
    }
    onSortChange(null);
  };

  const sortIcon = (column: DataTableColumn<T>) => {
    if (sort?.columnId !== column.id) return <IconArrowsSort size={14} />;
    return sort.direction === 'asc' ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />;
  };

  const emptyContent = (
    <Stack align="center" gap="xs" py="lg">
      <ThemeIcon color="gray" variant="light" size={40} radius="xl">
        {emptyState.icon ?? fallbackEmptyIcon}
      </ThemeIcon>
      <Text fw={700}>{emptyState.title}</Text>
      {emptyState.description ? <Text size="sm" c="dimmed" ta="center">{emptyState.description}</Text> : null}
      {emptyState.action ?? null}
    </Stack>
  );

  const footer = pagination && pagination.total > 0 ? (
    <Group justify="space-between" align="center" gap="sm" wrap="wrap" mt="md">
      <Text size="sm" c="dimmed">
        {pagination.total} registro{pagination.total === 1 ? '' : 's'}
      </Text>
      <Group gap="sm">
        {onPageSizeChange ? (
          <Select
            aria-label="Filas por página"
            value={String(pagination.pageSize)}
            onChange={(value: string | null) => value && onPageSizeChange(Number(value))}
            data={pageSizeOptions.map((size) => ({ value: String(size), label: `${size} por página` }))}
            allowDeselect={false}
            size="xs"
            w={130}
          />
        ) : null}
        <Pagination value={pagination.page} onChange={pagination.onPageChange} total={pageCount} size="sm" />
      </Group>
    </Group>
  ) : null;

  return (
    <>
      <Stack hiddenFrom="md" gap="sm">
        {!loading && rows.map((row) => (
          <Paper key={getRowId(row)} withBorder radius="lg" p="md">
            <Stack gap="md">
              {primaryMobileColumns.map((column) => (
                <Fragment key={column.id}>{column.cell(row)}</Fragment>
              ))}
              {detailMobileColumns.length ? (
                <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
                  {detailMobileColumns.map((column) => (
                    <div key={column.id} style={{ minWidth: 0 }}>
                      <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                        {column.mobile && column.mobile.label ? column.mobile.label : column.header}
                      </Text>
                      <div>{column.cell(row)}</div>
                    </div>
                  ))}
                </SimpleGrid>
              ) : null}
              {actions ? <TableRowActions actions={actions(row)} /> : null}
              {renderExpandedRow && isRowExpanded?.(row) ? renderExpandedRow(row) : null}
            </Stack>
          </Paper>
        ))}
        {!loading && rows.length === 0 ? <Paper radius="lg" p="md" bg="gray.0">{emptyContent}</Paper> : null}
        {loading ? <Paper radius="lg" p="md" bg="gray.0"><Text c="dimmed" ta="center">Cargando...</Text></Paper> : null}
      </Stack>

      <Table.ScrollContainer minWidth={tableMinWidth} visibleFrom="md">
        <Table highlightOnHover verticalSpacing="md" style={{ tableLayout: 'fixed', width: '100%' }}>
          <colgroup>
            {columns.map((column) => <col key={column.id} style={{ width: column.width, minWidth: column.minWidth }} />)}
            {actions ? <col style={{ width: 132 }} /> : null}
          </colgroup>
          <Table.Thead>
            <Table.Tr>
              {columns.map((column) => (
                <Table.Th key={column.id} ta={column.align}>
                  {column.sortValue && onSortChange ? (
                    <UnstyledButton
                      onClick={() => toggleSort(column)}
                      aria-label={`Ordenar por ${column.ariaLabel ?? column.id}`}
                    >
                      <Group gap={4} wrap="nowrap">
                        <Text component="span" fw={700} size="sm">{column.header}</Text>
                        <span aria-hidden>{sortIcon(column)}</span>
                      </Group>
                    </UnstyledButton>
                  ) : column.header}
                </Table.Th>
              ))}
              {actions ? <Table.Th ta="right">Acciones</Table.Th> : null}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {!loading && rows.map((row) => (
              <Fragment key={getRowId(row)}>
                <Table.Tr>
                  {columns.map((column) => <Table.Td key={column.id} ta={column.align}>{column.cell(row)}</Table.Td>)}
                  {actions ? <Table.Td><TableRowActions actions={actions(row)} /></Table.Td> : null}
                </Table.Tr>
                {renderExpandedRow && isRowExpanded?.(row) ? (
                  <Table.Tr>
                    <Table.Td colSpan={columnCount} bg="gray.0" p="md">
                      {renderExpandedRow(row)}
                    </Table.Td>
                  </Table.Tr>
                ) : null}
              </Fragment>
            ))}
            {!loading && rows.length === 0 ? <Table.Tr><Table.Td colSpan={columnCount}>{emptyContent}</Table.Td></Table.Tr> : null}
            {loading ? <Table.Tr><Table.Td colSpan={columnCount}><Text c="dimmed" ta="center">Cargando...</Text></Table.Td></Table.Tr> : null}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      {footer}
    </>
  );
}
