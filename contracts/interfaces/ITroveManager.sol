//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

interface ITroveManager {
    function getTroveStatus(address _borrower) external view returns (uint);
}
