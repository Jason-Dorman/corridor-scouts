# System Specification
## Corridor Scout - Technical Architecture

**Version:** 1.0  
**Date:** February 2026

---

## 1. System Overview

### 1.1 High-Level Architecture

```
                                    ┌─────────────────────────────────────┐
                                    │           EXTERNAL CHAINS           │
                                    │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐  │
                                    │  │ ETH │ │ ARB │ │ OPT │ │BASE │  │
                                    │  └──┬──┘ └──┬──┘ └──┬──┘ └──┬──┘  │
                                    │     │      │      │      │       │
                                    └─────┼──────┼──────┼──────┼───────┘
                                          │      │      │      │
                                          ▼      ▼      ▼      ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                              CORRIDOR SCOUT SYSTEM                            │
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                           DATA INGESTION LAYER                          │ │
│  │                                                                         │ │
│  │    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐           │ │
│  │    │   ACROSS     │    │    CCTP      │    │  STARGATE    │           │ │
│  │    │    SCOUT     │    │    SCOUT     │    │    SCOUT     │           │ │
│  │    │              │    │              │    │              │           │ │
│  │    │ • ETH        │    │ • ETH        │    │ • ETH        │           │ │
│  │    │ • ARB        │    │ • ARB        │    │ • ARB        │           │ │
│  │    │ • OPT        │    │ • OPT        │    │ • OPT        │           │ │
│  │    │ • BASE       │    │ • BASE       │    │ • AVAX       │           │ │
│  │    │ • POLY       │    │ • AVAX       │    │ • POLY       │           │ │
│  │    └──────┬───────┘    └──────┬───────┘    └──────┬───────┘           │ │
│  │           │                   │                   │                    │ │
│  │           └───────────────────┼───────────────────┘                    │ │
│  │                               │                                        │ │
│  │                               ▼                                        │ │
│  │                    ┌────────────────────┐                             │ │
│  │                    │    EVENT QUEUE     │                             │ │
│  │                    │      (Redis)       │                             │ │
│  │                    │                    │                             │ │
│  │                    │ • transfer:init    │                             │ │
│  │                    │ • transfer:complete│                             │ │
│  │                    │ • pool:snapshot    │                             │ │
│  │                    └─────────┬──────────┘                             │ │
│  │                              │                                        │ │
│  └──────────────────────────────┼────────────────────────────────────────┘ │
│                                 │                                          │
│  ┌──────────────────────────────┼────────────────────────────────────────┐ │
│  │                    PROCESSING LAYER                                   │ │
│  │                              │                                        │ │
│  │    ┌─────────────────────────┼─────────────────────────┐             │ │
│  │    │                         ▼                         │             │ │
│  │    │  ┌──────────────────────────────────────────────┐│             │ │
│  │    │  │           TRANSFER PROCESSOR                 ││             │ │
│  │    │  │                                              ││             │ │
│  │    │  │  • Match initiations to completions          ││             │ │
│  │    │  │  • Calculate settlement duration             ││             │ │
│  │    │  │  • Classify by size bucket                   ││             │ │
│  │    │  │  • Update transfer status                    ││             │ │
│  │    │  └──────────────────────────────────────────────┘│             │ │
│  │    │                         │                         │             │ │
│  │    │  ┌──────────────────────┴──────────────────────┐ │             │ │
│  │    │  │                                             │ │             │ │
│  │    │  ▼                      ▼                      ▼ │             │ │
│  │    │ ┌────────────┐  ┌────────────┐  ┌────────────┐  │             │ │
│  │    │ │ FRAGILITY  │  │   IMPACT   │  │    LFV     │  │             │ │
│  │    │ │ CALCULATOR │  │ CALCULATOR │  │ CALCULATOR │  │             │ │
│  │    │ └────────────┘  └────────────┘  └────────────┘  │             │ │
│  │    │                                                  │             │ │
│  │    └──────────────────────────────────────────────────┘             │ │
│  │                              │                                        │ │
│  └──────────────────────────────┼────────────────────────────────────────┘ │
│                                 │                                          │
│  ┌──────────────────────────────┼────────────────────────────────────────┐ │
│  │                     STORAGE LAYER                                     │ │
│  │                              │                                        │ │
│  │                              ▼                                        │ │
│  │               ┌──────────────────────────────┐                       │ │
│  │               │      POSTGRESQL (Neon)       │                       │ │
│  │               │                              │                       │ │
│  │               │  ┌────────────────────────┐  │                       │ │
│  │               │  │      transfers         │  │                       │ │
│  │               │  ├────────────────────────┤  │                       │ │
│  │               │  │   pool_snapshots       │  │                       │ │
│  │               │  ├────────────────────────┤  │                       │ │
│  │               │  │      anomalies         │  │                       │ │
│  │               │  └────────────────────────┘  │                       │ │
│  │               │                              │                       │ │
│  │               └──────────────────────────────┘                       │ │
│  │                              │                                        │ │
│  └──────────────────────────────┼────────────────────────────────────────┘ │
│                                 │                                          │
│  ┌──────────────────────────────┼────────────────────────────────────────┐ │
│  │                      API LAYER                                        │ │
│  │                              │                                        │ │
│  │                              ▼                                        │ │
│  │               ┌──────────────────────────────┐                       │ │
│  │               │    Next.js API Routes        │                       │ │
│  │               │                              │                       │ │
│  │               │  GET /api/health             │                       │ │
│  │               │  GET /api/flight             │                       │ │
│  │               │  GET /api/corridors          │                       │ │
│  │               │  GET /api/corridors/:id      │                       │ │
│  │               │  GET /api/impact/estimate    │                       │ │
│  │               │  GET /api/anomalies          │                       │ │
│  │               │                              │                       │ │
│  │               └──────────────┬───────────────┘                       │ │
│  │                              │                                        │ │
│  │               ┌──────────────┴───────────────┐                       │ │
│  │               │     WebSocket Server         │                       │ │
│  │               │   (Real-time updates)        │                       │ │
│  │               └──────────────────────────────┘                       │ │
│  │                              │                                        │ │
│  └──────────────────────────────┼────────────────────────────────────────┘ │
│                                 │                                          │
│  ┌──────────────────────────────┼────────────────────────────────────────┐ │
│  │                  PRESENTATION LAYER                                   │ │
│  │                              │                                        │ │
│  │                              ▼                                        │ │
│  │               ┌──────────────────────────────┐                       │ │
│  │               │    Next.js Dashboard         │                       │ │
│  │               │                              │                       │ │
│  │               │  ┌────────────────────────┐  │                       │ │
│  │               │  │   HealthSummary        │  │                       │ │
│  │               │  │   FlightVelocity       │  │                       │ │
│  │               │  │   AlertList            │  │                       │ │
│  │               │  │   ImpactCalculator     │  │                       │ │
│  │               │  │   CorridorTable        │  │                       │ │
│  │               │  └────────────────────────┘  │                       │ │
│  │               │                              │                       │ │
│  │               └──────────────────────────────┘                       │ │
│  │                                                                       │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Data Flow Diagrams

### 2.1 Transfer Event Flow

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         TRANSFER EVENT FLOW                                   │
└──────────────────────────────────────────────────────────────────────────────┘

                    SOURCE CHAIN                    DESTINATION CHAIN
                         │                                │
                         │                                │
    ┌────────────────────▼────────────────────┐          │
    │         V3FundsDeposited Event          │          │
    │                                         │          │
    │  • depositId: 12345                     │          │
    │  • inputToken: USDC                     │          │
    │  • inputAmount: 10000000000             │          │
    │  • destinationChainId: 42161            │          │
    │  • depositor: 0xabc...                  │          │
    │  • fillDeadline: 1708534800             │          │
    └────────────────────┬────────────────────┘          │
                         │                                │
                         ▼                                │
              ┌─────────────────────┐                    │
              │    ACROSS SCOUT     │                    │
              │                     │                    │
              │  Parse event data   │                    │
              │  Create TransferID  │                    │
              │  Normalize amounts  │                    │
              └──────────┬──────────┘                    │
                         │                                │
                         ▼                                │
              ┌─────────────────────┐                    │
              │    Redis Queue      │                    │
              │                     │                    │
              │  Channel:           │                    │
              │  transfer:initiated │                    │
              └──────────┬──────────┘                    │
                         │                                │
                         ▼                                │
              ┌─────────────────────┐                    │
              │ TRANSFER PROCESSOR  │                    │
              │                     │                    │
              │  Insert to DB       │                    │
              │  Status: 'pending'  │                    │
              │  Add to pending map │                    │
              └──────────┬──────────┘                    │
                         │                                │
                         │                                │
                         │  ╔═══════════════════════╗    │
                         │  ║   TIME PASSES...      ║    │
                         │  ║   (~3-5 minutes)      ║    │
                         │  ╚═══════════════════════╝    │
                         │                                │
                         │    ┌───────────────────────────▼───────────────────┐
                         │    │         FilledV3Relay Event                   │
                         │    │                                               │
                         │    │  • depositId: 12345                           │
                         │    │  • originChainId: 1                           │
                         │    │  • relayer: 0xdef...                          │
                         │    │  • outputAmount: 9995000000                   │
                         │    └───────────────────────────┬───────────────────┘
                         │                                │
                         │                                ▼
                         │                     ┌─────────────────────┐
                         │                     │    ACROSS SCOUT     │
                         │                     │    (dest chain)     │
                         │                     └──────────┬──────────┘
                         │                                │
                         │                                ▼
                         │                     ┌─────────────────────┐
                         │                     │    Redis Queue      │
                         │                     │                     │
                         │                     │  Channel:           │
                         │                     │  transfer:completed │
                         │                     └──────────┬──────────┘
                         │                                │
                         └────────────────────────────────┤
                                                          │
                                                          ▼
                                              ┌─────────────────────┐
                                              │ TRANSFER PROCESSOR  │
                                              │                     │
                                              │  Match to pending   │
                                              │  Calculate duration │
                                              │  Update DB status   │
                                              │  Status: 'completed'│
                                              └──────────┬──────────┘
                                                          │
                                                          ▼
                                              ┌─────────────────────┐
                                              │     DATABASE        │
                                              │                     │
                                              │  transfers table:   │
                                              │  • completed_at SET │
                                              │  • duration: 210s   │
                                              │  • status: complete │
                                              └─────────────────────┘
```

### 2.2 Calculation Flow

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         CALCULATION FLOW                                      │
└──────────────────────────────────────────────────────────────────────────────┘

     ┌─────────────────────────────────────────────────────────────────────────┐
     │                        SCHEDULED TRIGGERS                                │
     │                                                                         │
     │    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐               │
     │    │  Every 1m   │    │  Every 5m   │    │ Every 15m   │               │
     │    │ Stuck Check │    │Pool Snapshot│    │ Anomaly Scan│               │
     │    └──────┬──────┘    └──────┬──────┘    └──────┬──────┘               │
     │           │                  │                  │                       │
     └───────────┼──────────────────┼──────────────────┼───────────────────────┘
                 │                  │                  │
                 ▼                  ▼                  ▼
     ┌───────────────────┐ ┌───────────────────┐ ┌───────────────────┐
     │   STUCK DETECTOR  │ │  POOL PROCESSOR   │ │ ANOMALY DETECTOR  │
     │                   │ │                   │ │                   │
     │ Query pending     │ │ Fetch on-chain    │ │ Query recent      │
     │ transfers older   │ │ pool TVL for      │ │ transfers for:    │
     │ than threshold    │ │ each bridge/chain │ │ • Latency spikes  │
     │                   │ │                   │ │ • Failure clusters│
     │ Mark as 'stuck'   │ │ Calculate         │ │ • Liquidity drops │
     │ Create anomaly    │ │ utilization       │ │                   │
     └─────────┬─────────┘ └─────────┬─────────┘ └─────────┬─────────┘
               │                     │                     │
               │                     ▼                     │
               │           ┌───────────────────┐           │
               │           │    FRAGILITY      │           │
               │           │   CALCULATOR      │           │
               │           │                   │           │
               │           │ Inputs:           │           │
               │           │ • utilization     │           │
               │           │ • tvl_usd         │           │
               │           │ • net_flow_24h    │           │
               │           │                   │           │
               │           │ Output:           │           │
               │           │ • level (L/M/H)   │           │
               │           │ • reason          │           │
               │           └─────────┬─────────┘           │
               │                     │                     │
               ▼                     ▼                     ▼
     ┌─────────────────────────────────────────────────────────────────┐
     │                         DATABASE                                 │
     │                                                                 │
     │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐       │
     │  │  transfers    │  │pool_snapshots │  │  anomalies    │       │
     │  │               │  │               │  │               │       │
     │  │ status:stuck  │  │ tvl, util,    │  │ type, sev,    │       │
     │  │               │  │ fragility     │  │ corridor_id   │       │
     │  └───────────────┘  └───────────────┘  └───────────────┘       │
     │                                                                 │
     └─────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
     ┌─────────────────────────────────────────────────────────────────┐
     │                     LFV CALCULATOR                              │
     │                  (On-demand for API)                            │
     │                                                                 │
     │  Input: chain (e.g., "base")                                   │
     │                                                                 │
     │  1. Get current pool snapshots for chain                       │
     │  2. Get snapshots from 24h ago                                 │
     │  3. Calculate: lfv = (tvl_now - tvl_start) / tvl_start         │
     │  4. Classify: rapid_flight | moderate_outflow | stable | ...   │
     │                                                                 │
     │  Output:                                                        │
     │  {                                                              │
     │    chain: "base",                                               │
     │    lfv24h: -0.082,                                             │
     │    interpretation: "rapid_flight",                             │
     │    netFlowUsd: -45000000                                       │
     │  }                                                              │
     └─────────────────────────────────────────────────────────────────┘
```

---

## 3. Database Schema

### 3.1 Entity Relationship Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        DATABASE SCHEMA                                        │
└──────────────────────────────────────────────────────────────────────────────┘

     ┌───────────────────────────────────────────────────────────────────────┐
     │                           TRANSFERS                                    │
     ├───────────────────────────────────────────────────────────────────────┤
     │  id              BIGSERIAL      PK                                    │
     │  transfer_id     TEXT           NOT NULL, UNIQUE                      │
     │  bridge          TEXT           NOT NULL   ──────┐                    │
     │  source_chain    TEXT           NOT NULL         │                    │
     │  dest_chain      TEXT           NOT NULL         │                    │
     │  asset           TEXT           NOT NULL         │                    │
     │  amount          NUMERIC        NOT NULL         │                    │
     │  amount_usd      NUMERIC                         │                    │
     │  initiated_at    TIMESTAMPTZ    NOT NULL         │                    │
     │  completed_at    TIMESTAMPTZ                     │                    │
     │  duration_seconds INTEGER                        │                    │
     │  status          TEXT           DEFAULT 'pending'│                    │
     │  tx_hash_source  TEXT                            │                    │
     │  tx_hash_dest    TEXT                            │                    │
     │  block_initiated BIGINT                          │                    │
     │  block_completed BIGINT                          │                    │
     │  gas_price_gwei  NUMERIC                         │                    │
     │  transfer_size   TEXT           -- bucket        │                    │
     │  hour_of_day     INTEGER        -- 0-23          │                    │
     │  day_of_week     INTEGER        -- 0-6           │                    │
     │  created_at      TIMESTAMPTZ    DEFAULT NOW()    │                    │
     │  updated_at      TIMESTAMPTZ    DEFAULT NOW()    │                    │
     │                                                   │                    │
     │  INDEXES:                                         │                    │
     │  • (bridge, source_chain, dest_chain, initiated_at DESC)              │
     │  • (status) WHERE status = 'pending'             │                    │
     │  • (bridge, initiated_at DESC)                   │                    │
     └───────────────────────────────────────────────────┼────────────────────┘
                                                         │
                                                         │ bridge
                                                         │
     ┌───────────────────────────────────────────────────┼────────────────────┐
     │                       POOL_SNAPSHOTS              │                    │
     ├───────────────────────────────────────────────────┼────────────────────┤
     │  id              BIGSERIAL      PK               │                    │
     │  pool_id         TEXT           NOT NULL   ◄─────┘                    │
     │  bridge          TEXT           NOT NULL                              │
     │  chain           TEXT           NOT NULL                              │
     │  asset           TEXT           NOT NULL                              │
     │  tvl             NUMERIC        NOT NULL                              │
     │  tvl_usd         NUMERIC                                              │
     │  available_liq   NUMERIC                                              │
     │  utilization     NUMERIC        -- 0-100                              │
     │  recorded_at     TIMESTAMPTZ    NOT NULL                              │
     │                                                                       │
     │  INDEXES:                                                             │
     │  • (pool_id, recorded_at DESC)                                        │
     │  • (chain, recorded_at DESC)                                          │
     └───────────────────────────────────────────────────────────────────────┘


     ┌───────────────────────────────────────────────────────────────────────┐
     │                          ANOMALIES                                    │
     ├───────────────────────────────────────────────────────────────────────┤
     │  id              BIGSERIAL      PK                                    │
     │  anomaly_type    TEXT           NOT NULL                              │
     │                                  -- 'latency_spike'                   │
     │                                  -- 'failure_cluster'                 │
     │                                  -- 'liquidity_drop'                  │
     │                                  -- 'stuck_transfer'                  │
     │  corridor_id     TEXT           NOT NULL                              │
     │  bridge          TEXT           NOT NULL                              │
     │  source_chain    TEXT                                                 │
     │  dest_chain      TEXT                                                 │
     │  severity        TEXT           NOT NULL                              │
     │                                  -- 'low' | 'medium' | 'high'         │
     │  detected_at     TIMESTAMPTZ    NOT NULL                              │
     │  resolved_at     TIMESTAMPTZ                                          │
     │  details         JSONB                                                │
     │  created_at      TIMESTAMPTZ    DEFAULT NOW()                         │
     │                                                                       │
     │  INDEXES:                                                             │
     │  • (corridor_id) WHERE resolved_at IS NULL                            │
     │  • (detected_at DESC)                                                 │
     └───────────────────────────────────────────────────────────────────────┘
```

### 3.2 Prisma Schema

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Transfer {
  id               BigInt    @id @default(autoincrement())
  transferId       String    @unique @map("transfer_id")
  bridge           String
  sourceChain      String    @map("source_chain")
  destChain        String    @map("dest_chain")
  asset            String
  amount           Decimal
  amountUsd        Decimal?  @map("amount_usd")
  initiatedAt      DateTime  @map("initiated_at")
  completedAt      DateTime? @map("completed_at")
  durationSeconds  Int?      @map("duration_seconds")
  status           String    @default("pending")
  txHashSource     String?   @map("tx_hash_source")
  txHashDest       String?   @map("tx_hash_dest")
  blockInitiated   BigInt?   @map("block_initiated")
  blockCompleted   BigInt?   @map("block_completed")
  gasPriceGwei     Decimal?  @map("gas_price_gwei")
  transferSizeBucket String? @map("transfer_size_bucket")
  hourOfDay        Int?      @map("hour_of_day")
  dayOfWeek        Int?      @map("day_of_week")
  createdAt        DateTime  @default(now()) @map("created_at")
  updatedAt        DateTime  @updatedAt @map("updated_at")

  @@index([bridge, sourceChain, destChain, initiatedAt(sort: Desc)], name: "idx_transfers_corridor")
  @@index([status], name: "idx_transfers_pending")
  @@index([bridge, initiatedAt(sort: Desc)], name: "idx_transfers_bridge")
  @@map("transfers")
}

model PoolSnapshot {
  id                BigInt   @id @default(autoincrement())
  poolId            String   @map("pool_id")
  bridge            String
  chain             String
  asset             String
  tvl               Decimal
  tvlUsd            Decimal? @map("tvl_usd")
  availableLiquidity Decimal? @map("available_liquidity")
  utilization       Decimal?
  recordedAt        DateTime @map("recorded_at")

  @@index([poolId, recordedAt(sort: Desc)], name: "idx_pool_snapshots_pool")
  @@index([chain, recordedAt(sort: Desc)], name: "idx_pool_snapshots_chain")
  @@map("pool_snapshots")
}

model Anomaly {
  id           BigInt    @id @default(autoincrement())
  anomalyType  String    @map("anomaly_type")
  corridorId   String    @map("corridor_id")
  bridge       String
  sourceChain  String?   @map("source_chain")
  destChain    String?   @map("dest_chain")
  severity     String
  detectedAt   DateTime  @map("detected_at")
  resolvedAt   DateTime? @map("resolved_at")
  details      Json?
  createdAt    DateTime  @default(now()) @map("created_at")

  @@index([corridorId], name: "idx_anomalies_active")
  @@index([detectedAt(sort: Desc)], name: "idx_anomalies_time")
  @@map("anomalies")
}
```

---

## 4. Component Architecture

### 4.1 Scout Component Pattern

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         SCOUT ARCHITECTURE                                    │
└──────────────────────────────────────────────────────────────────────────────┘

                         ┌─────────────────────────────┐
                         │       BaseScout             │
                         │        (Abstract)           │
                         ├─────────────────────────────┤
                         │                             │
                         │  Properties:                │
                         │  - rpcProvider: Provider    │
                         │  - redis: RedisClient       │
                         │  - chains: ChainConfig[]    │
                         │  - isRunning: boolean       │
                         │                             │
                         │  Abstract Methods:          │
                         │  - start(): Promise<void>   │
                         │  - stop(): Promise<void>    │
                         │  - parseEvent(log): Event   │
                         │                             │
                         │  Protected Methods:         │
                         │  - emit(event): void        │
                         │  - getTransferId(): string  │
                         │  - normalizeAmount(): bigint│
                         │                             │
                         └──────────────┬──────────────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    │                   │                   │
                    ▼                   ▼                   ▼
        ┌───────────────────┐ ┌───────────────────┐ ┌───────────────────┐
        │   AcrossScout     │ │    CCTPScout      │ │  StargateScout    │
        ├───────────────────┤ ├───────────────────┤ ├───────────────────┤
        │                   │ │                   │ │                   │
        │ Contract:         │ │ Contract:         │ │ Contract:         │
        │ SpokePool         │ │ TokenMessenger    │ │ Router            │
        │                   │ │ MessageTransmitter│ │ Pool              │
        │                   │ │                   │ │                   │
        │ Events:           │ │ Events:           │ │ Events:           │
        │ • V3FundsDeposited│ │ • DepositForBurn  │ │ • Swap            │
        │ • FilledV3Relay   │ │ • MessageReceived │ │                   │
        │                   │ │                   │ │                   │
        │ Chains:           │ │ Chains:           │ │ Chains:           │
        │ ETH,ARB,OPT,BASE  │ │ ETH,ARB,OPT,BASE  │ │ ETH,ARB,OPT,AVAX  │
        │                   │ │ AVAX              │ │ POLY              │
        │                   │ │                   │ │                   │
        │ TransferId:       │ │ TransferId:       │ │ TransferId:       │
        │ {origin}_{depId}  │ │ {source}_{nonce}  │ │ {chainId}_{txHash}│
        │                   │ │                   │ │                   │
        └───────────────────┘ └───────────────────┘ └───────────────────┘
```

### 4.2 API Route Structure

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         API ROUTE ARCHITECTURE                                │
└──────────────────────────────────────────────────────────────────────────────┘

    src/app/api/
    │
    ├── health/
    │   └── route.ts ──────────────────────────────────────────────────────────┐
    │                                                                          │
    │       GET /api/health                                                    │
    │       Response: {                                                        │
    │         status: "operational" | "degraded" | "down",                    │
    │         corridorsMonitored: number,                                      │
    │         corridorsHealthy: number,                                        │
    │         corridorsDegraded: number,                                       │
    │         corridorsDown: number,                                           │
    │         transfers24h: number,                                            │
    │         successRate24h: number,                                          │
    │         activeAnomalies: number,                                         │
    │         updatedAt: ISO8601                                               │
    │       }                                                                  │
    │                                                                          │
    ├── flight/                                                                │
    │   └── route.ts ──────────────────────────────────────────────────────────┤
    │                                                                          │
    │       GET /api/flight                                                    │
    │       Response: {                                                        │
    │         chains: [{                                                       │
    │           chain: string,                                                 │
    │           lfv24h: number,                                                │
    │           interpretation: LFVInterpretation,                             │
    │           netFlowUsd: number,                                            │
    │           alert?: boolean                                                │
    │         }],                                                              │
    │         updatedAt: ISO8601                                               │
    │       }                                                                  │
    │                                                                          │
    ├── corridors/                                                             │
    │   ├── route.ts ──────────────────────────────────────────────────────────┤
    │   │                                                                      │
    │   │   GET /api/corridors                                                 │
    │   │   Query: ?bridge=across&source=ethereum&status=healthy               │
    │   │   Response: { corridors: Corridor[] }                                │
    │   │                                                                      │
    │   └── [id]/                                                              │
    │       └── route.ts ──────────────────────────────────────────────────────┤
    │                                                                          │
    │           GET /api/corridors/:id                                         │
    │           Response: {                                                    │
    │             corridor: Corridor,                                          │
    │             recentTransfers: Transfer[],                                 │
    │             hourlyStats: HourlyStat[],                                   │
    │             anomalies: Anomaly[]                                         │
    │           }                                                              │
    │                                                                          │
    ├── impact/                                                                │
    │   └── estimate/                                                          │
    │       └── route.ts ──────────────────────────────────────────────────────┤
    │                                                                          │
    │           GET /api/impact/estimate                                       │
    │           Query: ?bridge=across&source=ethereum&dest=arbitrum            │
    │                  &amountUsd=5000000                                      │
    │           Response: {                                                    │
    │             corridorId: string,                                          │
    │             transferAmountUsd: number,                                   │
    │             pool: { tvlUsd, utilization },                               │
    │             impact: { poolSharePct, estimatedSlippageBps,                │
    │                       impactLevel, warning },                            │
    │             fragility: { current },                                      │
    │             corridorHealth: { status, p50, successRate1h },              │
    │             disclaimer: string                                           │
    │           }                                                              │
    │                                                                          │
    └── anomalies/                                                             │
        └── route.ts ──────────────────────────────────────────────────────────┘
    
            GET /api/anomalies
            Query: ?active=true&severity=high
            Response: { anomalies: Anomaly[] }
```

---

## 5. State Management

### 5.1 Client-Side Data Flow

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                      CLIENT-SIDE STATE MANAGEMENT                             │
└──────────────────────────────────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────────────────────────────┐
    │                         REACT QUERY / SWR                                │
    │                                                                         │
    │    ┌──────────────────────────────────────────────────────────────┐    │
    │    │                      QUERY KEYS                              │    │
    │    │                                                              │    │
    │    │  ['health']           → useHealth()                         │    │
    │    │  ['flight']           → useFlightVelocity()                 │    │
    │    │  ['corridors']        → useCorridors(filters)               │    │
    │    │  ['corridor', id]     → useCorridor(id)                     │    │
    │    │  ['anomalies']        → useAnomalies(filters)               │    │
    │    │                                                              │    │
    │    └──────────────────────────────────────────────────────────────┘    │
    │                                │                                        │
    │                                ▼                                        │
    │    ┌──────────────────────────────────────────────────────────────┐    │
    │    │                   CACHE CONFIGURATION                        │    │
    │    │                                                              │    │
    │    │  health:      staleTime: 30s,  refetchInterval: 30s        │    │
    │    │  flight:      staleTime: 60s,  refetchInterval: 60s        │    │
    │    │  corridors:   staleTime: 30s,  refetchInterval: 30s        │    │
    │    │  anomalies:   staleTime: 15s,  refetchInterval: 15s        │    │
    │    │                                                              │    │
    │    └──────────────────────────────────────────────────────────────┘    │
    │                                                                         │
    └─────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
    ┌─────────────────────────────────────────────────────────────────────────┐
    │                        WEBSOCKET LAYER                                   │
    │                      (Real-time Updates)                                │
    │                                                                         │
    │    Events:                                                              │
    │    • transfer:new       → Invalidate ['corridors']                     │
    │    • transfer:complete  → Invalidate ['corridors'], ['health']         │
    │    • anomaly:new        → Invalidate ['anomalies'], ['health']         │
    │    • anomaly:resolved   → Invalidate ['anomalies']                     │
    │                                                                         │
    └─────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
    ┌─────────────────────────────────────────────────────────────────────────┐
    │                       COMPONENT TREE                                     │
    │                                                                         │
    │    <Dashboard>                                                          │
    │      │                                                                  │
    │      ├── <HealthSummary />      ◄── useHealth()                        │
    │      │                                                                  │
    │      ├── <FlightVelocity />     ◄── useFlightVelocity()                │
    │      │                                                                  │
    │      ├── <AlertList />          ◄── useAnomalies({ active: true })     │
    │      │                                                                  │
    │      ├── <ImpactCalculator />   ◄── Local state + useMutation          │
    │      │                                                                  │
    │      └── <CorridorTable />      ◄── useCorridors()                     │
    │                                                                         │
    └─────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Deployment Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                       DEPLOYMENT ARCHITECTURE                                 │
└──────────────────────────────────────────────────────────────────────────────┘

                              ┌─────────────────┐
                              │    INTERNET     │
                              └────────┬────────┘
                                       │
                                       ▼
                              ┌─────────────────┐
                              │   Cloudflare    │
                              │      DNS        │
                              │ corridorscout.  │
                              │      com        │
                              └────────┬────────┘
                                       │
                                       ▼
    ┌──────────────────────────────────────────────────────────────────────────┐
    │                            VERCEL                                         │
    │                                                                          │
    │    ┌────────────────────────────────────────────────────────────────┐   │
    │    │                    EDGE NETWORK                                │   │
    │    │                                                                │   │
    │    │    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐   │   │
    │    │    │    Edge      │    │    Edge      │    │    Edge      │   │   │
    │    │    │   (US-East)  │    │   (EU-West)  │    │  (AP-Tokyo)  │   │   │
    │    │    └──────────────┘    └──────────────┘    └──────────────┘   │   │
    │    │                                                                │   │
    │    └────────────────────────────────────────────────────────────────┘   │
    │                                    │                                     │
    │                                    ▼                                     │
    │    ┌────────────────────────────────────────────────────────────────┐   │
    │    │                   SERVERLESS FUNCTIONS                         │   │
    │    │                                                                │   │
    │    │   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐     │   │
    │    │   │ /api/    │  │ /api/    │  │ /api/    │  │ /api/    │     │   │
    │    │   │ health   │  │ flight   │  │corridors │  │ impact   │     │   │
    │    │   └──────────┘  └──────────┘  └──────────┘  └──────────┘     │   │
    │    │                                                                │   │
    │    └────────────────────────────────────────────────────────────────┘   │
    │                                    │                                     │
    │    ┌────────────────────────────────────────────────────────────────┐   │
    │    │                      CRON JOBS                                 │   │
    │    │                                                                │   │
    │    │   ┌────────────────────┐    ┌────────────────────┐            │   │
    │    │   │ /api/cron/         │    │ /api/cron/         │            │   │
    │    │   │ pool-snapshots     │    │ stuck-detector     │            │   │
    │    │   │ (every 5 min)      │    │ (every 1 min)      │            │   │
    │    │   └────────────────────┘    └────────────────────┘            │   │
    │    │                                                                │   │
    │    └────────────────────────────────────────────────────────────────┘   │
    │                                                                          │
    └───────────────────────────────────────┬──────────────────────────────────┘
                                            │
                    ┌───────────────────────┼───────────────────────┐
                    │                       │                       │
                    ▼                       ▼                       ▼
         ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
         │      NEON       │    │    UPSTASH      │    │    ALCHEMY      │
         │   PostgreSQL    │    │     Redis       │    │      RPC        │
         │                 │    │                 │    │                 │
         │ • transfers     │    │ • Event queue   │    │ • ETH Mainnet   │
         │ • pool_snapshots│    │ • Pub/sub       │    │ • Arbitrum      │
         │ • anomalies     │    │ • Rate limiting │    │ • Optimism      │
         │                 │    │                 │    │ • Base          │
         │ Region: US-East │    │ Region: Global  │    │ • Polygon       │
         │                 │    │                 │    │                 │
         └─────────────────┘    └─────────────────┘    └─────────────────┘
```

---

## 7. Error Handling Strategy

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                      ERROR HANDLING STRATEGY                                  │
└──────────────────────────────────────────────────────────────────────────────┘

    ERROR TYPE              HANDLING                    USER IMPACT
    ─────────────────────────────────────────────────────────────────────────────
    
    RPC Timeout             Retry 3x with backoff       None (transparent)
         │                  Then skip event             
         │                  Log to error tracking       
         ▼                                              
    ┌─────────────┐                                     
    │   RETRY     │──────▶ Success? ──▶ Continue       
    │  MECHANISM  │                                     
    └──────┬──────┘                                     
           │                                            
           ▼ (all retries failed)                       
    ┌─────────────┐                                     
    │  FALLBACK   │──────▶ Use cached data             
    │    RPC      │        Mark stale                  
    └─────────────┘                                     
    
    ─────────────────────────────────────────────────────────────────────────────
    
    Database Error          Retry once                  Brief stale data
         │                  If persists, return         
         │                  cached response             
         ▼                                              
    ┌─────────────┐                                     
    │   CIRCUIT   │──────▶ Open after 5 failures      
    │   BREAKER   │        Half-open after 30s        
    └─────────────┘        Close on success           
    
    ─────────────────────────────────────────────────────────────────────────────
    
    Missing Transfer        Log warning                 None
    Match                   Store orphan completion     
         │                  Alert if pattern emerges   
         ▼                                              
    ┌─────────────┐                                     
    │  ORPHAN     │──────▶ Retry match after 5min     
    │   QUEUE     │        Discard after 1hr          
    └─────────────┘                                     
    
    ─────────────────────────────────────────────────────────────────────────────
    
    API Rate Limit          Queue request               Slight delay
         │                  429 response                
         ▼                                              
    ┌─────────────┐                                     
    │   RATE      │──────▶ Exponential backoff        
    │  LIMITER    │        Max 100 req/min/IP         
    └─────────────┘                                     
```

---

## 8. Monitoring & Observability

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                     MONITORING STRATEGY                                       │
└──────────────────────────────────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────────────────────────────┐
    │                          METRICS                                        │
    │                                                                         │
    │    System Health:                                                       │
    │    • API response time (p50, p90, p99)                                 │
    │    • Error rate by endpoint                                            │
    │    • Active WebSocket connections                                      │
    │    • Database query latency                                            │
    │                                                                         │
    │    Business Metrics:                                                    │
    │    • Transfers processed per minute                                    │
    │    • Match rate (completions matched to initiations)                   │
    │    • Anomalies detected per hour                                       │
    │    • API calls by endpoint                                             │
    │                                                                         │
    └─────────────────────────────────────────────────────────────────────────┘
    
    ┌─────────────────────────────────────────────────────────────────────────┐
    │                          ALERTS                                         │
    │                                                                         │
    │    Critical (Page immediately):                                        │
    │    • API error rate > 5% for 5 minutes                                 │
    │    • No transfers processed for 15 minutes                             │
    │    • Database unreachable                                              │
    │                                                                         │
    │    Warning (Slack notification):                                       │
    │    • Match rate drops below 95%                                        │
    │    • RPC errors spike                                                  │
    │    • Unusual traffic patterns                                          │
    │                                                                         │
    └─────────────────────────────────────────────────────────────────────────┘
    
    ┌─────────────────────────────────────────────────────────────────────────┐
    │                         LOGGING                                         │
    │                                                                         │
    │    Levels:                                                              │
    │    • ERROR:  Failures requiring attention                              │
    │    • WARN:   Unexpected but handled situations                         │
    │    • INFO:   Key business events (transfer processed)                  │
    │    • DEBUG:  Detailed flow (disabled in prod)                          │
    │                                                                         │
    │    Structured Format:                                                   │
    │    {                                                                    │
    │      timestamp: ISO8601,                                               │
    │      level: "INFO",                                                    │
    │      message: "Transfer completed",                                    │
    │      transferId: "eth_12345",                                          │
    │      bridge: "across",                                                 │
    │      corridor: "ethereum_arbitrum",                                    │
    │      durationMs: 210000                                                │
    │    }                                                                    │
    │                                                                         │
    └─────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Security Considerations

### 9.1 Attack Vectors & Mitigations

| Vector | Risk | Mitigation |
|--------|------|------------|
| DDoS | Service unavailable | Vercel edge caching, rate limiting |
| API abuse | Resource exhaustion | IP-based rate limits (100/min) |
| SQL injection | Data breach | Prisma parameterized queries |
| XSS | Data theft | React auto-escaping, CSP headers |
| Data poisoning | Wrong metrics | Validate event signatures |

### 9.2 Security Headers

```typescript
// next.config.js
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Content-Security-Policy', value: "default-src 'self'; ..." }
];
```

---

## 10. Future Considerations (Post-Phase 0)

- **Authentication**: API keys for higher rate limits
- **Webhooks**: Push notifications for anomalies
- **Historical API**: Query past corridor performance
- **Multi-bridge comparison**: Side-by-side route analysis
- **Structural metrics**: Deep liquidity analysis (Phase 1)