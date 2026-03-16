const testLogLevel = "info";

import "jest-extended";
import express from "express";
import bodyParser from "body-parser";
import http from "http";
import { v4 as uuidV4 } from "uuid";
import { AddressInfo } from "net";

import { IListenOptions, Servers } from "@hyperledger/cactus-common";
import { PluginRegistry } from "@hyperledger/cactus-core";
import { Configuration } from "@hyperledger/cactus-core-api";

import {
  FarmerApi,
  LogisticsApi,
  ProcessorApi,
  OwnershipApi,
  AuditApi,
  PluginDpp,
} from "../../../main/typescript/public-api";

// ---------------------------------------------------------------------------
// Shared test infrastructure
// ---------------------------------------------------------------------------

const expressApp = express();
expressApp.use(bodyParser.json({ limit: "250mb" }));
const server = http.createServer(expressApp);

let farmerApi: FarmerApi;
let logisticsApi: LogisticsApi;
let processorApi: ProcessorApi;
let ownershipApi: OwnershipApi;
let auditApi: AuditApi;
let connector: PluginDpp;

beforeAll(async () => {
  const listenOptions: IListenOptions = {
    hostname: "127.0.0.1",
    port: 0,
    server,
  };
  const addressInfo = (await Servers.listen(listenOptions)) as AddressInfo;
  const { address, port } = addressInfo;
  const apiHost = `http://${address}:${port}`;
  const config = new Configuration({ basePath: apiHost });

  farmerApi    = new FarmerApi(config);
  logisticsApi = new LogisticsApi(config);
  processorApi = new ProcessorApi(config);
  ownershipApi = new OwnershipApi(config);
  auditApi     = new AuditApi(config);

  connector = new PluginDpp({
    instanceId: uuidV4(),
    logLevel: testLogLevel,
    pluginRegistry: new PluginRegistry(),
  });

  await connector.getOrCreateWebServices();
  await connector.registerWebServices(expressApp);
});

afterAll(async () => {
  await Servers.shutdown(server);
});

// ---------------------------------------------------------------------------
// Plugin initialisation
// ---------------------------------------------------------------------------

describe("PluginDpp — initialisation", () => {
  test("getInstanceId returns the id passed in the constructor", () => {
    expect(connector.getInstanceId()).toBeDefined();
    expect(typeof connector.getInstanceId()).toBe("string");
  });

  test("getPackageName returns the correct package name", () => {
    expect(connector.getPackageName()).toBe("@hyperledger/cactus-plugin-dpp");
  });

  test("getOrCreateWebServices returns a non-empty array", async () => {
    const endpoints = await connector.getOrCreateWebServices();
    expect(endpoints).toBeDefined();
    expect(Array.isArray(endpoints)).toBe(true);
    expect(endpoints.length).toBeGreaterThan(0);
  });

  test("getOrCreateWebServices is idempotent — same array on repeated calls", async () => {
    const first  = await connector.getOrCreateWebServices();
    const second = await connector.getOrCreateWebServices();
    expect(first).toBe(second);
  });

  test("getOpenApiSpec returns a non-null object", () => {
    const spec = connector.getOpenApiSpec();
    expect(spec).toBeDefined();
    expect(typeof spec).toBe("object");
  });
});

// ---------------------------------------------------------------------------
// Farmer API — DPP creation
// ---------------------------------------------------------------------------

describe("FarmerApi — POST /create", () => {
  test("creates a DPP and returns dppId + txHash", async () => {
    const res = await farmerApi.createDPP({
      owner: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      productionData: {
        certifications: ["AOP", "GlobalGAP"],
        createdAt: new Date().toISOString(),
        origin: "Fundão, Portugal",
      },
    });

    expect(res.status).toEqual(200);
    expect(res.data).toBeDefined();
    expect(res.data.dppId).toBeDefined();
    expect(res.data.txHash).toBeDefined();
  });

  test("returns 200 with minimal payload", async () => {
    const res = await farmerApi.createDPP({
      owner: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    });
    expect(res.status).toEqual(200);
    expect(res.data.dppId).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Audit API — history
// ---------------------------------------------------------------------------

describe("AuditApi — GET /history/:dppId", () => {
  test("returns history array for a valid dppId", async () => {
    const res = await auditApi.getDPPHistory("dpp-001");
    expect(res.status).toEqual(200);
    expect(res.data).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Logistics API — transport update
// ---------------------------------------------------------------------------

describe("LogisticsApi — POST /update-transport-data", () => {
  test("accepts transport data and returns 200", async () => {
    const res = await logisticsApi.updateTransportData({
      dppId: "dpp-001",
      transportData: {
        locationFrom: "Fundão, Portugal",
        locationTo: "Lisboa, Portugal",
        timestamp: new Date().toISOString(),
        conditionData: "4°C, 60% humidity",
      },
    });
    expect(res.status).toEqual(200);
  });
});

// ---------------------------------------------------------------------------
// Processor API — aggregation
// ---------------------------------------------------------------------------

describe("ProcessorApi — POST /aggregate", () => {
  test("accepts an aggregate request and returns 200", async () => {
    const res = await processorApi.aggregateDPP({
      parentList:     ["1", "2", "3"],
      handlerAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      lotName:        "lot_001",
    });
    expect(res.status).toEqual(200);
  });
});

// ---------------------------------------------------------------------------
// Ownership API — transfer
// ---------------------------------------------------------------------------

describe("OwnershipApi — POST /transfer", () => {
  test("accepts a transfer request and returns 200", async () => {
    const res = await ownershipApi.transferDPP({
      dppId: "dpp-001",
      from:  "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      to:    "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    });
    expect(res.status).toEqual(200);
  });
});
