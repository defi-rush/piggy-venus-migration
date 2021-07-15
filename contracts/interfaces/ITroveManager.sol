//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

interface ITroveManager {
    function getTroveStatus(address _borrower) external view returns (uint);
    function getBorrowingFeeWithDecay(uint _LUSDDebt) external view returns (uint);
    function LUSD_GAS_COMPENSATION() external view returns (uint256);
    function MIN_NET_DEBT() external view returns (uint256);
    function MCR() external view returns (uint256);
}
