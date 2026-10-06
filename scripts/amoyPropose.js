// Creates a real proposal on the already-deployed SNGLL Governor (Amoy), with a
// harmless action (set a MockTarget value). Cheap, for demo/verification.
//
// Usage:
//   GOVERNOR_ADDRESS=0x82919A... npx hardhat run scripts/amoyPropose.js --network amoy

const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const govAddr = process.env.GOVERNOR_ADDRESS;
  if (!govAddr) throw new Error("Set GOVERNOR_ADDRESS");

  const governor = await hre.ethers.getContractAt("SNGLLGovernor", govAddr);
  console.log("Governor:", govAddr);
  console.log("Proposer:", deployer.address);

  const Target = await hre.ethers.getContractFactory("MockTarget");
  const target = await Target.deploy();
  await target.waitForDeployment();
  const targetAddr = await target.getAddress();
  console.log("MockTarget:", targetAddr);

  const targets = [targetAddr];
  const values = [0];
  const calldatas = [target.interface.encodeFunctionData("setValue", [42])];
  const description = "SNGLL governance test: set value to 42";

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

  const snapshot = await governor.proposalSnapshot(proposalId);
  const deadline = await governor.proposalDeadline(proposalId);
  const state = Number(await governor.state(proposalId));

  console.log("\n=== Proposal created ===");
  console.log("proposalId :", proposalId.toString());
  console.log("tx         :", receipt.hash);
  console.log("state      :", state, "(0=Pending, 1=Active)");
  console.log("snapshot   :", snapshot.toString(), "->", new Date(Number(snapshot) * 1000).toISOString());
  console.log("deadline   :", deadline.toString(), "->", new Date(Number(deadline) * 1000).toISOString());
  console.log("explorer   :", `https://amoy.polygonscan.com/tx/${receipt.hash}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
