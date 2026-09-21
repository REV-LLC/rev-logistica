import { Container } from '@mantine/core';
import CollectionLoading from '@/components/CollectionLoading';

export default function Loading() {
  return <Container size="xl" py="xl"><CollectionLoading label="Cargando empleados" variant="employees" /></Container>;
}
