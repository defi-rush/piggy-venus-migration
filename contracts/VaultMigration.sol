//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "./interfaces/IDODOCallee.sol";
import "./interfaces/IDODOStablePool.sol";
import "./interfaces/IVenusToken.sol";
import "./interfaces/IVenusPriceOracle.sol";
import "./interfaces/IVenusComptroller.sol";
import "./interfaces/ITroveManager.sol";
import "./interfaces/IBorrowerOperations.sol";
import "./interfaces/IPiggyReward.sol";


contract VaultMigration is IDODOCallee {
    address public governance;

    /**
     * DODO stable pool of PUSD/BUSD
     */
    IDODOStablePool public immutable dodoStablePool;

    IERC20 public immutable tokenBUSD;
    IERC20 public immutable tokenPUSD;

    /* Venus vars and interfaces */
    IVenusPriceOracle immutable vPriceOracle;
    IVenusComptroller immutable venusComptroller;
    IVenusToken public immutable vBNB;
    IVenusToken public immutable vBUSD;

    /* Piggy vars and interfaces */
    ITroveManager public immutable troveManager;
    IBorrowerOperations public immutable borrowerOperations;

    IPiggyReward public piggyReward;

    /* Events */
    event Migrated(
        address indexed _borrower,
        uint256 _vBnbBalance,
        uint256 _borrowBalance,
        uint256 _bnbColl,
        uint256 _pusdDebt);


    /**
     * vBNB.redeem 需要接收 BNB, 这里放一个默认的 receive ether function
     */
    receive() external payable {}
    // fallback() external payable {}


    constructor(
        IDODOStablePool _dodoStablePool,
        IVenusPriceOracle _vPriceOracle,
        IVenusComptroller _venusComptroller,
        ITroveManager _troveManager,
        IBorrowerOperations _borrowerOperations,
        IERC20 _tokenBUSD,
        IERC20 _tokenPUSD,
        IVenusToken _vBNB,
        IVenusToken _vBUSD
    ) {
        governance = msg.sender;
        dodoStablePool = _dodoStablePool;
        vPriceOracle = _vPriceOracle;
        venusComptroller = _venusComptroller;
        troveManager = _troveManager;
        borrowerOperations = _borrowerOperations;
        tokenBUSD = _tokenBUSD;
        tokenPUSD = _tokenPUSD;
        vBNB = _vBNB;
        vBUSD = _vBUSD;
        /* vBUSD.repayBorrowBehalf 要从本合约转出 BUSD */
        _tokenBUSD.approve(address(_vBUSD), type(uint256).max);
        /* allow governance to transfer out residual */
        _tokenBUSD.approve(governance, type(uint256).max);
        _tokenPUSD.approve(governance, type(uint256).max);
    }

    function setGovernance(address _governance) public {
        require(msg.sender == governance, "!governance");
        governance = _governance;
    }

    function setPiggyReward(IPiggyReward _piggyReward) public {
        require(msg.sender == governance, "!governance");
        piggyReward = _piggyReward;
    }

    /**
     * 一定要确保 msg.sender 是 dodoStablePool,
     * 后面的逻辑依赖 data 里面的数据, 都是提前算好的, 不再校验, 恶意调用这个合约方法可能导致问题
     */
    function DSPFlashLoanCall(
        address sender,
        uint256 baseAmount,
        uint256 quoteAmount,
        bytes calldata data
    ) external override {
        require(msg.sender == address(dodoStablePool), "msg.sender is not DODO StablePool");
        require(sender == address(this), "flashloan sender is not this contract");
        require(baseAmount == tokenBUSD.balanceOf(address(this)), "baseAmount not equal to BUSD balance");
        require(quoteAmount == 0, "quoteAmount not equal to zero");

        (
            address borrower,  // 用户
            uint256 vBnbBalance,
            uint256 borrowBalance,
            uint256 bnbColl,
            uint256 pusdDebt,
            address upperHint,
            address lowerHint
        ) = abi.decode(data, (address, uint256, uint256, uint256, uint256, address, address));
        require(borrowBalance == baseAmount, "baseAmount not equal to borrowBalance");

        /**
         * 1. clear venus positions
         *  - 合约下的 BUSD 余额 (baseAmount) 等于 borrowBalance
         *  - 直接使用 2**256-1 或者 type(uint256).max 确保 repay the full amount
         *  - 因为在同一个区块中, 如果没问题, borrowBalance 就是 full amount
         *  - 如果转出 vBNB 以后导致抵押物不足, transfer 不会发生, 并且 transferFrom 返回 false
         */
        vBUSD.repayBorrowBehalf(borrower, 2**256-1);
        bool vBNBTransfered = vBNB.transferFrom(borrower, address(this), vBnbBalance);
        require(vBNBTransfered, "failed transfer vBNB VaultMigration");
        vBNB.redeem(vBnbBalance);

        /**
         * 2. open Piggy trove for user
         *  - ? 需要确认下 maxFee 是否和 pusdDebt 的计算无关
         */
        require(address(this).balance >= bnbColl, "BNB balance is not enough");
        uint256 maxFee = 1e18 * 3 / 100;  // 3%;
        uint256 _balancePUSDBefore = tokenPUSD.balanceOf(borrower);
        /**/
        borrowerOperations.openTroveOnBehalfOf{value: bnbColl}(
            borrower, maxFee, pusdDebt, upperHint, lowerHint);
        /**/
        uint256 _balancePUSDAfter = tokenPUSD.balanceOf(borrower);
        assert(_balancePUSDAfter > _balancePUSDBefore);

        /**
         * 3. return flashloan assets to DODO
         *  - BUSD 肯定没有剩余, 应该是不需要再转 BUSD 了
         */
        // tokenBUSD.transfer(address(dodoStablePool), tokenBUSD.balanceOf(address(this)));
        // tokenPUSD.transfer(address(dodoStablePool), tokenPUSD.balanceOf(address(this)));
        bool pusdTransfered = tokenPUSD.transferFrom(
            borrower, address(dodoStablePool), _balancePUSDAfter - _balancePUSDBefore);
        require(pusdTransfered, "failed transfer tokenPUSD to DODO Stable pool");
    }


    function startMigrate(address _upperHint, address _lowerHint) external {
        uint troveStatus = troveManager.getTroveStatus(msg.sender);
        require(troveStatus != 1, "Piggy trove is active");

        /**
         * 检查 Venus 余额
         *  - vBNB 有足够的 allowance
         *  - BNB 和 BUSD 的价值满足 Piggy 的条件 (这只是个大概的估算, 不满足条件的可以提前终止)
         */
        vBNB.accrueInterest();
        vBUSD.accrueInterest();
        uint256 borrowBalance = vBUSD.borrowBalanceStored(msg.sender);
        uint256 bnbBalance = vBNB.balanceOfUnderlying(msg.sender);
        uint256 vBnbBalance = vBNB.balanceOf(msg.sender);
        uint256 priceBNB = vPriceOracle.getUnderlyingPrice(vBNB);
        // uint256 priceBUSD = vPriceOracle.getUnderlyingPrice(vBUSD);
        require(vBNB.allowance(msg.sender, address(this)) >= vBnbBalance, "vBNB allowance is not enough");
        require(
            bnbBalance * priceBNB / borrowBalance > 1e18 * 110 / 100,
            "Collateral ratio must be greater than 110% for Piggy");

        /**
         * 计算 Piggy 金额
         * bnbColl:  从 Venus 取出并且全部放进 Piggy 的 BNB 数量;
         *           在同一个区块里, bnbColl 始终等于 vBNB.balanceOfUnderlying
         * pusdDebt: 从 Piggy 借出的 PUSD 数量, 约等于 borrowBalance (BUSD) 加上 0.3% 的 flashloan 手续费
         */
        uint256 bnbColl = bnbBalance;
        uint256 pusdDebt = borrowBalance * 101 / 100;  // 加上 1%
        (uint256 receiveBaseAmount, , ,) = dodoStablePool.querySellQuote(address(this), pusdDebt);
        assert(borrowBalance <= receiveBaseAmount);
        require(tokenPUSD.allowance(msg.sender, address(this)) >= pusdDebt, "PUSD allowance is not enough");

        /**
         * FlashLoan
         *   baseAmount: borrowBalance
         *   quoteAmount: 0
         */
        bytes memory data = abi.encode(
            msg.sender, vBnbBalance, borrowBalance, bnbColl, pusdDebt, _upperHint, _lowerHint);
        dodoStablePool.flashLoan(borrowBalance, 0, address(this), data);

        /**
         * Final check
         * TODO: 检查一下余额 ? 到这里应该合约里没有 BNB/PUSD/BUSD 余额了
         */
        if (address(piggyReward) != address(0)) {
            piggyReward.reward(msg.sender, 1e18);
        }
        emit Migrated(msg.sender, vBnbBalance, borrowBalance, bnbColl, pusdDebt);
    }

}
