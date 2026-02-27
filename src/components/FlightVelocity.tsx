import type { LFVChain } from '@/types/api';

interface FlightVelocityProps {
  chains?: LFVChain[];
  isLoading?: boolean;
}

const INTERPRETATION_COLORS: Record<string, string> = {
  rapid_flight: 'text-red-400',
  moderate_outflow: 'text-orange-400',
  stable: 'text-green-400',
  moderate_inflow: 'text-blue-400',
  rapid_inflow: 'text-blue-300',
};

const INTERPRETATION_LABELS: Record<string, string> = {
  rapid_flight: 'Rapid Flight',
  moderate_outflow: 'Moderate Outflow',
  stable: 'Stable',
  moderate_inflow: 'Moderate Inflow',
  rapid_inflow: 'Rapid Inflow',
};

export default function FlightVelocity({ chains, isLoading }: FlightVelocityProps): React.JSX.Element {
  if (isLoading || !chains) {
    return <div className="h-32 bg-gray-800 rounded-lg animate-pulse" />;
  }

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
        Liquidity Flight (24h)
      </h2>
      <div className="space-y-3">
        {chains.map((chain) => {
          const pct = chain.lfv24h * 100;
          const colorClass = INTERPRETATION_COLORS[chain.interpretation] ?? 'text-gray-400';
          const label = INTERPRETATION_LABELS[chain.interpretation] ?? chain.interpretation;

          return (
            <div key={chain.chain} className="flex items-center gap-4">
              <span className="w-8 text-xs font-mono text-gray-400 uppercase">{chain.chain.slice(0, 4)}</span>
              <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${pct >= 0 ? 'bg-blue-500' : 'bg-red-500'}`}
                  style={{ width: `${Math.min(Math.abs(pct) * 5, 100)}%` }}
                />
              </div>
              <span className={`text-sm font-mono w-14 text-right ${colorClass}`}>
                {pct > 0 ? '+' : ''}{pct.toFixed(1)}%
              </span>
              <span className={`text-xs w-28 ${colorClass}`}>
                {chain.alert ? '⚠ ' : ''}{label}
              </span>
            </div>
          );
        })}
        {chains.length === 0 && (
          <p className="text-gray-500 text-sm">No LFV data available yet.</p>
        )}
      </div>
    </div>
  );
}
