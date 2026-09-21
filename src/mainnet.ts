import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import type { ParsedTransactionWithMeta, ConfirmedSignaturesForAddress2Options } from '@solana/web3.js';
import { T3NClient } from './core/T3NClient.js';
import { ComplianceService } from './services/ComplianceService.js';
import { ReconciliationEngine } from './services/ReconciliationEngine.js';
import { TreasuryMonitor } from './services/TreasuryMonitor.js';
import type { TreasuryTransaction } from './types/index.js';

export const DEFAULT_RPC_ENDPOINT = 'https://api.mainnet-beta.solana.com';
// Solana System Program — a guaranteed-real, high-traffic address used as the
// default demo target. Pass --address to screen any wallet instead.
export const DEFAULT_DEMO_ADDRESS = '11111111111111111111111111111111';

/** One native-SOL transfer extracted from a parsed on-chain transaction. */
export interface ParsedTransfer {
  signature: string;
  slot: number;
  blockTime: number | null;
  source: string;
  destination: string;
  lamports: number;
}

function collectSystemTransfers(
  ix: unknown,
  out: ParsedTransfer[],
  seen: Set<string>,
  sig: string,
  slot: number,
  blockTime: number | null
): void {
  if (typeof ix !== 'object' || ix === null || !('parsed' in ix)) return;
  const holder = ix as { parsed?: unknown; program?: unknown };
  if (holder.program !== 'system') return; // native SOL only, not SPL tokens
  const parsed = holder.parsed as { type?: unknown; info?: unknown } | null | undefined;
  if (!parsed || typeof parsed !== 'object' || parsed.type !== 'transfer') return;
  const info = parsed.info as
    | { source?: unknown; destination?: unknown; lamports?: unknown }
    | null
    | undefined;
  if (!info || typeof info.source !== 'string' || typeof info.destination !== 'string') return;
  const lamports = Number(info.lamports);
  if (!Number.isFinite(lamports) || lamports <= 0) return;
  const key = `${info.source}:${info.destination}:${lamports}`;
  if (seen.has(key)) return; // dedupe repeats across outer + inner instructions
  seen.add(key);
  out.push({ signature: sig, slot, blockTime, source: info.source, destination: info.destination, lamports });
}

/** Extract native-SOL `system transfer` instructions from a parsed transaction. Pure function — no network. */
export function extractSolTransfers(tx: ParsedTransactionWithMeta): ParsedTransfer[] {
  const out: ParsedTransfer[] = [];
  const seen = new Set<string>();
  const sig = tx.transaction.signatures[0] ?? 'unknown';
  const slot = tx.slot;
  const blockTime = tx.blockTime ?? null;
  for (const ix of tx.transaction.message.instructions ?? []) {
    collectSystemTransfers(ix, out, seen, sig, slot, blockTime);
  }
  for (const inner of tx.meta?.innerInstructions ?? []) {
    for (const ix of inner.instructions ?? []) {
      collectSystemTransfers(ix, out, seen, sig, slot, blockTime);
    }
  }
  return out;
}

/** Map an on-chain transfer into the Sentinel's TreasuryTransaction shape. Pure function — no network. */
export function mapTransferToTx(t: ParsedTransfer, index: number): TreasuryTransaction {
  return {
    id: `mainnet_${t.signature.slice(0, 12)}_${index}`,
    signature: t.signature,
    fromAddress: t.source,
    toAddress: t.destination,
    amountSol: t.lamports / LAMPORTS_PER_SOL,
    tokenSymbol: 'SOL',
    timestamp: t.blockTime ? t.blockTime * 1000 : Date.now(),
    memo: `mainnet:slot:${t.slot}`,
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

export interface FetchOptions {
  address: string;
  limit: number;
  rpcEndpoint: string;
  timeoutMs: number;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Read-only fetch of recent native-SOL transfers for an address. No keypairs,
 * no signing. Retries a few times because public RPC endpoints (and sandbox
 * egress proxies) intermittently reset connections; throws only if every
 * attempt fails so the caller can fall back to simulated mode.
 */
export async function fetchRecentSolTransfers(opts: FetchOptions, attempts = 5): Promise<ParsedTransfer[]> {
  // NOTE: a fresh Connection per attempt — the sandbox egress proxy
  // intermittently resets reused keep-alive sockets ("other side closed"),
  // and a fresh agent per attempt proved far more reliable in testing.
  const pubkey = new PublicKey(opts.address); // throws on malformed address
  let lastError: unknown = new Error('no attempts made');
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const connection = new Connection(opts.rpcEndpoint, 'confirmed');
      const sigInfos = await withTimeout(
        connection.getSignaturesForAddress(pubkey, { limit: opts.limit }),
        opts.timeoutMs,
        'getSignaturesForAddress'
      );
      if (sigInfos.length === 0) return [];
      const parsed = await withTimeout(
        connection.getParsedTransactions(
          sigInfos.map((s) => s.signature),
          { maxSupportedTransactionVersion: 0 }
        ),
        opts.timeoutMs,
        'getParsedTransactions'
      );
      const out: ParsedTransfer[] = [];
      for (const ptx of parsed) {
        if (ptx) out.push(...extractSolTransfers(ptx));
      }
      return out;
    } catch (err) {
      lastError = err;
      if (attempt < attempts) await sleep(1000 * attempt);
    }
  }
  throw lastError;
}

function buildMonitor(): TreasuryMonitor {
  const t3nClient = new T3NClient();
  const complianceService = new ComplianceService(t3nClient);
  const reconciliationEngine = new ReconciliationEngine();
  return new TreasuryMonitor(complianceService, reconciliationEngine);
}

function syntheticFallbackTransfers(): ParsedTransfer[] {
  const blockTime = Math.floor(Date.now() / 1000);
  return [
    {
      signature: 'SIMULATED_FEED_legit_001',
      slot: 0,
      blockTime,
      source: 'SIM_TREASURY_DEMO',
      destination: 'SIM_VENDOR_DEMO',
      lamports: 2_500_000_000,
    },
    {
      signature: 'SIMULATED_FEED_sanctioned_002',
      slot: 0,
      blockTime,
      source: 'SIM_TREASURY_DEMO',
      destination: '4nK2L8wRt9mK2p7v4yB8n3Xz19Pqm29L4V7x1BqM3K8d',
      lamports: 500_000_000,
    },
  ];
}

async function screenAndPrint(monitor: TreasuryMonitor, transfers: ParsedTransfer[], max: number): Promise<void> {
  const shown = transfers.slice(0, max);
  for (let i = 0; i < shown.length; i++) {
    const tx = mapTransferToTx(shown[i], i);
    const { compliance } = await monitor.processTransaction(tx);
    const flagCodes = compliance.flags.map((f) => f.code).join(', ') || 'none';
    console.log(
      `  ${tx.signature.slice(0, 16)}… | ${tx.fromAddress.slice(0, 8)}… → ${tx.toAddress.slice(0, 8)}… | ` +
        `${tx.amountSol.toFixed(6)} SOL | risk ${compliance.riskScore}/100 ${compliance.riskLevel} | ` +
        `${compliance.recommendedAction} | flags: ${flagCodes}`
    );
  }
  const stats = monitor.getStats();
  console.log('\n  ── screening summary ──');
  console.log(
    `  transfers screened: ${shown.length} | approved: ${stats.approvedCount} | frozen: ${stats.frozenCount} | flagged for review: ${stats.reviewCount}`
  );
}

export async function runMainnetDemo(opts: {
  address: string;
  limit: number;
  rpcEndpoint: string;
  timeoutMs: number;
}): Promise<void> {
  console.log('\n================================================================================');
  console.log('   🛡️  T3N ENTERPRISE SENTINEL — READ-ONLY MAINNET SCREENING MODE');
  console.log('   Public RPC only. No keypairs, no signing, no broadcasting.');
  console.log('================================================================================\n');
  console.log(`[mainnet] target address: ${opts.address}`);
  console.log(`[mainnet] rpc endpoint:  ${opts.rpcEndpoint}`);

  const monitor = buildMonitor();
  let transfers: ParsedTransfer[];
  try {
    transfers = await fetchRecentSolTransfers(opts);
    if (transfers.length === 0) {
      console.log('[mainnet] no SOL transfers found in recent signatures for this address.');
      return;
    }
    console.log(`[mainnet] fetched ${transfers.length} SOL transfer(s) from recent on-chain activity — LIVE CHAIN DATA.\n`);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.log(`\n⚠️  RPC unreachable (${reason}).`);
    console.log('   Running in SIMULATED mode with a synthetic feed — no live chain data.\n');
    transfers = syntheticFallbackTransfers();
  }

  console.log('  signature…        | from → to              | amount      | risk      | action           | flags');
  await screenAndPrint(monitor, transfers, 10);
  console.log('\n[mainnet] done. Sentinel made zero network calls beyond the public RPC reads above.');
}

export interface WatchOptions {
  address: string;
  intervalSec: number;
  rpcEndpoint: string;
  timeoutMs: number;
  maxCycles: number; // 0 = run forever
}

/**
 * Polling watch mode: screens new signatures for a watched address every N
 * seconds and prints alerts. Watch mode is honest about its limits — if the
 * RPC is unreachable it refuses to run on fabricated data and exits.
 */
export async function runWatchMode(opts: WatchOptions): Promise<void> {
  const connection = new Connection(opts.rpcEndpoint, 'confirmed');
  const pubkey = new PublicKey(opts.address);

  console.log('\n================================================================================');
  console.log('   🛡️  T3N ENTERPRISE SENTINEL — POLLING WATCH MODE');
  console.log('   Screens new signatures for the watched address every N seconds.');
  console.log('   Read-only. No keypairs, no signing. Ctrl+C to stop.');
  console.log('================================================================================\n');

  const monitor = buildMonitor();
  let lastSeen: string | undefined;
  let baselineError: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const baseline = await withTimeout(
        connection.getSignaturesForAddress(pubkey, { limit: 1 }),
        opts.timeoutMs,
        'baseline getSignaturesForAddress'
      );
      lastSeen = baseline[0]?.signature;
      baselineError = null;
      break;
    } catch (err) {
      baselineError = err;
      if (attempt < 3) await sleep(1000 * attempt);
    }
  }
  if (baselineError) {
    const reason = baselineError instanceof Error ? baselineError.message : String(baselineError);
    console.error(`\n❌ watch mode requires a reachable RPC endpoint (${reason}).`);
    console.error('   Use `npm run demo:mainnet` instead — it falls back to a simulated feed when offline.');
    process.exit(1);
  }

  console.log(
    `[watch] watching ${opts.address} every ${opts.intervalSec}s (baseline: ${lastSeen ? lastSeen.slice(0, 16) + '…' : 'none yet'})\n`
  );

  let cycles = 0;
  let screened = 0;
  const seen = new Set<string>();
  let stopping = false;

  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    const stats = monitor.getStats();
    console.log(
      `\n[watch] stopped after ${cycles} cycle(s): ${screened} transfer(s) screened, ${stats.frozenCount} frozen, ${stats.reviewCount} flagged, ${stats.activeAlertsCount} active alert(s).`
    );
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  while (!stopping) {
    await sleep(opts.intervalSec * 1000);
    if (stopping) break;
    cycles++;
    try {
      const pollOptions: ConfirmedSignaturesForAddress2Options = { limit: 25 };
      if (lastSeen) pollOptions.until = lastSeen;
      const sigInfos = await withTimeout(
        connection.getSignaturesForAddress(pubkey, pollOptions),
        opts.timeoutMs,
        'poll getSignaturesForAddress'
      );
      const fresh = sigInfos.filter((s) => !seen.has(s.signature)).reverse();
      if (fresh.length === 0) {
        console.log(`[watch] cycle ${cycles}: no new signatures.`);
      } else {
        const parsed = await withTimeout(
          connection.getParsedTransactions(
            fresh.map((s) => s.signature),
            { maxSupportedTransactionVersion: 0 }
          ),
          opts.timeoutMs,
          'poll getParsedTransactions'
        );
        let newCount = 0;
        for (const ptx of parsed) {
          if (!ptx) continue;
          for (const t of extractSolTransfers(ptx)) {
            const tx = mapTransferToTx(t, newCount);
            const { compliance, alertTriggered } = await monitor.processTransaction(tx);
            newCount++;
            screened++;
            if (alertTriggered || compliance.recommendedAction !== 'APPROVE') {
              console.log(
                `[watch] 🚨 cycle ${cycles}: ${compliance.recommendedAction} ${tx.amountSol.toFixed(6)} SOL ` +
                  `${tx.fromAddress.slice(0, 8)}… → ${tx.toAddress.slice(0, 8)}… risk ${compliance.riskScore}/100 ` +
                  `[${compliance.flags.map((f) => f.code).join(', ')}]`
              );
            } else {
              console.log(
                `[watch] cycle ${cycles}: ✅ approved ${tx.amountSol.toFixed(6)} SOL ${tx.fromAddress.slice(0, 8)}… → ${tx.toAddress.slice(0, 8)}…`
              );
            }
          }
        }
        if (newCount === 0) console.log(`[watch] cycle ${cycles}: ${fresh.length} new signature(s), no SOL transfers.`);
      }
      if (sigInfos.length > 0) lastSeen = sigInfos[0].signature;
      for (const s of sigInfos) seen.add(s.signature);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.log(`[watch] cycle ${cycles}: RPC error (${reason}) — retrying next cycle.`);
    }
    if (opts.maxCycles > 0 && cycles >= opts.maxCycles) {
      shutdown();
    }
  }
}
