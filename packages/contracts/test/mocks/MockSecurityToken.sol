// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.17;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @notice Minimal stand-in for an ERC-3643 token in DvP unit tests. Its `transfer`/`transferFrom`
 *         REVERT when the recipient is not marked compliant — mirroring T-REX's revert-on-non-
 *         compliant-recipient behavior. This lets us prove the DvP atomicity↔compliance composition
 *         on a plain Anvil node, without deploying the full T-REX suite (covered by integration tests).
 */
contract MockSecurityToken is ERC20 {
    mapping(address => bool) public compliant;

    constructor() ERC20("Mock Security", "mSEC") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setCompliant(address who, bool ok) external {
        compliant[who] = ok;
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        require(compliant[to], "ERC3643: recipient not verified");
        return super.transfer(to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        require(compliant[to], "ERC3643: recipient not verified");
        return super.transferFrom(from, to, amount);
    }
}
