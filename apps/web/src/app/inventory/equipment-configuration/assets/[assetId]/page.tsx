"use client";
import { useParams } from "next/navigation";
import { Container } from "@mantine/core";
import ConfigurationPanel from "@/components/equipment-configuration/ConfigurationPanel";
export default function Page() {
  const params = useParams<{ assetId: string }>();
  return (
    <Container size="lg" py="xl">
      <ConfigurationPanel key={params.assetId} assetId={params.assetId} />
    </Container>
  );
}
