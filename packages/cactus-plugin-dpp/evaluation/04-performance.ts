/**
 * 04-performance.ts — Performance & Scalability Analysis
 *
 * Measures throughput, latency, and scalability of the DPP system.
 *
 * Tests:
 *   - Sequential mint throughput (tx/second)
 *   - Operation latency breakdown
 *   - Scalability curve (latency vs. number of on-chain DPPs)
 *
 * Research question: How does the system perform under realistic supply chain load?
 *
 * Run:
 *   npx ts-node --project tsconfig.hardhat.json evaluation/04-performance.ts
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
  performCrossChainTransfer,
  CHAIN1_API,
} from "./shared";

interface LatencyResult {
  operation: string;
  samples: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  p95Ms: number;
}

function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function stats(label: string, times: number[]): LatencyResult {
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  return {
    operation: label,
    samples: times.length,
    avgMs: Math.round(avg),
    minMs: Math.round(Math.min(...times)),
    maxMs: Math.round(Math.max(...times)),
    p95Ms: Math.round(percentile(times, 95)),
  };
}

async function main() {
  section("5.4 — Performance & Scalability Analysis");
  const env = await deploy();
  const { contract, farmer, processor, transporter, retailer } = env;

  const farmerAddr = await farmer.getAddress();
  const processorAddr = await processor.getAddress();
  const retailerAddr = await retailer.getAddress();

  const minMeta = JSON.stringify({ name: "Perf Test" });
  const fullMeta = JSON.stringify({
    name: "Cherry Full",
    origin: "Fundão",
    variety: "Burlat",
    calibre: "26mm",
    certifications: ["IGP"],
    logistics: { storage_temp: "3°C" },
    circular_economy: {
      packaging: [{ material: "Cardboard", recyclability: "100%" }],
    },
  });

  const allResults: LatencyResult[] = [];

  // ══════════════════════════════════════════════════════════════════════════
  //  TEST 1: Sequential Mint Throughput
  // ══════════════════════════════════════════════════════════════════════════

  section("Test 1: Sequential Mint Throughput");

  const MINT_COUNT = 50;
  const mintTimes: number[] = [];

  info(`Minting ${MINT_COUNT} DPPs sequentially...`);
  const throughputStart = Date.now();

  for (let i = 0; i < MINT_COUNT; i++) {
    const t0 = Date.now();
    const tx = await contract
      .connect(farmer)
      .createDPP(
        farmerAddr,
        `DPP #${i}`,
        "2025-06-15",
        i < MINT_COUNT / 2 ? minMeta : fullMeta,
      );
    await tx.wait();
    mintTimes.push(Date.now() - t0);
  }

  const throughputTotal = Date.now() - throughputStart;
  const txPerSecond = (MINT_COUNT / throughputTotal) * 1000;

  const mintStats = stats("createDPP", mintTimes);
  allResults.push(mintStats);

  pass(`Minted ${MINT_COUNT} DPPs in ${(throughputTotal / 1000).toFixed(1)}s`);
  pass(`Throughput: ${txPerSecond.toFixed(2)} tx/s`);
  info(
    `Avg: ${mintStats.avgMs}ms | P95: ${mintStats.p95Ms}ms | Min: ${mintStats.minMs}ms | Max: ${mintStats.maxMs}ms`,
  );

  // ══════════════════════════════════════════════════════════════════════════
  //  TEST 2: Operation Latency Breakdown
  // ══════════════════════════════════════════════════════════════════════════

  section("Test 2: Operation Latency Breakdown");

  const SAMPLES = 10;
  const operations: { name: string; fn: () => Promise<any> }[] = [];

  // Prepare DPPs for operations
  let nextToken = MINT_COUNT;

  // amendDPPData
  operations.push({
    name: "amendDPPData",
    fn: async () => {
      const tx = await contract.connect(processor).amendDPPData(0, fullMeta);
      await tx.wait();
    },
  });

  // addCertification
  operations.push({
    name: "addCertification",
    fn: async () => {
      const tx = await contract
        .connect(processor)
        .addCertification(0, `cert-${Date.now()}`);
      await tx.wait();
    },
  });

  // updateTransportData
  operations.push({
    name: "updateTransportData",
    fn: async () => {
      const tx = await contract
        .connect(transporter)
        .updateTransportData(0, "Fundão", "Lisbon", "2025-06-16", "3°C");
      await tx.wait();
    },
  });

  // transferDPP
  operations.push({
    name: "transferDPP",
    fn: async () => {
      const tx = await contract
        .connect(farmer)
        .createDPP(farmerAddr, "Transfer", "2025-06-15", minMeta);
      const r = await tx.wait();
      nextToken++;
      const tx2 = await contract
        .connect(farmer)
        .transferDPP(nextToken - 1, processorAddr);
      await tx2.wait();
    },
  });

  // getDPPData (read — no tx)
  operations.push({
    name: "getDPPData (read)",
    fn: async () => {
      await contract.getDPPData(0);
    },
  });

  // getHistory (read)
  operations.push({
    name: "getHistory (read)",
    fn: async () => {
      await contract.getHistory(0);
    },
  });

  for (const op of operations) {
    const times: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      const t0 = Date.now();
      await op.fn();
      times.push(Date.now() - t0);
    }
    const s = stats(op.name, times);
    allResults.push(s);
    info(`${s.operation}: avg=${s.avgMs}ms p95=${s.p95Ms}ms`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  TEST 3: Scalability Curve (latency vs. DPP count)
  // ══════════════════════════════════════════════════════════════════════════

  section("Test 3: Scalability Curve");

  const scalePoints = [10, 50, 100, 200];
  const scaleCurve: {
    dppCount: number;
    readLatencyMs: number;
    writeLatencyMs: number;
  }[] = [];

  // We already have MINT_COUNT DPPs. Create more to reach each scale point.
  let currentCount = MINT_COUNT + nextToken - MINT_COUNT;
  info(`Starting with ~${currentCount} DPPs on-chain`);

  for (const target of scalePoints) {
    // Mint up to target if needed
    while (currentCount < target) {
      const tx = await contract
        .connect(farmer)
        .createDPP(farmerAddr, `Scale #${currentCount}`, "2025-06-15", minMeta);
      await tx.wait();
      currentCount++;
    }

    // Measure read latency (getDPPData on token 0)
    const readTimes: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t0 = Date.now();
      await contract.getDPPData(0);
      readTimes.push(Date.now() - t0);
    }

    // Measure write latency (createDPP)
    const writeTimes: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t0 = Date.now();
      const tx = await contract
        .connect(farmer)
        .createDPP(farmerAddr, `Scale Write`, "2025-06-15", minMeta);
      await tx.wait();
      writeTimes.push(Date.now() - t0);
      currentCount++;
    }

    const readAvg = Math.round(
      readTimes.reduce((a, b) => a + b) / readTimes.length,
    );
    const writeAvg = Math.round(
      writeTimes.reduce((a, b) => a + b) / writeTimes.length,
    );

    scaleCurve.push({
      dppCount: target,
      readLatencyMs: readAvg,
      writeLatencyMs: writeAvg,
    });
    info(`${target} DPPs: read=${readAvg}ms write=${writeAvg}ms`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  TEST 4 (Optional): Cross-Chain Transfer Latency
  // ══════════════════════════════════════════════════════════════════════════

  const crossChainLatencies: {
    transfer: number;
    avgMs: number;
    minMs: number;
    maxMs: number;
  }[] = [];
  if (await isCrossChainAvailable()) {
    section("Test 4: Cross-Chain Transfer Latency (E2E via SATP)");

    const CC_SAMPLES = 3;
    const ccTimes: number[] = [];

    for (let i = 0; i < CC_SAMPLES; i++) {
      info(`Cross-chain transfer ${i + 1}/${CC_SAMPLES}...`);

      // Create a DPP via chain 1 API
      const ccRes = await apiPost(CHAIN1_API, "/create", {
        owner: farmerAddr,
        productionData: {
          name: `CC Perf Test #${i}`,
          description: "Cross-chain latency test",
          createdAt: "2025-06-15",
          origin: "Fundão",
          variety: "Burlat",
          certifications: ["IGP"],
          manufacturer: "Quinta da Gardunha",
        },
      });

      try {
        const { durationMs } = await performCrossChainTransfer(ccRes.dppId);
        ccTimes.push(durationMs);
        pass(`Transfer ${i + 1}: ${(durationMs / 1000).toFixed(1)}s`);
      } catch (e: any) {
        warn(`Transfer ${i + 1} failed: ${e.message}`);
      }
    }

    if (ccTimes.length > 0) {
      const avg = Math.round(
        ccTimes.reduce((a, b) => a + b, 0) / ccTimes.length,
      );
      const min = Math.round(Math.min(...ccTimes));
      const max = Math.round(Math.max(...ccTimes));
      crossChainLatencies.push({
        transfer: ccTimes.length,
        avgMs: avg,
        minMs: min,
        maxMs: max,
      });

      const ccStats = stats("E2E cross-chain transfer", ccTimes);
      allResults.push(ccStats);
      info(
        `Avg: ${(avg / 1000).toFixed(1)}s | Min: ${(min / 1000).toFixed(1)}s | Max: ${(max / 1000).toFixed(1)}s`,
      );
    }
  } else {
    info("\n[Skipped] Cross-chain latency — SATP services not available");
    info(
      "Start both API gateways + SATP Hermes for cross-chain measurements\n",
    );
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  section("Performance Summary");

  table(
    allResults.map((r) => ({
      Operation: r.operation,
      Samples: r.samples,
      "Avg (ms)": r.avgMs,
      "P95 (ms)": r.p95Ms,
      "Min (ms)": r.minMs,
      "Max (ms)": r.maxMs,
    })),
  );

  info("\nScalability Curve:");
  table(
    scaleCurve.map((p) => ({
      "DPPs on-chain": p.dppCount,
      "Read Latency (ms)": p.readLatencyMs,
      "Write Latency (ms)": p.writeLatencyMs,
    })),
  );

  writeResults("04-performance", {
    timestamp: new Date().toISOString(),
    environment: "Hardhat local node (single validator)",
    throughput: {
      totalDPPs: MINT_COUNT,
      totalTimeMs: throughputTotal,
      txPerSecond,
    },
    operationLatencies: allResults,
    scalabilityCurve: scaleCurve,
    crossChainLatencies:
      crossChainLatencies.length > 0
        ? crossChainLatencies
        : "SATP not available — skipped",
  });

  pass("Performance analysis complete!");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
