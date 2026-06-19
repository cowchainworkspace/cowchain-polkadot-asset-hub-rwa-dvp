// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.17;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { DvPSettlement } from "../../src/DvPSettlement.sol";

/**
 * @notice Malicious cash token whose `transferFrom` re-enters {DvPSettlement-settle}, used to prove
 *         the settlement is reentrancy-safe. When armed, the payment leg attempts to settle the same
 *         trade again; the guard + checks-effects-interactions must make the whole transaction revert.
 */
contract ReentrantCash is ERC20 {
    DvPSettlement private _dvp;
    uint256 private _tradeId;
    bool private _armed;

    constructor() ERC20("Reentrant Cash", "rCASH") { }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function arm(DvPSettlement dvp, uint256 tradeId) external {
        _dvp = dvp;
        _tradeId = tradeId;
        _armed = true;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        if (_armed) {
            _armed = false;
            _dvp.settle(_tradeId); // re-entry attempt — must cause the outer settle to revert
        }
        return super.transferFrom(from, to, amount);
    }
}
