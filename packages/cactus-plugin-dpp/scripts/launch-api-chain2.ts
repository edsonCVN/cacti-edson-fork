/**
 * launch-api-chain2.ts
 *
 * API gateway for chain 2 (port 8546).
 * - Read endpoints: list / inspect DPPs received via SATP
 * - Write endpoints: supply-chain actions for chain-2 participants
 * - Cross-chain transfer: chain 2 -> chain 1 via SATP gateway-2 (port 4110)
 *
 * Run AFTER deploy-dpp.js:
 *   npx ts-node --project tsconfig.hardhat.json scripts/launch-api-chain2.ts
 *
 * Then start the second frontend on port 3001:
 *   NEXT_PUBLIC_CACTI_API_URL=http://127.0.0.1:3003 NEXT_DIST_DIR=.next-chain2 npm run dev -- -p 3001
 */

import * as fs from "fs";
import * as path from "path";
import { ethers } from "ethers";
import express from "express";
import fetch from "node-fetch";
import { EVMDPPLeaf } from "../src/main/typescript/implementations/evm-dpp-leaf";

const ADDRESSES_FILE  = path.resolve(__dirname, "../gateway/deployed-addresses.json");
const SATP_GATEWAY_2  = "http://localhost:4110";
const CHAIN1_API      = "http://127.0.0.1:3002";
const DPP_API_BASE    = "/api/v1/@hyperledger/cactus-plugin-dpp";

// Gateway-2 EOA signer - deploys SATPWrapper at nonce 0 (no prior txs on chain 2)
const GATEWAY_SIGNER_2 = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const SATP_WRAPPER_2   = ethers.utils.getContractAddress({ from: GATEWAY_SIGNER_2, nonce: 0 });

const ERC721_APPROVAL_ABI = [
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function setApprovalForAll(address operator, bool approved)",
  "function isApprovedForAll(address owner, address operator) view returns (bool)",
];

// ─── Background metadata sync (chain 2 -> chain 1 after SATP completes) ──────

async function syncMetadataToChain1(
  sessionId: string,
  dppId: string,
  snap: {
    productName: string;
    creationDate: string;
    publicData: any;
    certifications: string[];
    history: string[];
  },
) {
  const POLL_INTERVAL = 3000;
  const POLL_MAX = 60;

  console.log(`[metadata-sync] Waiting for SATP session ${sessionId}…`);
  for (let i = 0; i < POLL_MAX; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
    try {
      const r = await fetch(
        `${SATP_GATEWAY_2}/api/v1/@hyperledger/cactus-plugin-satp-hermes/status?SessionID=${sessionId}`,
        { headers: { "Content-Type": "application/json" } },
      );
      const st = (await r.json()) as any;
      const s   = st?.status?.toUpperCase();
      const sub = st?.substatus?.toUpperCase();
      if (s === "DONE" || sub === "COMPLETED") break;
      if (s === "FAILED" || s === "INVALID") {
        console.error(`[metadata-sync] Session ${sessionId} failed - skipping metadata sync`);
        return;
      }
    } catch { /* keep polling */ }
  }

  console.log(`[metadata-sync] Session done. Restoring full DPP ${dppId} on chain 1…`);

  try {
    const res = await fetch(`${CHAIN1_API}${DPP_API_BASE}/restore-cross-chain-data`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dppId,
        productName: snap.productName,
        creationDate: snap.creationDate,
        metadataURI: JSON.stringify(snap.publicData || {}),
        certifications: snap.certifications,
        history: snap.history,
      }),
    });
    if (res.ok) {
      console.log(`[metadata-sync] Full data restored on chain 1 for DPP ${dppId}`);
    } else {
      console.error(`[metadata-sync] Restore failed: ${await res.text()}`);
    }
  } catch (e: any) {
    console.error(`[metadata-sync] Restore request failed: ${e.message}`);
  }

  console.log(`[metadata-sync] Complete for DPP ${dppId}`);
}

async function main() {
  const rpcUrl = "http://127.0.0.1:8546";
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);

  // Chain 2 uses accounts 4–8 (matching deploy-dpp.js BASE = 4)
  const allSigners = Array.from({ length: 10 }, (_, i) => provider.getSigner(i));
  try {
    await allSigners[4].getAddress();
    console.log(`Connected to chain 2 at ${rpcUrl}`);
  } catch {
    console.error("Could not connect to chain 2 - run 'npx hardhat node --port 8546' first.");
    process.exit(1);
  }

  // ── Resolve contract address from deployed-addresses.json ─────────────────
  if (!fs.existsSync(ADDRESSES_FILE)) {
    console.error("deployed-addresses.json not found - run 'node scripts/deploy-dpp.js' first.");
    process.exit(1);
  }
  const deployed = JSON.parse(fs.readFileSync(ADDRESSES_FILE, "utf8"));
  if (!deployed.chain2) {
    console.error("chain2 entry missing in deployed-addresses.json - run 'node scripts/deploy-dpp.js' first.");
    process.exit(1);
  }

  const contractAddress = deployed.chain2.contractAddress;
  console.log(`Using chain 2 contract: ${contractAddress}`);

  // Build signer map (accounts 4-8 are the chain-2 participants)
  const signerMap: Record<string, ethers.Signer> = {};
  for (const s of allSigners) {
    signerMap[(await s.getAddress()).toLowerCase()] = s;
  }

  const deployer = allSigners[4];
  const leaf = new EVMDPPLeaf({ network: "EVM", signer: deployer, contractAddress });

  function leafFor(address?: string): EVMDPPLeaf {
    if (!address) return leaf;
    const signer = signerMap[address.toLowerCase()];
    return signer ? new EVMDPPLeaf({ network: "EVM", signer, contractAddress }) : leaf;
  }

  // ── Express ───────────────────────────────────────────────────────────────
  const app = express();

  app.use((req: any, res: any, next: any) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (req.method === "OPTIONS") return res.sendStatus(200);
    next();
  });
  app.use(express.json());

  const base = "/api/v1/@hyperledger/cactus-plugin-dpp";

  app.get(`${base}/config`, (_req, res) => {
    res.json({ contractAddress, network: "Hardhat Chain 2 (port 8546)", satpGateway: SATP_GATEWAY_2 });
  });

  app.get(`${base}/passports`, async (_req, res) => {
    try { res.json(await leaf.getAllPassports()); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Restore full DPP data after cross-chain transfer (called by source chain's sync)
  app.post(`${base}/restore-cross-chain-data`, async (req, res) => {
    try {
      res.json(await leaf.importCrossChainData({
        dppId: req.body.dppId,
        productName: req.body.productName,
        creationDate: req.body.creationDate,
        metadataURI: req.body.metadataURI,
        certifications: req.body.certifications || [],
        history: req.body.history || [],
      }));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get(`${base}/data`, async (req, res) => {
    try { res.json(await leaf.getDPPData({ dppId: String(req.query.dppId || "0") })); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get(`${base}/history/:dppId`, async (req, res) => {
    try { res.json(await leaf.getDPPHistory({ dppId: req.params.dppId })); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Supply-chain write endpoints (for chain-2 participants after receiving DPPs)
  app.post(`${base}/update-transport-data`, async (req, res) => {
    const addr = req.body.handlerAddress || req.body.transportData?.handlerAddress;
    try { res.json(await leafFor(addr).updateTransportData(req.body)); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post(`${base}/submit-product-review`, async (req, res) => {
    try { res.json(await leafFor(req.body.handlerAddress).submitProductReview(req.body)); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post(`${base}/mark-as-received`, async (req, res) => {
    try { res.json(await leafFor(req.body.handlerAddress).receiveDPP(req.body)); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post(`${base}/update-retail-data`, async (req, res) => {
    try { res.json(await leafFor(req.body.handlerAddress).updateRetailData(req.body)); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post(`${base}/amend`, async (req, res) => {
    try { res.json(await leafFor(req.body.handlerAddress).amendDPPData({ dppId: req.body.dppId, newData: req.body.newData })); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post(`${base}/add-certification`, async (req, res) => {
    try { res.json(await leafFor(req.body.handlerAddress).addCertification({ dppId: req.body.dppId, certificationData: req.body.certificationData })); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Cross-chain transfer (chain 2 -> chain 1 via SATP gateway-2) ─────────────
  app.post(`${base}/cross-chain-transfer`, async (req, res) => {
    try {
      const deployed2 = JSON.parse(fs.readFileSync(ADDRESSES_FILE, "utf8"));
      if (!deployed2.chain1) {
        res.status(503).json({ error: "chain1 entry missing in deployed-addresses.json." });
        return;
      }

      const tokenId = String(req.body.dppId ?? req.body.tokenId);

      // Snapshot ALL data BEFORE the lock so we can fully restore on chain 1
      let metadataSnapshot: {
        productName: string;
        creationDate: string;
        publicData: any;
        certifications: string[];
        history: string[];
      } | null = null;
      try {
        const snap = await leaf.getDPPData({ dppId: tokenId });
        const dd = snap.dppData;
        let historyEntries: string[] = [];
        try {
          historyEntries = await leaf.getRawHistory(tokenId);
        } catch { /* non-fatal */ }
        metadataSnapshot = {
          productName: dd?.productName ?? "",
          creationDate: dd?.creationDate ?? "",
          publicData:  dd?.publicData || {},
          certifications: (dd?.certifications || []).map((c: any) => typeof c === "string" ? c : JSON.stringify(c)),
          history: historyEntries,
        };
      } catch { /* non-fatal */ }

      // Look up the actual on-chain owner on chain 2
      const dppRO = new ethers.Contract(contractAddress, ERC721_APPROVAL_ABI, provider);
      let sourceOwner: string;
      try {
        sourceOwner = req.body.sourceOwner ?? (await dppRO.ownerOf(tokenId));
      } catch {
        sourceOwner = deployed2.chain2.ownerAddress ?? (await allSigners[4].getAddress());
      }

      // Ensure SATPWrapper-2 is approved by the token owner
      const ownerSigner = signerMap[sourceOwner.toLowerCase()];
      if (ownerSigner) {
        const already = await dppRO.isApprovedForAll(sourceOwner, SATP_WRAPPER_2).catch(() => false);
        if (!already) {
          const dppWithOwner = new ethers.Contract(contractAddress, ERC721_APPROVAL_ABI, ownerSigner);
          await (await dppWithOwner.setApprovalForAll(SATP_WRAPPER_2, true)).wait();
          console.log(`Granted setApprovalForAll for SATPWrapper-2 to owner ${sourceOwner}`);
        }
      }

      const destReceiver = req.body.receiverAddress
        ?? deployed2.chain1.ownerAddress
        ?? (await allSigners[1].getAddress());

      const transactPayload = {
        contextID: "dppContext",
        sourceAsset: {
          id: "DPPAsset",
          referenceId: "DPP-ERC721-ETHEREUM",
          owner: sourceOwner.toLowerCase(),
          contractName: "DigitalProductPassport",
          contractAddress: deployed2.chain2.contractAddress,
          networkId: { id: "EthereumLedgerTestNetwork2", ledgerType: "ETHEREUM" },
          tokenType: "NONSTANDARD_NONFUNGIBLE",
          amount: tokenId,
        },
        receiverAsset: {
          id: "DPPAsset",
          referenceId: "DPP-ERC721-ETHEREUM",
          owner: destReceiver.toLowerCase(),
          contractName: "DigitalProductPassport",
          contractAddress: deployed2.chain1.contractAddress,
          networkId: { id: "EthereumLedgerTestNetwork1", ledgerType: "ETHEREUM" },
          tokenType: "NONSTANDARD_NONFUNGIBLE",
          amount: tokenId,
        },
      };

      const satpRes = await fetch(
        `${SATP_GATEWAY_2}/api/v1/@hyperledger/cactus-plugin-satp-hermes/transact`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(transactPayload) },
      );
      const satpData = (await satpRes.json()) as any;
      if (!satpRes.ok) {
        res.status(satpRes.status).json(satpData);
        return;
      }

      const sessionId = satpData.sessionID ?? satpData.SESSION_ID ?? satpData.sessionId;
      res.json({ sessionId, raw: satpData });

      if (sessionId && metadataSnapshot) {
        syncMetadataToChain1(sessionId, tokenId, metadataSnapshot).catch((e) =>
          console.error(`[metadata-sync] Unexpected error for DPP ${tokenId}: ${e.message}`),
        );
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── SATP session status (proxy to gateway-2) ──────────────────────────────
  app.get(`${base}/cross-chain-status`, async (req, res) => {
    try {
      const sessionId = req.query.sessionId as string;
      if (!sessionId) {
        res.status(400).json({ error: "sessionId query param required" });
        return;
      }
      const satpRes = await fetch(
        `${SATP_GATEWAY_2}/api/v1/@hyperledger/cactus-plugin-satp-hermes/status?SessionID=${sessionId}`,
        { headers: { "Content-Type": "application/json" } },
      );
      res.status(satpRes.status).json(await satpRes.json());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  const PORT = 3003;
  app.listen(PORT, "127.0.0.1", () => {
    console.log(`\nCacti DPP API Gateway (Chain 2) running on http://127.0.0.1:${PORT}`);
    console.log(`Contract : ${contractAddress}`);
    console.log(`Chain 2  : ${rpcUrl}`);
    console.log(`\nStart the second frontend with:`);
    console.log(`  NEXT_PUBLIC_CACTI_API_URL=http://127.0.0.1:3003 npm run dev -- -p 3001`);
    console.log(`\nReady.\n`);
  });
}

main().catch(console.error);
