import crypto from 'crypto';
import type { ReconciliationRecord, TreasuryTransaction } from '../types/index.js';

export class ReconciliationEngine {
  private records: Map<string, ReconciliationRecord> = new Map();
  private expectedInvoices: Map<string, { code: string; expectedAmountSol: number; vendorAddress: string }> = new Map();

  constructor() {
    this.seedMockERPInvoices();
  }

  private seedMockERPInvoices(): void {
    this.expectedInvoices.set('INV-AWS-8821', {
      code: 'OPEX_INFRASTRUCTURE_AWS',
      expectedAmountSol: 12.5,
      vendorAddress: 'AWS8kL2m9qP4v7yB8n3Xz19Pqm29L4V7x1BqM3K8dJuP',
    });
    this.expectedInvoices.set('INV-AUDIT-0042', {
      code: 'SECURITY_AUDIT_Q3',
      expectedAmountSol: 25.0,
      vendorAddress: 'AUDIT9kL2m9qP4v7yB8n3Xz19Pqm29L4V7x1BqM3K8dJu',
    });
  }

  public registerExpectedInvoice(invoiceId: string, code: string, expectedAmountSol: number, vendorAddress: string): void {
    this.expectedInvoices.set(invoiceId, { code, expectedAmountSol, vendorAddress });
  }

  public reconcile(tx: TreasuryTransaction, invoiceId?: string): ReconciliationRecord {
    let status: ReconciliationRecord['status'] = 'DISCREPANCY';
    let accountingCode = 'UNALLOCATED_EXPENSE';

    if (invoiceId && this.expectedInvoices.has(invoiceId)) {
      const invoice = this.expectedInvoices.get(invoiceId)!;
      const isAmountMatch = Math.abs(invoice.expectedAmountSol - tx.amountSol) < 0.0001;
      const isRecipientMatch = invoice.vendorAddress === tx.toAddress;

      if (isAmountMatch && isRecipientMatch) {
        status = 'MATCHED';
        accountingCode = invoice.code;
      }
    } else if (tx.memo?.startsWith('ERP:')) {
      accountingCode = tx.memo.replace('ERP:', '').trim();
      status = 'MATCHED';
    }

    // Generate cryptographic audit hash
    const payload = `${tx.signature}:${accountingCode}:${tx.amountSol}:${tx.timestamp}:${tx.initiatorDID || 'ANONYMOUS'}`;
    const proofHash = crypto.createHash('sha256').update(payload).digest('hex');

    const record: ReconciliationRecord = {
      reconciliationId: `rec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      txSignature: tx.signature,
      internalAccountingCode: accountingCode,
      didSigner: tx.initiatorDID || 'UNKNOWN',
      amountSol: tx.amountSol,
      timestamp: Date.now(),
      status,
      proofHash,
    };

    this.records.set(record.reconciliationId, record);
    return record;
  }

  public getAllRecords(): ReconciliationRecord[] {
    return Array.from(this.records.values());
  }

  public getMatchedCount(): number {
    return Array.from(this.records.values()).filter((r) => r.status === 'MATCHED').length;
  }
}
