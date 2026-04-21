/**
 * 02-cross-chain-validation.ts - Cross-Chain Interoperability Validation
 *
 * Tests SATP protocol correctness on a single chain by simulating the full
 * lock -> mint -> assign -> burn -> importCrossChainData flow.
 *
 * Validates:
 *   - Data integrity (metadata hash match before/after)
 *   - History completeness (all events preserved + CrossChainImport added)
 *   - Round-trip transfer (chain A -> B -> A, no duplicates)
 *   - Failure recovery (unlock rollback)
 *
 * Research question: Does SATP preserve DPP integrity across chains?
 *
 * Run:
 *   npx ts-node --project tsconfig.hardhat.json evaluation/02-cross-chain-validation.ts
 */

import { ethers } from "ethers";
import * as crypto from "crypto";
import {
  deploy,
  section,
  pass,
  fail,
  info,
  assert,
  writeResults,
} from "./shared";

function sha256(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

async function main() {
  section("5.2 - Cross-Chain Interoperability Validation");
  const env = await deploy();
  const { contract, farmer, bridge, processor } = env;
  const farmerAddr = await farmer.getAddress();
  const bridgeAddr = await bridge.getAddress();
  const processorAddr = await processor.getAddress();

  const results: Record<string, any> = {
    timestamp: new Date().toISOString(),
    tests: [],
  };

  function record(name: string, passed: boolean, details?: string) {
    results.tests.push({ name, passed, details });
    if (passed) pass(name + (details ? ` - ${details}` : ""));
    else fail(name + (details ? ` - ${details}` : ""));
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  TEST 1: Data Integrity - metadata hash must match after cross-chain
  // ══════════════════════════════════════════════════════════════════════════

  section("Test 1: Data Integrity");

  // Create a DPP with rich metadata
  const metadata = JSON.stringify({
    name: "Integrity Test Cherry",
    origin: "Fundão",
    variety: "Burlat",
    certifications: ["IGP", "GlobalG.A.P."],
    circular_economy: {
      packaging: [{ material: "Cardboard", recyclability: "100%" }],
    },
  });
  await (
    await contract
      .connect(farmer)
      .createDPP(farmerAddr, "Integrity Test", "2025-06-15", metadata)
  ).wait();
  const tokenId = 0;

  // Snapshot before transfer
  const dataBefore = await contract.getDPPData(tokenId);
  const hashBefore = sha256(dataBefore.additionalMetadataURI);
  info(`Metadata hash before: ${hashBefore.substring(0, 16)}...`);

  // Read history before
  const historyBefore: string[] = await contract.getHistory(tokenId);
  info(`History events before: ${historyBefore.length}`);

  // Simulate SATP: lock -> burn on source
  await (await contract.connect(farmer).approve(bridgeAddr, tokenId)).wait();
  await (
    await contract.connect(bridge).lock(farmerAddr, bridgeAddr, tokenId)
  ).wait();
  await (await contract.connect(bridge).burn(tokenId)).wait();
  info("Source: locked + burned");

  // Simulate SATP: mint on destination (same chain for testing)
  await (await contract.connect(bridge).mint(bridgeAddr, 5000)).wait();
  await (await contract.connect(bridge).assign(farmerAddr, 5000)).wait();
  info("Destination: minted + assigned (token #5000)");

  // Restore cross-chain data
  const certs = await contract.getCertifications(tokenId).catch(() => []);
  await (
    await contract.importCrossChainData(
      5000,
      dataBefore.productName,
      dataBefore.creationDate,
      dataBefore.additionalMetadataURI,
      certs,
      historyBefore,
    )
  ).wait();
  info("Destination: importCrossChainData called");

  // Verify data integrity
  const dataAfter = await contract.getDPPDataUnchecked(5000);
  const hashAfter = sha256(dataAfter.additionalMetadataURI);
  info(`Metadata hash after: ${hashAfter.substring(0, 16)}...`);

  record(
    "Metadata hash matches after cross-chain transfer",
    hashBefore === hashAfter,
    `before=${hashBefore.substring(0, 16)} after=${hashAfter.substring(0, 16)}`,
  );

  record(
    "Product name preserved",
    dataAfter.productName === dataBefore.productName,
    `"${dataAfter.productName}"`,
  );

  record(
    "Creation date preserved",
    dataAfter.creationDate === dataBefore.creationDate,
    `"${dataAfter.creationDate}"`,
  );

  // ══════════════════════════════════════════════════════════════════════════
  //  TEST 2: History Completeness
  // ══════════════════════════════════════════════════════════════════════════

  section("Test 2: History Completeness");

  const historyAfter: string[] = await contract.getHistory(5000);
  info(`History events after restore: ${historyAfter.length}`);
  info(
    `Expected: ${historyBefore.length} (source) + 1 (CrossChainImport) = ${historyBefore.length + 1}`,
  );

  record(
    "History count = source events + CrossChainImport",
    historyAfter.length === historyBefore.length + 1,
    `got ${historyAfter.length}, expected ${historyBefore.length + 1}`,
  );

  // Check last event is CrossChainImport
  const lastEvent = JSON.parse(historyAfter[historyAfter.length - 1]);
  record(
    "Last history event is CrossChainImport",
    lastEvent.event === "CrossChainImport",
    `got "${lastEvent.event}"`,
  );

  // Check all source events are present
  let allSourcePresent = true;
  for (let i = 0; i < historyBefore.length; i++) {
    if (historyAfter[i] !== historyBefore[i]) {
      allSourcePresent = false;
      break;
    }
  }
  record("All source history events preserved in order", allSourcePresent);

  // ══════════════════════════════════════════════════════════════════════════
  //  TEST 3: Round-Trip Transfer (A -> B -> A)
  // ══════════════════════════════════════════════════════════════════════════

  section("Test 3: Round-Trip Transfer (no duplicates)");

  // Create a DPP, do 2 consecutive cross-chain transfers
  const rtMeta = JSON.stringify({
    name: "Round-Trip Cherry",
    origin: "Fundão",
  });
  const rtToken = (
    await contract
      .connect(farmer)
      .callStatic.createDPP(farmerAddr, "Round-Trip", "2025-06-15", rtMeta)
  ).toNumber();
  await (
    await contract
      .connect(farmer)
      .createDPP(farmerAddr, "Round-Trip", "2025-06-15", rtMeta)
  ).wait();
  info(`Created round-trip DPP: token #${rtToken}`);

  // First transfer: source -> destination (token 6000)
  const rtHistBefore: string[] = await contract.getHistory(rtToken);
  const rtCerts = await contract.getCertifications(rtToken).catch(() => []);
  const rtData = await contract.getDPPData(rtToken);

  await (await contract.connect(farmer).approve(bridgeAddr, rtToken)).wait();
  await (
    await contract.connect(bridge).lock(farmerAddr, bridgeAddr, rtToken)
  ).wait();
  await (await contract.connect(bridge).burn(rtToken)).wait();
  await (await contract.connect(bridge).mint(bridgeAddr, 6000)).wait();
  await (await contract.connect(bridge).assign(farmerAddr, 6000)).wait();
  await (
    await contract.importCrossChainData(
      6000,
      rtData.productName,
      rtData.creationDate,
      rtData.additionalMetadataURI,
      rtCerts,
      rtHistBefore,
    )
  ).wait();
  info("Transfer 1 complete: token 1 -> 6000");

  const hist1: string[] = await contract.getHistory(6000);
  info(`After transfer 1: ${hist1.length} events`);

  // Second transfer: destination -> source (token 7000)
  await (await contract.connect(farmer).approve(bridgeAddr, 6000)).wait();
  await (
    await contract.connect(bridge).lock(farmerAddr, bridgeAddr, 6000)
  ).wait();
  await (await contract.connect(bridge).burn(6000)).wait();
  await (await contract.connect(bridge).mint(bridgeAddr, 7000)).wait();
  await (await contract.connect(bridge).assign(farmerAddr, 7000)).wait();
  await (
    await contract.importCrossChainData(
      7000,
      rtData.productName,
      rtData.creationDate,
      rtData.additionalMetadataURI,
      rtCerts,
      hist1,
    )
  ).wait();
  info("Transfer 2 complete: token 6000 -> 7000");

  const hist2: string[] = await contract.getHistory(7000);
  info(`After transfer 2: ${hist2.length} events`);

  // Original had 1 event (Mint), after 2 transfers should have:
  // Mint + CrossChainImport (transfer 1) + CrossChainImport (transfer 2) = 3
  const expectedEvents = rtHistBefore.length + 2; // +2 CrossChainImport
  record(
    "Round-trip: correct event count (no duplicates)",
    hist2.length === expectedEvents,
    `got ${hist2.length}, expected ${expectedEvents}`,
  );

  // Check no duplicate Mint events
  const mintEvents = hist2.filter((h) => {
    try {
      return JSON.parse(h).event === "Mint";
    } catch {
      return false;
    }
  });
  record(
    "Round-trip: no duplicate Mint events",
    mintEvents.length === 1,
    `found ${mintEvents.length} Mint event(s)`,
  );

  // Verify metadata still matches
  const rtDataFinal = await contract.getDPPDataUnchecked(7000);
  record(
    "Round-trip: metadata hash preserved",
    sha256(rtDataFinal.additionalMetadataURI) ===
      sha256(rtData.additionalMetadataURI),
  );

  // ══════════════════════════════════════════════════════════════════════════
  //  TEST 4: Failure Recovery (unlock rollback)
  // ══════════════════════════════════════════════════════════════════════════

  section("Test 4: Failure Recovery (unlock rollback)");

  const rollbackToken = (
    await contract
      .connect(farmer)
      .callStatic.createDPP(farmerAddr, "Rollback Test", "2025-06-15", rtMeta)
  ).toNumber();
  await (
    await contract
      .connect(farmer)
      .createDPP(farmerAddr, "Rollback Test", "2025-06-15", rtMeta)
  ).wait();
  info(`Created rollback test DPP: token #${rollbackToken}`);

  // Lock it
  await (
    await contract.connect(farmer).approve(bridgeAddr, rollbackToken)
  ).wait();
  await (
    await contract.connect(bridge).lock(farmerAddr, bridgeAddr, rollbackToken)
  ).wait();

  const stateAfterLock = (await contract.getDPPData(rollbackToken)).state;
  record(
    "State is LOCKED_CROSSCHAIN after lock",
    stateAfterLock === 5,
    `state=${stateAfterLock}`,
  );

  // Simulate failure: unlock instead of burn
  await (
    await contract.connect(bridge).unlock(bridgeAddr, farmerAddr, rollbackToken)
  ).wait();

  const stateAfterUnlock = (await contract.getDPPData(rollbackToken)).state;
  record(
    "State is CREATED after unlock (rollback)",
    stateAfterUnlock === 0,
    `state=${stateAfterUnlock}`,
  );

  const ownerAfterUnlock = await contract.ownerOf(rollbackToken);
  record(
    "Owner restored to farmer after unlock",
    ownerAfterUnlock.toLowerCase() === farmerAddr.toLowerCase(),
    `owner=${ownerAfterUnlock}`,
  );

  // ── Summary ───────────────────────────────────────────────────────────────

  section("Cross-Chain Validation Summary");

  const passed = results.tests.filter((t: any) => t.passed).length;
  const total = results.tests.length;
  info(`${passed}/${total} tests passed`);

  writeResults("02-cross-chain-validation", results);
  if (passed === total) pass("All cross-chain validation tests passed!");
  else fail(`${total - passed} test(s) failed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
