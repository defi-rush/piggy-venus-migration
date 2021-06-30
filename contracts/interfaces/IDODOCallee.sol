//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;


interface IDODOCallee {

    function DVMSellShareCall(
        address payable assetTo,
        uint256,
        uint256 baseAmount,
        uint256 quoteAmount,
        bytes calldata
    ) external;

    function DPPFlashLoanCall(
        address sender,
        uint256 baseAmount,
        uint256 quoteAmount,
        bytes calldata data
    ) external;

}
