import { notFound } from 'next/navigation';
import TransportCostClient from './TransportCostClient';

export default function TransportCostPage() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  return <TransportCostClient />;
}
