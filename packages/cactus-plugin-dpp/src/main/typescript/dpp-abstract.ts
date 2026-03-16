import type { LogLevelDesc } from "@hyperledger/cactus-common";
import { ethers } from "ethers";
import {
  CreateDPPRequest,
  TransferDPPRequest,
  UpdateTransportDataRequest,
  AggregateDPPRequest,
} from "./public-api";

/**
 * Common interface options for all Digital Product Passport implementations.
 */
export interface DPPOptions {
  logLevel?: LogLevelDesc;
  network: string;
  signer: ethers.Signer;
}

/**
 * An abstract class representing a Digital Product Passport implementation.
 * This class defines the common interface and operations that any specific
 * DPP smart contract implementation must provide.
 */
export abstract class DPPAbstract {
  /**
   * Logging level.
   *
   * @protected
   * @abstract
   * @readonly
   */
  protected abstract readonly logLevel: LogLevelDesc;

  // --- Manufacturer (Creation & Ownership) ---

  public abstract createDPP(request: any): Promise<any>;

  public abstract transferDPP(request: any): Promise<any>;

  public abstract amendDPPData(request: any): Promise<any>;

  public abstract addCertification(request: any): Promise<any>;

  public abstract revokeDPP(request: any): Promise<any>;

  public abstract listOwnedDPPs(request: any): Promise<any>;

  public abstract getDPPHistory(request: any): Promise<any>;

  // --- Processing Company (Aggregation & Receiving) ---

  public abstract receiveDPP(request: any): Promise<any>;

  public abstract aggregateDPPtoBox(request: any): Promise<any>;

  public abstract aggregateDPPtoLot(request: any): Promise<any>;

  public abstract disaggregateDPP(request: any): Promise<any>;

  public abstract getDPPComponents(request: any): Promise<any>;

  public abstract searchDPPByCriteria(request: any): Promise<any>;

  // --- Transporter and Retailer ---

  public abstract updateTransportData(request: any): Promise<any>;

  public abstract updateRetailData(request: any): Promise<any>;

  // --- Final Consumer ---

  public abstract getDPPData(request: any): Promise<any>;

  public abstract getRecyclingInfo(request: any): Promise<any>;

  public abstract submitProductReview(request: any): Promise<any>;

  public abstract subscribeToUpdates(request: any): Promise<any>;

  // --- Interoperability (SATP) & Validation ---

  public abstract crossChainTransferDPP(request: any): Promise<any>;

  public abstract checkCrossChainStatus(request: any): Promise<any>;

  public abstract verifyDPPAuthenticity(request: any): Promise<any>;
}
