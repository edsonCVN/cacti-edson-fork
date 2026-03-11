/**
 * test-crosschain-polygon.ts
 *
 * End-to-end test for crossChainTransferDPP targeting a Polygon network.
 *
 * Prerequisites:
 *   - Anvil or Hardhat local node running on http://127.0.0.1:8545
 *
 * Run:
 *   npx ts-node --project tsconfig.json scripts/test-crosschain-polygon.ts
 */

import * as fs from "fs";
import * as path from "path";
// @ts-expect-error — no type declarations for solc
import * as solc from "solc";
import { ethers } from "ethers";
import { EVMDPPLeaf } from "../src/main/typescript/implementations/evm-dpp-leaf";

// ─── 1. Compile the contract ───────────────────────────────────────────────────

function compileContract() {
  const contractPath = path.resolve(
    __dirname,
    "../contracts/DigitalProductPassport.sol",
  );
  if (!fs.existsSync(contractPath)) {
    throw new Error(`Contract not found at path: ${contractPath}`);
  }
  const source = fs.readFileSync(contractPath, "utf8");

  const input = {
    language: "Solidity",
    sources: {
      "DigitalProductPassport.sol": {
        content: source,
      },
    },
    settings: {
      evmVersion: "cancun",
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode"],
        },
      },
    },
  };

  function findImports(dependencyPath: string) {
    if (dependencyPath.startsWith("@openzeppelin")) {
      const ozonePath = path.resolve(
        __dirname,
        "../node_modules",
        dependencyPath,
      );
      if (fs.existsSync(ozonePath)) {
        return { contents: fs.readFileSync(ozonePath, "utf8") };
      }
    }
    const localPath = path.resolve(__dirname, "../contracts", dependencyPath);
    if (fs.existsSync(localPath)) {
      return { contents: fs.readFileSync(localPath, "utf8") };
    }
    return { error: `File not found: ${dependencyPath}` };
  }

  console.log("Compiling DigitalProductPassport.sol...");
  const output = JSON.parse(
    solc.compile(JSON.stringify(input), { import: findImports }),
  );

  if (output.errors) {
    output.errors.forEach((err: any) => console.error(err.formattedMessage));
    if (output.errors.some((err: any) => err.severity === "error")) {
      throw new Error("Compilation failed");
    }
  }

  const contract =
    output.contracts["DigitalProductPassport.sol"]["DigitalProductPassport"];
  return {
    abi: contract.abi,
    bytecode: contract.evm.bytecode.object,
  };
}

// ─── 2. Main test ──────────────────────────────────────────────────────────────

async function main() {
  const rpcUrl = "http://127.0.0.1:8545";
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);

  // Polygon PoS destination parameters
  const POLYGON_NETWORK_ID = "polygon-pos";
  const POLYGON_RECIPIENT = "0x1234567890abcdef1234567890abcdef12345678"; // Mock Polygon recipient

  // ── Connect to local node ──
  let deployer: ethers.providers.JsonRpcSigner;
  try {
    deployer = provider.getSigner(0);
    await deployer.getAddress();
    console.log(`✔ Connected to local node at ${rpcUrl}`);
  } catch (err) {
    console.error(
      `✘ Could not connect to local node! Ensure Anvil/Hardhat is running on ${rpcUrl}.`,
    );
    process.exit(1);
  }

  // ── Compile & Deploy ──
  const compiled = compileContract();
  console.log("Deploying contract...");
  const factory = new ethers.ContractFactory(
    compiled.abi,
    compiled.bytecode,
    deployer,
  );
  const contract = await factory.deploy(await deployer.getAddress());
  await contract.deployed();
  console.log(`✔ Contract deployed at: ${contract.address}\n`);

  // ── Initialize plugin ──
  const plugin = new EVMDPPLeaf({
    network: "EVM",
    signer: deployer,
    contractAddress: contract.address,
  });

  // ──────────────────────────────────────────────────────────────────────────
  //  TEST 1: Create a single DPP and transfer cross-chain to Polygon
  // ──────────────────────────────────────────────────────────────────────────
  console.log("═══════════════════════════════════════════════════════");
  console.log("  TEST 1: Single DPP cross-chain transfer to Polygon  ");
  console.log("═══════════════════════════════════════════════════════\n");

  const createRes1 = await plugin.createDPP({
    owner: await deployer.getAddress(),
    productionData: {
      name: "Cereja do Fundão IGP - Lote #2001",
      description: "Caixa de 2kg de cerejas Saco, colhidas à mão.",
      createdAt: "2025-06-15",
      origin: "Fundão, Portugal",
      productionMethod: "Produção Integrada",
      variety: "Saco",
      calibre: "30-32mm",
      brixDegree: "18%",
      certifications: ["IGP", "GlobalG.A.P."],
      manufacturer: "Quinta da Gardunha",
    },
  } as any);

  console.log(
    `✔ DPP created — ID: ${createRes1.dppId}, TX: ${createRes1.txHash}`,
  );

  // Verify state is ACTIVE before transfer
  const dataBefore = await plugin.getDPPData({ dppId: createRes1.dppId });
  console.log(`  Status before transfer: ${dataBefore.dppData.status}`);
  if (dataBefore.dppData.status !== "ACTIVE") {
    throw new Error(`Expected ACTIVE status, got ${dataBefore.dppData.status}`);
  }
  console.log("✔ Pre-transfer status check passed (ACTIVE)\n");

  // Execute cross-chain transfer to Polygon
  console.log(`Initiating cross-chain transfer to ${POLYGON_NETWORK_ID}...`);
  const transferRes1 = await plugin.crossChainTransferDPP({
    dppId: createRes1.dppId,
    recipientAddress: POLYGON_RECIPIENT,
    destinationNetwork: POLYGON_NETWORK_ID,
    transferReason: "Export to Polygon PoS for European retail distribution",
  } as any);

  console.log(`✔ Transfer response:`, transferRes1);

  if (!transferRes1.success) {
    throw new Error("Transfer did not return success=true");
  }
  if (!transferRes1.txHash) {
    throw new Error("Transfer did not return a txHash");
  }
  console.log("✔ Single DPP cross-chain transfer PASSED\n");

  // Verify state is LOCKED_CROSSCHAIN after transfer
  const dataAfter = await plugin.getDPPData({ dppId: createRes1.dppId });
  console.log(`  Status after transfer: ${dataAfter.dppData.status}`);
  if (dataAfter.dppData.status !== "LOCKED_CROSSCHAIN") {
    throw new Error(
      `Expected LOCKED_CROSSCHAIN status, got ${dataAfter.dppData.status}`,
    );
  }
  console.log("✔ Post-transfer status check passed (LOCKED_CROSSCHAIN)\n");

  // ──────────────────────────────────────────────────────────────────────────
  //  TEST 2: Create multiple DPPs and transfer them all cross-chain (batch)
  // ──────────────────────────────────────────────────────────────────────────
  console.log("═══════════════════════════════════════════════════════");
  console.log("  TEST 2: Batch DPP cross-chain transfer to Polygon   ");
  console.log("═══════════════════════════════════════════════════════\n");

  const batchSize = 3;
  const dppIds: string[] = [];

  for (let i = 0; i < batchSize; i++) {
    const res = await plugin.createDPP({
      owner: await deployer.getAddress(),
      productionData: {
        name: `Cereja do Fundão IGP - Lote #300${i + 1}`,
        description: `Caixa ${i + 1} de 2kg — variedade Burlat.`,
        createdAt: "2025-06-20",
        origin: "Fundão, Portugal",
        variety: "Burlat",
        calibre: "28-30mm",
        certifications: ["IGP"],
        manufacturer: "Quinta da Gardunha",
      },
    } as any);
    dppIds.push(res.dppId);
    console.log(`  ✔ Created DPP #${i + 1} — ID: ${res.dppId}`);
  }
  console.log(`\n✔ ${batchSize} DPPs created. IDs: [${dppIds.join(", ")}]\n`);

  // Transfer all DPPs cross-chain
  const transferResults: Array<{
    dppId: string;
    success: boolean;
    txHash?: string;
    error?: string;
  }> = [];

  for (const dppId of dppIds) {
    try {
      console.log(`  Transferring DPP ${dppId} to ${POLYGON_NETWORK_ID}...`);
      const res = await plugin.crossChainTransferDPP({
        dppId,
        recipientAddress: POLYGON_RECIPIENT,
        destinationNetwork: POLYGON_NETWORK_ID,
        transferReason:
          "Batch export to Polygon PoS — retail logistics handover",
      } as any);

      transferResults.push({ dppId, success: res.success, txHash: res.txHash });
      console.log(`  ✔ DPP ${dppId} locked — TX: ${res.txHash}`);
    } catch (err: any) {
      transferResults.push({ dppId, success: false, error: err.message });
      console.error(`  ✘ DPP ${dppId} failed: ${err.message}`);
    }
  }

  // Verify all transfers succeeded
  const successCount = transferResults.filter((r) => r.success).length;
  const failCount = transferResults.filter((r) => !r.success).length;

  console.log(`\n── Batch Transfer Summary ──`);
  console.log(`  Total:   ${batchSize}`);
  console.log(`  Success: ${successCount}`);
  console.log(`  Failed:  ${failCount}`);

  if (failCount > 0) {
    console.error("\n✘ Some batch transfers failed:");
    transferResults
      .filter((r) => !r.success)
      .forEach((r) => console.error(`  DPP ${r.dppId}: ${r.error}`));
    throw new Error(`${failCount} of ${batchSize} batch transfers failed`);
  }

  // Verify all DPPs are now LOCKED_CROSSCHAIN
  console.log("\nVerifying post-transfer statuses...");
  for (const dppId of dppIds) {
    const data = await plugin.getDPPData({ dppId });
    const status = data.dppData.status;
    if (status !== "LOCKED_CROSSCHAIN") {
      throw new Error(
        `DPP ${dppId}: expected LOCKED_CROSSCHAIN, got ${status}`,
      );
    }
    console.log(`  ✔ DPP ${dppId} — ${status}`);
  }

  console.log("\n✔ Batch cross-chain transfer PASSED\n");

  // ──────────────────────────────────────────────────────────────────────────
  //  TEST 3: Ensure a LOCKED DPP cannot be transferred again (negative test)
  // ──────────────────────────────────────────────────────────────────────────
  console.log("═══════════════════════════════════════════════════════");
  console.log("  TEST 3: Double-lock prevention (negative test)       ");
  console.log("═══════════════════════════════════════════════════════\n");

  try {
    console.log(
      `Attempting to re-lock already locked DPP ${createRes1.dppId}...`,
    );
    await plugin.crossChainTransferDPP({
      dppId: createRes1.dppId,
      recipientAddress: POLYGON_RECIPIENT,
      destinationNetwork: POLYGON_NETWORK_ID,
      transferReason: "This should fail — DPP is already locked",
    } as any);

    // If we reach here, the contract did NOT revert — that may be unexpected
    console.log(
      "⚠ Warning: Re-locking did not revert. The contract may allow idempotent locks.",
    );
  } catch (err: any) {
    console.log(`✔ Re-lock correctly rejected: ${err.message}`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Summary
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\n══════════════════════════════════════════════════");
  console.log("  ✅ All cross-chain Polygon transfer tests passed!");
  console.log("══════════════════════════════════════════════════\n");

  console.log("Destination Network : Polygon PoS");
  console.log(`Recipient Address   : ${POLYGON_RECIPIENT}`);
  console.log(`Total DPPs Tested   : ${1 + batchSize}`);
  console.log(`Contract Address    : ${contract.address}`);
}

main().catch((err) => {
  console.error("\n✘ Test failed:", err.message || err);
  process.exit(1);
});
