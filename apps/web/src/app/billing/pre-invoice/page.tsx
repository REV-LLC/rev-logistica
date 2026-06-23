import { notFound } from 'next/navigation';
import PreInvoiceClient from './PreInvoiceClient';

export default function PreInvoicePage() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  return <PreInvoiceClient />;
}
