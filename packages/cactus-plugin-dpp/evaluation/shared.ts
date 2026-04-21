/**
 * shared.ts - Common utilities for all evaluation scripts.
 *
 * Provides contract compilation, deployment, role setup, and reporting helpers.
 *
 * Usage:
 *   import { deploy, section, pass, fail, info, table } from "./shared";
 */

import * as fs from "fs";
import * as path from "path";
// @ts-expect-error - no type declarations for solc
import * as solc from "solc";
import { ethers } from "ethers";
import fetch from "node-fetch";
import { EVMDPPLeaf } from "../src/main/typescript/implementations/evm-dpp-leaf";

// ─── Console helpers ─────────────────────────────────────────────────────────

export function section(title: string) {
  const bar = "═".repeat(60);
  console.log(`\n${bar}`);
  console.log(`  ${title}`);
  console.log(`${bar}\n`);
}

export function pass(msg: string) {
  console.log(`  ✔ ${msg}`);
}
export function fail(msg: string) {
  console.log(`  ✖ ${msg}`);
}
export function info(msg: string) {
  console.log(`  · ${msg}`);
}
export function warn(msg: string) {
  console.log(`  ⚠ ${msg}`);
}

export function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

export function table(rows: Record<string, string | number>[]) {
  if (rows.length === 0) return;
  console.table(rows);
}

/**
 * Write a JSON results file to evaluation/results/<name>.json
 */
export function writeResults(name: string, data: unknown) {
  const dir = path.resolve(__dirname, "results");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  info(`Results written to ${file}`);
}

// ─── Contract compilation ────────────────────────────────────────────────────

export function compileContract() {
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
      optimizer: { enabled: true, runs: 200 },
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
  if (output.errors?.some((e: any) => e.severity === "error")) {
    output.errors.forEach((e: any) => console.error(e.formattedMessage));
    throw new Error("Compilation failed");
  }
  const c =
    output.contracts["DigitalProductPassport.sol"]["DigitalProductPassport"];
  return { abi: c.abi, bytecode: c.evm.bytecode.object };
}

// ─── Deployment & role setup ─────────────────────────────────────────────────

export interface DeployResult {
  provider: ethers.providers.JsonRpcProvider;
  contract: ethers.Contract;
  contractAddress: string;
  deployer: ethers.Signer;
  farmer: ethers.Signer;
  processor: ethers.Signer;
  transporter: ethers.Signer;
  retailer: ethers.Signer;
  bridge: ethers.Signer;
  leaf: EVMDPPLeaf;
  leafFor: (signer: ethers.Signer) => EVMDPPLeaf;
  signers: ethers.Signer[];
}

export async function deploy(
  rpcUrl = "http://127.0.0.1:8545",
): Promise<DeployResult> {
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  const accounts = await provider.listAccounts();
  if (accounts.length < 6)
    throw new Error("Need at least 6 accounts on the local node");

  const signers = accounts.map((_, i) => provider.getSigner(i));
  const [deployer, farmer, processor, transporter, retailer, bridge] = signers;
  const deployerAddr = await deployer.getAddress();

  const compiled = compileContract();
  const factory = new ethers.ContractFactory(
    compiled.abi,
    compiled.bytecode,
    deployer,
  );
  const contract = await factory.deploy(deployerAddr);
  await contract.deployed();
  const contractAddress = contract.address;
  pass(`Contract deployed at: ${contractAddress}`);

  // Grant roles
  const FARMER_ROLE = ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes("FARMER_ROLE"),
  );
  const PROCESSOR_ROLE = ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes("PROCESSOR_ROLE"),
  );
  const TRANSPORTER_ROLE = ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes("TRANSPORTER_ROLE"),
  );
  const RETAILER_ROLE = ethers.utils.keccak256(
    ethers.utils.toUtf8Bytes("RETAILER_ROLE"),
  );

  await (
    await contract.grantRole(FARMER_ROLE, await farmer.getAddress())
  ).wait();
  await (await contract.grantRole(FARMER_ROLE, deployerAddr)).wait();
  await (
    await contract.grantRole(PROCESSOR_ROLE, await processor.getAddress())
  ).wait();
  await (
    await contract.grantRole(TRANSPORTER_ROLE, await transporter.getAddress())
  ).wait();
  await (
    await contract.grantRole(RETAILER_ROLE, await retailer.getAddress())
  ).wait();
  await (await contract.grantBridgeRole(await bridge.getAddress())).wait();
  pass("All roles granted");

  const leafFor = (signer: ethers.Signer) =>
    new EVMDPPLeaf({ network: "EVM", signer, contractAddress });

  const leaf = leafFor(farmer);

  return {
    provider,
    contract,
    contractAddress,
    deployer,
    farmer,
    processor,
    transporter,
    retailer,
    bridge,
    leaf,
    leafFor,
    signers,
  };
}

// ─── Gas measurement helper ──────────────────────────────────────────────────

export interface GasResult {
  operation: string;
  gasUsed: number;
  txHash: string;
}

/**
 * Execute a contract transaction and return gas used.
 */
export async function measureGas(
  operation: string,
  txPromise: Promise<ethers.ContractTransaction>,
): Promise<GasResult> {
  const tx = await txPromise;
  const receipt = await tx.wait();
  return {
    operation,
    gasUsed: receipt.gasUsed.toNumber(),
    txHash: receipt.transactionHash,
  };
}

// ─── Cross-chain helpers ─────────────────────────────────────────────────────

export const CHAIN1_API = "http://127.0.0.1:3002";
export const CHAIN2_API = "http://127.0.0.1:3003";
export const DPP_API_BASE = "/api/v1/@hyperledger/cactus-plugin-dpp";

/**
 * Check if the full SATP setup (both API gateways) is reachable.
 */
export async function isCrossChainAvailable(): Promise<boolean> {
  try {
    const [r1, r2] = await Promise.all([
      fetch(`${CHAIN1_API}${DPP_API_BASE}/config`).then((r) => r.ok),
      fetch(`${CHAIN2_API}${DPP_API_BASE}/config`).then((r) => r.ok),
    ]);
    return r1 && r2;
  } catch {
    return false;
  }
}

export async function apiGet(base: string, path: string): Promise<any> {
  const res = await fetch(`${base}${DPP_API_BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path}: ${res.status}`);
  return res.json();
}

export async function apiPost(base: string, path: string, body: any): Promise<any> {
  const res = await fetch(`${base}${DPP_API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path}: ${res.status}`);
  return res.json();
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Perform a full E2E cross-chain transfer via the APIs and wait for completion.
 * Returns { sessionId, durationMs }.
 */
export async function performCrossChainTransfer(
  dppId: string | number,
): Promise<{ sessionId: string; durationMs: number }> {
  const t0 = Date.now();
  const res = await apiPost(CHAIN1_API, "/cross-chain-transfer", { dppId });
  const sessionId = res.sessionId;

  // Poll until done
  for (let i = 0; i < 60; i++) {
    await sleep(3000);
    try {
      const st = await apiGet(CHAIN1_API, `/cross-chain-status?sessionId=${sessionId}`);
      const s = (st.status || "").toUpperCase();
      const sub = (st.substatus || "").toUpperCase();
      if (s === "DONE" || sub === "COMPLETED") break;
      if (s === "FAILED" || s === "INVALID") throw new Error(`SATP failed: ${s}`);
    } catch (e: any) {
      if (e.message?.includes("SATP failed")) throw e;
      // else keep polling
    }
  }

  // Wait for metadata sync
  await sleep(15000);

  return { sessionId, durationMs: Date.now() - t0 };
}
