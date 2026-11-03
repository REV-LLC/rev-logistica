"use client";
import { useState } from "react";
import {
  Button,
  NumberInput,
  Paper,
  Select,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { annexTransportRows, annexTransportTotals } from "@/lib/annex-totals";
import type { AnnexInput, TransportRow } from "./types";
const money = (value: string) =>
  Number(value).toLocaleString("es-CO", { style: "currency", currency: "COP" });
export default function AnnexTransport({
  input,
  editing,
  busy,
  onChange,
}: {
  input: AnnexInput;
  editing: boolean;
  busy: boolean;
  onChange: (next: AnnexInput) => void;
}) {
  const [direction, setDirection] =
    useState<TransportRow["direction"]>("outbound");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState<string | number>("");
  const rows = annexTransportRows(input.transport);
  function update(next: TransportRow[]) {
    onChange({
      ...input,
      transport: {
        outbound: { quantity: "0", unitPrice: "0" },
        return: { quantity: "0", unitPrice: "0" },
        rows: next,
      },
    });
  }
  function add() {
    if (
      !description.trim() ||
      price === "" ||
      !Number.isFinite(Number(price)) ||
      Number(price) < 0 ||
      rows.length >= 200
    )
      return;
    update([
      ...rows,
      {
        id: crypto.randomUUID(),
        direction,
        description: description.trim(),
        quantity: "1",
        unitPrice: Number(price).toFixed(2),
      },
    ]);
    setDescription("");
    setPrice("");
  }
  return (
    <Paper withBorder p="sm">
      <Title order={4} mb="xs">
        Transporte
      </Title>
      <Table.ScrollContainer minWidth={550}>
        <Table aria-label="Transportes del anexo">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Trayecto</Table.Th>
              <Table.Th>Descripción</Table.Th>
              <Table.Th ta="right">Precio</Table.Th>
              {editing && <Table.Th>Acción</Table.Th>}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((row) => (
              <Table.Tr key={row.id}>
                <Table.Td>
                  {row.direction === "outbound" ? "Ida" : "Regreso"}
                </Table.Td>
                <Table.Td>
                  {row.description}
                  {row.quantity !== "1" && (
                    <Text size="xs" c="dimmed">
                      {row.quantity} × {money(row.unitPrice)}
                    </Text>
                  )}
                </Table.Td>
                <Table.Td ta="right">
                  {money(
                    annexTransportTotals({
                      outbound: row,
                      return: { quantity: "0", unitPrice: "0" },
                    }).total,
                  )}
                </Table.Td>
                {editing && (
                  <Table.Td>
                    <Button
                      size="compact-xs"
                      variant="subtle"
                      color="red"
                      disabled={busy}
                      aria-label={`Quitar transporte ${row.description}`}
                      onClick={() =>
                        update(rows.filter((item) => item.id !== row.id))
                      }
                    >
                      Quitar
                    </Button>
                  </Table.Td>
                )}
              </Table.Tr>
            ))}
            {editing && (
              <Table.Tr>
                <Table.Td>
                  <Select
                    aria-label="Trayecto del transporte"
                    data={[
                      { value: "outbound", label: "Ida" },
                      { value: "return", label: "Regreso" },
                    ]}
                    value={direction}
                    allowDeselect={false}
                    disabled={busy}
                    onChange={(value) =>
                      setDirection(value as TransportRow["direction"])
                    }
                  />
                </Table.Td>
                <Table.Td>
                  <TextInput
                    aria-label="Descripción del transporte"
                    placeholder="Descripción"
                    maxLength={300}
                    value={description}
                    disabled={busy}
                    onChange={(event) =>
                      setDescription(event.currentTarget.value)
                    }
                  />
                </Table.Td>
                <Table.Td>
                  <NumberInput
                    aria-label="Precio del transporte"
                    placeholder="$ 0"
                    prefix="$ "
                    thousandSeparator="."
                    decimalSeparator=","
                    decimalScale={2}
                    fixedDecimalScale
                    min={0}
                    max={9999999999.99}
                    allowNegative={false}
                    value={price}
                    disabled={busy}
                    onChange={setPrice}
                  />
                </Table.Td>
                <Table.Td>
                  <Button
                    size="xs"
                    disabled={
                      busy ||
                      !description.trim() ||
                      price === "" ||
                      rows.length >= 200
                    }
                    onClick={add}
                  >
                    Agregar
                  </Button>
                </Table.Td>
              </Table.Tr>
            )}
            {!rows.length && !editing && (
              <Table.Tr>
                <Table.Td colSpan={3}>Sin transportes registrados</Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
          <Table.Tfoot>
            <Table.Tr>
              <Table.Th colSpan={2}>Total transporte</Table.Th>
              <Table.Th ta="right">
                {money(annexTransportTotals(input.transport).total)}
              </Table.Th>
              {editing && <Table.Th />}
            </Table.Tr>
          </Table.Tfoot>
        </Table>
      </Table.ScrollContainer>
    </Paper>
  );
}
