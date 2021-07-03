const { ethers, getNamedAccounts } = require('hardhat');
const { getContractInstance } = require('./contract-factory');
const { PancakeSwapApp } = require('./pancake');

const { parseEther, formatEther, formatUnits, parseUnits } = ethers.utils;


const VenusApp = function(userWallet) {
  if (!userWallet) {
    throw new Error('userWallet is required');
  }
  this.userWallet = userWallet;
}

/**
 * 存入 BNB 并借出 BUSD 以达到一个指定的质押率
 *
 * @param      {Number}  depositEther  The amount of BNB (in ether) to deposit
 * @param      {Number}  targetCR    The collateralization ratio (in percent), e.g. 125 means 125%
 */
VenusApp.prototype.initMarketWithExactCR = async function(bnbAmountInEther, targetCRInPercent) {
  const [vBNB, vBUSD, comptroller, priceOracle] = await Promise.all([
    getContractInstance('vBNB', this.userWallet),
    getContractInstance('vBUSD', this.userWallet),
    getContractInstance('VenusComptroller', this.userWallet),
    getContractInstance('VenusPriceOracle', this.userWallet),
  ]);
  const [priceBNB, priceBUSD] = await Promise.all([
    priceOracle.getUnderlyingPrice(vBNB.address),
    priceOracle.getUnderlyingPrice(vBUSD.address),
  ]);
  const amountToDepositBNB = parseEther(bnbAmountInEther.toString());
  // 不能先算 priceBNB.div(priceBUSD), 这会返回一个整除的结果
  const amountToBorrowBUSD = amountToDepositBNB
    .mul(priceBNB).div(priceBUSD)
    .div((targetCRInPercent * 100)).mul('10000');  // 精确到 .0000%
  const _1e18 = parseUnits('1', 18);
  await comptroller.enterMarkets([vBNB.address, vBUSD.address]).then((tx) => tx.wait());
  await vBNB.mint({ value: amountToDepositBNB }).then((tx) => tx.wait());
  await vBUSD.borrow(amountToBorrowBUSD).then((tx) => tx.wait());
  /* log */
  const depositValueInUSD = amountToDepositBNB.mul(priceBNB).div(_1e18);
  const borrowValueInUSD = amountToBorrowBUSD.mul(priceBUSD).div(_1e18);
  const [error, liquidity, shortfall] = await comptroller.getAccountLiquidity(this.userWallet.address);
  console.log(
    `deposit ${formatEther(amountToDepositBNB)} BNB ($${formatEther(depositValueInUSD)}),`,
    `borrow ${formatEther(amountToBorrowBUSD)} BUSD ($${formatEther(borrowValueInUSD)}),`,
    `liquidity: ${formatEther(liquidity)}`,
  );
  // venus 最低质押率 1.25, liquidity 应该约等于 depositValueInUSD / 1.25 - borrowValueInUSD
}

VenusApp.prototype.clearDebtAndCollateral = async function() {
  const [tokenBUSD, vBNB, vBUSD, comptroller] = await Promise.all([
    getContractInstance('BUSD', this.userWallet),
    getContractInstance('vBNB', this.userWallet),
    getContractInstance('vBUSD', this.userWallet),
    getContractInstance('VenusComptroller', this.userWallet),
  ]);
  /*
   * accrueInterest 需要发送交易, 不能并行执行, 不然 nonce 会重复
   * 这里要注意下, accrueInterest 后还继续有其他的合约调用, 区块持续增加, 利息也在持续增加, 任何时候获得的余额都不是准确的
   * 实际还款的时候需要多一点余额, 比如增加 0.1% (amountToRepayBUSD = borrowBalanceBUSD * 1.001
   */
  await vBUSD.accrueInterest().then((tx) => tx.wait());
  await vBNB.accrueInterest().then((tx) => tx.wait());
  const [balanceVBNB, balanceBUSD, borrowBalanceBUSD] = await Promise.all([
    vBNB.balanceOf(this.userWallet.address),
    tokenBUSD.balanceOf(this.userWallet.address),
    vBUSD.borrowBalanceStored(this.userWallet.address),
  ]);
  /* IMPORTANT! add 0.01% ~ 0.1% for potential interest */
  const amountToRepayBUSD = borrowBalanceBUSD.mul(10001).div(10000);
  if (amountToRepayBUSD.gt(balanceBUSD)) {
    const wantAmount = amountToRepayBUSD.sub(balanceBUSD);
    const pancakeSwapApp = new PancakeSwapApp(this.userWallet);
    await pancakeSwapApp.swapETHForExactTokens('BUSD', wantAmount);
  }
  await tokenBUSD.approve(vBUSD.address, amountToRepayBUSD).then((tx) => tx.wait());
  // amountToRepayBUSD 好像不能超过实际的债务，用 -1 (2^256 - 1) 表示还清所有债务
  // 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
  const amount = ethers.BigNumber.from(2).pow(256).sub(1);
  await vBUSD.repayBorrow(amount).then((tx) => tx.wait());
  await vBNB.redeem(balanceVBNB).then((tx) => tx.wait());
  /* log */
  const [error, liquidity, shortfall] = await comptroller.getAccountLiquidity(this.userWallet.address);
  console.log(
    `repay ${formatEther(borrowBalanceBUSD)} BUSD,`,
    `redeem ${formatUnits(balanceVBNB, 8)} vBNB,`,
    `liquidity: ${formatEther(liquidity)}`
  );
}


module.exports = {
  VenusApp
}
