# Vendored — Tokeny T-REX (ERC-3643)

- **Source:** https://github.com/TokenySolutions/T-REX (npm `@tokenysolutions/t-rex`)
- **Version:** `4.1.6` (last stable before the repo was archived Oct 2025)
- **License:** GPL-3.0 — see `LICENSE.md` in this directory
- **Solidity:** `pragma solidity 0.8.17`
- **Contents:** the production `contracts/` tree, **UNMODIFIED**. The `_testContracts/`
  mocks (used only by T-REX's own Hardhat test suite) are excluded.

**Do not edit these files.** This is audited, standard code. Our original contracts
(`KiltIdentityBridge.sol`, `DvPSettlement.sol`) integrate at the public interfaces
(`IClaimIssuer`, `IIdentityRegistry`, `IToken`, `IModularCompliance`) — never by forking
the suite. Keeping T-REX pristine is the whole point: institutional reviewers can diff it
against upstream.

**To refresh:**
```
pnpm --filter @cowchain/contracts add -D @tokenysolutions/t-rex@<version>
# then re-copy node_modules/@tokenysolutions/t-rex/contracts/ → src/trex/ (minus _testContracts)
```

Dependencies (OpenZeppelin v4.8.3, ONCHAINID 2.2.1) resolve from `node_modules` via
`remappings.txt`; they are not copied here.
