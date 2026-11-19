"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Container, Stack, Title } from "@mantine/core";
import AttendanceEmployeeCards from "../components/AttendanceEmployeeCards";

export default function EmployeeAttendancePage() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const params = useSearchParams();
  return (
    <Container size="lg" py="md">
      <Stack>
        <div data-page-heading-glass>
          <Title order={1}>Jornadas del trabajador</Title>
        </div>
        <AttendanceEmployeeCards
          key={`${employeeId}:${params.toString()}`}
          initialEmployeeId={employeeId}
          initialDate={params.get("date")}
          initialFrom={params.get("from")}
          initialTo={params.get("to")}
        />
      </Stack>
    </Container>
  );
}
