import { describe, it, expect } from 'vitest';
import type { ParsedTransactionWithMeta } from '@solana/web3.js';
import { extractSolTransfers, mapTransferToTx } from '../src/mainnet.js';

// Minimal parsed-transaction fixture — pure data, no network.
const fixture = {
  slot: 448917114,
  blockTime: 1758000000,
  transaction: {
    signatures: ['5Kq9wRt8mK2p7v4yB8n3Xz19Pqm29L4V7x1BqM3K8dJuP8mK2p7v4yB8n3Xz19Pqm29'],
    message: {
      instructions: [
        {
          program: 'system',
          parsed: {
            type: 'transfer',
            info: { source: 'SRC_WALLET_111', destination: 'DST_WALLET_222', lamports: 2500000000 },
          },
        },
        {
          // duplicate of the above (also repeated via inner ix) — must be deduped
          program: 'system',
          parsed: {
            type: 'transfer',
            info: { source: 'SRC_WALLET_111', destination: 'DST_WALLET_222', lamports: 2500000000 },
          },
        },
        {
          // SPL token transfer — not native SOL, must be ignored
          program: 'spl-token',
          parsed: {
            type: 'transfer',
            info: { source: 'SRC_WALLET_111', destination: 'DST_WALLET_222', amount: '1000' },
          },
        },
      ],
    },
  },
  meta: { innerInstructions: [] },
} as unknown as ParsedTransactionWithMeta;

describe('mainnet transfer mapper (offline)', () => {
  it('extracts only native-SOL system transfers and dedupes repeats', () => {
    const transfers = extractSolTransfers(fixture);
    expect(transfers).toHaveLength(1);
    expect(transfers[0].source).toBe('SRC_WALLET_111');
    expect(transfers[0].destination).toBe('DST_WALLET_222');
    expect(transfers[0].lamports).toBe(2500000000);
    expect(transfers[0].slot).toBe(448917114);
  });

  it('maps lamports to SOL and preserves on-chain metadata', () => {
    const transfers = extractSolTransfers(fixture);
    const tx = mapTransferToTx(transfers[0], 0);
    expect(tx.amountSol).toBeCloseTo(2.5, 9);
    expect(tx.tokenSymbol).toBe('SOL');
    expect(tx.signature).toBe('5Kq9wRt8mK2p7v4yB8n3Xz19Pqm29L4V7x1BqM3K8dJuP8mK2p7v4yB8n3Xz19Pqm29');
    expect(tx.timestamp).toBe(1758000000 * 1000);
    expect(tx.memo).toBe('mainnet:slot:448917114');
    expect(tx.id).toContain('mainnet_');
  });
});
