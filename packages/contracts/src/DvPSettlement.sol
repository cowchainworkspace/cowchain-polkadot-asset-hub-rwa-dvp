// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.17;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {IToken} from "./trex/token/IToken.sol";
import {IIdentityRegistry} from "./trex/registry/interface/IIdentityRegistry.sol";
import {IModularCompliance} from "./trex/compliance/modular/IModularCompliance.sol";

/**
 * @title  DvPSettlement
 * @author Cowchain
 * @notice Atomic delivery-versus-payment (DvP) settlement for an ERC-3643 security token
 *         against a stablecoin cash leg. This is the project's settlement centerpiece.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *  THE KEY PROPERTY: compliance and atomicity compose for free
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *  {settle} performs BOTH legs in ONE transaction:
 *
 *      securityToken.transferFrom(seller, buyer, securityAmount);   // ERC-3643 leg
 *      paymentToken.transferFrom(buyer, seller, paymentAmount);     // cash leg
 *
 *  The ERC-3643 token REVERTS (does not silently return false) if the buyer is not
 *  compliant — failed KYC, wrong jurisdiction, lock-up, frozen wallet, or any bound
 *  compliance module saying no. Because both legs share a single transaction, that revert
 *  also rolls back the cash leg. So you never have to reconcile "the security moved but the
 *  payment didn't" (or vice-versa), and you never have to bolt compliance onto settlement as
 *  a separate gate: the token's own `isVerified(buyer)` / `canTransfer(...)` checks ARE the
 *  settlement gate. If anything is wrong, nothing moves.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *  WHY DIRECT (approve-based) SWAP, NOT ESCROW
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *  Seller approves this contract for the security token; buyer approves it for the cash. The
 *  assets never rest in an intermediary: tokens move seller→buyer and buyer→seller directly,
 *  pulled via `transferFrom` at settlement time. For a permissioned token this is cleaner and
 *  safer than escrow — the security is never custodied by a contract that itself would need to
 *  be a KYC-verified holder. (The DvP contract is only an *operator*: ERC-3643 `transferFrom`
 *  checks the `_from`/`_to` parties, never `msg.sender`, so the contract needs only an
 *  allowance, not its own identity claim.)
 *
 *  Supports both primary subscription (issuer = seller → investor = buyer) and secondary
 *  trades (investor A = seller → investor B = buyer) — they differ only in who the seller is.
 */
contract DvPSettlement is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Status {
        None,
        Pending,
        Settled,
        Cancelled
    }

    struct Trade {
        address seller; // delivers the security token (the issuer, for a primary subscription)
        address buyer; // delivers the cash, receives the security
        address securityToken; // ERC-3643 security token
        uint256 securityAmount;
        address paymentToken; // stablecoin / cash token (plain ERC-20)
        uint256 paymentAmount;
        uint64 expiry; // unix seconds; 0 = no expiry
        Status status;
    }

    /// @notice All trades by id. Ids start at 1.
    mapping(uint256 => Trade) public trades;

    /// @notice Number of trades ever created; also the id of the most recent trade.
    uint256 public tradeCount;

    event TradeCreated(
        uint256 indexed tradeId,
        address indexed seller,
        address indexed buyer,
        address securityToken,
        uint256 securityAmount,
        address paymentToken,
        uint256 paymentAmount,
        uint64 expiry
    );
    event TradeSettled(uint256 indexed tradeId);
    event TradeCancelled(uint256 indexed tradeId);

    /**
     * @notice Record the terms of a trade. Called by the seller (issuer or an investor).
     * @dev    Creating a trade moves nothing; both parties must still `approve` this contract
     *         (seller: security token, buyer: cash) before {settle} can succeed. `paymentToken` MUST be a
     *         standard, non-fee-on-transfer, non-rebasing ERC-20 — the cash leg settles by exact
     *         `transferFrom`, not balance reconciliation, so a fee/rebasing token would shortchange the seller.
     * @return tradeId the id of the newly created trade
     */
    function createTrade(
        address buyer,
        address securityToken,
        uint256 securityAmount,
        address paymentToken,
        uint256 paymentAmount,
        uint64 expiry
    ) external returns (uint256 tradeId) {
        require(buyer != address(0), "dvp: zero buyer");
        require(buyer != msg.sender, "dvp: self trade");
        require(securityToken != address(0) && paymentToken != address(0), "dvp: zero token");
        require(securityAmount > 0 && paymentAmount > 0, "dvp: zero amount");
        require(expiry == 0 || expiry > block.timestamp, "dvp: bad expiry");

        tradeId = ++tradeCount;
        trades[tradeId] = Trade({
            seller: msg.sender,
            buyer: buyer,
            securityToken: securityToken,
            securityAmount: securityAmount,
            paymentToken: paymentToken,
            paymentAmount: paymentAmount,
            expiry: expiry,
            status: Status.Pending
        });

        emit TradeCreated(
            tradeId, msg.sender, buyer, securityToken, securityAmount, paymentToken, paymentAmount, expiry
        );
    }

    /// @notice Cancel a still-pending trade. Either counterparty may cancel.
    function cancelTrade(uint256 tradeId) external {
        Trade storage t = trades[tradeId];
        require(t.status == Status.Pending, "dvp: not pending");
        require(msg.sender == t.seller || msg.sender == t.buyer, "dvp: not a party");
        t.status = Status.Cancelled;
        emit TradeCancelled(tradeId);
    }

    /**
     * @notice Atomically settle both legs of `tradeId` in a single transaction.
     * @dev    Callable by either counterparty (both have explicitly approved this contract for
     *         the exact amounts). Reverts as a whole if EITHER leg fails — in particular if the
     *         ERC-3643 compliance check on the buyer fails, which also reverts the cash leg.
     *
     *         Safety: `nonReentrant` + checks-effects-interactions (status flipped to `Settled`
     *         BEFORE any external token call) means a malicious token re-entering {settle} for
     *         the same trade hits `status != Pending` and reverts. The cash leg uses
     *         {SafeERC20} so non-bool-returning stablecoins (USDT-style) are handled correctly.
     */
    function settle(uint256 tradeId) external nonReentrant {
        Trade storage t = trades[tradeId];
        require(t.status == Status.Pending, "dvp: not settleable");
        require(msg.sender == t.seller || msg.sender == t.buyer, "dvp: not a party");
        require(t.expiry == 0 || block.timestamp <= t.expiry, "dvp: expired");

        // Effects before interactions: a reentrant settle() of this trade now fails the guard above.
        t.status = Status.Settled;

        // Leg 1 — DELIVERY (ERC-3643). Reverts if the buyer is not a compliant holder; because
        // this and Leg 2 share one tx, that revert rolls back the payment too. SafeERC20 turns a
        // non-compliant `false`/revert into a hard revert either way.
        IERC20(t.securityToken).safeTransferFrom(t.seller, t.buyer, t.securityAmount);

        // Leg 2 — PAYMENT (cash). Only reached if delivery succeeded; if this reverts, delivery
        // is rolled back as well. Atomic both ways.
        IERC20(t.paymentToken).safeTransferFrom(t.buyer, t.seller, t.paymentAmount);

        emit TradeSettled(tradeId);
    }

    /**
     * @notice Read-only pre-flight: would {settle} succeed right now, and if not, why?
     * @dev    The real {settle} REVERTS on failure (that is the point); this view lets a UI show
     *         a friendly reason and avoid a wasted transaction. It re-checks allowances and transferable
     *         balances, and — for the ERC-3643 leg — the same pause/freeze/identity/compliance gates the
     *         token enforces on transfer (a non-ERC-3643 token simply skips those probes).
     * @return ok     true if a settlement attempt should currently succeed
     * @return reason short human-readable cause when `ok` is false (empty otherwise)
     */
    function canSettle(uint256 tradeId) external view returns (bool ok, string memory reason) {
        Trade storage t = trades[tradeId];
        if (t.status != Status.Pending) return (false, "not pending");
        if (t.expiry != 0 && block.timestamp > t.expiry) return (false, "expired");

        if (IERC20(t.securityToken).allowance(t.seller, address(this)) < t.securityAmount) {
            return (false, "seller allowance too low");
        }
        if (IERC20(t.paymentToken).allowance(t.buyer, address(this)) < t.paymentAmount) {
            return (false, "buyer allowance too low");
        }
        if (IERC20(t.paymentToken).balanceOf(t.buyer) < t.paymentAmount) {
            return (false, "buyer balance too low");
        }

        // ERC-3643 operational + compliance pre-checks — the same gates the token enforces on transfer
        // (partial-freeze-aware balance, pause, wallet freeze, identity, compliance). Each external call is
        // wrapped in its own try/catch: the OUTER catch skips a non-ERC-3643 token (getter absent), while an
        // INNER catch means a configured-but-reverting check that settle would also hit — so report it.
        try IToken(t.securityToken).getFrozenTokens(t.seller) returns (uint256 frozen) {
            if (IERC20(t.securityToken).balanceOf(t.seller) - frozen < t.securityAmount) {
                return (false, "seller transferable balance too low");
            }
        } catch {
            if (IERC20(t.securityToken).balanceOf(t.seller) < t.securityAmount) {
                return (false, "seller balance too low");
            }
        }
        try IToken(t.securityToken).paused() returns (bool isPaused) {
            if (isPaused) return (false, "token paused");
        } catch {}
        try IToken(t.securityToken).isFrozen(t.seller) returns (bool sellerFrozen) {
            if (sellerFrozen) return (false, "seller wallet frozen");
        } catch {}
        try IToken(t.securityToken).isFrozen(t.buyer) returns (bool buyerFrozen) {
            if (buyerFrozen) return (false, "buyer wallet frozen");
        } catch {}
        try IToken(t.securityToken).identityRegistry() returns (IIdentityRegistry reg) {
            try reg.isVerified(t.buyer) returns (bool verified) {
                if (!verified) return (false, "buyer not KYC-verified");
            } catch {
                return (false, "identity check reverted");
            }
        } catch {}
        try IToken(t.securityToken).compliance() returns (IModularCompliance comp) {
            try comp.canTransfer(t.seller, t.buyer, t.securityAmount) returns (bool compliant) {
                if (!compliant) return (false, "compliance rule blocks transfer");
            } catch {
                return (false, "compliance check reverted");
            }
        } catch {}

        return (true, "");
    }
}
