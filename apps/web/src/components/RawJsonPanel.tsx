'use client';

import { useState } from 'react';
import { Accordion, Button, Code, Group, ScrollArea } from '@mantine/core';

export default function RawJsonPanel({ data }: { data: unknown }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Accordion defaultValue="raw-json" mt="md">
      <Accordion.Item value="raw-json">
        <Accordion.Control>Raw JSON</Accordion.Control>
        <Accordion.Panel>
          <Group mb="sm">
            <Button variant="light" size="xs" onClick={handleCopy}>
              {copied ? 'Copiado' : 'Copy JSON'}
            </Button>
          </Group>
          <ScrollArea h={260}>
            <Code block>{JSON.stringify(data, null, 2)}</Code>
          </ScrollArea>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}
