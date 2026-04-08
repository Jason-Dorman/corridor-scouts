'use client';

import type { FragilityLevel } from '../types';

interface Props {
  level: FragilityLevel;
}

const STYLE: Record<FragilityLevel, string> = {
  low: 'bg-radar/10 text-radar ring-radar/30',
  medium: 'bg-amber-500/10 text-amber-300 ring-amber-500/30',
  high: 'bg-red-500/10 text-red-300 ring-red-500/30',
};

const LABEL: Record<FragilityLevel, string> = {
  low: 'Low',
  medium: 'Med',
  high: 'High',
};

export function FragilityBadge({ level }: Props): React.JSX.Element {
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-mono font-medium ring-1 ring-inset ${STYLE[level]}`}
    >
      {LABEL[level]}
    </span>
  );
}
