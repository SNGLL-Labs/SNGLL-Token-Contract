// Full end-to-end governance cycle on a FAST test instance (for demo/testing):
// deploys its own Timelock + Governor with short delays, delegates, then runs
// propose -> vote -> queue -> execute against a MockTarget.
//
// Usage (Amoy):
//   PROXY_ADDRESS=0xE596... npx hardhat run scripts/amoyFullCycleTest.js --network amoy

const hre = require("hardhat");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const VOTING_DELAY = 0; // seconds
const VOTING_PERIOD = 240; // seconds (4 min)
const TIMELOCK_DELAY = 60; // seconds
const QUORUM_PERCENT = 10;
const THRESHOLD = hre.ethers.parseUnits("5000", 18);

async function waitState(governor, proposalId, target, timeoutMs = 8 * 60 * 1000) {
  const start = Date.now();
  let last = -1;
  while (Date.now() - start < timeoutMs) {
    const s = Number(await governor.state(proposalId));
    if (s !== last) {
      console.log("  state ->", s);
      last = s;
    }
    if (s === target) return;
    await sleep(10000);
  }
  throw new Error(`timeout waiting for state ${target}`);
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const tokenAddr = process.env.PROXY_ADDRESS;
  if (!tokenAddr) throw new Error("Set PROXY_ADDRESS");

  console.log("Deployer:", deployer.address);
  console.log("Token   :", tokenAddr);

  const token = await hre.ethers.getContractAt("SNGLLToken", tokenAddr);

  // 1) Activate votes.
  console.log("\n[1] delegate() ...");
  await (await token.delegate(deployer.address)).wait();
  console.log("  votes:", hre.ethers.formatUnits(await token.getVotes(deployer.address), 18));

  // 2) Fast Timelock + Governor + target.
  console.log("\n[2] deploying fast Timelock + Governor + target ...");
  const Timelock = await hre.ethers.getContractFactory("TimelockController");
  const timelock = await Timelock.deploy(TIMELOCK_DELAY, [], [], deployer.address);
  await timelock.waitForDeployment();
  const timelockAddr = await timelock.getAddress();

  const Governor = await hre.ethers.getContractFactory("SNGLLGovernor");
  const governor = await Governor.deploy(
    tokenAddr,
    timelockAddr,
    VOTING_DELAY,
    VOTING_PERIOD,
    THRESHOLD,
    QUORUM_PERCENT,
    deployer.address,
  );
  await governor.waitForDeployment();
  const govAddr = await governor.getAddress();

  const Target = await hre.ethers.getContractFactory("MockTarget");
  const target = await Target.deploy();
  await target.waitForDeployment();
  const targetAddr = await target.getAddress();

  console.log("  fastTimelock:", timelockAddr);
  console.log("  fastGovernor:", govAddr);
  console.log("  target      :", targetAddr);

  console.log("\n[3] wiring roles ...");
  await (await timelock.grantRole(await timelock.PROPOSER_ROLE(), govAddr)).wait();
  await (await timelock.grantRole(await timelock.CANCELLER_ROLE(), govAddr)).wait();
  await (await timelock.grantRole(await timelock.EXECUTOR_ROLE, hre.ethers.ZeroAddress)).wait();
  await (await timelock.renounceRole(await timelock.DEFAULT_ADMIN_ROLE(), deployer.address)).wait();

  // 4) Propose.
  console.log("\n[4] propose() ...");
  const targets = [targetAddr];
  const values = [0];
  const calldatas = [target.interface.encodeFunctionData("setValue", [42])];
  const description = "Fast test: set value to 42";
  const tx = await governor.propose(targets, values, calldatas, description);
  const receipt = await tx.wait();
  let proposalId;
  for (const log of receipt.logs) {
    try {
      const parsed = governor.interface.parseLog(log);
      if (parsed && parsed.name === "ProposalCreated") proposalId = parsed.args.proposalId;
    } catch {
      /* ignore */
    }
  }
  console.log("  proposalId:", proposalId.toString(), "| tx:", receipt.hash);

  // 5) Vote.
  console.log("\n[5] waiting for Active then castVote(For) ...");
  await waitState(governor, proposalId, 1); // Active
  const voteTx = await governor.castVote(proposalId, 1);
  await voteTx.wait();
  console.log("  voted. tx:", voteTx.hash);

  // 6) Wait for Succeeded.
  console.log(`\n[6] waiting ${VOTING_PERIOD}s for the voting period to close ...`);
  await waitState(governor, proposalId, 4); // Succeeded

  // 7) Queue.
  console.log("\n[7] queue() ...");
  const descHash = hre.ethers.id(description);
  const queueTx = await governor.queue(targets, values, calldatas, descHash);
  await queueTx.wait();
  console.log("  queued. tx:", queueTx.hash);

  // 8) Wait timelock delay, execute.
  console.log(`\n[8] waiting ${TIMELOCK_DELAY}s timelock delay then execute() ...`);
  await sleep((TIMELOCK_DELAY + 15) * 1000);
  const execTx = await governor.execute(targets, values, calldatas, descHash);
  await execTx.wait();
  console.log("  executed. tx:", execTx.hash);
  console.log("  target.value():", (await target.value()).toString());

  console.log("\n=== FULL CYCLE OK ===");
  console.log(
    JSON.stringify(
      {
        token: tokenAddr,
        fastTimelock: timelockAddr,
        fastGovernor: govAddr,
        target: targetAddr,
        proposalId: proposalId.toString(),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
