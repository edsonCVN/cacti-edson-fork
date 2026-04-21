// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "./IDigitalProductPassport.sol";

/// @notice Thrown when an address lacks the required permission.
error noPermission(address adr);

/**
 * @title DigitalProductPassport
 * @notice ERC-721 token representing a Digital Product Passport (DPP) with
 *         role-based supply-chain lifecycle management and SATP cross-chain
 *         bridge compatibility.
 * @dev Inherits OpenZeppelin ERC721 + AccessControl. Every state-changing
 *      operation emits both a Solidity event (for off-chain indexers) and
 *      appends a JSON entry to the on-chain `_history` array (for convenient
 *      querying without an indexer).
 */
contract DigitalProductPassport is
  ERC721,
  AccessControl,
  IDigitalProductPassport
{
  /// @dev Auto-incrementing counter for token IDs.
  uint256 private _nextTokenId;

  // ============================================================
  //  Role Definitions
  // ============================================================

  bytes32 public constant GATEWAY_ROLE = keccak256("GATEWAY_ROLE");
  bytes32 public constant OWNER_ROLE = keccak256("OWNER_ROLE");
  bytes32 public constant BRIDGE_ROLE = keccak256("BRIDGE_ROLE");
  bytes32 public constant FARMER_ROLE = keccak256("FARMER_ROLE");
  bytes32 public constant PROCESSOR_ROLE = keccak256("PROCESSOR_ROLE");
  bytes32 public constant TRANSPORTER_ROLE = keccak256("TRANSPORTER_ROLE");
  bytes32 public constant RETAILER_ROLE = keccak256("RETAILER_ROLE");

  // ============================================================
  //  Storage
  // ============================================================

  /// @dev Core metadata for each DPP token.
  mapping(uint256 => DPPData) private _dppData;
  /// @dev Ordered list of transport legs per token.
  mapping(uint256 => TransportEvent[]) private _transportHistory;
  /// @dev Certification IDs attached to each token.
  mapping(uint256 => string[]) private _certifications;
  /// @dev Child token IDs that compose an aggregated (parent) DPP.
  mapping(uint256 => uint256[]) private _dppComponents;
  /// @dev JSON-encoded history log per token (queryable without an indexer).
  mapping(uint256 => string[]) private _history;

  // Pre-lock state saved by lock() so that unlock() can restore the exact
  // state the DPP was in before the cross-chain transfer was initiated,
  // rather than unconditionally defaulting to CREATED.
  mapping(uint256 => DPPState) private _preLockState;

  // ============================================================
  //  Constructor
  // ============================================================

  /**
   * @notice Deploys the contract and grants all roles to `initialAdmin`.
   * @dev All supply-chain roles are granted to the deployer to simplify
   *      local testing and e2e flows. In production the admin should
   *      revoke unnecessary roles after setup.
   * @param initialAdmin Address that receives DEFAULT_ADMIN_ROLE and all
   *                     supply-chain roles.
   */
  constructor(address initialAdmin) ERC721("DigitalProductPassport", "DPP") {
    _grantRole(DEFAULT_ADMIN_ROLE, initialAdmin);
    _grantRole(OWNER_ROLE, initialAdmin);
    _grantRole(GATEWAY_ROLE, initialAdmin);
    _grantRole(FARMER_ROLE, initialAdmin);
    _grantRole(PROCESSOR_ROLE, initialAdmin);
    _grantRole(TRANSPORTER_ROLE, initialAdmin);
    _grantRole(RETAILER_ROLE, initialAdmin);
  }

  // ============================================================
  //  ERC-165
  // ============================================================

  /// @inheritdoc ERC721
  function supportsInterface(
    bytes4 interfaceId
  ) public view virtual override(ERC721, AccessControl) returns (bool) {
    return super.supportsInterface(interfaceId);
  }

  // ============================================================
  //  Internal Helpers
  // ============================================================

  /**
   * @dev Appends a JSON-encoded history entry for `tokenId`.
   *      Format: {"event":"<type>","actor":"<addr>","timestamp":<unix>}
   * @param tokenId   The DPP token to log against.
   * @param eventType Short label identifying the event (e.g. "Mint", "Transfer").
   * @param actor     The address that triggered the event.
   */
  function _addToHistory(
    uint256 tokenId,
    string memory eventType,
    address actor
  ) internal {
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

  /**
   * @dev Returns true if `msg.sender` is the token owner or holds GATEWAY_ROLE.
   * @param tokenId The token to check authorization for.
   */
  function _isAuthorized(uint256 tokenId) internal view returns (bool) {
    return ownerOf(tokenId) == msg.sender || hasRole(GATEWAY_ROLE, msg.sender);
  }

  /**
   * @dev Reverts if the DPP is in REVOKED state. A revoked DPP is read-only
   *      and no further operations (transfer, amend, certify, etc.) are allowed.
   * @param tokenId The DPP token to check.
   */
  modifier notRevoked(uint256 tokenId) {
    require(_dppData[tokenId].state != DPPState.REVOKED, "DPP is revoked");
    _;
  }

  // ============================================================
  //  Core Lifecycle
  // ============================================================

  /**
   * @notice Mints a new DPP token and assigns it to `to`.
   * @dev Only callable by addresses with FARMER_ROLE. Follows the
   *      Checks-Effects-Interactions pattern - `_safeMint` is called last
   *      to prevent reentrancy via `onERC721Received`.
   * @param to           The address that will own the newly minted token.
   * @param productName  Human-readable product name stored on-chain.
   * @param creationDate ISO-8601 date string for the product origin.
   * @param metadataURI  Off-chain metadata URI (IPFS CID or JSON string).
   * @return tokenId     The ID of the newly minted DPP token.
   */
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
    emit DPPCreated(tokenId, to, productName, creationDate);

    _safeMint(to, tokenId);
    return tokenId;
  }

  /**
   * @notice Updates the metadata URI of an existing DPP.
   * @dev Callable by PROCESSOR, TRANSPORTER, RETAILER, or GATEWAY roles.
   * @param tokenId        The DPP token to amend.
   * @param newMetadataURI The new metadata URI value.
   */
  function amendDPPData(
    uint256 tokenId,
    string memory newMetadataURI
  ) public notRevoked(tokenId) {
    require(_ownerOf(tokenId) != address(0), "ERC721: invalid token ID");
    require(
      hasRole(PROCESSOR_ROLE, msg.sender) ||
      hasRole(TRANSPORTER_ROLE, msg.sender) ||
      hasRole(RETAILER_ROLE, msg.sender) ||
      hasRole(GATEWAY_ROLE, msg.sender),
      "Caller lacks amend permission"
    );

    _dppData[tokenId].additionalMetadataURI = newMetadataURI;
    _addToHistory(tokenId, "Amend", msg.sender);
    emit DPPAmended(tokenId, msg.sender, newMetadataURI);
  }

  /**
   * @notice Attaches a certification identifier to a DPP.
   * @dev Callable by the token owner, GATEWAY, or PROCESSOR roles.
   * @param tokenId The DPP token to certify.
   * @param certId  A unique certification identifier string.
   */
  function addCertification(uint256 tokenId, string memory certId) public notRevoked(tokenId) {
    require(_ownerOf(tokenId) != address(0), "ERC721: invalid token ID");
    require(
      _isAuthorized(tokenId) || hasRole(PROCESSOR_ROLE, msg.sender),
      "Caller not authorized"
    );

    _certifications[tokenId].push(certId);
    _addToHistory(tokenId, "Certification", msg.sender);
    emit CertificationAdded(tokenId, msg.sender, certId);
  }

  /**
   * @notice Records a transport leg and sets the DPP state to IN_TRANSIT.
   * @dev Only callable by addresses with TRANSPORTER_ROLE.
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
  ) public onlyRole(TRANSPORTER_ROLE) notRevoked(tokenId) {
    require(_ownerOf(tokenId) != address(0), "ERC721: invalid token ID");

    _dppData[tokenId].state = DPPState.IN_TRANSIT;
    _transportHistory[tokenId].push(
      TransportEvent(locationFrom, locationTo, timestamp, conditionData)
    );
    _addToHistory(tokenId, "Transport", msg.sender);
    emit TransportUpdated(tokenId, msg.sender, locationFrom, locationTo);
  }

  /**
   * @notice Marks a DPP as received by the retailer (state -> RECEIVED).
   * @dev Only callable by addresses with RETAILER_ROLE.
   * @param tokenId The DPP token to mark as received.
   */
  function markAsReceived(uint256 tokenId) public onlyRole(RETAILER_ROLE) notRevoked(tokenId) {
    require(_ownerOf(tokenId) != address(0), "ERC721: invalid token ID");

    _dppData[tokenId].state = DPPState.RECEIVED;
    _addToHistory(tokenId, "Received", msg.sender);
    emit MarkedAsReceived(tokenId, msg.sender);
  }

  /**
   * @notice Records retail-specific data and sets the DPP state to RETAIL.
   * @dev Only callable by addresses with RETAILER_ROLE. Shelf-life and
   *      price are persisted off-chain via `amendDPPData` by the backend.
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
  ) public onlyRole(RETAILER_ROLE) notRevoked(tokenId) {
    require(_ownerOf(tokenId) != address(0), "ERC721: invalid token ID");

    _dppData[tokenId].state = DPPState.RETAIL;
    _addToHistory(tokenId, "Retail", msg.sender);
    emit RetailDataUpdated(tokenId, msg.sender);
  }

  /**
   * @notice Aggregates multiple child DPPs into a new parent DPP.
   * @dev Burns each child token after recording it as a component of the
   *      parent. History and certification merging is handled off-chain by
   *      the backend (on-chain copy would exceed contract size limits).
   *      Only callable by addresses with PROCESSOR_ROLE.
   * @param to             Address that will own the new parent token.
   * @param productName    Human-readable name for the aggregated product.
   * @param metadataURI    Off-chain metadata URI for the parent.
   * @param childTokenIds  Array of child DPP token IDs to consume.
   * @return parentTokenId The ID of the newly created parent DPP.
   */
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
        _dppData[childId].state != DPPState.REVOKED,
        "DPP is revoked"
      );
      require(
        _isAuthorized(childId),
        "Caller is not child owner nor gateway"
      );

      _dppComponents[parentTokenId].push(childId);
      _dppData[childId].state = DPPState.REVOKED;
      _addToHistory(childId, "Consumed", msg.sender);
      _burn(childId);
    }

    _addToHistory(parentTokenId, "Aggregate", msg.sender);
    emit DPPAggregated(parentTokenId, msg.sender, childTokenIds);

    _safeMint(to, parentTokenId);
    return parentTokenId;
  }

  /**
   * @notice Splits a DPP into `count` new independent DPPs that inherit the
   *         original's metadata. The original is revoked (read-only).
   * @dev Only callable by DEFAULT_ADMIN_ROLE, FARMER_ROLE, or PROCESSOR_ROLE.
   *      Each new token stores a lightweight "split-from:<originId>" reference
   *      instead of duplicating the full metadata - the backend resolves the
   *      origin's data, certifications, and history transparently.
   * @param tokenId     The DPP token to disaggregate.
   * @param to          Address that will own all newly created tokens.
   * @param count       Number of new DPP tokens to create (must be >= 2).
   * @return newTokenIds Array of the newly minted token IDs.
   */
  function disaggregateDPP(
    uint256 tokenId,
    address to,
    uint256 count
  ) public notRevoked(tokenId) returns (uint256[] memory) {
    require(_ownerOf(tokenId) != address(0), "ERC721: invalid token ID");
    require(count >= 2, "Count must be at least 2");
    require(
      hasRole(DEFAULT_ADMIN_ROLE, msg.sender) ||
      hasRole(FARMER_ROLE, msg.sender) ||
      hasRole(PROCESSOR_ROLE, msg.sender),
      "Caller lacks disaggregate permission"
    );

    DPPData storage origin = _dppData[tokenId];

    // Build a lightweight metadata reference instead of duplicating the
    // full JSON blob for every child - the backend resolves the original
    // metadata via the origin token ID embedded in the reference string.
    string memory metadataRef = string(
      abi.encodePacked("split-from:", Strings.toString(tokenId))
    );

    uint256[] memory newTokenIds = new uint256[](count);

    for (uint256 i = 0; i < count; i++) {
      uint256 newId = _nextTokenId++;
      newTokenIds[i] = newId;

      _dppData[newId] = DPPData({
        productId: string(abi.encodePacked("SPLIT-", Strings.toString(newId))),
        productName: origin.productName,
        state: DPPState.CREATED,
        creationDate: origin.creationDate,
        additionalMetadataURI: metadataRef
      });

      _addToHistory(newId, "Disaggregate", msg.sender);
      _safeMint(to, newId);
    }

    // Revoke the origin DPP (keep it on-chain so children can resolve
    // their "split-from:" metadata reference via getDPPData).
    _dppData[tokenId].state = DPPState.REVOKED;
    _addToHistory(tokenId, "Disaggregated", msg.sender);
    emit DPPDisaggregated(tokenId, msg.sender, newTokenIds);

    return newTokenIds;
  }

  /**
   * @notice Transfers a DPP to a new owner with full audit-trail recording.
   * @dev Prefer this over bare `safeTransferFrom` so the history log and
   *      event are emitted. Callable by the token owner or DEFAULT_ADMIN_ROLE.
   * @param tokenId  The DPP token to transfer.
   * @param newOwner The address to transfer ownership to.
   */
  function transferDPP(uint256 tokenId, address newOwner) public notRevoked(tokenId) {
    require(_ownerOf(tokenId) != address(0), "ERC721: invalid token ID");
    require(ownerOf(tokenId) == msg.sender || hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Caller is not owner nor admin");
    require(newOwner != address(0), "Cannot transfer to zero address");

    address from = ownerOf(tokenId);
    _addToHistory(tokenId, "Transfer", msg.sender);
    emit DPPTransferred(tokenId, from, newOwner);

    _transfer(from, newOwner, tokenId);
  }

  /**
   * @notice Revokes a DPP, marking it as no longer valid.
   * @dev Callable by the token owner or GATEWAY_ROLE.
   * @param tokenId The DPP token to revoke.
   * @param reason  Human-readable reason for revocation.
   */
  function revokeDPP(uint256 tokenId, string memory reason) public {
    require(_ownerOf(tokenId) != address(0), "ERC721: invalid token ID");
    require(_isAuthorized(tokenId), "Caller is not owner nor gateway");

    _dppData[tokenId].state = DPPState.REVOKED;
    _addToHistory(tokenId, "Revoke", msg.sender);
    emit DPPRevoked(tokenId, msg.sender, reason);
  }

  /**
   * @notice Imports full DPP data on the destination chain after a SATP
   *         cross-chain transfer. The SATP `mint()` creates only an empty
   *         token shell - this function populates the real product name,
   *         creation date, metadata URI, certifications, and source-chain
   *         history, turning the shell into a fully functional DPP.
   *         The lifecycle state is assigned based on the recipient's role:
   *           FARMER_ROLE     -> CREATED
   *           PROCESSOR_ROLE  -> CREATED
   *           TRANSPORTER_ROLE-> IN_TRANSIT
   *           RETAILER_ROLE   -> RECEIVED
   *           (fallback)      -> CREATED
   *         When the recipient holds multiple roles, the first match in the
   *         above order is used.
   * @dev Only callable by DEFAULT_ADMIN_ROLE or GATEWAY_ROLE.
   * @param tokenId       The DPP token to populate.
   * @param productName   Original product name from the source chain.
   * @param creationDate  Original ISO-8601 creation date.
   * @param metadataURI   Original additionalMetadataURI (JSON blob or IPFS CID).
   * @param certs         Array of certification strings to import.
   * @param historyEntries Array of raw JSON history entries from the source chain.
   */
  function importCrossChainData(
    uint256 tokenId,
    string memory productName,
    string memory creationDate,
    string memory metadataURI,
    string[] memory certs,
    string[] memory historyEntries
  ) public {
    require(_ownerOf(tokenId) != address(0), "ERC721: invalid token ID");
    require(
      hasRole(DEFAULT_ADMIN_ROLE, msg.sender) || hasRole(GATEWAY_ROLE, msg.sender),
      "Caller lacks import permission"
    );

    _dppData[tokenId].productName = productName;
    _dppData[tokenId].creationDate = creationDate;
    _dppData[tokenId].additionalMetadataURI = metadataURI;

    // Derive the lifecycle state from the recipient's role (first match wins)
    address recipient = _ownerOf(tokenId);
    if (hasRole(FARMER_ROLE, recipient)) {
      _dppData[tokenId].state = DPPState.CREATED;
    } else if (hasRole(PROCESSOR_ROLE, recipient)) {
      _dppData[tokenId].state = DPPState.CREATED;
    } else if (hasRole(TRANSPORTER_ROLE, recipient)) {
      _dppData[tokenId].state = DPPState.IN_TRANSIT;
    } else if (hasRole(RETAILER_ROLE, recipient)) {
      _dppData[tokenId].state = DPPState.RECEIVED;
    } else {
      _dppData[tokenId].state = DPPState.CREATED;
    }

    // Clear certifications added by previous imports to avoid duplicates
    delete _certifications[tokenId];
    for (uint i = 0; i < certs.length; i++) {
      _certifications[tokenId].push(certs[i]);
    }

    // Clear existing history (removes the placeholder SATPMint event and any
    // stale entries from previous cross-chain round-trips) before importing
    // the authoritative source-chain history.
    delete _history[tokenId];
    for (uint i = 0; i < historyEntries.length; i++) {
      _history[tokenId].push(historyEntries[i]);
    }

    // Record the cross-chain import event itself
    _addToHistory(tokenId, "CrossChainImport", msg.sender);
  }

  // ============================================================
  //  View Methods
  // ============================================================

  /**
   * @notice Returns the core on-chain data for a DPP.
   * @param tokenId The DPP token to query.
   * @return data   The DPPData struct for the given token.
   */
  function getDPPData(uint256 tokenId) public view returns (DPPData memory) {
    require(_ownerOf(tokenId) != address(0), "ERC721: invalid token ID");
    return _dppData[tokenId];
  }

  /**
   * @notice Returns the core on-chain data for a DPP including burned/revoked
   *         tokens.  Unlike `getDPPData`, this does NOT revert for tokens whose
   *         ownership has been cleared (e.g. burned via SATP or aggregation).
   *         The `_dppData` mapping persists even after burn.
   * @dev    Used by the audit endpoint to reconstruct the full lifecycle of
   *         every token that ever existed on the chain.
   * @param tokenId The DPP token to query.
   * @return data   The DPPData struct (may have empty fields for never-minted IDs).
   */
  function getDPPDataUnchecked(uint256 tokenId) public view returns (DPPData memory) {
    return _dppData[tokenId];
  }

  /**
   * @notice Returns the full transport history for a DPP.
   * @param tokenId The DPP token to query.
   * @return events Array of TransportEvent structs.
   */
  function getTransportHistory(
    uint256 tokenId
  ) public view returns (TransportEvent[] memory) {
    require(_ownerOf(tokenId) != address(0), "ERC721: invalid token ID");
    return _transportHistory[tokenId];
  }

  /**
   * @notice Returns all certification IDs attached to a DPP.
   * @param tokenId The DPP token to query.
   * @return certs  Array of certification identifier strings.
   */
  function getCertifications(
    uint256 tokenId
  ) public view returns (string[] memory) {
    return _certifications[tokenId];
  }

  /**
   * @notice Returns the child token IDs that compose an aggregated DPP.
   * @param tokenId The parent DPP token to query.
   * @return ids    Array of child token IDs.
   */
  function getDPPComponents(
    uint256 tokenId
  ) public view returns (uint256[] memory) {
    return _dppComponents[tokenId];
  }

  /**
   * @notice Returns the on-chain JSON history log for a DPP.
   * @param tokenId The DPP token to query.
   * @return log    Array of JSON-encoded history entries.
   */
  function getHistory(uint256 tokenId) public view returns (string[] memory) {
    return _history[tokenId];
  }

  // ============================================================
  //  SATP Hermes Gateway - Bridge-compatible functions
  //  These follow the exact signatures expected by the SATPWrapper
  //  bridge contract deployed by the SATP Hermes gateway.
  // ============================================================

  /**
   * @notice Locks a DPP by transferring it from `from` to bridge custody at `to`.
   * @dev Sets state to LOCKED_CROSSCHAIN. Called by the SATPWrapper during
   *      the lock phase of a cross-chain transfer.
   * @param from             Current owner of the token.
   * @param to               Bridge custody address.
   * @param uniqueDescriptor The DPP token ID.
   * @return success         True if the operation succeeds.
   */
  function lock(
    address from,
    address to,
    uint256 uniqueDescriptor
  ) external returns (bool) {
    require(_dppData[uniqueDescriptor].state != DPPState.REVOKED, "DPP is revoked");
    // Save the current state so unlock() can restore it if the transfer is rolled back.
    _preLockState[uniqueDescriptor] = _dppData[uniqueDescriptor].state;
    _dppData[uniqueDescriptor].state = DPPState.LOCKED_CROSSCHAIN;
    _addToHistory(uniqueDescriptor, "SATPLock", msg.sender);
    emit SATPLocked(uniqueDescriptor, from, to);
    safeTransferFrom(from, to, uniqueDescriptor);
    return true;
  }

  /**
   * @notice Unlocks a previously locked DPP (rollback scenario).
   * @dev Restores the state that was active before lock() was called and
   *      transfers the token back from bridge custody to the original owner.
   *      If no pre-lock state was saved (unexpected path), falls back to
   *      CREATED to guarantee the DPP is left in a valid, non-locked state.
   * @param from             Bridge custody address currently holding the token.
   * @param to               Original owner to return the token to.
   * @param uniqueDescriptor The DPP token ID.
   * @return success         True if the operation succeeds.
   */
  function unlock(
    address from,
    address to,
    uint256 uniqueDescriptor
  ) external returns (bool) {
    DPPState restored = _preLockState[uniqueDescriptor];
    // Guard against the (unexpected) case where unlock is called without a
    // prior lock: treat missing or locked pre-state as a fresh DPP.
    if (restored == DPPState.LOCKED_CROSSCHAIN) {
      restored = DPPState.CREATED;
    }
    _dppData[uniqueDescriptor].state = restored;
    delete _preLockState[uniqueDescriptor];
    _addToHistory(uniqueDescriptor, "SATPUnlock", msg.sender);
    emit SATPUnlocked(uniqueDescriptor, from, to);
    safeTransferFrom(from, to, uniqueDescriptor);
    return true;
  }

  /**
   * @notice Burns a DPP on the source chain after successful cross-chain transfer.
   * @dev Only callable by addresses with BRIDGE_ROLE.
   * @param uniqueDescriptor The DPP token ID to burn.
   * @return success         True if the operation succeeds.
   */
  function burn(uint256 uniqueDescriptor) external onlyRole(BRIDGE_ROLE) returns (bool) {
    _dppData[uniqueDescriptor].state = DPPState.REVOKED;
    _addToHistory(uniqueDescriptor, "SATPBurn", msg.sender);
    emit SATPBurned(uniqueDescriptor, msg.sender);
    _burn(uniqueDescriptor);
    return true;
  }

  /**
   * @notice Mints a DPP on the destination chain during a cross-chain transfer.
   * @dev Only callable by addresses with BRIDGE_ROLE. Metadata is set to
   *      placeholders; use `amendDPPData` to fill in the real values after
   *      the transfer completes.
   * @param account          Address that will own the minted token.
   * @param uniqueDescriptor The DPP token ID (must match the source chain ID).
   * @return success         True if the operation succeeds.
   */
  function mint(
    address account,
    uint256 uniqueDescriptor
  ) external onlyRole(BRIDGE_ROLE) returns (bool) {
    if (uniqueDescriptor >= _nextTokenId) {
      _nextTokenId = uniqueDescriptor + 1;
    }

    _dppData[uniqueDescriptor] = DPPData({
      productId: string(abi.encodePacked("DPP-", Strings.toString(uniqueDescriptor))),
      productName: "Cross-Chain DPP",
      state: DPPState.CREATED,
      creationDate: "",
      additionalMetadataURI: ""
    });

    _addToHistory(uniqueDescriptor, "SATPMint", msg.sender);
    emit SATPMinted(uniqueDescriptor, account);
    _safeMint(account, uniqueDescriptor);
    return true;
  }

  /**
   * @notice Assigns a bridged DPP to the final receiver after minting.
   * @dev Transfers the token from its current owner to `to`.
   * @param to               The final receiver address.
   * @param uniqueDescriptor The DPP token ID.
   * @return success         True if the operation succeeds.
   */
  function assign(
    address to,
    uint256 uniqueDescriptor
  ) external returns (bool) {
    address currentOwner = ownerOf(uniqueDescriptor);
    _addToHistory(uniqueDescriptor, "SATPAssign", msg.sender);
    emit SATPAssigned(uniqueDescriptor, to);
    safeTransferFrom(currentOwner, to, uniqueDescriptor);
    return true;
  }

  /**
   * @notice Grants BRIDGE_ROLE to an address so it can call bridge functions.
   * @dev Only callable by addresses with OWNER_ROLE.
   * @param account The address to grant the role to.
   * @return success True if the operation succeeds.
   */
  function grantBridgeRole(
    address account
  ) external onlyRole(OWNER_ROLE) returns (bool) {
    _grantRole(BRIDGE_ROLE, account);
    emit BridgeRoleGranted(account, msg.sender);
    return true;
  }

  /**
   * @notice Checks whether an address holds the BRIDGE_ROLE.
   * @dev Reverts with `noPermission` if the address does not have the role.
   * @param account The address to check.
   * @return hasRole True if the address has BRIDGE_ROLE.
   */
  function hasBridgeRole(address account) external view returns (bool) {
    if (hasRole(BRIDGE_ROLE, account)) {
      return true;
    }
    revert noPermission(account);
  }

  /**
   * @notice ERC-721 receiver callback so the contract can hold NFTs
   *         during the SATP lock phase (bridge transfers NFTs to itself).
   * @return selector The `onERC721Received` function selector.
   */
  function onERC721Received(
    address,
    address,
    uint256,
    bytes calldata
  ) external pure returns (bytes4) {
    return this.onERC721Received.selector;
  }
}
