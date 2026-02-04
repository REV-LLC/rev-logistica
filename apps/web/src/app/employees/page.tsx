import { Container, Paper, Text, Title } from '@mantine/core';

export default function EmployeesPage() {
  return (
    <Container size="md" py="xl">
      <Paper shadow="sm" p="xl" radius="md" withBorder>
        <Title order={2}>Empleados</Title>
        <Text c="dimmed" mt="xs">
          Pantalla en construcción.
        </Text>
      </Paper>
    </Container>
  );
}
