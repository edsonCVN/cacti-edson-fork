/**
 * launch-api-fabric.ts
 *
 * Lightweight REST gateway for the Fabric-based DPP chaincode.
 *
 * Uses `@hyperledger/fabric-gateway` directly. Listens on port 3004 so it
 * sits alongside chain-1 on 3002 and chain-2 on 3003.
 *
 * Configuration via env vars (all have sensible defaults for
 * fabric-samples/test-network):
 *
 *   FABRIC_SAMPLES       Path to fabric-samples (default: ~/fabric/fabric-samples)
 *   FABRIC_USER_ID       MSP username to act as (default: farmer1)
 *   FABRIC_USER_ORG      Org short name, org1|org2 (default: org1)
 *   FABRIC_API_PORT      HTTP port (default: 3004)
 *   FABRIC_CHANNEL       Channel name (default: mychannel)
 *   FABRIC_CONTRACT      Chaincode name (default: dpp)
 *
 * Run:
 *   npx ts-node --project tsconfig.hardhat.json scripts/fabric/launch-api-fabric.ts
 */

import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import * as grpc from "@grpc/grpc-js";
import {
  connect,
  Contract,
  Identity,
  Signer,
  signers,
} from "@hyperledger/fabric-gateway";
import { X509Certificate, createPrivateKey } from "crypto";
import express from "express";
import bodyParser from "body-parser";

const FABRIC_SAMPLES =
  process.env.FABRIC_SAMPLES ?? path.join(os.homedir(), "fabric/fabric-samples");
const USER_ID = process.env.FABRIC_USER_ID ?? "farmer1";
const USER_ORG = process.env.FABRIC_USER_ORG ?? "org1";
const PORT = parseInt(process.env.FABRIC_API_PORT ?? "3004", 10);
const CHANNEL = process.env.FABRIC_CHANNEL ?? "mychannel";
const CONTRACT_NAME = process.env.FABRIC_CONTRACT ?? "dpp";
const MSP_ID = USER_ORG === "org2" ? "Org2MSP" : "Org1MSP";
const PEER_ENDPOINT =
  process.env.FABRIC_PEER_ENDPOINT ??
  (USER_ORG === "org2" ? "localhost:9051" : "localhost:7051");
const PEER_HOST_ALIAS = `peer0.${USER_ORG}.example.com`;

const CRYPTO_BASE = path.join(
  FABRIC_SAMPLES,
  "test-network/organizations/peerOrganizations",
  `${USER_ORG}.example.com`,
);
const USER_MSP = path.join(CRYPTO_BASE, "users", `${USER_ID}@${USER_ORG}.example.com`, "msp");
const PEER_TLS_CERT = path.join(CRYPTO_BASE, "peers", PEER_HOST_ALIAS, "tls/ca.crt");

function firstFile(dir: string): string {
  const files = fs.readdirSync(dir);
  if (!files.length) throw new Error(`No files in ${dir}`);
  return path.join(dir, files[0]);
}

async function buildIdentity(): Promise<Identity> {
  const certPath = firstFile(path.join(USER_MSP, "signcerts"));
  const credentials = fs.readFileSync(certPath);
  return { mspId: MSP_ID, credentials };
}

async function buildSigner(): Promise<Signer> {
  const keyPath = firstFile(path.join(USER_MSP, "keystore"));
  const privateKeyPem = fs.readFileSync(keyPath);
  const privateKey = createPrivateKey(privateKeyPem);
  return signers.newPrivateKeySigner(privateKey);
}

// Typed as `any` because the monorepo pulls two versions of @grpc/grpc-js
// (Cacti root and fabric-gateway); the structural types don't match at compile time.
async function newGrpcClient(): Promise<any> {
  const tlsRootCert = fs.readFileSync(PEER_TLS_CERT);
  const tlsCredentials = grpc.credentials.createSsl(tlsRootCert);
  return new grpc.Client(PEER_ENDPOINT, tlsCredentials, {
    "grpc.ssl_target_name_override": PEER_HOST_ALIAS,
  });
}

async function submit(contract: Contract, fn: string, ...args: string[]): Promise<string> {
  const bytes = await contract.submitTransaction(fn, ...args);
  return new TextDecoder().decode(bytes);
}
async function evaluate(contract: Contract, fn: string, ...args: string[]): Promise<string> {
  const bytes = await contract.evaluateTransaction(fn, ...args);
  return new TextDecoder().decode(bytes);
}

async function main() {
  console.log(`Booting Fabric DPP REST API as ${USER_ID}@${USER_ORG} (${MSP_ID})`);
  const client = await newGrpcClient();
  const gateway = connect({
    client,
    identity: await buildIdentity(),
    signer: await buildSigner(),
  });
  const network = gateway.getNetwork(CHANNEL);
  const contract = network.getContract(CONTRACT_NAME);

  const app = express();
  app.use(bodyParser.json({ limit: "2mb" }));

  app.get("/health", (_req: express.Request, res: express.Response) => {
    res.json({ ok: true, chain: "fabric", mspId: MSP_ID, channel: CHANNEL, contract: CONTRACT_NAME });
  });

  app.post("/dpp/create", async (req, res) => {
    try {
      const { to, productName, creationDate, metadataURI } = req.body;
      const tokenId = await submit(contract, "CreateDPP", to, productName, creationDate, metadataURI);
      res.json({ tokenId });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/dpp/transfer", async (req, res) => {
    try {
      await submit(contract, "TransferDPP", req.body.tokenId, req.body.newOwner);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/dpp/amend", async (req, res) => {
    try {
      await submit(contract, "AmendDPPData", req.body.tokenId, req.body.metadataURI);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/dpp/certification", async (req, res) => {
    try {
      await submit(contract, "AddCertification", req.body.tokenId, req.body.certId);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/dpp/transport", async (req, res) => {
    try {
      const { tokenId, locationFrom, locationTo, timestamp, conditionData } = req.body;
      await submit(contract, "UpdateTransportData", tokenId, locationFrom, locationTo, timestamp, conditionData);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/dpp/revoke", async (req, res) => {
    try {
      await submit(contract, "RevokeDPP", req.body.tokenId, req.body.reason);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/dpp/importCrossChainData", async (req, res) => {
    try {
      const { tokenId, productName, creationDate, metadataURI, certs, historyEntries } = req.body;
      await submit(
        contract,
        "ImportCrossChainData",
        tokenId,
        productName,
        creationDate,
        metadataURI,
        JSON.stringify(certs ?? []),
        JSON.stringify(historyEntries ?? []),
      );
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/dpp/:tokenId", async (req, res) => {
    try {
      const raw = await evaluate(contract, "GetDPP", req.params.tokenId);
      res.json(JSON.parse(raw));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/dpp/:tokenId/history", async (req, res) => {
    try {
      const raw = await evaluate(contract, "GetHistory", req.params.tokenId);
      res.json({ history: JSON.parse(raw) });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/dpps", async (_req, res) => {
    try {
      const raw = await evaluate(contract, "GetAllDPPs");
      res.json(JSON.parse(raw));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  const server = app.listen(PORT, () => {
    console.log(`Fabric DPP API listening on http://localhost:${PORT}`);
    console.log(`Channel: ${CHANNEL} | Contract: ${CONTRACT_NAME} | Identity: ${USER_ID}@${USER_ORG}`);
  });

  const shutdown = () => {
    console.log("\nShutting down Fabric DPP API...");
    gateway.close();
    client.close();
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Fabric API failed to start:", err);
  process.exit(1);
});
