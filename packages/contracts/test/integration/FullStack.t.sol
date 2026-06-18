// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.17;

import {Test} from "forge-std/Test.sol";

// Real vendored T-REX (ERC-3643) suite
import {ClaimTopicsRegistry} from "../../src/trex/registry/implementation/ClaimTopicsRegistry.sol";
import {TrustedIssuersRegistry} from "../../src/trex/registry/implementation/TrustedIssuersRegistry.sol";
import {IdentityRegistryStorage} from "../../src/trex/registry/implementation/IdentityRegistryStorage.sol";
import {IdentityRegistry} from "../../src/trex/registry/implementation/IdentityRegistry.sol";
import {ModularCompliance} from "../../src/trex/compliance/modular/ModularCompliance.sol";
import {Token} from "../../src/trex/token/Token.sol";
import {IClaimIssuer} from "@onchain-id/solidity/contracts/interface/IClaimIssuer.sol";
import {IIdentity} from "@onchain-id/solidity/contracts/interface/IIdentity.sol";
import {Identity} from "@onchain-id/solidity/contracts/Identity.sol";

// Cowchain originals
import {KiltIdentityBridge} from "../../src/KiltIdentityBridge.sol";
import {DvPSettlement} from "../../src/DvPSettlement.sol";
import {MockStablecoin} from "../../src/MockStablecoin.sol";
import {ISystem, SYSTEM_PRECOMPILE} from "../../src/precompiles/ISystem.sol";

/**
 * @title Full-stack integration test — REAL T-REX + KILT bridge + DvP on a local EVM.
 * @notice Unlike the unit tests (which use a MockSecurityToken), this deploys the actual audited
 *         T-REX suite and the real KiltIdentityBridge, mocking ONLY the 0x900 precompile (which
 *         doesn't exist on Anvil). It proves the two things the unit tests can't on their own:
 *           (1) IdentityRegistry.isVerified() actually dispatches to bridge.isClaimValid(), and
 *           (2) the atomic DvP composes with REAL ERC-3643 compliance — settlement reverts when the
 *               bridge gate fails (precompile rejects / credential revoked / attester untrusted).
 */
contract FullStackTest is Test {
    uint256 internal constant KYC_TOPIC = 1;
    uint256 internal constant BOND = 100e18;
    uint256 internal constant PRICE = 1_000e6;
    bytes32 internal constant ATTESTER_KEY = bytes32(uint256(0xA77E5));

    ClaimTopicsRegistry internal ctr;
    TrustedIssuersRegistry internal tir;
    IdentityRegistryStorage internal irs;
    IdentityRegistry internal ir;
    ModularCompliance internal mc;
    Token internal token;
    KiltIdentityBridge internal bridge;
    DvPSettlement internal dvp;
    MockStablecoin internal cash;

    address internal seller = makeAddr("seller");
    address internal buyer = makeAddr("buyer");
    address internal buyerIdentity;

    function setUp() public {
        // --- deploy + wire the real T-REX suite (mirrors DeployTREX.s.sol) ---
        ctr = new ClaimTopicsRegistry();
        ctr.init();
        tir = new TrustedIssuersRegistry();
        tir.init();
        irs = new IdentityRegistryStorage();
        irs.init();
        ir = new IdentityRegistry();
        ir.init(address(tir), address(ctr), address(irs));
        irs.bindIdentityRegistry(address(ir));
        mc = new ModularCompliance();
        mc.init();
        token = new Token();
        token.init(address(ir), address(mc), "Cowchain Demo Bond", "cBOND", 18, address(0));

        bridge = new KiltIdentityBridge();
        ctr.addClaimTopic(KYC_TOPIC);
        uint256[] memory topics = new uint256[](1);
        topics[0] = KYC_TOPIC;
        tir.addTrustedIssuer(IClaimIssuer(address(bridge)), topics);
        bridge.trustAttesterKey(ATTESTER_KEY);

        ir.addAgent(address(this));
        token.addAgent(address(this));
        token.unpause();

        dvp = new DvPSettlement();
        cash = new MockStablecoin("Mock USD", "mUSD", 6);

        // 0x900 doesn't exist locally — default the precompile to "signature valid".
        _mockPrecompile(true);

        // --- onboard seller + buyer with KILT-attested claims ---
        _onboard(seller);
        buyerIdentity = _onboard(buyer);

        // --- issue assets + standing approvals for the DvP ---
        token.mint(seller, BOND); // requires isVerified(seller) — proves onboarding worked
        cash.mint(buyer, PRICE);
        vm.prank(seller);
        token.approve(address(dvp), BOND);
        vm.prank(buyer);
        cash.approve(address(dvp), PRICE);

        vm.prank(seller);
        dvp.createTrade(buyer, address(token), BOND, address(cash), PRICE, 0);
    }

    function _mockPrecompile(bool verdict) internal {
        vm.mockCall(SYSTEM_PRECOMPILE, abi.encodeWithSelector(ISystem.sr25519Verify.selector), abi.encode(verdict));
    }

    /// @dev Deploys an ONCHAINID (managed by this test), attaches a bridge-issued KYC claim, registers it.
    function _onboard(address wallet) internal returns (address) {
        Identity id = new Identity(address(this), false);
        id.addKey(keccak256(abi.encode(address(this))), 3, 1); // this -> CLAIM key
        bytes32 rootHash = keccak256(abi.encode(address(id)));
        bytes memory data = abi.encode(ATTESTER_KEY, rootHash, block.timestamp + 365 days);
        bytes memory sig = new bytes(64); // precompile is mocked, contents irrelevant
        // addClaim re-validates through the bridge (issuer != identity), so the mocked precompile must say true.
        id.addClaim(KYC_TOPIC, 1, address(bridge), sig, data, "");
        ir.registerIdentity(wallet, IIdentity(address(id)), 840);
        assertTrue(ir.isVerified(wallet), "wallet should be verified after onboarding");
        return address(id);
    }

    function test_fullStack_settlesForKiltVerifiedBuyer() public {
        // isVerified(buyer) routes through bridge.isClaimValid -> 0x900; DvP settles atomically.
        vm.prank(buyer);
        dvp.settle(1);
        assertEq(token.balanceOf(buyer), BOND, "buyer received the bond");
        assertEq(token.balanceOf(seller), 0);
        assertEq(cash.balanceOf(seller), PRICE, "seller received the cash");
        assertEq(cash.balanceOf(buyer), 0);
    }

    function test_fullStack_revertsWhenPrecompileRejects() public {
        _mockPrecompile(false); // the sr25519 signature no longer verifies -> isVerified(buyer) = false
        vm.prank(buyer);
        vm.expectRevert();
        dvp.settle(1);
        _assertNothingMoved();
    }

    function test_fullStack_revertsWhenCredentialRevoked() public {
        bridge.revokeCredential(keccak256(abi.encode(buyerIdentity)));
        vm.prank(buyer);
        vm.expectRevert();
        dvp.settle(1);
        _assertNothingMoved();
    }

    function test_fullStack_revertsWhenAttesterUntrusted() public {
        bridge.untrustAttesterKey(ATTESTER_KEY);
        vm.prank(buyer);
        vm.expectRevert();
        dvp.settle(1);
        _assertNothingMoved();
    }

    function _assertNothingMoved() internal view {
        assertEq(token.balanceOf(seller), BOND, "security stayed with seller");
        assertEq(token.balanceOf(buyer), 0);
        assertEq(cash.balanceOf(buyer), PRICE, "cash stayed with buyer");
        assertEq(cash.balanceOf(seller), 0);
    }
}
