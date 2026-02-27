-- CreateTable
CREATE TABLE "transfers" (
    "id" BIGSERIAL NOT NULL,
    "transfer_id" TEXT NOT NULL,
    "bridge" TEXT NOT NULL,
    "source_chain" TEXT NOT NULL,
    "dest_chain" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "amount_usd" DECIMAL(65,30),
    "initiated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "duration_seconds" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "tx_hash_source" TEXT,
    "tx_hash_dest" TEXT,
    "block_initiated" BIGINT,
    "block_completed" BIGINT,
    "gas_price_gwei" DECIMAL(65,30),
    "transfer_size_bucket" TEXT,
    "hour_of_day" INTEGER,
    "day_of_week" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pool_snapshots" (
    "id" BIGSERIAL NOT NULL,
    "pool_id" TEXT NOT NULL,
    "bridge" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "tvl" DECIMAL(65,30) NOT NULL,
    "tvl_usd" DECIMAL(65,30),
    "available_liquidity" DECIMAL(65,30),
    "utilization" DECIMAL(65,30),
    "recorded_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pool_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anomalies" (
    "id" BIGSERIAL NOT NULL,
    "anomaly_type" TEXT NOT NULL,
    "corridor_id" TEXT NOT NULL,
    "bridge" TEXT NOT NULL,
    "source_chain" TEXT,
    "dest_chain" TEXT,
    "severity" TEXT NOT NULL,
    "detected_at" TIMESTAMP(3) NOT NULL,
    "resolved_at" TIMESTAMP(3),
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anomalies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "transfers_transfer_id_key" ON "transfers"("transfer_id");

-- CreateIndex
CREATE INDEX "idx_transfers_corridor" ON "transfers"("bridge", "source_chain", "dest_chain", "initiated_at" DESC);

-- CreateIndex
CREATE INDEX "idx_transfers_status" ON "transfers"("status");

-- CreateIndex
CREATE INDEX "idx_transfers_bridge" ON "transfers"("bridge", "initiated_at" DESC);

-- CreateIndex
CREATE INDEX "idx_pool_snapshots_pool" ON "pool_snapshots"("pool_id", "recorded_at" DESC);

-- CreateIndex
CREATE INDEX "idx_pool_snapshots_chain" ON "pool_snapshots"("chain", "recorded_at" DESC);

-- CreateIndex
CREATE INDEX "idx_anomalies_active" ON "anomalies"("corridor_id");
