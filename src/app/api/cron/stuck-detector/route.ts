/**
 * Cron Route — Stuck Transfer Detector
 *
 * Triggered by Vercel Cron every 1 minute (configured in vercel.json).
 * Runs StuckDetector which queries for pending transfers that have exceeded
 * their bridge-specific threshold and marks them as 'stuck', creating an
 * anomaly record for each.
 *
 * Schedule: every 1 minute  (DATA-MODEL.md §11.2)
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
 *   { "path": "/api/cron/stuck-detector", "schedule": "* * * * *" }
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { StuckDetector } from '../../../../jobs/stuck-detector';
import { logger } from '../../../../lib/logger';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === 'production') {
    logger.warn('[cron/stuck-detector] CRON_SECRET is not set — endpoint is unauthenticated');
  }

  try {
    const detector = new StuckDetector();
    const result = await detector.run();
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    logger.error('[cron/stuck-detector] Unhandled error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
