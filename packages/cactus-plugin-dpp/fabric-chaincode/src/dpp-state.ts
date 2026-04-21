// SPDX-License-Identifier: Apache-2.0

import { Object as DataType, Property } from "fabric-contract-api";

export enum DPPState {
  CREATED = "CREATED",
  IN_TRANSIT = "IN_TRANSIT",
  RECEIVED = "RECEIVED",
  RETAIL = "RETAIL",
  LOCKED_CROSSCHAIN = "LOCKED_CROSSCHAIN",
  REVOKED = "REVOKED",
}

export enum DPPRole {
  ADMIN = "ADMIN",
  OWNER = "OWNER",
  BRIDGE = "BRIDGE",
  GATEWAY = "GATEWAY",
  FARMER = "FARMER",
  PROCESSOR = "PROCESSOR",
  TRANSPORTER = "TRANSPORTER",
  RETAILER = "RETAILER",
}

@DataType()
export class TransportEvent {
  @Property() public locationFrom: string;
  @Property() public locationTo: string;
  @Property() public timestamp: string;
  @Property() public conditionData: string;
}

@DataType()
export class DPPData {
  @Property() public tokenId: string;
  @Property() public productId: string;
  @Property() public productName: string;
  @Property() public state: DPPState;
  @Property() public creationDate: string;
  @Property() public additionalMetadataURI: string;
  @Property() public owner: string;
  @Property() public ownerMSPID: string;
  @Property("transportHistory", "TransportEvent[]")
  public transportHistory: TransportEvent[];
  @Property("certifications", "string[]")
  public certifications: string[];
  @Property("history", "string[]")
  public history: string[];
  @Property("components", "string[]")
  public components: string[];
  @Property() public preLockState: DPPState;
}
