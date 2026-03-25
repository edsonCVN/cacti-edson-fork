#!/usr/bin/env bash
#
# run-all.sh — Run all evaluation scripts sequentially.
#
# Prerequisites:
#   - Hardhat or Anvil node running on http://127.0.0.1:8545
#
# Usage:
#   cd packages/cactus-plugin-dpp
#   bash evaluation/run-all.sh
#
# Results are written to evaluation/results/*.json

set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR/.." && pwd)"
cd "$ROOT"

TS="npx ts-node --project tsconfig.hardhat.json"

echo ""
echo "══════════════════════════════════════════════════════════════"
echo "  DPP Evaluation Suite"
echo "  $(date)"
echo "══════════════════════════════════════════════════════════════"
echo ""

echo "▶ [1/6] Gas Cost Analysis..."
$TS evaluation/01-gas-profiling.ts
echo ""

echo "▶ [2/6] Cross-Chain Interoperability Validation..."
$TS evaluation/02-cross-chain-validation.ts
echo ""

echo "▶ [3/6] Smart Contract Security Analysis..."
$TS evaluation/03-security-analysis.ts
echo ""

echo "▶ [4/6] Performance & Scalability..."
$TS evaluation/04-performance.ts
echo ""

echo "▶ [5/6] ESPR Compliance Mapping..."
$TS evaluation/05-espr-compliance.ts
echo ""

echo "▶ [6/6] E2E SATP Cross-Chain Transfer (requires full SATP setup)..."
if curl -s http://127.0.0.1:3003/api/v1/@hyperledger/cactus-plugin-dpp/config > /dev/null 2>&1; then
  $TS evaluation/06-cross-chain-e2e.ts
else
  echo "  ⚠ Skipped — chain 2 API not reachable (start all SATP services for this test)"
fi
echo ""

echo "══════════════════════════════════════════════════════════════"
echo "  All evaluations complete!"
echo "  Results: evaluation/results/"
echo "══════════════════════════════════════════════════════════════"
ls -la evaluation/results/
