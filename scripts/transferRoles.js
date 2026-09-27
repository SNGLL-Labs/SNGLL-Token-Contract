const { ethers } = require("hardhat");

/**
 * Handover de roles del deployer (EOA / MetaMask) a un Safe multisig.
 *
 * Orden critico:
 *   1) OTORGAR DEFAULT_ADMIN_ROLE y UPGRADER_ROLE al Safe
 *   2) RENUNCIAR a esos roles desde el EOA
 *
 * Nunca renuncies antes de otorgar, o el contrato queda sin admin.
 */
async function main() {
  const proxyAddress = process.env.PROXY_ADDRESS;
  const safeAddress = process.env.SAFE_ADDRESS;

  if (!proxyAddress) throw new Error("Falta PROXY_ADDRESS en el archivo .env");
  if (!safeAddress) throw new Error("Falta SAFE_ADDRESS en el archivo .env");

  const [deployer] = await ethers.getSigners();
  const token = await ethers.getContractAt("SNGLLToken", proxyAddress);

  const ADMIN_ROLE = await token.DEFAULT_ADMIN_ROLE();
  const UPGRADER_ROLE = await token.UPGRADER_ROLE();

  console.log("Red:      ", network.name, `(chainId ${network.config.chainId})`);
  console.log("Token:    ", proxyAddress);
  console.log("Deployer: ", deployer.address);
  console.log("Safe:     ", safeAddress);
  console.log("");

  // --- 1) Otorgar roles al Safe ---
  if (!(await token.hasRole(ADMIN_ROLE, safeAddress))) {
    console.log("grantRole(DEFAULT_ADMIN_ROLE, safe)...");
    await (await token.grantRole(ADMIN_ROLE, safeAddress)).wait();
  } else {
    console.log("Safe ya tiene DEFAULT_ADMIN_ROLE");
  }

  if (!(await token.hasRole(UPGRADER_ROLE, safeAddress))) {
    console.log("grantRole(UPGRADER_ROLE, safe)...");
    await (await token.grantRole(UPGRADER_ROLE, safeAddress)).wait();
  } else {
    console.log("Safe ya tiene UPGRADER_ROLE");
  }

  // --- 2) Renunciar desde el EOA (solo si CONFIRM_RENOUNCE=true) ---
  const confirmRenounce = process.env.CONFIRM_RENOUNCE === "true";

  if (!confirmRenounce) {
    console.log("");
    console.log("Roles otorgados al Safe. NO se renuncia todavia (modo seguro).");
    console.log("Antes de renunciar:");
    console.log("  1) Prueba que el Safe puede firmar y ejecutar una transaccion.");
    console.log("  2) Pon CONFIRM_RENOUNCE=true en el .env y vuelve a correr.");
    console.log("Al renunciar, el EOA pierde el control PARA SIEMPRE.");
  } else {
    if (await token.hasRole(UPGRADER_ROLE, deployer.address)) {
      console.log("renounceRole(UPGRADER_ROLE, deployer)...");
      await (await token.renounceRole(UPGRADER_ROLE, deployer.address)).wait();
    }

    if (await token.hasRole(ADMIN_ROLE, deployer.address)) {
      console.log("renounceRole(DEFAULT_ADMIN_ROLE, deployer)...");
      await (await token.renounceRole(ADMIN_ROLE, deployer.address)).wait();
    }
  }

  console.log("");
  console.log("=== VERIFICACION ===");
  console.log("Safe     -> admin:   ", await token.hasRole(ADMIN_ROLE, safeAddress));
  console.log("Safe     -> upgrader:", await token.hasRole(UPGRADER_ROLE, safeAddress));
  console.log("Deployer -> admin:   ", await token.hasRole(ADMIN_ROLE, deployer.address));
  console.log("Deployer -> upgrader:", await token.hasRole(UPGRADER_ROLE, deployer.address));
  console.log("");
  console.log("El deployer debe quedar en false/false.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
