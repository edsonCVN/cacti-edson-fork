#!/usr/bin/env bash
# Deploys the DPP TypeScript chaincode to the Fabric test network provided by
# `fabric-samples/test-network`. Package, install, approve and commit are all
# handled by `network.sh deployCC` -- we only wrap it so the path to our
# chaincode and the required endorsement policy are easy to re-run.
#
# Prerequisites:
#   1. fabric-samples installed locally (e.g. via scripts/fabric/install-fabric.sh
#      or the upstream curl one-liner). Exports FABRIC_SAMPLES so we know where.
#   2. Test network up: `cd <fabric-samples>/test-network && ./network.sh up createChannel -c mychannel -ca`
#   3. Node.js chaincode runtime image: `docker pull hyperledger/fabric-nodeenv:2.5`
#
# Usage:
#   FABRIC_SAMPLES=$HOME/fabric/fabric-samples ./scripts/fabric/deploy-fabric-chaincode.sh
set -euo pipefail

FABRIC_SAMPLES="${FABRIC_SAMPLES:-$HOME/fabric/fabric-samples}"
CC_NAME="${CC_NAME:-dpp}"
CHANNEL="${CHANNEL:-mychannel}"
ENDORSEMENT_POLICY="${ENDORSEMENT_POLICY:-OR('Org1MSP.peer','Org2MSP.peer')}"
HOST_CC_DIR="$(cd "$(dirname "$0")/../../fabric-chaincode" && pwd)"

if [ ! -d "$FABRIC_SAMPLES/test-network" ]; then
  echo "ERROR: fabric-samples not found at $FABRIC_SAMPLES" >&2
  echo "Install via: curl -sSL https://raw.githubusercontent.com/hyperledger/fabric/main/scripts/install-fabric.sh | bash -s -- --fabric-version 2.5.6 --ca-version 1.5.6 binary samples" >&2
  exit 1
fi

export PATH="$FABRIC_SAMPLES/bin:$PATH"

echo "[deploy-dpp] Deploying $CC_NAME from $HOST_CC_DIR"
cd "$FABRIC_SAMPLES/test-network"
./network.sh deployCC \
  -ccn "$CC_NAME" \
  -ccp "$HOST_CC_DIR" \
  -ccl typescript \
  -ccep "$ENDORSEMENT_POLICY" \
  -c "$CHANNEL"

# Initialise the contract (writes ownerMSPID, creates the nextTokenId counter).
ORDERER_CA="$FABRIC_SAMPLES/test-network/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem"
ORG1_TLS="$FABRIC_SAMPLES/test-network/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt"
ORG2_TLS="$FABRIC_SAMPLES/test-network/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt"
ORG1_ADMIN_MSP="$FABRIC_SAMPLES/test-network/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp"

export FABRIC_CFG_PATH="$FABRIC_SAMPLES/config"
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_LOCALMSPID=Org1MSP
export CORE_PEER_TLS_ROOTCERT_FILE="$ORG1_TLS"
export CORE_PEER_MSPCONFIGPATH="$ORG1_ADMIN_MSP"
export CORE_PEER_ADDRESS=localhost:7051

echo "[deploy-dpp] Invoking Initialize(Org1MSP)"
peer chaincode invoke \
  -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com \
  --tls --cafile "$ORDERER_CA" \
  -C "$CHANNEL" -n "$CC_NAME" \
  --peerAddresses localhost:7051 --tlsRootCertFiles "$ORG1_TLS" \
  --peerAddresses localhost:9051 --tlsRootCertFiles "$ORG2_TLS" \
  -c '{"function":"Initialize","Args":["Org1MSP"]}'

echo "[deploy-dpp] DPP chaincode deployed and initialised on channel $CHANNEL"
