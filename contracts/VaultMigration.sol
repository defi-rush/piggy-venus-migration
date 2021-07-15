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

    IERC20 public immutable tokenBUSD;
    IERC20 public immutable tokenPUSD;

    /* DODO stable pool of PUSD/BUSD */
    IDODOStablePool public immutable dodoStablePool;

    /* Venus vars and interfaces */
    IVenusPriceOracle immutable vPriceOracle;
    IVenusComptroller immutable venusComptroller;
    IVenusToken public immutable vBNB;
    IVenusToken public immutable vBUSD;
    struct VenusLocalVars {
        uint256 vBnbBalance;
        uint256 bnbBalance;
        uint256 busdBorrowBalance;
        uint256 bnbPrice;
        uint256 busdPrice;
    }

    /* Piggy vars and interfaces */
    ITroveManager public immutable troveManager;
    IBorrowerOperations public immutable borrowerOperations;
    IPiggyReward public piggyReward;

    /* Events */
    event Migrated(
        address indexed _borrower,
        uint256 _vBnbBalance,
        uint256 _busdBorrowBalance,
        uint256 _bnbColl,
        uint256 _pusdDebt);


    /* vBNB.redeem 需要接收 BNB, 这里放一个默认的 receive ether function */
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
        /* vBUSD.repayBorrowBehalf 要从本合约转出 vBUSD */
        _tokenBUSD.approve(address(_vBUSD), type(uint256).max);
        /* allow governance to transfer out residual */
        _tokenBUSD.approve(governance, type(uint256).max);
        _tokenPUSD.approve(governance, type(uint256).max);
    }

    function setGovernance(address _governance) public {
        require(msg.sender == governance, "!governance");
        tokenBUSD.approve(governance, 0);
        tokenPUSD.approve(governance, 0);
        governance = _governance;
        tokenBUSD.approve(governance, type(uint256).max);
        tokenPUSD.approve(governance, type(uint256).max);
    }

    function setPiggyReward(IPiggyReward _piggyReward) public {
        require(msg.sender == governance, "!governance");
        piggyReward = _piggyReward;
    }

    /**
     * clear venus positions
     *  - 合约下的 BUSD 余额 (baseAmount) 等于 busdRepay
     *  - repayBorrowBehalf 不要 repay full amount (2**256-1), 因为 busdRepay 不一定等于全部借款数量
     *  - 如果转出 vBNB 以后导致抵押物不足, transfer 不会发生, 并且 transferFrom 返回 false
     */
    function _clearVenusPositions(
        address borrower, uint256 busdRepay, uint256 vBnbBalance
    ) internal {
        vBUSD.repayBorrowBehalf(borrower, busdRepay);
        bool _success = vBNB.transferFrom(borrower, address(this), vBnbBalance);
        require(_success, "failed transfer vBNB to VaultMigration");
        vBNB.redeem(vBnbBalance);
    }

    /**
     * open Piggy trove for borrower
     *  - 首先确保在 vBNB.redeem 以后获得了足够的 BNB
     *  - maxFee 变大不会导致到手的 PUSD 变少, 但是会让债务增加, 可能导致抵押率不足
     *    实际债务 = pusdDebt + fee(0.5%~10%) + 20(保证金)
     *    前面 _checkVenusAmounts 里大概估计了下 fee, 如果实际的 fee 太高, 只会因为抵押率不足而失败
     *  - 如果没问题, 合约下 PUSD 余额的变化应该正好等于 pusdDebt
     */
    function _openPiggyTrove(
        address borrower, uint256 bnbColl, uint256 pusdDebt, address upperHint, address lowerHint
    ) internal {
        require(address(this).balance >= bnbColl, "BNB balance is not enough");
        uint256 maxFee = 1e18 * 3 / 100;  // 3%;
        uint256 _balance = tokenPUSD.balanceOf(borrower);
        borrowerOperations.openTroveOnBehalfOf{value: bnbColl}(
            borrower, maxFee, pusdDebt, upperHint, lowerHint);
        uint256 _balanceNew = tokenPUSD.balanceOf(borrower);
        assert(_balanceNew - _balance == pusdDebt);
    }

    /**
     * DODO FlashLoan 的接收端
     * 1. 一定要确保 msg.sender 是 dodoStablePool
     *    后面的逻辑依赖 data 里面的数据, 都是提前算好的而且不再校验, 恶意调用这个合约方法可能有意想不到的结果
     * 2. 代码里不要直接取合约下的 BUSD 和 PUSD 的余额, 使用计算好的金额
     *    第三方可以恶意给合约转入 BUSD 和 PUSD, 直接相信余额可能有意想不到的结果
     * 3. 如果没问题, _openPiggyTrove 以后合约得到的 PUSD 数量应该正好等于 pusdDebt
     */
    function DSPFlashLoanCall(
        address sender,
        uint256 baseAmount,
        uint256 quoteAmount,
        bytes calldata data
    ) external override {
        require(msg.sender == address(dodoStablePool), "msg.sender is not DODO StablePool");
        require(sender == address(this), "flashloan sender is not this contract");

        (
            address borrower,  // 用户
            uint256 vBnbBalance,
            uint256 busdRepay,
            uint256 bnbColl,
            uint256 pusdDebt,
            address upperHint,
            address lowerHint
        ) = abi.decode(data, (address, uint256, uint256, uint256, uint256, address, address));
        require(baseAmount == busdRepay, "baseAmount not equal to busdRepay");
        require(quoteAmount == 0, "quoteAmount not equal to zero");

        _clearVenusPositions(borrower, busdRepay, vBnbBalance);
        _openPiggyTrove(borrower, bnbColl, pusdDebt, upperHint, lowerHint);

        bool _success = tokenPUSD.transferFrom(borrower, address(dodoStablePool), pusdDebt);
        require(_success, "failed transfer tokenPUSD to DODO Stable pool");
    }

    /**
     * 获取 Venus 头寸并检查 vBNB 有足够的 allowance
     * vBUSD.borrowBalanceCurrent 和 vBNB.balanceOfUnderlying 分别会执行 vBUSD 和 vBNB 的 accrueInterest
     * 无需单独先执行 vBNB.accrueInterest() 和 vBUSD.accrueInterest() 了
     */
    function _getVenusInfo() internal returns (VenusLocalVars memory) {
        VenusLocalVars memory vInfo;
        vInfo.busdBorrowBalance = vBUSD.borrowBalanceCurrent(msg.sender);
        vInfo.bnbBalance = vBNB.balanceOfUnderlying(msg.sender);
        vInfo.vBnbBalance = vBNB.balanceOf(msg.sender);
        vInfo.bnbPrice = vPriceOracle.getUnderlyingPrice(vBNB);
        vInfo.busdPrice = vPriceOracle.getUnderlyingPrice(vBUSD);
        require(vInfo.vBnbBalance > 0 && vInfo.busdBorrowBalance > 0, "no BNB or BUSD positions");
        require(vBNB.allowance(msg.sender, address(this)) >= vInfo.vBnbBalance, "vBNB allowance is not enough");
        return vInfo;
    }

    /**
     * 检查 BUSD 和 BNB 的价值满足 Piggy 的条件
     * - 这里假设 PUSD/BUSD 交易对价格是 1, 因为只是个估算, 问题不大
     * - 其实 BUSD 少于 180 没事, 只要 BNB 足够就可以多 mint 一点 PUSD (>180), 然后还完等值的 BUSD 后剩下的打给用户
     *   但这样比较麻烦, 而且这种情况也不多, 目前直接要求 BUSD 不少于 180
     * - 不单独考虑 openTrove 的 borrowingFee 了, 直接通过 _minCR + 1 来预估, 最后如果 fee 太高只会因为抵押率不足而失败
     */
    function _checkVenusAmounts(VenusLocalVars memory vInfo) internal view returns (uint256) {
        uint256 _reserve = troveManager.LUSD_GAS_COMPENSATION();  // 20e18
        uint256 _minNetDebt = troveManager.MIN_NET_DEBT();  // 180e18
        uint256 _minCR = troveManager.MCR() / 1e16 + 1;  // 110 + 1
        require(vInfo.busdBorrowBalance >= _minNetDebt, "busdBorrowBalance must be greater than minimum");
        uint256 busdRepay = vInfo.busdBorrowBalance;
        uint256 _bnbValue = vInfo.bnbBalance * vInfo.bnbPrice;
        if (_bnbValue * 100 <= (busdRepay + _reserve) * vInfo.busdPrice * _minCR) {
            busdRepay = _bnbValue * 100 / (vInfo.busdPrice * 150) - _reserve; // 150 是拍脑袋想的
        }
        if (busdRepay < _minNetDebt) busdRepay = _minNetDebt;
        return busdRepay;
    }

    function startMigrate(address _upperHint, address _lowerHint) external {
        uint troveStatus = troveManager.getTroveStatus(msg.sender);
        require(troveStatus != 1, "Piggy trove is active");

        VenusLocalVars memory vInfo = _getVenusInfo();
        uint256 busdRepay = _checkVenusAmounts(vInfo);

        /**
         * bnbColl:  存入 piggy 的 BNB 数量
         * pusdDebt: 从 piggy 借出的 PUSD 数量, 有 pusdDebt >= busdRepay >= 180
         * 询价的过程会让 pusdDebt 越来越大, 所以 pusdDebt 不小于 180, 最终总的 debt 不小于 200
         */
        uint256 bnbColl = vInfo.bnbBalance;
        uint256 pusdDebt = busdRepay;
        while (true) {
            (uint256 _receive,,,) = dodoStablePool.querySellQuote(address(this), pusdDebt);
            if (_receive >= busdRepay) {
                break;
            }
            pusdDebt = pusdDebt * 1001 / 1000;
            if (pusdDebt * 100 > busdRepay * 110) {
                revert("too much PUSD/BUSD slippage (>0.1)");
            }
        }
        require(tokenPUSD.allowance(msg.sender, address(this)) >= pusdDebt, "PUSD allowance is not enough");

        /**
         * FlashLoan
         * baseAmount: busdRepay, quoteAmount: 0
         */
        bytes memory data = abi.encode(
            msg.sender, vInfo.vBnbBalance, busdRepay, bnbColl, pusdDebt, _upperHint, _lowerHint);
        dodoStablePool.flashLoan(busdRepay, 0, address(this), data);

        /**
         * After FlashLoan
         * 到这里应该合约里没有 BNB/PUSD/BUSD 余额了
         */
        if (address(piggyReward) != address(0)) {
            piggyReward.reward(msg.sender, 1e18);
        }
        emit Migrated(msg.sender, vInfo.vBnbBalance, vInfo.busdBorrowBalance, bnbColl, pusdDebt);
    }

}
