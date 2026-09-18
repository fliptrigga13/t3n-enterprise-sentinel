import { T3NClient } from './core/T3NClient.js';
import { ComplianceService } from './services/ComplianceService.js';
import { ReconciliationEngine } from './services/ReconciliationEngine.js';
import { TreasuryMonitor } from './services/TreasuryMonitor.js';
import type { TreasuryTransaction } from './types/index.js';

async function runDemo() {
  console.log('\n================================================================================');
  console.log('   🛡️  T3N ENTERPRISE SENTINEL: AUTONOMOUS SOLANA TREASURY & COMPLIANCE AGENT');
  console.log('   Powered by Terminal 3 Network (T3N) Decentralized Identity & Attestation');
  console.log('================================================================================\n');

  const t3nClient = new T3NClient();
  const complianceService = new ComplianceService(t3nClient);
  const reconciliationEngine = new ReconciliationEngine();
  const monitor = new TreasuryMonitor(complianceService, reconciliationEngine);

  const treasuryVault = 'CORP_TREASURY_MAIN_CUbv4Hn4Y71ASzYn8j34YvFit55RbUPi6tLobVjmf';

  console.log(`[STATUS] Initializing T3N DID Resolution Mesh... Connected.`);
  console.log(`[STATUS] Monitoring Vault: ${treasuryVault}`);
  console.log(`[STATUS] Daily Cap: 50.00 SOL | Current Vault Balance: 2500.00 SOL\n`);

  // Scenario 1: Legitimate Authorized AWS Cloud Infrastructure Bill
  console.log('--- [SCENARIO 1: LEGITIMATE ENTERPRISE OPEX TRANSFER] ---');
  const tx1: TreasuryTransaction = {
    id: 'tx_aws_001',
    signature: '5Kq9wRt8mK2p7v4yB8n3Xz19Pqm29L4V7x1BqM3K8dJuP8mK2p7v4yB8n3Xz19Pqm29',
    fromAddress: treasuryVault,
    toAddress: 'AWS8kL2m9qP4v7yB8n3Xz19Pqm29L4V7x1BqM3K8dJuP',
    amountSol: 12.5,
    tokenSymbol: 'SOL',
    timestamp: Date.now(),
    memo: 'ERP:OPEX_INFRASTRUCTURE_AWS',
    initiatorDID: 'did:t3n:solana:treasury:officer:alice_v1',
  };

  const res1 = await monitor.processTransaction(tx1, 'INV-AWS-8821');
  console.log(`Tx 1 Result: ${res1.compliance.recommendedAction} (Risk Score: ${res1.compliance.riskScore}/100)`);
  console.log(`  DID Verified: ${res1.compliance.didVerified} (${res1.compliance.didDetails?.organization})`);
  console.log(`  ERP Reconciliation: ${res1.reconciliation.status} [Proof: ${res1.reconciliation.proofHash.substring(0, 16)}...]\n`);

  // Scenario 2: Unauthorized Large Transfer with Missing DID & Non-whitelisted Address
  console.log('--- [SCENARIO 2: UNAUTHORIZED ROGUE TRANSFER ATTEMPT] ---');
  const tx2: TreasuryTransaction = {
    id: 'tx_breach_002',
    signature: '3Jp7v4yB8n3Xz19Pqm29L4V7x1BqM3K8dJuP8mK2p7v4yB8n3Xz19Pqm29L4V7x1B',
    fromAddress: treasuryVault,
    toAddress: 'UNKNOWN_HACKER_WALLET_99x1BqM3K8dJuP8mK2p7v4yB8',
    amountSol: 120.0, // Exceeds daily cap of 50 SOL!
    tokenSymbol: 'SOL',
    timestamp: Date.now() + 1000,
    memo: 'Emergency Treasury Drain',
    // Missing initiatorDID
  };

  const res2 = await monitor.processTransaction(tx2);
  console.log(`Tx 2 Result: ⛔ ${res2.compliance.recommendedAction} (Risk Score: ${res2.compliance.riskScore}/100)`);
  console.log(`  Risk Level: ${res2.compliance.riskLevel}`);
  console.log(`  Compliance Flags Triggered:`);
  res2.compliance.flags.forEach((f) => console.log(`    - [${f.severity}] ${f.code}: ${f.description}`));
  console.log(`  Action Taken: Automatic Treasury Policy Freeze Dispatched.\n`);

  // Scenario 3: Transfer to Known Sanctioned Address
  console.log('--- [SCENARIO 3: SANCTIONED / OFAC ADDRESS ATTEMPT] ---');
  const tx3: TreasuryTransaction = {
    id: 'tx_sanction_003',
    signature: '7Nm3Xz19Pqm29L4V7x1BqM3K8dJuP8mK2p7v4yB8n3Xz19Pqm29L4V7x1BqM3K8',
    fromAddress: treasuryVault,
    toAddress: '4nK2L8wRt9mK2p7v4yB8n3Xz19Pqm29L4V7x1BqM3K8d', // Sanctioned list
    amountSol: 5.0,
    tokenSymbol: 'SOL',
    timestamp: Date.now() + 2000,
    initiatorDID: 'did:t3n:solana:treasury:officer:alice_v1',
  };

  const res3 = await monitor.processTransaction(tx3);
  console.log(`Tx 3 Result: ⛔ ${res3.compliance.recommendedAction} (Risk Score: ${res3.compliance.riskScore}/100)`);
  res3.compliance.flags.forEach((f) => console.log(`    - [${f.severity}] ${f.code}: ${f.description}`));
  console.log(`  Action Taken: Alert Logged and Incident Dispatched.\n`);

  // Final Summary Dashboard
  const stats = monitor.getStats();
  console.log('================================================================================');
  console.log('                         AUDIT & COMPLIANCE SUMMARY                             ');
  console.log('================================================================================');
  console.log(`  Total Volume Inspected:  ${stats.totalVolumeSol} SOL`);
  console.log(`  Total Transactions:      ${stats.totalProcessed}`);
  console.log(`  Approved & Reconciled:   ${stats.approvedCount}`);
  console.log(`  Automated Freezes:       ${stats.frozenCount}`);
  console.log(`  Compliance Pass Rate:    ${stats.complianceRate}%`);
  console.log(`  Active Security Alerts:  ${stats.activeAlertsCount}`);
  console.log('================================================================================\n');
}

const command = process.argv[2] || 'demo';

if (command === 'demo' || command === 'start' || command === 'simulate-breach') {
  runDemo().catch((err) => {
    console.error('Fatal Sentinel Error:', err);
    process.exit(1);
  });
} else {
  console.log(`Usage: tsx src/cli.ts [demo|start|simulate-breach]`);
}
