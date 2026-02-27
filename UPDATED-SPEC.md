# SCOUT PHASE 0 BUILD SPEC

## Corridor Scouts: Build Specification

*The minimum viable system to start collecting data and building reputation.*

**Version 1.0 | February 2026**

---

## What We're Building

A public dashboard that shows real-time cross-chain corridor health, plus the infrastructure to collect the data that becomes our moat.

**Public outputs:**
- Dashboard at corridorscout.com (or similar)
- Open source repo for reputation
- API for developers

**Hidden value:**
- Data collection for future structural metrics
- Validation of demand
- Inbound conversations

---

## North Star (Context)

We're solving structural liquidity fragmentation. But we can't start there — we need data first.

**Phase 0 is the wedge:**
- Collect flow data across bridges
- Expose useful health metrics publicly
- Build reputation and credibility
- Validate demand

**What we expose:** Corridor health, settlement times, fragility, impact preview, liquidity flight velocity

**What we collect (for later):** Everything needed to compute structural metrics in Phase 1+

---

## System Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                           SCOUT SYSTEM                                │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐        │
│  │ Across  │ │  CCTP   │ │Stargate │ │Wormhole │ │LayerZero│        │
│  │  Scout  │ │  Scout  │ │  Scout  │ │  Scout  │ │  Scout  │        │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘        │
│       └───────────┴─────┬─────┴───────────┴───────────┘              │
│                         │                                             │
│                         ▼                                             │
│                ┌─────────────────┐                                   │
│                │   Event Queue   │                                   │
│                │    (Redis)      │                                   │
│                └────────┬────────┘                                   │
│                         │                                             │
│          ┌──────────────┼──────────────┐                             │
│          │              │              │                             │
│          ▼              ▼              ▼                             │
│   ┌───────────┐  ┌───────────┐  ┌───────────┐                       │
│   │ Transfer  │  │   Pool    │  │ Fragility │                       │
│   │ Processor │  │ Processor │  │ Calculator│                       │
│   └─────┬─────┘  └─────┬─────┘  └─────┬─────┘                       │
│         └──────────────┼──────────────┘                              │
│                        │                                              │
│                        ▼                                              │
│               ┌─────────────────┐                                    │
│               │    Database     │                                    │
│               │  (PostgreSQL)   │                                    │
│               └────────┬────────┘                                    │
│                        │                                              │
│                        ▼                                              │
│               ┌─────────────────┐                                    │
│               │    REST API     │                                    │
│               │   + WebSocket   │                                    │
│               └────────┬────────┘                                    │
│                        │                                              │
│                        ▼                                              │
│               ┌─────────────────┐                                    │
│               │    Dashboard    │                                    │
│               │   (Next.js)     │                                    │
│               └─────────────────┘                                    │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Data Model

### Transfers Table

```sql
CREATE TABLE transfers (
    id BIGSERIAL PRIMARY KEY,
    transfer_id TEXT NOT NULL,
    bridge TEXT NOT NULL,              -- 'across', 'cctp', 'stargate', etc.
    source_chain TEXT NOT NULL,
    dest_chain TEXT NOT NULL,
    asset TEXT NOT NULL,               -- 'USDC', 'USDT', 'ETH', etc.
    amount NUMERIC NOT NULL,
    amount_usd NUMERIC,
    initiated_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    duration_seconds INTEGER,
    status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'completed', 'failed', 'stuck'
    tx_hash_source TEXT,
    tx_hash_dest TEXT,
    block_initiated BIGINT,
    block_completed BIGINT,
    
    -- Structural data (collect now, use later)
    gas_price_gwei NUMERIC,
    transfer_size_bucket TEXT,         -- 'small', 'medium', 'large', 'whale'
    hour_of_day INTEGER,               -- 0-23 UTC
    day_of_week INTEGER,               -- 0-6
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_transfers_corridor ON transfers (bridge, source_chain, dest_chain, initiated_at DESC);
CREATE INDEX idx_transfers_status ON transfers (status) WHERE status = 'pending';
CREATE INDEX idx_transfers_bridge ON transfers (bridge, initiated_at DESC);
```

### Pool Snapshots Table

```sql
CREATE TABLE pool_snapshots (
    id BIGSERIAL PRIMARY KEY,
    pool_id TEXT NOT NULL,
    bridge TEXT NOT NULL,
    chain TEXT NOT NULL,
    asset TEXT NOT NULL,
    tvl NUMERIC NOT NULL,
    tvl_usd NUMERIC,
    available_liquidity NUMERIC,
    utilization NUMERIC,               -- 0-100
    recorded_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_pool_snapshots_pool ON pool_snapshots (pool_id, recorded_at DESC);
CREATE INDEX idx_pool_snapshots_chain ON pool_snapshots (chain, recorded_at DESC);
```

### Anomalies Table

```sql
CREATE TABLE anomalies (
    id BIGSERIAL PRIMARY KEY,
    anomaly_type TEXT NOT NULL,        -- 'latency_spike', 'failure_cluster', 'liquidity_drop'
    corridor_id TEXT NOT NULL,
    bridge TEXT NOT NULL,
    source_chain TEXT,
    dest_chain TEXT,
    severity TEXT NOT NULL,            -- 'low', 'medium', 'high'
    detected_at TIMESTAMPTZ NOT NULL,
    resolved_at TIMESTAMPTZ,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_anomalies_active ON anomalies (corridor_id) WHERE resolved_at IS NULL;
```

---

## Bridge Scouts

### Start with Across (Week 1-2)

Across has the best documentation and highest volume. Start here.

**Contract:** `SpokePool` on each chain

**Events to watch:**

```typescript
// Deposit initiated
event V3FundsDeposited(
    address inputToken,
    address outputToken,
    uint256 inputAmount,
    uint256 outputAmount,
    uint256 indexed destinationChainId,
    uint32 indexed depositId,
    uint32 quoteTimestamp,
    uint32 fillDeadline,
    uint32 exclusivityDeadline,
    address indexed depositor,
    address recipient,
    address exclusiveRelayer,
    bytes message
);

// Deposit filled (completed)
event FilledV3Relay(
    address inputToken,
    address outputToken,
    uint256 inputAmount,
    uint256 outputAmount,
    uint256 repaymentChainId,
    uint256 indexed originChainId,
    uint32 indexed depositId,
    uint32 fillDeadline,
    uint32 exclusivityDeadline,
    address exclusiveRelayer,
    address indexed relayer,
    address depositor,
    address recipient,
    bytes message,
    V3RelayExecutionEventInfo relayExecutionInfo
);
```

**Chains:** Ethereum, Arbitrum, Optimism, Base, Polygon

**SpokePool addresses:**
- Ethereum: `0x5c7BCd6E7De5423a257D81B442095A1a6ced35C5`
- Arbitrum: `0xe35e9842fceaCA96570B734083f4a58e8F7C5f2A`
- Optimism: `0x6f26Bf09B1C792e3228e5467807a900A503c0281`
- Base: `0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64`

### Add CCTP (Week 3)

**Contract:** `TokenMessenger` (source), `MessageTransmitter` (destination)

**Events:**
```typescript
// Burn initiated
event DepositForBurn(
    uint64 indexed nonce,
    address indexed burnToken,
    uint256 amount,
    address indexed depositor,
    bytes32 mintRecipient,
    uint32 destinationDomain,
    bytes32 destinationTokenMessenger,
    bytes32 destinationCaller
);

// Message received (completed)
event MessageReceived(
    address indexed caller,
    uint32 sourceDomain,
    uint64 indexed nonce,
    bytes32 sender,
    bytes messageBody
);
```

**Chains:** Ethereum, Arbitrum, Optimism, Base, Avalanche

### Add Stargate (Week 3)

**Contract:** `Router`, `Pool`

**Events:**
```typescript
event Swap(
    uint16 chainId,
    uint256 dstPoolId,
    address from,
    uint256 amountSD,
    uint256 eqReward,
    uint256 eqFee,
    uint256 protocolFee,
    uint256 lpFee
);
```

**Chains:** Ethereum, Arbitrum, Optimism, Avalanche, Polygon

---

## Core Processing Logic

### Transfer Processor

```typescript
// src/processors/transfer.ts

interface TransferEvent {
  type: 'initiation' | 'completion';
  transferId: string;
  bridge: string;
  sourceChain: string;
  destChain: string;
  asset: string;
  amount: bigint;
  amountUsd: number;
  timestamp: Date;
  txHash: string;
  blockNumber: number;
  gasPrice?: bigint;
}

class TransferProcessor {
  private pendingTransfers: Map<string, TransferEvent> = new Map();
  
  async processEvent(event: TransferEvent) {
    if (event.type === 'initiation') {
      await this.handleInitiation(event);
    } else {
      await this.handleCompletion(event);
    }
  }
  
  async handleInitiation(event: TransferEvent) {
    // Store in database
    await db.transfers.insert({
      transferId: event.transferId,
      bridge: event.bridge,
      sourceChain: event.sourceChain,
      destChain: event.destChain,
      asset: event.asset,
      amount: event.amount.toString(),
      amountUsd: event.amountUsd,
      initiatedAt: event.timestamp,
      status: 'pending',
      txHashSource: event.txHash,
      blockInitiated: event.blockNumber,
      gasPriceGwei: event.gasPrice ? Number(event.gasPrice / 1_000_000_000n) : null,
      transferSizeBucket: this.getSizeBucket(event.amountUsd),
      hourOfDay: event.timestamp.getUTCHours(),
      dayOfWeek: event.timestamp.getUTCDay(),
    });
    
    // Track in memory for fast matching
    this.pendingTransfers.set(event.transferId, event);
    
    // Publish to real-time stream
    await redis.publish('transfers:initiated', event);
  }
  
  async handleCompletion(event: TransferEvent) {
    const initiation = this.pendingTransfers.get(event.transferId);
    
    if (!initiation) {
      // Try to find in database
      const dbTransfer = await db.transfers.findByTransferId(event.transferId);
      if (!dbTransfer) {
        console.warn(`Completion without initiation: ${event.transferId}`);
        return;
      }
    }
    
    const initiatedAt = initiation?.timestamp || new Date();
    const durationSeconds = Math.floor(
      (event.timestamp.getTime() - initiatedAt.getTime()) / 1000
    );
    
    // Update in database
    await db.transfers.update(event.transferId, {
      completedAt: event.timestamp,
      durationSeconds,
      status: 'completed',
      txHashDest: event.txHash,
      blockCompleted: event.blockNumber,
    });
    
    // Remove from pending
    this.pendingTransfers.delete(event.transferId);
    
    // Publish to real-time stream
    await redis.publish('transfers:completed', {
      ...event,
      durationSeconds,
    });
  }
  
  getSizeBucket(amountUsd: number): string {
    if (amountUsd < 10_000) return 'small';
    if (amountUsd < 100_000) return 'medium';
    if (amountUsd < 1_000_000) return 'large';
    return 'whale';
  }
}
```

### Stuck Transfer Detector

```typescript
// src/jobs/stuck-detector.ts

const STUCK_THRESHOLDS: Record<string, number> = {
  across: 30 * 60,      // 30 minutes
  cctp: 45 * 60,        // 45 minutes
  stargate: 30 * 60,    // 30 minutes
  wormhole: 60 * 60,    // 60 minutes
  layerzero: 30 * 60,   // 30 minutes
};

async function detectStuckTransfers() {
  const now = new Date();
  
  for (const [bridge, thresholdSeconds] of Object.entries(STUCK_THRESHOLDS)) {
    const cutoff = new Date(now.getTime() - thresholdSeconds * 1000);
    
    const stuckTransfers = await db.transfers.findMany({
      where: {
        bridge,
        status: 'pending',
        initiatedAt: { lt: cutoff },
      },
    });
    
    for (const transfer of stuckTransfers) {
      await db.transfers.update(transfer.transferId, {
        status: 'stuck',
      });
      
      await createAnomaly({
        type: 'stuck_transfer',
        corridorId: `${transfer.bridge}_${transfer.sourceChain}_${transfer.destChain}`,
        bridge: transfer.bridge,
        sourceChain: transfer.sourceChain,
        destChain: transfer.destChain,
        severity: 'high',
        details: {
          transferId: transfer.transferId,
          pendingMinutes: Math.floor((now.getTime() - transfer.initiatedAt.getTime()) / 60000),
          amountUsd: transfer.amountUsd,
        },
      });
    }
  }
}

// Run every minute
setInterval(detectStuckTransfers, 60_000);
```

### Fragility Calculator

```typescript
// src/calculators/fragility.ts

type FragilityLevel = 'low' | 'medium' | 'high';

interface FragilityResult {
  level: FragilityLevel;
  utilization: number;
  netFlow24hPct: number;
  reason: string;
}

function calculateFragility(
  utilization: number,
  tvlUsd: number,
  netFlow24h: number
): FragilityResult {
  const netFlow24hPct = tvlUsd > 0 ? (netFlow24h / tvlUsd) * 100 : 0;
  
  // HIGH conditions
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
  
  // MEDIUM conditions
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
  
  // LOW (default)
  return {
    level: 'low',
    utilization,
    netFlow24hPct,
    reason: 'Pool is stable',
  };
}
```

### Liquidity Impact Calculator

```typescript
// src/calculators/impact.ts

interface ImpactResult {
  poolSharePct: number;
  estimatedSlippageBps: number;
  impactLevel: 'negligible' | 'low' | 'moderate' | 'high' | 'severe';
  warning: string | null;
}

const SLIPPAGE_FACTORS: Record<string, number> = {
  across: 0.5,     // Intent-based, lower slippage
  stargate: 1.0,   // Pool-based AMM
  cctp: 0.0,       // Burn/mint, no slippage
  wormhole: 0.1,   // Message-based
  layerzero: 0.1,  // Message-based
};

function calculateImpact(
  transferAmountUsd: number,
  poolTvlUsd: number,
  bridge: string
): ImpactResult {
  const poolSharePct = poolTvlUsd > 0 
    ? (transferAmountUsd / poolTvlUsd) * 100 
    : 100;
  
  const slippageFactor = SLIPPAGE_FACTORS[bridge] ?? 1.0;
  const estimatedSlippageBps = poolSharePct * slippageFactor * 10;
  
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

**⚠️ Slippage Disclaimer:** This is a heuristic, not a precise model. The UI must display: *"Directional estimate only. Not an execution guarantee."*

---

## Liquidity Flight Velocity (LFV)

The ONE structural metric we expose in Phase 0.

**Definition:** Net stablecoin liquidity change across monitored bridge pools per chain.

```typescript
// src/calculators/lfv.ts

interface LFVResult {
  chain: string;
  lfv24h: number;
  lfvAnnualized: number;
  interpretation: 'rapid_flight' | 'moderate_outflow' | 'stable' | 'moderate_inflow' | 'rapid_inflow';
  netFlowUsd: number;
  tvlStartUsd: number;
  tvlNowUsd: number;
  poolsMonitored: number;
}

async function calculateLFV(chain: string, timeWindowHours: number = 24): Promise<LFVResult> {
  // Get stablecoin pools we monitor on this chain
  const pools = await db.poolSnapshots.findMany({
    where: {
      chain,
      asset: { in: ['USDC', 'USDT', 'DAI'] },
    },
    orderBy: { recordedAt: 'desc' },
    distinct: ['poolId'],
  });
  
  const poolIds = pools.map(p => p.poolId);
  
  // Get TVL at start of window
  const startTime = new Date(Date.now() - timeWindowHours * 60 * 60 * 1000);
  
  const startSnapshots = await db.poolSnapshots.findMany({
    where: {
      poolId: { in: poolIds },
      recordedAt: { lte: startTime },
    },
    orderBy: { recordedAt: 'desc' },
    distinct: ['poolId'],
  });
  
  const tvlStart = startSnapshots.reduce((sum, s) => sum + (s.tvlUsd || 0), 0);
  const tvlNow = pools.reduce((sum, p) => sum + (p.tvlUsd || 0), 0);
  const netFlow = tvlNow - tvlStart;
  
  if (tvlStart === 0) {
    return {
      chain,
      lfv24h: 0,
      lfvAnnualized: 0,
      interpretation: 'stable',
      netFlowUsd: 0,
      tvlStartUsd: 0,
      tvlNowUsd: tvlNow,
      poolsMonitored: poolIds.length,
    };
  }
  
  const lfv24h = (netFlow / tvlStart) * (24 / timeWindowHours);
  const lfvAnnualized = lfv24h * 365;
  
  let interpretation: LFVResult['interpretation'];
  if (lfv24h < -0.10) {
    interpretation = 'rapid_flight';
  } else if (lfv24h < -0.03) {
    interpretation = 'moderate_outflow';
  } else if (lfv24h < 0.03) {
    interpretation = 'stable';
  } else if (lfv24h < 0.10) {
    interpretation = 'moderate_inflow';
  } else {
    interpretation = 'rapid_inflow';
  }
  
  return {
    chain,
    lfv24h,
    lfvAnnualized,
    interpretation,
    netFlowUsd: netFlow,
    tvlStartUsd: tvlStart,
    tvlNowUsd: tvlNow,
    poolsMonitored: poolIds.length,
  };
}
```

---

## API Endpoints

### GET /api/health

System overview.

```json
{
  "status": "operational",
  "corridorsMonitored": 47,
  "corridorsHealthy": 44,
  "corridorsDegraded": 2,
  "corridorsDown": 1,
  "transfers24h": 15234,
  "successRate24h": 98.7,
  "activeAnomalies": 2,
  "updatedAt": "2026-02-21T14:35:00Z"
}
```

### GET /api/flight

Liquidity Flight Velocity by chain.

```json
{
  "chains": [
    {
      "chain": "ethereum",
      "lfv24h": 0.021,
      "interpretation": "stable",
      "netFlowUsd": 125000000
    },
    {
      "chain": "base",
      "lfv24h": -0.082,
      "interpretation": "rapid_flight",
      "netFlowUsd": -45000000,
      "alert": true
    }
  ],
  "updatedAt": "2026-02-21T14:35:00Z"
}
```

### GET /api/corridors

All corridors with health metrics.

```json
{
  "corridors": [
    {
      "corridorId": "across_ethereum_arbitrum",
      "bridge": "across",
      "sourceChain": "ethereum",
      "destChain": "arbitrum",
      "status": "healthy",
      "metrics": {
        "transferCount1h": 47,
        "successRate1h": 100,
        "p50DurationSeconds": 210,
        "p90DurationSeconds": 372
      },
      "pool": {
        "tvlUsd": 85000000,
        "utilization": 23,
        "fragility": "low"
      },
      "lastTransferAt": "2026-02-21T14:34:12Z"
    }
  ]
}
```

### GET /api/corridors/:corridorId

Detailed corridor view.

### GET /api/impact/estimate

Liquidity impact calculator.

```
GET /api/impact/estimate?bridge=across&source=ethereum&dest=arbitrum&amountUsd=5000000
```

```json
{
  "corridorId": "across_ethereum_arbitrum",
  "transferAmountUsd": 5000000,
  "pool": {
    "tvlUsd": 85000000,
    "utilization": 23.5
  },
  "impact": {
    "poolSharePct": 5.9,
    "estimatedSlippageBps": 3.0,
    "impactLevel": "low",
    "warning": null
  },
  "fragility": {
    "current": "low"
  },
  "corridorHealth": {
    "status": "healthy",
    "p50DurationSeconds": 210,
    "successRate1h": 100
  },
  "disclaimer": "Directional estimate only. Not an execution guarantee."
}
```

### GET /api/anomalies

Active and recent anomalies.

---

## Dashboard UI

### Main Page

```
┌─────────────────────────────────────────────────────────────────┐
│  CORRIDOR SCOUT                                       [Live ●]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐                   │
│  │   47   │ │   44   │ │    2   │ │    1   │                   │
│  │Corridors│ │Healthy │ │Degraded│ │  Down  │                   │
│  └────────┘ └────────┘ └────────┘ └────────┘                   │
│                                                                  │
│  LIQUIDITY FLIGHT (24h)                                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ ETH     [██████████████████████░░░░] +2.1%    Stable     │  │
│  │ ARB     [████████████████████░░░░░░] -1.3%    Stable     │  │
│  │ BASE    [████████████░░░░░░░░░░░░░░] -8.2%    ⚠ Flight   │  │
│  │ OP      [██████████████████████░░░░] +0.8%    Stable     │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ⚠️ ACTIVE ALERTS                                          [2]  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 🔴 Stargate ETH→AVAX  Latency 6.9x normal               │  │
│  │ 🟡 BASE liquidity flight: -8.2% in 24h                   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  IMPACT CALCULATOR                                              │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Move [$5,000,000] via [Across ▼] from [ETH ▼] to [ARB ▼]│  │
│  │                    [Check Impact]                         │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  CORRIDORS                                                       │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Bridge   │ Route      │ Health │ p50  │ p90  │ Fragility │  │
│  ├──────────┼────────────┼────────┼──────┼──────┼───────────┤  │
│  │ Across   │ ETH → ARB  │   ●    │ 3.5m │ 6.2m │   Low     │  │
│  │ Across   │ ETH → OP   │   ●    │ 3.8m │ 7.1m │   Low     │  │
│  │ CCTP     │ ETH → BASE │   ●    │  11m │  16m │   Low     │  │
│  │ Stargate │ ETH → AVAX │   ◐    │  21m │  45m │   Med     │  │
│  └──────────┴────────────┴────────┴──────┴──────┴───────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Component | Technology | Why |
|-----------|------------|-----|
| Frontend | Next.js 14 + TypeScript | Fast, good DX, easy deploy |
| Styling | Tailwind CSS | Rapid iteration |
| Charts | Recharts | Simple, React-native |
| Backend | Next.js API routes | Keep it simple for Phase 0 |
| Database | PostgreSQL (Supabase or Neon) | Free tier, good enough |
| Cache | Upstash Redis | Serverless, free tier |
| RPC | Alchemy | Free tier for 5 chains |
| Hosting | Vercel | Free, automatic deploys |
| Cron | Vercel Cron or GitHub Actions | Free |

**Estimated cost:** $0-50/month

---

## File Structure

```
corridor-scouts/
├── README.md
├── package.json
├── .env.example
├── next.config.js
├── tailwind.config.js
│
├── src/
│   ├── app/
│   │   ├── page.tsx                    # Main dashboard
│   │   ├── corridors/
│   │   │   └── [id]/page.tsx           # Corridor detail
│   │   ├── api/
│   │   │   ├── health/route.ts
│   │   │   ├── flight/route.ts
│   │   │   ├── corridors/route.ts
│   │   │   ├── corridors/[id]/route.ts
│   │   │   ├── impact/estimate/route.ts
│   │   │   └── anomalies/route.ts
│   │   └── layout.tsx
│   │
│   ├── components/
│   │   ├── HealthSummary.tsx
│   │   ├── FlightVelocity.tsx
│   │   ├── AlertList.tsx
│   │   ├── ImpactCalculator.tsx
│   │   ├── CorridorTable.tsx
│   │   ├── FragilityBadge.tsx
│   │   └── StatusIndicator.tsx
│   │
│   ├── lib/
│   │   ├── db.ts                       # Database client
│   │   ├── redis.ts                    # Redis client
│   │   └── rpc.ts                      # RPC providers
│   │
│   ├── scouts/
│   │   ├── across.ts
│   │   ├── cctp.ts
│   │   └── stargate.ts
│   │
│   ├── processors/
│   │   ├── transfer.ts
│   │   └── pool.ts
│   │
│   ├── calculators/
│   │   ├── fragility.ts
│   │   ├── impact.ts
│   │   └── lfv.ts
│   │
│   └── jobs/
│       ├── stuck-detector.ts
│       ├── pool-snapshots.ts
│       └── anomaly-detector.ts
│
├── prisma/
│   └── schema.prisma
│
└── scripts/
    └── seed.ts
```

---

## Build Timeline

### Week 1-2: Foundation
- [ ] Set up Next.js project with Tailwind
- [ ] Set up database (Supabase or Neon)
- [ ] Create schema, run migrations
- [ ] Build Across scout (ETH → ARB only)
- [ ] Test transfer event capture

### Week 3: Core Scouts
- [ ] Add CCTP scout
- [ ] Add Stargate scout
- [ ] Build transfer processor
- [ ] Build pool snapshot collector
- [ ] Test on 3-5 corridors

### Week 4: Calculations
- [ ] Fragility calculator
- [ ] Impact calculator
- [ ] LFV calculator
- [ ] Anomaly detection (basic)

### Week 5: API
- [ ] Health endpoint
- [ ] Flight endpoint
- [ ] Corridors endpoints
- [ ] Impact estimate endpoint
- [ ] Anomalies endpoint

### Week 6: Dashboard
- [ ] Main dashboard page
- [ ] Health summary component
- [ ] LFV display
- [ ] Alert list
- [ ] Corridor table
- [ ] Impact calculator UI

### Week 7: Polish
- [ ] Corridor detail page
- [ ] Mobile responsive
- [ ] Error handling
- [ ] Loading states

### Week 8: Launch
- [ ] Deploy to Vercel
- [ ] Set up domain
- [ ] Open source the repo
- [ ] Announce on Twitter/Farcaster
- [ ] Start collecting feedback

---

## Data Integrity

### What Can Go Wrong

- **Missed events:** RPC rate limits, downtime
- **Incorrect matching:** Deposit matched to wrong fill
- **Reorgs:** Chain reorganization changes history
- **Duplicates:** Retry detection failure

### Mitigations

1. **Start with ONE bridge (Across)** — Get matching logic right before adding more
2. **Reconciliation job:** Daily compare our counts to on-chain events
3. **Alert on anomalies:** If we see way fewer transfers than expected, investigate
4. **Log unmatched completions:** Track completions we can't match for debugging

---

## Success Metrics (60 days)

| Metric | Target |
|--------|--------|
| Daily active users | 100+ |
| Weekly return rate | 30%+ |
| Impact calculations | 500+/week |
| GitHub stars | 50+ |
| Twitter followers | 500+ |
| Inbound conversations | 10+ |

---

## What This Enables

**Immediate:**
- Public reputation as "the corridor health guy"
- Data collection begins
- Validation of demand

**30 days:**
- Enough data to see patterns
- Users asking for features (signals what to build next)

**90 days:**
- Real dataset for structural metrics
- Potential paying customers identified
- Decision point: build Phase 1 or pivot

---

**— END OF BUILD SPEC —**