import { redirect } from 'next/navigation';

type PageProps = {
  params: Promise<{ worksiteId: string }>;
};

export default async function ObraAliasDetailPage({ params }: PageProps) {
  const { worksiteId } = await params;
  redirect(`/transport/obras/${worksiteId}`);
}
