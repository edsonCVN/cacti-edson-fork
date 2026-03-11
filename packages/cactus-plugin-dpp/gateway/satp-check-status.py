import requests
import json
import sys


def get_status(session_id):
    url = "http://localhost:4110/api/v1/@hyperledger/cactus-plugin-satp-hermes/status"
    headers = {"Content-Type": "application/json"}
    response = requests.get(url, params={"SessionID": session_id}, headers=headers)
    response.raise_for_status()
    return response.json()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python satp-check-status.py <SESSION_ID>")
        sys.exit(1)

    response = get_status(sys.argv[1])
    print(json.dumps(response, indent=2))
