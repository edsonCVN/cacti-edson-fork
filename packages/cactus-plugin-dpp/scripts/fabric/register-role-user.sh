#!/usr/bin/env bash
# Registers and enrolls a Fabric CA user with a fixed `role` attribute.
# The DPP chaincode uses `ctx.clientIdentity.getAttributeValue("role")` for
# access control, so every actor (FARMER, PROCESSOR, TRANSPORTER, RETAILER,
# BRIDGE, ADMIN, OWNER, GATEWAY) needs an identity enrolled with that attribute.
#
# Usage:
#   ./scripts/fabric/register-role-user.sh <username> <role>
#   e.g. ./scripts/fabric/register-role-user.sh farmer1 FARMER
#
# Env:
#   FABRIC_SAMPLES   -- path to fabric-samples (default: ~/fabric/fabric-samples)
#   ORG              -- org short name, "org1" or "org2" (default: org1)
set -euo pipefail

USER_NAME="${1:?username required}"
ROLE="${2:?role required (FARMER|PROCESSOR|TRANSPORTER|RETAILER|BRIDGE|ADMIN|OWNER|GATEWAY)}"
FABRIC_SAMPLES="${FABRIC_SAMPLES:-$HOME/fabric/fabric-samples}"
ORG="${ORG:-org1}"
CA_PORT="7054"
[ "$ORG" = "org2" ] && CA_PORT="8054"
CA_NAME="ca-$ORG"

export PATH="$FABRIC_SAMPLES/bin:$PATH"
export FABRIC_CA_CLIENT_HOME="$FABRIC_SAMPLES/test-network/organizations/peerOrganizations/${ORG}.example.com"
TLS_CERT="$FABRIC_SAMPLES/test-network/organizations/fabric-ca/${ORG}/ca-cert.pem"

# Ensure CA admin is enrolled (idempotent -- re-enrolling is harmless).
fabric-ca-client enroll \
  -u "https://admin:adminpw@localhost:${CA_PORT}" \
  --caname "$CA_NAME" \
  --tls.certfiles "$TLS_CERT" >/dev/null

# Register the new user with role attribute (ecert so it's attached to the
# enrollment certificate).
fabric-ca-client register \
  --caname "$CA_NAME" \
  --id.name "$USER_NAME" \
  --id.secret "${USER_NAME}pw" \
  --id.type client \
  --id.attrs "role=${ROLE}:ecert" \
  --tls.certfiles "$TLS_CERT" 2>/dev/null || echo "(user ${USER_NAME} may already be registered)"

USER_MSP="$FABRIC_SAMPLES/test-network/organizations/peerOrganizations/${ORG}.example.com/users/${USER_NAME}@${ORG}.example.com/msp"
mkdir -p "$USER_MSP"
FABRIC_CA_CLIENT_HOME="$FABRIC_SAMPLES/test-network/organizations/peerOrganizations/${ORG}.example.com/users/${USER_NAME}@${ORG}.example.com" \
  fabric-ca-client enroll \
    -u "https://${USER_NAME}:${USER_NAME}pw@localhost:${CA_PORT}" \
    --caname "$CA_NAME" \
    --enrollment.attrs "role" \
    -M "$USER_MSP" \
    --tls.certfiles "$TLS_CERT"

# Copy Node OU classification config.yaml so the MSP is valid.
cp "$FABRIC_SAMPLES/test-network/organizations/peerOrganizations/${ORG}.example.com/users/Admin@${ORG}.example.com/msp/config.yaml" "$USER_MSP/config.yaml"

echo "Enrolled ${USER_NAME} (role=${ROLE}) at ${USER_MSP}"
