/**
 * Unit tests for src/jobs/stuck-detector.ts
 *
 * Spec reference: docs/DATA-MODEL.md §6 (detection), §9.4 (severity)
 *
 * Strategy:
 *   - isStuck and getStuckSeverity are pure/near-pure functions; tested directly.
 *   - StuckDetector.run() is tested with lib/db fully mocked so no DB is needed.
 *   - logger.warn is spied on to verify NaN/null guard paths.
 */

// ---------------------------------------------------------------------------
// Mock declarations (hoisted by Jest)
// ---------------------------------------------------------------------------

const mockFindMany    = jest.fn();
const mockUpdateMany  = jest.fn();
const mockCreate      = jest.fn();
const mockTransaction = jest.fn();

/**
 * tx proxy passed to the interactive transaction callback.
 * Mirrors the shape StuckDetector.markStuck() uses inside the transaction.
 */
const mockTxClient = {
  transfer: { updateMany: (...args: unknown[]) => mockUpdateMany(...args) },
  anomaly:  { create:      (...args: unknown[]) => mockCreate(...args) },
};

jest.mock('../../../src/lib/db', () => ({
  db: {
    transfer: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
    // Interactive transaction form: $transaction(async (tx) => { ... })
    // Default behaviour executes the callback; individual tests can override
    // mockTransaction to simulate failures.
    $transaction: (fn: (tx: typeof mockTxClient) => Promise<unknown>) =>
      mockTransaction(fn),
  },
}));

// ---------------------------------------------------------------------------
// Imports — after mock declarations
// ---------------------------------------------------------------------------

import {
  isStuck,
  getStuckSeverity,
  StuckDetector,
} from '../../../src/jobs/stuck-detector';
import {
  STUCK_THRESHOLDS_SECONDS,
  STUCK_SEVERITY_THRESHOLDS,
} from '../../../src/lib/constants';
import { logger } from '../../../src/lib/logger';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a minimal transfer fixture. amountUsd uses Prisma Decimal-shape. */
function makeTransfer(overrides: {
  id?: bigint;
  transferId?: string;
  bridge?: string;
  sourceChain?: string;
  destChain?: string;
  amountUsd?: number | null;
  initiatedAt?: Date;
  status?: string;
}) {
  const amountUsd =
    overrides.amountUsd !== undefined && overrides.amountUsd !== null
      ? { toNumber: () => overrides.amountUsd as number }
      : overrides.amountUsd === null
      ? null
      : { toNumber: () => 50_000 };

  return {
    id: overrides.id ?? 1n,
    transferId: overrides.transferId ?? 'test-transfer-1',
    bridge: overrides.bridge ?? 'across',
    sourceChain: overrides.sourceChain ?? 'ethereum',
    destChain: overrides.destChain ?? 'arbitrum',
    amountUsd: amountUsd as { toNumber(): number } | null,
    initiatedAt: overrides.initiatedAt ?? new Date(Date.now() - 2 * 60 * 60 * 1000),
    status: overrides.status ?? 'pending',
  };
}

/** Minutes ago as a Date. */
function minutesAgo(n: number): Date {
  return new Date(Date.now() - n * 60 * 1000);
}

// ---------------------------------------------------------------------------
// isStuck — pure function
// ---------------------------------------------------------------------------

describe('isStuck – spec examples (DATA-MODEL.md §6.2)', () => {
  const now = new Date();

  it('returns false when status is not pending', () => {
    expect(
      isStuck({ status: 'completed', bridge: 'across', initiatedAt: minutesAgo(60) }, now),
    ).toBe(false);
  });

  it('returns false when status is stuck (already processed)', () => {
    expect(
      isStuck({ status: 'stuck', bridge: 'across', initiatedAt: minutesAgo(60) }, now),
    ).toBe(false);
  });

  it('returns false when bridge has no threshold defined', () => {
    expect(
      isStuck({ status: 'pending', bridge: 'unknownbridge', initiatedAt: minutesAgo(120) }, now),
    ).toBe(false);
  });
});

describe('isStuck – across threshold (1800 seconds)', () => {
  const now = new Date();
  const threshold = STUCK_THRESHOLDS_SECONDS['across']!;

  it('returns false when elapsed < threshold', () => {
    const initiatedAt = new Date(now.getTime() - (threshold - 1) * 1000);
    expect(isStuck({ status: 'pending', bridge: 'across', initiatedAt }, now)).toBe(false);
  });

  it('returns false when elapsed === threshold (not strictly greater)', () => {
    const initiatedAt = new Date(now.getTime() - threshold * 1000);
    expect(isStuck({ status: 'pending', bridge: 'across', initiatedAt }, now)).toBe(false);
  });

  it('returns true when elapsed > threshold by 1 second', () => {
    const initiatedAt = new Date(now.getTime() - (threshold + 1) * 1000);
    expect(isStuck({ status: 'pending', bridge: 'across', initiatedAt }, now)).toBe(true);
  });

  it('returns true for a transfer that has been pending 60 minutes', () => {
    expect(
      isStuck({ status: 'pending', bridge: 'across', initiatedAt: minutesAgo(60) }, now),
    ).toBe(true);
  });
});

describe('isStuck – cctp threshold (2700 seconds / 45 minutes)', () => {
  const now = new Date();
  const threshold = STUCK_THRESHOLDS_SECONDS['cctp']!;

  it('returns false at 44 minutes (below threshold)', () => {
    const initiatedAt = new Date(now.getTime() - 44 * 60 * 1000);
    expect(isStuck({ status: 'pending', bridge: 'cctp', initiatedAt }, now)).toBe(false);
  });

  it('returns false at exactly 45 minutes (not strictly greater)', () => {
    const initiatedAt = new Date(now.getTime() - threshold * 1000);
    expect(isStuck({ status: 'pending', bridge: 'cctp', initiatedAt }, now)).toBe(false);
  });

  it('returns true at 46 minutes (above threshold)', () => {
    const initiatedAt = new Date(now.getTime() - 46 * 60 * 1000);
    expect(isStuck({ status: 'pending', bridge: 'cctp', initiatedAt }, now)).toBe(true);
  });
});

describe('isStuck – bridge with no threshold (unknown bridge)', () => {
  const now = new Date();

  it('returns false for a bridge not in STUCK_THRESHOLDS_SECONDS', () => {
    // wormhole / layerzero not yet verified — safe to return false (no false-positive)
    const initiatedAt = new Date(now.getTime() - 120 * 60 * 1000);
    expect(isStuck({ status: 'pending', bridge: 'wormhole', initiatedAt }, now)).toBe(false);
    expect(isStuck({ status: 'pending', bridge: 'layerzero', initiatedAt }, now)).toBe(false);
  });
});

describe('isStuck – initiatedAt in the future', () => {
  it('returns false when initiatedAt is in the future', () => {
    const now = new Date();
    const future = new Date(now.getTime() + 60_000);
    expect(isStuck({ status: 'pending', bridge: 'across', initiatedAt: future }, now)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getStuckSeverity — spec examples (DATA-MODEL.md §9.4)
// ---------------------------------------------------------------------------

describe('getStuckSeverity – spec examples', () => {
  it('returns low for amounts below $100K', () => {
    expect(getStuckSeverity(0)).toBe('low');
    expect(getStuckSeverity(1)).toBe('low');
    expect(getStuckSeverity(99_999)).toBe('low');
    expect(getStuckSeverity(50_000)).toBe('low');
  });

  it('returns medium at exactly $100K', () => {
    expect(getStuckSeverity(100_000)).toBe('medium');
  });

  it('returns medium for amounts $100K–$999,999', () => {
    expect(getStuckSeverity(100_000)).toBe('medium');
    expect(getStuckSeverity(500_000)).toBe('medium');
    expect(getStuckSeverity(999_999)).toBe('medium');
  });

  it('returns high at exactly $1M', () => {
    expect(getStuckSeverity(1_000_000)).toBe('high');
  });

  it('returns high for amounts above $1M', () => {
    expect(getStuckSeverity(1_000_001)).toBe('high');
    expect(getStuckSeverity(5_000_000)).toBe('high');
    expect(getStuckSeverity(10_000_000)).toBe('high');
  });
});

describe('getStuckSeverity – boundary values', () => {
  it('$99,999 → low (just below medium threshold)', () => {
    expect(getStuckSeverity(99_999)).toBe('low');
  });

  it('$100,000 → medium (at threshold, inclusive)', () => {
    expect(getStuckSeverity(100_000)).toBe('medium');
  });

  it('$999,999 → medium (just below high threshold)', () => {
    expect(getStuckSeverity(999_999)).toBe('medium');
  });

  it('$1,000,000 → high (at threshold, inclusive)', () => {
    expect(getStuckSeverity(1_000_000)).toBe('high');
  });
});

describe('getStuckSeverity – NaN/null/Infinity guard', () => {
  let warnSpy: jest.SpyInstance;
  beforeEach(() => {
    warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('returns low and warns for null amountUsd', () => {
    expect(getStuckSeverity(null)).toBe('low');
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('returns low and warns for NaN amountUsd', () => {
    expect(getStuckSeverity(NaN)).toBe('low');
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('returns low and warns for Infinity amountUsd', () => {
    expect(getStuckSeverity(Infinity)).toBe('low');
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('returns low and warns for -Infinity amountUsd', () => {
    expect(getStuckSeverity(-Infinity)).toBe('low');
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Constants alignment
// ---------------------------------------------------------------------------

describe('STUCK_THRESHOLDS_SECONDS – constants match spec (DATA-MODEL.md §6.1)', () => {
  it('across = 1800 seconds', () => expect(STUCK_THRESHOLDS_SECONDS['across']).toBe(1800));
  it('cctp = 2700 seconds',   () => expect(STUCK_THRESHOLDS_SECONDS['cctp']).toBe(2700));
  it('stargate = 1800 seconds', () => expect(STUCK_THRESHOLDS_SECONDS['stargate']).toBe(1800));
});

describe('STUCK_SEVERITY_THRESHOLDS – constants match spec (DATA-MODEL.md §9.4)', () => {
  it('MEDIUM = 100_000', () => expect(STUCK_SEVERITY_THRESHOLDS.MEDIUM).toBe(100_000));
  it('HIGH = 1_000_000', () => expect(STUCK_SEVERITY_THRESHOLDS.HIGH).toBe(1_000_000));
});

// ---------------------------------------------------------------------------
// StuckDetector.run() — integration of the detector loop
// ---------------------------------------------------------------------------

describe('StuckDetector.run() – no stuck transfers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindMany.mockResolvedValue([]);
    // Execute the interactive transaction callback through the tx proxy
    mockTransaction.mockImplementation((fn: (tx: typeof mockTxClient) => Promise<unknown>) =>
      fn(mockTxClient),
    );
    mockUpdateMany.mockResolvedValue({ count: 1 });
  });

  it('returns detected=0 when no pending transfers exceed thresholds', async () => {
    const result = await new StuckDetector().run();
    expect(result.detected).toBe(0);
    expect(result.bridgeBreakdown).toEqual({});
  });

  it('calls findMany for each bridge in STUCK_THRESHOLDS_SECONDS', async () => {
    await new StuckDetector().run();
    const bridges = Object.keys(STUCK_THRESHOLDS_SECONDS);
    expect(mockFindMany).toHaveBeenCalledTimes(bridges.length);
  });

  it('does not call $transaction when there are no stuck transfers', async () => {
    await new StuckDetector().run();
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});

describe('StuckDetector.run() – stuck transfers found', () => {
  const now = new Date();

  beforeEach(() => {
    jest.clearAllMocks();
    mockTransaction.mockImplementation((fn: (tx: typeof mockTxClient) => Promise<unknown>) =>
      fn(mockTxClient),
    );
    mockUpdateMany.mockResolvedValue({ count: 1 });
  });

  it('marks one across transfer as stuck and creates an anomaly', async () => {
    const transfer = makeTransfer({
      bridge: 'across',
      amountUsd: 50_000,
      initiatedAt: minutesAgo(60),
    });

    // Only across returns stuck transfers; all others return empty
    mockFindMany.mockImplementation(({ where }: { where: { bridge: string } }) =>
      Promise.resolve(where.bridge === 'across' ? [transfer] : []),
    );

    const result = await new StuckDetector().run();

    expect(result.detected).toBe(1);
    expect(result.bridgeBreakdown).toEqual({ across: 1 });
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  it('passes status "stuck" in the transfer updateMany with status guard', async () => {
    const transfer = makeTransfer({ bridge: 'across', amountUsd: 500_000 });
    mockFindMany.mockImplementation(({ where }: { where: { bridge: string } }) =>
      Promise.resolve(where.bridge === 'across' ? [transfer] : []),
    );

    await new StuckDetector().run();

    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'pending' }),
        data: { status: 'stuck' },
      }),
    );
  });

  it('assigns correct corridorId ({bridge}_{source}_{dest}) in anomaly', async () => {
    const transfer = makeTransfer({
      bridge: 'cctp',
      sourceChain: 'ethereum',
      destChain: 'base',
      amountUsd: 200_000,
    });
    mockFindMany.mockImplementation(({ where }: { where: { bridge: string } }) =>
      Promise.resolve(where.bridge === 'cctp' ? [transfer] : []),
    );

    await new StuckDetector().run();

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          corridorId: 'cctp_ethereum_base',
          anomalyType: 'stuck_transfer',
        }),
      }),
    );
  });

  it('assigns severity=low for $50K transfer', async () => {
    const transfer = makeTransfer({ bridge: 'across', amountUsd: 50_000 });
    mockFindMany.mockImplementation(({ where }: { where: { bridge: string } }) =>
      Promise.resolve(where.bridge === 'across' ? [transfer] : []),
    );

    await new StuckDetector().run();

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ severity: 'low' }),
      }),
    );
  });

  it('assigns severity=medium for $500K transfer', async () => {
    const transfer = makeTransfer({ bridge: 'across', amountUsd: 500_000 });
    mockFindMany.mockImplementation(({ where }: { where: { bridge: string } }) =>
      Promise.resolve(where.bridge === 'across' ? [transfer] : []),
    );

    await new StuckDetector().run();

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ severity: 'medium' }),
      }),
    );
  });

  it('assigns severity=high for $2M transfer', async () => {
    const transfer = makeTransfer({ bridge: 'across', amountUsd: 2_000_000 });
    mockFindMany.mockImplementation(({ where }: { where: { bridge: string } }) =>
      Promise.resolve(where.bridge === 'across' ? [transfer] : []),
    );

    await new StuckDetector().run();

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ severity: 'high' }),
      }),
    );
  });

  it('counts stuck transfers across multiple bridges independently', async () => {
    const acrossTransfer = makeTransfer({ bridge: 'across', amountUsd: 50_000 });
    const cctpTransfer = makeTransfer({
      id: 2n,
      transferId: 'test-transfer-2',
      bridge: 'cctp',
      amountUsd: 150_000,
    });

    mockFindMany.mockImplementation(({ where }: { where: { bridge: string } }) => {
      if (where.bridge === 'across') return Promise.resolve([acrossTransfer]);
      if (where.bridge === 'cctp') return Promise.resolve([cctpTransfer]);
      return Promise.resolve([]);
    });

    const result = await new StuckDetector().run();

    expect(result.detected).toBe(2);
    expect(result.bridgeBreakdown).toEqual({ across: 1, cctp: 1 });
    expect(mockTransaction).toHaveBeenCalledTimes(2);
  });

  it('includes pendingMinutes in anomaly details', async () => {
    const initiatedAt = new Date(now.getTime() - 90 * 60 * 1000); // 90 minutes ago
    const transfer = makeTransfer({ bridge: 'across', initiatedAt, amountUsd: 50_000 });
    mockFindMany.mockImplementation(({ where }: { where: { bridge: string } }) =>
      Promise.resolve(where.bridge === 'across' ? [transfer] : []),
    );

    await new StuckDetector().run();

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          details: expect.objectContaining({ pendingMinutes: 90 }),
        }),
      }),
    );
  });

  it('stores rounded amountUsd in anomaly details', async () => {
    const transfer = makeTransfer({ bridge: 'across', amountUsd: 50_123.78 });
    mockFindMany.mockImplementation(({ where }: { where: { bridge: string } }) =>
      Promise.resolve(where.bridge === 'across' ? [transfer] : []),
    );

    await new StuckDetector().run();

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          details: expect.objectContaining({ amountUsd: 50_124 }),
        }),
      }),
    );
  });

  it('stores null amountUsd in details when transfer has no amountUsd', async () => {
    const transfer = makeTransfer({ bridge: 'across', amountUsd: null });
    mockFindMany.mockImplementation(({ where }: { where: { bridge: string } }) =>
      Promise.resolve(where.bridge === 'across' ? [transfer] : []),
    );

    await new StuckDetector().run();

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          details: expect.objectContaining({ amountUsd: null }),
        }),
      }),
    );
  });
});

describe('StuckDetector.run() – error isolation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateMany.mockResolvedValue({ count: 1 });
  });

  it('continues to other bridges when findMany fails for one bridge', async () => {
    mockFindMany.mockImplementation(({ where }: { where: { bridge: string } }) => {
      if (where.bridge === 'across') return Promise.reject(new Error('DB connection lost'));
      return Promise.resolve([]);
    });

    const result = await new StuckDetector().run();

    expect(result.detected).toBe(0);
    // findMany called for every bridge (across failed, but rest proceeded)
    expect(mockFindMany).toHaveBeenCalledTimes(Object.keys(STUCK_THRESHOLDS_SECONDS).length);
  });

  it('continues to other transfers when $transaction fails for one', async () => {
    const transfer1 = makeTransfer({ id: 1n, transferId: 't1', bridge: 'across', amountUsd: 50_000 });
    const transfer2 = makeTransfer({ id: 2n, transferId: 't2', bridge: 'across', amountUsd: 50_000 });

    mockFindMany.mockImplementation(({ where }: { where: { bridge: string } }) =>
      Promise.resolve(where.bridge === 'across' ? [transfer1, transfer2] : []),
    );

    // First transaction call rejects; second executes the callback normally
    mockTransaction
      .mockRejectedValueOnce(new Error('Transaction failed'))
      .mockImplementation((fn: (tx: typeof mockTxClient) => Promise<unknown>) => fn(mockTxClient));

    const result = await new StuckDetector().run();

    expect(result.detected).toBe(1);
    expect(result.bridgeBreakdown).toEqual({ across: 1 });
  });

  it('skips anomaly creation when transfer was completed between query and transaction (race condition)', async () => {
    const transfer = makeTransfer({ bridge: 'across', amountUsd: 500_000 });
    mockFindMany.mockImplementation(({ where }: { where: { bridge: string } }) =>
      Promise.resolve(where.bridge === 'across' ? [transfer] : []),
    );

    // updateMany matches 0 rows — transfer was completed by a relayer
    mockUpdateMany.mockResolvedValue({ count: 0 });
    mockTransaction.mockImplementation((fn: (tx: typeof mockTxClient) => Promise<unknown>) =>
      fn(mockTxClient),
    );

    const result = await new StuckDetector().run();

    expect(result.detected).toBe(0);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
