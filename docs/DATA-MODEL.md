# Data Model & Calculations
## Corridor Scout - Formulas and Thresholds Reference

This document is the single source of truth for all calculations, formulas, thresholds, and enum values used in Corridor Scout.

---

## 1. Enums & Constants

### 1.1 Transfer Status

```typescript
type TransferStatus = 'pending' | 'completed' | 'stuck' | 'failed';
```

| Status | Description |
|--------|-------------|
| `pending` | Initiated, waiting for completion |
| `completed` | Successfully filled on destination |
| `stuck` | Exceeded bridge threshold, not yet failed |
| `failed` | Explicitly failed or timed out |

### 1.2 Health Status

```typescript
type HealthStatus = 'healthy' | 'degraded' | 'down';
```

### 1.3 Fragility Level

```typescript
type FragilityLevel = 'low' | 'medium' | 'high';
```

### 1.4 Impact Level

```typescript
type ImpactLevel = 'negligible' | 'low' | 'moderate' | 'high' | 'severe';
```

### 1.5 LFV Interpretation

```typescript
type LFVInterpretation = 'rapid_flight' | 'moderate_outflow' | 'stable' | 'moderate_inflow' | 'rapid_inflow';
```

### 1.6 Anomaly Type

```typescript
type AnomalyType = 'latency_spike' | 'failure_cluster' | 'liquidity_drop' | 'stuck_transfer';
```

### 1.7 Severity Level

```typescript
type Severity = 'low' | 'medium' | 'high';
```

---

## 2. Chain & Bridge Constants

### 2.1 Chain IDs

```typescript
const CHAIN_IDS = {
  ethereum: 1,
  arbitrum: 42161,
  optimism: 10,
  base: 8453,
  polygon: 137,
  avalanche: 43114,
} as const;
```

### 2.2 Supported Bridges

```typescript
const BRIDGES = ['across', 'cctp', 'stargate'] as const;
```

### 2.3 Bridge → Chain Support

| Bridge | Chains |
|--------|--------|
| Across | Ethereum, Arbitrum, Optimism, Base, Polygon |
| CCTP | Ethereum, Arbitrum, Optimism, Base, Avalanche |
| Stargate | Ethereum, Arbitrum, Optimism, Avalanche, Polygon |

### 2.4 Supported Assets

```typescript
const SUPPORTED_ASSETS = ['USDC', 'USDT', 'ETH', 'WETH', 'DAI'] as const;
```

### 2.5 Stablecoins (for LFV calculation)

```typescript
const STABLECOINS = ['USDC', 'USDT', 'DAI'] as const;
```

---

## 3. Transfer Size Buckets

### 3.1 Definition

```typescript
function getSizeBucket(amountUsd: number): string {
  if (amountUsd < 10_000) return 'small';
  if (amountUsd < 100_000) return 'medium';
  if (amountUsd < 1_000_000) return 'large';
  return 'whale';
}
```

### 3.2 Thresholds Table

| Bucket | USD Range |
|--------|-----------|
| `small` | $0 - $9,999 |
| `medium` | $10,000 - $99,999 |
| `large` | $100,000 - $999,999 |
| `whale` | $1,000,000+ |

---

## 4. Stuck Transfer Detection

### 4.1 Thresholds by Bridge

```typescript
const STUCK_THRESHOLDS_SECONDS: Record<string, number> = {
  across: 30 * 60,      // 30 minutes = 1800 seconds
  cctp: 45 * 60,        // 45 minutes = 2700 seconds
  stargate: 30 * 60,    // 30 minutes = 1800 seconds
  wormhole: 60 * 60,    // 60 minutes = 3600 seconds
  layerzero: 30 * 60,   // 30 minutes = 1800 seconds
};
```

### 4.2 Detection Logic

```typescript
function isStuck(transfer: Transfer, now: Date): boolean {
  if (transfer.status !== 'pending') return false;
  
  const threshold = STUCK_THRESHOLDS_SECONDS[transfer.bridge];
  const elapsed = (now.getTime() - transfer.initiatedAt.getTime()) / 1000;
  
  return elapsed > threshold;
}
```

---

## 5. Fragility Calculation

### 5.1 Inputs

| Input | Type | Description |
|-------|------|-------------|
| `utilization` | number (0-100) | Pool utilization percentage |
| `tvlUsd` | number | Total value locked in USD |
| `netFlow24h` | number | Net flow in last 24h (positive = inflow) |

### 5.2 Formula

```typescript
interface FragilityResult {
  level: 'low' | 'medium' | 'high';
  utilization: number;
  netFlow24hPct: number;
  reason: string;
}

function calculateFragility(
  utilization: number,
  tvlUsd: number,
  netFlow24h: number
): FragilityResult {
  // Step 1: Calculate net flow percentage
  const netFlow24hPct = tvlUsd > 0 ? (netFlow24h / tvlUsd) * 100 : 0;

  // Step 2: Check HIGH conditions (evaluated first)
  if (utilization > 60) {
    return {
      level: 'high',
      utilization,
      netFlow24hPct,
      reason: `High utilization (${utilization.toFixed(0)}%)`,
    };
  }

  if (netFlow24hPct < -20) {
    return {
      level: 'high',
      utilization,
      netFlow24hPct,
      reason: `Large outflow (${netFlow24hPct.toFixed(0)}% in 24h)`,
    };
  }

  // Step 3: Check MEDIUM conditions
  if (utilization > 30) {
    return {
      level: 'medium',
      utilization,
      netFlow24hPct,
      reason: `Moderate utilization (${utilization.toFixed(0)}%)`,
    };
  }

  if (netFlow24hPct < -10) {
    return {
      level: 'medium',
      utilization,
      netFlow24hPct,
      reason: `Moderate outflow (${netFlow24hPct.toFixed(0)}% in 24h)`,
    };
  }

  // Step 4: Default to LOW
  return {
    level: 'low',
    utilization,
    netFlow24hPct,
    reason: 'Pool is stable',
  };
}
```

### 5.3 Thresholds Table

| Level | Utilization | OR | Net Flow 24h |
|-------|-------------|-----|--------------|
| `high` | > 60% | OR | < -20% |
| `medium` | > 30% | OR | < -10% |
| `low` | ≤ 30% | AND | ≥ -10% |

### 5.4 Example Calculations

| Utilization | Net Flow | Result | Reason |
|-------------|----------|--------|--------|
| 65% | +5% | HIGH | High utilization (65%) |
| 25% | -25% | HIGH | Large outflow (-25% in 24h) |
| 45% | +2% | MEDIUM | Moderate utilization (45%) |
| 20% | -15% | MEDIUM | Moderate outflow (-15% in 24h) |
| 25% | +3% | LOW | Pool is stable |

---

## 6. Impact Calculation

### 6.1 Slippage Factors by Bridge

```typescript
const SLIPPAGE_FACTORS: Record<string, number> = {
  across: 0.5,      // Intent-based, relayers absorb slippage
  stargate: 1.0,    // Pool-based AMM
  cctp: 0.0,        // Burn/mint, no slippage
  wormhole: 0.1,    // Message-based
  layerzero: 0.1,   // Message-based
};
```

### 6.2 Inputs

| Input | Type | Description |
|-------|------|-------------|
| `transferAmountUsd` | number | Transfer amount in USD |
| `poolTvlUsd` | number | Pool TVL in USD |
| `bridge` | string | Bridge identifier |

### 6.3 Formula

```typescript
interface ImpactResult {
  poolSharePct: number;
  estimatedSlippageBps: number;
  impactLevel: 'negligible' | 'low' | 'moderate' | 'high' | 'severe';
  warning: string | null;
}

function calculateImpact(
  transferAmountUsd: number,
  poolTvlUsd: number,
  bridge: string
): ImpactResult {
  // Step 1: Calculate pool share
  const poolSharePct = poolTvlUsd > 0
    ? (transferAmountUsd / poolTvlUsd) * 100
    : 100;

  // Step 2: Calculate estimated slippage
  const slippageFactor = SLIPPAGE_FACTORS[bridge] ?? 1.0;
  const estimatedSlippageBps = poolSharePct * slippageFactor * 10;

  // Step 3: Determine impact level and warning
  let impactLevel: ImpactResult['impactLevel'];
  let warning: string | null = null;

  if (poolSharePct < 1) {
    impactLevel = 'negligible';
  } else if (poolSharePct < 5) {
    impactLevel = 'low';
  } else if (poolSharePct < 15) {
    impactLevel = 'moderate';
    warning = `Your transfer is ${poolSharePct.toFixed(1)}% of pool liquidity`;
  } else if (poolSharePct < 30) {
    impactLevel = 'high';
    warning = `Large transfer: ${poolSharePct.toFixed(1)}% of pool. Consider splitting.`;
  } else {
    impactLevel = 'severe';
    warning = `Transfer exceeds safe threshold (${poolSharePct.toFixed(1)}% of pool). Split recommended.`;
  }

  return {
    poolSharePct: Math.round(poolSharePct * 100) / 100,
    estimatedSlippageBps: Math.round(estimatedSlippageBps * 10) / 10,
    impactLevel,
    warning,
  };
}
```

### 6.4 Impact Level Thresholds

| Level | Pool Share % | Warning |
|-------|-------------|---------|
| `negligible` | < 1% | None |
| `low` | 1% - 4.99% | None |
| `moderate` | 5% - 14.99% | "Your transfer is X% of pool liquidity" |
| `high` | 15% - 29.99% | "Large transfer: X% of pool. Consider splitting." |
| `severe` | ≥ 30% | "Transfer exceeds safe threshold. Split recommended." |

### 6.5 Slippage Formula

```
estimatedSlippageBps = poolSharePct × slippageFactor × 10
```

### 6.6 Example Calculations

| Amount | Pool TVL | Bridge | Pool Share | Slippage | Level |
|--------|----------|--------|------------|----------|-------|
| $50K | $10M | across | 0.5% | 0.25 bps | negligible |
| $500K | $10M | across | 5% | 2.5 bps | moderate |
| $500K | $10M | stargate | 5% | 5.0 bps | moderate |
| $3M | $10M | across | 30% | 15.0 bps | severe |
| $1M | $10M | cctp | 10% | 0 bps | moderate |

**⚠️ DISCLAIMER (must always be shown):**
> "Directional estimate only. Not an execution guarantee."

---

## 7. Liquidity Flight Velocity (LFV)

### 7.1 Definition

LFV measures the rate of net stablecoin liquidity change across monitored bridge pools per chain.

### 7.2 Inputs

| Input | Type | Description |
|-------|------|-------------|
| `chain` | string | Chain to calculate LFV for |
| `timeWindowHours` | number | Time window (default: 24) |

### 7.3 Formula

```typescript
interface LFVResult {
  chain: string;
  lfv24h: number;           // Decimal rate (-0.10 = -10%)
  lfvAnnualized: number;    // Projected annual rate
  interpretation: LFVInterpretation;
  netFlowUsd: number;
  tvlStartUsd: number;
  tvlNowUsd: number;
  poolsMonitored: number;
}

async function calculateLFV(
  chain: string,
  timeWindowHours: number = 24
): Promise<LFVResult> {
  // Step 1: Get stablecoin pools for chain
  const pools = await getStablecoinPools(chain); // USDC, USDT, DAI
  
  // Step 2: Get TVL at start and end of window
  const tvlStart = await getTvlAtTime(pools, hoursAgo(timeWindowHours));
  const tvlNow = await getCurrentTvl(pools);
  
  // Step 3: Calculate net flow
  const netFlow = tvlNow - tvlStart;
  
  // Step 4: Calculate LFV
  if (tvlStart === 0) {
    return { chain, lfv24h: 0, lfvAnnualized: 0, interpretation: 'stable', ... };
  }
  
  const lfv = netFlow / tvlStart;
  const lfv24h = lfv * (24 / timeWindowHours);  // Normalize to 24h
  const lfvAnnualized = lfv24h * 365;
  
  // Step 5: Interpret
  const interpretation = interpretLFV(lfv24h);
  
  return {
    chain,
    lfv24h,
    lfvAnnualized,
    interpretation,
    netFlowUsd: netFlow,
    tvlStartUsd: tvlStart,
    tvlNowUsd: tvlNow,
    poolsMonitored: pools.length,
  };
}
```

### 7.4 Core Formulas

```
netFlow = tvlNow - tvlStart

lfv = netFlow / tvlStart

lfv24h = lfv × (24 / timeWindowHours)

lfvAnnualized = lfv24h × 365
```

### 7.5 Interpretation Thresholds

```typescript
function interpretLFV(lfv24h: number): LFVInterpretation {
  if (lfv24h < -0.10) return 'rapid_flight';      // < -10%
  if (lfv24h < -0.03) return 'moderate_outflow';  // -10% to -3%
  if (lfv24h < 0.03) return 'stable';             // -3% to +3%
  if (lfv24h < 0.10) return 'moderate_inflow';    // +3% to +10%
  return 'rapid_inflow';                           // > +10%
}
```

### 7.6 Thresholds Table

| Interpretation | LFV 24h Range | Alert |
|----------------|---------------|-------|
| `rapid_flight` | < -10% | 🔴 Yes |
| `moderate_outflow` | -10% to -3% | No |
| `stable` | -3% to +3% | No |
| `moderate_inflow` | +3% to +10% | No |
| `rapid_inflow` | > +10% | No |

### 7.7 Example Calculations

| Chain | TVL Start | TVL Now | Net Flow | LFV 24h | Interpretation |
|-------|-----------|---------|----------|---------|----------------|
| Ethereum | $100M | $102M | +$2M | +2% | stable |
| Base | $50M | $42M | -$8M | -16% | rapid_flight 🔴 |
| Arbitrum | $80M | $76M | -$4M | -5% | moderate_outflow |
| Optimism | $60M | $66M | +$6M | +10% | moderate_inflow |

---

## 8. Corridor Health Status

### 8.1 Inputs

| Input | Type | Description |
|-------|------|-------------|
| `successRate1h` | number (0-100) | Success rate in last hour |
| `currentP90` | number | Current p90 latency (seconds) |
| `historicalP90` | number | 7-day historical p90 (seconds) |
| `transferCount1h` | number | Transfers in last hour |

### 8.2 Formula

```typescript
function calculateHealthStatus(
  successRate1h: number,
  currentP90: number,
  historicalP90: number,
  transferCount1h: number
): HealthStatus {
  const latencyMultiplier = historicalP90 > 0 ? currentP90 / historicalP90 : 1;

  // DOWN conditions (check first)
  if (successRate1h < 95) return 'down';
  if (latencyMultiplier > 5) return 'down';
  if (transferCount1h === 0) return 'down';

  // DEGRADED conditions
  if (successRate1h < 99) return 'degraded';
  if (latencyMultiplier > 2) return 'degraded';

  // HEALTHY (default)
  return 'healthy';
}
```

### 8.3 Thresholds Table

| Status | Success Rate | OR | Latency | OR | Volume |
|--------|-------------|-----|---------|-----|--------|
| `down` | < 95% | OR | > 5x normal | OR | 0 transfers/hr |
| `degraded` | 95-98.99% | OR | 2-5x normal | | |
| `healthy` | ≥ 99% | AND | ≤ 2x normal | AND | > 0 transfers |

### 8.4 Latency Multiplier

```
latencyMultiplier = currentP90 / historicalP90
```

---

## 9. Anomaly Detection

### 9.1 Latency Spike Detection

```typescript
const LATENCY_SPIKE_MULTIPLIER = 3; // 3x normal = spike

function detectLatencySpike(
  currentP90: number,
  historicalP90: number
): boolean {
  return currentP90 > historicalP90 * LATENCY_SPIKE_MULTIPLIER;
}
```

**Threshold:** Current p90 > 3× historical p90

### 9.2 Failure Cluster Detection

```typescript
const FAILURE_RATE_THRESHOLD = 10; // 10% failure rate

function detectFailureCluster(
  failedCount: number,
  totalCount: number
): boolean {
  if (totalCount === 0) return false;
  const failureRate = (failedCount / totalCount) * 100;
  return failureRate > FAILURE_RATE_THRESHOLD;
}
```

**Threshold:** Failure rate > 10% in last hour

### 9.3 Liquidity Drop Detection

```typescript
const LIQUIDITY_DROP_THRESHOLD = 15; // 15% drop

function detectLiquidityDrop(
  tvlNow: number,
  tvl24hAgo: number
): boolean {
  if (tvl24hAgo === 0) return false;
  const dropPct = ((tvl24hAgo - tvlNow) / tvl24hAgo) * 100;
  return dropPct > LIQUIDITY_DROP_THRESHOLD;
}
```

**Threshold:** TVL drop > 15% in 24 hours

### 9.4 Anomaly Severity Assignment

| Anomaly Type | Low | Medium | High |
|--------------|-----|--------|------|
| Latency Spike | 3-5x | 5-10x | > 10x |
| Failure Cluster | 10-20% | 20-40% | > 40% |
| Liquidity Drop | 15-25% | 25-40% | > 40% |
| Stuck Transfer | < $100K | $100K-$1M | > $1M |

---

## 10. Percentile Calculations

### 10.1 p50 (Median) and p90

```typescript
function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  
  const sorted = [...values].sort((a, b) => a - b);
  const index = (percentile / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  
  if (lower === upper) return sorted[lower];
  
  // Linear interpolation
  const fraction = index - lower;
  return sorted[lower] + (sorted[upper] - sorted[lower]) * fraction;
}

// Usage
const p50 = calculatePercentile(durations, 50);
const p90 = calculatePercentile(durations, 90);
```

### 10.2 Success Rate

```typescript
function calculateSuccessRate(
  completed: number,
  failed: number,
  stuck: number
): number {
  const total = completed + failed + stuck;
  if (total === 0) return 100;
  return (completed / total) * 100;
}
```

---

## 11. Time Windows

### 11.1 Standard Windows

| Window | Seconds | Usage |
|--------|---------|-------|
| 1 hour | 3600 | Health metrics, anomaly detection |
| 24 hours | 86400 | LFV, daily stats |
| 7 days | 604800 | Historical baseline |

### 11.2 Cron Schedules

| Job | Interval | Purpose |
|-----|----------|---------|
| Stuck Detector | Every 1 minute | Mark stuck transfers |
| Pool Snapshots | Every 5 minutes | Capture TVL |
| Anomaly Detector | Every 15 minutes | Scan for anomalies |

---

## 12. API Response Rounding

### 12.1 Precision Rules

| Field | Precision | Example |
|-------|-----------|---------|
| `poolSharePct` | 2 decimals | 5.88 |
| `estimatedSlippageBps` | 1 decimal | 2.9 |
| `successRate` | 1 decimal | 99.8 |
| `lfv24h` | 3 decimals | -0.082 |
| `utilization` | 0 decimals | 23 |
| `durationSeconds` | 0 decimals | 210 |
| `amountUsd` | 0 decimals | 5000000 |

---

## 13. Transfer ID Formats

### 13.1 By Bridge

| Bridge | Format | Example |
|--------|--------|---------|
| Across | `{originChainId}_{depositId}` | `1_12345` |
| CCTP | `{sourceDomain}_{nonce}` | `0_67890` |
| Stargate | `{chainId}_{txHash}` | `1_0xabc...` |

### 13.2 Corridor ID Format

```
{bridge}_{sourceChain}_{destChain}
```

Example: `across_ethereum_arbitrum`