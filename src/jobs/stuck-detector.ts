/**
 * Stuck Transfer Detector
 *
 * Scans all monitored bridges for pending transfers that have exceeded their
 * bridge-specific timeout threshold and marks them as 'stuck'.
 *
 * For each stuck transfer, this job atomically:
 *   1. Updates transfer.status → 'stuck'
 *   2. Creates an anomaly record (type: 'stuck_transfer')
 *
 * Designed to run every 1 minute via Vercel Cron (DATA-MODEL.md §11.2).
 *
 * Thresholds:  DATA-MODEL.md §6.1   (STUCK_THRESHOLDS_SECONDS)
 * Severity:    DATA-MODEL.md §9.4   (STUCK_SEVERITY_THRESHOLDS)
 * Corridor ID: DATA-MODEL.md §13.2  ({bridge}_{sourceChain}_{destChain})
 */

import type { Prisma } from '@prisma/client';

import { db } from '../lib/db';
import { logger } from '../lib/logger';
import { STUCK_THRESHOLDS_SECONDS, STUCK_SEVERITY_THRESHOLDS } from '../lib/constants';
import type { BridgeName } from '../lib/constants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StuckSeverity = 'low' | 'medium' | 'high';

export interface StuckDetectorResult {
  /** Total number of transfers marked stuck in this run. */
  detected: number;
  /** Count of stuck transfers per bridge. */
  bridgeBreakdown: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Pure functions (exported for unit testing)
// ---------------------------------------------------------------------------

/**
 * Determine whether a transfer has exceeded its bridge's stuck threshold.
 *
 * Mirrors the detection logic from DATA-MODEL.md §6.2:
 *   if transfer.status !== 'pending': return false
 *   elapsed = (now - initiatedAt) / 1000
 *   return elapsed > threshold
 *
 * NOTE: StuckDetector.run() does NOT call this function. Detection happens at
 * the database level via a Prisma `initiatedAt: { lt: cutoff }` query, which is
 * equivalent and more efficient. This function exists for unit testing and as
 * executable documentation of the threshold logic. Keep the two in sync.
 *
 * Returns false (safe, no false-positive) when:
 *   - transfer is not pending
 *   - bridge has no threshold defined in STUCK_THRESHOLDS_SECONDS
 *   - initiatedAt is in the future relative to `now`
 */
export function isStuck(
  transfer: { status: string; initiatedAt: Date; bridge: string },
  now: Date,
): boolean {
  if (transfer.status !== 'pending') return false;

  // Cast to Record<string, number | undefined> so an unrecognised bridge name
  // returns undefined rather than a type error — isStuck intentionally accepts
  // any string to keep callers simple and return false for unknown bridges.
  const threshold = (STUCK_THRESHOLDS_SECONDS as Record<string, number | undefined>)[transfer.bridge];
  if (threshold === undefined) return false;

  const elapsedSeconds = (now.getTime() - transfer.initiatedAt.getTime()) / 1000;
  return elapsedSeconds > threshold;
}

/**
 * Assign anomaly severity from a USD transfer amount (DATA-MODEL.md §9.4).
 *
 *   < $100K               → 'low'
 *   $100K – $999,999      → 'medium'
 *   ≥ $1M                 → 'high'
 *   null / NaN / Infinity → warn + return 'low' (conservative: avoids alert noise
 *                           from data gaps; the transfer is still marked stuck)
 */
export function getStuckSeverity(amountUsd: number | null): StuckSeverity {
  if (amountUsd === null || !Number.isFinite(amountUsd)) {
    logger.warn('[StuckDetector] amountUsd is null/NaN/Infinity — defaulting severity to low', {
      amountUsd,
    });
    return 'low';
  }

  if (amountUsd >= STUCK_SEVERITY_THRESHOLDS.HIGH) return 'high';
  if (amountUsd >= STUCK_SEVERITY_THRESHOLDS.MEDIUM) return 'medium';
  return 'low';
}

// ---------------------------------------------------------------------------
// Detector class
// ---------------------------------------------------------------------------

export class StuckDetector {
  /**
   * Main entry point. Iterates over all bridges with defined thresholds,
   * queries for overdue pending transfers, and marks each as stuck.
   *
   * Errors for any individual bridge or transfer are logged and skipped so
   * one failure cannot abort the entire run.
   */
  async run(): Promise<StuckDetectorResult> {
    const now = new Date();
    const bridgeBreakdown: Record<string, number> = {};
    let detected = 0;

    for (const [bridge, thresholdSeconds] of Object.entries(STUCK_THRESHOLDS_SECONDS) as [BridgeName, number][]) {
      // Guard: ignore any threshold that was somehow set to a non-positive finite number.
      if (!Number.isFinite(thresholdSeconds) || thresholdSeconds <= 0) {
        logger.warn('[StuckDetector] Ignoring invalid threshold for bridge', {
          bridge,
          thresholdSeconds,
        });
        continue;
      }

      const cutoff = new Date(now.getTime() - thresholdSeconds * 1000);

      let stuckTransfers: Array<{
        id: bigint;
        transferId: string;
        bridge: string;
        sourceChain: string;
        destChain: string;
        amountUsd: Prisma.Decimal | null;
        initiatedAt: Date;
      }>;

      try {
        stuckTransfers = await db.transfer.findMany({
          where: {
            bridge,
            status: 'pending',
            initiatedAt: { lt: cutoff },
          },
          select: {
            id: true,
            transferId: true,
            bridge: true,
            sourceChain: true,
            destChain: true,
            amountUsd: true,
            initiatedAt: true,
          },
        });
      } catch (error) {
        logger.error('[StuckDetector] DB query failed for bridge — skipping', {
          bridge,
          error: error instanceof Error ? error.message : String(error),
        });
        continue;
      }

      if (stuckTransfers.length > 0) {
        logger.info('[StuckDetector] Found stuck transfers for bridge', {
          bridge,
          count: stuckTransfers.length,
          thresholdSeconds,
        });
      }

      for (const transfer of stuckTransfers) {
        const success = await this.markStuck(transfer, now);
        if (success) {
          detected++;
          bridgeBreakdown[bridge] = (bridgeBreakdown[bridge] ?? 0) + 1;
        }
      }
    }

    logger.info('[StuckDetector] Run complete', { detected, bridgeBreakdown });
    return { detected, bridgeBreakdown };
  }

  /**
   * Atomically mark one transfer as stuck and create the matching anomaly.
   *
   * Uses an interactive transaction with a status guard on the update so that a
   * transfer completed between the initial findMany query and this transaction
   * (race condition) is never overwritten. If updateMany matches 0 rows the
   * anomaly is skipped and the method returns false without error.
   *
   * Returns true when the transfer was marked stuck, false otherwise (either
   * skipped due to status change or failed due to a transaction error).
   */
  private async markStuck(
    transfer: {
      id: bigint;
      transferId: string;
      bridge: string;
      sourceChain: string;
      destChain: string;
      amountUsd: Prisma.Decimal | null;
      initiatedAt: Date;
    },
    now: Date,
  ): Promise<boolean> {
    const pendingMinutes = Math.floor(
      (now.getTime() - transfer.initiatedAt.getTime()) / 60_000,
    );

    // Prisma Decimal → number. toNumber() is always finite for a valid Decimal;
    // guard in getStuckSeverity handles any edge-case that slips through.
    const rawAmountUsd =
      transfer.amountUsd !== null ? transfer.amountUsd.toNumber() : null;

    const severity = getStuckSeverity(rawAmountUsd);
    const corridorId = `${transfer.bridge}_${transfer.sourceChain}_${transfer.destChain}`;

    try {
      let marked = false;

      await db.$transaction(async (tx) => {
        // Guard: only update if still pending. If a relayer filled the transfer
        // between our findMany query and now, count will be 0 and we skip the
        // anomaly rather than corrupting a completed record.
        const { count } = await tx.transfer.updateMany({
          where: { id: transfer.id, status: 'pending' },
          data: { status: 'stuck' },
        });

        if (count === 0) return;

        await tx.anomaly.create({
          data: {
            anomalyType: 'stuck_transfer',
            corridorId,
            bridge: transfer.bridge as BridgeName,
            sourceChain: transfer.sourceChain,
            destChain: transfer.destChain,
            severity,
            detectedAt: now,
            details: {
              transferId: transfer.transferId,
              pendingMinutes,
              // Round to whole dollars per DATA-MODEL.md §12.1 (amountUsd: 0 decimals)
              amountUsd: rawAmountUsd !== null ? Math.round(rawAmountUsd) : null,
            },
          },
        });

        marked = true;
      });

      if (marked) {
        logger.info('[StuckDetector] Marked transfer as stuck', {
          transferId: transfer.transferId,
          bridge: transfer.bridge,
          corridorId,
          pendingMinutes,
          severity,
          amountUsd: rawAmountUsd !== null ? Math.round(rawAmountUsd) : null,
        });
      } else {
        logger.info('[StuckDetector] Transfer no longer pending — skipped', {
          transferId: transfer.transferId,
          corridorId,
        });
      }

      return marked;
    } catch (error) {
      logger.error('[StuckDetector] Failed to mark transfer as stuck', {
        transferId: transfer.transferId,
        corridorId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }
}
