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
    address immutable stablePool;

    IERC20 public immutable tokenBUSD;
    IERC20 public immutable tokenPUSD;

    struct VenusLocalVars {
        uint256 vBnbBalance;
        uint256 bnbBalance;
        uint256 borrowBalance;
        uint256 priceBNB;
        uint256 priceBUSD;
    }

    IVenusPriceOracle immutable vPriceOracle;

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
        // vBUSD.repayBorrowBehalf 要从本合约转出 BUSD
        _tokenBUSD.approve(address(_vBUSD), type(uint256).max);
    }

    /**
     * @param      sender  The owner of venus collateral and debt
     */
    function _getVenusBalance(address sender) internal returns (VenusLocalVars memory) {
        VenusLocalVars memory vars;

        vBNB.accrueInterest();
        vBUSD.accrueInterest();

        vars.vBnbBalance = vBNB.balanceOf(sender);
        vars.bnbBalance = vBNB.balanceOfUnderlying(sender);
        vars.borrowBalance = vBUSD.borrowBalanceStored(sender);

        vars.priceBNB = vPriceOracle.getUnderlyingPrice(vBNB);
        vars.priceBUSD = vPriceOracle.getUnderlyingPrice(vBUSD);

        return vars;
    }

    function _debugVenusVars(VenusLocalVars memory vars) view internal {
        uint256 valueBNB = vars.bnbBalance * vars.priceBNB / 1e36;
        uint256 valueBUSD = vars.borrowBalance * vars.priceBUSD / 1e36;
        uint256 debtOnCollateral = valueBNB * 1e18 / valueBUSD;
        console.log('venus vBNB balance', vars.vBnbBalance);
        console.log('venus deposit/borrow balance', vars.bnbBalance, vars.borrowBalance);
        console.log('venus deposit/borrow value in USD', valueBNB, valueBUSD);
        console.log('venus debtOnCollateral', debtOnCollateral);
    }

    function _repayVenusDebt(VenusLocalVars memory vars, address borrower) internal {
        vBUSD.repayBorrowBehalf(borrower, vars.borrowBalance);
    }

    function _repayFlashLoan() internal {
        uint256 balanceBUSD = tokenBUSD.balanceOf(address(this));
        uint256 balancePUSD = tokenPUSD.balanceOf(address(this));
        console.log('BUSD balance', balanceBUSD);
        console.log('PUSD balance', balancePUSD);
        // console.log('stablePool', stablePool);
        tokenBUSD.transfer(stablePool, balanceBUSD);
        tokenPUSD.transfer(stablePool, balancePUSD);
        // 如果转多了, dodo 会把多出来的转回给 sender (调用 flashloan 的那个用户) 而不是本合约
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

        /* precheck */
        VenusLocalVars memory venusLocalVars = _getVenusBalance(sender);
        _debugVenusVars(venusLocalVars);
        // TODO: 确认 sender 没在 piggy 开仓, 通过 trovemanager.getTroveStatus(sender)

        /* repay venus */
        _repayVenusDebt(venusLocalVars, sender);

        /* return assets to DODO */
        _repayFlashLoan();
    }

}
