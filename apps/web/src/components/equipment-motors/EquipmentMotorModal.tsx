"use client";
import { useEffect, useRef, useState } from "react";
import {
  Accordion,
  Alert,
  Button,
  Loader,
  Modal,
  SegmentedControl,
  Select,
  Stack,
  Text,
} from "@mantine/core";
import { api } from "@/lib/api";
import type { EquipmentConfiguration } from "../equipment-configuration/types";
import MotorHistory from "../equipment-configuration/MotorHistory";
import MotorDetailsFields from "./MotorDetailsFields";
import {
  equipmentLabel,
  motorForm,
  motorFormValid,
  type EquipmentIdentity,
  type MotorForm,
  type MotorRecord,
} from "./types";
import { useMotorOptions } from "./use-motor-options";
import classes from "./EquipmentMotorModal.module.css";

export default function EquipmentMotorModal({
  asset,
  isMotor,
  onClose,
  onSaved,
}: {
  asset: EquipmentIdentity;
  isMotor: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [mode, setMode] = useState<"existing" | "new" | "edit">(
    isMotor ? "edit" : "existing",
  );
  const [config, setConfig] = useState<EquipmentConfiguration>();
  const [selected, setSelected] = useState<MotorRecord | null>(null);
  const [form, setForm] = useState<MotorForm>({
    brand: "",
    model: "",
    powerHp: "",
    fuel: "GASOLINA",
    compatibleEquipmentIds: [asset.id],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const busy = useRef(false);
  const options = useMotorOptions(false, reload);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    (async () => {
      if (isMotor) {
        const motor = await api<MotorRecord>(`/equipment-motors/${asset.id}`, {
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          setSelected(motor);
          setForm(motorForm(motor));
        }
      } else {
        const data = await api<EquipmentConfiguration>(
          `/equipment-configurations/assets/${asset.id}`,
          { signal: controller.signal },
        );
        const motor = data.motor?.assignedMotorId
          ? await api<MotorRecord>(
              `/equipment-motors/${data.motor.assignedMotorId}`,
              { signal: controller.signal },
            )
          : null;
        if (!controller.signal.aborted) {
          setConfig(data);
          setSelected(motor);
        }
      }
    })()
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [asset.id, isMotor]);
  const candidates = [
    ...new Map(
      [...options.items, ...(selected ? [selected] : [])].map((item) => [
        item.id,
        item,
      ]),
    ).values(),
  ];
  const compatible = selected?.motorCompatibility.some(
    (item) => item.equipment.id === asset.id,
  );
  const transfer =
    selected?.assignedToMixer && selected.assignedToMixer.id !== asset.id;
  const close = () => {
    if (!busy.current) onClose();
  };
  const save = async (detach = false) => {
    if (busy.current || loading || (!isMotor && !config)) return;
    busy.current = true;
    setSaving(true);
    setError("");
    try {
      if (mode === "edit" && !detach && selected) {
        const updated = await api<MotorRecord>(
          `/equipment-motors/${selected.id}`,
          {
            method: "PUT",
            json: {
              ...form,
              powerHp: Number(form.powerHp),
              version: selected.motorVersion,
            },
          },
        );
        setSelected(updated);
        setReload((r) => r + 1);
        await onSaved();
        if (isMotor) onClose();
        else setMode("existing");
      } else {
        await api(`/equipment-motors/equipment/${asset.id}`, {
          method: "PUT",
          json: {
            version: config!.version,
            ...(detach
              ? { motorId: null }
              : mode === "new"
                ? { newMotor: { ...form, powerHp: Number(form.powerHp) } }
                : {
                    motorId: selected?.id,
                    expectedSourceId: selected?.assignedToMixer?.id ?? null,
                  }),
          },
        });
        await onSaved();
        onClose();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el motor.");
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };
  return (
    <Modal
      opened
      onClose={close}
      title={isMotor ? "Editar motor" : "Motor asignado"}
      size="lg"
      centered
      closeOnClickOutside={!saving}
      closeOnEscape={!saving}
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          {equipmentLabel(asset)}
        </Text>
        {error ? (
          <Alert color="red" role="alert">
            {error}
          </Alert>
        ) : null}
        {loading ? (
          <Loader aria-label="Cargando motor" />
        ) : (
          <>
            {!isMotor && mode !== "edit" ? (
              <SegmentedControl
                fullWidth
                value={mode}
                disabled={saving}
                data={[
                  { value: "existing", label: "Asignar existente" },
                  { value: "new", label: "Crear y asignar" },
                ]}
                onChange={(value) => {
                  setMode(value as "existing" | "new");
                  setError("");
                  if (value === "new")
                    setForm({
                      brand: "",
                      model: "",
                      powerHp: "",
                      fuel: "GASOLINA",
                      compatibleEquipmentIds: [asset.id],
                    });
                }}
              />
            ) : null}
            {mode === "existing" ? (
              <>
                <Select
                  label="Motor"
                  searchable
                  value={selected?.id ?? null}
                  data={candidates.map((item) => ({
                    value: item.id,
                    label: `${equipmentLabel(item)} · ${item.assignedToMixer ? `Asignado a ${equipmentLabel(item.assignedToMixer)}` : "Disponible"}`,
                  }))}
                  searchValue={options.search}
                  onSearchChange={options.onSearch}
                  disabled={saving}
                  onChange={(id) =>
                    setSelected(
                      candidates.find((item) => item.id === id) ?? null,
                    )
                  }
                  nothingFoundMessage={
                    options.loading
                      ? "Buscando motores…"
                      : "No se encontraron motores"
                  }
                />
                {options.error ? (
                  <Alert color="red">{options.error}</Alert>
                ) : null}
                {options.hasMore ? (
                  <Button
                    variant="subtle"
                    size="xs"
                    onClick={options.next}
                    loading={options.loading}
                  >
                    Cargar más motores
                  </Button>
                ) : null}
                {selected && !compatible ? (
                  <Alert color="orange">
                    Este motor todavía no es compatible con este equipo. Puedes
                    editar los equipos compatibles antes de asignarlo.
                  </Alert>
                ) : null}
                {transfer ? (
                  <Alert color="orange">
                    Al confirmar, se retirará de{" "}
                    {equipmentLabel(selected!.assignedToMixer!)} y se asignará a
                    este equipo. El cambio quedará en el historial de ambos.
                  </Alert>
                ) : null}
                {selected ? (
                  <Button
                    variant="subtle"
                    size="sm"
                    disabled={saving}
                    onClick={() => {
                      setForm(motorForm(selected));
                      setMode("edit");
                      setError("");
                    }}
                  >
                    Editar datos y compatibilidad
                  </Button>
                ) : null}
                <Text size="xs" c="dimmed">
                  Para cambiarlo, el motor y el equipo deben estar en la misma
                  bodega. Esta acción no registra un traslado físico.
                </Text>
              </>
            ) : (
              <>
                {mode === "new" ? (
                  <Text size="sm">
                    Se creará un asset con código automático, en la bodega y a
                    nombre del propietario de este equipo.
                  </Text>
                ) : null}
                <MotorDetailsFields
                  key={mode === "edit" ? selected?.id : "new"}
                  value={form}
                  onChange={setForm}
                  disabled={saving}
                  seeds={[
                    ...(isMotor ? [] : [asset]),
                    ...(selected?.motorCompatibility.map(
                      (item) => item.equipment,
                    ) ?? []),
                  ]}
                />
              </>
            )}
            <div className={classes.actions}>
              {!isMotor &&
              config?.motor?.assignedMotorId &&
              mode === "existing" ? (
                <Button
                  color="red"
                  variant="subtle"
                  disabled={saving}
                  onClick={() => {
                    if (
                      window.confirm(
                        "¿Desasignar el motor? El equipo quedará sin motor hasta que le asignes otro.",
                      )
                    )
                      void save(true);
                  }}
                >
                  Desasignar
                </Button>
              ) : null}
              <div className={classes.confirmActions}>
                <Button
                  variant="default"
                  disabled={saving}
                  onClick={() => {
                    if (mode === "edit" && !isMotor) setMode("existing");
                    else close();
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  loading={saving}
                  disabled={
                    mode === "existing"
                      ? !selected || !compatible
                      : !motorFormValid(form)
                  }
                  onClick={() => void save()}
                >
                  {mode === "edit"
                    ? "Guardar motor"
                    : mode === "new"
                      ? "Crear y asignar motor"
                      : transfer
                        ? "Trasladar y asignar"
                        : "Asignar motor"}
                </Button>
              </div>
            </div>
            {!isMotor ? (
              <Accordion variant="contained">
                <Accordion.Item value="history">
                  <Accordion.Control>
                    Historial de asignaciones
                  </Accordion.Control>
                  <Accordion.Panel>
                    <MotorHistory
                      assetId={asset.id}
                      version={config?.version ?? 0}
                    />
                  </Accordion.Panel>
                </Accordion.Item>
              </Accordion>
            ) : null}
          </>
        )}
      </Stack>
    </Modal>
  );
}
