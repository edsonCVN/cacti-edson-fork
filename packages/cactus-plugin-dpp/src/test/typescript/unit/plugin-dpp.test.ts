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

// Importamos o cliente da API do DPP (ajuste o caminho conforme sua estrutura de pastas)
import { FarmerApi, PluginDpp } from "../../../main/typescript/public-api";

describe("Digital Product Passport (DPP) API Tests", () => {
  let apiClient: FarmerApi, connector: PluginDpp;
  const expressApp = express();
  expressApp.use(bodyParser.json({ limit: "250mb" }));
  const server = http.createServer(expressApp);

  // --- CONFIGURAÇÃO DO AMBIENTE ---
  beforeAll(async () => {
    const listenOptions: IListenOptions = {
      hostname: "127.0.0.1",
      port: 0, // Porta aleatória para evitar conflitos
      server,
    };

    const addressInfo = (await Servers.listen(listenOptions)) as AddressInfo;
    const { address, port } = addressInfo;
    const apiHost = `http://${address}:${port}`;

    // Configura o cliente para apontar para o servidor de teste
    apiClient = new FarmerApi(new Configuration({ basePath: apiHost }));

    // Inicializa o plugin do DPP
    connector = new PluginDpp({
      instanceId: uuidV4(),
      logLevel: testLogLevel,
      pluginRegistry: new PluginRegistry(),
    });
  });

  afterAll(async () => {
    await Servers.shutdown(server);
  });

  // --- TESTE DE CRIAÇÃO DE DPP (FLUXO AGRICULTOR) ---
  test("should create a new DPP NFT for a batch of cherries", async () => {
    // 1. Registra os serviços web no Express
    await connector.getOrCreateWebServices();
    await connector.registerWebServices(expressApp);

    // 2. Prepara os dados de teste baseados no CreateDPPRequest do openapi.json
    const createRequest = {
      farmerId: "agricultor_fundao_01",
      batchId: "lote_cereja_2024_001",
      productionData: {
        pesticidesUsed: "Nenhum - Produção Orgânica",
        certifications: ["Certificado AOP", "GlobalGAP"],
        harvestDate: new Date().toISOString(),
        location: "Fundão, Portugal",
      },
    };

    // 3. Chama o método de criação da API
    const response = await apiClient.createDPP(createRequest);

    // 4. Validações (Asserções)
    expect(response).toBeDefined();
    expect(response.status).toEqual(200);
    expect(response.data).toBeDefined();
    expect(response.data.transactionHash).toStartWith("0x"); // Simulga um hash de blockchain
    expect(response.data.dppId).toBeDefined();

    console.log("DPP Criado com sucesso! ID:", response.data.dppId);
  });
});
