import type { T3NDecentralizedIdentity } from '../types/index.js';

export interface T3NClientConfig {
  endpoint?: string;
  apiKey?: string;
  network?: 'mainnet' | 'testnet' | 'devnet';
}

export class T3NClient {
  /**
   * T3N-COMPATIBLE DID INTERFACE — LOCAL SIMULATED ADAPTER.
   *
   * resolveDID() is served by a seeded in-memory registry below. It makes
   * ZERO network calls to Terminal 3 (the `endpoint` config is retained only
   * so a network-backed resolver can be dropped in behind this same interface
   * later). Do not describe this as a live T3N integration.
   */
  private config: T3NClientConfig;
  private didRegistry: Map<string, T3NDecentralizedIdentity> = new Map();

  constructor(config: T3NClientConfig = {}) {
    this.config = {
      endpoint: config.endpoint || 'https://api.terminal3.io/v1',
      apiKey: config.apiKey || 't3n_demo_key_77a9c1',
      network: config.network || 'mainnet',
    };
    this.seedDefaultIdentities();
  }

  private seedDefaultIdentities(): void {
    const officerDID: T3NDecentralizedIdentity = {
      did: 'did:t3n:solana:treasury:officer:alice_v1',
      organization: 'Solana Global Enterprises Inc.',
      role: 'TREASURY_OFFICER',
      publicKey: '7Kq4wLt9mK2p7v4yB8n3Xz19Pqm29L4V7x1BqM3K8dJu',
      verifiedAt: Date.now() - 86400000 * 30,
      revoked: false,
      credentials: [
        {
          type: 'EnterpriseSignerCredential',
          issuer: 'did:t3n:root:terminal3',
          issuanceDate: '2026-01-15T00:00:00Z',
          expirationDate: '2027-01-15T00:00:00Z',
        },
        {
          type: 'KYBVerifiedOrganizationCredential',
          issuer: 'did:t3n:compliance:audit:v2',
          issuanceDate: '2026-02-01T00:00:00Z',
          expirationDate: '2027-02-01T00:00:00Z',
        },
      ],
    };

    const agentDID: T3NDecentralizedIdentity = {
      did: 'did:t3n:solana:agent:sentinel:core',
      organization: 'Terminal 3 Autonomous Operations Swarm',
      role: 'SYSTEM_AGENT',
      publicKey: 'CUbv4Hn4Y71ASzYn8j34YvFit55RbUPi6tLobVjmfc7i',
      verifiedAt: Date.now() - 86400000 * 10,
      revoked: false,
      credentials: [
        {
          type: 'AutonomousAgentAttestationCredential',
          issuer: 'did:t3n:root:terminal3',
          issuanceDate: '2026-08-01T00:00:00Z',
          expirationDate: '2027-08-01T00:00:00Z',
        },
      ],
    };

    this.didRegistry.set(officerDID.did, officerDID);
    this.didRegistry.set(agentDID.did, agentDID);
  }

  public registerIdentity(identity: T3NDecentralizedIdentity): void {
    this.didRegistry.set(identity.did, identity);
  }

  public async resolveDID(did: string): Promise<T3NDecentralizedIdentity | null> {
    // Simulated adapter: reads from the local seeded registry. A production
    // adapter would query the Terminal 3 DID resolver endpoint here instead.
    const identity = this.didRegistry.get(did);
    if (!identity) {
      return null;
    }
    return { ...identity };
  }

  public verifyCredential(identity: T3NDecentralizedIdentity, requiredType: string): boolean {
    if (identity.revoked) return false;
    const cred = identity.credentials.find((c) => c.type === requiredType);
    if (!cred) return false;

    const expiresAt = new Date(cred.expirationDate).getTime();
    return Date.now() < expiresAt;
  }

  public async authenticateSigner(did: string, requiredRole?: string): Promise<{ valid: boolean; reason?: string; identity?: T3NDecentralizedIdentity }> {
    const identity = await this.resolveDID(did);
    if (!identity) {
      return { valid: false, reason: `DID ${did} not registered on Terminal 3 Network.` };
    }

    if (identity.revoked) {
      return { valid: false, reason: `DID ${did} has been revoked by organization compliance.` };
    }

    if (requiredRole && identity.role !== requiredRole && identity.role !== 'SYSTEM_AGENT') {
      return { valid: false, reason: `Role mismatch: expected ${requiredRole}, got ${identity.role}.` };
    }

    const hasEnterpriseCredential = this.verifyCredential(identity, 'EnterpriseSignerCredential') ||
                                    this.verifyCredential(identity, 'AutonomousAgentAttestationCredential');
    if (!hasEnterpriseCredential) {
      return { valid: false, reason: 'Valid enterprise credential attestation missing or expired.' };
    }

    return { valid: true, identity };
  }
}
