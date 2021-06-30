//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;


interface IDODOCallee {

    function DSPFlashLoanCall(
        address sender,
        uint256 baseAmount,
        uint256 quoteAmount,
        bytes calldata data
    ) external;

}
