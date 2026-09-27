const { ethers, upgrades } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();

  const recipient = process.env.RECIPIENT || deployer.address;
  const defaultAdmin = process.env.DEFAULT_ADMIN || deployer.address;
  const upgrader = process.env.UPGRADER || deployer.address;

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Red:            ", network.name, `(chainId ${network.config.chainId})`);
  console.log("Deployer:       ", deployer.address);
  console.log("Balance:        ", ethers.formatEther(balance), "POL");
  console.log("Recipient:      ", recipient);
  console.log("Default admin:  ", defaultAdmin);
  console.log("Upgrader:       ", upgrader);
  console.log("");

  const Factory = await ethers.getContractFactory("SNGLLToken");
  const proxy = await upgrades.deployProxy(
    Factory,
    [recipient, defaultAdmin, upgrader],
    { kind: "uups" }
  );
  await proxy.waitForDeployment();

  const proxyAddress = await proxy.getAddress();
  const implAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);

  console.log("=== DEPLOY OK ===");
  console.log("Proxy (token):  ", proxyAddress);
  console.log("Implementacion: ", implAddress);
  console.log("Nombre:         ", await proxy.name());
  console.log("Simbolo:        ", await proxy.symbol());
  console.log("Decimales:      ", (await proxy.decimals()).toString());
  console.log("Supply:         ", ethers.formatUnits(await proxy.totalSupply(), 18));
  console.log("");
  console.log("Verifica en el explorer:");
  console.log(`  npx hardhat verify --network ${network.name} ${proxyAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
