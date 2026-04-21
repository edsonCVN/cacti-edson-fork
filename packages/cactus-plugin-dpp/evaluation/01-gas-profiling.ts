/**
 * 01-gas-profiling.ts - Gas Cost Analysis
 *
 * Profiles gas consumption for every DPP lifecycle operation.
 * Produces a summary table and JSON results file.
 *
 * Research question: Is the on-chain DPP lifecycle economically viable at scale?
 *
 * Run:
 *   npx ts-node --project tsconfig.hardhat.json evaluation/01-gas-profiling.ts
 *
 * Prerequisites: Hardhat or Anvil node on http://127.0.0.1:8545
 */

import { ethers } from "ethers";
import {
  deploy,
  section,
  pass,
  info,
  warn,
  table,
  writeResults,
  isCrossChainAvailable,
  apiPost,
  apiGet,
  performCrossChainTransfer,
  CHAIN1_API,
  CHAIN2_API,
  type GasResult,
} from "./shared";

// ─── ETH price assumptions for cost estimation ──────────────────────────────

const ETH_PRICE_USD = 2500; // Adjust to current price
const GAS_PRICES_GWEI = {
  "Ethereum L1": 30,
  "Polygon PoS": 50, // in MATIC terms (≈ $0.50/MATIC)
  "Arbitrum L2": 0.1,
};
const MATIC_PRICE_USD = 0.5;

function estimateCost(gasUsed: number) {
  const costs: Record<string, string> = {};
  for (const [network, gasPriceGwei] of Object.entries(GAS_PRICES_GWEI)) {
    const gasInEth = gasUsed * gasPriceGwei * 1e-9;
    const price = network === "Polygon PoS" ? MATIC_PRICE_USD : ETH_PRICE_USD;
    costs[network] = `$${(gasInEth * price).toFixed(4)}`;
  }
  return costs;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  section("5.1 - Gas Cost Analysis");
  const env = await deploy();
  const { contract, farmer, processor, transporter, retailer, leafFor } = env;

  const farmerAddr = await farmer.getAddress();
  const processorAddr = await processor.getAddress();
  const transporterAddr = await transporter.getAddress();
  const retailerAddr = await retailer.getAddress();

  const results: GasResult[] = [];

  async function record(
    operation: string,
    txPromise: Promise<ethers.ContractTransaction>,
  ) {
    const tx = await txPromise;
    const receipt = await tx.wait();
    const gasUsed = receipt.gasUsed.toNumber();
    results.push({ operation, gasUsed, txHash: receipt.transactionHash });
    pass(`${operation}: ${gasUsed.toLocaleString()} gas`);
    return receipt;
  }

  // ── 1. createDPP ──────────────────────────────────────────────────────────

  info("Creating DPP with minimal metadata...");
  const minMeta = JSON.stringify({ name: "Test", description: "Minimal" });
  await record(
    "createDPP (minimal)",
    contract
      .connect(farmer)
      .createDPP(farmerAddr, "Test", "2025-06-15", minMeta),
  );

  info(
    "Creating DPP with full metadata (circular economy, logistics, certs)...",
  );
  const fullMeta = JSON.stringify({
    name: "Cereja do Fundão IGP",
    description:
      "Caixa de 2kg de cerejas Burlat, colhidas à mão na Serra da Gardunha.",
    image: "ipfs://QmTestImageCid123456789",
    origin: "Fundão, Portugal",
    productionMethod: "Produção Integrada",
    variety: "Burlat",
    calibre: "26-28mm",
    brixDegree: "17%",
    certifications: ["IGP", "GlobalG.A.P."],
    manufacturer: "Quinta da Gardunha",
    metadataCid: "ipfs://QmTestMetadataCid123456789",
    logistics: { storage_temp: "2°C - 4°C" },
    circular_economy: {
      packaging: [
        {
          material: "Cardboard Box",
          recyclability: "100% Recyclable",
          disposal: "Blue Bin",
        },
        {
          material: "PET Protective Film",
          recyclability: "100% Recyclable",
          disposal: "Yellow Bin",
        },
      ],
      instructions: "Flatten the cardboard box to save space.",
      return_scheme: "Return baskets for €0.50 discount.",
    },
    attributes: [
      { trait_type: "Variedade", value: "Burlat" },
      { trait_type: "Calibre", value: "26-28mm" },
    ],
  });
  await record(
    "createDPP (full metadata)",
    contract
      .connect(farmer)
      .createDPP(farmerAddr, "Cereja do Fundão", "2025-06-15", fullMeta),
  );

  // ── 2. amendDPPData ───────────────────────────────────────────────────────

  const amendedMeta = JSON.stringify({
    ...JSON.parse(fullMeta),
    variety: "Saco, Burlat",
  });
  await record(
    "amendDPPData",
    contract.connect(processor).amendDPPData(1, amendedMeta),
  );

  // ── 3. addCertification ───────────────────────────────────────────────────

  await record(
    "addCertification",
    contract
      .connect(processor)
      .addCertification(
        1,
        JSON.stringify({ certId: "ISO-14001", issuedBy: "SGS" }),
      ),
  );

  // ── 4. updateTransportData ────────────────────────────────────────────────

  await record(
    "updateTransportData",
    contract
      .connect(transporter)
      .updateTransportData(
        1,
        "Fundão",
        "Lisbon DC",
        "2025-06-16T10:00:00Z",
        "Temp: 3.2°C, Humidity: 85%",
      ),
  );

  // ── 5. markAsReceived ─────────────────────────────────────────────────────

  await record("markAsReceived", contract.connect(retailer).markAsReceived(1));

  // ── 6. updateRetailData ───────────────────────────────────────────────────

  await record(
    "updateRetailData",
    contract
      .connect(retailer)
      .updateRetailData(1, "Continente Colombo", "2025-06-17", "2025-07-15"),
  );

  // ── 7. transferDPP ────────────────────────────────────────────────────────

  // Create a fresh DPP for transfer test
  await (
    await contract
      .connect(farmer)
      .createDPP(farmerAddr, "Transfer Test", "2025-06-15", minMeta)
  ).wait();
  const transferTokenId = 2;
  await record(
    "transferDPP",
    contract.connect(farmer).transferDPP(transferTokenId, processorAddr),
  );

  // ── 8. aggregateDPPs ──────────────────────────────────────────────────────

  // Create 3 DPPs to aggregate
  for (let i = 0; i < 3; i++) {
    await (
      await contract
        .connect(farmer)
        .createDPP(processorAddr, `Agg Child ${i}`, "2025-06-15", minMeta)
    ).wait();
  }
  // Token IDs: 3, 4, 5
  await record(
    "aggregateDPPs (3 children)",
    contract
      .connect(processor)
      .aggregateDPPs(processorAddr, "Aggregated Lot", minMeta, [3, 4, 5]),
  );

  // ── 9. disaggregateDPP ────────────────────────────────────────────────────

  // Create a DPP to disaggregate
  await (
    await contract
      .connect(farmer)
      .createDPP(processorAddr, "Disagg Source", "2025-06-15", minMeta)
  ).wait();
  const disaggTokenId = 7; // 6 is the aggregated lot, 7 is new
  await record(
    "disaggregateDPP (into 3)",
    contract
      .connect(processor)
      .disaggregateDPP(disaggTokenId, processorAddr, 3),
  );

  // ── 10. revokeDPP ─────────────────────────────────────────────────────────

  const revokeTokenId = (
    await contract
      .connect(farmer)
      .callStatic.createDPP(farmerAddr, "Revoke Test", "2025-06-15", minMeta)
  ).toNumber();
  await (
    await contract
      .connect(farmer)
      .createDPP(farmerAddr, "Revoke Test", "2025-06-15", minMeta)
  ).wait();
  await record(
    "revokeDPP",
    contract.connect(farmer).revokeDPP(revokeTokenId, "Quality issue"),
  );

  // ── 11. importCrossChainData ─────────────────────────────────────────────

  // Simulate: mint a token as bridge, then restore
  const bridgeSigner = env.bridge;
  const bridgeAddr = await bridgeSigner.getAddress();
  await (await contract.connect(bridgeSigner).mint(bridgeAddr, 9999)).wait();
  await (await contract.connect(bridgeSigner).assign(farmerAddr, 9999)).wait();

  const historyEntries = [
    JSON.stringify({ event: "Mint", actor: farmerAddr, timestamp: 1718456400 }),
    JSON.stringify({
      event: "Transport",
      actor: transporterAddr,
      timestamp: 1718542800,
    }),
  ];
  const certs = [
    JSON.stringify({ certId: "IGP" }),
    JSON.stringify({ certId: "GlobalG.A.P." }),
  ];
  await record(
    "importCrossChainData (2 history + 2 certs)",
    contract.importCrossChainData(
      9999,
      "Restored DPP",
      "2025-06-15",
      fullMeta,
      certs,
      historyEntries,
    ),
  );

  // ── 12. SATP bridge operations ────────────────────────────────────────────

  // Create fresh DPP for SATP test - get token ID dynamically
  const satpTokenId = (
    await contract
      .connect(farmer)
      .callStatic.createDPP(farmerAddr, "SATP Test", "2025-06-15", minMeta)
  ).toNumber();
  await (
    await contract
      .connect(farmer)
      .createDPP(farmerAddr, "SATP Test", "2025-06-15", minMeta)
  ).wait();
  // Approve bridge
  await (
    await contract.connect(farmer).approve(bridgeAddr, satpTokenId)
  ).wait();
  await record(
    "lock (SATP Phase 1)",
    contract.connect(bridgeSigner).lock(farmerAddr, bridgeAddr, satpTokenId),
  );
  await record(
    "burn (SATP Phase 3)",
    contract.connect(bridgeSigner).burn(satpTokenId),
  );

  await (await contract.connect(bridgeSigner).mint(bridgeAddr, 8888)).wait();
  await record(
    "assign (SATP Phase 3)",
    contract.connect(bridgeSigner).assign(farmerAddr, 8888),
  );

  // ── 13. (Optional) E2E Cross-Chain Transfer via SATP ─────────────────────

  const crossChainTimings: { phase: string; durationMs: number }[] = [];
  if (await isCrossChainAvailable()) {
    section("Cross-Chain Transfer (E2E via SATP - optional)");

    // Create a DPP via the chain 1 API
    info("Creating DPP via chain 1 API...");
    const t0Create = Date.now();
    const createApiRes = await apiPost(CHAIN1_API, "/create", {
      owner: farmerAddr,
      productionData: {
        name: "Gas Test Cross-Chain",
        description: "Cross-chain gas measurement",
        createdAt: "2025-06-15",
        origin: "Fundão",
        variety: "Burlat",
        certifications: ["IGP"],
        manufacturer: "Quinta da Gardunha",
        image: "ipfs://QmGasTestImage",
        metadataCid: "ipfs://QmGasTestMeta",
      },
    });
    crossChainTimings.push({
      phase: "createDPP (via API)",
      durationMs: Date.now() - t0Create,
    });
    pass(`DPP created via API: token #${createApiRes.dppId}`);

    // Perform the full SATP transfer and measure total time
    info("Initiating SATP cross-chain transfer...");
    try {
      const { sessionId, durationMs } = await performCrossChainTransfer(
        createApiRes.dppId,
      );
      crossChainTimings.push({
        phase: "SATP E2E transfer (lock->mint->assign->burn->restore)",
        durationMs,
      });
      pass(
        `SATP transfer complete - session: ${sessionId}, duration: ${(durationMs / 1000).toFixed(1)}s`,
      );

      // Verify DPP exists on chain 2
      const chain2Data = await apiGet(
        CHAIN2_API,
        `/data?dppId=${createApiRes.dppId}`,
      );
      if (chain2Data?.dppData?.productName) {
        pass(`DPP verified on chain 2: "${chain2Data.dppData.productName}"`);
      }
    } catch (e: any) {
      warn(`SATP transfer failed: ${e.message}`);
      crossChainTimings.push({
        phase: "SATP E2E transfer (FAILED)",
        durationMs: 0,
      });
    }

    info("\nCross-Chain Timings:");
    table(
      crossChainTimings.map((t) => ({
        Phase: t.phase,
        "Duration (ms)": t.durationMs,
        "Duration (s)": (t.durationMs / 1000).toFixed(1),
      })),
    );
  } else {
    info("\n[Skipped] Cross-chain gas profiling - SATP services not available");
    info(
      "Start both API gateways + SATP Hermes for cross-chain measurements\n",
    );
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  section("Gas Cost Summary");

  const summary = results.map((r) => {
    const costs = estimateCost(r.gasUsed);
    return {
      Operation: r.operation,
      "Gas Used": r.gasUsed.toLocaleString(),
      ...costs,
    };
  });
  table(summary);

  // Total gas for full lifecycle
  const totalGas = results.reduce((sum, r) => sum + r.gasUsed, 0);
  info(`Total gas (all operations): ${totalGas.toLocaleString()}`);

  writeResults("01-gas-profiling", {
    timestamp: new Date().toISOString(),
    ethPriceUSD: ETH_PRICE_USD,
    gasPricesGwei: GAS_PRICES_GWEI,
    operations: results,
    totalGas,
    summary,
    crossChainTimings:
      crossChainTimings.length > 0
        ? crossChainTimings
        : "SATP not available - skipped",
  });

  pass("Gas profiling complete!");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
