import type { LogLevelDesc } from "@hyperledger/cactus-common";
import { ethers } from "ethers";
import {
  CreateDPPRequest,
  CreateDPPResponse,
  TransferDPPRequest,
  ReceiveDPPRequest,
  AmendDPPDataRequest,
  AddCertificationRequest,
  RevokeDPPRequest,
  ListOwnedDPPsRequest,
  ListOwnedDPPsResponse,
  GetDPPHistoryRequest,
  GetDPPHistoryResponse,
  AggregateDPPtoBoxRequest,
  AggregateDPPtoBoxResponse,
  AggregateDPPtoLotRequest,
  AggregateDPPtoLotResponse,
  GetDPPComponentsRequest,
  GetDPPComponentsResponse,
  SearchDPPByCriteriaRequest,
  SearchDPPByCriteriaResponse,
  UpdateTransportDataRequest,
  UpdateRetailDataRequest,
  GetDPPDataRequest,
  GetDPPDataResponse,
  GetRecyclingInfoRequest,
  GetRecyclingInfoResponse,
  SubmitProductReviewRequest,
  SubscribeToUpdatesRequest,
  CrossChainTransferDPPRequest,
  CheckCrossChainStatusRequest,
  VerifyDPPAuthenticityRequest,
  VerifyDPPAuthenticityResponse,
  GenericResponse,
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

  public abstract createDPP(
    request: CreateDPPRequest,
  ): Promise<CreateDPPResponse>;

  public abstract transferDPP(
    request: TransferDPPRequest,
  ): Promise<GenericResponse>;

  public abstract amendDPPData(
    request: AmendDPPDataRequest,
  ): Promise<GenericResponse>;

  public abstract addCertification(
    request: AddCertificationRequest,
  ): Promise<GenericResponse>;

  public abstract revokeDPP(
    request: RevokeDPPRequest,
  ): Promise<GenericResponse>;

  public abstract listOwnedDPPs(
    request: ListOwnedDPPsRequest,
  ): Promise<ListOwnedDPPsResponse>;

  public abstract getDPPHistory(
    request: GetDPPHistoryRequest,
  ): Promise<GetDPPHistoryResponse>;

  // --- Processing Company (Aggregation & Receiving) ---

  public abstract receiveDPP(
    request: ReceiveDPPRequest,
  ): Promise<GenericResponse>;

  public abstract aggregateDPPtoBox(
    request: AggregateDPPtoBoxRequest,
  ): Promise<AggregateDPPtoBoxResponse>;

  public abstract aggregateDPPtoLot(
    request: AggregateDPPtoLotRequest,
  ): Promise<AggregateDPPtoLotResponse>;

  public abstract getDPPComponents(
    request: GetDPPComponentsRequest,
  ): Promise<GetDPPComponentsResponse>;

  public abstract searchDPPByCriteria(
    request: SearchDPPByCriteriaRequest,
  ): Promise<SearchDPPByCriteriaResponse>;

  // --- Transporter and Retailer ---

  public abstract updateTransportData(
    request: UpdateTransportDataRequest,
  ): Promise<GenericResponse>;

  public abstract updateRetailData(
    request: UpdateRetailDataRequest,
  ): Promise<GenericResponse>;

  // --- Final Consumer ---

  public abstract getDPPData(
    request: GetDPPDataRequest,
  ): Promise<GetDPPDataResponse>;

  public abstract getRecyclingInfo(
    request: GetRecyclingInfoRequest,
  ): Promise<GetRecyclingInfoResponse>;

  public abstract submitProductReview(
    request: SubmitProductReviewRequest,
  ): Promise<GenericResponse>;

  public abstract subscribeToUpdates(
    request: SubscribeToUpdatesRequest,
  ): Promise<GenericResponse>;

  // --- Interoperability (SATP) & Validation ---

  public abstract crossChainTransferDPP(
    request: CrossChainTransferDPPRequest,
  ): Promise<GenericResponse>;

  public abstract checkCrossChainStatus(
    request: CheckCrossChainStatusRequest,
  ): Promise<GenericResponse>;

  public abstract verifyDPPAuthenticity(
    request: VerifyDPPAuthenticityRequest,
  ): Promise<VerifyDPPAuthenticityResponse>;
}
