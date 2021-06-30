//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";

import "./interfaces/IDODOCallee.sol";
import "./interfaces/IVenusToken.sol";


contract VaultMigration is IDODOCallee {

    constructor() {
        //
    }

    function DVMSellShareCall(
        address payable assetTo,
        uint256,
        uint256 baseAmount,
        uint256 quoteAmount,
        bytes calldata
    ) external override {
        //
    }

    function DPPFlashLoanCall(
        address sender,
        uint256 baseAmount,
        uint256 quoteAmount,
        bytes calldata data
    ) external override {

    }

}
