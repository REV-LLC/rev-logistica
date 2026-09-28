"use client";
import { useParams } from "next/navigation";
import { Container } from "@mantine/core";
import ConfigurationPanel from "@/components/equipment-configuration/ConfigurationPanel";
export default function Page() {
  const params = useParams<{ accessoryId: string }>();
  return (
    <Container size="lg" py="xl">
      <ConfigurationPanel key={params.accessoryId} accessoryId={params.accessoryId} />
    </Container>
  );
}
