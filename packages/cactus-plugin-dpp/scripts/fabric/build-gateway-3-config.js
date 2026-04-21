#!/usr/bin/env node
// Builds gateway-3-config.json from the fabric-samples crypto material and the
// shape expected by the SATP Hermes image's isFabricConfigJSON validator.
//
// The reference shape is taken from
// packages/cactus-plugin-satp-hermes/src/test/typescript/unit/config-validating-functions/validate-cc-config.test.ts
//
// Run:   node packages/cactus-plugin-dpp/scripts/fabric/build-gateway-3-config.js

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..", "..");
const bridge = path.join(root, "gateway", "fabric-bridge");
const target = path.join(root, "gateway", "config", "gateway-3-config.json");

const read = (p) => fs.readFileSync(p, "utf8");

const peerTls    = read(path.join(bridge, "crypto/org1/peer/tls-ca.crt"));
const peer2Tls   = read(path.join(bridge, "crypto/org2/peer/tls-ca.crt"));
const ordererTls = read(path.join(bridge, "crypto/orderer/tls-ca.crt"));
const caTls      = read(path.join(bridge, "crypto/org1/ca/ca-cert.pem"));
const bridgeCert = read(path.join(bridge, "cert.pem"));
const bridgeKey  = read(path.join(bridge, "key.pem"));

// Container-side paths (fabric-bridge mounted at /opt/cacti/satp-hermes/fabric-bridge).
const CB = "/opt/cacti/satp-hermes/fabric-bridge";

const connectionProfile = {
  name: "test-network-org1",
  version: "1.0.0",
  client: { organization: "Org1" },
  organizations: {
    Org1MSP: {
      mspid: "Org1MSP",
      peers: ["peer0.org1.example.com"],
      certificateAuthorities: ["ca.org1.example.com"],
    },
    Org2MSP: {
      mspid: "Org2MSP",
      peers: ["peer0.org2.example.com"],
    },
  },
  peers: {
    "peer0.org1.example.com": {
      url: "grpcs://host.docker.internal:7051",
      grpcOptions: { "ssl-target-name-override": "peer0.org1.example.com" },
      tlsCACerts: { pem: peerTls },
    },
    "peer0.org2.example.com": {
      url: "grpcs://host.docker.internal:9051",
      grpcOptions: { "ssl-target-name-override": "peer0.org2.example.com" },
      tlsCACerts: { pem: peer2Tls },
    },
  },
  certificateAuthorities: {
    "ca.org1.example.com": {
      url: "https://host.docker.internal:7054",
      caName: "ca-org1",
      tlsCACerts: { pem: [caTls] },
      httpOptions: { verify: false },
    },
  },
  orderers: {
    "orderer.example.com": {
      url: "grpcs://host.docker.internal:7050",
      grpcOptions: { "ssl-target-name-override": "orderer.example.com" },
      tlsCACerts: { pem: ordererTls },
    },
  },
  channels: {
    mychannel: {
      orderers: ["orderer.example.com"],
      peers: {
        "peer0.org1.example.com": {
          endorsingPeer: true, chaincodeQuery: true, ledgerQuery: true,
          eventSource: true, discover: true,
        },
        "peer0.org2.example.com": {
          endorsingPeer: true, chaincodeQuery: true, ledgerQuery: true,
          eventSource: true, discover: true,
        },
      },
    },
  },
};

const fabricBridgeConfig = {
  networkIdentification: {
    id: "FabricLedgerTestNetwork",
    ledgerType: "FABRIC_2",
  },
  userIdentity: {
    credentials: { certificate: bridgeCert, privateKey: bridgeKey },
    mspId: "Org1MSP",
    type: "X.509",
  },
  connectorOptions: {
    connectionProfile,
    discoveryOptions: { enabled: true, asLocalhost: false },
    eventHandlerOptions: { strategy: "NETWORK_SCOPE_ALLFORTX", commitTimeout: 300 },
  },
  channelName: "mychannel",
  targetOrganizations: [
    {
      CORE_PEER_LOCALMSPID: "Org1MSP",
      CORE_PEER_ADDRESS: "host.docker.internal:7051",
      CORE_PEER_MSPCONFIG_PATH: `${CB}/crypto/org1/admin/msp`,
      CORE_PEER_TLS_ROOTCERT_PATH: `${CB}/crypto/org1/peer/tls-ca.crt`,
      ORDERER_TLS_ROOTCERT_PATH:   `${CB}/crypto/orderer/tls-ca.crt`,
    },
    {
      CORE_PEER_LOCALMSPID: "Org2MSP",
      CORE_PEER_ADDRESS: "host.docker.internal:9051",
      CORE_PEER_MSPCONFIG_PATH: `${CB}/crypto/org2/admin/msp`,
      CORE_PEER_TLS_ROOTCERT_PATH: `${CB}/crypto/org2/peer/tls-ca.crt`,
      ORDERER_TLS_ROOTCERT_PATH:   `${CB}/crypto/orderer/tls-ca.crt`,
    },
  ],
  caFilePath: `${CB}/crypto/org1/ca/ca-cert.pem`,
  coreYamlFilePath: `${CB}/core.yaml`,
  ccSequence: 1,
  orderer: "host.docker.internal:7050",
  ordererTLSHostnameOverride: "orderer.example.com",
  connTimeout: 60,
  mspId: "Org1MSP",
  wrapperContractName: "dpp",
  leafId: "dpp-fabric-leaf",
  keyPair: {
    publicKey:  "0302e5310a75ea540587a4e504e1948da07bdb175742c079e76165fa5cd1f9408631",
    privateKey: "0x9ea5385d4faef03a310e6a5b360299c7f47518623f580cbd03ed0f48f48a0891",
  },
  claimFormats: [1],
};

const cfg = {
  gid: {
    id: "dpp-gateway-3",
    name: "DPPGateway",
    version: [{ Core: "v02", Architecture: "v02", Crash: "v02" }],
    connectedDLTs: [
      { id: "FabricLedgerTestNetwork", ledgerType: "FABRIC_2" },
    ],
    proofID: "dppProofID3",
    address: "http://satp-hermes-gateway-3",
    gatewayClientPort: 3011,
    gatewayServerPort: 3010,
    gatewayOapiPort: 4010,
    identificationCredential: {
      signingAlgorithm: "SECP256K1",
      pubKey: "02e5310a75ea540587a4e504e1948da07bdb175742c079e76165fa5cd1f9408631",
    },
  },
  logLevel: "TRACE",
  counterPartyGateways: [
    {
      id: "dpp-gateway-1",
      name: "DPPGateway",
      version: [{ Core: "v02", Architecture: "v02", Crash: "v02" }],
      connectedDLTs: [{ id: "EthereumLedgerTestNetwork1", ledgerType: "ETHEREUM" }],
      proofID: "dppProofID1",
      address: "http://satp-hermes-gateway-1",
      gatewayClientPort: 3011, gatewayServerPort: 3010, gatewayOapiPort: 4010,
      identificationCredential: {
        signingAlgorithm: "SECP256K1",
        pubKey: "036256069f81bcaae52a64965b8add79521ee54cb2ad3d85de5250d78cf0fc171c",
      },
    },
    {
      id: "dpp-gateway-2",
      name: "DPPGateway",
      version: [{ Core: "v02", Architecture: "v02", Crash: "v02" }],
      connectedDLTs: [{ id: "EthereumLedgerTestNetwork2", ledgerType: "ETHEREUM" }],
      proofID: "dppProofID2",
      address: "http://satp-hermes-gateway-2",
      gatewayClientPort: 3011, gatewayServerPort: 3010, gatewayOapiPort: 4010,
      identificationCredential: {
        signingAlgorithm: "SECP256K1",
        pubKey: "024c0cf54f92d23dbb3d409a8047aa2a44abcb911767d3516b19fd94c2358dec65",
      },
    },
  ],
  environment: "development",
  ccConfig: { bridgeConfig: [fabricBridgeConfig] },
  keyPair: {
    privateKey: "9ea5385d4faef03a310e6a5b360299c7f47518623f580cbd03ed0f48f48a0891",
    publicKey:  "02e5310a75ea540587a4e504e1948da07bdb175742c079e76165fa5cd1f9408631",
  },
  enableCrashRecovery: false,
  ontologyPath: "/opt/cacti/satp-hermes/ontologies",
};

fs.writeFileSync(target, JSON.stringify(cfg, null, 2));
console.log(`Wrote ${target}`);
console.log(`(bridge config has ${Object.keys(fabricBridgeConfig).length} top-level fields)`);
