# 🛡️ T3N Enterprise Sentinel: Autonomous Solana Treasury & Compliance Agent

[![T3N-Compatible](https://img.shields.io/badge/T3N-Compatible-blue)](https://terminal3.io)
[![Solana Mainnet](https://img.shields.io/badge/Solana-Mainnet_Read--Only-black?logo=solana)](https://solana.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/Tests-100%25_Passing-brightgreen)](https://vitest.dev)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **🏆 Colosseum Crypto World's Fair entry** — an autonomous compliance sentinel for Solana enterprise treasuries. Every outflow is bound to a **T3N-compatible decentralized identity (DID)**, run through a **5-layer compliance screen** (sanctions, DID auth, whitelist, daily caps, 60-second velocity), and attested with **SHA-256 ERP reconciliation proofs**. A **read-only mainnet mode** screens real on-chain transfers through the same engine, and a **polling watch mode** monitors a vault continuously.
>
> *Provenance: originally built for the Terminal 3 Network (T3N) Trusted Agent Build Challenge on Superteam Earn. Extended during the Colosseum window with live mainnet screening and watch mode.*

---

## ⚡ 60-Second Demo

```bash
git clone https://github.com/fliptrigga13/t3n-enterprise-sentinel.git
cd t3n-enterprise-sentinel
npm install          # ~15s, 106 packages, no secrets needed
npm test             # 8/8 pass, fully offline
npm run demo         # 3-scenario treasury run: legit bill approved, rogue drain frozen, sanctioned address blocked
```

Go further:

```bash
npm run demo:mainnet -- --address <any-solana-address>
# Read-only mainnet screening: pulls REAL recent transfers via public RPC and
# runs the 5-layer compliance screen over them. No keypairs, no signing.
# Falls back to a clearly-labeled simulated feed when the RPC is unreachable.

npm run watch -- --address <addr> --interval 30
# Polling watch mode: screens new signatures for a watched address every N
# seconds and prints alerts. Ctrl+C stops with a summary. Requires RPC.
```

---

## 🏛️ Executive Summary

Corporations, DAOs, and institutional funds managing digital assets on Solana face existential risks:
1. **Rogue or compromised key transfers** lacking verifiable organizational delegation.
2. **Regulatory & sanctions liability** (OFAC SDN lists, illicit mixing protocols).
3. **Internal policy breaches** (daily spend limits, unauthorized non-whitelisted recipients).
4. **Manual accounting overhead** reconciling high-frequency on-chain txns to enterprise ERP systems.

**T3N Enterprise Sentinel** is an autonomous gatekeeper for Solana treasuries. It couples a T3N-compatible DID attestation interface with on-chain telemetry: inspecting transfers, verifying signer credentials, generating cryptographic audit proofs, and flagging/freezing suspicious outflows for operator review before irreversible state changes occur.

**Honest boundaries (read before judging):** Sentinel never holds private keys, never signs, and never broadcasts. "Approve" means *queued for operator review*; "freeze" means *a policy-freeze record in the local alert queue for the operator*. The DID resolver is a T3N-compatible local simulated adapter (zero T3N network calls) — a network-backed resolver is a planned drop-in behind the same interface. The sanctions screen uses a 2-entry demo list (production path: OFAC SDN feed or Chainalysis/TRM).

---

## 🏗️ System Architecture

```mermaid
flowchart TD
    subgraph Enterprise Treasury Outflow
        A[Corporate Signer / Automated Bot] -->|Initiates Tx| B[Solana Outbound Pipeline]
    end

    subgraph T3N-Compatible Identity Layer (local simulated adapter)
        C[DID Resolver] -->|Verifies DID Attestation| D[Signer Credential Attestation]
        D -->|Valid Enterprise Officer?| E{DID Valid?}
    end

    subgraph Sentinel Core
        B --> F[Treasury Monitor]
        E -->|Identity Context| F
        F --> G[Compliance Screening Engine]
        G -->|Sanctions List Check| H[Risk Analyzer]
        G -->|Daily Limit & Velocity| H
        G -->|Whitelist Filter| H
        H --> I{Risk Score}

        I -->|< 40 Low Risk| J[APPROVE — queued for operator review]
        I -->|>= 70 Critical| K[POLICY FREEZE recorded, alert queued]

        J --> L[Reconciliation Engine]
        L -->|SHA-256 Proof Hash| M[ERP Audit Ledger]
    end

    subgraph Live Modes
        N[demo:mainnet — read-only RPC screening] --> G
        O[watch — polling monitor] --> G
    end
```

---

## 🔑 Key Features

- **T3N-Compatible DID Verification**: Validates whether transaction initiators hold valid `EnterpriseSignerCredential` or `AutonomousAgentAttestationCredential` — served by a local simulated adapter (no live T3N network calls; a network adapter is a planned drop-in).
- **Dynamic 5-Layer Compliance Screening**:
  - **Sanctions / Illicit Router Screening**: instant identification of tainted addresses (demo list of 2; production path: OFAC SDN / Chainalysis / TRM).
  - **DID Authentication**: rejects revoked, unregistered, or role-mismatched identities.
  - **Address Whitelist Gatekeeper**: restricts outflows to approved enterprise vendor accounts.
  - **Daily Spend Cap Enforcement**: accumulator preventing drain exploits.
  - **60-Second Velocity Check**: flags abnormal burst outflows.
- **Read-Only Mainnet Screening** (`npm run demo:mainnet`): fetches real recent signatures/transactions for any address via public RPC and screens them through the same 5 layers. No keypairs, no signing, no broadcasting. Graceful, clearly-labeled simulated fallback when offline.
- **Polling Watch Mode** (`npm run watch`): screens new signatures for a watched address every N seconds and prints approve/flag/freeze alerts; stops cleanly with a summary.
- **Automated ERP Ledger Reconciliation**: Matches transactions to internal purchase orders (`ERP:OPEX_INFRASTRUCTURE_AWS`) and computes SHA-256 cryptographic attestation hashes for institutional auditors.
- **Zero-Maintenance Design**: Minimal external dependencies, strict TypeScript, deterministic offline test suite.

---

## 🚀 Quickstart

### Prerequisites
- Node.js >= 18.0.0
- npm or pnpm

### Installation
```bash
git clone https://github.com/fliptrigga13/t3n-enterprise-sentinel.git
cd t3n-enterprise-sentinel
npm install
```

### Run the Enterprise Simulation
```bash
npm run demo
```

### Screen Real Mainnet Transfers (read-only)
```bash
npm run demo:mainnet -- --address <any-solana-address> --limit 8
```

### Watch a Vault (polling)
```bash
npm run watch -- --address <addr> --interval 30
```

### Run the Test Suite
```bash
npm test
```

---

## 🧪 Verified Test Suite Results

```text
$ npm test

 RUN  v2.1.9 /t3n-enterprise-sentinel

 ✓ tests/sentinel.test.ts (6 tests)
   ✓ authenticates legitimate officer DID with valid enterprise credentials
   ✓ rejects unregistered or revoked DIDs
   ✓ approves compliant enterprise transaction and reconciles with ERP invoice
   ✓ freezes transaction that exceeds daily treasury limit
   ✓ blocks transfer to known sanctioned / illicit address
   ✓ computes accurate audit statistics across processed transactions
 ✓ tests/mainnet-mapper.test.ts (2 tests)
   ✓ extracts only native-SOL system transfers and dedupes repeats
   ✓ maps lamports to SOL and preserves on-chain metadata

 Test Files  2 passed (2)
      Tests  8 passed (8)
```

All tests run fully offline — no network, no keys, no env config.

---

## 📄 License
MIT License. Originally created for the Superteam Earn T3N Agent Challenge; extended and submitted for the Colosseum Crypto World's Fair.
