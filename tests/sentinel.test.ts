import { describe, it, expect, beforeEach } from 'vitest';
import { T3NClient } from '../src/core/T3NClient.js';
import { ComplianceService } from '../src/services/ComplianceService.js';
import { ReconciliationEngine } from '../src/services/ReconciliationEngine.js';
import { TreasuryMonitor } from '../src/services/TreasuryMonitor.js';
import type { TreasuryTransaction } from '../src/types/index.js';

describe('T3N Enterprise Sentinel Suite', () => {
  let t3nClient: T3NClient;
  let complianceService: ComplianceService;
  let reconciliationEngine: ReconciliationEngine;
  let monitor: TreasuryMonitor;

  const validVault = 'CORP_TREASURY_MAIN_CUbv4Hn4Y71ASzYn8j34YvFit55RbUPi6tLobVjmf';

  beforeEach(() => {
    t3nClient = new T3NClient();
    complianceService = new ComplianceService(t3nClient);
    reconciliationEngine = new ReconciliationEngine();
    monitor = new TreasuryMonitor(complianceService, reconciliationEngine);
  });

  it('authenticates legitimate officer DID with valid enterprise credentials', async () => {
    const auth = await t3nClient.authenticateSigner(
      'did:t3n:solana:treasury:officer:alice_v1',
      'TREASURY_OFFICER'
    );
    expect(auth.valid).toBe(true);
    expect(auth.identity?.organization).toBe('Solana Global Enterprises Inc.');
  });

  it('rejects unregistered or revoked DIDs', async () => {
    const auth = await t3nClient.authenticateSigner(
      'did:t3n:solana:hacker:unknown',
      'TREASURY_OFFICER'
    );
    expect(auth.valid).toBe(false);
    expect(auth.reason).toContain('not registered');
  });

  it('approves compliant enterprise transaction and reconciles with ERP invoice', async () => {
    const tx: TreasuryTransaction = {
      id: 'tx_test_01',
      signature: '5Kq9wRt8mK2p7v4yB8n3Xz19Pqm29L4V7x1BqM3K8dJuP',
      fromAddress: validVault,
      toAddress: 'AWS8kL2m9qP4v7yB8n3Xz19Pqm29L4V7x1BqM3K8dJuP',
      amountSol: 12.5,
      tokenSymbol: 'SOL',
      timestamp: Date.now(),
      memo: 'ERP:OPEX_INFRASTRUCTURE_AWS',
      initiatorDID: 'did:t3n:solana:treasury:officer:alice_v1',
    };

    const result = await monitor.processTransaction(tx, 'INV-AWS-8821');

    expect(result.compliance.passed).toBe(true);
    expect(result.compliance.recommendedAction).toBe('APPROVE');
    expect(result.compliance.didVerified).toBe(true);
    expect(result.reconciliation.status).toBe('MATCHED');
    expect(result.alertTriggered).toBe(false);
  });

  it('freezes transaction that exceeds daily treasury limit', async () => {
    const tx: TreasuryTransaction = {
      id: 'tx_test_excessive',
      signature: 'excessive_spend_sig_12345',
      fromAddress: validVault,
      toAddress: 'AWS8kL2m9qP4v7yB8n3Xz19Pqm29L4V7x1BqM3K8dJuP',
      amountSol: 100.0, // Vault daily limit is 50 SOL
      tokenSymbol: 'SOL',
      timestamp: Date.now(),
      initiatorDID: 'did:t3n:solana:treasury:officer:alice_v1',
    };

    const result = await monitor.processTransaction(tx);

    expect(result.compliance.passed).toBe(false);
    expect(result.compliance.recommendedAction).toBe('FREEZE_AND_ALERT');
    expect(result.compliance.flags.some((f) => f.code === 'DAILY_LIMIT_EXCEEDED')).toBe(true);
    expect(result.alertTriggered).toBe(true);
  });

  it('blocks transfer to known sanctioned / illicit address', async () => {
    const tx: TreasuryTransaction = {
      id: 'tx_test_sanctioned',
      signature: 'sanctioned_sig_99999',
      fromAddress: validVault,
      toAddress: '4nK2L8wRt9mK2p7v4yB8n3Xz19Pqm29L4V7x1BqM3K8d', // Sanctioned address
      amountSol: 2.0,
      tokenSymbol: 'SOL',
      timestamp: Date.now(),
      initiatorDID: 'did:t3n:solana:treasury:officer:alice_v1',
    };

    const result = await monitor.processTransaction(tx);

    expect(result.compliance.passed).toBe(false);
    expect(result.compliance.riskLevel).toBe('CRITICAL');
    expect(result.compliance.flags.some((f) => f.code === 'SANCTIONED_RECIPIENT')).toBe(true);
    expect(result.alertTriggered).toBe(true);
  });

  it('computes accurate audit statistics across processed transactions', async () => {
    // Tx 1: Good
    await monitor.processTransaction({
      id: 'tx_good',
      signature: 'sig_good',
      fromAddress: validVault,
      toAddress: 'AWS8kL2m9qP4v7yB8n3Xz19Pqm29L4V7x1BqM3K8dJuP',
      amountSol: 5.0,
      tokenSymbol: 'SOL',
      timestamp: Date.now(),
      initiatorDID: 'did:t3n:solana:treasury:officer:alice_v1',
    });

    // Tx 2: Sanctioned
    await monitor.processTransaction({
      id: 'tx_bad',
      signature: 'sig_bad',
      fromAddress: validVault,
      toAddress: '4nK2L8wRt9mK2p7v4yB8n3Xz19Pqm29L4V7x1BqM3K8d',
      amountSol: 1.0,
      tokenSymbol: 'SOL',
      timestamp: Date.now(),
    });

    const stats = monitor.getStats();
    expect(stats.totalProcessed).toBe(2);
    expect(stats.approvedCount).toBe(1);
    expect(stats.frozenCount).toBe(1);
    expect(stats.complianceRate).toBe(50.0);
  });
});
