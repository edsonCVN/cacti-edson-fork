/**
 * 07-fabric-crosschain-e2e.ts
 *
 * Drives an EVM to Fabric SATP transfer: mint on chain-1, transact via the
 * SATP gateway, poll Fabric for the minted token, invoke importCrossChainData,
 * and check that the metadata round-trips.
 *
 * Prerequisites:
 *   1. chain-1 API on 3002 (launch-api.ts).
 *   2. fabric-samples test-network up, DPP chaincode deployed.
 *   3. Fabric REST API on 3004 (scripts/fabric/launch-api-fabric.ts).
 *   4. gateway/docker-compose.yaml up (gateway-1 and gateway-3 healthy).
 *
 * Run:
 *   npx ts-node --project tsconfig.hardhat.json evaluation/07-fabric-crosschain-e2e.ts
 */

import {
  writeResults,
  section,
  pass,
  fail,
  info,
  warn,
  apiGet as dppApiGet,
  apiPost as dppApiPost,
} from "./shared";
// Fabric and SATP endpoints don't share the DPP REST base path that
// shared.ts's apiGet/apiPost assume, so we use node-fetch directly for those.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fetch = require("node-fetch");

const CHAIN1_API = "http://127.0.0.1:3002";
const FABRIC_API = process.env.FABRIC_API ?? "http://127.0.0.1:3004";
const SATP_GATEWAY_1 = "http://localhost:4010";
const SATP_GATEWAY_3 = process.env.SATP_GATEWAY_3 ?? "http://localhost:4210";

async function rawGet(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url}: ${res.status}`);
  return res.json();
}
async function rawPost(url: string, body: any): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${url}: ${res.status}`);
  return res.json();
}

interface TestCase {
  name: string;
  passed: boolean;
  durationMs: number;
  details?: string;
}

const results: TestCase[] = [];

function record(name: string, passed: boolean, durationMs: number, details?: string) {
  results.push({ name, passed, durationMs, details });
  if (passed) pass(`${name} (${durationMs}ms)`);
  else fail(`${name}${details ? ` - ${details}` : ""}`);
}

async function waitForHealth(url: string, label: string, tries = 10): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    try {
      const h = await rawGet(`${url}/health`);
      if (h?.ok) { info(`${label} is up`); return true; }
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  warn(`${label} not reachable at ${url}`);
  return false;
}

async function run() {
  section("Pre-flight: services up?");
  const c1 = await waitForHealth(CHAIN1_API, "Chain-1 API");
  const fa = await waitForHealth(FABRIC_API, "Fabric API");
  if (!c1 || !fa) {
    fail("Required services unreachable - aborting");
    writeResults("07-fabric-crosschain-e2e", { aborted: true, results });
    process.exit(1);
  }

  section("Mint a DPP on EVM chain 1");
  let tokenId: string | undefined;
  let t0 = Date.now();
  try {
    const res = await dppApiPost(CHAIN1_API, "/create-dpp", {
      to: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      productName: "Fabric-bound Olive Oil",
      creationDate: "2026-04-20",
      metadataURI: "ipfs://fabric-test",
    });
    tokenId = String(res.tokenId);
    record("Mint on EVM chain 1", true, Date.now() - t0, `tokenId=${tokenId}`);
  } catch (e: any) {
    record("Mint on EVM chain 1", false, Date.now() - t0, e.message);
    writeResults("07-fabric-crosschain-e2e", { results });
    return;
  }

  section("Trigger SATP transfer chain-1 -> Fabric");
  t0 = Date.now();
  try {
    await rawPost(`${SATP_GATEWAY_1}/api/v1/@hyperledger/cactus-plugin-satp-hermes/transact`, {
      sourceDLT: "EthereumLedgerTestNetwork1",
      destinationDLT: "FabricLedgerTestNetwork",
      sourceAsset: {
        owner: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        ontology: "DPP-ERC721-ETHEREUM",
        amount: tokenId,
      },
      destinationAsset: {
        ontology: "DPP-FABRIC-HLF2",
        amount: tokenId,
        owner: "bridge",
      },
    });
    record("SATP transact request accepted", true, Date.now() - t0);
  } catch (e: any) {
    record("SATP transact request accepted", false, Date.now() - t0, e.message);
  }

  section("Poll Fabric until DPP appears");
  t0 = Date.now();
  let fabricDPP: any | undefined;
  for (let i = 0; i < 60; i++) {
    try {
      fabricDPP = await rawGet(`${FABRIC_API}/dpp/${tokenId}`);
      if (fabricDPP?.tokenId) break;
    } catch { /* keep polling */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (fabricDPP?.tokenId) {
    record("DPP minted on Fabric via SATP", true, Date.now() - t0,
      `state=${fabricDPP.state}`);
  } else {
    record("DPP minted on Fabric via SATP", false, Date.now() - t0,
      "timeout waiting for Fabric mint");
  }

  section("Invoke importCrossChainData on Fabric");
  if (fabricDPP?.tokenId) {
    t0 = Date.now();
    try {
      // Fetch source metadata + history
      const src = await dppApiGet(CHAIN1_API, `/dpp/${tokenId}`);
      const hist = await dppApiGet(CHAIN1_API, `/dpp/${tokenId}/history`);
      await rawPost(`${FABRIC_API}/dpp/importCrossChainData`, {
        tokenId,
        productName: src.productName,
        creationDate: src.creationDate,
        metadataURI: src.additionalMetadataURI,
        certs: src.certifications ?? [],
        historyEntries: hist.history ?? [],
      });
      record("importCrossChainData on Fabric", true, Date.now() - t0);
    } catch (e: any) {
      record("importCrossChainData on Fabric", false, Date.now() - t0, e.message);
    }

    section("Verify metadata preservation on Fabric");
    t0 = Date.now();
    try {
      const after = await rawGet(`${FABRIC_API}/dpp/${tokenId}`);
      const ok =
        after.productName === "Fabric-bound Olive Oil" &&
        after.creationDate === "2026-04-20" &&
        after.additionalMetadataURI === "ipfs://fabric-test";
      record("Metadata preserved post-import", ok, Date.now() - t0,
        ok ? "" : `got ${JSON.stringify(after)}`);
    } catch (e: any) {
      record("Metadata preserved post-import", false, Date.now() - t0, e.message);
    }
  }

  section("Summary");
  const passed = results.filter((r) => r.passed).length;
  info(`${passed}/${results.length} assertions passed`);
  writeResults("07-fabric-crosschain-e2e", {
    timestamp: new Date().toISOString(),
    passed,
    total: results.length,
    results,
  });
}

run().catch((err) => {
  console.error("Fatal error in Fabric E2E:", err);
  writeResults("07-fabric-crosschain-e2e", { error: String(err), results });
  process.exit(1);
});
