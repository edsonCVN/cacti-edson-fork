# `@hyperledger/cactus-plugin-dpp`

Hyperledger Cacti plugin for managing **Digital Product Passports (DPP)** on EVM-compatible blockchains. It provides a blockchain-agnostic abstraction layer for the full DPP lifecycle — creation, transfer, aggregation, transport tracking, retail updates, and cross-chain interoperability via SATP.

## Overview

A Digital Product Passport is an ERC-721 NFT that carries structured metadata about a physical product throughout its supply chain. Each participant (farmer, processor, transporter, retailer) interacts with the DPP according to their role, and every action is recorded as an immutable on-chain history event.

### Key Features

- **Role-Based Access Control (RBAC)** — Six roles (`FARMER`, `PROCESSOR`, `TRANSPORTER`, `RETAILER`, `GATEWAY`, `ADMIN`) enforced on-chain via OpenZeppelin `AccessControl`
- **Structured On-Chain History** — Every lifecycle event is stored as JSON with actor address and block timestamp
- **DPP Aggregation** — Combine multiple child DPPs into a parent lot; children are burned and their metadata/history is merged off-chain
- **Cross-Chain Transfers (SATP)** — Lock, burn, and mint DPPs across ledgers using the Secure Asset Transfer Protocol
- **OpenSea-Compatible Metadata** — Attributes array follows the ERC-721 metadata standard
- **Express API Gateway** — REST API that dispatches transactions with role-aware signer selection

## Architecture

```
┌─────────────────────┐     ┌──────────────────────┐     ┌──────────────────┐
│   Frontend (Next.js)│────▶│  Express API Gateway  │────▶│  EVM Blockchain  │
│   Port 3000         │     │  Port 3002            │     │  (Anvil / Ganache)│
└─────────────────────┘     └──────────────────────┘     └──────────────────┘
                                     │
                                     ▼
                            ┌──────────────────┐
                            │   EVMDPPLeaf      │
                            │   (Backend Logic) │
                            └──────────────────┘
```

### Source Structure

```
packages/cactus-plugin-dpp/
├── contracts/
│   ├── IDigitalProductPassport.sol    # Interface with structs and method signatures
│   └── DigitalProductPassport.sol     # ERC-721 + AccessControl implementation
├── scripts/
│   ├── launch-api.ts                  # Compiles, deploys, and starts the API gateway
│   ├── test-satp-dpp.ts               # End-to-end DPP lifecycle test
│   └── test-crosschain-polygon.ts     # Cross-chain transfer tests (Polygon target)
└── src/main/typescript/
    ├── dpp-abstract.ts                # Abstract base class for DPP implementations
    ├── implementations/
    │   └── evm-dpp-leaf.ts            # EVM implementation (ethers.js)
    ├── types.ts                       # Shared TypeScript types
    ├── public-api.ts                  # Exported API surface
    └── web-services/                  # OpenAPI endpoint handlers
```

## Smart Contract

**`DigitalProductPassport.sol`** — ERC-721 token with AccessControl and supply-chain lifecycle management.

### Roles

| Role | Capabilities |
|------|-------------|
| `DEFAULT_ADMIN_ROLE` | Grant/revoke roles, transfer any DPP |
| `GATEWAY_ROLE` | Cross-chain mint, authorize operations on behalf of owners |
| `FARMER_ROLE` | Create new DPPs (`createDPP`) |
| `PROCESSOR_ROLE` | Amend metadata, add certifications, aggregate DPPs |
| `TRANSPORTER_ROLE` | Update transport data (location, conditions) |
| `RETAILER_ROLE` | Mark as received, update retail data |

### DPP States

```
CREATED → IN_TRANSIT → RECEIVED → RETAIL
    │
    └→ LOCKED_CROSSCHAIN → (burned)
    └→ REVOKED
```

### Key Functions

| Function | Role | Description |
|----------|------|-------------|
| `createDPP` | Farmer | Mint a new DPP with auto-generated `PROD-{id}` |
| `amendDPPData` | Processor | Update the metadata URI |
| `addCertification` | Processor/Owner | Append a certification ID |
| `updateTransportData` | Transporter | Record location, timestamp, and conditions |
| `markAsReceived` | Retailer | Set state to `RECEIVED` |
| `updateRetailData` | Retailer | Set state to `RETAIL` |
| `aggregateDPPs` | Processor | Create a parent `LOT-{id}`, burn children |
| `transferDPP` | Owner/Admin | Transfer ownership with history tracking |
| `lockDPP` / `unlockDPP` | Owner/Gateway | SATP Phase 1-2 lock/rollback |
| `burnCrossChain` | Owner/Gateway | SATP Phase 3 burn on source ledger |
| `mintCrossChain` | Gateway | SATP mint on destination ledger |

## Getting Started

### Prerequisites

- Node.js >= 18
- [Anvil](https://book.getfoundry.sh/anvil/) (Foundry local EVM node)

### 1. Start a Local Blockchain

```bash
anvil
```

This starts a local EVM node on `http://127.0.0.1:8545` with 10 pre-funded accounts.

### 2. Launch the API Gateway

```bash
cd packages/cactus-plugin-dpp
npx ts-node scripts/launch-api.ts
```

This will:
1. Compile `DigitalProductPassport.sol` with `solc`
2. Deploy the contract to the local Anvil node
3. Grant supply-chain roles to Anvil accounts (0-4)
4. Start the Express API gateway on `http://127.0.0.1:3002`

### 3. Run Tests

```bash
# Full DPP lifecycle test
npx ts-node scripts/test-satp-dpp.ts

# Cross-chain transfer tests (Polygon)
npx ts-node scripts/test-crosschain-polygon.ts
```

## API Endpoints

All endpoints are prefixed with `/api/v1/@hyperledger/cactus-plugin-dpp`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/config` | Returns contract address and network info |
| `GET` | `/passports` | List all active DPPs on the ledger |
| `GET` | `/data?dppId={id}` | Get full DPP data including metadata |
| `GET` | `/history/{dppId}` | Get DPP history (inherits children's history for lots) |
| `POST` | `/create` | Create a new DPP |
| `POST` | `/transfer` | Transfer DPP ownership |
| `POST` | `/aggregate` | Aggregate multiple DPPs into a lot |
| `POST` | `/update-transport-data` | Record transport event |
| `POST` | `/mark-as-received` | Mark DPP as received |
| `POST` | `/update-retail-data` | Update retail information |
| `POST` | `/amend` | Amend DPP metadata |
| `POST` | `/add-certification` | Add certification to a DPP |
| `POST` | `/submit-product-review` | Submit consumer review |

## Aggregation

When DPPs are aggregated into a lot:

1. **On-chain**: Child DPPs are burned (state set to `REVOKED`), a parent DPP is minted with auto-generated `LOT-{id}`, and child references are stored via `_dppComponents`
2. **Off-chain (backend)**: The parent inherits merged metadata from all children — varieties, calibres, origins, and certifications are deduplicated and combined into the parent's metadata JSON
3. **History**: When querying the parent's history, the backend reads children's history (persisted in mappings even after burn) and merges it with the parent's own events, sorted by timestamp

## Cross-Chain Transfers (SATP)

The contract implements the three SATP phases:

1. **Lock** (`lockDPP`) — Asset is locked on the source ledger, preventing transfers
2. **Burn** (`burnCrossChain`) — Locked asset is burned on the source ledger
3. **Mint** (`mintCrossChain`) — Asset is recreated on the destination ledger with the same metadata

Rollback is supported via `unlockDPP` if the transfer fails before commit.

## Anvil Account Mapping

| Account | Role | Address |
|---------|------|---------|
| 0 | Admin (all roles) | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` |
| 1 | Farmer | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` |
| 2 | Processor | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` |
| 3 | Transporter | `0x90F79bf6EB2c4f870365E785982E1f101E93b906` |
| 4 | Retailer | `0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65` |

## License

Apache-2.0
