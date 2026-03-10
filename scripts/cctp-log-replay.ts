/**
 * CCTP log replay — manual smoke test for src/scouts/cctp.ts
 *
 * Fetches recent DepositForBurn and MessageReceived logs from Ethereum mainnet,
 * runs them through inline parser functions (mirrors CCTPScout's parsers exactly),
 * and prints the results. Finishes with a transferId consistency check to verify
 * deposits and completions produce matching IDs.
 *
 * Run with:
 *   npm run cctp-replay
 *
 * Requires ALCHEMY_API_KEY in .env.local. No DB or Redis needed.
 *
 * Tuning:
 *   BLOCK_LOOKBACK  — how many recent Ethereum blocks to scan.
 *                     Alchemy free tier caps getLogs range at ~10 blocks.
 *                     Paid tier supports up to ~2000 (≈ 6 hours of Ethereum blocks).
 *   LOG_LIMIT       — max logs to parse per contract (default 5)
 *
 * If no logs are found, upgrade to a paid Alchemy plan and increase BLOCK_LOOKBACK.
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local BEFORE any module that calls requireEnv() is imported.
config({ path: resolve(process.cwd(), '.env.local') });

import { Interface, type Log } from 'ethers';
import { getProvider } from '../src/lib/rpc';
import {
  CCTP_TOKEN_MESSENGER_ADDRESSES,
  CCTP_MESSAGE_TRANSMITTER_ADDRESSES,
  CCTP_DOMAINS,
  CHAIN_IDS,
  type ChainName,
} from '../src/lib/constants';
import type { TransferEvent } from '../src/types';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BLOCK_LOOKBACK = 9; // Alchemy free tier caps getLogs at ~10 blocks; bump for paid tier
const LOG_LIMIT      = 5;   // logs to parse per contract

// ---------------------------------------------------------------------------
// Terminal output helpers
// ---------------------------------------------------------------------------

const GREEN  = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED    = '\x1b[31m';
const DIM    = '\x1b[2m';
const BOLD   = '\x1b[1m';
const RESET  = '\x1b[0m';

const ok     = (msg: string) => console.log(`  ${GREEN}✓${RESET}  ${msg}`);
const warn   = (msg: string) => console.log(`  ${YELLOW}⚠${RESET}  ${msg}`);
const fail   = (msg: string) => console.log(`  ${RED}✗${RESET}  ${msg}`);
const detail = (msg: string) => console.log(`${DIM}       ${msg}${RESET}`);
const header = (msg: string) => console.log(`\n${BOLD}${msg}${RESET}`);

// ---------------------------------------------------------------------------
// ABI + Interface (mirrors cctp.ts exactly)
// ---------------------------------------------------------------------------

const TOKEN_MESSENGER_IFACE = new Interface([
  'event DepositForBurn(uint64 indexed nonce, address indexed burnToken, uint256 amount, address indexed depositor, bytes32 mintRecipient, uint32 destinationDomain, bytes32 destinationTokenMessenger, bytes32 destinationCaller)',
]);

const MESSAGE_TRANSMITTER_IFACE = new Interface([
  'event MessageReceived(address indexed caller, uint32 sourceDomain, uint64 indexed nonce, bytes32 sender, bytes messageBody)',
]);

// ---------------------------------------------------------------------------
// Inline parse helpers (same logic as CCTPScout — no BaseScout/Redis import)
// ---------------------------------------------------------------------------

const COMPLETION_TOKEN_SENTINEL = '0x0000000000000000000000000000000000000000';

const CHAIN_ID_TO_NAME = new Map<number, ChainName>(
  (Object.entries(CHAIN_IDS) as [ChainName, number][]).map(([name, id]) => [id, name]),
);

const CCTP_DOMAIN_TO_CHAIN = new Map<number, ChainName>(
  (Object.entries(CCTP_DOMAINS) as [ChainName, number][]).map(([name, domain]) => [domain, name]),
);

function generateTransferId(sourceDomain: number, nonce: string): string {
  return `${sourceDomain}_${nonce}`;
}

function parseDepositEvent(log: Log, chainId: number, timestamp: Date): TransferEvent | null {
  const decoded = TOKEN_MESSENGER_IFACE.parseLog({
    topics: log.topics as string[],
    data: log.data,
  });

  if (decoded === null || decoded.name !== 'DepositForBurn') return null;

  const { nonce, burnToken, amount, destinationDomain } = decoded.args as unknown as {
    nonce: bigint;
    burnToken: string;
    amount: bigint;
    destinationDomain: bigint; // ethers v6 decodes uint32 as bigint
  };

  const sourceChain = CHAIN_ID_TO_NAME.get(chainId);
  if (sourceChain === undefined) return null;

  const sourceDomain = CCTP_DOMAINS[sourceChain];
  if (sourceDomain === undefined) return null;

  const destChain = CCTP_DOMAIN_TO_CHAIN.get(Number(destinationDomain));
  if (destChain === undefined) return null;

  return {
    type: 'initiation',
    transferId: generateTransferId(sourceDomain, nonce.toString()),
    bridge: 'cctp',
    sourceChain,
    destChain,
    tokenAddress: burnToken.toLowerCase(),
    amount,
    timestamp,
    txHash: log.transactionHash,
    blockNumber: BigInt(log.blockNumber),
  };
}

function parseFillEvent(log: Log, chainId: number, timestamp: Date): TransferEvent | null {
  const decoded = MESSAGE_TRANSMITTER_IFACE.parseLog({
    topics: log.topics as string[],
    data: log.data,
  });

  if (decoded === null || decoded.name !== 'MessageReceived') return null;

  const { sourceDomain, nonce } = decoded.args as unknown as {
    sourceDomain: bigint; // ethers v6 decodes uint32 as bigint
    nonce: bigint;
  };

  const sourceChain = CCTP_DOMAIN_TO_CHAIN.get(Number(sourceDomain));
  if (sourceChain === undefined) return null;

  const destChain = CHAIN_ID_TO_NAME.get(chainId);
  if (destChain === undefined) return null;

  return {
    type: 'completion',
    transferId: generateTransferId(Number(sourceDomain), nonce.toString()),
    bridge: 'cctp',
    sourceChain,
    destChain,
    tokenAddress: COMPLETION_TOKEN_SENTINEL,
    amount: 0n,
    timestamp,
    txHash: log.transactionHash,
    blockNumber: BigInt(log.blockNumber),
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(`\n${DIM}CCTP Log Replay — src/scouts/cctp.ts${RESET}`);
  console.log(`${DIM}Ethereum mainnet | last ${BLOCK_LOOKBACK} blocks | up to ${LOG_LIMIT} logs per contract${RESET}\n`);

  const provider = getProvider('ethereum');

  const latestBlock = await provider.getBlockNumber();
  const fromBlock   = latestBlock - BLOCK_LOOKBACK;

  console.log(`  Scanning blocks ${fromBlock.toLocaleString()} – ${latestBlock.toLocaleString()}`);

  // -------------------------------------------------------------------------
  // 1. DepositForBurn
  // -------------------------------------------------------------------------

  header('1.  DepositForBurn  (TokenMessenger → parseDepositEvent)');

  const depositTopic = TOKEN_MESSENGER_IFACE.getEvent('DepositForBurn')!.topicHash;
  const depositLogs  = await provider.getLogs({
    address: CCTP_TOKEN_MESSENGER_ADDRESSES.ethereum!,
    topics:  [depositTopic],
    fromBlock,
    toBlock: latestBlock,
  });

  if (depositLogs.length === 0) {
    warn(`No DepositForBurn logs in this window — try increasing BLOCK_LOOKBACK`);
  } else {
    console.log(`\n  Found ${depositLogs.length} log(s). Parsing first ${Math.min(LOG_LIMIT, depositLogs.length)}:\n`);
  }

  const parsedDeposits: TransferEvent[] = [];

  for (const log of depositLogs.slice(0, LOG_LIMIT)) {
    const block     = await provider.getBlock(log.blockNumber);
    const timestamp = block !== null ? new Date(block.timestamp * 1000) : new Date();

    const shortTx = `${log.transactionHash.slice(0, 20)}…`;

    let event: TransferEvent | null;
    try {
      event = parseDepositEvent(log, 1 /* ethereum chainId */, timestamp);
    } catch (err) {
      fail(`block ${log.blockNumber}  tx ${shortTx}  → parse threw: ${err}`);
      continue;
    }

    if (event === null) {
      fail(`block ${log.blockNumber}  tx ${shortTx}  → parseDepositEvent returned null`);
      continue;
    }

    ok(`block ${log.blockNumber}  tx ${shortTx}`);
    detail(`transferId:   ${event.transferId}`);
    detail(`sourceChain:  ${event.sourceChain}`);
    detail(`destChain:    ${event.destChain}`);
    detail(`tokenAddress: ${event.tokenAddress}`);
    detail(`amount:       ${event.amount.toString()} (raw, 6 decimals → ${Number(event.amount) / 1e6} USDC)`);
    detail(`timestamp:    ${event.timestamp.toISOString()}`);

    parsedDeposits.push(event);
  }

  // -------------------------------------------------------------------------
  // 2. MessageReceived
  // -------------------------------------------------------------------------

  header('2.  MessageReceived  (MessageTransmitter → parseFillEvent)');

  const receiveTopic = MESSAGE_TRANSMITTER_IFACE.getEvent('MessageReceived')!.topicHash;
  const receiveLogs  = await provider.getLogs({
    address: CCTP_MESSAGE_TRANSMITTER_ADDRESSES.ethereum!,
    topics:  [receiveTopic],
    fromBlock,
    toBlock: latestBlock,
  });

  if (receiveLogs.length === 0) {
    warn(`No MessageReceived logs in this window — try increasing BLOCK_LOOKBACK`);
  } else {
    console.log(`\n  Found ${receiveLogs.length} log(s). Parsing first ${Math.min(LOG_LIMIT, receiveLogs.length)}:\n`);
  }

  const parsedFills: TransferEvent[] = [];

  for (const log of receiveLogs.slice(0, LOG_LIMIT)) {
    const block     = await provider.getBlock(log.blockNumber);
    const timestamp = block !== null ? new Date(block.timestamp * 1000) : new Date();

    const shortTx = `${log.transactionHash.slice(0, 20)}…`;

    let event: TransferEvent | null;
    try {
      event = parseFillEvent(log, 1 /* ethereum chainId — dest */, timestamp);
    } catch (err) {
      fail(`block ${log.blockNumber}  tx ${shortTx}  → parse threw: ${err}`);
      continue;
    }

    if (event === null) {
      fail(`block ${log.blockNumber}  tx ${shortTx}  → parseFillEvent returned null`);
      continue;
    }

    ok(`block ${log.blockNumber}  tx ${shortTx}`);
    detail(`transferId:   ${event.transferId}`);
    detail(`sourceChain:  ${event.sourceChain}  (resolved from sourceDomain in event args)`);
    detail(`destChain:    ${event.destChain}`);
    detail(`tokenAddress: ${event.tokenAddress}  ← sentinel (zero address, expected)`);
    detail(`amount:       ${event.amount.toString()}  ← sentinel (0n, expected)`);
    detail(`timestamp:    ${event.timestamp.toISOString()}`);

    parsedFills.push(event);
  }

  // -------------------------------------------------------------------------
  // 3. TransferId consistency check
  // -------------------------------------------------------------------------

  header('3.  TransferId consistency');

  const depositIdSet  = new Set(parsedDeposits.map(e => e.transferId));
  const matchingFills = parsedFills.filter(e => depositIdSet.has(e.transferId));

  if (matchingFills.length > 0) {
    ok(`${matchingFills.length} completion(s) share a transferId with a deposit in this window`);
    for (const fill of matchingFills) {
      detail(`transferId: ${fill.transferId}`);
    }
  } else {
    warn('No overlapping transferIds in this window');
    detail('Expected — deposits and their completions often span different block windows.');
    detail('This does NOT indicate a bug. Increase BLOCK_LOOKBACK to widen the search.');
  }

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------

  header('Summary');

  const attempted = Math.min(LOG_LIMIT, depositLogs.length) + Math.min(LOG_LIMIT, receiveLogs.length);
  const succeeded = parsedDeposits.length + parsedFills.length;

  if (attempted === 0) {
    warn('No logs found — RPC is working but no CCTP activity in this window');
    detail('Try: BLOCK_LOOKBACK=5000 npx tsx scripts/cctp-log-replay.ts');
  } else if (succeeded === attempted) {
    ok(`${succeeded}/${attempted} logs parsed successfully — parsers are working against live mainnet data`);
  } else {
    fail(`${succeeded}/${attempted} logs parsed — ${attempted - succeeded} parse failure(s) above`);
  }

  console.log('');
  process.exit(succeeded < attempted ? 1 : 0);
}

main().catch(err => {
  console.error('\nUnexpected error:', err);
  process.exit(1);
});
