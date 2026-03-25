/**
 * launch-api.ts
 *
 * REST API gateway for the DPP plugin.
 *
 * Start-up behaviour:
 *   1. If gateway/deployed-addresses.json exists (written by deploy-dpp.js),
 *      connect to the ALREADY-DEPLOYED chain-1 contract so that both this
 *      server and the SATP Hermes gateways share the same contract instance.
 *   2. Otherwise deploy a fresh contract (standalone / dev mode), grant all
 *      supply-chain roles, and write deployed-addresses.json so the SATP
 *      gateways can be started afterwards.
 *
 * Run:
 *   npx ts-node --project tsconfig.hardhat.json scripts/launch-api.ts
 */

import * as fs from "fs";
import * as path from "path";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const solc = require("solc");
import { ethers } from "ethers";
import express from "express";
import fetch from "node-fetch";
import { EVMDPPLeaf } from "../src/main/typescript/implementations/evm-dpp-leaf";

const ADDRESSES_FILE = path.resolve(__dirname, "../gateway/deployed-addresses.json");
const SATP_GATEWAY_1 = "http://localhost:4010";
const CHAIN2_API     = "http://127.0.0.1:3003";
const DPP_API_BASE   = "/api/v1/@hyperledger/cactus-plugin-dpp";

// Gateway-1 EOA signer — deploys SATPWrapper at nonce 9 (after deploy-dpp.js runs 9 txs)
const GATEWAY_SIGNER_1 = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const SATP_WRAPPER_1   = ethers.utils.getContractAddress({ from: GATEWAY_SIGNER_1, nonce: 9 });

// Minimal ABI for ownership + approval checks
const ERC721_APPROVAL_ABI = [
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function setApprovalForAll(address operator, bool approved)",
  "function isApprovedForAll(address owner, address operator) view returns (bool)",
];

// ─── Contract compilation (used only when no deployed-addresses.json exists) ──

function compileContract() {
  const contractPath = path.resolve(__dirname, "../contracts/DigitalProductPassport.sol");
  if (!fs.existsSync(contractPath)) throw new Error(`Contract not found: ${contractPath}`);
  const source = fs.readFileSync(contractPath, "utf8");
  const input = {
    language: "Solidity",
    sources: { "DigitalProductPassport.sol": { content: source } },
    settings: {
      evmVersion: "cancun",
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { "*": { "*": ["abi", "evm.bytecode"] } },
    },
  };
  function findImports(dep: string) {
    const oz = path.resolve(__dirname, "../node_modules", dep);
    if (dep.startsWith("@openzeppelin") && fs.existsSync(oz)) return { contents: fs.readFileSync(oz, "utf8") };
    const local = path.resolve(__dirname, "../contracts", dep);
    if (fs.existsSync(local)) return { contents: fs.readFileSync(local, "utf8") };
    return { error: `File not found: ${dep}` };
  }
  console.log("Compiling DigitalProductPassport.sol…");
  const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
  if (output.errors?.some((e: any) => e.severity === "error")) throw new Error("Compilation failed");
  const c = output.contracts["DigitalProductPassport.sol"]["DigitalProductPassport"];
  return { abi: c.abi, bytecode: c.evm.bytecode.object };
}

// ─── Background metadata sync (chain 1 → chain 2 after SATP completes) ──────

/**
 * After a successful SATP cross-chain transfer the token on chain 2 is minted
 * with placeholder metadata ("Cross-Chain DPP", empty additionalMetadataURI).
 * This function waits for the SATP session to reach DONE/COMPLETED and then
 * pushes the original chain-1 metadata (publicData + certifications) to the
 * chain-2 API so the DPP is fully restored on the destination chain.
 */
async function syncMetadataToChain2(
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
  const POLL_MAX = 60; // 3 min

  console.log(`[metadata-sync] Waiting for SATP session ${sessionId}…`);
  for (let i = 0; i < POLL_MAX; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
    try {
      const r = await fetch(
        `${SATP_GATEWAY_1}/api/v1/@hyperledger/cactus-plugin-satp-hermes/status?SessionID=${sessionId}`,
        { headers: { "Content-Type": "application/json" } },
      );
      const st = (await r.json()) as any;
      const s   = st?.status?.toUpperCase();
      const sub = st?.substatus?.toUpperCase();
      if (s === "DONE" || sub === "COMPLETED") break;
      if (s === "FAILED" || s === "INVALID") {
        console.error(`[metadata-sync] Session ${sessionId} failed — skipping metadata sync`);
        return;
      }
    } catch { /* keep polling */ }
  }

  console.log(`[metadata-sync] Session done. Restoring full DPP ${dppId} on chain 2…`);

  try {
    const res = await fetch(`${CHAIN2_API}${DPP_API_BASE}/restore-cross-chain-data`, {
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
      console.log(`[metadata-sync] Full data restored on chain 2 for DPP ${dppId}`);
    } else {
      console.error(`[metadata-sync] Restore failed: ${await res.text()}`);
    }
  } catch (e: any) {
    console.error(`[metadata-sync] Restore request failed: ${e.message}`);
  }

  console.log(`[metadata-sync] Complete for DPP ${dppId}`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const rpcUrl = "http://127.0.0.1:8545";
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);

  // 10 default Anvil/Hardhat accounts
  const allSigners = Array.from({ length: 10 }, (_, i) => provider.getSigner(i));
  try {
    await allSigners[0].getAddress();
    console.log(`Connected to local node at ${rpcUrl}`);
  } catch {
    console.error("Could not connect to local node — run Hardhat or Anvil first.");
    process.exit(1);
  }

  const deployer = allSigners[0];
  const deployerAddr = await deployer.getAddress();

  // Build address → signer map for role-aware routing
  const signerMap: Record<string, ethers.Signer> = {};
  for (const s of allSigners) {
    signerMap[(await s.getAddress()).toLowerCase()] = s;
  }

  // ── Resolve contract address ──────────────────────────────────────────────
  let contractAddress = "";
  let needsDeploy = true;

  if (fs.existsSync(ADDRESSES_FILE)) {
    // ── Mode A: SATP-aware — share the contract deployed by deploy-dpp.js ───
    const deployed = JSON.parse(fs.readFileSync(ADDRESSES_FILE, "utf8"));
    const savedAddr = deployed.chain1.contractAddress;
    // Verify the contract still exists on-chain (node may have been restarted)
    const code = await provider.getCode(savedAddr);
    if (code && code !== "0x") {
      contractAddress = savedAddr;
      needsDeploy = false;
      console.log(`Using existing contract from deployed-addresses.json: ${contractAddress}`);
      console.log("Supply-chain roles were already granted by deploy-dpp.js.");
    } else {
      console.log(`Contract at ${savedAddr} no longer exists (node was restarted?) — redeploying.`);
      fs.unlinkSync(ADDRESSES_FILE);
    }
  }

  if (needsDeploy) {
    // ── Mode B: Standalone — deploy fresh + grant roles + write file ─────────
    console.log("deployed-addresses.json not found — deploying fresh contract (standalone mode).");
    const compiled = compileContract();
    const factory = new ethers.ContractFactory(compiled.abi, compiled.bytecode, deployer);
    const contract = await factory.deploy(deployerAddr);
    await contract.deployed();
    contractAddress = contract.address;
    console.log(`Contract deployed at: ${contractAddress}`);

    // Grant supply-chain roles
    console.log("Granting supply-chain roles…");
    const roleOf = (name: string) => ethers.utils.keccak256(ethers.utils.toUtf8Bytes(name));
    const grants = [
      { role: roleOf("FARMER_ROLE"),      address: await allSigners[1].getAddress() },
      { role: roleOf("PROCESSOR_ROLE"),   address: await allSigners[2].getAddress() },
      { role: roleOf("TRANSPORTER_ROLE"), address: await allSigners[3].getAddress() },
      { role: roleOf("RETAILER_ROLE"),    address: await allSigners[4].getAddress() },
      { role: roleOf("PROCESSOR_ROLE"),   address: await allSigners[1].getAddress() }, // farmer can aggregate
    ];
    for (const { role, address } of grants) {
      await (await (contract as any).grantRole(role, address)).wait();
      console.log(`  Granted role to ${address}`);
    }
    console.log("All roles granted.");

    // Persist so SATP gateways can be started later and use the same contract
    fs.writeFileSync(
      ADDRESSES_FILE,
      JSON.stringify({ chain1: { contractAddress, ownerAddress: deployerAddr } }, null, 2),
    );
    console.log(`Wrote deployed-addresses.json (chain1 only — start deploy-dpp.js for chain2).`);
  }

  // ── EVMDPPLeaf factory ─────────────────────────────────────────────────────
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

  // ── Config endpoint ───────────────────────────────────────────────────────
  app.get(`${base}/config`, (_req, res) => {
    res.json({ contractAddress, network: "Hardhat/Anvil Localnet", satpGateway: SATP_GATEWAY_1 });
  });

  // ── Local DPP operations ──────────────────────────────────────────────────
  app.post(`${base}/create`, async (req, res) => {
    try { res.json(await leafFor(req.body.owner).createDPP(req.body)); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get(`${base}/data`, async (req, res) => {
    try { res.json(await leaf.getDPPData({ dppId: String(req.query.dppId || "0") })); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get(`${base}/passports`, async (req, res) => {
    try { res.json(await leaf.getAllPassports()); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Restore full DPP data after cross-chain transfer (called by the source chain's sync)
  app.post(`${base}/restore-cross-chain-data`, async (req, res) => {
    try {
      res.json(await leaf.restoreCrossChainData({
        dppId: req.body.dppId,
        productName: req.body.productName,
        creationDate: req.body.creationDate,
        metadataURI: req.body.metadataURI,
        certifications: req.body.certifications || [],
        history: req.body.history || [],
      }));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

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

  app.get(`${base}/history/:dppId`, async (req, res) => {
    try { res.json(await leaf.getDPPHistory({ dppId: req.params.dppId })); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post(`${base}/transfer`, async (req, res) => {
    try { res.json(await leafFor(req.body.from).transferDPP({ dppId: req.body.dppId, newOwner: req.body.to })); }
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

  app.post(`${base}/aggregate`, async (req, res) => {
    try { res.json(await leafFor(req.body.handlerAddress).aggregateDPPtoBox(req.body)); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post(`${base}/disaggregate`, async (req, res) => {
    try { res.json(await leafFor(req.body.handlerAddress).disaggregateDPP(req.body)); }
    catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Cross-chain transfer (proxies to SATP Hermes gateway-1) ──────────────
  /**
   * POST /cross-chain-transfer
   * Body: { dppId: string | number, receiverAddress?: string }
   *
   * Reads deployed-addresses.json for contract addresses and forwards a
   * /transact request to SATP gateway-1 (port 4010).
   * Returns { sessionId } on success.
   */
  app.post(`${base}/cross-chain-transfer`, async (req, res) => {
    try {
      if (!fs.existsSync(ADDRESSES_FILE)) {
        res.status(503).json({
          error: "SATP not configured. Run 'node scripts/deploy-dpp.js' first to set up both chains.",
        });
        return;
      }

      const deployed = JSON.parse(fs.readFileSync(ADDRESSES_FILE, "utf8"));
      if (!deployed.chain2) {
        res.status(503).json({
          error: "chain2 not deployed. Run 'node scripts/deploy-dpp.js' to deploy to both chains.",
        });
        return;
      }

      const tokenId = String(req.body.dppId ?? req.body.tokenId);

      // Snapshot ALL data BEFORE the lock so we can fully restore on chain 2
      let metadataSnapshot: {
        productName: string;
        creationDate: string;
        publicData: any;
        certifications: string[];
        history: string[];
      } | null = null;
      try {
        const snap = await leaf.getDPPData({ dppId: tokenId });
        const dd = snap.dppData!;
        // Read raw on-chain history (own events only, no merged child/origin
        // histories) to avoid duplicating inherited entries on repeated transfers
        let historyEntries: string[] = [];
        try {
          historyEntries = await leaf.getRawHistory(tokenId);
        } catch { /* non-fatal */ }
        metadataSnapshot = {
          productName: dd.productName || "",
          creationDate: dd.creationDate || "",
          publicData:  dd.publicData || {},
          certifications: (dd.certifications || []).map((c: any) => typeof c === "string" ? c : JSON.stringify(c)),
          history: historyEntries,
        };
      } catch { /* non-fatal — proceed without sync */ }

      // Look up the actual on-chain owner of this token so any signer can transfer
      const dppRO = new ethers.Contract(deployed.chain1.contractAddress, ERC721_APPROVAL_ABI, provider);
      let sourceOwner: string;
      try {
        sourceOwner = req.body.sourceOwner ?? (await dppRO.ownerOf(tokenId));
      } catch {
        sourceOwner = deployed.chain1.ownerAddress ?? (await allSigners[1].getAddress());
      }

      // Ensure SATPWrapper is approved by the token owner (needed for lock())
      const ownerSigner = signerMap[sourceOwner.toLowerCase()];
      if (ownerSigner) {
        const already = await dppRO.isApprovedForAll(sourceOwner, SATP_WRAPPER_1).catch(() => false);
        if (!already) {
          const dppWithOwner = new ethers.Contract(deployed.chain1.contractAddress, ERC721_APPROVAL_ABI, ownerSigner);
          await (await dppWithOwner.setApprovalForAll(SATP_WRAPPER_1, true)).wait();
          console.log(`Granted setApprovalForAll for SATPWrapper to owner ${sourceOwner}`);
        }
      }

      // Destination receiver: accounts[5] or caller-supplied
      const destReceiver = req.body.receiverAddress
        ?? deployed.chain2.ownerAddress
        ?? (await allSigners[5].getAddress());

      const transactPayload = {
        contextID: "dppContext",
        sourceAsset: {
          id: "DPPAsset",
          referenceId: "DPP-ERC721-ETHEREUM",
          owner: sourceOwner.toLowerCase(),
          contractName: "DigitalProductPassport",
          contractAddress: deployed.chain1.contractAddress,
          networkId: { id: "EthereumLedgerTestNetwork1", ledgerType: "ETHEREUM" },
          tokenType: "NONSTANDARD_NONFUNGIBLE",
          amount: tokenId,
        },
        receiverAsset: {
          id: "DPPAsset",
          referenceId: "DPP-ERC721-ETHEREUM",
          owner: destReceiver.toLowerCase(),
          contractName: "DigitalProductPassport",
          contractAddress: deployed.chain2.contractAddress,
          networkId: { id: "EthereumLedgerTestNetwork2", ledgerType: "ETHEREUM" },
          tokenType: "NONSTANDARD_NONFUNGIBLE",
          amount: tokenId,
        },
      };

      const satpRes = await fetch(
        `${SATP_GATEWAY_1}/api/v1/@hyperledger/cactus-plugin-satp-hermes/transact`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(transactPayload) },
      );
      const satpData = (await satpRes.json()) as any;
      if (!satpRes.ok) {
        res.status(satpRes.status).json(satpData);
        return;
      }

      const sessionId = satpData.sessionID ?? satpData.SESSION_ID ?? satpData.sessionId;
      res.json({ sessionId, raw: satpData });

      // Background: wait for SATP to complete then restore metadata on chain 2
      if (sessionId && metadataSnapshot) {
        syncMetadataToChain2(sessionId, tokenId, metadataSnapshot).catch((e) =>
          console.error(`[metadata-sync] Unexpected error for DPP ${tokenId}: ${e.message}`),
        );
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Full DPP audit — fetches all passports + their complete histories ─────
  app.get(`${base}/audit`, async (_req, res) => {
    try {
      const passports = await leaf.getAllPassportsForAudit();
      const auditEntries = await Promise.all(
        passports.map(async (p: any) => {
          const tokenId = String(p.tokenId ?? p.id);
          // Use getRawHistory — works for burned tokens (getHistory has no ownership check)
          let history: any[] = [];
          try {
            history = await leaf.getRawHistory(tokenId);
          } catch { /* skip */ }
          return { tokenId, name: p.name, owner: p.ownerAddress, status: p.status, history };
        }),
      );
      res.json({
        generatedAt: new Date().toISOString(),
        totalPassports: auditEntries.length,
        passports: auditEntries,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── SATP session status (proxy to gateway-1) ──────────────────────────────
  app.get(`${base}/cross-chain-status`, async (req, res) => {
    try {
      const sessionId = req.query.sessionId as string;
      if (!sessionId) {
        res.status(400).json({ error: "sessionId query param required" });
        return;
      }
      const satpRes = await fetch(
        `${SATP_GATEWAY_1}/api/v1/@hyperledger/cactus-plugin-satp-hermes/status?SessionID=${sessionId}`,
        { headers: { "Content-Type": "application/json" } },
      );
      res.status(satpRes.status).json(await satpRes.json());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  const PORT = 3002;
  app.listen(PORT, "127.0.0.1", () => {
    console.log(`\nCacti DPP API Gateway running on http://127.0.0.1:${PORT}`);
    console.log(`Contract : ${contractAddress}`);
    console.log(`SATP GW1 : ${SATP_GATEWAY_1} (cross-chain-transfer endpoint)`);
    console.log(`\nReady.\n`);
  });
}

main().catch(console.error);
