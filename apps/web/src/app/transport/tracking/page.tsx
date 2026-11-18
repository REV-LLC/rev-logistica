'use client';

import { Suspense } from 'react';
import { Loader } from '@mantine/core';
import TrackingWorkspace from '@/components/tracking/TrackingWorkspace';

export default function VehicleTrackingPage() {
  return <Suspense fallback={<Loader aria-label="Cargando seguimiento" />}><TrackingWorkspace /></Suspense>;
}
