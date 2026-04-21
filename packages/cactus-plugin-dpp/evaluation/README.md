# DPP Evaluation Suite

Evaluation scripts for the master's thesis, mapping to **Chapter 5 - Evaluation**.

## Prerequisites

- Hardhat or Anvil node running on `http://127.0.0.1:8545`
- All npm dependencies installed (`npm install` from the monorepo root)

## Run All

```bash
cd packages/cactus-plugin-dpp

# Start local EVM node (separate terminal)
anvil  # or: npx hardhat node --port 8545

# Run all evaluations
bash evaluation/run-all.sh
```

Or run individually:

```bash
npx ts-node --project tsconfig.hardhat.json evaluation/01-gas-profiling.ts
npx ts-node --project tsconfig.hardhat.json evaluation/02-cross-chain-validation.ts
npx ts-node --project tsconfig.hardhat.json evaluation/03-security-analysis.ts
npx ts-node --project tsconfig.hardhat.json evaluation/04-performance.ts
npx ts-node --project tsconfig.hardhat.json evaluation/05-espr-compliance.ts
```

## Scripts

| Script | Thesis Section | Research Question |
|--------|---------------|-------------------|
| `01-gas-profiling.ts` | 5.1 Gas Cost Analysis | Is the on-chain DPP lifecycle economically viable at scale? |
| `02-cross-chain-validation.ts` | 5.2 Cross-Chain Interoperability | Does SATP preserve DPP integrity across chains? |
| `03-security-analysis.ts` | 5.3 Smart Contract Security | Does the contract meet security best practices? |
| `04-performance.ts` | 5.4 Performance & Scalability | How does the system perform under supply chain load? |
| `05-espr-compliance.ts` | 5.5 ESPR Compliance | Does the DPP satisfy EU ESPR information requirements? |
| `06-cross-chain-e2e.ts` | 5.2 Cross-Chain (E2E) | Does the full SATP pipeline preserve DPP integrity across independent EVM networks? |

> **Note:** Scripts 01–05 run on a single local chain (Hardhat/Anvil). Script 06 requires the full SATP setup (2 chains, 2 gateways, 2 APIs) - see [Option B in the backend README](../README.md).

## Results

Each script writes a JSON file to `evaluation/results/`:

```
results/
├── 01-gas-profiling.json          # Gas per operation + cost estimates (L1/L2)
├── 02-cross-chain-validation.json # Data integrity, history, round-trip, rollback
├── 03-security-analysis.json      # Access control + notRevoked invariant tests
├── 04-performance.json            # Throughput, latency, scalability curve
├── 05-espr-compliance.json        # Article 8 requirements matrix
└── 06-cross-chain-e2e.json       # E2E SATP transfer: timings, data integrity, history
```

## Slither (Static Security Analysis)

Run separately (requires Python):

```bash
pip install slither-analyzer
slither contracts/DigitalProductPassport.sol \
  --solc-remaps "@openzeppelin=node_modules/@openzeppelin" \
  --json evaluation/results/03-slither-report.json
```

## Notes

- All scripts deploy a **fresh contract** per run (no state pollution between tests)
- Performance numbers are from a local Hardhat/Anvil node - frame as "local testnet baseline" in the thesis
- The ESPR compliance mapping references EU Regulation 2024/1781 Article 8
- Gas cost estimates use configurable ETH/MATIC prices (edit `01-gas-profiling.ts`)
