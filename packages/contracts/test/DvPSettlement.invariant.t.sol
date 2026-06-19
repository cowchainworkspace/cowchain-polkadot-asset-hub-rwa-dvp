// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.17;

import { Test } from "forge-std/Test.sol";
import { StdInvariant } from "forge-std/StdInvariant.sol";
import { DvPSettlement } from "../src/DvPSettlement.sol";
import { MockStablecoin } from "../src/MockStablecoin.sol";
import { MockSecurityToken } from "./mocks/MockSecurityToken.sol";

/**
 * @notice Drives DvPSettlement through random create/settle/cancel sequences across several actors,
 *         funding and approving as it goes. The CALLER of settle/cancel is fuzzed from the full actor
 *         set; non-party callers are ASSERTED to revert with the access-control error (so a broken
 *         guard fails the run), not merely attempted. Records which trades reached each terminal state
 *         so invariants can assert terminality.
 */
contract DvpHandler is Test {
    DvPSettlement internal dvp;
    MockSecurityToken internal security;
    MockStablecoin internal cash;

    address[4] internal actors;
    uint256[] internal ids;
    mapping(uint256 => bool) public wasSettled;
    mapping(uint256 => bool) public wasCancelled;

    constructor(DvPSettlement _dvp, MockSecurityToken _security, MockStablecoin _cash) {
        dvp = _dvp;
        security = _security;
        cash = _cash;
        actors[0] = makeAddr("alice");
        actors[1] = makeAddr("bob");
        actors[2] = makeAddr("carol");
        actors[3] = makeAddr("dave");
        for (uint256 i = 0; i < actors.length; ++i) {
            security.setCompliant(actors[i], true);
        }
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    function createTrade(uint256 sellerSeed, uint256 buyerSeed, uint96 secAmt, uint96 payAmt) external {
        address seller = _actor(sellerSeed);
        address buyer = _actor(buyerSeed);
        if (seller == buyer) return;
        secAmt = uint96(bound(secAmt, 1, 1e24));
        payAmt = uint96(bound(payAmt, 1, 1e24));

        security.mint(seller, secAmt);
        cash.mint(buyer, payAmt);
        vm.prank(seller);
        security.approve(address(dvp), secAmt);
        vm.prank(buyer);
        cash.approve(address(dvp), payAmt);

        vm.prank(seller);
        ids.push(dvp.createTrade(buyer, address(security), secAmt, address(cash), payAmt, 0));
    }

    /// @dev Caller is fuzzed. On a still-pending trade a NON-party caller MUST revert with the
    ///      access-control error — asserted here, so deleting the guard would fail the run. A party
    ///      caller may still legitimately revert (e.g. its allowance was consumed settling another
    ///      trade, since createTrade re-approves rather than accumulates), so that path is tolerated.
    function settle(uint256 idxSeed, uint256 callerSeed) external {
        if (ids.length == 0) return;
        uint256 id = ids[idxSeed % ids.length];
        address caller = _actor(callerSeed);
        (address seller, address buyer,,,, DvPSettlement.Status status,,) = dvp.trades(id);
        if (status != DvPSettlement.Status.Pending) return;

        if (caller == seller || caller == buyer) {
            vm.prank(caller);
            try dvp.settle(id) {
                wasSettled[id] = true;
            } catch { }
        } else {
            vm.prank(caller);
            vm.expectRevert(DvPSettlement.NotAParty.selector);
            dvp.settle(id);
        }
    }

    /// @dev Caller is fuzzed. A non-party caller MUST revert with the access-control error (asserted);
    ///      a party caller cancels (a pending cancel by a party always succeeds — no token movement).
    function cancel(uint256 idxSeed, uint256 callerSeed) external {
        if (ids.length == 0) return;
        uint256 id = ids[idxSeed % ids.length];
        address caller = _actor(callerSeed);
        (address seller, address buyer,,,, DvPSettlement.Status status,,) = dvp.trades(id);
        if (status != DvPSettlement.Status.Pending) return;

        if (caller == seller || caller == buyer) {
            vm.prank(caller);
            dvp.cancelTrade(id);
            wasCancelled[id] = true;
        } else {
            vm.prank(caller);
            vm.expectRevert(DvPSettlement.NotAParty.selector);
            dvp.cancelTrade(id);
        }
    }
}

/**
 * @title DvPSettlement invariants
 * @notice The DvP contract is a pure operator that pulls both legs via transferFrom at settlement
 *         time — it must therefore NEVER custody either token, every recorded trade must carry a real
 *         status, and both terminal states (Settled, Cancelled) must stick — no re-settle, no
 *         re-cancel, no rewind to Pending.
 */
contract DvPSettlementInvariantTest is StdInvariant, Test {
    DvPSettlement internal dvp;
    MockSecurityToken internal security;
    MockStablecoin internal cash;
    DvpHandler internal handler;

    function setUp() public {
        dvp = new DvPSettlement();
        security = new MockSecurityToken();
        cash = new MockStablecoin("Mock USD", "mUSD", 6);
        handler = new DvpHandler(dvp, security, cash);

        // Only fuzz the handler's three lifecycle entrypoints (not inherited Test helpers).
        bytes4[] memory selectors = new bytes4[](3);
        selectors[0] = DvpHandler.createTrade.selector;
        selectors[1] = DvpHandler.settle.selector;
        selectors[2] = DvpHandler.cancel.selector;
        targetSelector(FuzzSelector({ addr: address(handler), selectors: selectors }));
        targetContract(address(handler));
    }

    /// @notice The settlement contract must hold no balance of either asset — ever.
    function invariant_dvpCustodiesNothing() public view {
        assertEq(security.balanceOf(address(dvp)), 0, "dvp holds security");
        assertEq(cash.balanceOf(address(dvp)), 0, "dvp holds cash");
    }

    /// @notice Every created trade has a real (non-None) status, and both terminal states are sticky:
    ///         a settled trade stays Settled, a cancelled trade stays Cancelled.
    function invariant_statusIntegrity() public view {
        uint256 n = dvp.tradeCount();
        for (uint256 id = 1; id <= n; ++id) {
            (,,,,, DvPSettlement.Status status,,) = dvp.trades(id);
            assertTrue(status != DvPSettlement.Status.None, "created trade is None");
            if (handler.wasSettled(id)) {
                assertEq(uint256(status), uint256(DvPSettlement.Status.Settled), "settled trade not terminal");
            }
            if (handler.wasCancelled(id)) {
                assertEq(uint256(status), uint256(DvPSettlement.Status.Cancelled), "cancelled trade not terminal");
            }
        }
    }
}
