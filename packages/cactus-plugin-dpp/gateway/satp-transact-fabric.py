#!/usr/bin/env python3
# Drives an EVM -> Fabric cross-chain DPP transfer via SATP Hermes Gateway 1.
#
# Prereqs:
#   - Anvil / Hardhat chain 1 on localhost:8545 with the DPP contract deployed
#     (scripts/deploy-dpp.js writes gateway/deployed-addresses.json).
#   - fabric-samples test-network up with the `dpp` chaincode deployed.
#   - gateway/docker-compose.yaml up (gateways 1 and 3 healthy).
#
# Usage:
#   python3 gateway/satp-transact-fabric.py [token_id]
import requests, json, sys, os

ADDRESSES_FILE = os.path.join(os.path.dirname(__file__), "deployed-addresses.json")

SOURCE_OWNER = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8"  # user on EVM 1
DEST_RECEIVER = "bridge"                                       # Fabric bridge identity
TOKEN_ID = "1001"

URL = "http://localhost:4010/api/v1/@hyperledger/cactus-plugin-satp-hermes/transact"


def transact(token_id):
    with open(ADDRESSES_FILE) as f:
        addresses = json.load(f)

    payload = {
        "contextID": "dppContextFabric",
        "sourceAsset": {
            "id": "DPPAsset",
            "referenceId": "DPP-ERC721-ETHEREUM",
            "owner": SOURCE_OWNER,
            "contractName": "DigitalProductPassport",
            "contractAddress": addresses["chain1"]["contractAddress"],
            "networkId": {"id": "EthereumLedgerTestNetwork1", "ledgerType": "ETHEREUM"},
            "tokenType": "NONSTANDARD_NONFUNGIBLE",
            "amount": token_id,
        },
        "receiverAsset": {
            "id": "DPPAsset",
            "referenceId": "DPP-FABRIC-HLF2",
            "owner": DEST_RECEIVER,
            "contractName": "dpp",
            "contractAddress": "dpp",
            "networkId": {"id": "FabricLedgerTestNetwork", "ledgerType": "FABRIC_2"},
            "tokenType": "NONSTANDARD_NONFUNGIBLE",
            "amount": token_id,
        },
    }
    r = requests.post(URL, json=payload, headers={"Content-Type": "application/json"})
    r.raise_for_status()
    return r.json()


if __name__ == "__main__":
    tid = sys.argv[1] if len(sys.argv) > 1 else TOKEN_ID
    try:
        print(json.dumps(transact(tid), indent=2))
    except requests.HTTPError as e:
        print(json.dumps({"error": str(e), "body": e.response.text}, indent=2))
