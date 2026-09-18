export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface T3NDecentralizedIdentity {
  did: string; // e.g. "did:t3n:enterprise:solana:8a4f9b..."
  organization: string;
  role: 'TREASURY_OFFICER' | 'COMPLIANCE_OFFICER' | 'SYSTEM_AGENT' | 'EXTERNAL_COUNTERPARTY';
  publicKey: string;
  verifiedAt: number;
  credentials: {
    type: string;
    issuer: string;
    issuanceDate: string;
    expirationDate: string;
  }[];
  revoked: boolean;
}

export interface TreasuryAccount {
  address: string;
  name: string;
  balanceSol: number;
  dailyLimitSol: number;
  spentTodaySol: number;
  authorizedSignerDIDs: string[];
  whitelistedDestinations: string[];
}

export interface TreasuryTransaction {
  id: string;
  signature: string;
  fromAddress: string;
  toAddress: string;
  amountSol: number;
  tokenSymbol: string;
  timestamp: number;
  memo?: string;
  initiatorDID?: string;
}

export interface ComplianceFlag {
  code: string;
  severity: RiskLevel;
  description: string;
}

export interface ComplianceResult {
  transactionId: string;
  signature: string;
  passed: boolean;
  riskScore: number; // 0 (safest) to 100 (highest risk)
  riskLevel: RiskLevel;
  flags: ComplianceFlag[];
  recommendedAction: 'APPROVE' | 'FLAG_FOR_REVIEW' | 'FREEZE_AND_ALERT';
  didVerified: boolean;
  didDetails?: {
    did: string;
    organization: string;
    role: string;
  };
}

export interface ReconciliationRecord {
  reconciliationId: string;
  txSignature: string;
  internalAccountingCode: string;
  didSigner: string;
  amountSol: number;
  timestamp: number;
  status: 'MATCHED' | 'DISCREPANCY' | 'PENDING_ATTESTATION';
  proofHash: string;
}

export interface SentinelAlert {
  id: string;
  severity: RiskLevel;
  title: string;
  details: string;
  timestamp: number;
  resolved: boolean;
  actionTaken?: string;
}
