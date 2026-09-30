"use client";
import { useState } from "react";
import {
  Alert,
  Button,
  Combobox,
  Pill,
  PillsInput,
  ScrollArea,
  Stack,
  useCombobox,
} from "@mantine/core";
import { IconCheck } from "@tabler/icons-react";
import EquipmentThumbnail from "./EquipmentThumbnail";
import { equipmentLabel, equipmentName, type EquipmentIdentity } from "./types";
import classes from "./EquipmentSelect.module.css";

function Identity({ equipment }: { equipment: EquipmentIdentity }) {
  return (
    <>
      <EquipmentThumbnail equipment={equipment} />
      <span className={classes.identity}>
        <span className={classes.name}>{equipmentName(equipment)}</span>
        {equipment.warehouseOwner?.name ? (
          <span className={classes.owner}>{equipment.warehouseOwner.name}</span>
        ) : null}
      </span>
    </>
  );
}

type EquipmentSelectProps = {
  items: EquipmentIdentity[];
  seeds?: EquipmentIdentity[];
  label?: string;
  description?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  search?: string;
  onSearch?: (search: string) => void;
  loading?: boolean;
  error?: string | null;
  hasMore?: boolean;
  onLoadMore?: () => void;
} & (
  | { multiple: true; value: string[]; onChange: (ids: string[]) => void }
  | {
      multiple?: false;
      value: string | null;
      onChange: (id: string | null) => void;
    }
);

export default function EquipmentSelect(props: EquipmentSelectProps) {
  const {
    items,
    seeds = [],
    disabled = false,
    label = "Equipo",
    description,
    placeholder = "Buscar equipo…",
    required = false,
    loading = false,
    error,
    hasMore = false,
    onLoadMore,
  } = props;
  const [localSearch, setLocalSearch] = useState("");
  const search = props.search ?? localSearch;
  const onSearch = (query: string) => {
    setLocalSearch(query);
    props.onSearch?.(query);
  };
  const value = props.multiple ? props.value : props.value ? [props.value] : [];
  const [chosen, setChosen] = useState<EquipmentIdentity[]>(seeds);
  const all = new Map(
    [...seeds, ...chosen, ...items].map((item) => [item.id, item]),
  );
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });
  const change = (ids: string[]) => {
    if (disabled) return;
    setChosen(ids.flatMap((id) => (all.get(id) ? [all.get(id)!] : [])));
    if (props.multiple) props.onChange(ids);
    else props.onChange(ids[0] ?? null);
  };
  const remove = (id: string) => change(value.filter((item) => item !== id));
  const query = search.trim().toLocaleLowerCase("es-CO");
  const filtered = [...all.values()].filter(
    (item) =>
      !query ||
      `${equipmentLabel(item)} ${item.publicCode} ${item.serialOrEngine ?? ""} ${item.brand ?? ""} ${item.model ?? ""}`
        .toLocaleLowerCase("es-CO")
        .includes(query),
  );

  return (
    <Stack gap="xs">
      <Combobox
        store={combobox}
        onOptionSubmit={(id) => {
          change(
            props.multiple
              ? value.includes(id)
                ? value.filter((item) => item !== id)
                : [...value, id]
              : [id],
          );
          if (!props.multiple) combobox.closeDropdown();
          onSearch("");
          combobox.updateSelectedOptionIndex("active");
        }}
      >
        <Combobox.DropdownTarget>
          <PillsInput
            label={label}
            description={description}
            withAsterisk={required}
            disabled={disabled}
            classNames={{ input: classes.input }}
            onClick={() => {
              if (!disabled) combobox.openDropdown();
            }}
          >
            <Pill.Group>
              {value.map((id) => {
                const equipment = all.get(id);
                const label = equipment
                  ? equipmentLabel(equipment)
                  : "Equipo seleccionado";
                return (
                  <Pill
                    key={id}
                    title={label}
                    withRemoveButton
                    disabled={disabled}
                    classNames={{
                      root: classes.pill,
                      label: classes.pillLabel,
                    }}
                    removeButtonProps={{
                      "aria-label": `Quitar ${label}`,
                      "aria-hidden": false,
                      tabIndex: 0,
                      disabled,
                    }}
                    onRemove={() => remove(id)}
                  >
                    {equipment ? <Identity equipment={equipment} /> : label}
                  </Pill>
                );
              })}
              <Combobox.EventsTarget>
                <PillsInput.Field
                  className={classes.field}
                  inputMode="search"
                  name="equipment-search"
                  aria-label={label}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  data-1p-ignore
                  data-lpignore="true"
                  placeholder={
                    value.length && !props.multiple
                      ? "Cambiar equipo…"
                      : placeholder
                  }
                  disabled={disabled}
                  value={search}
                  onChange={(event) => {
                    onSearch(event.currentTarget.value);
                    combobox.openDropdown();
                    combobox.resetSelectedOption();
                  }}
                  onFocus={() => {
                    if (!disabled) combobox.openDropdown();
                  }}
                  onBlur={() => combobox.closeDropdown()}
                  onKeyDown={(event) => {
                    if (
                      !disabled &&
                      event.key === "Backspace" &&
                      !search &&
                      value.length
                    ) {
                      event.preventDefault();
                      remove(value[value.length - 1]);
                    }
                  }}
                />
              </Combobox.EventsTarget>
            </Pill.Group>
          </PillsInput>
        </Combobox.DropdownTarget>
        <Combobox.Dropdown>
          {combobox.dropdownOpened ? (
            <Combobox.Options
              aria-multiselectable={props.multiple || undefined}
            >
              <ScrollArea.Autosize mah={224} type="auto">
                {filtered.length ? (
                  filtered.map((item) => (
                    <Combobox.Option
                      key={item.id}
                      value={item.id}
                      active={value.includes(item.id)}
                      aria-selected={value.includes(item.id)}
                      aria-label={equipmentLabel(item)}
                      className={classes.option}
                    >
                      <Identity equipment={item} />
                      {value.includes(item.id) ? (
                        <IconCheck
                          size={18}
                          className={classes.check}
                          aria-hidden="true"
                        />
                      ) : null}
                    </Combobox.Option>
                  ))
                ) : (
                  <Combobox.Empty>
                    {loading
                      ? "Buscando equipos…"
                      : "No hay equipos con esa búsqueda"}
                  </Combobox.Empty>
                )}
              </ScrollArea.Autosize>
              {hasMore ? (
                <Combobox.Footer>
                  <Button
                    variant="subtle"
                    size="xs"
                    fullWidth
                    disabled={disabled}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={onLoadMore}
                    loading={loading}
                  >
                    Cargar más equipos
                  </Button>
                </Combobox.Footer>
              ) : null}
            </Combobox.Options>
          ) : null}
        </Combobox.Dropdown>
      </Combobox>
      {error ? <Alert color="red">{error}</Alert> : null}
    </Stack>
  );
}
