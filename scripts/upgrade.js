const { ethers, upgrades } = require("hardhat");

async function main() {
  const proxyAddress = process.env.PROXY_ADDRESS;
  if (!proxyAddress) {
    throw new Error("Falta PROXY_ADDRESS en el archivo .env");
  }

  const newImplementationName = process.env.NEW_IMPLEMENTATION || "SNGLLTokenV2";

  console.log("Red:             ", network.name, `(chainId ${network.config.chainId})`);
  console.log("Proxy:           ", proxyAddress);
  console.log("Nueva impl:      ", newImplementationName);
  console.log("");

  const Factory = await ethers.getContractFactory(newImplementationName);

  // Valida compatibilidad de storage antes de subir
  const upgraded = await upgrades.upgradeProxy(proxyAddress, Factory, {
    kind: "uups",
  });
  await upgraded.waitForDeployment();

  const implAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);

  console.log("=== UPGRADE OK ===");
  console.log("Proxy (igual):   ", await upgraded.getAddress());
  console.log("Nueva impl:      ", implAddress);
  console.log("Nombre:          ", await upgraded.name());
  console.log("Supply:          ", await ethers.formatUnits(await upgraded.totalSupply(), 18));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
