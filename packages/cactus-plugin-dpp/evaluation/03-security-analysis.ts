/**
 * 03-security-analysis.ts — Smart Contract Security Analysis
 *
 * Validates access control and state invariants programmatically.
 * For static analysis, run Slither separately (see instructions below).
 *
 * Tests:
 *   - Access control matrix (each function rejects unauthorized callers)
 *   - notRevoked invariant (no operation succeeds on revoked DPPs)
 *   - SATP bridge role restrictions
 *
 * Research question: Does the DPP contract meet security best practices?
 *
 * Run:
 *   npx ts-node --project tsconfig.hardhat.json evaluation/03-security-analysis.ts
 *
 * For Slither static analysis:
 *   pip install slither-analyzer
 *   cd packages/cactus-plugin-dpp
 *   slither contracts/DigitalProductPassport.sol \
 *     --solc-remaps "@openzeppelin=node_modules/@openzeppelin" \
 *     --json evaluation/results/03-slither-report.json
 */

import { ethers } from "ethers";
import { deploy, section, pass, fail, info, writeResults } from "./shared";

async function expectRevert(
  label: string,
  txPromise: Promise<any>,
  expectedMsg?: string,
): Promise<boolean> {
  try {
    const tx = await txPromise;
    if (tx.wait) await tx.wait();
    fail(`${label} — did NOT revert (expected revert)`);
    return false;
  } catch (e: any) {
    const msg = e.message || "";
    if (expectedMsg && !msg.includes(expectedMsg)) {
      fail(`${label} — reverted but wrong reason: ${msg.substring(0, 100)}`);
      return false;
    }
    pass(`${label} — reverted as expected`);
    return true;
  }
}

async function main() {
  section("5.3 — Smart Contract Security Analysis");
  const env = await deploy();
  const { contract, farmer, processor, transporter, retailer, bridge } = env;

  const farmerAddr = await farmer.getAddress();
  const processorAddr = await processor.getAddress();
  const transporterAddr = await transporter.getAddress();
  const retailerAddr = await retailer.getAddress();
  const bridgeAddr = await bridge.getAddress();

  // Unauthorized signer (has no roles)
  const unauthorized = env.signers[9];
  const unauthorizedAddr = await unauthorized.getAddress();

  const results: { name: string; passed: boolean; details?: string }[] = [];
  function record(name: string, passed: boolean, details?: string) {
    results.push({ name, passed, details });
  }

  // Create test DPPs
  const minMeta = JSON.stringify({ name: "Security Test" });
  await (
    await contract
      .connect(farmer)
      .createDPP(farmerAddr, "Test", "2025-06-15", minMeta)
  ).wait();
  const tokenId = 0;

  // ══════════════════════════════════════════════════════════════════════════
  //  TEST 1: Access Control Matrix
  // ══════════════════════════════════════════════════════════════════════════

  section("Test 1: Access Control Matrix");

  // createDPP — only FARMER_ROLE
  record(
    "createDPP rejects unauthorized",
    await expectRevert(
      "createDPP (unauthorized)",
      contract
        .connect(unauthorized)
        .createDPP(unauthorizedAddr, "X", "2025-01-01", "{}"),
    ),
  );
  record(
    "createDPP rejects processor",
    await expectRevert(
      "createDPP (processor)",
      contract
        .connect(processor)
        .createDPP(processorAddr, "X", "2025-01-01", "{}"),
    ),
  );

  // amendDPPData — PROCESSOR, TRANSPORTER, RETAILER, GATEWAY
  record(
    "amendDPPData rejects unauthorized",
    await expectRevert(
      "amendDPPData (unauthorized)",
      contract.connect(unauthorized).amendDPPData(tokenId, "{}"),
    ),
  );
  record(
    "amendDPPData rejects farmer",
    await expectRevert(
      "amendDPPData (farmer)",
      contract.connect(farmer).amendDPPData(tokenId, "{}"),
    ),
  );

  // addCertification — owner or PROCESSOR
  record(
    "addCertification rejects unauthorized",
    await expectRevert(
      "addCertification (unauthorized)",
      contract.connect(unauthorized).addCertification(tokenId, "cert"),
    ),
  );

  // updateTransportData — TRANSPORTER_ROLE
  record(
    "updateTransportData rejects unauthorized",
    await expectRevert(
      "updateTransportData (unauthorized)",
      contract
        .connect(unauthorized)
        .updateTransportData(tokenId, "A", "B", "now", "ok"),
    ),
  );
  record(
    "updateTransportData rejects farmer",
    await expectRevert(
      "updateTransportData (farmer)",
      contract
        .connect(farmer)
        .updateTransportData(tokenId, "A", "B", "now", "ok"),
    ),
  );

  // markAsReceived — RETAILER_ROLE
  record(
    "markAsReceived rejects unauthorized",
    await expectRevert(
      "markAsReceived (unauthorized)",
      contract.connect(unauthorized).markAsReceived(tokenId),
    ),
  );
  record(
    "markAsReceived rejects farmer",
    await expectRevert(
      "markAsReceived (farmer)",
      contract.connect(farmer).markAsReceived(tokenId),
    ),
  );

  // aggregateDPPs — PROCESSOR_ROLE
  record(
    "aggregateDPPs rejects unauthorized",
    await expectRevert(
      "aggregateDPPs (unauthorized)",
      contract
        .connect(unauthorized)
        .aggregateDPPs(unauthorizedAddr, "Lot", "{}", [tokenId]),
    ),
  );

  // burn — BRIDGE_ROLE only
  record(
    "burn rejects non-bridge",
    await expectRevert("burn (farmer)", contract.connect(farmer).burn(tokenId)),
  );

  // mint — BRIDGE_ROLE only
  record(
    "mint rejects non-bridge",
    await expectRevert(
      "mint (farmer)",
      contract.connect(farmer).mint(farmerAddr, 9000),
    ),
  );

  info(`Access control tests complete`);

  // ══════════════════════════════════════════════════════════════════════════
  //  TEST 2: notRevoked Invariant
  // ══════════════════════════════════════════════════════════════════════════

  section("Test 2: notRevoked Invariant");

  // Create and revoke a DPP
  await (
    await contract
      .connect(farmer)
      .createDPP(farmerAddr, "Revoke Target", "2025-06-15", minMeta)
  ).wait();
  const revokedId = 1;
  await (await contract.connect(farmer).revokeDPP(revokedId, "test")).wait();
  info(`Token #${revokedId} revoked`);

  const revokedOps = [
    [
      "transferDPP",
      () => contract.connect(farmer).transferDPP(revokedId, processorAddr),
    ],
    [
      "amendDPPData",
      () => contract.connect(processor).amendDPPData(revokedId, "{}"),
    ],
    [
      "addCertification",
      () => contract.connect(processor).addCertification(revokedId, "cert"),
    ],
    [
      "updateTransportData",
      () =>
        contract
          .connect(transporter)
          .updateTransportData(revokedId, "A", "B", "now", "ok"),
    ],
    [
      "markAsReceived",
      () => contract.connect(retailer).markAsReceived(revokedId),
    ],
    [
      "disaggregateDPP",
      () =>
        contract
          .connect(processor)
          .disaggregateDPP(revokedId, processorAddr, 2),
    ],
    [
      "lock",
      () => contract.connect(bridge).lock(farmerAddr, bridgeAddr, revokedId),
    ],
  ] as const;

  for (const [opName, fn] of revokedOps) {
    record(
      `${opName} rejects revoked DPP`,
      await expectRevert(`${opName} on revoked`, fn(), "DPP is revoked"),
    );
  }

  // aggregateDPPs with revoked child
  await (
    await contract
      .connect(farmer)
      .createDPP(processorAddr, "Good Child", "2025-06-15", minMeta)
  ).wait();
  const goodChild = 2;
  record(
    "aggregateDPPs rejects revoked child",
    await expectRevert(
      "aggregateDPPs with revoked child",
      contract
        .connect(processor)
        .aggregateDPPs(processorAddr, "Lot", "{}", [revokedId, goodChild]),
      "DPP is revoked",
    ),
  );

  // ══════════════════════════════════════════════════════════════════════════
  //  TEST 3: Bridge Role Restrictions
  // ══════════════════════════════════════════════════════════════════════════

  section("Test 3: Bridge Role Restrictions");

  record(
    "grantBridgeRole rejects non-owner",
    await expectRevert(
      "grantBridgeRole (unauthorized)",
      contract.connect(unauthorized).grantBridgeRole(unauthorizedAddr),
    ),
  );

  // restoreCrossChainData — only ADMIN or GATEWAY
  await (await contract.connect(bridge).mint(bridgeAddr, 8000)).wait();
  await (await contract.connect(bridge).assign(farmerAddr, 8000)).wait();
  record(
    "restoreCrossChainData rejects unauthorized",
    await expectRevert(
      "restoreCrossChainData (unauthorized)",
      contract
        .connect(unauthorized)
        .restoreCrossChainData(8000, "X", "2025-01-01", "{}", [], []),
    ),
  );
  record(
    "restoreCrossChainData rejects farmer",
    await expectRevert(
      "restoreCrossChainData (farmer)",
      contract
        .connect(farmer)
        .restoreCrossChainData(8000, "X", "2025-01-01", "{}", [], []),
    ),
  );

  // ── Summary ───────────────────────────────────────────────────────────────

  section("Security Analysis Summary");

  const passed = results.filter((t) => t.passed).length;
  const total = results.length;
  info(`${passed}/${total} tests passed`);

  writeResults("03-security-analysis", {
    timestamp: new Date().toISOString(),
    tests: results,
    passed,
    total,
    slitherNote:
      "Run Slither separately: slither contracts/DigitalProductPassport.sol --solc-remaps '@openzeppelin=node_modules/@openzeppelin' --json evaluation/results/03-slither-report.json",
  });

  if (passed === total) pass("All security tests passed!");
  else fail(`${total - passed} test(s) failed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
