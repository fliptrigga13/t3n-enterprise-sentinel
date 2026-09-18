import type {
  ComplianceFlag,
  ComplianceResult,
  RiskLevel,
  TreasuryAccount,
  TreasuryTransaction,
} from '../types/index.js';
import type { T3NClient } from '../core/T3NClient.js';

const KNOWN_SANCTIONED_ADDRESSES = new Set([
  '4nK2L8wRt9mK2p7v4yB8n3Xz19Pqm29L4V7x1BqM3K8d', // Mock Tornado / sanctioned router
  '9qA1B2c3D4e5F6g7H8i9J0kLmNoPqRsTuVwXyZaBcDeF',
]);

export class ComplianceService {
  private t3nClient: T3NClient;
  private transactionHistory: TreasuryTransaction[] = [];

  constructor(t3nClient: T3NClient) {
    this.t3nClient = t3nClient;
  }

  public async evaluateTransaction(
    tx: TreasuryTransaction,
    account: TreasuryAccount
  ): Promise<ComplianceResult> {
    const flags: ComplianceFlag[] = [];
    let riskScore = 0;

    // 1. Sanctioned Address Screening (Critical)
    if (KNOWN_SANCTIONED_ADDRESSES.has(tx.toAddress)) {
      flags.push({
        code: 'SANCTIONED_RECIPIENT',
        severity: 'CRITICAL',
        description: `Target address ${tx.toAddress} matches known sanctioned/illicit list.`,
      });
      riskScore += 90;
    }

    // 2. T3N DID Authentication Screening
    let didVerified = false;
    let didDetails: ComplianceResult['didDetails'];

    if (tx.initiatorDID) {
      const auth = await this.t3nClient.authenticateSigner(tx.initiatorDID, 'TREASURY_OFFICER');
      if (auth.valid && auth.identity) {
        didVerified = true;
        didDetails = {
          did: auth.identity.did,
          organization: auth.identity.organization,
          role: auth.identity.role,
        };
      } else {
        flags.push({
          code: 'INVALID_T3N_DID',
          severity: 'HIGH',
          description: `Initiator DID authentication failed: ${auth.reason || 'Unrecognized identity'}`,
        });
        riskScore += 45;
      }
    } else {
      flags.push({
        code: 'MISSING_T3N_DID',
        severity: 'MEDIUM',
        description: 'Transaction lacks cryptographic T3N DID signature attestation.',
      });
      riskScore += 25;
    }

    // 3. Whitelist Destination Check
    const isWhitelisted = account.whitelistedDestinations.includes(tx.toAddress);
    if (!isWhitelisted) {
      flags.push({
        code: 'UNWHITELISTED_DESTINATION',
        severity: 'HIGH',
        description: `Destination ${tx.toAddress} is not in authorized treasury whitelist.`,
      });
      riskScore += 35;
    }

    // 4. Daily Spend Limit & Threshold Check
    const newDailyTotal = account.spentTodaySol + tx.amountSol;
    if (newDailyTotal > account.dailyLimitSol) {
      flags.push({
        code: 'DAILY_LIMIT_EXCEEDED',
        severity: 'CRITICAL',
        description: `Transfer of ${tx.amountSol} SOL exceeds remaining daily limit of ${(account.dailyLimitSol - account.spentTodaySol).toFixed(2)} SOL.`,
      });
      riskScore += 50;
    }

    // 5. Velocity Check: Multiple transactions within 60 seconds
    const sixtySecsAgo = tx.timestamp - 60_000;
    const recentTxns = this.transactionHistory.filter(
      (t) => t.fromAddress === tx.fromAddress && t.timestamp >= sixtySecsAgo
    );
    if (recentTxns.length >= 3) {
      flags.push({
        code: 'HIGH_VELOCITY_OUTFLOW',
        severity: 'HIGH',
        description: `Abnormal velocity: ${recentTxns.length + 1} transfers detected within 60 seconds.`,
      });
      riskScore += 30;
    }

    // Clamp risk score to 100
    riskScore = Math.min(100, riskScore);

    // Determine Risk Level & Action
    let riskLevel: RiskLevel = 'LOW';
    let recommendedAction: ComplianceResult['recommendedAction'] = 'APPROVE';

    if (riskScore >= 70 || flags.some((f) => f.severity === 'CRITICAL')) {
      riskLevel = 'CRITICAL';
      recommendedAction = 'FREEZE_AND_ALERT';
    } else if (riskScore >= 40 || flags.some((f) => f.severity === 'HIGH')) {
      riskLevel = 'HIGH';
      recommendedAction = 'FLAG_FOR_REVIEW';
    } else if (riskScore >= 20) {
      riskLevel = 'MEDIUM';
      recommendedAction = 'FLAG_FOR_REVIEW';
    }

    const passed = recommendedAction === 'APPROVE';

    // Record in history if evaluated
    this.transactionHistory.push(tx);

    return {
      transactionId: tx.id,
      signature: tx.signature,
      passed,
      riskScore,
      riskLevel,
      flags,
      recommendedAction,
      didVerified,
      didDetails,
    };
  }
}
