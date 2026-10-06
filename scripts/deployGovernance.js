// Deploys the SNGLL governance: TimelockController + SNGLLGovernor, wired to the
// EXISTING token proxy (which already implements ERC20Votes). No new token.
//
// Usage:
//   npx hardhat run scripts/deployGovernance.js --network amoy
//   npx hardhat run scripts/deployGovernance.js --network polygon
//
// Required env (see .env.example):
//   PROXY_ADDRESS              token proxy (defaults to mainnet proxy)
//   GUARDIAN                   veto holder (defaults to deployer / your Safe)
//   TIMELOCK_DELAY_SECONDS     execution delay after approval (default 2 days)
//   VOTING_DELAY_SECONDS       delay before voting opens (default 1 day)
//   VOTING_PERIOD_SECONDS      how long voting stays open (default 7 days)
//   PROPOSAL_THRESHOLD         tokens to propose (default "5000")
//   QUORUM_PERCENT             quorum % of supply (default 10)

const hre = require("hardhat");

const MAINNET_PROXY = "0x49bdF8568B2b12D466338F3Baa8b236e78a4C457";

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  const token = process.env.PROXY_ADDRESS || MAINNET_PROXY;
  const guardian = process.env.GUARDIAN || deployer.address;

  const timelockDelay = Number(process.env.TIMELOCK_DELAY_SECONDS || 2 * 24 * 60 * 60);
  const votingDelay = Number(process.env.VOTING_DELAY_SECONDS || 24 * 60 * 60);
  const votingPeriod = Number(process.env.VOTING_PERIOD_SECONDS || 7 * 24 * 60 * 60);
  const proposalThreshold = hre.ethers.parseUnits(process.env.PROPOSAL_THRESHOLD || "5000", 18);
  const quorumPercent = Number(process.env.QUORUM_PERCENT || 10);

  console.log("Network         :", hre.network.name);
  console.log("Deployer        :", deployer.address);
  console.log("Token proxy     :", token);
  console.log("Guardian (veto) :", guardian);
  console.log("Timelock delay  :", timelockDelay, "s");
  console.log("Voting delay    :", votingDelay, "s");
  console.log("Voting period   :", votingPeriod, "s");
  console.log("Threshold       :", hre.ethers.formatUnits(proposalThreshold, 18), "SNGLL");
  console.log("Quorum          :", quorumPercent, "%");

  // 1) Timelock (deployer is temporary admin so we can grant roles below).
  //    Set TIMELOCK_ADDRESS to reuse one already deployed (e.g. if a previous
  //    run deployed the timelock but failed on the governor for lack of gas).
  let timelock;
  let timelockAddress = process.env.TIMELOCK_ADDRESS;
  if (timelockAddress) {
    timelock = await hre.ethers.getContractAt("TimelockController", timelockAddress);
    console.log("\nTimelockController (reused):", timelockAddress);
  } else {
    const Timelock = await hre.ethers.getContractFactory("TimelockController");
    timelock = await Timelock.deploy(timelockDelay, [], [], deployer.address);
    await timelock.waitForDeployment();
    timelockAddress = await timelock.getAddress();
    console.log("\nTimelockController:", timelockAddress);
  }

  // 2) Governor.
  const Governor = await hre.ethers.getContractFactory("SNGLLGovernor");
  const governor = await Governor.deploy(
    token,
    timelockAddress,
    votingDelay,
    votingPeriod,
    proposalThreshold,
    quorumPercent,
    guardian,
  );
  await governor.waitForDeployment();
  const governorAddress = await governor.getAddress();
  console.log("SNGLLGovernor   :", governorAddress);

  // 3) Wire the timelock roles and hand it over to itself.
  const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
  const CANCELLER_ROLE = await timelock.CANCELLER_ROLE();
  const EXECUTOR_ROLE = await timelock.EXECUTOR_ROLE();
  const DEFAULT_ADMIN_ROLE = await timelock.DEFAULT_ADMIN_ROLE();

  console.log("\nGranting roles...");
  await (await timelock.grantRole(PROPOSER_ROLE, governorAddress)).wait();
  await (await timelock.grantRole(CANCELLER_ROLE, governorAddress)).wait();
  // Anyone can execute an approved, matured proposal.
  await (await timelock.grantRole(EXECUTOR_ROLE, hre.ethers.ZeroAddress)).wait();
  // The timelock administers itself from now on.
  await (await timelock.renounceRole(DEFAULT_ADMIN_ROLE, deployer.address)).wait();

  console.log("\n=== Governance live ===");
  console.log(
    JSON.stringify(
      { network: hre.network.name, token, timelock: timelockAddress, governor: governorAddress, guardian },
      null,
      2,
    ),
  );
  console.log("\nNext: verify the two contracts on PolygonScan, then tell holders to delegate.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
