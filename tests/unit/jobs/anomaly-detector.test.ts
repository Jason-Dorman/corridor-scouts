/**
 * Unit tests for src/jobs/anomaly-detector.ts
 *
 * Spec reference:
 *   DATA-MODEL.md §9.1  (latency spike detection)
 *   DATA-MODEL.md §9.2  (failure cluster detection)
 *   DATA-MODEL.md §9.3  (liquidity drop detection)
 *   DATA-MODEL.md §9.4  (severity assignment)
 *   DATA-MODEL.md §10.1 (percentile calculation)
 *
 * Strategy:
 *   - calculatePercentile, detectsLatencySpike, detectsFailureCluster,
 *     detectsLiquidityDrop, and all get*Severity functions are pure/near-pure;
 *     tested directly with spec examples and edge cases.
 *   - AnomalyDetector.run() is tested with lib/db fully mocked so no DB
 *     is needed.
 *   - Each detection method is exercised in isolation by returning data only
 *     for the relevant DB query (transfers vs pool_snapshots).
 */

// ---------------------------------------------------------------------------
// Mock declarations (hoisted by Jest)
// ---------------------------------------------------------------------------

const mockTransferFindMany    = jest.fn();
const mockPoolFindMany        = jest.fn();
const mockAnomalyCreate       = jest.fn();
const mockAnomalyFindMany     = jest.fn();

jest.mock('../../../src/lib/db', () => ({
  db: {
    transfer: {
      findMany: (...args: unknown[]) => mockTransferFindMany(...args),
    },
    poolSnapshot: {
      findMany: (...args: unknown[]) => mockPoolFindMany(...args),
    },
    anomaly: {
      create: (...args: unknown[]) => mockAnomalyCreate(...args),
      findMany: (...args: unknown[]) => mockAnomalyFindMany(...args),
    },
  },
}));

// ---------------------------------------------------------------------------
// Imports — after mock declarations
// ---------------------------------------------------------------------------

import {
  calculatePercentile,
  detectsLatencySpike,
  detectsFailureCluster,
  detectsLiquidityDrop,
  getLatencySpikeSeverity,
  getFailureClusterSeverity,
  getLiquidityDropSeverity,
  AnomalyDetector,
} from '../../../src/jobs/anomaly-detector';
import {
  ANOMALY_THRESHOLDS,
  ANOMALY_SEVERITY_THRESHOLDS,
} from '../../../src/lib/constants';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns a Date that is `hours` hours before `now`. */
function hoursAgo(hours: number, now = new Date()): Date {
  return new Date(now.getTime() - hours * 3600 * 1000);
}

/** Minimal transfer fixture for latency-spike tests. */
function makeCompletedTransfer(overrides: {
  bridge?: string;
  sourceChain?: string;
  destChain?: string;
  durationSeconds?: number;
  completedAt?: Date;
}) {
  return {
    bridge: overrides.bridge ?? 'across',
    sourceChain: overrides.sourceChain ?? 'ethereum',
    destChain: overrides.destChain ?? 'arbitrum',
    durationSeconds: overrides.durationSeconds ?? 200,
    completedAt: overrides.completedAt ?? new Date(),
  };
}

/** Minimal transfer fixture for failure-cluster tests. */
function makeSettledTransfer(overrides: {
  bridge?: string;
  sourceChain?: string;
  destChain?: string;
  status?: string;
}) {
  return {
    bridge: overrides.bridge ?? 'across',
    sourceChain: overrides.sourceChain ?? 'ethereum',
    destChain: overrides.destChain ?? 'arbitrum',
    status: overrides.status ?? 'completed',
  };
}

/** Prisma Decimal shim — matches shape used by Prisma client. */
function makeDecimal(value: number): { toNumber: () => number } {
  return { toNumber: () => value };
}

/** Minimal pool-snapshot fixture. */
function makePoolSnapshot(overrides: {
  poolId?: string;
  bridge?: string;
  chain?: string;
  asset?: string;
  tvlUsd?: number | null;
  recordedAt?: Date;
}) {
  const raw = overrides.tvlUsd ?? 1_000_000;
  return {
    poolId: overrides.poolId ?? 'across_ethereum_usdc',
    bridge: overrides.bridge ?? 'across',
    chain: overrides.chain ?? 'ethereum',
    asset: overrides.asset ?? 'USDC',
    tvlUsd: raw !== null ? makeDecimal(raw) : null,
    recordedAt: overrides.recordedAt ?? new Date(),
  };
}

// ---------------------------------------------------------------------------
// calculatePercentile — DATA-MODEL.md §10.1
// ---------------------------------------------------------------------------

describe('calculatePercentile – spec examples', () => {
  it('returns 0 for an empty array', () => {
    expect(calculatePercentile([], 50)).toBe(0);
    expect(calculatePercentile([], 90)).toBe(0);
  });

  it('returns the single value for a one-element array', () => {
    expect(calculatePercentile([300], 50)).toBe(300);
    expect(calculatePercentile([300], 90)).toBe(300);
  });

  it('returns the median of [100, 200, 300]', () => {
    expect(calculatePercentile([100, 200, 300], 50)).toBe(200);
  });

  it('sorts input before computing (handles unsorted input)', () => {
    expect(calculatePercentile([300, 100, 200], 50)).toBe(200);
  });

  it('p90 of [100, 200, 300] = 280 (linear interpolation)', () => {
    // index = 0.9 × 2 = 1.8 → 200 + 0.8 × (300 - 200) = 280
    expect(calculatePercentile([100, 200, 300], 90)).toBeCloseTo(280);
  });

  it('p90 of ten identical values equals that value', () => {
    const values = Array.from({ length: 10 }, () => 150);
    expect(calculatePercentile(values, 90)).toBe(150);
  });

  it('p100 returns the maximum value', () => {
    expect(calculatePercentile([10, 50, 200], 100)).toBe(200);
  });

  it('p0 returns the minimum value', () => {
    expect(calculatePercentile([10, 50, 200], 0)).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// detectsLatencySpike — DATA-MODEL.md §9.1
// ---------------------------------------------------------------------------

describe('detectsLatencySpike – detection threshold (3×)', () => {
  const M = ANOMALY_THRESHOLDS.LATENCY_SPIKE_MULTIPLIER; // 3

  it('returns false when currentP90 === historicalP90 × 3 (not strictly greater)', () => {
    expect(detectsLatencySpike(300, 100)).toBe(false); // 300 = 100 × 3, not > 3
  });

  it('returns true when currentP90 is just above 3×', () => {
    expect(detectsLatencySpike(301, 100)).toBe(true);
  });

  it('returns false when currentP90 < 3× historicalP90', () => {
    expect(detectsLatencySpike(299, 100)).toBe(false);
  });

  it('returns true at a large multiplier (10×)', () => {
    expect(detectsLatencySpike(1000, 100)).toBe(true);
  });

  it(`uses LATENCY_SPIKE_MULTIPLIER constant (currently ${M})`, () => {
    // Just above the threshold
    expect(detectsLatencySpike(100 * M + 1, 100)).toBe(true);
    // At the threshold (not strictly greater)
    expect(detectsLatencySpike(100 * M, 100)).toBe(false);
  });
});

describe('detectsLatencySpike – guard conditions', () => {
  it('returns false when historicalP90 is 0 (no baseline)', () => {
    expect(detectsLatencySpike(300, 0)).toBe(false);
  });

  it('returns false when historicalP90 is negative', () => {
    expect(detectsLatencySpike(300, -100)).toBe(false);
  });

  it('returns false when currentP90 is 0', () => {
    expect(detectsLatencySpike(0, 100)).toBe(false);
  });

  it('returns false when currentP90 is NaN', () => {
    expect(detectsLatencySpike(NaN, 100)).toBe(false);
  });

  it('returns false when historicalP90 is NaN', () => {
    expect(detectsLatencySpike(300, NaN)).toBe(false);
  });

  it('returns false when currentP90 is Infinity', () => {
    expect(detectsLatencySpike(Infinity, 100)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// detectsFailureCluster — DATA-MODEL.md §9.2
// ---------------------------------------------------------------------------

describe('detectsFailureCluster – detection threshold (10%)', () => {
  it('returns false when totalCount is 0 (zero-denominator guard)', () => {
    expect(detectsFailureCluster(0, 0)).toBe(false);
    expect(detectsFailureCluster(5, 0)).toBe(false);
  });

  it('returns false when failure rate === 10% (not strictly greater)', () => {
    expect(detectsFailureCluster(1, 10)).toBe(false); // 10% exactly
  });

  it('returns true when failure rate is just above 10%', () => {
    // 11 failed out of 100 total = 11%
    expect(detectsFailureCluster(11, 100)).toBe(true);
  });

  it('returns false when failure rate is below 10%', () => {
    expect(detectsFailureCluster(9, 100)).toBe(false);
  });

  it('returns true when all transfers failed (100% failure rate)', () => {
    expect(detectsFailureCluster(10, 10)).toBe(true);
  });

  it('returns false when there are no failures (0% rate)', () => {
    expect(detectsFailureCluster(0, 50)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// detectsLiquidityDrop — DATA-MODEL.md §9.3
// ---------------------------------------------------------------------------

describe('detectsLiquidityDrop – detection threshold (15%)', () => {
  it('returns false when tvl24hAgo is 0 (zero-denominator guard)', () => {
    expect(detectsLiquidityDrop(0, 0)).toBe(false);
    expect(detectsLiquidityDrop(500_000, 0)).toBe(false);
  });

  it('returns false when tvl24hAgo is negative', () => {
    expect(detectsLiquidityDrop(500_000, -1_000_000)).toBe(false);
  });

  it('returns false when drop === 15% (not strictly greater)', () => {
    // dropPct = (1M - 850K) / 1M × 100 = 15%
    expect(detectsLiquidityDrop(850_000, 1_000_000)).toBe(false);
  });

  it('returns true when drop is just above 15%', () => {
    // dropPct = (1M - 849K) / 1M × 100 = 15.1%
    expect(detectsLiquidityDrop(849_000, 1_000_000)).toBe(true);
  });

  it('returns false when TVL is unchanged (0% drop)', () => {
    expect(detectsLiquidityDrop(1_000_000, 1_000_000)).toBe(false);
  });

  it('returns false when TVL has increased (negative drop)', () => {
    expect(detectsLiquidityDrop(1_200_000, 1_000_000)).toBe(false);
  });

  it('returns true for a 40% drop', () => {
    expect(detectsLiquidityDrop(600_000, 1_000_000)).toBe(true);
  });

  it('returns false when tvlNow is NaN', () => {
    expect(detectsLiquidityDrop(NaN, 1_000_000)).toBe(false);
  });

  it('returns false when tvl24hAgo is NaN', () => {
    expect(detectsLiquidityDrop(500_000, NaN)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getLatencySpikeSeverity — DATA-MODEL.md §9.4
// ---------------------------------------------------------------------------

describe('getLatencySpikeSeverity – spec examples', () => {
  const { MEDIUM, HIGH } = ANOMALY_SEVERITY_THRESHOLDS.LATENCY_SPIKE;

  it('returns low for multiplier in 3–5× range', () => {
    expect(getLatencySpikeSeverity(3.1)).toBe('low');
    expect(getLatencySpikeSeverity(4)).toBe('low');
    expect(getLatencySpikeSeverity(4.99)).toBe('low');
  });

  it(`returns medium at exactly ${MEDIUM}× (boundary inclusive for medium)`, () => {
    expect(getLatencySpikeSeverity(MEDIUM)).toBe('medium');
  });

  it('returns medium for multiplier in 5–10× range', () => {
    expect(getLatencySpikeSeverity(5.5)).toBe('medium');
    expect(getLatencySpikeSeverity(9.99)).toBe('medium');
  });

  it(`returns high at exactly ${HIGH}×`, () => {
    expect(getLatencySpikeSeverity(HIGH)).toBe('high');
  });

  it('returns high for multiplier above 10×', () => {
    expect(getLatencySpikeSeverity(10.1)).toBe('high');
    expect(getLatencySpikeSeverity(50)).toBe('high');
  });
});

// ---------------------------------------------------------------------------
// getFailureClusterSeverity — DATA-MODEL.md §9.4
// ---------------------------------------------------------------------------

describe('getFailureClusterSeverity – spec examples', () => {
  const { MEDIUM, HIGH } = ANOMALY_SEVERITY_THRESHOLDS.FAILURE_CLUSTER;

  it('returns low for failure rate 10–20%', () => {
    expect(getFailureClusterSeverity(10.1)).toBe('low');
    expect(getFailureClusterSeverity(15)).toBe('low');
    expect(getFailureClusterSeverity(20)).toBe('low'); // 20 is NOT > MEDIUM (20)
  });

  it(`returns medium just above ${MEDIUM}%`, () => {
    expect(getFailureClusterSeverity(20.1)).toBe('medium');
    expect(getFailureClusterSeverity(30)).toBe('medium');
    expect(getFailureClusterSeverity(40)).toBe('medium'); // 40 is NOT > HIGH (40)
  });

  it(`returns high just above ${HIGH}%`, () => {
    expect(getFailureClusterSeverity(40.1)).toBe('high');
    expect(getFailureClusterSeverity(100)).toBe('high');
  });
});

// ---------------------------------------------------------------------------
// getLiquidityDropSeverity — DATA-MODEL.md §9.4
// ---------------------------------------------------------------------------

describe('getLiquidityDropSeverity – spec examples', () => {
  const { MEDIUM, HIGH } = ANOMALY_SEVERITY_THRESHOLDS.LIQUIDITY_DROP;

  it('returns low for drop 15–25%', () => {
    expect(getLiquidityDropSeverity(15.1)).toBe('low');
    expect(getLiquidityDropSeverity(20)).toBe('low');
    expect(getLiquidityDropSeverity(25)).toBe('low'); // 25 is NOT > MEDIUM (25)
  });

  it(`returns medium just above ${MEDIUM}%`, () => {
    expect(getLiquidityDropSeverity(25.1)).toBe('medium');
    expect(getLiquidityDropSeverity(35)).toBe('medium');
    expect(getLiquidityDropSeverity(40)).toBe('medium'); // 40 is NOT > HIGH (40)
  });

  it(`returns high just above ${HIGH}%`, () => {
    expect(getLiquidityDropSeverity(40.1)).toBe('high');
    expect(getLiquidityDropSeverity(99)).toBe('high');
  });
});

// ---------------------------------------------------------------------------
// Constants alignment checks
// ---------------------------------------------------------------------------

describe('ANOMALY_THRESHOLDS – values match spec (DATA-MODEL.md §9)', () => {
  it('LATENCY_SPIKE_MULTIPLIER = 3', () => {
    expect(ANOMALY_THRESHOLDS.LATENCY_SPIKE_MULTIPLIER).toBe(3);
  });
  it('FAILURE_RATE_THRESHOLD = 10', () => {
    expect(ANOMALY_THRESHOLDS.FAILURE_RATE_THRESHOLD).toBe(10);
  });
  it('LIQUIDITY_DROP_THRESHOLD = 15', () => {
    expect(ANOMALY_THRESHOLDS.LIQUIDITY_DROP_THRESHOLD).toBe(15);
  });
});

describe('ANOMALY_SEVERITY_THRESHOLDS – values match spec (DATA-MODEL.md §9.4)', () => {
  it('LATENCY_SPIKE.MEDIUM = 5, HIGH = 10', () => {
    expect(ANOMALY_SEVERITY_THRESHOLDS.LATENCY_SPIKE.MEDIUM).toBe(5);
    expect(ANOMALY_SEVERITY_THRESHOLDS.LATENCY_SPIKE.HIGH).toBe(10);
  });
  it('FAILURE_CLUSTER.MEDIUM = 20, HIGH = 40', () => {
    expect(ANOMALY_SEVERITY_THRESHOLDS.FAILURE_CLUSTER.MEDIUM).toBe(20);
    expect(ANOMALY_SEVERITY_THRESHOLDS.FAILURE_CLUSTER.HIGH).toBe(40);
  });
  it('LIQUIDITY_DROP.MEDIUM = 25, HIGH = 40', () => {
    expect(ANOMALY_SEVERITY_THRESHOLDS.LIQUIDITY_DROP.MEDIUM).toBe(25);
    expect(ANOMALY_SEVERITY_THRESHOLDS.LIQUIDITY_DROP.HIGH).toBe(40);
  });
});

// ---------------------------------------------------------------------------
// AnomalyDetector.run() — no anomalies
// ---------------------------------------------------------------------------

describe('AnomalyDetector.run() – no data / no anomalies', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTransferFindMany.mockResolvedValue([]);
    mockPoolFindMany.mockResolvedValue([]);
    mockAnomalyFindMany.mockResolvedValue([]);
  });

  it('returns all counts as 0 when there are no transfers or pool snapshots', async () => {
    const result = await new AnomalyDetector().run();
    expect(result).toEqual({ latencySpikes: 0, failureClusters: 0, liquidityDrops: 0 });
  });

  it('does not call anomaly.create when there are no anomalies', async () => {
    await new AnomalyDetector().run();
    expect(mockAnomalyCreate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// AnomalyDetector — latency spike detection
// ---------------------------------------------------------------------------

/**
 * Route mockTransferFindMany based on query shape:
 *   - Latency spike query  → has `where.completedAt`
 *   - Failure cluster query → has `where.initiatedAt`
 * This prevents latency-spike fixture data bleeding into the failure-cluster
 * pass (which would count transfers without a `status` field as failures).
 */
function routeTransferMock(
  latencyData: ReturnType<typeof makeCompletedTransfer>[],
  failureData: ReturnType<typeof makeSettledTransfer>[] = [],
) {
  mockTransferFindMany.mockImplementation(
    ({ where }: { where: { completedAt?: unknown; initiatedAt?: unknown } }) => {
      if (where.completedAt !== undefined) return Promise.resolve(latencyData);
      return Promise.resolve(failureData); // failure cluster query
    },
  );
}

describe('AnomalyDetector – latency spike', () => {
  const now = new Date();

  beforeEach(() => {
    jest.clearAllMocks();
    mockPoolFindMany.mockResolvedValue([]);
    mockAnomalyCreate.mockResolvedValue({});
    mockAnomalyFindMany.mockResolvedValue([]);
  });

  /**
   * Build spike test data with enough old samples that one recent outlier does
   * not materially shift the 7-day p90.
   *
   * With 20 historical samples at `baseSeconds` and 1 recent sample at
   * `recentSeconds`, the historical p90 (all 21 values) lands at:
   *   index = 0.9 × 20 = 18 → sorted[18] = baseSeconds (still in the bulk).
   * So historicalP90 ≈ baseSeconds, and currentP90 = recentSeconds.
   */
  function makeSpikeData(
    baseSeconds: number,
    recentSeconds: number,
    bridge = 'across',
  ) {
    const old = Array.from({ length: 20 }, () =>
      makeCompletedTransfer({ bridge, durationSeconds: baseSeconds, completedAt: hoursAgo(5, now) }),
    );
    // 5 recent samples — meets MIN_SAMPLE_SIZE; p90 of identical values = that value.
    const recent = Array.from({ length: 5 }, () =>
      makeCompletedTransfer({ bridge, durationSeconds: recentSeconds, completedAt: hoursAgo(0.5, now) }),
    );
    return [...old, ...recent];
  }

  it('creates a latency_spike anomaly when currentP90 > 3× historicalP90', async () => {
    // historicalP90 ≈ 100s (20 old samples); currentP90 = 400s → 4× > 3× → spike
    routeTransferMock(makeSpikeData(100, 400));

    const result = await new AnomalyDetector().run();

    expect(result.latencySpikes).toBe(1);
    expect(mockAnomalyCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          anomalyType: 'latency_spike',
          corridorId: 'across_ethereum_arbitrum',
        }),
      }),
    );
  });

  it('does NOT create an anomaly when currentP90 <= 3× historicalP90', async () => {
    // historicalP90 ≈ 100s; currentP90 = 300s → exactly 3× (not strictly greater)
    routeTransferMock(makeSpikeData(100, 300));

    const result = await new AnomalyDetector().run();

    expect(result.latencySpikes).toBe(0);
    expect(mockAnomalyCreate).not.toHaveBeenCalled();
  });

  it('assigns severity=low for a 4× spike (3–5× range)', async () => {
    // historicalP90 ≈ 100s; currentP90 = 401s → 4.01× → low
    routeTransferMock(makeSpikeData(100, 401));

    await new AnomalyDetector().run();

    expect(mockAnomalyCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ anomalyType: 'latency_spike', severity: 'low' }),
      }),
    );
  });

  it('assigns severity=medium for a 6× spike (5–10× range)', async () => {
    // historicalP90 ≈ 100s; currentP90 = 600s → 6× → medium
    routeTransferMock(makeSpikeData(100, 600));

    await new AnomalyDetector().run();

    expect(mockAnomalyCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ anomalyType: 'latency_spike', severity: 'medium' }),
      }),
    );
  });

  it('assigns severity=high for a 12× spike (> 10×)', async () => {
    // historicalP90 ≈ 100s; currentP90 = 1200s → 12× → high
    routeTransferMock(makeSpikeData(100, 1200));

    await new AnomalyDetector().run();

    expect(mockAnomalyCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ anomalyType: 'latency_spike', severity: 'high' }),
      }),
    );
  });

  it('includes full data story in anomaly details', async () => {
    routeTransferMock(makeSpikeData(100, 400));

    await new AnomalyDetector().run();

    const call = mockAnomalyCreate.mock.calls.find(
      (c: [{ data: { anomalyType: string } }]) => c[0].data.anomalyType === 'latency_spike',
    );
    const details = call![0].data.details;
    expect(details).toHaveProperty('currentP90Seconds');
    expect(details).toHaveProperty('historicalP90Seconds');
    expect(details).toHaveProperty('multiplier');
    expect(details).toHaveProperty('currentSampleSize');
    expect(details).toHaveProperty('historicalSampleSize');
    expect(details).toHaveProperty('windowCurrentHours', 1);
    expect(details).toHaveProperty('windowHistoricalDays', 7);
  });

  it('skips corridors with no recent (1h) completions', async () => {
    // All transfers are from >1 hour ago → no current window data → no spike
    const transfers = Array.from({ length: 20 }, () =>
      makeCompletedTransfer({ durationSeconds: 100, completedAt: hoursAgo(5, now) }),
    );

    routeTransferMock(transfers);

    const result = await new AnomalyDetector().run();

    expect(result.latencySpikes).toBe(0);
    expect(mockAnomalyCreate).not.toHaveBeenCalled();
  });

  it('detects spikes independently across two corridors', async () => {
    const acrossData = makeSpikeData(100, 400, 'across');
    const cctpData = makeSpikeData(200, 800, 'cctp');

    routeTransferMock([...acrossData, ...cctpData]);

    const result = await new AnomalyDetector().run();

    expect(result.latencySpikes).toBe(2);
    expect(mockAnomalyCreate).toHaveBeenCalledTimes(2);
  });

  it(`skips corridors with fewer than ${ANOMALY_THRESHOLDS.MIN_SAMPLE_SIZE} current samples`, async () => {
    // Only 3 recent samples — below MIN_SAMPLE_SIZE
    const old = Array.from({ length: 20 }, () =>
      makeCompletedTransfer({ durationSeconds: 100, completedAt: hoursAgo(5, now) }),
    );
    const recent = Array.from({ length: 3 }, () =>
      makeCompletedTransfer({ durationSeconds: 400, completedAt: hoursAgo(0.5, now) }),
    );
    routeTransferMock([...old, ...recent]);

    const result = await new AnomalyDetector().run();

    expect(result.latencySpikes).toBe(0);
    expect(mockAnomalyCreate).not.toHaveBeenCalled();
  });

  it('does not create a duplicate latency_spike within the cron interval', async () => {
    routeTransferMock(makeSpikeData(100, 400));
    // Simulate an existing anomaly created this cron cycle for this corridor
    mockAnomalyFindMany.mockImplementation(
      ({ where }: { where: { anomalyType?: string } }) => {
        if (where.anomalyType === 'latency_spike') {
          return Promise.resolve([{ corridorId: 'across_ethereum_arbitrum' }]);
        }
        return Promise.resolve([]);
      },
    );

    const result = await new AnomalyDetector().run();

    expect(result.latencySpikes).toBe(0);
    expect(mockAnomalyCreate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// AnomalyDetector — failure cluster detection
// ---------------------------------------------------------------------------

describe('AnomalyDetector – failure cluster', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // No transfers for latency spike window (7d), no pool snapshots
    mockTransferFindMany.mockImplementation(({ where }: { where: { status?: unknown; completedAt?: unknown } }) => {
      // Latency spike query filters by status='completed' with completedAt filter
      if (where.completedAt !== undefined) return Promise.resolve([]);
      // Failure cluster query filters by status IN [completed,stuck,failed]
      return Promise.resolve([]);
    });
    mockPoolFindMany.mockResolvedValue([]);
    mockAnomalyCreate.mockResolvedValue({});
    mockAnomalyFindMany.mockResolvedValue([]);
  });

  it('creates a failure_cluster anomaly when failure rate exceeds 10%', async () => {
    // 2 failed out of 10 settled = 20% > 10%
    const transfers = [
      ...Array.from({ length: 8 }, () => makeSettledTransfer({ status: 'completed' })),
      makeSettledTransfer({ status: 'failed' }),
      makeSettledTransfer({ status: 'stuck' }),
    ];

    // Return empty for latency-spike query (has completedAt), return cluster data for failure query
    mockTransferFindMany.mockImplementation(({ where }: { where: { completedAt?: unknown; status?: { in?: string[] } } }) => {
      if (where.completedAt !== undefined) return Promise.resolve([]);
      return Promise.resolve(transfers);
    });

    const result = await new AnomalyDetector().run();

    expect(result.failureClusters).toBe(1);
    expect(mockAnomalyCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          anomalyType: 'failure_cluster',
          corridorId: 'across_ethereum_arbitrum',
        }),
      }),
    );
  });

  it('does NOT trigger when failure rate <= 10%', async () => {
    // 1 failed out of 10 settled = 10% — not strictly greater
    const transfers = [
      ...Array.from({ length: 9 }, () => makeSettledTransfer({ status: 'completed' })),
      makeSettledTransfer({ status: 'failed' }),
    ];

    mockTransferFindMany.mockImplementation(({ where }: { where: { completedAt?: unknown } }) => {
      if (where.completedAt !== undefined) return Promise.resolve([]);
      return Promise.resolve(transfers);
    });

    const result = await new AnomalyDetector().run();

    expect(result.failureClusters).toBe(0);
  });

  it('counts both stuck and failed transfers as failures', async () => {
    // 1 stuck + 1 failed = 2 failures out of 10 = 20%
    const transfers = [
      ...Array.from({ length: 8 }, () => makeSettledTransfer({ status: 'completed' })),
      makeSettledTransfer({ status: 'stuck' }),
      makeSettledTransfer({ status: 'failed' }),
    ];

    mockTransferFindMany.mockImplementation(({ where }: { where: { completedAt?: unknown } }) => {
      if (where.completedAt !== undefined) return Promise.resolve([]);
      return Promise.resolve(transfers);
    });

    const result = await new AnomalyDetector().run();

    expect(result.failureClusters).toBe(1);
    const call = mockAnomalyCreate.mock.calls.find(
      (c: [{ data: { anomalyType: string } }]) => c[0].data.anomalyType === 'failure_cluster',
    );
    expect(call![0].data.details.failedCount).toBe(2);
  });

  it('assigns severity=low for 15% failure rate (10–20% range)', async () => {
    const transfers = [
      ...Array.from({ length: 17 }, () => makeSettledTransfer({ status: 'completed' })),
      makeSettledTransfer({ status: 'failed' }),
      makeSettledTransfer({ status: 'failed' }),
      makeSettledTransfer({ status: 'failed' }),
    ]; // 3/20 = 15%

    mockTransferFindMany.mockImplementation(({ where }: { where: { completedAt?: unknown } }) => {
      if (where.completedAt !== undefined) return Promise.resolve([]);
      return Promise.resolve(transfers);
    });

    await new AnomalyDetector().run();

    const call = mockAnomalyCreate.mock.calls.find(
      (c: [{ data: { anomalyType: string } }]) => c[0].data.anomalyType === 'failure_cluster',
    );
    expect(call![0].data.severity).toBe('low');
  });

  it('assigns severity=medium for 30% failure rate (20–40% range)', async () => {
    const transfers = [
      ...Array.from({ length: 7 }, () => makeSettledTransfer({ status: 'completed' })),
      ...Array.from({ length: 3 }, () => makeSettledTransfer({ status: 'failed' })),
    ]; // 3/10 = 30%

    mockTransferFindMany.mockImplementation(({ where }: { where: { completedAt?: unknown } }) => {
      if (where.completedAt !== undefined) return Promise.resolve([]);
      return Promise.resolve(transfers);
    });

    await new AnomalyDetector().run();

    const call = mockAnomalyCreate.mock.calls.find(
      (c: [{ data: { anomalyType: string } }]) => c[0].data.anomalyType === 'failure_cluster',
    );
    expect(call![0].data.severity).toBe('medium');
  });

  it('assigns severity=high for 60% failure rate (> 40%)', async () => {
    const transfers = [
      ...Array.from({ length: 2 }, () => makeSettledTransfer({ status: 'completed' })),
      ...Array.from({ length: 3 }, () => makeSettledTransfer({ status: 'failed' })),
    ]; // 3/5 = 60%

    mockTransferFindMany.mockImplementation(({ where }: { where: { completedAt?: unknown } }) => {
      if (where.completedAt !== undefined) return Promise.resolve([]);
      return Promise.resolve(transfers);
    });

    await new AnomalyDetector().run();

    const call = mockAnomalyCreate.mock.calls.find(
      (c: [{ data: { anomalyType: string } }]) => c[0].data.anomalyType === 'failure_cluster',
    );
    expect(call![0].data.severity).toBe('high');
  });

  it('includes full data story in anomaly details', async () => {
    const transfers = [
      ...Array.from({ length: 8 }, () => makeSettledTransfer({ status: 'completed' })),
      makeSettledTransfer({ status: 'failed' }),
      makeSettledTransfer({ status: 'stuck' }),
    ]; // 2/10 = 20%

    mockTransferFindMany.mockImplementation(({ where }: { where: { completedAt?: unknown } }) => {
      if (where.completedAt !== undefined) return Promise.resolve([]);
      return Promise.resolve(transfers);
    });

    await new AnomalyDetector().run();

    const call = mockAnomalyCreate.mock.calls.find(
      (c: [{ data: { anomalyType: string } }]) => c[0].data.anomalyType === 'failure_cluster',
    );
    const details = call![0].data.details;
    expect(details).toHaveProperty('failureRate');
    expect(details).toHaveProperty('failedCount', 2);
    expect(details).toHaveProperty('completedCount', 8);
    expect(details).toHaveProperty('totalCount', 10);
    expect(details).toHaveProperty('windowHours', 1);
  });

  it(`skips corridors with fewer than ${ANOMALY_THRESHOLDS.MIN_SAMPLE_SIZE} settled transfers`, async () => {
    // 4 total — below MIN_SAMPLE_SIZE. Rate would be 50% if counted.
    const transfers = [
      ...Array.from({ length: 2 }, () => makeSettledTransfer({ status: 'completed' })),
      ...Array.from({ length: 2 }, () => makeSettledTransfer({ status: 'failed' })),
    ];

    mockTransferFindMany.mockImplementation(({ where }: { where: { completedAt?: unknown } }) => {
      if (where.completedAt !== undefined) return Promise.resolve([]);
      return Promise.resolve(transfers);
    });

    const result = await new AnomalyDetector().run();

    expect(result.failureClusters).toBe(0);
    expect(mockAnomalyCreate).not.toHaveBeenCalled();
  });

  it('does not create a duplicate failure_cluster within the cron interval', async () => {
    const transfers = [
      ...Array.from({ length: 8 }, () => makeSettledTransfer({ status: 'completed' })),
      ...Array.from({ length: 2 }, () => makeSettledTransfer({ status: 'failed' })),
    ]; // 2/10 = 20% — above threshold

    mockTransferFindMany.mockImplementation(({ where }: { where: { completedAt?: unknown } }) => {
      if (where.completedAt !== undefined) return Promise.resolve([]);
      return Promise.resolve(transfers);
    });
    mockAnomalyFindMany.mockImplementation(
      ({ where }: { where: { anomalyType?: string } }) => {
        if (where.anomalyType === 'failure_cluster') {
          return Promise.resolve([{ corridorId: 'across_ethereum_arbitrum' }]);
        }
        return Promise.resolve([]);
      },
    );

    const result = await new AnomalyDetector().run();

    expect(result.failureClusters).toBe(0);
    expect(mockAnomalyCreate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// AnomalyDetector — liquidity drop detection
// ---------------------------------------------------------------------------

describe('AnomalyDetector – liquidity drop', () => {
  const now = new Date();

  beforeEach(() => {
    jest.clearAllMocks();
    mockTransferFindMany.mockResolvedValue([]);
    mockAnomalyCreate.mockResolvedValue({});
    mockAnomalyFindMany.mockResolvedValue([]);
  });

  it('creates a liquidity_drop anomaly when TVL dropped > 15% in 24h', async () => {
    const baseline = makePoolSnapshot({ tvlUsd: 1_000_000, recordedAt: hoursAgo(23, now) });
    const current = makePoolSnapshot({ tvlUsd: 800_000, recordedAt: hoursAgo(0.1, now) }); // 20% drop

    // First call = baseline query, second = current query
    mockPoolFindMany
      .mockResolvedValueOnce([baseline])
      .mockResolvedValueOnce([current]);

    const result = await new AnomalyDetector().run();

    expect(result.liquidityDrops).toBe(1);
    expect(mockAnomalyCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          anomalyType: 'liquidity_drop',
          corridorId: 'across_ethereum_usdc',
        }),
      }),
    );
  });

  it('does NOT create an anomaly when drop <= 15%', async () => {
    const baseline = makePoolSnapshot({ tvlUsd: 1_000_000, recordedAt: hoursAgo(23, now) });
    const current = makePoolSnapshot({ tvlUsd: 850_000, recordedAt: hoursAgo(0.1, now) }); // 15% exactly

    mockPoolFindMany
      .mockResolvedValueOnce([baseline])
      .mockResolvedValueOnce([current]);

    const result = await new AnomalyDetector().run();

    expect(result.liquidityDrops).toBe(0);
    expect(mockAnomalyCreate).not.toHaveBeenCalled();
  });

  it('does NOT create an anomaly when there is no baseline snapshot', async () => {
    const current = makePoolSnapshot({ tvlUsd: 800_000, recordedAt: hoursAgo(0.1, now) });

    mockPoolFindMany
      .mockResolvedValueOnce([])    // no baseline
      .mockResolvedValueOnce([current]);

    const result = await new AnomalyDetector().run();

    expect(result.liquidityDrops).toBe(0);
  });

  it('skips CCTP placeholder pools (baseline tvlUsd = 0)', async () => {
    const baseline = makePoolSnapshot({ poolId: 'cctp_ethereum_usdc', tvlUsd: 0, recordedAt: hoursAgo(23, now) });
    const current = makePoolSnapshot({ poolId: 'cctp_ethereum_usdc', tvlUsd: 0, recordedAt: hoursAgo(0.1, now) });

    mockPoolFindMany
      .mockResolvedValueOnce([baseline])
      .mockResolvedValueOnce([current]);

    const result = await new AnomalyDetector().run();

    expect(result.liquidityDrops).toBe(0);
    expect(mockAnomalyCreate).not.toHaveBeenCalled();
  });

  it('assigns severity=low for a 20% drop (15–25% range)', async () => {
    const baseline = makePoolSnapshot({ tvlUsd: 1_000_000, recordedAt: hoursAgo(23, now) });
    const current = makePoolSnapshot({ tvlUsd: 800_000, recordedAt: hoursAgo(0.1, now) }); // 20% drop

    mockPoolFindMany
      .mockResolvedValueOnce([baseline])
      .mockResolvedValueOnce([current]);

    await new AnomalyDetector().run();

    expect(mockAnomalyCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ severity: 'low' }),
      }),
    );
  });

  it('assigns severity=medium for a 30% drop (25–40% range)', async () => {
    const baseline = makePoolSnapshot({ tvlUsd: 1_000_000, recordedAt: hoursAgo(23, now) });
    const current = makePoolSnapshot({ tvlUsd: 700_000, recordedAt: hoursAgo(0.1, now) }); // 30% drop

    mockPoolFindMany
      .mockResolvedValueOnce([baseline])
      .mockResolvedValueOnce([current]);

    await new AnomalyDetector().run();

    expect(mockAnomalyCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ severity: 'medium' }),
      }),
    );
  });

  it('assigns severity=high for a 50% drop (> 40%)', async () => {
    const baseline = makePoolSnapshot({ tvlUsd: 1_000_000, recordedAt: hoursAgo(23, now) });
    const current = makePoolSnapshot({ tvlUsd: 500_000, recordedAt: hoursAgo(0.1, now) }); // 50% drop

    mockPoolFindMany
      .mockResolvedValueOnce([baseline])
      .mockResolvedValueOnce([current]);

    await new AnomalyDetector().run();

    expect(mockAnomalyCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ severity: 'high' }),
      }),
    );
  });

  it('includes full data story in anomaly details', async () => {
    const baseline = makePoolSnapshot({ tvlUsd: 1_000_000, recordedAt: hoursAgo(23, now) });
    const current = makePoolSnapshot({ tvlUsd: 800_000, recordedAt: hoursAgo(0.1, now) });

    mockPoolFindMany
      .mockResolvedValueOnce([baseline])
      .mockResolvedValueOnce([current]);

    await new AnomalyDetector().run();

    const call = mockAnomalyCreate.mock.calls[0][0];
    const details = call.data.details;
    expect(details).toHaveProperty('poolId', 'across_ethereum_usdc');
    expect(details).toHaveProperty('tvlNowUsd', 800_000);
    expect(details).toHaveProperty('tvl24hAgoUsd', 1_000_000);
    expect(details).toHaveProperty('dropPct', 20);
    expect(details).toHaveProperty('windowHours', 24);
    expect(details).toHaveProperty('baselineRecordedAt');
    expect(details).toHaveProperty('currentRecordedAt');
  });

  it('does not create a duplicate liquidity_drop within the cron interval', async () => {
    const baseline = makePoolSnapshot({ tvlUsd: 1_000_000, recordedAt: hoursAgo(23, now) });
    const current = makePoolSnapshot({ tvlUsd: 800_000, recordedAt: hoursAgo(0.1, now) }); // 20% drop

    mockPoolFindMany
      .mockResolvedValueOnce([baseline])
      .mockResolvedValueOnce([current]);
    mockAnomalyFindMany.mockImplementation(
      ({ where }: { where: { anomalyType?: string } }) => {
        if (where.anomalyType === 'liquidity_drop') {
          return Promise.resolve([{ corridorId: 'across_ethereum_usdc' }]);
        }
        return Promise.resolve([]);
      },
    );

    const result = await new AnomalyDetector().run();

    expect(result.liquidityDrops).toBe(0);
    expect(mockAnomalyCreate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// AnomalyDetector.run() — error isolation
// ---------------------------------------------------------------------------

describe('AnomalyDetector.run() – error isolation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAnomalyFindMany.mockResolvedValue([]);
  });

  it('returns 0 for a detection pass that throws, and still runs the others', async () => {
    // Latency-spike query throws; failure-cluster and liquidity-drop return empty
    mockTransferFindMany
      .mockRejectedValueOnce(new Error('DB timeout')) // latency spike query
      .mockResolvedValue([]);                          // failure cluster query
    mockPoolFindMany.mockResolvedValue([]);

    const result = await new AnomalyDetector().run();

    // latencySpikes is 0 due to error; others are 0 due to no data
    expect(result).toEqual({ latencySpikes: 0, failureClusters: 0, liquidityDrops: 0 });
  });

  it('continues other passes when anomaly.create throws for one corridor', async () => {
    // Two corridors trigger spikes; create fails for the first.
    // Use 20 old samples + 5 recent samples per bridge (meets MIN_SAMPLE_SIZE).
    const now2 = new Date();
    const acrossTransfers = [
      ...Array.from({ length: 20 }, () =>
        makeCompletedTransfer({ bridge: 'across', durationSeconds: 100, completedAt: hoursAgo(5, now2) }),
      ),
      ...Array.from({ length: 5 }, () =>
        makeCompletedTransfer({ bridge: 'across', durationSeconds: 400, completedAt: hoursAgo(0.5, now2) }),
      ),
    ];
    const cctpTransfers = [
      ...Array.from({ length: 20 }, () =>
        makeCompletedTransfer({ bridge: 'cctp', durationSeconds: 100, completedAt: hoursAgo(5, now2) }),
      ),
      ...Array.from({ length: 5 }, () =>
        makeCompletedTransfer({ bridge: 'cctp', durationSeconds: 400, completedAt: hoursAgo(0.5, now2) }),
      ),
    ];

    routeTransferMock([...acrossTransfers, ...cctpTransfers]);
    mockPoolFindMany.mockResolvedValue([]);

    // First create call fails; second succeeds
    mockAnomalyCreate
      .mockRejectedValueOnce(new Error('Unique constraint violation'))
      .mockResolvedValue({});

    const result = await new AnomalyDetector().run();

    // One succeeded despite first failing
    expect(result.latencySpikes).toBe(1);
  });
});
