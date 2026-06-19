// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.17;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title  MockStablecoin
 * @author Cowchain
 * @notice A deliberately simple ERC-20 standing in for the cash leg of a DvP settlement
 *         (e.g. a tokenized deposit or a regulated stablecoin). Configurable decimals so
 *         it can mimic USDC (6). NOT a real stablecoin — for testnet/reference use only.
 * @dev    Unlike the security token, the cash leg is a *plain, unpermissioned* ERC-20:
 *         the compliance gating lives entirely on the ERC-3643 side. The DvP contract pulls
 *         this token via `transferFrom`, so the buyer must `approve` the DvP contract first.
 */
contract MockStablecoin is ERC20, Ownable {
    uint8 private immutable _decimals;

    /// @notice Amount minted (in whole tokens) per {drip} call.
    uint256 public constant DRIP_WHOLE_TOKENS = 10_000;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        _decimals = decimals_;
    }

    /// @inheritdoc ERC20
    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    /// @notice Issuer/operator mints cash to any address (e.g. to fund a demo buyer).
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /// @notice Open faucet for demos: mints a fixed amount of cash to the caller.
    /// @dev    Intentionally permissionless — testnet only. Remove for any real deployment.
    function drip() external {
        _mint(msg.sender, DRIP_WHOLE_TOKENS * (10 ** _decimals));
    }
}
