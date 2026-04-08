'use client';

import type { HealthStatus } from '../types';

interface Props {
  status: HealthStatus;
  size?: 'sm' | 'md' | 'lg';
}

const COLOR: Record<HealthStatus, string> = {
  healthy: 'bg-radar',
  degraded: 'bg-amber-400',
  down: 'bg-red-500',
};

const GLOW: Record<HealthStatus, string> = {
  healthy: 'shadow-glow-radar',
  degraded: 'shadow-glow-gold-sm',
  down: 'shadow-glow-red',
};

const LABEL: Record<HealthStatus, string> = {
  healthy: 'Healthy',
  degraded: 'Degraded',
  down: 'Down',
};

const SIZE: Record<NonNullable<Props['size']>, string> = {
  sm: 'h-2 w-2',
  md: 'h-3 w-3',
  lg: 'h-4 w-4',
};

export function StatusIndicator({ status, size = 'md' }: Props): React.JSX.Element {
  return (
    <span
      className={`inline-block rounded-full flex-shrink-0 ${SIZE[size]} ${COLOR[status]} ${GLOW[status]}`}
      title={LABEL[status]}
      aria-label={LABEL[status]}
      role="img"
    />
  );
}
