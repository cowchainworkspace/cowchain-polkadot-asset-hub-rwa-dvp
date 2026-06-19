// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.17;

import { Script, console2 } from "forge-std/Script.sol";

// Vendored T-REX (ERC-3643) implementation contracts
import { ClaimTopicsRegistry } from "../src/trex/registry/implementation/ClaimTopicsRegistry.sol";
import { TrustedIssuersRegistry } from "../src/trex/registry/implementation/TrustedIssuersRegistry.sol";
import { IdentityRegistryStorage } from "../src/trex/registry/implementation/IdentityRegistryStorage.sol";
import { IdentityRegistry } from "../src/trex/registry/implementation/IdentityRegistry.sol";
import { ModularCompliance } from "../src/trex/compliance/modular/ModularCompliance.sol";
import { Token } from "../src/trex/token/Token.sol";
import { IClaimIssuer } from "@onchain-id/solidity/contracts/interface/IClaimIssuer.sol";

// Cowchain originals
import { KiltIdentityBridge } from "../src/KiltIdentityBridge.sol";
import { DvPSettlement } from "../src/DvPSettlement.sol";
import { MockStablecoin } from "../src/MockStablecoin.sol";

/**
 * @title DeployTREX
 * @notice Deploys and wires the full reference stack on Polkadot Hub:
 *         the T-REX (ERC-3643) suite, the KILT identity bridge registered as a trusted
 *         IClaimIssuer for the KYC topic, the DvP settlement contract, and a mock stablecoin.
 *
 *         Deploys the implementation contracts directly (non-upgradeable) and calls their
 *         `init()` — the simplest topology for a reference deployment. (Production would put
 *         each behind a TREX proxy + ImplementationAuthority for upgradeability.)
 *
 *         Run (simulate):  forge script script/DeployTREX.s.sol --rpc-url $HUB_TESTNET_RPC_URL
 *         Run (broadcast): forge script script/DeployTREX.s.sol --rpc-url $HUB_TESTNET_RPC_URL --broadcast
 *
 *         Requires env: HUB_DEPLOYER_PRIVATE_KEY. Optional: KILT_ATTESTER_SR25519_PUBKEY
 *         (32-byte 0x hex) — if present, the attester key is trusted at deploy time.
 */
contract DeployTREX is Script {
    /// @dev The single KYC claim topic required for this demo security token.
    uint256 internal constant CLAIM_TOPIC_KYC = 1;

    function run() external {
        uint256 pk = vm.envUint("HUB_DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        console2.log("Deployer:", deployer);

        vm.startBroadcast(pk);

        // 1) Registries
        ClaimTopicsRegistry ctr = new ClaimTopicsRegistry();
        ctr.init();
        TrustedIssuersRegistry tir = new TrustedIssuersRegistry();
        tir.init();
        IdentityRegistryStorage irs = new IdentityRegistryStorage();
        irs.init();

        // 2) Identity registry, bound to its storage
        IdentityRegistry ir = new IdentityRegistry();
        ir.init(address(tir), address(ctr), address(irs));
        irs.bindIdentityRegistry(address(ir));

        // 3) Compliance
        ModularCompliance mc = new ModularCompliance();
        mc.init();

        // 4) Security token — init auto-binds the compliance + identity registry and starts paused
        Token token = new Token();
        token.init(address(ir), address(mc), "Cowchain Demo Bond", "cBOND", 18, address(0));

        // 5) KILT bridge registered as the trusted IClaimIssuer for the KYC topic.
        //    (The bridge implements isClaimValid(...) with the IClaimIssuer selector, so the
        //     unmodified IdentityRegistry.isVerified() dispatches to it — no T-REX changes.)
        KiltIdentityBridge bridge = new KiltIdentityBridge();
        ctr.addClaimTopic(CLAIM_TOPIC_KYC);
        uint256[] memory topics = new uint256[](1);
        topics[0] = CLAIM_TOPIC_KYC;
        tir.addTrustedIssuer(IClaimIssuer(address(bridge)), topics);

        // Optionally trust the KILT attester sr25519 key now (else do it after KILT keygen).
        bytes32 attesterKey = _envBytes32OrZero("KILT_ATTESTER_SR25519_PUBKEY");
        if (attesterKey != bytes32(0)) {
            bridge.trustAttesterKey(attesterKey);
            console2.log("Trusted KILT attester key from env.");
        } else {
            console2.log("No KILT_ATTESTER_SR25519_PUBKEY set; run bridge.trustAttesterKey() after KILT keygen.");
        }

        // 6) Make the deployer an agent and unpause so onboarding + transfers can proceed.
        ir.addAgent(deployer); // registerIdentity is onlyAgent
        token.addAgent(deployer); // mint / unpause are onlyAgent
        token.unpause();

        // 7) Settlement + cash leg
        DvPSettlement dvp = new DvPSettlement();
        MockStablecoin cash = new MockStablecoin("Mock USD", "mUSD", 6);

        vm.stopBroadcast();

        // ---- sanity-check the wiring before reporting success ----
        require(!token.paused(), "deploy: token still paused");
        require(ir.isAgent(deployer), "deploy: deployer not an IR agent");
        require(token.isAgent(deployer), "deploy: deployer not a token agent");
        require(tir.isTrustedIssuer(address(bridge)), "deploy: bridge not a trusted issuer");

        // ---- report ----
        console2.log("ClaimTopicsRegistry   ", address(ctr));
        console2.log("TrustedIssuersRegistry", address(tir));
        console2.log("IdentityRegistryStorage", address(irs));
        console2.log("IdentityRegistry      ", address(ir));
        console2.log("ModularCompliance     ", address(mc));
        console2.log("Token (cBOND)         ", address(token));
        console2.log("KiltIdentityBridge    ", address(bridge));
        console2.log("DvPSettlement         ", address(dvp));
        console2.log("MockStablecoin (mUSD) ", address(cash));

        _writeDeployments(deployer, ctr, tir, irs, ir, mc, token, bridge, dvp, cash);
    }

    function _envBytes32OrZero(string memory name) internal view returns (bytes32) {
        string memory v = vm.envOr(name, string(""));
        if (bytes(v).length == 66) {
            return vm.parseBytes32(v);
        }
        return bytes32(0);
    }

    function _writeDeployments(
        address deployer,
        ClaimTopicsRegistry ctr,
        TrustedIssuersRegistry tir,
        IdentityRegistryStorage irs,
        IdentityRegistry ir,
        ModularCompliance mc,
        Token token,
        KiltIdentityBridge bridge,
        DvPSettlement dvp,
        MockStablecoin cash
    ) internal {
        string memory json = string.concat(
            "{\n",
            '  "chainId": 420420417,\n',
            '  "deployer": "',
            vm.toString(deployer),
            '",\n',
            '  "kycClaimTopic": 1,\n',
            '  "claimTopicsRegistry": "',
            vm.toString(address(ctr)),
            '",\n',
            '  "trustedIssuersRegistry": "',
            vm.toString(address(tir)),
            '",\n',
            '  "identityRegistryStorage": "',
            vm.toString(address(irs)),
            '",\n',
            '  "identityRegistry": "',
            vm.toString(address(ir)),
            '",\n',
            '  "modularCompliance": "',
            vm.toString(address(mc)),
            '",\n',
            '  "token": "',
            vm.toString(address(token)),
            '",\n',
            '  "kiltIdentityBridge": "',
            vm.toString(address(bridge)),
            '",\n',
            '  "dvpSettlement": "',
            vm.toString(address(dvp)),
            '",\n',
            '  "mockStablecoin": "',
            vm.toString(address(cash)),
            '"\n',
            "}\n"
        );
        vm.writeFile("deployments/hub-testnet.json", json);
        console2.log("Wrote deployments/hub-testnet.json");
    }
}
