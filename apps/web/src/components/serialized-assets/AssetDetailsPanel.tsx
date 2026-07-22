import { Paper, SimpleGrid, Stack, Text, Box } from '@mantine/core';

export type AssetDetailSection = {
  title: string;
  fields: Array<{ label: string; value: string }>;
};

type AssetDetailsPanelProps = {
  sections: AssetDetailSection[];
};

export default function AssetDetailsPanel({ sections }: AssetDetailsPanelProps) {
  return (
    <Paper withBorder radius="xl" p={{ base: 'md', md: 'xl' }}>
      <div>
        <Text className="ui-text-title" style={{ fontSize: '1rem' }}>
          Datos del equipo
        </Text>
        <Text className="ui-text-body " style={{ marginTop:6 }}>
          Informacion tecnica y comercial visible para operacion.
        </Text>
      </div>

      <Stack gap="xl" mt="lg">
        {sections.map((section) => (
          <Box
            key={section.title}
            style={{
              background: 'rgba(15, 23, 42, 0.02)',
              borderRadius: 12,
              padding: '16px 18px',
            }}
          >
            <Text
              fw={700}
              tt="uppercase"
              style={{ fontSize: '0.75rem', letterSpacing: 0.4, color: 'var(--mantine-color-dimmed)' }}
              mb="sm"
            >
              {section.title}
            </Text>
            <Stack gap={2}>
              {section.fields.map((field) => (
                <SimpleGrid
                  key={`${section.title}-${field.label}`}
                  cols={{ base: 1, sm: 2 }}
                  spacing={{ base: 2, sm: 'xl' }}
                  py={8}
                  style={{ minHeight: 40, alignItems: 'center' }}
                >
                  <Text className="ui-text-label" style={{ fontSize: '0.85rem', opacity: 0.7 }}>
                    {field.label}
                  </Text>
                  <Text
                    className="ui-text-body"
                    fw={500}
                    lineClamp={2}
                    ta={{ base: 'left', sm: 'right' }}
                    style={{ overflowWrap: 'anywhere' }}
                  >
                    {field.value}
                  </Text>
                </SimpleGrid>
              ))}
            </Stack>
          </Box>
        ))}
      </Stack>
    </Paper>
  );
}