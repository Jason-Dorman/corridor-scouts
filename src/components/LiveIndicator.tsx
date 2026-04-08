'use client';

import useSWR from 'swr';

interface HealthData {
  transfers24h: number;
  updatedAt: string;
}

type SystemState = 'live' | 'stale' | 'offline';

function deriveState(data: HealthData | undefined, error: unknown): SystemState {
  if (error || !data) return 'offline';
  if (data.transfers24h > 0) return 'live';
  return 'stale';
}

const STATE_CONFIG: Record<SystemState, { label: string; sublabel: string; dotClass: string; textClass: string }> = {
  live: {
    label: 'System Online',
    sublabel: 'Monitoring active',
    dotClass: 'bg-radar shadow-glow-radar',
    textClass: 'text-radar',
  },
  stale: {
    label: 'System Online',
    sublabel: 'No recent transfers',
    dotClass: 'bg-amber-400 shadow-glow-gold-sm',
    textClass: 'text-amber-400',
  },
  offline: {
    label: 'System Offline',
    sublabel: 'Unable to connect',
    dotClass: 'bg-red-400 shadow-glow-red',
    textClass: 'text-red-400',
  },
};

export function LiveIndicator(): React.JSX.Element {
  const { data, error } = useSWR<HealthData>('/api/health', {
    refreshInterval: 30_000,
    dedupingInterval: 10_000,
  });

  const state = deriveState(data, error);
  const cfg = STATE_CONFIG[state];

  return (
    <div
      className="flex items-center gap-2.5"
      aria-live="polite"
      aria-label={`${cfg.label}: ${cfg.sublabel}`}
    >
      <div className="text-right hidden sm:block">
        <div className={`text-[11px] font-mono font-semibold tracking-wider uppercase leading-tight ${cfg.textClass}`}>
          {cfg.label}
        </div>
        <div className="text-[9px] font-mono text-lavender-dim leading-tight">
          {cfg.sublabel}
        </div>
      </div>

      {/* Dot with pulse ring when live */}
      <span className="relative flex h-3 w-3 items-center justify-center flex-shrink-0">
        {state === 'live' && (
          <span className="absolute inset-0 rounded-full bg-radar/30 radar-ping" />
        )}
        <span className={`relative inline-block h-2.5 w-2.5 rounded-full ${cfg.dotClass}`} />
      </span>

      {/* Mobile: just the label */}
      <span className={`sm:hidden text-xs font-mono font-medium tracking-wider uppercase ${cfg.textClass}`}>
        {state === 'live' ? 'Online' : state === 'stale' ? 'Idle' : 'Offline'}
      </span>
    </div>
  );
}
