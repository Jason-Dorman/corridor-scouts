import type { HealthResponse } from '@/types/api';

interface HealthSummaryProps {
  data?: HealthResponse;
  isLoading?: boolean;
}

export default function HealthSummary({ data, isLoading }: HealthSummaryProps): React.JSX.Element {
  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-4 gap-4 animate-pulse">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 bg-gray-800 rounded-lg" />
        ))}
      </div>
    );
  }

  const stats = [
    { label: 'Corridors', value: data.corridorsMonitored, color: 'text-gray-100' },
    { label: 'Healthy', value: data.corridorsHealthy, color: 'text-green-400' },
    { label: 'Degraded', value: data.corridorsDegraded, color: 'text-yellow-400' },
    { label: 'Down', value: data.corridorsDown, color: 'text-red-400' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {stats.map(({ label, value, color }) => (
        <div key={label} className="bg-gray-900 rounded-lg p-4 border border-gray-800">
          <p className={`text-3xl font-bold ${color}`}>{value}</p>
          <p className="text-sm text-gray-400 mt-1">{label}</p>
        </div>
      ))}
    </div>
  );
}
