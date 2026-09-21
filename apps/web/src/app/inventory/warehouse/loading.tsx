import { Container } from '@mantine/core';
import CollectionLoading from '@/components/CollectionLoading';

export default function Loading() {
  return <Container size="xl" py="xl"><CollectionLoading label="Cargando inventario y bodegas" variant="equipment" /></Container>;
}
