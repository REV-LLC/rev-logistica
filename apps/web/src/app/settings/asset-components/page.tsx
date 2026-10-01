import { redirect } from 'next/navigation';

// Preserve old bookmarks without exposing the retired configuration API.
export default function LegacyAssetComponentsPage() {
  redirect('/inventory/warehouse');
}
