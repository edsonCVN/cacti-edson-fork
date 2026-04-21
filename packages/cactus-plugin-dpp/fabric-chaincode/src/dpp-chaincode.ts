// SPDX-License-Identifier: Apache-2.0

import {
  Context,
  Contract,
  Info,
  Returns,
  Transaction,
} from "fabric-contract-api";
import { DPPData, DPPRole, DPPState, TransportEvent } from "./dpp-state";

const ROLE_ATTR = "role";
const NEXT_TOKEN_ID_KEY = "nextTokenId";
const OWNER_INDEX_PREFIX = "owner~tokenId";

@Info({
  title: "DigitalProductPassport",
  description: "Digital Product Passport chaincode with role-based lifecycle and SATP bridge hooks.",
})
export class DigitalProductPassportContract extends Contract {
  constructor() {
    super("DigitalProductPassport");
  }

  // ============================================================
  //  Role / Access Control Helpers
  // ============================================================

  private getCallerRole(ctx: Context): string {
    const role = ctx.clientIdentity.getAttributeValue(ROLE_ATTR);
    return role ?? "";
  }

  private assertRole(ctx: Context, ...allowed: DPPRole[]): void {
    const role = this.getCallerRole(ctx);
    if (!allowed.includes(role as DPPRole)) {
      throw new Error(
        `Caller role '${role}' not authorised; required one of ${allowed.join(", ")}`,
      );
    }
  }

  private hasRole(ctx: Context, role: DPPRole): boolean {
    return (this.getCallerRole(ctx) as DPPRole) === role;
  }

  private callerId(ctx: Context): string {
    return ctx.clientIdentity.getID();
  }

  private callerMSP(ctx: Context): string {
    return ctx.clientIdentity.getMSPID();
  }

  // ============================================================
  //  Storage helpers
  // ============================================================

  private async readState(ctx: Context, key: string): Promise<Buffer | null> {
    const bytes = await ctx.stub.getState(key);
    if (!bytes || bytes.length === 0) return null;
    return Buffer.from(bytes);
  }

  private async loadDPP(ctx: Context, tokenId: string): Promise<DPPData> {
    const bytes = await this.readState(ctx, tokenId);
    if (!bytes) {
      throw new Error(`DPP ${tokenId} does not exist`);
    }
    return JSON.parse(bytes.toString()) as DPPData;
  }

  private async saveDPP(ctx: Context, dpp: DPPData): Promise<void> {
    await ctx.stub.putState(dpp.tokenId, Buffer.from(JSON.stringify(dpp)));
  }

  private async allocateTokenId(ctx: Context): Promise<string> {
    const current = await this.readState(ctx, NEXT_TOKEN_ID_KEY);
    const next = current ? parseInt(current.toString(), 10) : 0;
    await ctx.stub.putState(NEXT_TOKEN_ID_KEY, Buffer.from((next + 1).toString()));
    return next.toString();
  }

  private ensureMonotonicCounter(
    ctx: Context,
    tokenId: string,
  ): Promise<void> {
    return (async () => {
      const numeric = parseInt(tokenId, 10);
      if (Number.isNaN(numeric)) return;
      const current = await this.readState(ctx, NEXT_TOKEN_ID_KEY);
      const cur = current ? parseInt(current.toString(), 10) : 0;
      if (numeric >= cur) {
        await ctx.stub.putState(
          NEXT_TOKEN_ID_KEY,
          Buffer.from((numeric + 1).toString()),
        );
      }
    })();
  }

  private appendHistory(dpp: DPPData, eventType: string, actor: string): void {
    const entry = JSON.stringify({
      event: eventType,
      actor,
      timestamp: Math.floor(Date.now() / 1000),
    });
    dpp.history = dpp.history ?? [];
    dpp.history.push(entry);
  }

  // Initial state after cross-chain import, derived from the recipient role.
  // Matches the Solidity contract: FARMER and PROCESSOR map to CREATED,
  // TRANSPORTER to IN_TRANSIT, RETAILER to RECEIVED, anything else to CREATED.
  private roleBasedState(role: string): DPPState {
    switch (role) {
      case DPPRole.FARMER:
      case DPPRole.PROCESSOR:
        return DPPState.CREATED;
      case DPPRole.TRANSPORTER:
        return DPPState.IN_TRANSIT;
      case DPPRole.RETAILER:
        return DPPState.RECEIVED;
      default:
        return DPPState.CREATED;
    }
  }

  // ============================================================
  //  Initialisation
  // ============================================================

  @Transaction()
  public async Initialize(
    ctx: Context,
    ownerMSPID: string,
  ): Promise<boolean> {
    await ctx.stub.putState("ownerMSPID", Buffer.from(ownerMSPID));
    const existing = await this.readState(ctx, NEXT_TOKEN_ID_KEY);
    if (!existing) {
      await ctx.stub.putState(NEXT_TOKEN_ID_KEY, Buffer.from("0"));
    }
    return true;
  }

  @Transaction()
  public async setBridge(
    ctx: Context,
    bridgeMSPID: string,
    bridgeID: string,
  ): Promise<boolean> {
    this.assertRole(ctx, DPPRole.ADMIN, DPPRole.OWNER);
    await ctx.stub.putState("bridgeMSPID", Buffer.from(bridgeMSPID));
    await ctx.stub.putState("bridgeID", Buffer.from(bridgeID));
    return true;
  }

  // ============================================================
  //  Core Lifecycle
  // ============================================================

  @Transaction()
  @Returns("string")
  public async CreateDPP(
    ctx: Context,
    toClientId: string,
    productName: string,
    creationDate: string,
    metadataURI: string,
  ): Promise<string> {
    this.assertRole(ctx, DPPRole.FARMER, DPPRole.ADMIN);

    const tokenId = await this.allocateTokenId(ctx);
    const dpp: DPPData = {
      tokenId,
      productId: `PROD-${tokenId}`,
      productName,
      state: DPPState.CREATED,
      creationDate,
      additionalMetadataURI: metadataURI,
      owner: toClientId,
      ownerMSPID: this.callerMSP(ctx),
      transportHistory: [],
      certifications: [],
      history: [],
      components: [],
      preLockState: DPPState.CREATED,
    };
    this.appendHistory(dpp, "Mint", this.callerId(ctx));
    await this.saveDPP(ctx, dpp);
    return tokenId;
  }

  @Transaction()
  public async AmendDPPData(
    ctx: Context,
    tokenId: string,
    newMetadataURI: string,
  ): Promise<boolean> {
    const role = this.getCallerRole(ctx);
    if (
      ![
        DPPRole.PROCESSOR,
        DPPRole.TRANSPORTER,
        DPPRole.RETAILER,
        DPPRole.GATEWAY,
        DPPRole.ADMIN,
      ].includes(role as DPPRole)
    ) {
      throw new Error("Caller lacks amend permission");
    }
    const dpp = await this.loadDPP(ctx, tokenId);
    if (dpp.state === DPPState.REVOKED) throw new Error("DPP is revoked");
    dpp.additionalMetadataURI = newMetadataURI;
    this.appendHistory(dpp, "Amend", this.callerId(ctx));
    await this.saveDPP(ctx, dpp);
    return true;
  }

  @Transaction()
  public async AddCertification(
    ctx: Context,
    tokenId: string,
    certId: string,
  ): Promise<boolean> {
    const dpp = await this.loadDPP(ctx, tokenId);
    if (dpp.state === DPPState.REVOKED) throw new Error("DPP is revoked");
    const role = this.getCallerRole(ctx);
    const isOwner = dpp.owner === this.callerId(ctx);
    const allowed =
      isOwner ||
      role === DPPRole.GATEWAY ||
      role === DPPRole.PROCESSOR ||
      role === DPPRole.ADMIN;
    if (!allowed) throw new Error("Caller not authorised");
    dpp.certifications = dpp.certifications ?? [];
    dpp.certifications.push(certId);
    this.appendHistory(dpp, "Certification", this.callerId(ctx));
    await this.saveDPP(ctx, dpp);
    return true;
  }

  @Transaction()
  public async UpdateTransportData(
    ctx: Context,
    tokenId: string,
    locationFrom: string,
    locationTo: string,
    timestamp: string,
    conditionData: string,
  ): Promise<boolean> {
    this.assertRole(ctx, DPPRole.TRANSPORTER, DPPRole.ADMIN);
    const dpp = await this.loadDPP(ctx, tokenId);
    if (dpp.state === DPPState.REVOKED) throw new Error("DPP is revoked");
    dpp.state = DPPState.IN_TRANSIT;
    const event: TransportEvent = {
      locationFrom,
      locationTo,
      timestamp,
      conditionData,
    };
    dpp.transportHistory = dpp.transportHistory ?? [];
    dpp.transportHistory.push(event);
    this.appendHistory(dpp, "Transport", this.callerId(ctx));
    await this.saveDPP(ctx, dpp);
    return true;
  }

  @Transaction()
  public async TransferDPP(
    ctx: Context,
    tokenId: string,
    newOwnerId: string,
  ): Promise<boolean> {
    const dpp = await this.loadDPP(ctx, tokenId);
    if (dpp.state === DPPState.REVOKED) throw new Error("DPP is revoked");
    const caller = this.callerId(ctx);
    const role = this.getCallerRole(ctx);
    if (dpp.owner !== caller && role !== DPPRole.ADMIN) {
      throw new Error("Caller is not owner nor admin");
    }
    dpp.owner = newOwnerId;
    this.appendHistory(dpp, "Transfer", caller);
    await this.saveDPP(ctx, dpp);
    return true;
  }

  @Transaction()
  public async RevokeDPP(
    ctx: Context,
    tokenId: string,
    reason: string,
  ): Promise<boolean> {
    const dpp = await this.loadDPP(ctx, tokenId);
    const caller = this.callerId(ctx);
    const role = this.getCallerRole(ctx);
    if (
      dpp.owner !== caller &&
      role !== DPPRole.GATEWAY &&
      role !== DPPRole.ADMIN
    ) {
      throw new Error("Caller is not owner nor gateway");
    }
    dpp.state = DPPState.REVOKED;
    this.appendHistory(dpp, `Revoke:${reason}`, caller);
    await this.saveDPP(ctx, dpp);
    return true;
  }

  // ============================================================
  //  SATP Bridge-compatible entry points
  //  Function names match the ontology-driven signatures.
  // ============================================================

  @Transaction()
  public async lock(
    ctx: Context,
    owner: string,
    bridge: string,
    uniqueDescriptor: string,
  ): Promise<boolean> {
    const dpp = await this.loadDPP(ctx, uniqueDescriptor);
    if (dpp.state === DPPState.REVOKED) throw new Error("DPP is revoked");
    if (dpp.owner !== owner) {
      throw new Error(`DPP owner mismatch: expected ${owner}, got ${dpp.owner}`);
    }
    dpp.preLockState = dpp.state;
    dpp.state = DPPState.LOCKED_CROSSCHAIN;
    dpp.owner = bridge;
    this.appendHistory(dpp, "SATPLock", this.callerId(ctx));
    await this.saveDPP(ctx, dpp);
    return true;
  }

  @Transaction()
  public async unlock(
    ctx: Context,
    bridge: string,
    owner: string,
    uniqueDescriptor: string,
  ): Promise<boolean> {
    const dpp = await this.loadDPP(ctx, uniqueDescriptor);
    let restored = dpp.preLockState;
    if (!restored || restored === DPPState.LOCKED_CROSSCHAIN) {
      restored = DPPState.CREATED;
    }
    dpp.state = restored;
    dpp.preLockState = DPPState.CREATED;
    dpp.owner = owner;
    this.appendHistory(dpp, "SATPUnlock", this.callerId(ctx));
    await this.saveDPP(ctx, dpp);
    return true;
  }

  @Transaction()
  public async mint(
    ctx: Context,
    bridge: string,
    uniqueDescriptor: string,
  ): Promise<boolean> {
    this.assertRole(ctx, DPPRole.BRIDGE, DPPRole.ADMIN);
    const existing = await this.readState(ctx, uniqueDescriptor);
    if (existing) {
      throw new Error(`DPP ${uniqueDescriptor} already exists on this chain`);
    }
    const dpp: DPPData = {
      tokenId: uniqueDescriptor,
      productId: `DPP-${uniqueDescriptor}`,
      productName: "Cross-Chain DPP",
      state: DPPState.CREATED,
      creationDate: "",
      additionalMetadataURI: "",
      owner: bridge,
      ownerMSPID: this.callerMSP(ctx),
      transportHistory: [],
      certifications: [],
      history: [],
      components: [],
      preLockState: DPPState.CREATED,
    };
    this.appendHistory(dpp, "SATPMint", this.callerId(ctx));
    await this.saveDPP(ctx, dpp);
    await this.ensureMonotonicCounter(ctx, uniqueDescriptor);
    return true;
  }

  @Transaction()
  public async burn(
    ctx: Context,
    uniqueDescriptor: string,
  ): Promise<boolean> {
    this.assertRole(ctx, DPPRole.BRIDGE, DPPRole.ADMIN);
    const dpp = await this.loadDPP(ctx, uniqueDescriptor);
    dpp.state = DPPState.REVOKED;
    this.appendHistory(dpp, "SATPBurn", this.callerId(ctx));
    await this.saveDPP(ctx, dpp);
    return true;
  }

  @Transaction()
  public async assign(
    ctx: Context,
    receiver: string,
    uniqueDescriptor: string,
  ): Promise<boolean> {
    const dpp = await this.loadDPP(ctx, uniqueDescriptor);
    dpp.owner = receiver;
    this.appendHistory(dpp, "SATPAssign", this.callerId(ctx));
    await this.saveDPP(ctx, dpp);
    return true;
  }

  @Transaction(false)
  @Returns("boolean")
  public async hasBridgeRole(
    ctx: Context,
    bridge: string,
  ): Promise<boolean> {
    // In Fabric we identify the bridge by MSP/ID registered at Initialize.
    const storedBridgeId = await this.readState(ctx, "bridgeID");
    if (!storedBridgeId) return false;
    return storedBridgeId.toString() === bridge;
  }

  // ============================================================
  //  Cross-chain metadata import (post-SATP)
  // ============================================================

  @Transaction()
  public async ImportCrossChainData(
    ctx: Context,
    tokenId: string,
    productName: string,
    creationDate: string,
    metadataURI: string,
    certsJson: string,
    historyJson: string,
  ): Promise<boolean> {
    this.assertRole(ctx, DPPRole.ADMIN, DPPRole.GATEWAY, DPPRole.BRIDGE);

    const dpp = await this.loadDPP(ctx, tokenId);
    dpp.productName = productName;
    dpp.creationDate = creationDate;
    dpp.additionalMetadataURI = metadataURI;

    // Fabric has no per-client role registry, so the bridge passes the
    // recipient role as an ecert attribute; fall back to CREATED when absent.
    const recipientRoleAttr =
      ctx.clientIdentity.getAttributeValue("recipientRole") ?? "";
    dpp.state = this.roleBasedState(recipientRoleAttr);

    dpp.certifications = JSON.parse(certsJson || "[]");
    dpp.history = JSON.parse(historyJson || "[]");
    this.appendHistory(dpp, "CrossChainImport", this.callerId(ctx));
    await this.saveDPP(ctx, dpp);
    return true;
  }

  // ============================================================
  //  Views
  // ============================================================

  @Transaction(false)
  @Returns("string")
  public async GetDPP(ctx: Context, tokenId: string): Promise<string> {
    const dpp = await this.loadDPP(ctx, tokenId);
    return JSON.stringify(dpp);
  }

  @Transaction(false)
  @Returns("string")
  public async GetHistory(ctx: Context, tokenId: string): Promise<string> {
    const dpp = await this.loadDPP(ctx, tokenId);
    return JSON.stringify(dpp.history ?? []);
  }

  @Transaction(false)
  @Returns("string")
  public async GetCertifications(
    ctx: Context,
    tokenId: string,
  ): Promise<string> {
    const dpp = await this.loadDPP(ctx, tokenId);
    return JSON.stringify(dpp.certifications ?? []);
  }

  @Transaction(false)
  @Returns("string")
  public async GetAllDPPs(ctx: Context): Promise<string> {
    const iterator = await ctx.stub.getStateByRange("", "");
    const results: DPPData[] = [];
    let result = await iterator.next();
    while (!result.done) {
      const key = result.value.key;
      // Skip bookkeeping keys
      if (
        key !== NEXT_TOKEN_ID_KEY &&
        key !== "ownerMSPID" &&
        key !== "bridgeMSPID" &&
        key !== "bridgeID" &&
        !key.startsWith(OWNER_INDEX_PREFIX)
      ) {
        try {
          results.push(JSON.parse(result.value.value.toString()) as DPPData);
        } catch {
          // skip non-JSON entries
        }
      }
      result = await iterator.next();
    }
    return JSON.stringify(results);
  }
}
