require("@nomicfoundation/hardhat-toolbox");
require("@openzeppelin/hardhat-upgrades");
require("dotenv").config();

const AMOY_RPC_URL =
  process.env.AMOY_RPC_URL || "https://rpc-amoy.polygon.technology";
const POLYGON_RPC_URL =
  process.env.POLYGON_RPC_URL || "https://polygon-rpc.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const accounts = PRIVATE_KEY ? [PRIVATE_KEY] : [];

module.exports = {
  solidity: {
    version: "0.8.37",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      // OpenZeppelin v5.7 usa MCOPY -> requiere Cancun (Polygon lo soporta desde Napoli)
      evmVersion: "cancun",
    },
  },
  networks: {
    amoy: {
      url: AMOY_RPC_URL,
      chainId: 80002,
      accounts,
      // Amoy esta aceptando 25 gwei; el sugerido (48) encarece el deploy
      gasPrice: 25000000000,
    },
    polygon: {
      url: POLYGON_RPC_URL,
      chainId: 137,
      accounts,
    },
  },
  etherscan: {
    // PolygonScan forma parte de la API unificada de Etherscan (v2)
    apiKey: process.env.ETHERSCAN_API_KEY || "",
  },
  sourcify: {
    enabled: false,
  },
};
