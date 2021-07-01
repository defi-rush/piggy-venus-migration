//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./interfaces/IDODOCallee.sol";
import "./interfaces/IVenusToken.sol";
import "./interfaces/IVenusPriceOracle.sol";


contract VaultMigration is IDODOCallee {
    using SafeERC20 for IERC20;

    bytes dataVars;
    address stablePool;

    IVenusPriceOracle vPriceOracle;

    IERC20 public immutable tokenBUSD;
    IERC20 public immutable tokenPUSD;

    IVenusToken public immutable vBNB;
    IVenusToken public immutable vBUSD;

    constructor(
        address _stablePool,
        IVenusPriceOracle _vPriceOracle,
        IERC20 _tokenBUSD,
        IERC20 _tokenPUSD,
        IVenusToken _vBNB,
        IVenusToken _vBUSD
    ) {
        stablePool = _stablePool;
        vPriceOracle = _vPriceOracle;
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

        uint256 balanceBNB = vBNB.balanceOfUnderlying(sender);
        uint256 balanceBUSD = vBUSD.borrowBalanceStored(sender);
        console.log('venus deposit/borrow balance', balanceBNB, balanceBUSD);

        uint256 priceBNB = vPriceOracle.getUnderlyingPrice(vBNB);
        uint256 priceBUSD = vPriceOracle.getUnderlyingPrice(vBUSD);
        uint256 valueBNB = balanceBNB * priceBNB / 1e36;
        uint256 valueBUSD = balanceBUSD * priceBUSD / 1e36;
        console.log('venus deposit/borrow value in USD', valueBNB, valueBUSD);

        uint256 debtOnCollateral = valueBNB * 1e18 / valueBUSD;
        console.log('venus debtOnCollateral', debtOnCollateral);

        return (balanceBNB, balanceBUSD);
    }

    function _repayFlashLoan() internal {
        uint256 balanceBUSD = tokenBUSD.balanceOf(address(this));
        uint256 balancePUSD = tokenPUSD.balanceOf(address(this));
        console.log('BUSD balance', balanceBUSD);
        console.log('PUSD balance', balancePUSD);
        // console.log('stablePool', stablePool);
        tokenBUSD.transfer(stablePool, balanceBUSD);
        tokenPUSD.transfer(stablePool, balancePUSD);
    }

    function DSPFlashLoanCall(
        address sender,
        uint256 baseAmount,
        uint256 quoteAmount,
        bytes calldata data
    ) external override {
        console.log('DSPFlashLoanCall params', sender, baseAmount, quoteAmount);
        dataVars = data;
        // (address v1, uint256 v2) =
        abi.decode(data, (address, uint256));
        // (uint256 bnbDeposited, uint256 busdBorrowed) =
        _getVenusBalance(sender);
        _repayFlashLoan();
    }

}
