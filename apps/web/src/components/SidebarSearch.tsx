'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ActionIcon, Combobox, Group, ScrollArea, Stack, Text, TextInput, useCombobox } from '@mantine/core';
import { IconArrowRight, IconSearch, IconX } from '@tabler/icons-react';
import { searchNavigation, type NavigationSearchEntry } from '@/lib/navigation-search';
import { usePageNavigation } from './PageNavigationContext';

export default function SidebarSearch({ entries, onNavigate }: {
  entries: NavigationSearchEntry[];
  onNavigate?: () => void;
}) {
  const [query, setQuery] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const navigateAfterEntrance = usePageNavigation();
  const [navigating, startNavigation] = useTransition();
  const combobox = useCombobox({ onDropdownClose: () => combobox.resetSelectedOption() });
  const results = searchNavigation(entries, query);

  return (
    <Combobox
      store={combobox}
      position="bottom-start"
      middlewares={{ flip: true, shift: true }}
      onOptionSubmit={href => {
        if (!results.some(entry => entry.href === href)) return;
        combobox.closeDropdown();
        setQuery('');
        input.current?.blur();
        const destination = new URL(href, location.href);
        if (destination.pathname !== location.pathname || destination.search !== location.search) {
          navigateAfterEntrance(() => startNavigation(() => router.push(href)));
        }
        onNavigate?.();
      }}
    >
      <Combobox.Target>
        <TextInput
          ref={input}
          aria-label="Buscar en la aplicación"
          data-page-loading={navigating ? 'true' : 'false'}
          placeholder="Buscar en la aplicación"
          leftSection={<IconSearch size={17} aria-hidden="true" />}
          value={query}
          autoComplete="off"
          spellCheck={false}
          size="sm"
          radius="sm"
          style={{ flexShrink: 0 }}
          styles={{
            input: { background: 'rgba(255,255,255,0.07)', borderColor: 'rgba(255,255,255,0.22)', color: '#fff', fontSize: 13 },
            section: { color: '#c8d2df' },
          }}
          onFocus={() => combobox.openDropdown()}
          onClick={() => combobox.openDropdown()}
          onBlur={() => combobox.closeDropdown()}
          onChange={event => {
            setQuery(event.currentTarget.value);
            combobox.resetSelectedOption();
            combobox.openDropdown();
          }}
          rightSection={query ? (
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              aria-label="Limpiar búsqueda"
              title="Limpiar búsqueda"
              onMouseDown={event => event.preventDefault()}
              onClick={() => { setQuery(''); combobox.resetSelectedOption(); input.current?.focus(); }}
            >
              <IconX size={14} />
            </ActionIcon>
          ) : null}
        />
      </Combobox.Target>
      <Combobox.Dropdown>
        <Combobox.Options aria-label="Destinos de navegación">
          <ScrollArea.Autosize mah="min(360px, 50dvh)" type="auto">
            {results.length ? results.map(entry => (
              <Combobox.Option key={entry.href} value={entry.href} aria-label={entry.label}>
                <Group wrap="nowrap" justify="space-between" gap="xs">
                  <Stack gap={2} style={{ minWidth: 0 }}>
                    <Text size="sm" fw={600} style={{ overflowWrap: 'anywhere' }}>{entry.label}</Text>
                    <Text size="xs" c="dimmed">{entry.group}</Text>
                  </Stack>
                  <IconArrowRight size={15} aria-hidden="true" style={{ flexShrink: 0 }} />
                </Group>
              </Combobox.Option>
            )) : <Combobox.Empty>No se encontraron páginas</Combobox.Empty>}
          </ScrollArea.Autosize>
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}
