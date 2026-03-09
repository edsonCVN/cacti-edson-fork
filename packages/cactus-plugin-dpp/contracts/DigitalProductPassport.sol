// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./IDigitalProductPassport.sol";

contract DigitalProductPassport is ERC721, Ownable, IDigitalProductPassport {
  uint256 private _nextTokenId;

  mapping(uint256 => DPPData) private _dppData;
  mapping(uint256 => TransportEvent[]) private _transportHistory;
  mapping(uint256 => string[]) private _certifications;
  mapping(uint256 => uint256[]) private _dppComponents;
  mapping(uint256 => string[]) private _history; // A textual log for demo purposes

  constructor(
    address initialOwner
  ) ERC721("DigitalProductPassport", "DPP") Ownable(initialOwner) {}

  function _addToHistory(
    uint256 tokenId,
    string memory eventDescription
  ) internal {
    _history[tokenId].push(eventDescription);
  }

  function createDPP(
    address to,
    string memory productId,
    string memory productName,
    string memory creationDate,
    string memory metadataURI
  ) public returns (uint256) {
    uint256 tokenId = _nextTokenId++;

    _dppData[tokenId] = DPPData({
      productId: productId,
      productName: productName,
      state: DPPState.CREATED,
      creationDate: creationDate,
      additionalMetadataURI: metadataURI
    });

    _addToHistory(tokenId, "DPP Created");

    // Checks-Effects-Interactions: Mint at the end to prevent reentrancy issues via onERC721Received
    _safeMint(to, tokenId);
    return tokenId;
  }

  function _isAuthorized(uint256 tokenId) internal view returns (bool) {
    return ownerOf(tokenId) == msg.sender || owner() == msg.sender;
  }

  function amendDPPData(uint256 tokenId, string memory newMetadataURI) public {
    require(_ownerOf(tokenId) != address(0), "ERC721: invalid token ID");
    require(_isAuthorized(tokenId), "Caller is not owner nor gateway");

    _dppData[tokenId].additionalMetadataURI = newMetadataURI;
    _addToHistory(tokenId, "DPP Data Amended");
  }

  function addCertification(uint256 tokenId, string memory certId) public {
    require(_ownerOf(tokenId) != address(0), "ERC721: invalid token ID");
    require(_isAuthorized(tokenId), "Caller is not owner nor gateway");

    _certifications[tokenId].push(certId);
    _addToHistory(tokenId, "Certification Added");
  }

  function updateTransportData(
    uint256 tokenId,
    string memory location,
    string memory timestamp,
    string memory conditionData
  ) public {
    require(_ownerOf(tokenId) != address(0), "ERC721: invalid token ID");
    require(_isAuthorized(tokenId), "Caller is not owner nor gateway");

    _dppData[tokenId].state = DPPState.IN_TRANSIT;
    _transportHistory[tokenId].push(
      TransportEvent(location, timestamp, conditionData)
    );
    _addToHistory(tokenId, "Transport Data Updated");
  }

  function markAsReceived(uint256 tokenId) public {
    require(_ownerOf(tokenId) != address(0), "ERC721: invalid token ID");
    require(_isAuthorized(tokenId), "Caller is not owner nor gateway");

    _dppData[tokenId].state = DPPState.RECEIVED;
    _addToHistory(tokenId, "Marked as Received");
  }

  function updateRetailData(
    uint256 tokenId,
    string memory location,
    string memory arrivalDate,
    string memory shelfLife
  ) public {
    require(_ownerOf(tokenId) != address(0), "ERC721: invalid token ID");
    require(_isAuthorized(tokenId), "Caller is not owner nor gateway");

    _dppData[tokenId].state = DPPState.RETAIL;
    _addToHistory(tokenId, "Retail Data Updated");
  }

  function aggregateDPPs(
    address to,
    string memory parentProductId,
    string memory metadataURI,
    uint256[] memory childTokenIds
  ) public returns (uint256) {
    uint256 parentTokenId = _nextTokenId++;

    _dppData[parentTokenId] = DPPData({
      productId: parentProductId,
      productName: "Aggregated Box/Lot",
      state: DPPState.CREATED,
      creationDate: "",
      additionalMetadataURI: metadataURI
    });

    for (uint i = 0; i < childTokenIds.length; i++) {
      require(
        _ownerOf(childTokenIds[i]) != address(0),
        "ERC721: child token ID does not exist"
      );
      require(
        _isAuthorized(childTokenIds[i]),
        "Caller is not child owner nor gateway"
      );
      _dppComponents[parentTokenId].push(childTokenIds[i]);
    }

    _addToHistory(parentTokenId, "DPP Aggregated");

    // Checks-Effects-Interactions
    _safeMint(to, parentTokenId);
    return parentTokenId;
  }

  function revokeDPP(uint256 tokenId, string memory reason) public {
    require(_ownerOf(tokenId) != address(0), "ERC721: invalid token ID");
    require(_isAuthorized(tokenId), "Caller is not owner nor gateway");

    _dppData[tokenId].state = DPPState.REVOKED;
    _addToHistory(tokenId, string(abi.encodePacked("Revoked: ", reason)));
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
    require(_ownerOf(tokenId) != address(0), "ERC721: invalid token ID");
    return _certifications[tokenId];
  }

  function getDPPComponents(
    uint256 tokenId
  ) public view returns (uint256[] memory) {
    require(_ownerOf(tokenId) != address(0), "ERC721: invalid token ID");
    return _dppComponents[tokenId];
  }

  function getHistory(uint256 tokenId) public view returns (string[] memory) {
    require(_ownerOf(tokenId) != address(0), "ERC721: invalid token ID");
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
    _addToHistory(tokenId, "Locked for Cross-Chain Transfer");
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
    _addToHistory(tokenId, "Unlocked from Cross-Chain Transfer (Rollback)");
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
    _addToHistory(tokenId, "Burned for Cross-Chain Transfer");
  }

  // Mint the asset on the destination ledger
  function mintCrossChain(
    address to,
    string memory productId,
    string memory productName,
    string memory creationDate,
    string memory metadataURI
  ) public returns (uint256) {
    // Restricting to contract owner (Gateway/Escrow)
    require(owner() == msg.sender, "Caller is not Gateway Executable");

    uint256 tokenId = _nextTokenId++;

    _dppData[tokenId] = DPPData({
      productId: productId,
      productName: productName,
      state: DPPState.CREATED,
      creationDate: creationDate,
      additionalMetadataURI: metadataURI
    });

    _addToHistory(tokenId, "Minted via Cross-Chain Transfer");

    // Checks-Effects-Interactions
    _safeMint(to, tokenId);
    return tokenId;
  }
}
