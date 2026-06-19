// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.17;

import { Test } from "forge-std/Test.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { DvPSettlement } from "../src/DvPSettlement.sol";
import { MockStablecoin } from "../src/MockStablecoin.sol";
import { MockSecurityToken } from "./mocks/MockSecurityToken.sol";

/**
 * @title DvPSettlement property (fuzz) tests
 * @notice Proves (1) settlement conserves each token's total across all actors + the DvP contract, and
 *         (2) canSettle is a faithful oracle for settle across allowance/balance/amount (incl. a short
 *         seller balance). Buyer is kept compliant — MockSecurityToken has no ERC-3643 getters, so
 *         canSettle's freeze/pause/compliance branches are covered in FullStack.t.sol, not here.
 */
contract DvPSettlementFuzzTest is Test {
    DvPSettlement internal dvp;
    MockSecurityToken internal security;
    MockStablecoin internal cash;

    address[4] internal actors;

    function setUp() public {
        dvp = new DvPSettlement();
        security = new MockSecurityToken();
        cash = new MockStablecoin("Mock USD", "mUSD", 6);
        actors[0] = makeAddr("a");
        actors[1] = makeAddr("b");
        actors[2] = makeAddr("c");
        actors[3] = makeAddr("d");
        for (uint256 i = 0; i < actors.length; ++i) {
            security.setCompliant(actors[i], true);
        }
    }

    function _sumTokenAcrossSystem(IERC20 token) internal view returns (uint256 total) {
        for (uint256 i = 0; i < actors.length; ++i) {
            total += token.balanceOf(actors[i]);
        }
        total += token.balanceOf(address(dvp));
    }

    /// @notice For any two distinct actors and any well-funded, fully-approved trade, settlement
    ///         conserves each token's total across all participants + the DvP contract, moves exactly
    ///         the agreed amounts, and leaves nothing in the DvP contract.
    function testFuzz_settle_conservesValueGlobally(uint256 sellerSeed, uint256 buyerSeed, uint96 secAmt, uint96 payAmt)
        public
    {
        address seller = actors[sellerSeed % actors.length];
        address buyer = actors[buyerSeed % actors.length];
        vm.assume(seller != buyer);
        secAmt = uint96(bound(secAmt, 1, 1e24));
        payAmt = uint96(bound(payAmt, 1, 1e24));

        security.mint(seller, secAmt);
        cash.mint(buyer, payAmt);
        vm.prank(seller);
        security.approve(address(dvp), secAmt);
        vm.prank(buyer);
        cash.approve(address(dvp), payAmt);

        uint256 secBefore = _sumTokenAcrossSystem(IERC20(address(security)));
        uint256 cashBefore = _sumTokenAcrossSystem(IERC20(address(cash)));

        vm.prank(seller);
        uint256 id = dvp.createTrade(buyer, address(security), secAmt, address(cash), payAmt, 0);
        vm.prank(buyer);
        dvp.settle(id);

        // Global conservation: nothing created, destroyed, or stuck in DvP.
        assertEq(_sumTokenAcrossSystem(IERC20(address(security))), secBefore, "security conserved");
        assertEq(_sumTokenAcrossSystem(IERC20(address(cash))), cashBefore, "cash conserved");
        assertEq(security.balanceOf(address(dvp)), 0, "dvp holds no security");
        assertEq(cash.balanceOf(address(dvp)), 0, "dvp holds no cash");

        // Exact leg movement.
        assertEq(security.balanceOf(buyer), secAmt, "buyer received security");
        assertEq(cash.balanceOf(seller), payAmt, "seller received cash");
    }

    /// @notice canSettle must agree with settle across allowance, cash balance, AND seller balance
    ///         shortfalls. The seller balance is fuzzed INDEPENDENTLY of the agreed amount, so the
    ///         `canSettle` seller-transferable-balance branch (and settle's matching revert) is
    ///         actually compared rather than always-funded.
    function testFuzz_canSettleMatchesSettle(
        uint96 secAmt,
        uint96 payAmt,
        uint96 sellerBal,
        uint96 buyerCash,
        uint96 secApprove,
        uint96 cashApprove
    ) public {
        address seller = actors[0];
        address buyer = actors[1];
        secAmt = uint96(bound(secAmt, 1, 1e24));
        payAmt = uint96(bound(payAmt, 1, 1e24));

        security.mint(seller, bound(sellerBal, 0, 2e24)); // may be SHORT of secAmt
        cash.mint(buyer, bound(buyerCash, 0, 2e24)); // may be SHORT of payAmt
        vm.prank(seller);
        security.approve(address(dvp), secApprove);
        vm.prank(buyer);
        cash.approve(address(dvp), cashApprove);

        vm.prank(seller);
        uint256 id = dvp.createTrade(buyer, address(security), secAmt, address(cash), payAmt, 0);

        (bool ok,) = dvp.canSettle(id);

        if (ok) {
            vm.prank(buyer);
            dvp.settle(id); // must NOT revert
            assertEq(security.balanceOf(buyer), secAmt, "delivered on ok");
            assertEq(cash.balanceOf(seller), payAmt, "paid on ok");
            assertEq(security.balanceOf(address(dvp)), 0, "no security stuck");
            assertEq(cash.balanceOf(address(dvp)), 0, "no cash stuck");
        } else {
            vm.prank(buyer);
            vm.expectRevert(); // canSettle said no -> settle must revert, nothing moves
            dvp.settle(id);
        }
    }
}
