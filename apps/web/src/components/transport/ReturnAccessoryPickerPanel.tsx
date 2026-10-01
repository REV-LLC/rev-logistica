"use client";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { kindLabels } from "../accessories/types";
import {
  returnAccessoryAlreadySelected,
  returnAccessoryKey,
  type ReturnAccessoryOption,
} from "./return-accessory-selection";
import type { SelectedItem } from "./request-types";
import type { useReturnAccessoryOptions } from "./use-return-accessory-options";

export default function ReturnAccessoryPickerPanel({
  options,
  selectedItems,
  pending,
  onToggle,
}: {
  options: ReturnType<typeof useReturnAccessoryOptions>;
  selectedItems: SelectedItem[];
  pending: Map<string, ReturnAccessoryOption>;
  onToggle: (option: ReturnAccessoryOption) => void;
}) {
  return (
    <Stack gap="sm" p="sm">
      <Text size="sm" c="dimmed">
        Selecciona lo que regresa y ajusta las cantidades en el documento. No
        necesitas devolver también el equipo.
      </Text>
      <TextInput
        label="Buscar accesorios"
        placeholder="Nombre o código"
        value={options.search}
        onChange={(event) => options.onSearch(event.currentTarget.value)}
        maxLength={160}
        leftSection={<IconSearch size={16} />}
      />
      {options.loading ? (
        <Loader size="sm" aria-label="Cargando accesorios de la obra" />
      ) : options.error ? (
        <Alert color="red" role="alert">
          {options.error}
          <Button variant="subtle" onClick={options.retry}>
            Reintentar accesorios
          </Button>
        </Alert>
      ) : options.items.length ? (
        options.items.map((option) => {
          const added = returnAccessoryAlreadySelected(selectedItems, option);
          return (
            <Paper key={returnAccessoryKey(option)} withBorder radius="md" p="sm">
              <Checkbox
                checked={added || pending.has(returnAccessoryKey(option))}
                disabled={added || option.quantity < 1}
                onChange={() => onToggle(option)}
                label={
                  <Stack gap={4}>
                    <Text fw={600} size="sm">
                      {option.name}
                    </Text>
                    <Text size="xs" c="dimmed">
                      Equipo: {option.parentName}
                    </Text>
                    <Text size="xs" c="dimmed">
                      Dueño: {option.ownerName}
                    </Text>
                    <Text size="xs" c="dimmed">{option.sourceLabel}</Text>
                    <Group gap="xs">
                      <Badge variant="light">{kindLabels[option.kind]}</Badge>
                      <Text size="xs">
                        Pendientes: {option.quantity}
                        {added ? " · Ya agregado" : ""}
                      </Text>
                    </Group>
                  </Stack>
                }
              />
            </Paper>
          );
        })
      ) : (
        <Text size="sm" c="dimmed">
          {options.search
            ? "No hay accesorios que coincidan con la búsqueda."
            : "No hay accesorios pendientes de devolución en esta obra."}
        </Text>
      )}
      {options.page > 0 || options.hasMore ? (
        <Group justify="space-between">
          <Button
            size="xs"
            variant="default"
            disabled={options.loading || options.page === 0}
            onClick={() => options.onPage(options.page - 1)}
          >
            Anteriores
          </Button>
          <Text size="xs">Página {options.page + 1}</Text>
          <Button
            size="xs"
            variant="default"
            disabled={options.loading || !options.hasMore}
            onClick={() => options.onPage(options.page + 1)}
          >
            Más accesorios
          </Button>
        </Group>
      ) : null}
    </Stack>
  );
}
