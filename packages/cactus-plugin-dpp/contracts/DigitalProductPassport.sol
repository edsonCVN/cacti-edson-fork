// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "./IDigitalProductPassport.sol";

contract DigitalProductPassport is
  ERC721,
  AccessControl,
  IDigitalProductPassport
{
  uint256 private _nextTokenId;

  // --- Role Definitions ---
  bytes32 public constant GATEWAY_ROLE = keccak256("GATEWAY_ROLE");
  bytes32 public constant FARMER_ROLE = keccak256("FARMER_ROLE");
  bytes32 public constant PROCESSOR_ROLE = keccak256("PROCESSOR_ROLE");
  bytes32 public constant TRANSPORTER_ROLE = keccak256("TRANSPORTER_ROLE");
  bytes32 public constant RETAILER_ROLE = keccak256("RETAILER_ROLE");

  mapping(uint256 => DPPData) private _dppData;
  mapping(uint256 => TransportEvent[]) private _transportHistory;
  mapping(uint256 => string[]) private _certifications;
  mapping(uint256 => uint256[]) private _dppComponents;
  mapping(uint256 => string[]) private _history; // A textual log for demo purposes

  constructor(address initialAdmin) ERC721("DigitalProductPassport", "DPP") {
    _grantRole(DEFAULT_ADMIN_ROLE, initialAdmin);
    _grantRole(GATEWAY_ROLE, initialAdmin);
    // Explicitly grant the deployer the supply chain roles for testing/e2e fluidity
    _grantRole(FARMER_ROLE, initialAdmin);
    _grantRole(PROCESSOR_ROLE, initialAdmin);
    _grantRole(TRANSPORTER_ROLE, initialAdmin);
    _grantRole(RETAILER_ROLE, initialAdmin);
  }

  /**
   * @dev See {IERC165-supportsInterface}.
   */
  function supportsInterface(
    bytes4 interfaceId
  ) public view virtual override(ERC721, AccessControl) returns (bool) {
    return super.supportsInterface(interfaceId);
  }

  function _addToHistory(
    uint256 tokenId,
    string memory eventType,
    address actor
  ) internal {
    // Store as JSON so the frontend can parse event name, actor and timestamp
    string memory entry = string(
      abi.encodePacked(
        '{"event":"', eventType,
        '","actor":"', Strings.toHexString(uint160(actor), 20),
        '","timestamp":', Strings.toString(block.timestamp),
        '}'
      )
    );
    _history[tokenId].push(entry);
  }

  function createDPP(
    address to,
    string memory productName,
    string memory creationDate,
    string memory metadataURI
  ) public onlyRole(FARMER_ROLE) returns (uint256) {
    uint256 tokenId = _nextTokenId++;
    string memory generatedProductId = string(
      abi.encodePacked("PROD-", Strings.toString(tokenId))
    );

    _dppData[tokenId] = DPPData({
      productId: generatedProductId,
      productName: productName,
      state: DPPState.CREATED,
      creationDate: creationDate,
      additionalMetadataURI: metadataURI
    });

    _addToHistory(tokenId, "Mint", msg.sender);

    // Checks-Effects-Interactions: Mint at the end to prevent reentrancy issues via onERC721Received
    _safeMint(to, tokenId);
    return tokenId;
  }

  function _isAuthorized(uint256 tokenId) internal view returns (bool) {
    return ownerOf(tokenId) == msg.sender || hasRole(GATEWAY_ROLE, msg.sender);
  }

  function amendDPPData(
    uint256 tokenId,
    string memory newMetadataURI
  ) public onlyRole(PROCESSOR_ROLE) {
    require(_ownerOf(tokenId) != address(0), "ERC721: invalid token ID");
    require(_isAuthorized(tokenId), "Caller is not owner nor gateway");

    _dppData[tokenId].additionalMetadataURI = newMetadataURI;
    _addToHistory(tokenId, "Amend", msg.sender);
  }

  function addCertification(uint256 tokenId, string memory certId) public {
    require(_ownerOf(tokenId) != address(0), "ERC721: invalid token ID");
    require(
      _isAuthorized(tokenId) || hasRole(PROCESSOR_ROLE, msg.sender),
      "Caller not authorized"
    );

    _certifications[tokenId].push(certId);
    _addToHistory(tokenId, "Certification", msg.sender);
  }

  function updateTransportData(
    uint256 tokenId,
    string memory location,
    string memory timestamp,
    string memory conditionData
  ) public onlyRole(TRANSPORTER_ROLE) {
    require(_ownerOf(tokenId) != address(0), "ERC721: invalid token ID");

    _dppData[tokenId].state = DPPState.IN_TRANSIT;
    _transportHistory[tokenId].push(
      TransportEvent(location, timestamp, conditionData)
    );
    _addToHistory(tokenId, "Transport", msg.sender);
  }

  function markAsReceived(uint256 tokenId) public onlyRole(RETAILER_ROLE) {
    require(_ownerOf(tokenId) != address(0), "ERC721: invalid token ID");

    _dppData[tokenId].state = DPPState.RECEIVED;
    _addToHistory(tokenId, "Received", msg.sender);
  }

  function updateRetailData(
    uint256 tokenId,
    string memory location,
    string memory arrivalDate,
    string memory shelfLife
  ) public onlyRole(RETAILER_ROLE) {
    require(_ownerOf(tokenId) != address(0), "ERC721: invalid token ID");

    _dppData[tokenId].state = DPPState.RETAIL;
    _addToHistory(tokenId, "Retail", msg.sender);
  }

  function aggregateDPPs(
    address to,
    string memory productName,
    string memory metadataURI,
    uint256[] memory childTokenIds
  ) public onlyRole(PROCESSOR_ROLE) returns (uint256) {
    uint256 parentTokenId = _nextTokenId++;

    string memory generatedProductId = string(
      abi.encodePacked("LOT-", Strings.toString(parentTokenId))
    );

    _dppData[parentTokenId] = DPPData({
      productId: generatedProductId,
      productName: productName,
      state: DPPState.CREATED,
      creationDate: "",
      additionalMetadataURI: metadataURI
    });

    for (uint i = 0; i < childTokenIds.length; i++) {
      uint256 childId = childTokenIds[i];
      require(
        _ownerOf(childId) != address(0),
        "ERC721: child token ID does not exist"
      );
      require(
        _isAuthorized(childId),
        "Caller is not child owner nor gateway"
      );

      // Store child reference
      _dppComponents[parentTokenId].push(childId);

      // Burn child DPP — it ceases to exist
      // History + certifications merge is done off-chain by the backend
      // (on-chain copy would exceed contract size limit)
      _dppData[childId].state = DPPState.REVOKED;
      _addToHistory(childId, "Consumed", msg.sender);
      _burn(childId);
    }

    _addToHistory(parentTokenId, "Aggregate", msg.sender);

    // Checks-Effects-Interactions
    _safeMint(to, parentTokenId);
    return parentTokenId;
  }

  /**
   * @dev Transfer a DPP to a new owner AND record the event in history.
   *      Use this instead of bare safeTransferFrom so the audit trail is complete.
   */
  function transferDPP(uint256 tokenId, address newOwner) public {
    require(_ownerOf(tokenId) != address(0), "ERC721: invalid token ID");
    require(ownerOf(tokenId) == msg.sender || hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Caller is not owner nor admin");
    require(newOwner != address(0), "Cannot transfer to zero address");

    address from = ownerOf(tokenId);
    _addToHistory(tokenId, "Transfer", msg.sender);

    // Checks-Effects-Interactions: transfer at the end
    _transfer(from, newOwner, tokenId);
  }

  function revokeDPP(uint256 tokenId, string memory reason) public {
    require(_ownerOf(tokenId) != address(0), "ERC721: invalid token ID");
    require(_isAuthorized(tokenId), "Caller is not owner nor gateway");

    _dppData[tokenId].state = DPPState.REVOKED;
    _addToHistory(tokenId, "Revoke", msg.sender);
  }

  // View functions for the getters

  function getDPPData(uint256 tokenId) public view returns (DPPData memory) {
    require(_ownerOf(tokenId) != address(0), "ERC721: invalid token ID");
    return _dppData[tokenId];
  }

  function getTransportHistory(
    uint256 tokenId
  ) public view returns (TransportEvent[] memory) {
    require(_ownerOf(tokenId) != address(0), "ERC721: invalid token ID");
    return _transportHistory[tokenId];
  }

  function getCertifications(
    uint256 tokenId
  ) public view returns (string[] memory) {
    return _certifications[tokenId];
  }

  function getDPPComponents(
    uint256 tokenId
  ) public view returns (uint256[] memory) {
    return _dppComponents[tokenId];
  }

  function getHistory(uint256 tokenId) public view returns (string[] memory) {
    return _history[tokenId];
  }

  // --- Cross-Chain SATP Methods ---

  // A mechanism to lock the asset during SATP Phase 1/Phase 2
  function lockDPP(uint256 tokenId) public {
    require(_ownerOf(tokenId) != address(0), "ERC721: invalid token ID");
    require(_isAuthorized(tokenId), "Caller is not owner nor gateway");
    require(
      _dppData[tokenId].state != DPPState.LOCKED_CROSSCHAIN,
      "DPP is already locked"
    );

    _dppData[tokenId].state = DPPState.LOCKED_CROSSCHAIN;
    _addToHistory(tokenId, "Lock", msg.sender);
  }

  // A mechanism to rollback an asset if SATP fails
  function unlockDPP(uint256 tokenId) public {
    require(_ownerOf(tokenId) != address(0), "ERC721: invalid token ID");
    require(_isAuthorized(tokenId), "Caller is not owner nor gateway");
    require(
      _dppData[tokenId].state == DPPState.LOCKED_CROSSCHAIN,
      "DPP is not locked"
    );

    _dppData[tokenId].state = DPPState.CREATED; // Reset to a safe state
    _addToHistory(tokenId, "Unlock", msg.sender);
  }

  // Burn the asset locally during Commit Final Phase (Phase 3)
  function burnCrossChain(uint256 tokenId) public {
    require(_ownerOf(tokenId) != address(0), "ERC721: invalid token ID");
    require(_isAuthorized(tokenId), "Caller is not owner nor gateway");
    require(
      _dppData[tokenId].state == DPPState.LOCKED_CROSSCHAIN,
      "DPP must be locked first"
    );

    _burn(tokenId);
    _dppData[tokenId].state = DPPState.REVOKED; // Assuming Burned means Revoked locally
    _addToHistory(tokenId, "CrossChainBurn", msg.sender);
  }

  // Mint the asset on the destination ledger
  function mintCrossChain(
    address to,
    string memory productId,
    string memory productName,
    string memory creationDate,
    string memory metadataURI
  ) public onlyRole(GATEWAY_ROLE) returns (uint256) {
    uint256 tokenId = _nextTokenId++;

    _dppData[tokenId] = DPPData({
      productId: productId,
      productName: productName,
      state: DPPState.CREATED,
      creationDate: creationDate,
      additionalMetadataURI: metadataURI
    });

    _addToHistory(tokenId, "CrossChainMint", msg.sender);

    // Checks-Effects-Interactions
    _safeMint(to, tokenId);
    return tokenId;
  }
}
