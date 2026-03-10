import * as fs from "fs";
import * as path from "path";
// @ts-ignore
import * as solc from "solc";
import { ethers } from "ethers";
import express from "express";
import { EVMDPPLeaf } from "../src/main/typescript/implementations/evm-dpp-leaf";

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

  if (
    output.errors &&
    output.errors.some((err: any) => err.severity === "error")
  ) {
    throw new Error("Compilation failed");
  }

  const contract =
    output.contracts["DigitalProductPassport.sol"]["DigitalProductPassport"];
  return {
    abi: contract.abi,
    bytecode: contract.evm.bytecode.object,
  };
}

async function main() {
  // 2. Connect to local Anvil node
  const rpcUrl = "http://127.0.0.1:8545";
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);

  let allSigners: ethers.Signer[] = [];
  try {
    // Get all 10 default Anvil signers (one per role + extras)
    allSigners = Array.from({ length: 10 }, (_, i) => provider.getSigner(i));
    await allSigners[0].getAddress(); // Verify connection
    console.log(`Connected to local Blockchain node at ${rpcUrl}`);
  } catch (err) {
    console.error(
      `Could not connect to local node! Run 'anvil' in another terminal first.`,
    );
    process.exit(1);
  }

  // Build address → signer lookup map for role-aware signing
  const signerMap: Record<string, ethers.Signer> = {};
  for (const s of allSigners) {
    const addr = (await s.getAddress()).toLowerCase();
    signerMap[addr] = s;
  }

  const deployer = allSigners[0];

  // 3. Compile & Deploy the Passport Contract
  const compiled = compileContract();
  console.log("Deploying contract...");
  const factory = new ethers.ContractFactory(
    compiled.abi,
    compiled.bytecode,
    deployer,
  );
  const contract = await factory.deploy(await deployer.getAddress());
  await contract.deployed();
  console.log(`Smart Contract deployed at Address: ${contract.address}`);

  const contractAddress = contract.address;

  // 4a. Grant supply-chain roles to each Anvil account so role-specific signers can transact
  // Only deployer (account 0) has these by default — grant to the other accounts too
  console.log("Granting supply-chain roles to role accounts...");
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

  const roleGrants = [
    { role: FARMER_ROLE, address: await allSigners[1].getAddress() }, // farmer
    { role: PROCESSOR_ROLE, address: await allSigners[2].getAddress() }, // processor
    { role: TRANSPORTER_ROLE, address: await allSigners[3].getAddress() }, // transporter
    { role: RETAILER_ROLE, address: await allSigners[4].getAddress() }, // retailer
    // Also grant farmer role to account 2 since Farmer can also aggregate
    { role: PROCESSOR_ROLE, address: await allSigners[1].getAddress() }, // farmer can aggregate
  ];

  for (const { role, address } of roleGrants) {
    await (await contract.grantRole(role, address)).wait();
    console.log(`  Granted role to ${address}`);
  }
  console.log("All roles granted.");

  // 4b. Default leaf (deployer signer) for read-only or fallback

  console.log("Initializing EVMDPPLeaf Backend Service...");
  const leaf = new EVMDPPLeaf({
    network: "EVM",
    signer: deployer,
    contractAddress,
  });

  /** Return a leaf (or the default) connected with the signer for the given address */
  function leafFor(address?: string): EVMDPPLeaf {
    if (!address) return leaf;
    const signer = signerMap[address.toLowerCase()];
    if (!signer) return leaf;
    return new EVMDPPLeaf({ network: "EVM", signer, contractAddress });
  }

  // 5. Spin up Express API Gateway
  const app = express();

  app.use((req: any, res: any, next: any) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept",
    );
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });

  app.use(express.json());

  const basePath = "/api/v1/@hyperledger/cactus-plugin-dpp";

  // Expose contract config so the frontend can display the real contract address
  app.get(`${basePath}/config`, (_req, res) => {
    res.json({ contractAddress, network: "Anvil Localnet" });
  });

  app.post(`${basePath}/create`, async (req, res) => {
    try {
      // Use the signer that matches the owner address so msg.sender = farmer address
      const result = await leafFor(req.body.owner).createDPP(req.body);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get(`${basePath}/data`, async (req, res) => {
    try {
      const dppId = req.query.dppId || "0";
      const result = await leaf.getDPPData({ dppId });
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get(`${basePath}/passports`, async (req, res) => {
    try {
      const result = await leaf.getAllPassports();
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post(`${basePath}/update-transport-data`, async (req, res) => {
    try {
      const result = await leafFor(req.body.handlerAddress).updateTransportData(
        req.body,
      );
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post(`${basePath}/submit-product-review`, async (req, res) => {
    try {
      const result = await leafFor(req.body.handlerAddress).submitProductReview(
        req.body,
      );
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post(`${basePath}/mark-as-received`, async (req, res) => {
    try {
      const result = await leafFor(req.body.handlerAddress).receiveDPP(
        req.body,
      );
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post(`${basePath}/update-retail-data`, async (req, res) => {
    try {
      const result = await leafFor(req.body.handlerAddress).updateRetailData(
        req.body,
      );
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get(`${basePath}/history/:dppId`, async (req, res) => {
    try {
      const { dppId } = req.params;
      const result = await leaf.getDPPHistory({ dppId });
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post(`${basePath}/transfer`, async (req, res) => {
    try {
      const result = await leafFor(req.body.from).transferDPP({
        dppId: req.body.dppId,
        newOwner: req.body.to,
      });
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post(`${basePath}/amend`, async (req, res) => {
    try {
      const result = await leafFor(req.body.handlerAddress).amendDPPData({
        dppId: req.body.dppId,
        newData: req.body.newData,
      });
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post(`${basePath}/add-certification`, async (req, res) => {
    try {
      const result = await leafFor(req.body.handlerAddress).addCertification({
        dppId: req.body.dppId,
        certificationData: req.body.certificationData,
      });
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post(`${basePath}/aggregate`, async (req, res) => {
    try {
      const result = await leafFor(req.body.handlerAddress).aggregateDPPtoBox(req.body);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  const PORT = 3002;
  app.listen(PORT, "127.0.0.1", () => {
    console.log(`\n🚀 Cacti API Gateway is running!`);
    console.log(`Listening for Frontend requests on: http://127.0.0.1:${PORT}`);
    console.log(`Awaiting Web-Service calls...`);
  });
}

main().catch(console.error);
