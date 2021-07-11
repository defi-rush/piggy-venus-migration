const { ethers, getNamedAccounts } = require('hardhat');
const { getContractInstance, ERC20ABI, vTokenABI } = require('./contract-factory');
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

VenusApp.prototype.getAccountData = async function() {
  const [ comptroller, priceOracle ] = await Promise.all([
    // 这里都是只读的, 不需要 userWallet 签名
    getContractInstance('VenusComptroller', ethers.provider),
    getContractInstance('VenusPriceOracle', ethers.provider),
  ]);
  const _1e18 = parseUnits('1', 18);
  const [,liquidity,] = await comptroller.getAccountLiquidity(this.userWallet.address);
  let totalBorrows = ethers.constants.Zero;
  // vTokens: 用户 enterMarkets 的资产
  const vTokens = await comptroller.getAssetsIn(this.userWallet.address);
  const _promises = vTokens.map(async (vTokenAddress) => {
    const vToken = new ethers.Contract(vTokenAddress, vTokenABI, ethers.provider);
    const borrowBalance = await vToken.borrowBalanceStored(this.userWallet.address);
    const underlyingPrice = await priceOracle.getUnderlyingPrice(vTokenAddress);
    const borrowValue = borrowBalance.mul(underlyingPrice).div(_1e18);  // usd value * 1e18
    totalBorrows = totalBorrows.add(borrowValue);
  });
  await Promise.all(_promises);
  const availableCredit = totalBorrows.add(liquidity);
  return { liquidity, totalBorrows, availableCredit };
}


VenusApp.prototype.getMigrationData = async function() {
  const [
    vBNB, vBUSD, comptroller, priceOracle,
  ] = await Promise.all([
    // 这里都是只读的, 不需要 userWallet 签名
    getContractInstance('vBNB', ethers.provider),
    getContractInstance('vBUSD', ethers.provider),
    getContractInstance('VenusComptroller', ethers.provider),
    getContractInstance('VenusPriceOracle', ethers.provider),
  ]);
  const [exchangeRate, vBnbBalance, busdBorrowBalance] = await Promise.all([
    vBNB.exchangeRateStored(),
    vBNB.balanceOf(this.userWallet.address),
    vBUSD.borrowBalanceStored(this.userWallet.address),
  ]);
  const _1e18 = parseUnits('1', 18);
  const bnbBalance = vBnbBalance.mul(exchangeRate).div(_1e18);
  const [bnbPrice, busdPrice] = await Promise.all([
    priceOracle.getUnderlyingPrice(vBNB.address),
    priceOracle.getUnderlyingPrice(vBUSD.address),
  ]);
  const bnbValue = bnbBalance.mul(bnbPrice).div(_1e18);  // usd value * 1e18
  const busdValue = busdBorrowBalance.mul(busdPrice).div(_1e18);  // usd value * 1e18
  const [,collateralFactorMantissa,] = await comptroller.markets(vBNB.address);
  const liquidityToRemove = bnbValue.mul(collateralFactorMantissa).div(_1e18).sub(busdValue);
  return {
    vBnbBalance, busdBorrowBalance, bnbBalance,
    bnbPrice, busdPrice, liquidityToRemove,
  }
}


/**
 * 非实例方法, 列出用户
 */
VenusApp.listUsers = async function(fromBlock, toBlock) {
  const [vBUSD, comptroller] = await Promise.all([
    getContractInstance('vBUSD', ethers.provider),
    getContractInstance('VenusComptroller', ethers.provider),
  ]);
  const filter = vBUSD.filters.Borrow();
  const results = await vBUSD.queryFilter(filter, fromBlock, toBlock);
  const borrowers = results.map((event) => event.args.borrower);
  return borrowers;
}


module.exports = {
  VenusApp
}
