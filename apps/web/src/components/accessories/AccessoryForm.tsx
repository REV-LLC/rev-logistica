"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Group,
  Loader,
  MultiSelect,
  NumberInput,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { api } from "@/lib/api";
import {
  Accessory,
  AccessoryKind,
  AccessoryScope,
  Equipment,
  equipmentLabel,
  Family,
  kindLabels,
  kindDescriptions,
  scopeLabels,
  Warehouse,
} from "./types";

export default function AccessoryForm({
  item,
  equipment,
  onSaved,
  onCancel,
}: {
  item?: Accessory;
  equipment?: Equipment;
  onSaved: (item: Accessory) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [kind, setKind] = useState<AccessoryKind>(item?.kind ?? "INDIVIDUAL");
  const [internalCode, setInternalCode] = useState(item?.internalCode ?? "");
  const [familyId, setFamilyId] = useState<string | null>(
    item?.familyId ?? equipment?.sku.assetFamilyId ?? null,
  );
  const [scope, setScope] = useState<AccessoryScope>(
    item?.scope ?? (equipment ? "ASSETS" : "FAMILY"),
  );
  const [subfamilyIds, setSubfamilyIds] = useState(
    item?.subfamilies.map((s) => s.subfamilyId) ?? [],
  );
  const [assetIds, setAssetIds] = useState(
    item?.assets.map((a) => a.assetId) ?? (equipment ? [equipment.id] : []),
  );
  const [active, setActive] = useState(item?.active ?? true);
  const [parentAccessoryIds, setParentAccessoryIds] = useState(item?.compatibleParents?.map(p => p.parentAccessoryId) ?? []);
  const [parentOptions, setParentOptions] = useState(item?.compatibleParents?.map(p => ({ value: p.parentAccessoryId, label: `${p.parentAccessory.name} · ${p.parentAccessory.internalCode ?? ''}` })) ?? []);
  const [parentSearch, setParentSearch] = useState('');
  const [ownerWarehouseId, setOwnerWarehouseId] = useState<string | null>(
    equipment?.warehouseOwnerId ?? null,
  );
  const [warehouseId, setWarehouseId] = useState<string | null>(
    equipment?.warehouseCurrentId ?? null,
  );
  const [quantity, setQuantity] = useState<string | number>(1);
  const [families, setFamilies] = useState<Family[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [assets, setAssets] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const attempt = useRef<{ body: string; requestId: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      api<Family[]>("/asset-families?controlType=SERIAL", {
        signal: controller.signal,
      }),
      api<Warehouse[]>("/warehouses", { signal: controller.signal }),
    ])
      .then(([familyList, warehouseList]) => {
        setFamilies(familyList);
        setWarehouses(warehouseList.filter((w) => w.active !== false));
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    setAssets([]);
    if (!familyId) return;
    const controller = new AbortController();
    setLoadingAssets(true);
    api<Equipment[]>(`/accessories/equipment?familyId=${familyId}`, {
      signal: controller.signal,
    })
      .then(setAssets)
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingAssets(false);
      });
    return () => controller.abort();
  }, [familyId]);

  useEffect(() => {
    if (scope !== 'ACCESSORIES' || !familyId) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ familyId, purpose: 'ACCESSORY', search: parentSearch.trim() });
      void api<{ items: Accessory[] }>(`/accessories?${params}`, { signal: controller.signal }).then(result => {
        if (controller.signal.aborted) return;
        setParentOptions(previous => Array.from(new Map([
          ...previous.filter(option => parentAccessoryIds.includes(option.value)),
          ...result.items.filter(p => p.active && p.kind === 'INDIVIDUAL' && p.id !== item?.id)
            .map(p => ({ value: p.id, label: `${p.name} · ${p.internalCode ?? ''}` })),
        ].map(option => [option.value, option])).values()));
      }).catch(err => { if (!controller.signal.aborted) setError(err.message); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [scope, familyId, parentSearch, parentAccessoryIds, item?.id]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting.current) return;
    if (
      !familyId ||
      !name.trim() ||
      (scope === "ASSETS" && !assetIds.length) ||
      (scope === "SUBFAMILIES" && !subfamilyIds.length) ||
      (scope === "ACCESSORIES" && !parentAccessoryIds.length)
    ) {
      setError(
        "Completa el nombre, la familia y los destinos de compatibilidad.",
      );
      return;
    }
    if (!item && (!ownerWarehouseId || !warehouseId)) {
      setError("Selecciona el propietario y la bodega inicial.");
      return;
    }
    submitting.current = true;
    setSaving(true);
    setError("");
    const details = {
      name: name.trim(),
      description,
      kind,
      internalCode: kind === "INDIVIDUAL" ? internalCode.trim() : "",
      familyId,
      scope,
      subfamilyIds: scope === "SUBFAMILIES" ? subfamilyIds : [],
      assetIds: scope === "ASSETS" ? assetIds : [],
      parentAccessoryIds: scope === 'ACCESSORIES' ? parentAccessoryIds : [],
      purpose: item?.purpose ?? 'ACCESSORY',
      ...(item?.exclusiveAssetId ? { exclusiveAssetId: item.exclusiveAssetId } : {}),
    };
    const body = item
      ? { ...details, active, version: item.version }
      : {
          ...details,
          ownerWarehouseId,
          warehouseId,
          quantity: kind === "INDIVIDUAL" ? 1 : Number(quantity),
        };
    const signature = JSON.stringify(body);
    if (attempt.current?.body !== signature)
      attempt.current = { body: signature, requestId: crypto.randomUUID() };
    try {
      const saved = await api<Accessory>(
        item ? `/accessories/${item.id}` : "/accessories",
        {
          method: item ? "PATCH" : "POST",
          json: item ? body : { ...body, requestId: attempt.current.requestId },
        },
      );
      onSaved(saved);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo guardar el accesorio.",
      );
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  };

  if (loading) return <Loader aria-label="Cargando formulario de accesorio" />;
  const warehouseOptions = warehouses.map((w) => ({
    value: w.id,
    label: w.name,
  }));
  const subfamilies =
    families.find((f) => f.id === familyId)?.subfamilies ?? [];
  return (
    <form onSubmit={save}>
      <Stack>
        {error ? (
          <Alert color="red" role="alert">
            {error}
          </Alert>
        ) : null}
        <fieldset
          disabled={saving}
          style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
        >
          <Stack>
            <TextInput
              label={item?.purpose === 'COMPONENT' ? 'Nombre del componente' : 'Nombre del accesorio'}
              placeholder="CANASTA PARA PLUMA"
              required
              maxLength={160}
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
            />
            <Select
              label="Control del accesorio"
              data={Object.entries(kindLabels).map(([value, label]) => ({
                value,
                label,
              }))}
              value={kind}
              disabled={!!item}
              allowDeselect={false}
              onChange={(value) => {
                setKind(value as AccessoryKind);
                setQuantity(1);
              }}
            />
            <Text size="sm" c="dimmed">
              {kindDescriptions[kind]}
            </Text>
            {kind === "INDIVIDUAL" ? (
              <TextInput
                label="Código del accesorio (opcional)"
                placeholder={
                  item ? "Conservar código actual" : "Se genera al guardar"
                }
                description={
                  item
                    ? "Si lo dejas vacío, se conserva el código actual."
                    : "Déjalo vacío para generar un código automáticamente, o escribe el que ya tiene el accesorio."
                }
                maxLength={80}
                value={internalCode}
                onChange={(e) => setInternalCode(e.currentTarget.value)}
              />
            ) : null}
            <Textarea
              label="Descripción y especificaciones de compatibilidad"
              maxLength={2000}
              value={description}
              onChange={(e) => setDescription(e.currentTarget.value)}
            />
            <Select
              label="Familia de equipos compatibles"
              required
              searchable
              data={families.map((f) => ({ value: f.id, label: f.name }))}
              value={familyId}
              disabled={!!item?.exclusiveAssetId}
              onChange={(value) => {
                setFamilyId(value);
                setSubfamilyIds([]);
                setAssetIds([]);
                setParentAccessoryIds([]);
                setParentOptions([]);
              }}
            />
            <Select
              label="¿Quiénes pueden usarlo?"
              allowDeselect={false}
              data={Object.entries(scopeLabels).map(([value, label]) => ({
                value,
                label,
              }))}
              value={scope}
              disabled={!!item?.exclusiveAssetId}
              onChange={(value) => setScope(value as AccessoryScope)}
            />
            {scope === "FAMILY" ? (
              <Text size="sm">
                Incluye automáticamente los equipos actuales y futuros de esta
                familia.
              </Text>
            ) : null}
            {scope === "SUBFAMILIES" ? (
              <MultiSelect
                label="Subfamilias compatibles"
                required
                searchable
                value={subfamilyIds}
                data={subfamilies.map((s) => ({ value: s.id, label: s.name }))}
                onChange={setSubfamilyIds}
              />
            ) : null}
            {scope === "ASSETS" ? (
              <MultiSelect
                label="Equipos compatibles"
                required
                searchable
                value={assetIds}
                disabled={loadingAssets || !!item?.exclusiveAssetId}
                data={assets.map((a) => ({
                  value: a.id,
                  label: equipmentLabel(a),
                }))}
                onChange={setAssetIds}
              />
            ) : null}
            {scope === 'ACCESSORIES' ? <MultiSelect label="Accesorios principales compatibles" description="Busca por nombre o código. Solo se incluyen accesorios individualizados de la familia elegida."
              required searchable value={parentAccessoryIds} data={parentOptions} onChange={setParentAccessoryIds}
              searchValue={parentSearch} onSearchChange={setParentSearch} /> : null}
            {item?.exclusiveAssetId ? <Text size="sm">Este componente pertenece exclusivamente a su equipo. Omitirlo en una entrega no cambia esa pertenencia.</Text> : null}
            <Alert color="blue">
              La compatibilidad no es una entrega. Después de guardar puedes
              asignar existencias desde la card.
            </Alert>
            {item ? (
              <>
                <Text size="sm">
                  Propietario: {item.ownerWarehouse.name}. Las existencias y
                  ubicaciones se modifican mediante movimientos.
                </Text>
                <Checkbox
                  label={item?.purpose === 'COMPONENT' ? 'Componente activo' : 'Accesorio activo'}
                  checked={active}
                  onChange={(e) => setActive(e.currentTarget.checked)}
                />
                <Text size="xs" c="dimmed">
                  El tipo no se cambia después del registro para preservar su
                  historial. Para archivar primero debe quedar sin existencias.
                </Text>
              </>
            ) : (
              <>
                <Select
                  label="Propietario (bodega)"
                  required
                  searchable
                  data={warehouseOptions}
                  value={ownerWarehouseId}
                  onChange={setOwnerWarehouseId}
                />
                <Select
                  label="Bodega de existencia inicial"
                  required
                  searchable
                  data={warehouseOptions}
                  value={warehouseId}
                  onChange={setWarehouseId}
                />
                {kind !== "INDIVIDUAL" ? (
                  <NumberInput
                    label="Cantidad inicial (unidades)"
                    required
                    min={1}
                    max={1000000}
                    allowDecimal={false}
                    value={quantity}
                    onChange={setQuantity}
                  />
                ) : null}
              </>
            )}
          </Stack>
        </fieldset>
        <Group justify="flex-end">
          <Button variant="default" disabled={saving} onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" loading={saving} disabled={loadingAssets}>
            Guardar {item?.purpose === 'COMPONENT' ? 'componente' : 'accesorio'}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
