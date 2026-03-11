import requests
import json
import os
from time import time


def perform_audit(start=0, end=None):
    if end is None:
        end = int(time() * 1000)
    url = "http://localhost:4010/api/v1/@hyperledger/cactus-plugin-satp-hermes/audit"
    headers = {"Content-Type": "application/json"}
    response = requests.get(url, params={"startTimestamp": start, "endTimestamp": end}, headers=headers)
    response.raise_for_status()
    return response.json()


if __name__ == "__main__":
    current_time = int(time() * 1000)
    response = perform_audit(end=current_time)

    os.makedirs("audits", exist_ok=True)
    output_path = f"audits/audit-{current_time}.json"

    with open(output_path, "w") as f:
        response["sessions"] = [
            json.loads(s) if isinstance(s, str) else s
            for s in response.get("sessions", [])
        ]
        json.dump(response, f, indent=2)

    print(f"Audit saved to {output_path}")
