//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./interfaces/IDODOCallee.sol";
import "./interfaces/IVenusToken.sol";
// import "./interfaces/IVenusPriceOracle.sol";
import "./interfaces/IVenusComptroller.sol";
import "./interfaces/IBorrowerOperations.sol";


contract VaultMigration is IDODOCallee {
    using SafeERC20 for IERC20;

    /**
     * DODO stable pool of PUSD/BUSD
     */
    address public immutable stablePool;

    IERC20 public immutable tokenBUSD;
    IERC20 public immutable tokenPUSD;

    /* Venus vars and interfaces */

    struct VenusLocalVars {
        uint256 vBnbBalance;
        uint256 bnbBalance;
        uint256 borrowBalance;
        // uint256 priceBNB;
        // uint256 priceBUSD;
    }
    // IVenusPriceOracle immutable vPriceOracle;
    IVenusComptroller immutable venusComptroller;
    IVenusToken public immutable vBNB;
    IVenusToken public immutable vBUSD;

    /* Piggy vars and interfaces */

    struct PiggyLocalVars {
        address upperHint;
        address lowerHint;
    }
    IBorrowerOperations public immutable borrowerOperations;

    /**
     * vBNB.redeem 需要接收 BNB, 这里放一个默认的 receive ether function
     */
    receive() external payable {}
    // fallback() external payable {}

    constructor(
        address _stablePool,
        // IVenusPriceOracle _vPriceOracle,
        IVenusComptroller _venusComptroller,
        IBorrowerOperations _borrowerOperations,
        IERC20 _tokenBUSD,
        IERC20 _tokenPUSD,
        IVenusToken _vBNB,
        IVenusToken _vBUSD
    ) {
        stablePool = _stablePool;
        // vPriceOracle = _vPriceOracle;
        venusComptroller = _venusComptroller;
        borrowerOperations = _borrowerOperations;
        tokenBUSD = _tokenBUSD;
        tokenPUSD = _tokenPUSD;
        vBNB = _vBNB;
        vBUSD = _vBUSD;
        /* vBUSD.repayBorrowBehalf 要从本合约转出 BUSD */
        _tokenBUSD.approve(address(_vBUSD), type(uint256).max);
    }

    /**
     * @param      sender     The msg.sender who sends the flashloan,
     *                        owner of the venus collateral and debt
     */
    function _checkVenusBalance(address sender) internal returns (VenusLocalVars memory) {
        VenusLocalVars memory venusVars;

        vBNB.accrueInterest();
        vBUSD.accrueInterest();
        venusVars.vBnbBalance = vBNB.balanceOf(sender);
        venusVars.bnbBalance = vBNB.balanceOfUnderlying(sender);
        venusVars.borrowBalance = vBUSD.borrowBalanceStored(sender);
        // venusVars.priceBNB = vPriceOracle.getUnderlyingPrice(vBNB);
        // venusVars.priceBUSD = vPriceOracle.getUnderlyingPrice(vBUSD);

        require(
            vBNB.allowance(sender, address(this)) >= venusVars.vBnbBalance,
            "vBNB allowance is not enough."
        );

        return venusVars;
    }

    /**
     * Open piggy trove for "sender"
     * @param      venusVars  The venus variables
     * @param      piggyVars  The piggy variables
     * @param      sender     The msg.sender who sends the flashloan
     */
    function _openTrove(VenusLocalVars memory venusVars, PiggyLocalVars memory piggyVars, address sender) internal {
        uint256 bnbColl = address(this).balance;
        // TODO: 要用 querySellQuote 算出 pusdDebt, 目前先直接用 borrowBalance * 1.03
        uint256 pusdDebt = venusVars.borrowBalance * 101 / 100;
        uint256 maxFee = uint256(1e18) / 100;  // 0.01 = 1%;
        borrowerOperations.openTroveOnBehalfOf{value: bnbColl}(
            sender, maxFee, pusdDebt, piggyVars.upperHint, piggyVars.lowerHint);
        uint256 balancePUSDOfSender = tokenPUSD.balanceOf(sender);
        tokenPUSD.transferFrom(sender, address(this), balancePUSDOfSender);
    }

    /**
     * Return PUSD and BUSD to DODO stable pool
     * 如果转多了, dodo 会把多出来的转回给 sender (调用 flashloan 的那个用户) 而不是本合约
     */
    function _repayFlashLoan() internal {
        uint256 balanceBUSD = tokenBUSD.balanceOf(address(this));
        uint256 balancePUSD = tokenPUSD.balanceOf(address(this));
        tokenBUSD.transfer(stablePool, balanceBUSD);
        tokenPUSD.transfer(stablePool, balancePUSD);
    }


    /**
     * @param      sender       The msg.sender who sends the flashloan
     * @param      baseAmount   The flashloaned amount of BUSD (1% more than borrowBalance)
     * @param      quoteAmount  The flashloaned amount of PUSD (should be zero)
     * @param      data         The precalculated piggy trove params: [upperHint, lowerHint]
     */
    function DSPFlashLoanCall(
        address sender,
        uint256 baseAmount,
        uint256 quoteAmount,
        bytes calldata data
    ) external override {
        require(tokenBUSD.balanceOf(address(this)) == baseAmount, "something went wrong ...");
        require(tokenPUSD.balanceOf(address(this)) == quoteAmount, "something went wrong ...");

        PiggyLocalVars memory piggyVars;
        (
            piggyVars.upperHint,
            piggyVars.lowerHint
        ) = abi.decode(data, (address, address));

        /* 1. precheck */
        VenusLocalVars memory venusVars = _checkVenusBalance(sender);
        // _checkPiggyStatus();
        /**
         * TODO:
         * 1. 确认 sender 没在 piggy 开仓, 通过 trovemanager.getTroveStatus(sender)
         * 2. 确认 sender 已经 approve 了足够的 vBNB 和 PUSD
         */

        /**
         * 2. clear venus positions
         *  - 合约下的 BUSD 余额 (baseAmount) 比 venusVars.borrowBalance 会稍微多一点, flashloan 的时候加了 1%
         *  - 直接使用 2**256-1 或者 type(uint256).max 确保 repay the full amount
         *  - 如果转出 vBNB 以后导致抵押物不足, transfer 不会发生, 并且 transferFrom 返回 false
         */
        vBUSD.repayBorrowBehalf(sender, 2**256-1);
        bool vBNBTransfered = vBNB.transferFrom(sender, address(this), venusVars.vBnbBalance);
        require(vBNBTransfered, "failed transfer vBNB VaultMigration");
        vBNB.redeem(venusVars.vBnbBalance);

        /**
         * 3. open piggy trove for user
         * xxx
         */
        _openTrove(venusVars, piggyVars, sender);

        /* 4. return flashloan assets to DODO */
        _repayFlashLoan();
    }

}
