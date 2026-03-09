import * as fs from "fs";
import * as path from "path";
// @ts-ignore
import * as solc from "solc";
import { ethers } from "ethers";
import { PluginDPP } from "../src/main/typescript/plugin-dpp";

// 1. Compile the contract using solc
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

    // Fallback for local files in contracts folder
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

async function main() {
  // 2. Connect to local Anvil/Hardhat node
  const rpcUrl = "http://127.0.0.1:8545";
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);

  let signers = [];
  try {
    signers = [provider.getSigner(0), provider.getSigner(1)];
    await signers[0].getAddress(); // Verify connection
    console.log(`Connected to local node at ${rpcUrl}`);
  } catch (err) {
    console.error(
      `Could not connect to local node! Please ensure Anvil or Hardhat node is running on ${rpcUrl}.`,
    );
    process.exit(1);
  }

  const deployer = signers[0];
  const receiver = signers[1];

  // 3. Compile & Deploy
  const compiled = compileContract();
  console.log("Deploying contract...");
  const factory = new ethers.ContractFactory(
    compiled.abi,
    compiled.bytecode,
    deployer,
  );
  const contract = await factory.deploy(await deployer.getAddress());
  await contract.deployed();
  console.log(`Contract deployed at: ${contract.address}`);

  // 4. Initialize PluginDPP with Hermes Gateway pointing to a placeholder/local server
  console.log("Initializing PluginDPP with SATP Gateway Client...");
  const plugin = new PluginDPP({
    instanceId: "dpp-satp-test-instance",
    contractAddress: contract.address,
    satpGatewayUrl: "http://127.0.0.1:3011", // Default Hermes Test Server Port
  });

  // Mock the provider
  // @ts-ignore
  plugin.providers.set("EVM", provider);

  // 5. Test 1: CREATE DPP
  console.log(`\n--- Test 1: CREATE DPP ---`);
  const createRes = await plugin.createDPP(
    {
      network: "EVM",
      owner: await deployer.getAddress(),
      productionData: {
        id: "PROD-CROSS-777",
        origin: "Portugal",
        certs: ["EU-Standard"],
      },
      walletObject: {} as any,
    },
    deployer,
  );
  console.log("Create Response:", createRes);
  const dppId = createRes.dppId;

  // 6. Test 2: Iniate Cross-Chain Transfer (Lock + SATP Transact)
  const receiverAddr = await receiver.getAddress();
  const destinationLedger = "0xABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890"; // Mock destination address
  console.log(
    `\n--- Test 2: CROSS-CHAIN TRANSFER DPP ${dppId} to ${receiverAddr} ---`,
  );
  console.log(`Targeting Hermes Gateway at http://127.0.0.1:3011 ...`);
  const transferRes = await plugin.crossChainTransferDPP(
    {
      network: "EVM",
      dppId,
      recipientAddress: receiverAddr,
      destinationNetwork: destinationLedger,
      transferReason: "Export to secondary Ledger due to logistics handover",
      walletObject: {} as any,
    },
    deployer,
  );
  console.log("Cross-Chain Transfer Response:", transferRes);

  console.log("\n✅ E2E SATP Transfer script finished!");
}

main().catch(console.error);
