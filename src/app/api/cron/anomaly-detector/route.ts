/**
 * Cron Route — Anomaly Detector
 *
 * Triggered by Vercel Cron every 15 minutes (configured in vercel.json).
 * Runs AnomalyDetector which scans all corridors and pools for:
 *   • Latency spikes  (current 1h p90 > 3× historical 7-day p90)
 *   • Failure clusters (failure rate > 10% in last hour)
 *   • Liquidity drops  (TVL drop > 15% in 24 hours)
 *
 * Schedule: every 15 minutes  (DATA-MODEL.md §11.2)
 *
 * Security
 * ────────
 * When CRON_SECRET is set (production), Vercel passes it as:
 *   Authorization: Bearer <CRON_SECRET>
 * Requests without a matching header are rejected with 401.
 *
 * When CRON_SECRET is absent (local development), the check is skipped so
 * the route can be called manually without configuration.
 *
 * Add to Vercel dashboard: Settings → Environment Variables → CRON_SECRET
 *
 * vercel.json entry:
 *   { "path": "/api/cron/anomaly-detector", "schedule": "every 15 minutes (cron: star/15 star star star star)" }
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { AnomalyDetector } from '../../../../jobs/anomaly-detector';
import { logger } from '../../../../lib/logger';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === 'production') {
    logger.error('[cron/anomaly-detector] CRON_SECRET is not set in production — refusing request');
    return NextResponse.json({ error: 'Endpoint not configured' }, { status: 500 });
  }

  try {
    const detector = new AnomalyDetector();
    const result = await detector.run();
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    logger.error('[cron/anomaly-detector] Unhandled error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
