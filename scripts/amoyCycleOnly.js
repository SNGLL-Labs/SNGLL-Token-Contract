// Continues a fast governance cycle on ALREADY deployed contracts (no deploys):
// propose -> vote -> wait -> queue -> wait -> execute, against a MockTarget.
//
// Usage:
//   GOVERNOR_ADDRESS=0x... TARGET_ADDRESS=0x... npx hardhat run scripts/amoyCycleOnly.js --network amoy

const hre = require("hardhat");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const VOTING_PERIOD = 240; // must match the fast governor
const TIMELOCK_DELAY = 60; // must match the fast timelock

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
  const govAddr = process.env.GOVERNOR_ADDRESS;
  const targetAddr = process.env.TARGET_ADDRESS;
  if (!govAddr || !targetAddr) throw new Error("Set GOVERNOR_ADDRESS and TARGET_ADDRESS");

  const governor = await hre.ethers.getContractAt("SNGLLGovernor", govAddr);
  const target = await hre.ethers.getContractAt("MockTarget", targetAddr);
  console.log("Governor:", govAddr);
  console.log("Target  :", targetAddr);

  const targets = [targetAddr];
  const values = [0];
  const calldatas = [target.interface.encodeFunctionData("setValue", [42])];
  const description = "Fast test: set value to 42";

  console.log("\n[1] propose() ...");
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

  console.log("\n[2] wait Active + castVote(For) ...");
  await waitState(governor, proposalId, 1);
  const voteTx = await governor.castVote(proposalId, 1);
  await voteTx.wait();
  console.log("  voted. tx:", voteTx.hash);

  console.log(`\n[3] wait ${VOTING_PERIOD}s for voting to close ...`);
  await waitState(governor, proposalId, 4);

  console.log("\n[4] queue() ...");
  const descHash = hre.ethers.id(description);
  const queueTx = await governor.queue(targets, values, calldatas, descHash);
  await queueTx.wait();
  console.log("  queued. tx:", queueTx.hash);

  console.log(`\n[5] wait ${TIMELOCK_DELAY}s then execute() ...`);
  await sleep((TIMELOCK_DELAY + 15) * 1000);
  const execTx = await governor.execute(targets, values, calldatas, descHash);
  await execTx.wait();
  console.log("  executed. tx:", execTx.hash);
  console.log("  target.value():", (await target.value()).toString());

  console.log("\n=== FULL CYCLE OK ===");
  console.log(JSON.stringify({ governor: govAddr, target: targetAddr, proposalId: proposalId.toString() }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
