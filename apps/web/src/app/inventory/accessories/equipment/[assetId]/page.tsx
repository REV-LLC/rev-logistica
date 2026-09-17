"use client";

import { Button, Container, Stack } from "@mantine/core";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import AccessoriesWorkspace from "@/components/accessories/AccessoriesWorkspace";

export default function EquipmentAccessoriesPage() {
  const { assetId } = useParams<{ assetId: string }>();
  const search = useSearchParams();
  return (
    <Container size="xl" py="xl">
      <Stack>
        <Button
          component={Link}
          href={`/inventory/serialized-assets/${assetId}`}
          variant="subtle"
          style={{ alignSelf: "flex-start" }}
        >
          Volver al equipo
        </Button>
        <AccessoriesWorkspace
          key={assetId}
          equipmentId={assetId}
          initialCreate={search.get("create") === "1"}
        />
      </Stack>
    </Container>
  );
}
