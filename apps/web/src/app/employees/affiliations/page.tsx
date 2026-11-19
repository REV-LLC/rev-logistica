'use client';
import { Button, Container, Stack } from '@mantine/core';
import { IconBuildingHospital } from '@tabler/icons-react';
import Link from '@/components/PageTransitionLink';
import EmployeePageBackground from '@/components/EmployeePageBackground';
import PageHeaderCard from '@/components/dashboard/PageHeaderCard';
import EmployeeAffiliationsWorkspace from '@/components/employees/EmployeeAffiliationsWorkspace';
export default function EmployeeAffiliationsPage() {
  return <Container size="xl" py="xl"><EmployeePageBackground src="/employees/rev-directory-v1.webp" mobileSrc="/employees/rev-directory-mobile-v1.webp" variant="brand" />
    <Stack gap="lg"><PageHeaderCard title="EPS y ARL" description="Administra el catálogo y asigna las afiliaciones de cada empleado. En MiREV cada persona consulta las suyas." icon={<IconBuildingHospital size={22} />} iconColor="blue" accentColor="rgba(34,139,230,.12)" aside={<Button component={Link} href="/employees" variant="light">Volver a empleados</Button>} /><EmployeeAffiliationsWorkspace /></Stack>
  </Container>;
}
