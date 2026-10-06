// SPDX-License-Identifier: MIT
pragma solidity ^0.8.37;

/// Minimal target the governance can call in tests.
contract MockTarget {
    uint256 public value;

    function setValue(uint256 newValue) external {
        value = newValue;
    }
}
