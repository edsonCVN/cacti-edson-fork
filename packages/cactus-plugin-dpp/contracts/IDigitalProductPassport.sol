// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IDigitalProductPassport
 * @dev Interface for the Digital Product Passport (DPP) Smart Contract.
 * It outlines the data structures and external methods required for managing the lifecycle
 * of a DPP, including its aggregation, status updates, and SATP cross-chain operations.
 */
interface IDigitalProductPassport {
  enum DPPState {
    CREATED,
    IN_TRANSIT,
    RECEIVED,
    RETAIL,
    REVOKED,
    LOCKED_CROSSCHAIN
  }

  struct DPPData {
    string productId;
    string productName;
    DPPState state;
    string creationDate;
    string additionalMetadataURI;
  }

  struct TransportEvent {
    string location;
    string timestamp;
    string conditionData;
  }

  // --- Core Lifecycle ---

  function createDPP(
    address to,
    string memory productName,
    string memory creationDate,
    string memory metadataURI
  ) external returns (uint256);

  function amendDPPData(uint256 tokenId, string memory newMetadataURI) external;

  function addCertification(uint256 tokenId, string memory certId) external;

  function updateTransportData(
    uint256 tokenId,
    string memory location,
    string memory timestamp,
    string memory conditionData
  ) external;

  function markAsReceived(uint256 tokenId) external;

  function updateRetailData(
    uint256 tokenId,
    string memory location,
    string memory arrivalDate,
    string memory shelfLife
  ) external;

  function aggregateDPPs(
    address to,
    string memory parentProductId,
    string memory metadataURI,
    uint256[] memory childTokenIds
  ) external returns (uint256);

  function revokeDPP(uint256 tokenId, string memory reason) external;

  // --- View Methods ---

  function getDPPData(uint256 tokenId) external view returns (DPPData memory);

  function getTransportHistory(
    uint256 tokenId
  ) external view returns (TransportEvent[] memory);

  function getCertifications(
    uint256 tokenId
  ) external view returns (string[] memory);

  function getDPPComponents(
    uint256 tokenId
  ) external view returns (uint256[] memory);

  function getHistory(uint256 tokenId) external view returns (string[] memory);

  // --- SATP Bridge-Compatible Methods ---

  function lock(address from, address to, uint256 uniqueDescriptor) external returns (bool);
  function unlock(address from, address to, uint256 uniqueDescriptor) external returns (bool);
  function mint(address account, uint256 uniqueDescriptor) external returns (bool);
  function burn(uint256 uniqueDescriptor) external returns (bool);
  function assign(address to, uint256 uniqueDescriptor) external returns (bool);
  function grantBridgeRole(address account) external returns (bool);
  function hasBridgeRole(address account) external view returns (bool);
  function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4);
}
