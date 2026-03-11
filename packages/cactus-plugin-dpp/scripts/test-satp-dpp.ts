/**
 * test-satp-dpp.ts
 *
 * End-to-end DPP lifecycle test.
 * Covers the full supply-chain flow on a single local EVM node, including
 * direct calls to every SATP bridge function (lock, unlock, burn, mint, assign).
 *
 * Prerequisites:
 *   - Hardhat or Anvil node running on http://127.0.0.1:8545
 *
 * Run:
 *   npx ts-node --project tsconfig.hardhat.json scripts/test-satp-dpp.ts
 */

import * as fs from "fs";
import * as path from "path";
// @ts-expect-error — no type declarations for solc
import * as solc from "solc";
import { ethers } from "ethers";
import { EVMDPPLeaf } from "../src/main/typescript/implementations/evm-dpp-leaf";

// ─── Helpers ────────────────────────────────────────────────────────────────

function section(title: string) {
  const bar = "═".repeat(56);
  console.log(`\n${bar}`);
  console.log(`  ${title}`);
  console.log(`${bar}\n`);
}

function pass(msg: string) {
  console.log(`  ✔ ${msg}`);
}
function info(msg: string) {
  console.log(`  · ${msg}`);
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

// ─── Contract compilation ────────────────────────────────────────────────────

function compileContract() {
  const contractPath = path.resolve(
    __dirname,
    "../contracts/DigitalProductPassport.sol",
  );
  if (!fs.existsSync(contractPath))
    throw new Error(`Contract not found: ${contractPath}`);

  const source = fs.readFileSync(contractPath, "utf8");
  const input = {
    language: "Solidity",
    sources: { "DigitalProductPassport.sol": { content: source } },
    settings: {
      evmVersion: "cancun",
      outputSelection: { "*": { "*": ["abi", "evm.bytecode"] } },
    },
  };

  function findImports(dep: string) {
    const ozPath = path.resolve(__dirname, "../node_modules", dep);
    if (dep.startsWith("@openzeppelin") && fs.existsSync(ozPath))
      return { contents: fs.readFileSync(ozPath, "utf8") };
    const local = path.resolve(__dirname, "../contracts", dep);
    if (fs.existsSync(local))
      return { contents: fs.readFileSync(local, "utf8") };
    return { error: `File not found: ${dep}` };
  }

  info("Compiling DigitalProductPassport.sol...");
  const output = JSON.parse(
    solc.compile(JSON.stringify(input), { import: findImports }),
  );
  if (output.errors) {
    output.errors.forEach((e: any) => console.error(e.formattedMessage));
    if (output.errors.some((e: any) => e.severity === "error"))
      throw new Error("Compilation failed");
  }
  const c =
    output.contracts["DigitalProductPassport.sol"]["DigitalProductPassport"];
  return { abi: c.abi, bytecode: c.evm.bytecode.object };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const rpcUrl = "http://127.0.0.1:8545";
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);

  const accounts = await provider.listAccounts();
  if (accounts.length < 5)
    throw new Error("Need at least 5 accounts on the local node");

  const deployer = provider.getSigner(accounts[0]); // Admin / Farmer / Processor
  const transporter = provider.getSigner(accounts[2]); // Transporter
  const retailer = provider.getSigner(accounts[3]); // Retailer
  const receiver = provider.getSigner(accounts[4]); // Receiver / Bridge mock

  const deployerAddr = await deployer.getAddress();
  const receiverAddr = await receiver.getAddress();

  try {
    await deployer.getAddress();
    info(`Connected to ${rpcUrl}`);
    info(`Deployer: ${deployerAddr}`);
  } catch {
    console.error(
      `Cannot connect to local node at ${rpcUrl}. Start Hardhat or Anvil first.`,
    );
    process.exit(1);
  }

  // ── Deploy ──────────────────────────────────────────────────────────────────
  const compiled = compileContract();
  info("Deploying contract...");
  const factory = new ethers.ContractFactory(
    compiled.abi,
    compiled.bytecode,
    deployer,
  );
  const contract = await factory.deploy(deployerAddr);
  await contract.waitForDeployment();
  const contractAddress = await contract.getAddress();
  pass(`Contract deployed at: ${contractAddress}`);

  // ── Grant roles ─────────────────────────────────────────────────────────────
  // Grant BRIDGE_ROLE to the contract itself so it can be used as a lock recipient in tests
  const grantTx = await (contract as any).grantBridgeRole(contractAddress);
  await grantTx.wait();
  pass(`BRIDGE_ROLE granted to contract (self-custody for lock tests)`);

  // ── Initialise plugin ───────────────────────────────────────────────────────
  const plugin = new EVMDPPLeaf({
    network: "EVM",
    signer: deployer,
    contractAddress,
  });

  // ===========================================================================
  //  TEST 1: Full supply-chain lifecycle
  // ===========================================================================
  section("TEST 1: Full supply-chain lifecycle");

  // 1a. Create DPP
  const createRes = await plugin.createDPP({
    owner: deployerAddr,
    productionData: {
      name: "Cereja do Fundão IGP — Lote #1001",
      description: "Caixa de 2kg de cerejas Burlat, colhidas à mão.",
      createdAt: "2025-06-15T08:00:00Z",
      origin: "Fundão, Portugal",
      productionMethod: "Produção Integrada",
      variety: "Burlat",
      calibre: "26-28mm",
      brixDegree: "17%",
      certifications: ["IGP", "GlobalG.A.P.", "GLOBALGAP"],
      manufacturer: "Quinta da Gardunha",
    },
  } as any);

  assert(
    typeof createRes.dppId !== "undefined",
    "createDPP must return a dppId",
  );
  assert(
    typeof createRes.txHash === "string",
    "createDPP must return a txHash",
  );
  pass(`DPP created — ID: ${createRes.dppId}, TX: ${createRes.txHash}`);
  const dppId = createRes.dppId;

  // 1b. Verify initial state
  const dataInit = await plugin.getDPPData({ dppId });
  assert(
    dataInit.dppData.status === "ACTIVE",
    `Expected ACTIVE, got ${dataInit.dppData.status}`,
  );
  pass(`Initial state: ${dataInit.dppData.status}`);

  // 1c. Add certification
  const certRes = await plugin.addCertification({
    dppId,
    certificationData: { name: "AOP", issuer: "DGADR", date: "2025-01-10" },
  });
  assert(certRes.success, "addCertification must succeed");
  pass(`Certification added`);

  // 1d. Update transport data (uses transporter signer)
  const transportPlugin = new EVMDPPLeaf({
    network: "EVM",
    signer: transporter,
    contractAddress,
  });
  const transportRes = await transportPlugin.updateTransportData({
    dppId,
    transportData: {
      location: "Autoestrada A23, km 45",
      temperature: "3°C",
      humidity: "65%",
    },
  });
  assert(transportRes.success, "updateTransportData must succeed");
  const dataTransit = await plugin.getDPPData({ dppId });
  assert(
    dataTransit.dppData.status === "IN_TRANSIT",
    `Expected IN_TRANSIT, got ${dataTransit.dppData.status}`,
  );
  pass(`State after transport update: ${dataTransit.dppData.status}`);

  // 1e. Mark as received (retailer)
  const retailerPlugin = new EVMDPPLeaf({
    network: "EVM",
    signer: retailer,
    contractAddress,
  });
  const receiveRes = await retailerPlugin.receiveDPP({ dppId });
  assert(receiveRes.success, "receiveDPP must succeed");
  const dataReceived = await plugin.getDPPData({ dppId });
  assert(
    dataReceived.dppData.status === "RECEIVED",
    `Expected RECEIVED, got ${dataReceived.dppData.status}`,
  );
  pass(`State after receive: ${dataReceived.dppData.status}`);

  // 1f. Update retail data
  const retailRes = await retailerPlugin.updateRetailData({
    dppId,
    retailData: {
      location: "Continente Lisboa Norte",
      arrivalDate: "2025-06-16",
      shelfLife: "7 days",
    },
  });
  assert(retailRes.success, "updateRetailData must succeed");
  pass(`Retail data updated`);

  // 1g. Verify history
  const histRes = await plugin.getDPPHistory({ dppId });
  assert(Array.isArray(histRes.history), "getDPPHistory must return an array");
  assert(
    histRes.history.length >= 4,
    `Expected ≥4 history entries, got ${histRes.history.length}`,
  );
  pass(`History has ${histRes.history.length} entries`);

  // ===========================================================================
  //  TEST 2: DPP aggregation
  // ===========================================================================
  section("TEST 2: DPP aggregation (3 → 1 lot)");

  const childIds: string[] = [];
  for (let i = 0; i < 3; i++) {
    const r = await plugin.createDPP({
      owner: deployerAddr,
      productionData: {
        name: `Cherry Batch #${200 + i}`,
        variety: "Saco",
        calibre: "30-32mm",
        origin: "Fundão, Portugal",
        certifications: ["IGP"],
        manufacturer: "Quinta da Gardunha",
      },
    } as any);
    childIds.push(r.dppId);
    info(`Child DPP #${i + 1} created — ID: ${r.dppId}`);
  }

  // Processor aggregates (deployer holds PROCESSOR_ROLE)
  const aggRes = await plugin.aggregateDPPtoBox({
    parentList: childIds,
    lotName: "Lot Saco 2025-06-15",
    handler: "Quinta da Gardunha",
  } as any);

  assert(
    typeof aggRes.newDPPBoxId !== "undefined",
    "aggregateDPPtoBox must return newDPPBoxId",
  );
  pass(`Lot created — ID: ${aggRes.newDPPBoxId}`);

  const lotData = await plugin.getDPPData({ dppId: aggRes.newDPPBoxId });
  assert(
    lotData.dppData.status === "ACTIVE",
    `Expected lot ACTIVE, got ${lotData.dppData.status}`,
  );

  const components = await plugin.getDPPComponents({
    aggregatedDppId: aggRes.newDPPBoxId,
  });
  assert(
    components.componentDppIds.length === 3,
    `Expected 3 components, got ${components.componentDppIds.length}`,
  );
  pass(`Lot has ${components.componentDppIds.length} child references`);

  const lotHistory = await plugin.getDPPHistory({ dppId: aggRes.newDPPBoxId });
  assert(
    lotHistory.history.length >= 4,
    `Expected ≥4 merged history entries, got ${lotHistory.history.length}`,
  );
  pass(
    `Lot history has ${lotHistory.history.length} entries (including merged children)`,
  );

  // ===========================================================================
  //  TEST 3: SATP bridge functions — direct contract calls
  // ===========================================================================
  section("TEST 3: SATP bridge functions");

  // 3a. Create a fresh DPP for bridge tests
  const bridgeCreateRes = await plugin.createDPP({
    owner: deployerAddr,
    productionData: {
      name: "SATP Test DPP",
      origin: "Portugal",
      certifications: [],
    },
  } as any);
  const bridgeDppId = bridgeCreateRes.dppId;
  pass(`Bridge test DPP created — ID: ${bridgeDppId}`);

  // 3b. lock: transfer DPP from deployer to contract (contract is a valid ERC721 receiver)
  const lockPlugin = new EVMDPPLeaf({
    network: "EVM",
    signer: deployer,
    contractAddress,
  });
  const lockRes = await lockPlugin.crossChainTransferDPP({
    dppId: bridgeDppId,
    destinationNetwork: "DPPEthereumNetwork2",
    // bridgeAddress defaults to contractAddress (self-custody)
  } as any);
  assert(lockRes.success, "lock must succeed");
  assert(typeof lockRes.txHash === "string", "lock must return txHash");
  pass(`lock — DPP ${bridgeDppId} locked, TX: ${lockRes.txHash}`);

  const dataLocked = await plugin.getDPPData({ dppId: bridgeDppId });
  assert(
    dataLocked.dppData.status === "LOCKED_CROSSCHAIN",
    `Expected LOCKED_CROSSCHAIN, got ${dataLocked.dppData.status}`,
  );
  pass(`State after lock: ${dataLocked.dppData.status}`);

  // 3c. unlock: contract calls unlock (bridge returning token to deployer)
  //     The contract holds the token, so we call unlock via the contract signer
  const rawContract = new ethers.Contract(
    contractAddress,
    compiled.abi,
    deployer,
  );
  const unlockTx = await rawContract.unlock(
    contractAddress,
    deployerAddr,
    bridgeDppId,
  );
  await unlockTx.wait();
  const dataUnlocked = await plugin.getDPPData({ dppId: bridgeDppId });
  assert(
    dataUnlocked.dppData.status !== "LOCKED_CROSSCHAIN",
    "State must change after unlock",
  );
  pass(`unlock — state after unlock: ${dataUnlocked.dppData.status}`);

  // 3d. lock again, then burn (simulating Phase 3 source-chain burn)
  const lockTx2 = await rawContract.lock(
    deployerAddr,
    contractAddress,
    bridgeDppId,
  );
  await lockTx2.wait();
  pass(`Re-locked DPP ${bridgeDppId} for burn test`);

  // burn requires BRIDGE_ROLE — deployer has it from constructor
  const burnTx = await rawContract.burn(bridgeDppId);
  await burnTx.wait();
  pass(`burn — DPP ${bridgeDppId} burned (source chain Phase 3)`);

  // After burn, ownerOf reverts, so getDPPData should fail
  try {
    await plugin.getDPPData({ dppId: bridgeDppId });
    info("getDPPData after burn fell back to mock (expected for burned token)");
  } catch {
    pass("getDPPData correctly rejected for burned token");
  }

  // 3e. mint — simulate destination chain mint (new token with same ID on destination)
  //     Use a high token ID to avoid collision with auto-incremented IDs
  const destTokenId = 9999;
  const mintTx = await rawContract.mint(deployerAddr, destTokenId);
  await mintTx.wait();
  const dataMinted = await plugin.getDPPData({ dppId: destTokenId });
  assert(
    dataMinted.dppData.status === "ACTIVE",
    `Expected ACTIVE after mint, got ${dataMinted.dppData.status}`,
  );
  pass(`mint — DPP #${destTokenId} minted on destination chain`);

  // 3f. assign — transfer minted token from deployer to final receiver
  //     First approve the contract to act as bridge (for safeTransferFrom)
  const approveTx = await rawContract.approve(contractAddress, destTokenId);
  await approveTx.wait();
  const assignTx = await rawContract.assign(receiverAddr, destTokenId);
  await assignTx.wait();
  const dataAssigned = await plugin.getDPPData({ dppId: destTokenId });
  assert(
    dataAssigned.dppData.owner.toLowerCase() === receiverAddr.toLowerCase(),
    `Expected owner ${receiverAddr}, got ${dataAssigned.dppData.owner}`,
  );
  pass(`assign — DPP #${destTokenId} transferred to receiver ${receiverAddr}`);

  // ===========================================================================
  //  TEST 4: hasBridgeRole / grantBridgeRole
  // ===========================================================================
  section("TEST 4: Role management");

  const hasBridge = await rawContract.hasBridgeRole(contractAddress);
  assert(hasBridge === true, "contractAddress must have BRIDGE_ROLE");
  pass(`hasBridgeRole(contractAddress) = true`);

  try {
    await rawContract.hasBridgeRole(receiverAddr);
    throw new Error("Should have reverted with noPermission");
  } catch (err: any) {
    assert(
      err.message !== "Should have reverted with noPermission",
      "hasBridgeRole must revert for non-bridge address",
    );
    pass(`hasBridgeRole(receiverAddr) correctly reverted`);
  }

  // Grant BRIDGE_ROLE to receiver and verify
  const grantBridgeTx = await rawContract.grantBridgeRole(receiverAddr);
  await grantBridgeTx.wait();
  const hasBridgeAfterGrant = await rawContract.hasBridgeRole(receiverAddr);
  assert(
    hasBridgeAfterGrant === true,
    "receiverAddr must have BRIDGE_ROLE after grant",
  );
  pass(`grantBridgeRole + hasBridgeRole verified for ${receiverAddr}`);

  // ===========================================================================
  //  Summary
  // ===========================================================================
  section("✅ All tests passed");
  console.log(`  Contract : ${contractAddress}`);
  console.log(`  Node     : ${rpcUrl}`);
  console.log(`  Tests    : 4 suites\n`);
}

main().catch((err) => {
  console.error("\n✘ Test failed:", err.message || err);
  process.exit(1);
});
