// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.6.1
pragma solidity ^0.8.37;

import {Governor} from "@openzeppelin/contracts/governance/Governor.sol";
import {GovernorSettings} from "@openzeppelin/contracts/governance/extensions/GovernorSettings.sol";
import {GovernorCountingSimple} from "@openzeppelin/contracts/governance/extensions/GovernorCountingSimple.sol";
import {GovernorVotes} from "@openzeppelin/contracts/governance/extensions/GovernorVotes.sol";
import {GovernorVotesQuorumFraction} from "@openzeppelin/contracts/governance/extensions/GovernorVotesQuorumFraction.sol";
import {GovernorTimelockControl} from "@openzeppelin/contracts/governance/extensions/GovernorTimelockControl.sol";
import {GovernorProposalGuardian} from "@openzeppelin/contracts/governance/extensions/GovernorProposalGuardian.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {IVotes} from "@openzeppelin/contracts/governance/utils/IVotes.sol";

/**
 * SNGLL on-chain governance.
 *
 * - Voting power comes from the existing SNGLL token (UUPS proxy), which already
 *   implements ERC20Votes (delegation + checkpoints with a timestamp clock). No
 *   token is created or upgraded for this.
 * - Only standard OpenZeppelin extensions are used, so wallets and governance
 *   dashboards (Tally, Boardroom, etc.) understand it out of the box:
 *     GovernorSettings          -> voting delay / period / proposal threshold
 *     GovernorCountingSimple    -> For / Against / Abstain
 *     GovernorVotes             -> reads getPastVotes from the token
 *     GovernorVotesQuorumFraction -> quorum as a % of the (past) total supply
 *     GovernorTimelockControl   -> execution delayed through the Timelock
 *     GovernorProposalGuardian  -> institutional veto (can cancel any proposal)
 *
 * Holders must delegate (to themselves or a delegate) to activate their votes.
 */
contract SNGLLGovernor is
    Governor,
    GovernorSettings,
    GovernorCountingSimple,
    GovernorVotes,
    GovernorVotesQuorumFraction,
    GovernorTimelockControl,
    GovernorProposalGuardian
{
    constructor(
        IVotes token_,
        TimelockController timelock_,
        uint48 votingDelay_,
        uint32 votingPeriod_,
        uint256 proposalThreshold_,
        uint256 quorumPercent_,
        address guardian_
    )
        Governor("SNGLL Governor")
        GovernorSettings(votingDelay_, votingPeriod_, proposalThreshold_)
        GovernorVotes(token_)
        GovernorVotesQuorumFraction(quorumPercent_)
        GovernorTimelockControl(timelock_)
    {
        // Initial veto holder (e.g. the SNGLL Safe). Changing it later requires a
        // governance proposal (setProposalGuardian is onlyGovernance).
        _setProposalGuardian(guardian_);
    }

    // ------------------------------------------------------------------
    // Overrides required by assembling the extensions
    // ------------------------------------------------------------------

    function votingDelay() public view override(Governor, GovernorSettings) returns (uint256) {
        return super.votingDelay();
    }

    function votingPeriod() public view override(Governor, GovernorSettings) returns (uint256) {
        return super.votingPeriod();
    }

    function proposalThreshold() public view override(Governor, GovernorSettings) returns (uint256) {
        return super.proposalThreshold();
    }

    function quorum(
        uint256 timepoint
    ) public view override(Governor, GovernorVotesQuorumFraction) returns (uint256) {
        return super.quorum(timepoint);
    }

    function state(
        uint256 proposalId
    ) public view override(Governor, GovernorTimelockControl) returns (ProposalState) {
        return super.state(proposalId);
    }

    function proposalNeedsQueuing(
        uint256 proposalId
    ) public view override(Governor, GovernorTimelockControl) returns (bool) {
        return super.proposalNeedsQueuing(proposalId);
    }

    function _validateCancel(
        uint256 proposalId,
        address caller
    ) internal view override(Governor, GovernorProposalGuardian) returns (bool) {
        return super._validateCancel(proposalId, caller);
    }

    function _queueOperations(
        uint256 proposalId,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) returns (uint48) {
        return super._queueOperations(proposalId, targets, values, calldatas, descriptionHash);
    }

    function _executeOperations(
        uint256 proposalId,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) {
        super._executeOperations(proposalId, targets, values, calldatas, descriptionHash);
    }

    function _cancel(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) returns (uint256) {
        return super._cancel(targets, values, calldatas, descriptionHash);
    }

    function _executor() internal view override(Governor, GovernorTimelockControl) returns (address) {
        return super._executor();
    }
}
