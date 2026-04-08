export default async function CorridorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.JSX.Element> {
  const { id } = await params;
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <p className="text-gray-400 text-sm">Corridor detail — coming soon</p>
        <p className="text-gray-600 text-xs mt-1 font-mono">{id}</p>
      </div>
    </div>
  );
}
