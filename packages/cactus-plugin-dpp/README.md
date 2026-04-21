# `@hyperledger/cactus-plugin-dpp`

Hyperledger Cacti plugin for managing **Digital Product Passports (DPP)** on EVM-compatible blockchains. It provides a blockchain-agnostic abstraction layer for the full DPP lifecycle - creation, transfer, aggregation, transport tracking, retail updates, and cross-chain interoperability via SATP.

## Overview

A Digital Product Passport is an ERC-721 NFT that carries structured metadata about a physical product throughout its supply chain. Each participant (farmer, processor, transporter, retailer) interacts with the DPP according to their role, and every action is recorded as an immutable on-chain history event.

### Key Features

- **Role-Based Access Control (RBAC)** - Seven roles (`FARMER`, `PROCESSOR`, `TRANSPORTER`, `RETAILER`, `GATEWAY`, `OWNER`, `ADMIN`) enforced on-chain via OpenZeppelin `AccessControl`
- **Structured On-Chain History** - Every lifecycle event is stored as JSON with actor address and block timestamp
- **DPP Aggregation** - Combine multiple child DPPs into a parent lot; children are revoked (`notRevoked` modifier) and their metadata/history is merged
- **DPP Disaggregation** - Split a single DPP into N independent child DPPs; the origin is revoked and each child inherits the original metadata and certifications
- **SATP Cross-Chain Transfers** - Full SATP Hermes Gateway compatibility: `lock`, `unlock`, `burn`, `mint`, `assign` with exact function signatures expected by the SATPWrapper bridge contract
- **Ontology-Driven Gateway** - An ontology JSON file maps SATP protocol phases to the contract's Solidity function signatures, following the SATP Case 2 (EVM NFA transfer) pattern
- **Dual-mode API Gateway** - Shares the same contract with the SATP gateways when `deployed-addresses.json` exists; falls back to standalone deploy otherwise
- **Express API Gateway** - REST API that dispatches transactions with role-aware signer selection, including a `/cross-chain-transfer` proxy to SATP gateway-1
- **IPFS Integration** - Product images and full ERC-721 metadata JSON are pinned to IPFS via Pinata at mint time. The on-chain record stores both the IPFS CID and the inline JSON; IPFS serves as an immutable snapshot of the original metadata while the on-chain JSON remains the source of truth for current state. Aggregated lots inherit the first child's image and metadata CID

## Architecture

```
┌─────────────────────┐     ┌──────────────────────────────────┐
│   Frontend (Next.js)│────▶│  Express API Gateway (Chain 1)   │
│   Port 3000         │     │  Port 3002                       │
└─────────────────────┘     └──┬──────────────────────────┬────┘
                               │                          │
                         Local ops                 /cross-chain-transfer
                               │                          │
                               ▼                          ▼
                    ┌──────────────────┐    ┌───────────────────────┐
                    │  Chain 1         │    │  SATP Hermes Gateway-1│
                    │  EVM Local Node  │    │  Port 4010            │
                    │  Port 8545       │    └───────────┬───────────┘
                    └──────────────────┘                │ SATP protocol
                                                        ▼
                                           ┌───────────────────────┐
                                           │  SATP Hermes Gateway-2│
                                           │  Port 4110            │
                                           └───────────┬───────────┘
                                                       │
                                                       ▼
┌─────────────────────┐     ┌──────────────────────────────────┐
│   Frontend (Next.js)│────▶│  Express API Gateway (Chain 2)   │
│   Port 3001         │     │  Port 3003 (read + write ops)    │
└─────────────────────┘     └──────────────────────────────────┘
                                            │
                                            ▼
                                 ┌──────────────────┐
                                 │  Chain 2         │
                                 │  EVM Local Node  │
                                 │  Port 8546       │
                                 └──────────────────┘

SATP Cross-Chain Transfer Phases:
  Phase 1 - Lock    [Chain 1]: lock(user, bridge, tokenId)
  Phase 2 - Mint    [Chain 2]: mint(bridge, tokenId)     ← placeholder metadata
  Phase 3 - Assign  [Chain 2]: assign(receiver, tokenId)
           - Burn   [Chain 1]: burn(tokenId)
  Post-transfer:    [Chain 2]: importCrossChainData(...)  ← full data + history
```

Both the API Gateway and the SATP Hermes Gateways operate on the **same deployed contract** (address shared via `gateway/deployed-addresses.json`), so local lifecycle operations and cross-chain transfers can happen concurrently.

### Cross-Chain Data Preservation

The SATP `mint()` function creates only a placeholder token on the destination chain (with generic name, empty metadata, and no history). To ensure **zero data loss**, the API gateway:

1. **Snapshots** the complete DPP data before the lock: `productName`, `creationDate`, full metadata JSON, all certifications, and the entire on-chain history
2. **Polls** the SATP session until it reaches `DONE`/`COMPLETED`
3. **Calls `importCrossChainData()`** on the destination chain in a single transaction, restoring all fields and importing the source-chain history

After restoration, the DPP on the destination chain is identical to the original, plus a `CrossChainImport` event marking the transfer and the original `SATPMint` event from the bridge.

### Source Structure

```
packages/cactus-plugin-dpp/
├── contracts/
│   ├── IDigitalProductPassport.sol        # Interface: structs, lifecycle, and SATP bridge methods
│   ├── DigitalProductPassport.sol         # ERC-721 + AccessControl + SATP bridge implementation
│   └── ontologies/
│       └── ontology-dpp-erc721-ethereum.json  # SATP gateway ontology (maps phases to functions)
├── gateway/
│   ├── docker-compose.yaml                # Two SATP Hermes Gateway containers
│   ├── config/
│   │   ├── gateway-1-config.json          # Gateway-1: chain 1 (port 8545)
│   │   └── gateway-2-config.json          # Gateway-2: chain 2 (port 8546)
│   ├── satp-transact.py                   # Initiate a DPP cross-chain transfer
│   ├── satp-check-status.py               # Poll transfer status by SESSION_ID
│   └── satp-audit.py                      # Retrieve full SATP audit trail
├── scripts/
│   ├── deploy-dpp.js                      # Deploy to both chains, grant all roles, mint demo token
│   ├── launch-api.ts                      # Start the REST API gateway for chain 1 (port 3002)
│   ├── launch-api-chain2.ts               # Start the read/write API gateway for chain 2 (port 3003)
│   ├── test-satp-dpp.ts                   # End-to-end DPP lifecycle + SATP bridge test
│   └── test-crosschain-polygon.ts         # Cross-chain transfer tests (Polygon target)
└── src/main/typescript/
    ├── dpp-abstract.ts                    # Abstract base class for DPP implementations
    ├── implementations/
    │   └── evm-dpp-leaf.ts                # EVM implementation (ethers.js v5)
    ├── plugin-dpp.ts                      # Main plugin class (registers endpoints)
    ├── plugin-factory-dpp.ts              # Plugin factory
    ├── public-api.ts                      # Exported API surface
    ├── generated/openapi/typescript-axios/ # Auto-generated types from openapi.json
    └── web-services/                      # OpenAPI endpoint handlers
```

## Smart Contract

**`DigitalProductPassport.sol`** - ERC-721 token with AccessControl, supply-chain lifecycle management, and SATP Hermes Gateway bridge compatibility.

### Roles

| Role | Capabilities |
|------|-------------|
| `DEFAULT_ADMIN_ROLE` | Grant/revoke all roles |
| `OWNER_ROLE` | Grant `BRIDGE_ROLE` to the SATPWrapper bridge address |
| `GATEWAY_ROLE` | Authorize operations on behalf of token owners |
| `BRIDGE_ROLE` | Execute SATP bridge operations: `mint`, `burn` |
| `FARMER_ROLE` | Create new DPPs (`createDPP`) |
| `PROCESSOR_ROLE` | Amend metadata, add certifications, aggregate DPPs |
| `TRANSPORTER_ROLE` | Update transport data (location, conditions) |
| `RETAILER_ROLE` | Mark as received, update retail data |

### DPP States

```
CREATED -> IN_TRANSIT -> RECEIVED -> RETAIL
    │
    ├-> LOCKED_CROSSCHAIN -> (burned via SATP after commit)
    ├-> REVOKED   (via revokeDPP, aggregation, or disaggregation)
    │
    └-> disaggregateDPP -> origin REVOKED, N new DPPs CREATED
       aggregateDPPs   -> children REVOKED, parent LOT CREATED
```

> **`notRevoked` modifier** - All state-changing functions on the smart contract
> check `require(dppData[tokenId].state != DPPState.REVOKED)`, preventing
> any further operations on revoked DPPs. This includes `transferDPP`, `amendDPPData`,
> `addCertification`, `updateTransportData`, `markAsReceived`, `updateRetailData`,
> `disaggregateDPP`, `aggregateDPPs` (on each child token), and `lock` (SATP bridge).
> Revoked DPPs remain readable for audit purposes but cannot be modified, transferred,
> aggregated, or locked for cross-chain transfer.

### Supply Chain Functions

| Function | Role | Description |
|----------|------|-------------|
| `createDPP` | Farmer | Mint a new DPP with auto-generated `PROD-{id}` |
| `amendDPPData` | Processor | Update the metadata URI |
| `addCertification` | Processor/Owner | Append a certification ID |
| `updateTransportData` | Transporter | Record location, timestamp, and conditions |
| `markAsReceived` | Retailer | Set state to `RECEIVED` |
| `updateRetailData` | Retailer | Set state to `RETAIL` |
| `aggregateDPPs` | Processor | Create a parent `LOT-{id}`, revoke children |
| `disaggregateDPP` | Processor | Split a DPP into N new children, revoke origin |
| `transferDPP` | Owner/Admin | Transfer ownership with history tracking |
| `revokeDPP` | Owner/Gateway | Permanently revoke a DPP |
| `importCrossChainData` | Admin/Gateway | Restore full DPP data (name, date, metadata, certs, history) on the destination chain after a SATP transfer |

### SATP Bridge Functions

These match the exact signatures expected by the SATPWrapper bridge contract deployed by SATP Hermes (SATP Case 2):

| Function | Role | SATP Phase | Description |
|----------|------|-----------|-------------|
| `lock(from, to, tokenId)` | Any (requires prior `approve`) | Phase 1 | Transfer NFT from owner to bridge custody (rejects revoked DPPs) |
| `unlock(from, to, tokenId)` | Any | Rollback | Return NFT from bridge to owner on failure |
| `burn(tokenId)` | `BRIDGE_ROLE` | Phase 3 (source) | Destroy NFT on source chain after commit |
| `mint(account, tokenId)` | `BRIDGE_ROLE` | Phase 2 (destination) | Create NFT on destination chain |
| `assign(to, tokenId)` | Any | Phase 3 (destination) | Transfer minted NFT from bridge to final receiver |
| `grantBridgeRole(account)` | `OWNER_ROLE` | Setup | Grant bridge permissions to SATPWrapper address |
| `hasBridgeRole(account)` | Any | Check | Verify bridge has required permissions (reverts if not) |

## Getting Started

### Prerequisites

- Node.js >= 18
- [Hardhat node](https://hardhat.org) or [Anvil](https://book.getfoundry.sh/anvil/) for local EVM blockchain
- Docker (for SATP Hermes Gateway containers)

---

### Option A - Standalone API (development, single chain)

Compile, deploy, and start the REST API in one command. No SATP gateways needed.

```bash
cd packages/cactus-plugin-dpp

# Terminal 1 - local blockchain
anvil  # or: npx hardhat node --port 8545

# Terminal 2 - start the API gateway (deploys the contract automatically)
npx ts-node --project tsconfig.hardhat.json scripts/launch-api.ts
```

`launch-api.ts` will:
1. Detect that `gateway/deployed-addresses.json` does not exist
2. Compile `DigitalProductPassport.sol` with `solc` and deploy to `http://127.0.0.1:8545`
3. Grant supply-chain roles to Hardhat accounts 0–4
4. Write `gateway/deployed-addresses.json` (chain1 only) so SATP gateways can be added later
5. Start the Express API on `http://127.0.0.1:3002`

---

### Option B - Full SATP Mode (local + cross-chain, both chains running simultaneously)

All services share the **same contract addresses** via `gateway/deployed-addresses.json`.

```bash
cd packages/cactus-plugin-dpp

# Terminal 1 - chain 1 (source)
npx hardhat node --port 8545

# Terminal 2 - chain 2 (destination)
npx hardhat node --port 8546

# Terminal 3 - compile + deploy to both chains
npx hardhat compile
node scripts/deploy-dpp.js
```

`deploy-dpp.js` will:
- Deploy `DigitalProductPassport` on both chains
- Grant `BRIDGE_ROLE` to the SATPWrapper bridge address on both chains
- Grant supply-chain roles (FARMER, PROCESSOR, TRANSPORTER, RETAILER) to the Hardhat accounts on chain 1
- Mint demo DPP token #1001 on chain 1 and approve the bridge for it
- Write `gateway/deployed-addresses.json` with both contract addresses

```bash
# Terminal 4 - SATP Hermes Gateway containers
cd gateway
docker compose up
```

The gateways are now reachable at:
- Gateway-1 OAPI: `http://localhost:4010` (network ID: `EthereumLedgerTestNetwork1`)
- Gateway-2 OAPI: `http://localhost:4110` (network ID: `EthereumLedgerTestNetwork2`)

The `contracts/ontologies/` directory is mounted automatically into both containers.

```bash
# Terminal 5 - API gateway for chain 1 (reads deployed-addresses.json, reuses existing contracts)
npx ts-node --project tsconfig.hardhat.json scripts/launch-api.ts

# Terminal 6 (optional) - API gateway for chain 2 (to view received DPPs)
npx ts-node --project tsconfig.hardhat.json scripts/launch-api-chain2.ts
```

Because `gateway/deployed-addresses.json` already exists, `launch-api.ts` will skip deployment and connect to the same contracts that the SATP gateways use. Local lifecycle operations and cross-chain transfers can now happen in parallel.

`launch-api-chain2.ts` connects to port 8546 (chain 2), reads `deployed.chain2.contractAddress`, and exposes all read and write endpoints on port 3003 - including `/cross-chain-transfer` (chain 2 -> chain 1 via SATP gateway-2) and `/restore-cross-chain-data` (receives full DPP data from the source chain's background sync).

---

### Initiating Transfers

**Local lifecycle operations** - call the API gateway directly:

```bash
# Create a DPP
curl -X POST http://localhost:3002/api/v1/@hyperledger/cactus-plugin-dpp/create \
  -H 'Content-Type: application/json' \
  -d '{"owner":"0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266","productionData":{"name":"Cherry Lot #1"}}'

# Update transport data
curl -X POST http://localhost:3002/api/v1/@hyperledger/cactus-plugin-dpp/update-transport-data \
  -H 'Content-Type: application/json' \
  -d '{"dppId":"1","transportData":{"location":"A23, km 45","temperature":"3°C"}}'
```

**Cross-chain transfer** - via the API gateway (proxied to SATP gateway-1):

```bash
# Transfer DPP token #1001 from chain 1 to chain 2
curl -X POST http://localhost:3002/api/v1/@hyperledger/cactus-plugin-dpp/cross-chain-transfer \
  -H 'Content-Type: application/json' \
  -d '{"dppId":"1001"}'
# -> {"sessionId": "abc123..."}

# Check transfer status
curl "http://localhost:3002/api/v1/@hyperledger/cactus-plugin-dpp/cross-chain-status?sessionId=abc123..."
```

**Direct Python scripts** (bypass the API gateway):

```bash
cd gateway

# Transfer DPP token #1001 (reads deployed-addresses.json automatically)
python satp-transact.py
# -> {"SESSION_ID": "abc123..."}

# Check status
python satp-check-status.py abc123...

# Retrieve full audit trail
python satp-audit.py
```

---

### Testing a Cross-Chain Transfer (step by step)

This walkthrough transfers DPP token **#1001** from chain 1 to chain 2 using the SATP protocol.

#### Step 1 - Start both Hardhat nodes

Open two terminals inside `packages/cactus-plugin-dpp`:

```bash
# Terminal 1
npx hardhat node --port 8545

# Terminal 2
npx hardhat node --port 8546
```

Wait until both nodes print their account list and `Started HTTP and WebSocket JSON-RPC server`.

#### Step 2 - Compile and deploy the contracts

```bash
# Terminal 3
npx hardhat compile
node scripts/deploy-dpp.js
```

Expected output (abbreviated):

```
[8545] Deploying DigitalProductPassport…
[8545] DigitalProductPassport deployed to: 0x5FbDB...
[8545] BRIDGE_ROLE granted to: 0x5FbDB2315678aFEcb367f032d93F642f64180aa3
[8545] Supply-chain roles granted
[8545] Minting demo token #1001 to user…
[8545] Bridge approved for token #1001
[8546] Deploying DigitalProductPassport…
[8546] DigitalProductPassport deployed to: 0xe7f17...
[8546] BRIDGE_ROLE granted to: 0x8464135c8f25Da09e49bc8782676a84730C318BC
Addresses written to: .../gateway/deployed-addresses.json
```

Check the generated file:

```bash
cat gateway/deployed-addresses.json
# {
#   "chain1": { "contractAddress": "0x5FbDB...", "ownerAddress": "0x70997..." },
#   "chain2": { "contractAddress": "0xe7f17...", "ownerAddress": "0x15d34..." }
# }
```

#### Step 3 - Start the SATP Hermes Gateways

```bash
# Terminal 4
cd gateway
docker compose up
```

Wait until both containers print something like:
```
satp-hermes-gateway-1  | Server listening on port 3010
satp-hermes-gateway-1  | OAPI server listening on port 4010
satp-hermes-gateway-2  | Server listening on port 3110
satp-hermes-gateway-2  | OAPI server listening on port 4110
```

Verify the gateways loaded the DPP ontology:

```bash
curl http://localhost:4010/api/v1/@hyperledger/cactus-plugin-satp-hermes/get-integrations
# -> should include "DPP-ERC721-ETHEREUM"
```

#### Step 4 - Start the API gateway

```bash
# Terminal 5
npx ts-node --project tsconfig.hardhat.json scripts/launch-api.ts
```

Because `gateway/deployed-addresses.json` already exists, the API gateway will **not** redeploy - it connects to the same contracts the SATP gateways use:

```
Using existing contract from deployed-addresses.json: 0x5FbDB...
Cacti DPP API Gateway running on http://127.0.0.1:3002
```

#### Step 5 - Initiate the transfer

**Option A - via the API gateway** (recommended for frontend integration):

```bash
curl -s -X POST http://localhost:3002/api/v1/@hyperledger/cactus-plugin-dpp/cross-chain-transfer \
  -H 'Content-Type: application/json' \
  -d '{"dppId":"1001"}' | jq .
# -> { "sessionId": "abc123...", "raw": {...} }
```

**Option B - directly via Python**:

```bash
cd gateway
python satp-transact.py
# -> {"SESSION_ID": "abc123..."}
```

#### Step 6 - Monitor the transfer

The SATP protocol runs three phases asynchronously. Poll the status until it reaches `COMPLETED`:

```bash
# Via API gateway
SESSION_ID="abc123..."
curl -s "http://localhost:3002/api/v1/@hyperledger/cactus-plugin-dpp/cross-chain-status?sessionId=$SESSION_ID" | jq .

# Or directly via Python
python gateway/satp-check-status.py $SESSION_ID
```

Expected final status (from the SATP Hermes status endpoint):
```json
{ "status": "DONE", "substatus": "COMPLETED", "stage": "STAGE_3" }
```

#### Step 7 - Verify on chain 2

Confirm token #1001 was minted on chain 2 and assigned to the receiver:

```bash
# Cast (Foundry) - query ownerOf on chain 2
cast call <chain2_contract_address> "ownerOf(uint256)(address)" 1001 \
  --rpc-url http://127.0.0.1:8546
# -> 0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc  (accounts[5])
```

#### Step 8 - Retrieve the audit trail

```bash
cd gateway
python satp-audit.py
# -> audits/audit-<timestamp>.json
```

The audit JSON contains the full session log with signed receipts for each SATP phase.

---

### Dual-Frontend Demo (both chains visible simultaneously)

To visually observe a cross-chain transfer end-to-end, run two frontend instances side-by-side - one per chain.

**Prerequisites:** both Hardhat nodes running, `deploy-dpp.js` executed, SATP gateways up, both API gateways started.

```bash
cd <path-to>/dpp-frontend

# Terminal A - chain 1 frontend (source)
npm run dev
# -> http://localhost:3000  (uses API at http://127.0.0.1:3002)

# Terminal B - chain 2 frontend (destination)
NEXT_DIST_DIR=.next-chain2 NEXT_PUBLIC_CACTI_API_URL=http://127.0.0.1:3003 npm run dev -- -p 3001
# -> http://localhost:3001  (uses API at http://127.0.0.1:3003)
```

`NEXT_DIST_DIR` gives the second instance its own build directory so both can run without lock conflicts.

After initiating a cross-chain transfer in the chain-1 frontend, the DPP will appear in the chain-2 frontend once the SATP transfer completes (typically under 5 seconds locally).

---

### Cross-chain transfer - dynamic SATPWrapper approval

`launch-api.ts` automatically handles token approval before every cross-chain transfer:

1. Calls `ownerOf(tokenId)` on the DPP contract to find the **actual** current owner
2. Checks whether the SATPWrapper (`0x8A791620…`) is already approved by that owner
3. If not, calls `setApprovalForAll(satpWrapper, true)` from the owner's local signer

This means any DPP - including ones created after the initial deployment - can be transferred cross-chain without manual approval steps.

---

### Run Tests

```bash
# End-to-end DPP lifecycle + SATP bridge functions (requires EVM local node on port 8545)
npx ts-node --project tsconfig.hardhat.json scripts/test-satp-dpp.ts

# Cross-chain transfer test (lock mechanism, single chain)
npx ts-node --project tsconfig.hardhat.json scripts/test-crosschain-polygon.ts

# Unit tests
npx jest
```

## API Endpoints

All endpoints are prefixed with `/api/v1/@hyperledger/cactus-plugin-dpp`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/config` | Contract address, network info, and SATP gateway URL |
| `GET` | `/passports` | List all active DPPs on the ledger |
| `GET` | `/data?dppId={id}` | Full DPP data including parsed metadata |
| `GET` | `/history/{dppId}` | DPP history (inherits children's history for lots) |
| `POST` | `/create` | Create a new DPP |
| `POST` | `/transfer` | Transfer DPP ownership |
| `POST` | `/aggregate` | Aggregate multiple DPPs into a lot |
| `POST` | `/disaggregate` | Split a DPP into N independent child DPPs |
| `POST` | `/update-transport-data` | Record transport event |
| `POST` | `/mark-as-received` | Mark DPP as received |
| `POST` | `/update-retail-data` | Update retail information |
| `POST` | `/amend` | Amend DPP metadata |
| `POST` | `/add-certification` | Add certification to a DPP |
| `POST` | `/submit-product-review` | Submit consumer review |
| `GET` | `/audit` | Full audit report - all DPPs with complete histories |
| `POST` | `/restore-cross-chain-data` | Restore full DPP data on destination chain after SATP transfer |
| `POST` | `/cross-chain-transfer` | Initiate SATP cross-chain transfer (proxied to Gateway-1) |
| `GET` | `/cross-chain-status?sessionId={id}` | Poll SATP session status (proxied to Gateway-1) |

## Aggregation

When DPPs are aggregated into a lot:

1. **On-chain**: Child DPPs are **revoked** (state set to `REVOKED`, enforced by the `notRevoked` modifier), a parent DPP is minted with auto-generated `LOT-{id}`, and child token IDs are stored in `_dppComponents`
2. **Off-chain (backend)**: The parent inherits merged metadata from all children - varieties, calibres, origins, and certifications are deduplicated and combined
3. **History**: When querying the parent's history, the backend reads children's history (persisted in storage even after revocation) and merges it with the parent's own events, sorted by timestamp

## Disaggregation

When a DPP is disaggregated (split):

1. **On-chain**: The origin DPP is **revoked** (state set to `REVOKED`), and `count` new DPPs are minted. Each child carries a `split-from: {originId}` reference in its history
2. **Off-chain (backend)**: Each new child inherits the original metadata and certifications from the origin DPP
3. **Constraints**: `count` must be between 2 and 20; the origin must not already be revoked (`notRevoked` modifier)

## Account Mapping

### Chain 1 (port 8545) - local operations

| Index | Role | Address |
|-------|------|---------|
| 0 | Admin / Deployer | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` |
| 1 | Farmer / Token holder (DPP #1001) | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` |
| 2 | Processor | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` |
| 3 | Transporter | `0x90F79bf6EB2c4f870365E785982E1f101E93b906` |
| 4 | Retailer | `0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65` |

### Chain 2 (port 8546) - SATP destination

| Index | Role | Address |
|-------|------|---------|
| 4 | Deployer | `0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65` |
| 5 | Token receiver | `0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc` |

> **Note**: Chain 1 uses Hardhat accounts 0–3; chain 2 uses accounts 4–5 as deployer/receiver to avoid address conflicts between signers in the same test environment.

## License

Apache-2.0
