const { ethers, getNamedAccounts } = require('hardhat');
const { getContractInstance, ERC20ABI } = require('./contract-factory');
const { PancakeSwapApp } = require('./pancake');

const { parseEther, formatEther, formatUnits, parseUnits } = ethers.utils;


const VenusApp = function(userWallet) {
  if (!userWallet) {
    throw new Error('userWallet is required');
  }
  this.userWallet = userWallet;
}

/**
 * 存入多个资产并借出多个资产, 均以 USD 计量
 * 比如 collaterals = { 'vBNB': 1000, 'vETH': 300 }, debts = { 'vBUSD': 900, 'vUSDC': 100 }
 * collateralization ratio 为 ($1000 + $300) / ($900 + $100) = 1.3
 *
 * @param      {Number}  collaterals  { [vTokenName]: [valueInUSD] }
 * @param      {Number}  debts        { [vTokenName]: [valueInUSD] }
 */
VenusApp.prototype.initMarketWithMultipleAssets = async function(collaterals, debts) {
  const accounts = await getNamedAccounts();
  const [comptroller, priceOracle] = await Promise.all([
    getContractInstance('VenusComptroller', this.userWallet),
    getContractInstance('VenusPriceOracle', this.userWallet),
  ]);
  /* enter markets */
  const vTokensAddresses = [];
  for (let vTokenName in { ...collaterals, ...debts }) {
    vTokensAddresses.push(accounts[vTokenName]);
  }
  await comptroller.enterMarkets(vTokensAddresses).then((tx) => tx.wait());
  /* deposit */
  const pancakeSwapApp = new PancakeSwapApp(this.userWallet);
  for (let vTokenName in collaterals) {
    const valueInUSD = collaterals[vTokenName];
    const vToken = await getContractInstance(vTokenName, this.userWallet);
    const underlyingTokenPrice = await priceOracle.getUnderlyingPrice(vToken.address);
    const _1e18 = parseUnits('1', 18);
    const amountInWei = parseEther(valueInUSD.toString()).mul(_1e18).div(underlyingTokenPrice);
    if (vTokenName === 'vBNB') {
      await vToken.mint({ value: amountInWei }).then((tx) => tx.wait());
    } else {
      const underlyingTokenAddress = await vToken.underlying();
      const underlyingToken = new ethers.Contract(underlyingTokenAddress, ERC20ABI, this.userWallet);
      const underlyingTokenName = await underlyingToken.symbol();
      await pancakeSwapApp.swapETHForExactTokens(underlyingTokenName, amountInWei);
      await underlyingToken.approve(vToken.address, amountInWei).then((tx) => tx.wait());
      await vToken.mint(amountInWei).then((tx) => tx.wait());
    }
    console.log(`[Venus] deposit ${formatEther(amountInWei)}($${valueInUSD}) in ${vTokenName}`);
  }
  /* borrow */
  for (let vTokenName in debts) {
    const valueInUSD = debts[vTokenName];
    const vToken = await getContractInstance(vTokenName, this.userWallet);
    const underlyingTokenPrice = await priceOracle.getUnderlyingPrice(vToken.address);
    const _1e18 = parseUnits('1', 18);
    const amountInWei = parseEther(valueInUSD.toString()).mul(_1e18).div(underlyingTokenPrice);
    await vToken.borrow(amountInWei).then((tx) => tx.wait());
    // 如果可借额度不够, 这里居然不会报错, 所以下面需要检查并确认一下借出金额
    const vTokenBorrowBalance = await vToken.borrowBalanceStored(this.userWallet.address);
    if (!vTokenBorrowBalance.eq(amountInWei)) {
      // 注意! 这个 eq 的判断假设用户之前没有 borrow 过, 因为这个方法只给本地测试用户使用
      throw new Error(`[Venus] failed borrow ${formatEther(amountInWei)}($${valueInUSD}) from ${vTokenName}`);
    }
    console.log(`[Venus] borrow ${formatEther(amountInWei)}($${valueInUSD}) from ${vTokenName}`);
  }
  /* liquidity */
  const [error, liquidity, shortfall] = await comptroller.getAccountLiquidity(this.userWallet.address);
  console.log(`[Venus] liquidity (available borrows in USD): $${formatEther(liquidity)}`);
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
  // 计算方法是 [isListed, collateralFactorMantissa, isXvsed] = await comptroller.markets(vToken)
  // 然后 (1e18 / collateralFactorMantissa) 就是质押率
}


/**
 * 归还 BUSD 并取出 BNB, 这个方法没有用到
 */
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
