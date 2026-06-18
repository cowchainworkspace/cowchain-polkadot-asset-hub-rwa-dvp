// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.17;

import {Test} from "forge-std/Test.sol";
import {DvPSettlement} from "../src/DvPSettlement.sol";
import {MockStablecoin} from "../src/MockStablecoin.sol";
import {MockSecurityToken} from "./mocks/MockSecurityToken.sol";
import {ReentrantCash} from "./mocks/ReentrantCash.sol";

/**
 * @title DvPSettlement unit tests
 * @notice Proves the centerpiece property: because the ERC-3643 leg reverts for a non-compliant
 *         buyer and both legs share one transaction, settlement is atomic AND compliance-gated —
 *         a bad buyer makes the cash leg revert too, so nothing moves.
 */
contract DvPSettlementTest is Test {
    DvPSettlement internal dvp;
    MockSecurityToken internal security;
    MockStablecoin internal cash;

    address internal seller = makeAddr("seller");
    address internal buyer = makeAddr("buyer");
    address internal stranger = makeAddr("stranger");

    uint256 internal constant SEC_AMOUNT = 100e18; // 100 security tokens
    uint256 internal constant PAY_AMOUNT = 1_000e6; // 1,000 mUSD (6 decimals)

    function setUp() public {
        dvp = new DvPSettlement();
        security = new MockSecurityToken();
        cash = new MockStablecoin("Mock USD", "mUSD", 6);

        security.mint(seller, SEC_AMOUNT);
        cash.mint(buyer, PAY_AMOUNT);
        security.setCompliant(buyer, true); // buyer is KYC-verified by default

        vm.prank(seller);
        security.approve(address(dvp), SEC_AMOUNT);
        vm.prank(buyer);
        cash.approve(address(dvp), PAY_AMOUNT);
    }

    function _createTrade() internal returns (uint256 tradeId) {
        vm.prank(seller);
        tradeId = dvp.createTrade(buyer, address(security), SEC_AMOUNT, address(cash), PAY_AMOUNT, 0);
    }

    function test_settle_movesBothLegsAtomically() public {
        uint256 tradeId = _createTrade();

        (bool ok,) = dvp.canSettle(tradeId);
        assertTrue(ok, "should be settleable");

        vm.prank(buyer);
        dvp.settle(tradeId);

        assertEq(security.balanceOf(buyer), SEC_AMOUNT, "buyer got security");
        assertEq(security.balanceOf(seller), 0, "seller delivered security");
        assertEq(cash.balanceOf(seller), PAY_AMOUNT, "seller got cash");
        assertEq(cash.balanceOf(buyer), 0, "buyer paid cash");

        (, , , , , , , DvPSettlement.Status status) = dvp.trades(tradeId);
        assertEq(uint256(status), uint256(DvPSettlement.Status.Settled));
    }

    /// @notice THE property: a non-compliant buyer reverts the security leg, which reverts the
    ///         payment leg too. Neither asset moves.
    function test_settle_nonCompliantBuyer_revertsWholeTx() public {
        security.setCompliant(buyer, false); // buyer fails KYC / compliance

        uint256 tradeId = _createTrade();

        vm.prank(buyer);
        vm.expectRevert(); // ERC-3643 leg reverts -> entire settlement reverts
        dvp.settle(tradeId);

        // Nothing moved: payment did not happen just because delivery couldn't.
        assertEq(security.balanceOf(seller), SEC_AMOUNT, "security stayed with seller");
        assertEq(security.balanceOf(buyer), 0, "buyer received nothing");
        assertEq(cash.balanceOf(buyer), PAY_AMOUNT, "cash stayed with buyer");
        assertEq(cash.balanceOf(seller), 0, "seller received no payment");
    }

    function test_settle_callableBySeller() public {
        uint256 tradeId = _createTrade();
        vm.prank(seller);
        dvp.settle(tradeId);
        assertEq(security.balanceOf(buyer), SEC_AMOUNT);
    }

    function test_settle_revertsForNonParty() public {
        uint256 tradeId = _createTrade();
        vm.prank(stranger);
        vm.expectRevert(bytes("dvp: not a party"));
        dvp.settle(tradeId);
    }

    function test_settle_revertsAfterCancel() public {
        uint256 tradeId = _createTrade();
        vm.prank(seller);
        dvp.cancelTrade(tradeId);

        vm.prank(buyer);
        vm.expectRevert(bytes("dvp: not settleable"));
        dvp.settle(tradeId);
    }

    function test_settle_revertsWhenExpired() public {
        vm.prank(seller);
        uint256 tradeId =
            dvp.createTrade(buyer, address(security), SEC_AMOUNT, address(cash), PAY_AMOUNT, uint64(block.timestamp + 1 days));

        vm.warp(block.timestamp + 2 days);

        (bool ok, string memory reason) = dvp.canSettle(tradeId);
        assertFalse(ok);
        assertEq(reason, "expired");

        vm.prank(buyer);
        vm.expectRevert(bytes("dvp: expired"));
        dvp.settle(tradeId);
    }

    function test_canSettle_reportsAllowanceShortfall() public {
        uint256 tradeId = _createTrade();
        vm.prank(seller);
        security.approve(address(dvp), 0); // revoke approval

        (bool ok, string memory reason) = dvp.canSettle(tradeId);
        assertFalse(ok);
        assertEq(reason, "seller allowance too low");
    }

    function test_createTrade_rejectsBadInput() public {
        vm.startPrank(seller);
        vm.expectRevert(bytes("dvp: zero buyer"));
        dvp.createTrade(address(0), address(security), SEC_AMOUNT, address(cash), PAY_AMOUNT, 0);

        vm.expectRevert(bytes("dvp: self trade"));
        dvp.createTrade(seller, address(security), SEC_AMOUNT, address(cash), PAY_AMOUNT, 0);

        vm.expectRevert(bytes("dvp: zero amount"));
        dvp.createTrade(buyer, address(security), 0, address(cash), PAY_AMOUNT, 0);
        vm.stopPrank();
    }

    function test_settle_isReentrancySafe() public {
        // Build a trade whose CASH leg is a malicious token that re-enters settle().
        ReentrantCash evilCash = new ReentrantCash();
        evilCash.mint(buyer, PAY_AMOUNT);
        vm.prank(buyer);
        evilCash.approve(address(dvp), PAY_AMOUNT);

        vm.prank(seller);
        uint256 tradeId =
            dvp.createTrade(buyer, address(security), SEC_AMOUNT, address(evilCash), PAY_AMOUNT, 0);

        evilCash.arm(dvp, tradeId);

        vm.prank(buyer);
        vm.expectRevert(); // reentrant settle() must blow up the whole tx
        dvp.settle(tradeId);

        // Atomic: the delivery leg that ran first is fully rolled back.
        assertEq(security.balanceOf(seller), SEC_AMOUNT, "security rolled back to seller");
        assertEq(security.balanceOf(buyer), 0);
    }

    function test_settle_revertsOnDoubleSettle() public {
        uint256 tradeId = _createTrade();
        vm.prank(buyer);
        dvp.settle(tradeId);
        vm.prank(buyer);
        vm.expectRevert(bytes("dvp: not settleable"));
        dvp.settle(tradeId);
    }

    function test_settle_succeedsAtExpiryBoundary() public {
        uint64 deadline = uint64(block.timestamp + 1 days);
        vm.prank(seller);
        uint256 tradeId = dvp.createTrade(buyer, address(security), SEC_AMOUNT, address(cash), PAY_AMOUNT, deadline);
        vm.warp(deadline); // block.timestamp == expiry must still settle (the check is <=)
        vm.prank(buyer);
        dvp.settle(tradeId);
        assertEq(security.balanceOf(buyer), SEC_AMOUNT);
    }

    function test_settle_buyerInsufficientCash_revertsWholeTx() public {
        uint256 tradeId = _createTrade();
        vm.prank(buyer);
        cash.approve(address(dvp), 0); // buyer can no longer pay the cash leg

        vm.prank(buyer);
        vm.expectRevert();
        dvp.settle(tradeId);

        // leg-2 (cash) failure rolls back leg-1 (security) — atomic both ways.
        assertEq(security.balanceOf(seller), SEC_AMOUNT, "security stayed with seller");
        assertEq(security.balanceOf(buyer), 0);
    }

    function test_createTrade_rejectsZeroTokenAndBadExpiry() public {
        vm.warp(1_000_000); // so block.timestamp - 1 is a real past deadline, not the 0 "no expiry" sentinel
        vm.startPrank(seller);
        vm.expectRevert(bytes("dvp: zero token"));
        dvp.createTrade(buyer, address(0), SEC_AMOUNT, address(cash), PAY_AMOUNT, 0);
        vm.expectRevert(bytes("dvp: bad expiry"));
        dvp.createTrade(buyer, address(security), SEC_AMOUNT, address(cash), PAY_AMOUNT, uint64(block.timestamp - 1));
        vm.stopPrank();
    }

    function test_cancelTrade_accessControlAndPostSettle() public {
        uint256 tradeId = _createTrade();
        vm.prank(stranger);
        vm.expectRevert(bytes("dvp: not a party"));
        dvp.cancelTrade(tradeId);

        vm.prank(buyer);
        dvp.settle(tradeId);
        vm.prank(seller);
        vm.expectRevert(bytes("dvp: not pending"));
        dvp.cancelTrade(tradeId);
    }

    function test_canSettle_skipsComplianceForPlainErc20() public {
        // MockSecurityToken has no paused()/isFrozen()/identityRegistry()/compliance() getters, so canSettle
        // must skip those probes (outer catch) and still report settleable when balances/allowances are fine.
        uint256 tradeId = _createTrade();
        (bool ok, string memory reason) = dvp.canSettle(tradeId);
        assertTrue(ok, reason);
    }

    function test_tradeIds_startAtOneAndIncrement() public {
        uint256 first = _createTrade();
        uint256 second = _createTrade();
        assertEq(first, 1);
        assertEq(second, 2);
        assertEq(dvp.tradeCount(), 2);
    }
}
