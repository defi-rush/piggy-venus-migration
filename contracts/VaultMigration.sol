//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./interfaces/IDODOCallee.sol";
import "./interfaces/IVenusToken.sol";


contract VaultMigration is IDODOCallee {
    using SafeERC20 for IERC20;

    bytes dataVars;
    address stablePool;

    IERC20 public immutable tokenBUSD;
    IERC20 public immutable tokenPUSD;

    IVenusToken public immutable vBNB;
    IVenusToken public immutable vBUSD;

    constructor(
        address _stablePool,
        IERC20 _tokenBUSD,
        IERC20 _tokenPUSD,
        IVenusToken _vBNB,
        IVenusToken _vBUSD
    ) {
        stablePool = _stablePool;
        tokenBUSD = _tokenBUSD;
        tokenPUSD = _tokenPUSD;
        vBNB = _vBNB;
        vBUSD = _vBUSD;
    }

    /**
     * @param      sender  The owner of venus collateral and debt
     */
    function _getVenusBalance(address sender) internal returns (uint256, uint256) {
        vBNB.accrueInterest();
        vBUSD.accrueInterest();
        uint256 balanceOfUnderlying = vBNB.balanceOfUnderlying(sender);
        uint256 borrowBalance = vBUSD.borrowBalanceStored(sender);
        return (balanceOfUnderlying, borrowBalance);
    }

    function _repayFlashLoan() internal {
        uint256 balanceBUSD = tokenBUSD.balanceOf(address(this));
        uint256 balancePUSD = tokenPUSD.balanceOf(address(this));
        console.log('BUSD', balanceBUSD);
        console.log('PUSD', balancePUSD);
        console.log('stablePool', stablePool);
        tokenBUSD.transfer(stablePool, balanceBUSD);
        tokenPUSD.transfer(stablePool, balancePUSD);
    }

    function DSPFlashLoanCall(
        address sender,
        uint256 baseAmount,
        uint256 quoteAmount,
        bytes calldata data
    ) external override {
        console.log(1, sender, baseAmount, quoteAmount);
        dataVars = data;
        (address v1, uint256 v2) = abi.decode(data, (address, uint256));
        console.log('decoded', v1, v2);
        (uint256 bnbDeposited, uint256 busdBorrowed) = _getVenusBalance(sender);
        console.log('venus', bnbDeposited, busdBorrowed);
        _repayFlashLoan();
    }

}
