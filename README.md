# SNGLL Token

Utility token of **SNGLL Labs**, deployed on **Polygon PoS**.

> SNGLL Labs — crypto & AI innovation and service provider · https://sngll.org

---

## Overview

SNGLL is a fixed-supply **ERC-20** token built on OpenZeppelin Contracts and deployed behind a
**UUPS (ERC-1967) proxy**. The proxy pattern lets the contract logic be upgraded in the future
without changing the token address and without affecting holders' balances.

- **Fixed supply** — 1,200,000,000 SNGLL, minted once at deployment. There is **no `mint` function**.
- **Burnable** — holders can burn their own tokens.
- **Permit (EIP-2612)** — gasless approvals via off-chain signatures.
- **Votes** — historical balance checkpoints (timestamp-based) for governance.
- **Role-based access control** — `DEFAULT_ADMIN_ROLE` and `UPGRADER_ROLE`.
- **Upgradeable (UUPS)** — logic upgrades authorized by `UPGRADER_ROLE`.

## Token details

| | |
|---|---|
| **Name** | SNGLL Token |
| **Symbol** | SNGLL |
| **Decimals** | 18 |
| **Total supply** | 1,200,000,000 SNGLL (fixed) |
| **Standard** | ERC-20 (+ Burnable, Permit, Votes) |
| **Network** | Polygon PoS (chain ID 137) |
| **Compiler** | Solidity 0.8.37 · EVM target `cancun` · optimizer 200 runs |
| **Library** | OpenZeppelin Contracts 5.6.1 |

## Deployed addresses — Polygon mainnet

| Contract | Address |
|---|---|
| **Token (proxy)** | [`0x49bdF8568B2b12D466338F3Baa8b236e78a4C457`](https://polygonscan.com/token/0x49bdF8568B2b12D466338F3Baa8b236e78a4C457) |
| Implementation (v1) | [`0xE596C8c0bffE820D4696Ab3389aA44a2a6D92103`](https://polygonscan.com/address/0xE596C8c0bffE820D4696Ab3389aA44a2a6D92103) |
| Safe multisig | [`0xA6DE34de0C149C0a444535de4EC60C4f48d84cF0`](https://polygonscan.com/address/0xA6DE34de0C149C0a444535de4EC60C4f48d84cF0) |

> Always use the **proxy** address (`0x49bdF8...`). It is the stable token address and never changes, even after an upgrade.

## Security model

- Privileged roles (`DEFAULT_ADMIN_ROLE`, `UPGRADER_ROLE`) are held by a **Safe multisig** on Polygon.
- The Safe is **2-of-2**, with an account-recovery module (56-day delay).
- Upgrades are only authorized by `UPGRADER_ROLE` — the logic can be improved or patched, but never by an unauthorized account.
- Supply is **fixed**: no `mint`, no hidden inflation.

## Repository layout

```
contracts/
  SNGLLToken.sol      ERC-20: Burnable + Permit + Votes + AccessControl + UUPS
  SNGLLTokenV2.sol    Example upgrade (name/symbol override, permit-safe)
scripts/
  deploy.js           Deploys the UUPS proxy
  upgrade.js          Upgrades the implementation
  transferRoles.js    Grants roles to a Safe and (optionally) renounces the deployer
test/
  SNGLLToken.test.js  11 tests: metadata, supply, roles, burn, permit, votes, upgrade, handover
hardhat.config.js     Polygon (137) + Amoy (80002), solc 0.8.37
```

## Setup

```bash
npm install
cp .env.example .env   # fill in your values (never commit .env)
```

Required `.env` values:

```
AMOY_RPC_URL=            # Amoy testnet RPC
POLYGON_RPC_URL=         # Polygon mainnet RPC
PRIVATE_KEY=             # deployer wallet private key
ETHERSCAN_API_KEY=       # polygonscan.com API key
RECIPIENT=               # receives the 1.2B supply
DEFAULT_ADMIN=           # gets DEFAULT_ADMIN_ROLE
UPGRADER=                # gets UPGRADER_ROLE
```

## Commands

```bash
npm run compile            # compile
npm test                   # run tests

npm run deploy:amoy        # deploy to Amoy (testnet)
npm run deploy:polygon     # deploy to Polygon mainnet

npm run upgrade:amoy       # upgrade on Amoy
npm run upgrade:polygon    # upgrade on Polygon

npm run roles:amoy         # grant roles to the Safe (Amoy)
npm run roles:polygon      # grant roles to the Safe (Polygon)

# verification
npx hardhat verify --network polygon <PROXY_ADDRESS>
```

`transferRoles.js` runs in **safe mode**: it grants the roles to the Safe but does **not**
renounce the deployer's roles unless `CONFIRM_RENOUNCE=true` is set in `.env`.

## Tests

```bash
npm test
```

Covers: metadata, full supply minting, role assignment, absence of `mint`, burning,
permit (`EIP-2612`), timestamp clock mode, vote delegation, upgrade authorization,
role handover to a Safe, and a `name`/`symbol` upgrade that keeps `permit` working.

## Links

- Website: https://sngll.org
- Token on PolygonScan: https://polygonscan.com/token/0x49bdF8568B2b12D466338F3Baa8b236e78a4C457

## License

MIT
