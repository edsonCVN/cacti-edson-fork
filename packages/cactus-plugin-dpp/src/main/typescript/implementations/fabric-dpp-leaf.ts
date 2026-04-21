// SPDX-License-Identifier: Apache-2.0

import {
  LogLevelDesc,
  Logger,
  LoggerProvider,
} from "@hyperledger/cactus-common";
import {
  FabricContractInvocationType,
  PluginLedgerConnectorFabric,
  FabricSigningCredential,
} from "@hyperledger/cactus-plugin-ledger-connector-fabric";
import { DPPAbstract } from "../dpp-abstract";

export interface FabricDPPLeafOptions {
  logLevel?: LogLevelDesc;
  connector: PluginLedgerConnectorFabric;
  channelName: string;
  contractName: string;
  signingCredential: FabricSigningCredential;
}

// Fabric implementation of the DPP operations used by the cross-chain
// evaluation. Covers the subset needed for SATP transfer; the remaining
// abstract methods throw FabricDPPNotImplementedError.
export class FabricDPPLeaf extends DPPAbstract {
  protected readonly logLevel: LogLevelDesc;
  private readonly log: Logger;
  private readonly connector: PluginLedgerConnectorFabric;
  private readonly channelName: string;
  private readonly contractName: string;
  private readonly signingCredential: FabricSigningCredential;

  constructor(opts: FabricDPPLeafOptions) {
    super();
    this.logLevel = opts.logLevel ?? "INFO";
    this.log = LoggerProvider.getOrCreate({
      label: "FabricDPPLeaf",
      level: this.logLevel,
    });
    this.connector = opts.connector;
    this.channelName = opts.channelName;
    this.contractName = opts.contractName;
    this.signingCredential = opts.signingCredential;
  }

  private async send(
    methodName: string,
    params: string[],
  ): Promise<string> {
    const res = await this.connector.transact({
      signingCredential: this.signingCredential,
      channelName: this.channelName,
      contractName: this.contractName,
      invocationType: FabricContractInvocationType.Send,
      methodName,
      params,
    });
    return res.functionOutput;
  }

  private async query(
    methodName: string,
    params: string[],
  ): Promise<string> {
    const res = await this.connector.transact({
      signingCredential: this.signingCredential,
      channelName: this.channelName,
      contractName: this.contractName,
      invocationType: FabricContractInvocationType.Call,
      methodName,
      params,
    });
    return res.functionOutput;
  }

  // Core lifecycle

  public async createDPP(request: {
    to: string;
    productName: string;
    creationDate: string;
    metadataURI: string;
  }): Promise<{ tokenId: string }> {
    const tokenId = await this.send("CreateDPP", [
      request.to,
      request.productName,
      request.creationDate,
      request.metadataURI,
    ]);
    this.log.info(`Fabric DPP created, tokenId=${tokenId}`);
    return { tokenId };
  }

  public async transferDPP(request: {
    tokenId: string;
    newOwner: string;
  }): Promise<{ success: boolean }> {
    await this.send("TransferDPP", [request.tokenId, request.newOwner]);
    return { success: true };
  }

  public async amendDPPData(request: {
    tokenId: string;
    metadataURI: string;
  }): Promise<{ success: boolean }> {
    await this.send("AmendDPPData", [request.tokenId, request.metadataURI]);
    return { success: true };
  }

  public async addCertification(request: {
    tokenId: string;
    certId: string;
  }): Promise<{ success: boolean }> {
    await this.send("AddCertification", [request.tokenId, request.certId]);
    return { success: true };
  }

  public async revokeDPP(request: {
    tokenId: string;
    reason: string;
  }): Promise<{ success: boolean }> {
    await this.send("RevokeDPP", [request.tokenId, request.reason]);
    return { success: true };
  }

  public async getDPPData(request: { tokenId: string }): Promise<any> {
    const raw = await this.query("GetDPP", [request.tokenId]);
    return JSON.parse(raw);
  }

  public async getDPPHistory(request: { tokenId: string }): Promise<any> {
    const raw = await this.query("GetHistory", [request.tokenId]);
    return { history: JSON.parse(raw) };
  }

  public async updateTransportData(request: {
    tokenId: string;
    locationFrom: string;
    locationTo: string;
    timestamp: string;
    conditionData: string;
  }): Promise<{ success: boolean }> {
    await this.send("UpdateTransportData", [
      request.tokenId,
      request.locationFrom,
      request.locationTo,
      request.timestamp,
      request.conditionData,
    ]);
    return { success: true };
  }

  // Cross-chain metadata import, invoked after the SATP mint/assign.

  public async importCrossChainData(request: {
    tokenId: string;
    productName: string;
    creationDate: string;
    metadataURI: string;
    certs: string[];
    historyEntries: string[];
  }): Promise<{ success: boolean }> {
    await this.send("ImportCrossChainData", [
      request.tokenId,
      request.productName,
      request.creationDate,
      request.metadataURI,
      JSON.stringify(request.certs ?? []),
      JSON.stringify(request.historyEntries ?? []),
    ]);
    return { success: true };
  }

  // Abstract methods not yet ported to Fabric. Implemented as throwing stubs
  // so that an accidental call fails loudly during tests.

  private notImplemented(method: string): never {
    throw new FabricDPPNotImplementedError(method);
  }

  public async listOwnedDPPs(_: any) { return this.notImplemented("listOwnedDPPs"); }
  public async receiveDPP(_: any) { return this.notImplemented("receiveDPP"); }
  public async aggregateDPPtoBox(_: any) { return this.notImplemented("aggregateDPPtoBox"); }
  public async aggregateDPPtoLot(_: any) { return this.notImplemented("aggregateDPPtoLot"); }
  public async disaggregateDPP(_: any) { return this.notImplemented("disaggregateDPP"); }
  public async getDPPComponents(_: any) { return this.notImplemented("getDPPComponents"); }
  public async searchDPPByCriteria(_: any) { return this.notImplemented("searchDPPByCriteria"); }
  public async updateRetailData(_: any) { return this.notImplemented("updateRetailData"); }
  public async getRecyclingInfo(_: any) { return this.notImplemented("getRecyclingInfo"); }
  public async submitProductReview(_: any) { return this.notImplemented("submitProductReview"); }
  public async subscribeToUpdates(_: any) { return this.notImplemented("subscribeToUpdates"); }
  public async crossChainTransferDPP(_: any) { return this.notImplemented("crossChainTransferDPP"); }
  public async checkCrossChainStatus(_: any) { return this.notImplemented("checkCrossChainStatus"); }
  public async verifyDPPAuthenticity(_: any) { return this.notImplemented("verifyDPPAuthenticity"); }
}

export class FabricDPPNotImplementedError extends Error {
  constructor(method: string) {
    super(`FabricDPPLeaf.${method} is not implemented`);
    this.name = "FabricDPPNotImplementedError";
  }
}
