/**
 * Application-wide constants, thresholds, and configuration.
 *
 * This is the single source of truth for all magic numbers, addresses,
 * and chain/bridge identifiers. All values are sourced from:
 *   - docs/DATA-MODEL.md
 *   - docs/SYSTEM-SPEC.md
 */

// ---------------------------------------------------------------------------
// Chains
// ---------------------------------------------------------------------------

export const CHAIN_IDS = {
  ethereum: 1,
  arbitrum: 42161,
  optimism: 10,
  base: 8453,
  polygon: 137,
  avalanche: 43114,
} as const;

export type ChainName = keyof typeof CHAIN_IDS;

export const CHAIN_NAMES: Record<ChainName, string> = {
  ethereum: 'Ethereum',
  arbitrum: 'Arbitrum',
  optimism: 'Optimism',
  base: 'Base',
  polygon: 'Polygon',
  avalanche: 'Avalanche',
};

// ---------------------------------------------------------------------------
// Bridges
// ---------------------------------------------------------------------------

export const BRIDGES = ['across', 'cctp', 'stargate'] as const;

export type BridgeName = (typeof BRIDGES)[number];

/**
 * Chains supported per bridge (docs/DATA-MODEL.md §2.3).
 */
export const BRIDGE_CHAINS: Record<BridgeName, ChainName[]> = {
  across: ['ethereum', 'arbitrum', 'optimism', 'base', 'polygon'],
  cctp: ['ethereum', 'arbitrum', 'optimism', 'base', 'avalanche'],
  stargate: ['ethereum', 'arbitrum', 'optimism', 'avalanche', 'polygon'],
};

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

export const SUPPORTED_ASSETS = ['USDC', 'USDT', 'ETH', 'WETH', 'DAI'] as const;

export type SupportedAsset = (typeof SUPPORTED_ASSETS)[number];

/** Stablecoin subset used for LFV calculation (docs/DATA-MODEL.md §2.5). */
export const STABLECOINS = ['USDC', 'USDT', 'DAI'] as const;

// ---------------------------------------------------------------------------
// Contract Addresses
// ---------------------------------------------------------------------------

/**
 * Across V3 SpokePool addresses per chain (ETH, ARB, OPT, BASE).
 * Polygon is not included — no address defined in spec.
 * Verify against https://docs.across.to/ before deploying.
 */
export const ACROSS_SPOKEPOOL_ADDRESSES: Partial<Record<ChainName, string>> = {
  ethereum: '0x5c7BCd6E7De5423a257D81B442095A1a6ced35C5',
  arbitrum: '0xe35e9842fceaCA96570B734083f4a58e8F7C5f2a',
  optimism: '0x6f26Bf09B1C792e3228e5467807a900A503c0281',
  base: '0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64',
};

// ---------------------------------------------------------------------------
// CCTP V1 Contracts & Domain Mappings (UPDATED-SPEC.md "Add CCTP (Week 3)")
// ---------------------------------------------------------------------------

/**
 * CCTP domain number per chain.
 * Used to construct CCTP transfer IDs: {sourceDomain}_{nonce} (docs/DATA-MODEL.md §13.1).
 * Source: https://developers.circle.com/stablecoins/docs/supported-domains
 */
export const CCTP_DOMAINS: Partial<Record<ChainName, number>> = {
  ethereum: 0,
  avalanche: 1,
  optimism: 2,
  arbitrum: 3,
  base: 6,
} as const;

/**
 * CCTP V1 TokenMessenger addresses per chain (initiation contract — emits DepositForBurn).
 * Verify at https://developers.circle.com/stablecoins/docs/evm-smart-contracts before deploying.
 */
export const CCTP_TOKEN_MESSENGER_ADDRESSES: Partial<Record<ChainName, string>> = {
  ethereum: '0xBd3fa81B58Ba92a82136038B25aDec7066af3155',
  arbitrum: '0x19330d10D9Cc8751218eaf51E8885D058642E08A',
  optimism: '0x2B4069517957735bE00ceE0fadAE88a26365528f',
  base: '0x1682Ae6375C4E4A97e4B583BC394c861A46D8962',
  avalanche: '0x6B25532e1060CE10cc3B0A99e5683b91BFDe6982',
};

/**
 * CCTP V1 MessageTransmitter addresses per chain (completion contract — emits MessageReceived).
 * Verify at https://developers.circle.com/stablecoins/docs/evm-smart-contracts before deploying.
 */
export const CCTP_MESSAGE_TRANSMITTER_ADDRESSES: Partial<Record<ChainName, string>> = {
  ethereum: '0x0a992d191DEeC32aFe36203Ad87D7d289a738F81',
  arbitrum: '0xC30362313FBBA5cf9163F0bb16a0e01f01A896ca',
  optimism: '0x4d41f22c5a0e5c74090899e5a8Fb597a8842b3e8',
  base: '0xAD09780d193884d503182aD4588450C416D6F9D4',
  avalanche: '0x8186359aF5F57FbB40c6b14A588d2A59C0C29880',
};

// ---------------------------------------------------------------------------
// Transfer Size Buckets (docs/DATA-MODEL.md §3)
// ---------------------------------------------------------------------------

export const SIZE_BUCKET_THRESHOLDS = {
  small: 10_000,    // < $10K
  medium: 100_000,  // $10K – $99,999
  large: 1_000_000, // $100K – $999,999
  // whale: >= $1M
} as const;

// ---------------------------------------------------------------------------
// Stuck Transfer Detection (docs/DATA-MODEL.md §4.1)
// ---------------------------------------------------------------------------

export const STUCK_THRESHOLDS_SECONDS: Record<string, number> = {
  across: 30 * 60,    // 30 minutes
  cctp: 45 * 60,      // 45 minutes
  stargate: 30 * 60,  // 30 minutes
  wormhole: 60 * 60,  // 60 minutes
  layerzero: 30 * 60, // 30 minutes
};

// ---------------------------------------------------------------------------
// Fragility Thresholds (docs/DATA-MODEL.md §5.3)
// ---------------------------------------------------------------------------

export const FRAGILITY_THRESHOLDS = {
  HIGH_UTILIZATION: 60,   // > 60% utilization → high
  MEDIUM_UTILIZATION: 30, // > 30% utilization → medium
  HIGH_OUTFLOW: -20,      // < -20% net flow 24h → high
  MEDIUM_OUTFLOW: -10,    // < -10% net flow 24h → medium
} as const;

// ---------------------------------------------------------------------------
// Impact Calculation (docs/DATA-MODEL.md §6)
// ---------------------------------------------------------------------------

export const SLIPPAGE_FACTORS: Record<string, number> = {
  across: 0.5,    // Intent-based; relayers absorb slippage
  stargate: 1.0,  // Pool-based AMM
  cctp: 0.0,      // Burn/mint; no slippage
  wormhole: 0.1,  // Message-based
  layerzero: 0.1, // Message-based
};

export const IMPACT_THRESHOLDS = {
  NEGLIGIBLE: 1,  // < 1% pool share
  LOW: 5,         // 1% – 4.99%
  MODERATE: 15,   // 5% – 14.99%
  HIGH: 30,       // 15% – 29.99%
  // severe: >= 30%
} as const;

// ---------------------------------------------------------------------------
// Health Status Thresholds (docs/DATA-MODEL.md §8.3)
// ---------------------------------------------------------------------------

export const HEALTH_THRESHOLDS = {
  SUCCESS_RATE_HEALTHY: 99,       // >= 99% → healthy
  SUCCESS_RATE_DOWN: 95,          // < 95%  → down
  LATENCY_DEGRADED_MULTIPLIER: 2, // > 2x normal → degraded
  LATENCY_DOWN_MULTIPLIER: 5,     // > 5x normal → down
} as const;

// ---------------------------------------------------------------------------
// Anomaly Detection Thresholds (docs/DATA-MODEL.md §9)
// ---------------------------------------------------------------------------

export const ANOMALY_THRESHOLDS = {
  LATENCY_SPIKE_MULTIPLIER: 3,  // current p90 > 3x historical p90
  FAILURE_RATE_THRESHOLD: 10,   // > 10% failure rate in last hour
  LIQUIDITY_DROP_THRESHOLD: 15, // > 15% TVL drop in 24 hours
} as const;

// ---------------------------------------------------------------------------
// LFV Interpretation Thresholds (docs/DATA-MODEL.md §7.5)
// ---------------------------------------------------------------------------

export const LFV_THRESHOLDS = {
  RAPID_FLIGHT: -0.10,     // < -10%
  MODERATE_OUTFLOW: -0.03, // -10% to -3%
  MODERATE_INFLOW: 0.03,   // +3% to +10%
  RAPID_INFLOW: 0.10,      // > +10%
} as const;

// ---------------------------------------------------------------------------
// Time Windows (docs/DATA-MODEL.md §11.1)
// ---------------------------------------------------------------------------

export const TIME_WINDOWS = {
  ONE_HOUR: 3600,
  TWENTY_FOUR_HOURS: 86400,
  SEVEN_DAYS: 604800,
} as const;

// ---------------------------------------------------------------------------
// Redis Channels (docs/SYSTEM-SPEC.md §1)
// ---------------------------------------------------------------------------

export const REDIS_CHANNELS = {
  TRANSFER_INITIATED: 'transfer:initiated',
  TRANSFER_COMPLETED: 'transfer:completed',
  POOL_SNAPSHOT: 'pool:snapshot',
} as const;

export type RedisChannel = (typeof REDIS_CHANNELS)[keyof typeof REDIS_CHANNELS];

// ---------------------------------------------------------------------------
// Transfer Size Bucket Classification (docs/DATA-MODEL.md §3.1)
// ---------------------------------------------------------------------------

/**
 * Classify a USD transfer amount into a size bucket.
 *
 * Exported as a standalone function so it can be used by any layer
 * (scouts, processors, calculators) without going through an instance.
 *
 * Thresholds from DATA-MODEL.md §3.2:
 *   small  : < $10,000
 *   medium : $10,000 – $99,999
 *   large  : $100,000 – $999,999
 *   whale  : ≥ $1,000,000
 */
export function getSizeBucket(
  amountUsd: number,
): 'small' | 'medium' | 'large' | 'whale' {
  if (amountUsd < SIZE_BUCKET_THRESHOLDS.small) return 'small';
  if (amountUsd < SIZE_BUCKET_THRESHOLDS.medium) return 'medium';
  if (amountUsd < SIZE_BUCKET_THRESHOLDS.large) return 'large';
  return 'whale';
}
