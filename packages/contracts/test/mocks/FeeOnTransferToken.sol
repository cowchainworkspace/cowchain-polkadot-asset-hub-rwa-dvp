// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.17;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @notice A fee-on-transfer ERC20 (à la STA/PAXG): every `transferFrom` burns a 1% fee from the
 *         sender, so the recipient receives LESS than the requested amount. Used to demonstrate the
 *         limitation DvPSettlement documents — its cash leg settles by exact `transferFrom`, not by
 *         balance reconciliation, so a fee-on-transfer cash token shortchanges the seller.
 */
contract FeeOnTransferToken is ERC20 {
    /// @notice Fee taken on every transferFrom, in basis points (1% here).
    uint256 public constant FEE_BPS = 100;

    constructor() ERC20("Fee USD", "fUSD") { }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        uint256 fee = (amount * FEE_BPS) / 10_000;
        _spendAllowance(from, msg.sender, amount);
        _transfer(from, to, amount - fee); // recipient gets amount - fee
        if (fee > 0) _burn(from, fee); // the fee disappears
        return true;
    }
}
