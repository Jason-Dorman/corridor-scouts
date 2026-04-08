'use client';

import useSWR from 'swr';

interface HealthData {
  status: 'operational' | 'degraded' | 'down';
  corridorsMonitored: number;
  corridorsHealthy: number;
  corridorsDegraded: number;
  corridorsDown: number;
  transfers24h: number;
  successRate24h: number | null;
  activeAnomalies: number;
  updatedAt: string;
}

interface StatCardProps {
  value: number | string;
  label: string;
  accentColor?: string;
  glowClass?: string;
}

function StatCard({
  value,
  label,
  accentColor = 'text-gold-bright',
  glowClass = '',
}: StatCardProps): React.JSX.Element {
  return (
    <div className={`flex-1 min-w-0 card-radar p-4 text-center ${glowClass}`}>
      <div className={`text-2xl sm:text-3xl font-mono font-bold tabular-nums ${accentColor}`}>
        {value}
      </div>
      <div className="mt-1 text-xs sm:text-sm text-lavender-dim uppercase tracking-wider">
        {label}
      </div>
    </div>
  );
}

export function HealthSummary(): React.JSX.Element {
  const { data, error, isLoading } = useSWR<HealthData>('/api/health', {
    refreshInterval: 30_000,
    dedupingInterval: 10_000,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card-radar p-4 animate-pulse">
            <div className="h-8 bg-ridge/50 rounded w-1/2 mx-auto mb-2" />
            <div className="h-3 bg-ridge/30 rounded w-3/4 mx-auto" />
          </div>
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {['Corridors', 'Healthy', 'Degraded', 'Down'].map(label => (
          <div key={label} className="flex-1 card-radar p-4 text-center">
            <div className="text-2xl font-mono font-bold text-lavender-dim">--</div>
            <div className="mt-1 text-xs text-lavender-dim uppercase tracking-wider">{label}</div>
          </div>
        ))}
      </div>
    );
  }

  const updatedAt = new Date(data.updatedAt);
  const timeAgo = Math.round((Date.now() - updatedAt.getTime()) / 1000);
  const timeLabel =
    timeAgo < 60 ? `${timeAgo}s ago` : `${Math.round(timeAgo / 60)}m ago`;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard value={data.corridorsMonitored} label="Corridors" accentColor="text-gold-bright" />
        <StatCard value={data.corridorsHealthy} label="Healthy" accentColor="text-radar" />
        <StatCard
          value={data.corridorsDegraded}
          label="Degraded"
          accentColor={data.corridorsDegraded > 0 ? 'text-amber-400' : 'text-gold-bright'}
        />
        <StatCard
          value={data.corridorsDown}
          label="Down"
          accentColor={data.corridorsDown > 0 ? 'text-red-400' : 'text-gold-bright'}
          glowClass={data.corridorsDown > 0 ? 'shadow-glow-red' : ''}
        />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-lavender-dim font-mono">
        {data.successRate24h !== null && (
          <span>
            Success rate (24h):{' '}
            <span className="text-radar">{data.successRate24h.toFixed(2)}%</span>
          </span>
        )}
        <span>
          <span className="text-gold-dim">{data.transfers24h.toLocaleString()}</span> transfers today
        </span>
        <span>Updated {timeLabel}</span>
      </div>
    </div>
  );
}
