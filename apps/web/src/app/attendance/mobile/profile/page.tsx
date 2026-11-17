import MobileAttendance from '@/components/attendance-mobile/MobileAttendance';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Mi perfil | MiREV' };

export default function MiRevProfilePage() {
  return <MobileAttendance view="profile" />;
}
