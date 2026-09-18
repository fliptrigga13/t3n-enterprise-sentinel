import type {
  ComplianceResult,
  ReconciliationRecord,
  SentinelAlert,
  TreasuryAccount,
  TreasuryTransaction,
} from '../types/index.js';
import type { ComplianceService } from './ComplianceService.js';
import type { ReconciliationEngine } from './ReconciliationEngine.js';

export class TreasuryMonitor {
  private complianceService: ComplianceService;
  private reconciliationEngine: ReconciliationEngine;
  private accounts: Map<string, TreasuryAccount> = new Map();
  private alerts: SentinelAlert[] = [];
  private processedTransactions: {
    tx: TreasuryTransaction;
    compliance: ComplianceResult;
    reconciliation: ReconciliationRecord;
  }[] = [];

  constructor(complianceService: ComplianceService, reconciliationEngine: ReconciliationEngine) {
    this.complianceService = complianceService;
    this.reconciliationEngine = reconciliationEngine;
    this.seedDefaultTreasuryAccount();
  }

  private seedDefaultTreasuryAccount(): void {
    const defaultAccount: TreasuryAccount = {
      address: 'CORP_TREASURY_MAIN_CUbv4Hn4Y71ASzYn8j34YvFit55RbUPi6tLobVjmf',
      name: 'Global Enterprise Core Treasury Vault',
      balanceSol: 2500.0,
      dailyLimitSol: 50.0,
      spentTodaySol: 5.25,
      authorizedSignerDIDs: [
        'did:t3n:solana:treasury:officer:alice_v1',
        'did:t3n:solana:agent:sentinel:core',
      ],
      whitelistedDestinations: [
        'AWS8kL2m9qP4v7yB8n3Xz19Pqm29L4V7x1BqM3K8dJuP',
        'AUDIT9kL2m9qP4v7yB8n3Xz19Pqm29L4V7x1BqM3K8dJu',
        'PAYROLL_HOT_VAULT_77x1BqM3K8dJuP8mK2p7v4yB8n3Xz',
      ],
    };
    this.accounts.set(defaultAccount.address, defaultAccount);
  }

  public getAccount(address: string): TreasuryAccount | undefined {
    return this.accounts.get(address);
  }

  public async processTransaction(
    tx: TreasuryTransaction,
    invoiceId?: string
  ): Promise<{ compliance: ComplianceResult; reconciliation: ReconciliationRecord; alertTriggered: boolean }> {
    const account = this.accounts.get(tx.fromAddress) || {
      address: tx.fromAddress,
      name: 'Ad-hoc Monitored Vault',
      balanceSol: 100.0,
      dailyLimitSol: 10.0,
      spentTodaySol: 0,
      authorizedSignerDIDs: [],
      whitelistedDestinations: [],
    };

    // 1. Run compliance screening
    const compliance = await this.complianceService.evaluateTransaction(tx, account);

    // 2. Run reconciliation attestation
    const reconciliation = this.reconciliationEngine.reconcile(tx, invoiceId);

    let alertTriggered = false;

    // 3. Generate Alert if Compliance failed or flagged
    if (!compliance.passed || compliance.riskScore >= 40) {
      alertTriggered = true;
      const alert: SentinelAlert = {
        id: `alert_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        severity: compliance.riskLevel,
        title: `🚨 ${compliance.riskLevel} Risk Detected: ${compliance.flags.map((f) => f.code).join(', ')}`,
        details: `Tx ${tx.signature.substring(0, 12)}... from ${tx.fromAddress.substring(0, 8)} to ${tx.toAddress.substring(0, 8)} (${tx.amountSol} SOL). Action: ${compliance.recommendedAction}`,
        timestamp: Date.now(),
        resolved: false,
        actionTaken: compliance.recommendedAction === 'FREEZE_AND_ALERT' ? 'AUTOMATIC_POLICY_FREEZE' : 'DISPATCHED_TO_REVIEW_QUEUE',
      };
      this.alerts.push(alert);
    } else {
      // If passed and approved, deduct from daily spent
      account.spentTodaySol += tx.amountSol;
      account.balanceSol -= tx.amountSol;
    }

    this.processedTransactions.push({ tx, compliance, reconciliation });
    return { compliance, reconciliation, alertTriggered };
  }

  public getAlerts(): SentinelAlert[] {
    return [...this.alerts];
  }

  public getStats() {
    const totalVolumeSol = this.processedTransactions.reduce((sum, item) => sum + item.tx.amountSol, 0);
    const approvedCount = this.processedTransactions.filter((i) => i.compliance.passed).length;
    const frozenCount = this.processedTransactions.filter((i) => i.compliance.recommendedAction === 'FREEZE_AND_ALERT').length;
    const reviewCount = this.processedTransactions.filter((i) => i.compliance.recommendedAction === 'FLAG_FOR_REVIEW').length;
    const totalProcessed = this.processedTransactions.length;

    return {
      totalVolumeSol: Number(totalVolumeSol.toFixed(4)),
      totalProcessed,
      approvedCount,
      frozenCount,
      reviewCount,
      complianceRate: totalProcessed > 0 ? Number(((approvedCount / totalProcessed) * 100).toFixed(1)) : 100,
      activeAlertsCount: this.alerts.filter((a) => !a.resolved).length,
    };
  }
}
