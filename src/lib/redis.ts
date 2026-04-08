/**
 * Redis client singletons and pub/sub helpers.
 *
 * Two clients are required:
 *   - `redis`           — general-purpose client (GET, SET, publish, etc.)
 *   - `redisSubscriber` — dedicated subscriber client
 *
 * Redis protocol forbids issuing any command other than SUBSCRIBE/UNSUBSCRIBE
 * on a connection that has entered pub/sub mode, so the two clients must be
 * separate connections.
 *
 * The globalThis pattern prevents connection pool exhaustion during Next.js
 * hot-reload in development (same reason as db.ts).
 */
import Redis from 'ioredis';
import superjson from 'superjson';

import { requireEnv } from './env';
import type { RedisChannel } from './constants';

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
  redisSubscriber: Redis | undefined;
};

function createClient(): Redis {
  return new Redis(requireEnv('REDIS_URL'));
}

// Lazy getters — clients are created on first access at runtime, not at
// module import time. This allows `next build` to import route modules
// without REDIS_URL being present in the build environment.
function getRedis(): Redis {
  if (!globalForRedis.redis) {
    globalForRedis.redis = createClient();
  }
  return globalForRedis.redis;
}

function getRedisSubscriber(): Redis {
  if (!globalForRedis.redisSubscriber) {
    globalForRedis.redisSubscriber = createClient();
  }
  return globalForRedis.redisSubscriber;
}

export const redis: Redis = new Proxy({} as Redis, {
  get(_target, prop) {
    return (getRedis() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export const redisSubscriber: Redis = new Proxy({} as Redis, {
  get(_target, prop) {
    return (getRedisSubscriber() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

// ---------------------------------------------------------------------------
// Pub/sub helpers
// ---------------------------------------------------------------------------

/**
 * Publish a message to a Redis channel.
 *
 * Uses superjson for serialisation so bigint and Date values are preserved
 * correctly across the wire.
 */
export async function publish(channel: RedisChannel, message: unknown): Promise<void> {
  await redis.publish(channel, superjson.stringify(message));
}

/**
 * Per-channel message handlers. A single top-level 'message' listener on
 * redisSubscriber dispatches to the correct handler, preventing listener
 * accumulation when subscribe() is called multiple times for the same channel
 * (e.g. during Next.js hot-reload in development).
 */
const channelHandlers = new Map<string, (raw: string) => void>();

// Deferred — registered on first subscribe() call, not at module load.
// This prevents the Proxy from triggering requireEnv('REDIS_URL') during
// `next build`'s module-import phase.
let messageListenerRegistered = false;

function ensureMessageListener(): void {
  if (messageListenerRegistered) return;
  messageListenerRegistered = true;
  getRedisSubscriber().on('message', (receivedChannel: string, raw: string) => {
    channelHandlers.get(receivedChannel)?.(raw);
  });
}

/**
 * Subscribe to a Redis channel and invoke `handler` for each message.
 *
 * Safe to call multiple times for the same channel — subsequent calls replace
 * the handler (last-write-wins) without accumulating duplicate listeners.
 *
 * Uses superjson for deserialisation so bigint and Date values are restored
 * to their original types before being passed to the handler.
 */
export async function subscribe<T = unknown>(
  channel: RedisChannel,
  handler: (message: T) => void,
): Promise<void> {
  ensureMessageListener();
  if (!channelHandlers.has(channel)) {
    await getRedisSubscriber().subscribe(channel);
  }
  channelHandlers.set(channel, (raw: string) => handler(superjson.parse<T>(raw)));
}
