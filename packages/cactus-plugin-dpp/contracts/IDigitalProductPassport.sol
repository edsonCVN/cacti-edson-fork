// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IDigitalProductPassport
 * @notice Interface for the Digital Product Passport (DPP) smart contract.
 * @dev Outlines the data structures, events, and external methods required for
 *      managing the full lifecycle of a DPP — from creation, through the supply
 *      chain (transport, processing, retail), to revocation and SATP cross-chain
 *      bridging operations.
 */
interface IDigitalProductPassport {
  /// @notice Possible states a DPP token can be in.
  enum DPPState {
    CREATED,
    IN_TRANSIT,
    RECEIVED,
    RETAIL,
    REVOKED,
    LOCKED_CROSSCHAIN
  }

  /// @notice Core metadata stored on-chain for each DPP token.
  struct DPPData {
    string productId;
    string productName;
    DPPState state;
    string creationDate;
    string additionalMetadataURI;
  }

  /// @notice A single transport leg recorded against a DPP token.
  struct TransportEvent {
    string locationFrom;
    string locationTo;
    string timestamp;
    string conditionData;
  }

  // ============================================================
  //  Events — Supply-chain lifecycle
  // ============================================================

  /// @notice Emitted when a new DPP token is minted.
  event DPPCreated(uint256 indexed tokenId, address indexed owner, string productName, string creationDate);
  /// @notice Emitted when a DPP's metadata URI is amended.
  event DPPAmended(uint256 indexed tokenId, address indexed actor, string newMetadataURI);
  /// @notice Emitted when a certification is attached to a DPP.
  event CertificationAdded(uint256 indexed tokenId, address indexed actor, string certId);
  /// @notice Emitted when transport data is recorded for a DPP.
  event TransportUpdated(uint256 indexed tokenId, address indexed actor, string locationFrom, string locationTo);
  /// @notice Emitted when a retailer marks a DPP as received.
  event MarkedAsReceived(uint256 indexed tokenId, address indexed actor);
  /// @notice Emitted when retail data is updated for a DPP.
  event RetailDataUpdated(uint256 indexed tokenId, address indexed actor);
  /// @notice Emitted when child DPPs are aggregated into a new parent DPP.
  event DPPAggregated(uint256 indexed parentTokenId, address indexed actor, uint256[] childTokenIds);
  /// @notice Emitted when a DPP is disaggregated (split) into multiple new DPPs.
  event DPPDisaggregated(uint256 indexed originTokenId, address indexed actor, uint256[] newTokenIds);
  /// @notice Emitted when a DPP is revoked.
  event DPPRevoked(uint256 indexed tokenId, address indexed actor, string reason);
  /// @notice Emitted when a DPP is transferred between owners.
  event DPPTransferred(uint256 indexed tokenId, address indexed from, address indexed to);

  // ============================================================
  //  Events — SATP cross-chain bridge
  // ============================================================

  /// @notice Emitted when a DPP is locked for cross-chain transfer.
  event SATPLocked(uint256 indexed tokenId, address indexed from, address indexed to);
  /// @notice Emitted when a previously locked DPP is unlocked (rollback).
  event SATPUnlocked(uint256 indexed tokenId, address indexed from, address indexed to);
  /// @notice Emitted when a DPP is burned on the source chain.
  event SATPBurned(uint256 indexed tokenId, address indexed actor);
  /// @notice Emitted when a DPP is minted on the destination chain.
  event SATPMinted(uint256 indexed tokenId, address indexed account);
  /// @notice Emitted when a bridged DPP is assigned to the final receiver.
  event SATPAssigned(uint256 indexed tokenId, address indexed to);
  /// @notice Emitted when BRIDGE_ROLE is granted to an address.
  event BridgeRoleGranted(address indexed account, address indexed grantedBy);

  // ============================================================
  //  Core Lifecycle
  // ============================================================

  /**
   * @notice Mints a new DPP token and assigns it to `to`.
   * @param to          The address that will own the newly minted token.
   * @param productName Human-readable product name stored on-chain.
   * @param creationDate ISO-8601 date string for the product origin.
   * @param metadataURI  Off-chain metadata URI (IPFS CID or JSON string).
   * @return tokenId     The ID of the newly minted DPP token.
   */
  function createDPP(
    address to,
    string memory productName,
    string memory creationDate,
    string memory metadataURI
  ) external returns (uint256);

  /**
   * @notice Updates the metadata URI of an existing DPP.
   * @param tokenId        The DPP token to amend.
   * @param newMetadataURI The new metadata URI value.
   */
  function amendDPPData(uint256 tokenId, string memory newMetadataURI) external;

  /**
   * @notice Attaches a certification identifier to a DPP.
   * @param tokenId The DPP token to certify.
   * @param certId  A unique certification identifier string.
   */
  function addCertification(uint256 tokenId, string memory certId) external;

  /**
   * @notice Records a transport leg for a DPP and sets its state to IN_TRANSIT.
   * @param tokenId       The DPP token being transported.
   * @param locationFrom  Origin location of this transport leg.
   * @param locationTo    Destination location of this transport leg.
   * @param timestamp     ISO-8601 timestamp of the transport event.
   * @param conditionData Sensor or condition data captured during transport.
   */
  function updateTransportData(
    uint256 tokenId,
    string memory locationFrom,
    string memory locationTo,
    string memory timestamp,
    string memory conditionData
  ) external;

  /**
   * @notice Marks a DPP as received by the retailer (state → RECEIVED).
   * @param tokenId The DPP token to mark.
   */
  function markAsReceived(uint256 tokenId) external;

  /**
   * @notice Records retail-specific data for a DPP and sets its state to RETAIL.
   * @param tokenId     The DPP token being retailed.
   * @param location    The retail location or store identifier.
   * @param arrivalDate Date the product arrived at the retail location.
   * @param shelfLife   Expiry or best-before date string.
   */
  function updateRetailData(
    uint256 tokenId,
    string memory location,
    string memory arrivalDate,
    string memory shelfLife
  ) external;

  /**
   * @notice Aggregates multiple child DPPs into a new parent DPP, burning the children.
   * @param to              Address that will own the new parent token.
   * @param parentProductId Human-readable name for the aggregated product.
   * @param metadataURI     Off-chain metadata URI for the parent.
   * @param childTokenIds   Array of child DPP token IDs to consume.
   * @return parentTokenId  The ID of the newly created parent DPP.
   */
  function aggregateDPPs(
    address to,
    string memory parentProductId,
    string memory metadataURI,
    uint256[] memory childTokenIds
  ) external returns (uint256);

  /**
   * @notice Splits a DPP into `count` new independent DPPs that inherit the
   *         original's metadata and certifications. The original is burned.
   * @param tokenId The DPP token to disaggregate.
   * @param to      Address that will own all newly created tokens.
   * @param count   Number of new DPP tokens to create (must be >= 2).
   * @return newTokenIds Array of the newly minted token IDs.
   */
  function disaggregateDPP(
    uint256 tokenId,
    address to,
    uint256 count
  ) external returns (uint256[] memory);

  /**
   * @notice Revokes a DPP, marking it as no longer valid.
   * @param tokenId The DPP token to revoke.
   * @param reason  Human-readable reason for revocation.
   */
  function revokeDPP(uint256 tokenId, string memory reason) external;

  // ============================================================
  //  View Methods
  // ============================================================

  /**
   * @notice Returns the core on-chain data for a DPP.
   * @param tokenId The DPP token to query.
   * @return data   The DPPData struct for the given token.
   */
  function getDPPData(uint256 tokenId) external view returns (DPPData memory);

  /**
   * @notice Returns the full transport history for a DPP.
   * @param tokenId The DPP token to query.
   * @return events Array of TransportEvent structs.
   */
  function getTransportHistory(
    uint256 tokenId
  ) external view returns (TransportEvent[] memory);

  /**
   * @notice Returns all certification IDs attached to a DPP.
   * @param tokenId The DPP token to query.
   * @return certs  Array of certification identifier strings.
   */
  function getCertifications(
    uint256 tokenId
  ) external view returns (string[] memory);

  /**
   * @notice Returns the child token IDs that compose an aggregated DPP.
   * @param tokenId The parent DPP token to query.
   * @return ids    Array of child token IDs.
   */
  function getDPPComponents(
    uint256 tokenId
  ) external view returns (uint256[] memory);

  /**
   * @notice Returns the on-chain JSON history log for a DPP.
   * @param tokenId The DPP token to query.
   * @return log    Array of JSON-encoded history entries.
   */
  function getHistory(uint256 tokenId) external view returns (string[] memory);

  // ============================================================
  //  SATP Bridge-Compatible Methods
  // ============================================================

  /**
   * @notice Locks a DPP by transferring it from `from` to bridge custody at `to`.
   * @param from             Current owner of the token.
   * @param to               Bridge custody address.
   * @param uniqueDescriptor The DPP token ID.
   * @return success         True if the operation succeeds.
   */
  function lock(address from, address to, uint256 uniqueDescriptor) external returns (bool);

  /**
   * @notice Unlocks a previously locked DPP (rollback scenario).
   * @param from             Bridge custody address currently holding the token.
   * @param to               Original owner to return the token to.
   * @param uniqueDescriptor The DPP token ID.
   * @return success         True if the operation succeeds.
   */
  function unlock(address from, address to, uint256 uniqueDescriptor) external returns (bool);

  /**
   * @notice Mints a DPP on the destination chain during a cross-chain transfer.
   * @param account          Address that will own the minted token.
   * @param uniqueDescriptor The DPP token ID (must match the source chain ID).
   * @return success         True if the operation succeeds.
   */
  function mint(address account, uint256 uniqueDescriptor) external returns (bool);

  /**
   * @notice Burns a DPP on the source chain after successful cross-chain transfer.
   * @param uniqueDescriptor The DPP token ID to burn.
   * @return success         True if the operation succeeds.
   */
  function burn(uint256 uniqueDescriptor) external returns (bool);

  /**
   * @notice Assigns a bridged DPP to the final receiver after minting.
   * @param to               The final receiver address.
   * @param uniqueDescriptor The DPP token ID.
   * @return success         True if the operation succeeds.
   */
  function assign(address to, uint256 uniqueDescriptor) external returns (bool);

  /**
   * @notice Grants BRIDGE_ROLE to an address so it can call bridge functions.
   * @param account The address to grant the role to.
   * @return success True if the operation succeeds.
   */
  function grantBridgeRole(address account) external returns (bool);

  /**
   * @notice Checks whether an address holds the BRIDGE_ROLE.
   * @dev Reverts with `noPermission` if the address does not have the role.
   * @param account The address to check.
   * @return hasRole True if the address has BRIDGE_ROLE.
   */
  function hasBridgeRole(address account) external view returns (bool);

  /**
   * @notice ERC-721 receiver callback so the contract can hold NFTs during bridge custody.
   * @return selector The `onERC721Received` function selector.
   */
  function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4);
}
