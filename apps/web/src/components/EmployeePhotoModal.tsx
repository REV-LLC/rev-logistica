"use client";

import { Center, Modal, Stack, Text } from "@mantine/core";
import EmployeeAvatar, {
  useEmployeePhotoUrl,
} from "@/components/EmployeeAvatar";

type EmployeePhotoRecord = {
  id: string;
  name: string;
  lastName?: string | null;
};

function employeeName(employee: EmployeePhotoRecord) {
  return `${employee.name} ${employee.lastName ?? ""}`.trim();
}

function EmployeePhotoPreview({ employee }: { employee: EmployeePhotoRecord }) {
  const photoUrl = useEmployeePhotoUrl(employee.id, 0, true);

  return (
    <Stack align="center" gap="md">
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt={`Foto ampliada de ${employeeName(employee)}`}
          className="employee-photo-preview"
        />
      ) : (
        <Center className="employee-photo-preview employee-photo-preview--empty">
          <EmployeeAvatar employee={employee} size={180} />
        </Center>
      )}
      <Text fw={800} size="lg" ta="center">
        {employeeName(employee)}
      </Text>
    </Stack>
  );
}

export default function EmployeePhotoModal({
  employee,
  onClose,
}: {
  employee: EmployeePhotoRecord | null;
  onClose: () => void;
}) {
  return (
    <Modal
      opened={Boolean(employee)}
      onClose={onClose}
      title="Foto del empleado"
      centered
      size="lg"
    >
      {employee ? <EmployeePhotoPreview employee={employee} /> : null}
    </Modal>
  );
}
