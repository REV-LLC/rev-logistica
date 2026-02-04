import { Container, Paper, Text, Title } from '@mantine/core';

export default function CustomersPage() {
  return (
    <Container size="md" py="xl">
      <Paper shadow="sm" p="xl" radius="md" withBorder>
        <Title order={2}>Clientes</Title>
        <Text c="dimmed" mt="xs">
          Pantalla en construcción.
        </Text>
      </Paper>
    </Container>
  );
}
