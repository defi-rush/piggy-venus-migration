//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./interfaces/IDODOCallee.sol";
import "./interfaces/IVenusToken.sol";
import "./interfaces/IVenusPriceOracle.sol";
import "./interfaces/IBorrowerOperations.sol";


contract VaultMigration is IDODOCallee {
    using SafeERC20 for IERC20;

    address public immutable stablePool;

    IBorrowerOperations public immutable borrowerOperations;

    IERC20 public immutable tokenBUSD;
    IERC20 public immutable tokenPUSD;

    struct VenusLocalVars {
        uint256 vBnbBalance;
        uint256 bnbBalance;
        uint256 borrowBalance;
        uint256 priceBNB;
        uint256 priceBUSD;
    }

    struct PiggyLocalVars {
        address upperHint;
        address lowerHint;
    }

    IVenusPriceOracle immutable vPriceOracle;

    IVenusToken public immutable vBNB;
    IVenusToken public immutable vBUSD;

    /**
     * vBNB.redeem 需要接收 BNB, 这里放一个默认的 receive ether function
     */
    receive() external payable {}
    // fallback() external payable {}

    constructor(
        address _stablePool,
        IBorrowerOperations _borrowerOperations,
        IVenusPriceOracle _vPriceOracle,
        IERC20 _tokenBUSD,
        IERC20 _tokenPUSD,
        IVenusToken _vBNB,
        IVenusToken _vBUSD
    ) {
        stablePool = _stablePool;
        borrowerOperations = _borrowerOperations;
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
        VenusLocalVars memory venusVars;

        vBNB.accrueInterest();
        vBUSD.accrueInterest();

        venusVars.vBnbBalance = vBNB.balanceOf(sender);
        venusVars.bnbBalance = vBNB.balanceOfUnderlying(sender);
        venusVars.borrowBalance = vBUSD.borrowBalanceStored(sender);

        venusVars.priceBNB = vPriceOracle.getUnderlyingPrice(vBNB);
        venusVars.priceBUSD = vPriceOracle.getUnderlyingPrice(vBUSD);

        return venusVars;
    }

    function _debugVenusVars(VenusLocalVars memory venusVars) view internal {
        uint256 valueBNB = venusVars.bnbBalance * venusVars.priceBNB / 1e36;
        uint256 valueBUSD = venusVars.borrowBalance * venusVars.priceBUSD / 1e36;
        uint256 debtOnCollateral = valueBNB * 1e18 / valueBUSD;
        console.log('venus vBNB balance', venusVars.vBnbBalance);
        console.log('venus deposit/borrow balance', venusVars.bnbBalance, venusVars.borrowBalance);
        console.log('venus deposit/borrow value in USD', valueBNB, valueBUSD);
        console.log('venus debtOnCollateral', debtOnCollateral);
    }

    /**
     * @param      venusVars    Cached venus storage
     * @param      sender  The owner of venus collateral and debt
     */
    function _repayVenusDebt(VenusLocalVars memory venusVars, address sender) internal {
        vBUSD.repayBorrowBehalf(sender, venusVars.borrowBalance);
    }

    /**
     * @param      venusVars    Cached venus storage
     * @param      sender  The owner of venus collateral and debt
     */
    function _redeemVenusCollateral(VenusLocalVars memory venusVars, address sender) internal {
        // 调用 flashloan 之前 sender 已经 approve 了
        console.log('BNB balance before redeem', address(this).balance);
        vBNB.transferFrom(sender, address(this), venusVars.vBnbBalance);
        vBNB.redeem(venusVars.vBnbBalance);
        // uint256 bnbColl = address(this).balance;
        // console.log('BNB balance after redeem', bnbColl);
    }

    /**
     * @param      sender  The owner of the trove
     */
    function _openTrove(VenusLocalVars memory venusVars, PiggyLocalVars memory piggyVars, address sender) internal {
        uint256 bnbColl = address(this).balance;
        console.log('BNB balance before openTrove', bnbColl);
        // TODO: 要用 querySellQuote 算出 pusdDebt, 目前先直接用 borrowBalance * 1.03
        uint256 pusdDebt = venusVars.borrowBalance * 101 / 100;
        uint256 maxFee = uint256(1e18) / 100;  // 0.01 = 1%;
        console.log('Ask for PUSD', pusdDebt);
        borrowerOperations.openTroveOnBehalfOf{value: bnbColl}(
            sender, maxFee, pusdDebt, piggyVars.upperHint, piggyVars.lowerHint);
        uint256 balancePUSDOfSender = tokenPUSD.balanceOf(sender);
        // console.log('PUSD of sender', balancePUSDOfSender);
        // console.log('PUSD allowance', tokenPUSD.allowance(sender, address(this)));
        tokenPUSD.transferFrom(sender, address(this), balancePUSDOfSender);
    }

    function _repayFlashLoan() internal {
        uint256 balanceBUSD = tokenBUSD.balanceOf(address(this));
        uint256 balancePUSD = tokenPUSD.balanceOf(address(this));
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
        console.log('BUSD/PUSD received',
            tokenBUSD.balanceOf(address(this)), tokenPUSD.balanceOf(address(this)));

        PiggyLocalVars memory piggyVars;
        (
            piggyVars.upperHint,
            piggyVars.lowerHint
        ) = abi.decode(data, (address, address));
        console.log('hints', piggyVars.upperHint, piggyVars.lowerHint);

        /* precheck */
        VenusLocalVars memory venusVars = _getVenusBalance(sender);
        _debugVenusVars(venusVars);
        /*
         * TODO:
         * 1. 确认 sender 没在 piggy 开仓, 通过 trovemanager.getTroveStatus(sender)
         * 2. 确认 sender 已经 approve 了足够的 vBNB 和 PUSD
         * /

        /* clear venus positions */
        _repayVenusDebt(venusVars, sender);
        _redeemVenusCollateral(venusVars, sender);

        /* open piggy trove for user */
        _openTrove(venusVars, piggyVars, sender);

        /* return assets to DODO */
        console.log('BUSD/PUSD returning',
            tokenBUSD.balanceOf(address(this)), tokenPUSD.balanceOf(address(this)));
        _repayFlashLoan();
    }

}
