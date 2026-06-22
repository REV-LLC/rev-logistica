import { redirect } from 'next/navigation';

export default async function WorksiteRedirectPage({
  params,
}: {
  params: Promise<{ worksiteId: string }>;
}) {
  const { worksiteId } = await params;
  redirect(`/transport/worksites/${worksiteId}`);
}
