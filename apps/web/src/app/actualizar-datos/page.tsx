import CustomerUpdateForm from './CustomerUpdateForm';

export default async function CustomerUpdatePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = '' } = await searchParams;
  return <CustomerUpdateForm token={token} />;
}
