/**
 * deploy-dpp.js
 *
 * Deploys DigitalProductPassport to two local Hardhat/Anvil nodes and writes
 * gateway/deployed-addresses.json so both the API gateway (launch-api.ts) and
 * the SATP Hermes gateways share the same contract addresses.
 *
 * Run AFTER compiling the contract with Hardhat:
 *   npx hardhat compile
 *   node scripts/deploy-dpp.js
 */

// CJS — compatible with scripts/package.json {"type":"commonjs"}
const { ethers }        = require("ethers");
const { writeFileSync } = require("fs");
const path              = require("path");

const { bytecode: DPP_BYTECODE, abi: DPP_ABI } = require(
  "../artifacts/contracts/DigitalProductPassport.sol/DigitalProductPassport.json",
);

const ADDRESSES_FILE = path.resolve(__dirname, "../gateway/deployed-addresses.json");

// Token ID minted on the source chain for the cross-chain transfer demo
const TOKEN_ID = 1001;

// SATP gateway signing accounts (from gateway-1-config.json / gateway-2-config.json).
// These are the EOAs that the gateways use to sign transactions.
const GATEWAY_SIGNER = {
  8545: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", // gateway-1 transactionSignerEthAccount
  8546: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", // gateway-2 transactionSignerEthAccount
};

// Deterministic SATPWrapper contract addresses.
//
// When deploy-dpp.js runs on chain 1 it executes exactly 8 transactions from
// GATEWAY_SIGNER[8545] (deploy, grantBridgeRole, 5×grantRole, mint) — using
// nonces 0-7.  deploy-dpp.js then uses nonce 8 to grantBridgeRole to the
// future wrapper.  Therefore gateway-1 will deploy its SATPWrapper at nonce 9.
//
// On chain 2 the gateway-2 signer makes zero transactions before deploy-dpp.js
// finishes, so the SATPWrapper lands at nonce 0.
const SATP_WRAPPER = {
  8545: ethers.utils.getContractAddress({ from: GATEWAY_SIGNER[8545], nonce: 9 }),
  8546: ethers.utils.getContractAddress({ from: GATEWAY_SIGNER[8546], nonce: 0 }),
};

// Shared result object — both calls write into it, then flushed to disk
const deployed = {};

async function main(port) {
  const provider = new ethers.providers.JsonRpcProvider(`http://127.0.0.1:${port}`);

  // Chain 1 uses accounts 0–4; chain 2 uses accounts 4–8 to avoid address collision
  const BASE = port === 8545 ? 0 : 4;

  const accounts = await provider.listAccounts(); // string[] in ethers v5

  const deployerAddress = accounts[BASE];
  const userAddress     = accounts[BASE + 1];
  const farmerAddress   = accounts[BASE + 1]; // alias: farmer == user on chain 1
  const processorAddr   = accounts[BASE + 2];
  const transporterAddr = accounts[BASE + 3];
  const retailerAddr    = accounts[BASE + 4];

  const deployer = provider.getSigner(deployerAddress);
  const user     = provider.getSigner(userAddress);

  console.log(`[${port}] Deployer      : ${deployerAddress}`);
  console.log(`[${port}] User          : ${userAddress}`);
  console.log(`[${port}] SATPWrapper   : ${SATP_WRAPPER[port]} (will be deployed by gateway)`);

  // ── Deploy ─────────────────────────────────────────────────────────────────
  // account[0] nonce 0
  console.log(`[${port}] Deploying DigitalProductPassport…`);
  const factory = new ethers.ContractFactory(DPP_ABI, DPP_BYTECODE, deployer);
  const contract = await factory.deploy(deployerAddress);
  await contract.deployed();
  const contractAddress = contract.address;
  console.log(`[${port}] DigitalProductPassport deployed to: ${contractAddress}`);

  // ── Grant BRIDGE_ROLE to the gateway EOA signer ────────────────────────────
  // chain 1: account[0] nonce 1
  // chain 2: account[4] nonce 1
  const gatewaySigner = GATEWAY_SIGNER[port];
  console.log(`[${port}] Granting BRIDGE_ROLE to gateway signer (${gatewaySigner})…`);
  await (await contract.grantBridgeRole(gatewaySigner)).wait();

  // ── Chain-1 only: supply-chain roles + demo token + SATPWrapper setup ──────
  if (port === 8545) {
    const FARMER_ROLE      = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("FARMER_ROLE"));
    const PROCESSOR_ROLE   = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("PROCESSOR_ROLE"));
    const TRANSPORTER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("TRANSPORTER_ROLE"));
    const RETAILER_ROLE    = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("RETAILER_ROLE"));

    // account[0] nonces 2-6
    console.log(`[${port}] Granting supply-chain roles…`);
    await (await contract.grantRole(FARMER_ROLE,      farmerAddress  )).wait();
    await (await contract.grantRole(PROCESSOR_ROLE,   processorAddr  )).wait();
    await (await contract.grantRole(PROCESSOR_ROLE,   farmerAddress  )).wait(); // farmer can also aggregate
    await (await contract.grantRole(TRANSPORTER_ROLE, transporterAddr)).wait();
    await (await contract.grantRole(RETAILER_ROLE,    retailerAddr   )).wait();
    console.log(`[${port}] Supply-chain roles granted`);

    // account[0] nonce 7 — deployer already has BRIDGE_ROLE from grantBridgeRole above
    console.log(`[${port}] Minting demo token #${TOKEN_ID} to user (${userAddress})…`);
    await (await contract.mint(userAddress, TOKEN_ID)).wait();
    console.log(`[${port}] Token #${TOKEN_ID} minted`);

    // ── Pre-register the SATPWrapper (deterministic: gateway-1 signer nonce 9) ──
    // account[0] nonce 8 — grant BRIDGE_ROLE so SATPWrapper can call burn() later
    const satwWrapper = SATP_WRAPPER[8545];
    console.log(`[${port}] Granting BRIDGE_ROLE to future SATPWrapper (${satwWrapper})…`);
    await (await contract.grantBridgeRole(satwWrapper)).wait();

    // account[1] nonce 0 — approve gateway EOA for token transfer inside lock()
    console.log(`[${port}] Approving gateway EOA (${gatewaySigner}) for token #${TOKEN_ID}…`);
    await (await contract.connect(user).approve(gatewaySigner, TOKEN_ID)).wait();

    // account[1] nonce 1 — setApprovalForAll for SATPWrapper (for lock()'s safeTransferFrom)
    console.log(`[${port}] Setting approval-for-all for SATPWrapper (${satwWrapper})…`);
    await (await contract.connect(user).setApprovalForAll(satwWrapper, true)).wait();

    console.log(`[${port}] SATPWrapper authorisation complete`);

    deployed.chain1 = {
      contractAddress,
      ownerAddress: userAddress, // token holder (accounts[1])
    };
  } else {
    // ── Chain-2 only: grant BRIDGE_ROLE to future SATPWrapper ─────────────────
    // (SATPWrapper calls mint() and assign() which require BRIDGE_ROLE)
    // Gateway-2 signer has nonce 0 on chain 2 (no prior transactions)
    const satwWrapper = SATP_WRAPPER[8546];
    console.log(`[${port}] Granting BRIDGE_ROLE to future SATPWrapper (${satwWrapper})…`);
    await (await contract.grantBridgeRole(satwWrapper)).wait();

    deployed.chain2 = {
      contractAddress,
      ownerAddress: deployerAddress,
    };
  }

  console.log(`[${port}] Setup complete.\n`);
}

Promise.all([main(8545), main(8546)])
  .then(() => {
    writeFileSync(ADDRESSES_FILE, JSON.stringify(deployed, null, 2));
    console.log(`Addresses written to: ${ADDRESSES_FILE}`);
    console.log(JSON.stringify(deployed, null, 2));
  })
  .catch(console.error);
