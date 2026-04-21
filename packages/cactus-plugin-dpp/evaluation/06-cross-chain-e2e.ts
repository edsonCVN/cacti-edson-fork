/**
 * 06-cross-chain-e2e.ts - End-to-End SATP Cross-Chain Transfer Validation
 *
 * Tests the REAL cross-chain DPP transfer through the full stack:
 *   Chain 1 API -> SATP Hermes Gateway 1 -> SATP Protocol -> Gateway 2 -> Chain 2
 *   + background metadata sync (importCrossChainData)
 *
 * Validates:
 *   - DPP creation on chain 1
 *   - Full SATP transfer (lock -> mint -> assign -> burn)
 *   - Metadata integrity on chain 2 (product name, creation date, metadata hash)
 *   - History preservation on chain 2 (source events + CrossChainImport)
 *   - Image and metadataCid fields preserved
 *   - End-to-end latency measurement
 *
 * Research question: Does the full SATP pipeline preserve DPP integrity
 *                    across independent EVM networks?
 *
 * Prerequisites (Option B - Full SATP mode):
 *   1. Two Hardhat/Anvil nodes: port 8545 (chain 1) + port 8546 (chain 2)
 *   2. Contracts deployed: node scripts/deploy-dpp.js
 *   3. SATP Hermes gateways: cd gateway && docker compose up
 *   4. Chain 1 API: npx ts-node --project tsconfig.hardhat.json scripts/launch-api.ts
 *   5. Chain 2 API: npx ts-node --project tsconfig.hardhat.json scripts/launch-api-chain2.ts
 *
 * Run:
 *   npx ts-node --project tsconfig.hardhat.json evaluation/06-cross-chain-e2e.ts
 */

import * as crypto from "crypto";
import {
  writeResults,
  section,
  pass,
  fail,
  info,
  warn,
  table,
  apiGet,
  apiPost,
  sleep,
  CHAIN1_API,
  CHAIN2_API,
} from "./shared";

function sha256(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  section("5.2+ - End-to-End SATP Cross-Chain Transfer");

  const results: { name: string; passed: boolean; details?: string }[] = [];
  function record(name: string, passed: boolean, details?: string) {
    results.push({ name, passed, details });
    if (passed) pass(name + (details ? ` - ${details}` : ""));
    else fail(name + (details ? ` - ${details}` : ""));
  }

  const timings: { phase: string; durationMs: number }[] = [];

  // ══════════════════════════════════════════════════════════════════════════
  //  Step 0: Verify all services are reachable
  // ══════════════════════════════════════════════════════════════════════════

  section("Step 0: Service Health Check");

  try {
    const config1 = await apiGet(CHAIN1_API, "/config");
    pass(`Chain 1 API reachable - contract: ${config1.contractAddress}`);
  } catch (e: any) {
    fail(`Chain 1 API NOT reachable at ${CHAIN1_API}: ${e.message}`);
    console.error("\nMake sure all services are running (see Prerequisites in the script header).\n");
    process.exit(1);
  }

  try {
    const config2 = await apiGet(CHAIN2_API, "/config");
    pass(`Chain 2 API reachable - contract: ${config2.contractAddress}`);
  } catch (e: any) {
    fail(`Chain 2 API NOT reachable at ${CHAIN2_API}: ${e.message}`);
    console.error("\nStart the chain-2 API: npx ts-node --project tsconfig.hardhat.json scripts/launch-api-chain2.ts\n");
    process.exit(1);
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Step 1: Create a DPP on chain 1
  // ══════════════════════════════════════════════════════════════════════════

  section("Step 1: Create DPP on Chain 1");

  const t0Create = Date.now();
  const createRes = await apiPost(CHAIN1_API, "/create", {
    owner: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", // farmer
    productionData: {
      name: "E2E Cross-Chain Cherry",
      description: "End-to-end SATP transfer test - Cereja do Fundão",
      createdAt: new Date().toISOString().split("T")[0],
      origin: "Fundão, Portugal",
      productionMethod: "Produção Integrada",
      variety: "Burlat",
      calibre: "26-28mm",
      brixDegree: "17%",
      certifications: ["IGP", "GlobalG.A.P."],
      manufacturer: "Quinta da Gardunha",
      image: "ipfs://QmE2ETestImageCid",
      metadataCid: "ipfs://QmE2ETestMetadataCid",
    },
  });
  const tokenId = createRes.dppId;
  timings.push({ phase: "createDPP", durationMs: Date.now() - t0Create });
  pass(`DPP created on chain 1: token #${tokenId}`);

  // Read the full data snapshot from chain 1
  const chain1Data = await apiGet(CHAIN1_API, `/data?dppId=${tokenId}`);
  const chain1Dpp = chain1Data.dppData;
  const chain1MetaHash = sha256(JSON.stringify(chain1Dpp.publicData));
  info(`Chain 1 metadata hash: ${chain1MetaHash.substring(0, 16)}...`);
  info(`Chain 1 product name: ${chain1Dpp.productName}`);
  info(`Chain 1 image: ${chain1Dpp.publicData?.image || "N/A"}`);

  // Read history from chain 1
  const chain1History = await apiGet(CHAIN1_API, `/history/${tokenId}`);
  const chain1EventCount = Array.isArray(chain1History)
    ? chain1History.length
    : chain1History.history?.length ?? 0;
  info(`Chain 1 history events: ${chain1EventCount}`);

  record("DPP created successfully on chain 1", !!tokenId, `tokenId=${tokenId}`);

  // ══════════════════════════════════════════════════════════════════════════
  //  Step 2: Initiate SATP cross-chain transfer
  // ══════════════════════════════════════════════════════════════════════════

  section("Step 2: SATP Cross-Chain Transfer (Chain 1 -> Chain 2)");

  const t0Transfer = Date.now();
  let sessionId: string;
  try {
    const transferRes = await apiPost(CHAIN1_API, "/cross-chain-transfer", {
      dppId: tokenId,
    });
    sessionId = transferRes.sessionId;
    pass(`Transfer initiated - sessionId: ${sessionId}`);
  } catch (e: any) {
    fail(`Cross-chain transfer failed to initiate: ${e.message}`);
    record("SATP transfer initiated", false, e.message);
    writeResults("06-cross-chain-e2e", { timestamp: new Date().toISOString(), tests: results, error: e.message });
    process.exit(1);
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Step 3: Poll SATP session until completion
  // ══════════════════════════════════════════════════════════════════════════

  section("Step 3: Polling SATP Session Status");

  const POLL_INTERVAL = 3000;
  const POLL_MAX = 60; // 3 minutes
  let satpStatus = "PENDING";
  let satpSubstatus = "";

  for (let i = 0; i < POLL_MAX; i++) {
    await sleep(POLL_INTERVAL);
    try {
      const statusRes = await apiGet(CHAIN1_API, `/cross-chain-status?sessionId=${sessionId}`);
      satpStatus = (statusRes.status || "").toUpperCase();
      satpSubstatus = (statusRes.substatus || "").toUpperCase();
      info(`Poll ${i + 1}: status=${satpStatus} substatus=${satpSubstatus}`);

      if (satpStatus === "DONE" || satpSubstatus === "COMPLETED") {
        pass(`SATP session completed!`);
        break;
      }
      if (satpStatus === "FAILED" || satpStatus === "INVALID") {
        fail(`SATP session failed: ${satpStatus}`);
        break;
      }
    } catch {
      // Status endpoint may not be ready yet - keep polling
    }
  }

  const transferDuration = Date.now() - t0Transfer;
  timings.push({ phase: "SATP transfer (lock->mint->assign->burn)", durationMs: transferDuration });

  record(
    "SATP transfer completed",
    satpStatus === "DONE" || satpSubstatus === "COMPLETED",
    `status=${satpStatus}, substatus=${satpSubstatus}, duration=${(transferDuration / 1000).toFixed(1)}s`,
  );

  // ══════════════════════════════════════════════════════════════════════════
  //  Step 4: Wait for metadata sync to complete
  // ══════════════════════════════════════════════════════════════════════════

  section("Step 4: Wait for Metadata Sync (importCrossChainData)");

  // The background sync in launch-api.ts polls the SATP session and then calls
  // /restore-cross-chain-data on chain 2. Give it extra time to complete.
  const SYNC_WAIT = 15000; // 15 seconds
  info(`Waiting ${SYNC_WAIT / 1000}s for background metadata sync...`);
  await sleep(SYNC_WAIT);

  // ══════════════════════════════════════════════════════════════════════════
  //  Step 5: Verify DPP on Chain 2
  // ══════════════════════════════════════════════════════════════════════════

  section("Step 5: Verify DPP on Chain 2");

  let chain2Dpp: any = null;
  let chain2History: any[] = [];

  try {
    const chain2Data = await apiGet(CHAIN2_API, `/data?dppId=${tokenId}`);
    chain2Dpp = chain2Data.dppData;
    pass(`DPP #${tokenId} found on chain 2`);
  } catch (e: any) {
    fail(`DPP #${tokenId} NOT found on chain 2: ${e.message}`);
    warn("The metadata sync may not have completed yet. Try increasing SYNC_WAIT.");
    record("DPP exists on chain 2", false, e.message);
    writeResults("06-cross-chain-e2e", { timestamp: new Date().toISOString(), tests: results, timings });
    process.exit(1);
  }

  // Verify product name
  record(
    "Product name preserved on chain 2",
    chain2Dpp.productName === chain1Dpp.productName,
    `chain1="${chain1Dpp.productName}" chain2="${chain2Dpp.productName}"`,
  );

  // Verify creation date
  record(
    "Creation date preserved on chain 2",
    chain2Dpp.creationDate === chain1Dpp.creationDate,
    `chain1="${chain1Dpp.creationDate}" chain2="${chain2Dpp.creationDate}"`,
  );

  // Verify metadata hash (publicData content)
  if (chain2Dpp.publicData) {
    const chain2MetaHash = sha256(JSON.stringify(chain2Dpp.publicData));
    info(`Chain 2 metadata hash: ${chain2MetaHash.substring(0, 16)}...`);
    record(
      "Metadata hash matches (data integrity)",
      chain1MetaHash === chain2MetaHash,
      `chain1=${chain1MetaHash.substring(0, 16)} chain2=${chain2MetaHash.substring(0, 16)}`,
    );
  } else {
    // Metadata may still be the raw JSON string - try parsing
    warn("Chain 2 publicData is empty - metadata sync may not have completed");
    record("Metadata hash matches (data integrity)", false, "publicData empty on chain 2");
  }

  // Verify image field
  const chain2Image = chain2Dpp.publicData?.image || "";
  const chain1Image = chain1Dpp.publicData?.image || "";
  record(
    "Image IPFS CID preserved",
    chain2Image === chain1Image,
    `chain1="${chain1Image}" chain2="${chain2Image}"`,
  );

  // Verify metadataCid field
  const chain2MetaCid = chain2Dpp.publicData?.metadataCid || "";
  const chain1MetaCid = chain1Dpp.publicData?.metadataCid || "";
  record(
    "Metadata IPFS CID preserved",
    chain2MetaCid === chain1MetaCid,
    `chain1="${chain1MetaCid}" chain2="${chain2MetaCid}"`,
  );

  // Verify certifications
  const chain1Certs = chain2Dpp.certifications?.length ?? 0;
  const chain1CertCount = chain1Dpp.certifications?.length ?? 0;
  record(
    "Certifications preserved",
    chain1Certs >= chain1CertCount || (chain2Dpp.publicData?.certifications?.length ?? 0) >= chain1CertCount,
    `chain1=${chain1CertCount} chain2=${chain1Certs} (on-chain) + ${chain2Dpp.publicData?.certifications?.length ?? 0} (in metadata)`,
  );

  // ══════════════════════════════════════════════════════════════════════════
  //  Step 6: Verify History on Chain 2
  // ══════════════════════════════════════════════════════════════════════════

  section("Step 6: Verify History on Chain 2");

  try {
    const histRes = await apiGet(CHAIN2_API, `/history/${tokenId}`);
    chain2History = Array.isArray(histRes) ? histRes : histRes.history ?? [];
    info(`Chain 2 history events: ${chain2History.length}`);
  } catch (e: any) {
    warn(`Could not fetch chain 2 history: ${e.message}`);
  }

  // Parse history entries
  const parsedHistory = chain2History.map((entry: any) => {
    if (typeof entry === "string") {
      try { return JSON.parse(entry); } catch { return { event: entry }; }
    }
    return entry;
  });

  // Check for CrossChainImport event
  const hasRestore = parsedHistory.some((e: any) => e.event === "CrossChainImport");
  record(
    "CrossChainImport event present in chain 2 history",
    hasRestore,
    `events: ${parsedHistory.map((e: any) => e.event).join(", ")}`,
  );

  // Check original Mint event is preserved
  const hasMint = parsedHistory.some((e: any) => e.event === "Mint");
  record(
    "Original Mint event preserved in chain 2 history",
    hasMint,
  );

  // History should have at least: Mint + CrossChainImport
  record(
    "Chain 2 history has at least 2 events (Mint + CrossChainImport)",
    chain2History.length >= 2,
    `got ${chain2History.length}`,
  );

  // ══════════════════════════════════════════════════════════════════════════
  //  Summary
  // ══════════════════════════════════════════════════════════════════════════

  section("E2E Cross-Chain Transfer Summary");

  info("Timings:");
  table(timings.map((t) => ({
    Phase: t.phase,
    "Duration (ms)": t.durationMs,
    "Duration (s)": (t.durationMs / 1000).toFixed(1),
  })));

  const totalE2E = timings.reduce((sum, t) => sum + t.durationMs, 0);
  info(`Total E2E time: ${(totalE2E / 1000).toFixed(1)}s`);

  const passed = results.filter((t) => t.passed).length;
  const total = results.length;
  info(`\n${passed}/${total} tests passed`);

  writeResults("06-cross-chain-e2e", {
    timestamp: new Date().toISOString(),
    tokenId,
    sessionId,
    tests: results,
    timings,
    totalE2EMs: totalE2E,
    chain1MetaHash,
    chain2MetaHash: chain2Dpp?.publicData ? sha256(JSON.stringify(chain2Dpp.publicData)) : null,
  });

  if (passed === total) pass("All E2E cross-chain tests passed!");
  else fail(`${total - passed} test(s) failed - see details above`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
