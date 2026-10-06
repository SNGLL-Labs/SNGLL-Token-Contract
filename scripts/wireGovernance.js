// Wires the TimelockController roles for an already deployed SNGLLGovernor.
// Idempotent: safe to re-run. Use it if deployGovernance.js deployed the
// governor and timelock but failed while granting roles.
//
// Usage:
//   TIMELOCK_ADDRESS=0x... GOVERNOR_ADDRESS=0x... npx hardhat run scripts/wireGovernance.js --network amoy

const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const timelockAddress = process.env.TIMELOCK_ADDRESS;
  const governorAddress = process.env.GOVERNOR_ADDRESS;
  if (!timelockAddress || !governorAddress) {
    throw new Error("Set TIMELOCK_ADDRESS and GOVERNOR_ADDRESS");
  }

  const timelock = await hre.ethers.getContractAt("TimelockController", timelockAddress);
  console.log("Deployer :", deployer.address);
  console.log("Timelock :", timelockAddress);
  console.log("Governor :", governorAddress);

  const roles = [
    [await timelock.PROPOSER_ROLE(), governorAddress],
    [await timelock.CANCELLER_ROLE(), governorAddress],
    [await timelock.EXECUTOR_ROLE(), hre.ethers.ZeroAddress],
  ];

  for (const [role, account] of roles) {
    if (await timelock.hasRole(role, account)) {
      console.log("already set:", role, account);
      continue;
    }
    await (await timelock.grantRole(role, account)).wait();
    console.log("granted    :", role, "->", account);
  }

  const adminRole = await timelock.DEFAULT_ADMIN_ROLE();
  if (await timelock.hasRole(adminRole, deployer.address)) {
    await (await timelock.renounceRole(adminRole, deployer.address)).wait();
    console.log("deployer renounced DEFAULT_ADMIN_ROLE");
  } else {
    console.log("deployer is not admin (already renounced).");
  }

  console.log("\nGovernance wired. Timelock now administers itself.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
