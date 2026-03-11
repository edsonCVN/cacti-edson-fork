import requests
import json
import sys
import os

ADDRESSES_FILE = os.path.join(os.path.dirname(__file__), "deployed-addresses.json")

# Source: user address on chain 1 (Hardhat account index 1, set by deploy-dpp.js)
SOURCE_OWNER  = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8"
# Destination: receiver address on chain 2 (Hardhat account index 5)
DEST_RECEIVER = "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc"

TOKEN_ID = "1001"


def load_addresses():
    if not os.path.exists(ADDRESSES_FILE):
        raise FileNotFoundError(
            f"deployed-addresses.json not found.\n"
            f"Run 'node scripts/deploy-dpp.js' first."
        )
    with open(ADDRESSES_FILE) as f:
        return json.load(f)


def execute_transact(params):
    url = "http://localhost:4010/api/v1/@hyperledger/cactus-plugin-satp-hermes/transact"
    headers = {"Content-Type": "application/json"}
    response = requests.post(url, json=params, headers=headers)
    response.raise_for_status()
    return response.json()


def transact(token_id=TOKEN_ID):
    addresses = load_addresses()
    contract_chain_1 = addresses["chain1"]["contractAddress"]
    contract_chain_2 = addresses["chain2"]["contractAddress"]

    req_params = {
        "contextID": "dppContext",
        "sourceAsset": {
            "id": "DPPAsset",
            "referenceId": "DPP-ERC721-ETHEREUM",
            "owner": SOURCE_OWNER,
            "contractName": "DigitalProductPassport",
            "contractAddress": contract_chain_1,
            "networkId": {
                "id": "DPPEthereumNetwork1",
                "ledgerType": "ETHEREUM",
            },
            "tokenType": "NONSTANDARD_NONFUNGIBLE",
            "amount": token_id,
        },
        "receiverAsset": {
            "id": "DPPAsset",
            "referenceId": "DPP-ERC721-ETHEREUM",
            "owner": DEST_RECEIVER,
            "contractName": "DigitalProductPassport",
            "contractAddress": contract_chain_2,
            "networkId": {
                "id": "DPPEthereumNetwork2",
                "ledgerType": "ETHEREUM",
            },
            "tokenType": "NONSTANDARD_NONFUNGIBLE",
            "amount": token_id,
        },
    }
    return execute_transact(req_params)


if __name__ == "__main__":
    token_id = sys.argv[1] if len(sys.argv) > 1 else TOKEN_ID
    try:
        response = transact(token_id)
        if isinstance(response, dict) and "SESSION_ID" in response:
            print(json.dumps({"SESSION_ID": response["SESSION_ID"]}))
        else:
            print(json.dumps(response))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
