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
import { useMotorOptions } from "./use-motor-options";
import classes from "./EquipmentCompatibilitySelect.module.css";

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

export default function EquipmentCompatibilitySelect({
  value,
  onChange,
  seeds,
  disabled,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  seeds: EquipmentIdentity[];
  disabled: boolean;
}) {
  const options = useMotorOptions(true);
  const [chosen, setChosen] = useState<EquipmentIdentity[]>(seeds);
  const all = new Map(
    [...seeds, ...chosen, ...options.items].map((item) => [item.id, item]),
  );
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });
  const change = (ids: string[]) => {
    if (disabled) return;
    setChosen(ids.flatMap((id) => (all.get(id) ? [all.get(id)!] : [])));
    onChange(ids);
  };
  const remove = (id: string) => change(value.filter((item) => item !== id));
  const query = options.search.trim().toLocaleLowerCase("es-CO");
  const filtered = [...all.values()].filter(
    (item) =>
      !query ||
      `${equipmentLabel(item)} ${item.publicCode}`
        .toLocaleLowerCase("es-CO")
        .includes(query),
  );

  return (
    <Stack gap="xs">
      <Combobox
        store={combobox}
        onOptionSubmit={(id) => {
          change(
            value.includes(id)
              ? value.filter((item) => item !== id)
              : [...value, id],
          );
          options.onSearch("");
          combobox.updateSelectedOptionIndex("active");
        }}
      >
        <Combobox.DropdownTarget>
          <PillsInput
            label="Equipos compatibles"
            description="Selecciona una o varias unidades que admitan cambio de motor."
            withAsterisk
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
                  placeholder="Buscar equipo…"
                  disabled={disabled}
                  value={options.search}
                  onChange={(event) => {
                    options.onSearch(event.currentTarget.value);
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
                      !options.search &&
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
            <Combobox.Options aria-multiselectable="true">
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
                    {options.loading
                      ? "Buscando equipos…"
                      : "No hay equipos con esa búsqueda"}
                  </Combobox.Empty>
                )}
              </ScrollArea.Autosize>
              {options.hasMore ? (
                <Combobox.Footer>
                  <Button
                    variant="subtle"
                    size="xs"
                    fullWidth
                    disabled={disabled}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={options.next}
                    loading={options.loading}
                  >
                    Cargar más equipos
                  </Button>
                </Combobox.Footer>
              ) : null}
            </Combobox.Options>
          ) : null}
        </Combobox.Dropdown>
      </Combobox>
      {options.error ? <Alert color="red">{options.error}</Alert> : null}
    </Stack>
  );
}
