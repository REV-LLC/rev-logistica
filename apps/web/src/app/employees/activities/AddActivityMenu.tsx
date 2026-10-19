"use client";
import type { ReactNode } from "react";
import { Menu, Text } from "@mantine/core";
import {
  IconBuilding,
  IconBuildingWarehouse,
  IconFirstAidKit,
  IconBeach,
} from "@tabler/icons-react";
import type { ActivityType } from "./activity-types";

export default function AddActivityMenu({
  children,
  onSelect,
}: {
  children: ReactNode;
  onSelect: (type: ActivityType) => void;
}) {
  return (
    <Menu
      position="bottom-end"
      width={310}
      withArrow
      shadow="lg"
      radius="lg"
      withinPortal
    >
      <Menu.Target>{children}</Menu.Target>
      <Menu.Dropdown style={{ maxWidth: "calc(100vw - 24px)" }} p="sm">
        <Menu.Label>¿Qué quieres registrar?</Menu.Label>
        <Menu.Item
          leftSection={<IconBuilding size={22} />}
          onClick={() => onSelect("WORKSITE")}
          py="sm"
        >
          <Text size="sm" fw={650}>
            Agregar actividad de obra
          </Text>
          <Text size="xs" c="dimmed">
            Obra, equipo y actividad del día
          </Text>
        </Menu.Item>
        <Menu.Item
          leftSection={<IconBuildingWarehouse size={22} />}
          onClick={() => onSelect("WAREHOUSE")}
          py="sm"
        >
          <Text size="sm" fw={650}>
            Agregar actividad en bodega
          </Text>
          <Text size="xs" c="dimmed">
            Bodega y actividad del día
          </Text>
        </Menu.Item>
        <Menu.Item
          leftSection={<IconFirstAidKit size={22} />}
          onClick={() => onSelect("ABSENCE")}
          py="sm"
        >
          <Text size="sm" fw={650}>
            Reportar falta o incapacidad
          </Text>
          <Text size="xs" c="dimmed">
            Ausencia y período reportado
          </Text>
        </Menu.Item>
        <Menu.Item
          leftSection={<IconBeach size={22} />}
          onClick={() => onSelect("VACATION")}
          py="sm"
        >
          <Text size="sm" fw={650}>
            Reportar vacaciones
          </Text>
          <Text size="xs" c="dimmed">
            Fechas de inicio y fin
          </Text>
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
