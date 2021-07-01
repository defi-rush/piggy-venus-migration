//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";


contract MockBorrowerOperations {
    using SafeERC20 for IERC20;

    IERC20 public immutable tokenPUSD;

    constructor(
        IERC20 _tokenPUSD
    ) {
        tokenPUSD = _tokenPUSD;
    }

    function openTrove(
        uint _maxFeePercentage,
        uint _PUSDAmount,
        address _upperHint,
        address _lowerHint
    ) external payable {
        //
    }
}
