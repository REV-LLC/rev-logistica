import { Group, Text, Tooltip } from '@mantine/core';
export const helpLabel = (label: string, help: string, required = false) => (
  <Group gap={6} align="center">
    <Text span inherit>{label}</Text>
    {required ? (
      <Text span inherit c="red" fw={700}>
        *
      </Text>
    ) : null}
    <Tooltip label={help} multiline w={280} withArrow>
      <Text span inherit c="dimmed" fw={700} style={{ cursor: 'help' }}>
        ?
      </Text>
    </Tooltip>
  </Group>
);
