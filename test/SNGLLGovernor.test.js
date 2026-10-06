const { expect } = require("chai");
const { ethers, upgrades, network } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const DAY = 24 * 60 * 60;
const VOTING_DELAY = DAY;
const VOTING_PERIOD = 7 * DAY;
const TIMELOCK_DELAY = 2 * DAY;
const THRESHOLD = ethers.parseUnits("5000", 18);
const QUORUM_PERCENT = 10;

const ProposalState = { Pending: 0, Active: 1, Canceled: 2, Defeated: 3, Succeeded: 4, Queued: 5, Expired: 6, Executed: 7 };

async function proposalIdFrom(tx, governor) {
  const receipt = await tx.wait();
  for (const log of receipt.logs) {
    try {
      const parsed = governor.interface.parseLog(log);
      if (parsed && parsed.name === "ProposalCreated") return parsed.args.proposalId;
    } catch {
      /* not from the governor */
    }
  }
  throw new Error("ProposalCreated not found");
}

describe("SNGLL governance (Governor + Timelock over the real token)", function () {
  let token, timelock, governor, target;
  let deployer, stranger;
  let snapshotId;

  // Advancing time (voting windows) mutates the shared Hardhat network and can
  // expire later test files (e.g. permit deadlines). Snapshot here and revert
  // after the whole file so the network time and state are restored.
  before(async () => {
    snapshotId = await network.provider.send("evm_snapshot");
  });

  after(async () => {
    await network.provider.send("evm_revert", [snapshotId]);
  });

  beforeEach(async () => {
    [deployer, , stranger] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("SNGLLToken");
    token = await upgrades.deployProxy(
      Token,
      [deployer.address, deployer.address, deployer.address],
      { kind: "uups" },
    );
    await token.waitForDeployment();

    // Activate votes (ERC20Votes: balance alone gives 0 votes until you delegate).
    await (await token.delegate(deployer.address)).wait();
    await time.increase(60); // let the checkpoint land before proposing

    const Timelock = await ethers.getContractFactory("TimelockController");
    timelock = await Timelock.deploy(TIMELOCK_DELAY, [], [], deployer.address);
    await timelock.waitForDeployment();

    const Governor = await ethers.getContractFactory("SNGLLGovernor");
    governor = await Governor.deploy(
      await token.getAddress(),
      await timelock.getAddress(),
      VOTING_DELAY,
      VOTING_PERIOD,
      THRESHOLD,
      QUORUM_PERCENT,
      deployer.address, // guardian (veto) = deployer in the test
    );
    await governor.waitForDeployment();

    await (await timelock.grantRole(await timelock.PROPOSER_ROLE(), await governor.getAddress())).wait();
    await (await timelock.grantRole(await timelock.CANCELLER_ROLE(), await governor.getAddress())).wait();
    await (await timelock.grantRole(await timelock.EXECUTOR_ROLE(), ethers.ZeroAddress)).wait();
    await (await timelock.renounceRole(await timelock.DEFAULT_ADMIN_ROLE(), deployer.address)).wait();

    const Target = await ethers.getContractFactory("MockTarget");
    target = await Target.deploy();
    await target.waitForDeployment();
  });

  it("has the configured parameters", async () => {
    expect(await governor.votingDelay()).to.equal(VOTING_DELAY);
    expect(await governor.votingPeriod()).to.equal(VOTING_PERIOD);
    expect(await governor.proposalThreshold()).to.equal(THRESHOLD);
    expect(await governor.proposalGuardian()).to.equal(deployer.address);
    expect(await governor.timelock()).to.equal(await timelock.getAddress());
  });

  it("rejects proposals from accounts without enough votes", async () => {
    const targets = [await target.getAddress()];
    const calldatas = [target.interface.encodeFunctionData("setValue", [42])];
    await expect(
      governor.connect(stranger).propose(targets, [0], calldatas, "no votes"),
    ).to.be.revertedWithCustomError(governor, "GovernorInsufficientProposerVotes");
  });

  it("runs the full lifecycle: propose -> vote -> queue -> execute", async () => {
    const targets = [await target.getAddress()];
    const values = [0];
    const calldatas = [target.interface.encodeFunctionData("setValue", [42])];
    const description = "Set value to 42";

    const proposalId = await proposalIdFrom(await governor.propose(targets, values, calldatas, description), governor);

    await time.increase(VOTING_DELAY + 1);
    expect(await governor.state(proposalId)).to.equal(ProposalState.Active);
    await governor.castVote(proposalId, 1); // For

    await time.increase(VOTING_PERIOD + 1);
    expect(await governor.state(proposalId)).to.equal(ProposalState.Succeeded);

    const descriptionHash = ethers.id(description);
    await governor.queue(targets, values, calldatas, descriptionHash);

    await time.increase(TIMELOCK_DELAY + 1);
    await governor.execute(targets, values, calldatas, descriptionHash);

    expect(await target.value()).to.equal(42n);
    expect(await governor.state(proposalId)).to.equal(ProposalState.Executed);
  });

  it("lets the guardian veto (cancel) a proposal", async () => {
    const targets = [await target.getAddress()];
    const values = [0];
    const calldatas = [target.interface.encodeFunctionData("setValue", [7])];
    const description = "Cancel me";

    const proposalId = await proposalIdFrom(await governor.propose(targets, values, calldatas, description), governor);

    await expect(governor.cancel(targets, values, calldatas, ethers.id(description))).to.emit(
      governor,
      "ProposalCanceled",
    );
    expect(await governor.state(proposalId)).to.equal(ProposalState.Canceled);
  });
});
