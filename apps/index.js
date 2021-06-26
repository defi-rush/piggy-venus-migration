/*
 * const hre = require('hardhat') returns an instance of the HRE.
 * using HRE outside the hardhat tasks is explained here:
 *   https://hardhat.org/advanced/hardhat-runtime-environment.html#explicitly
 *   https://hardhat.org/guides/scripts.html#writing-scripts-with-hardhat
 * HARDHAT_NETWORK environment variable is necessary to run these scripts:
 *   `HARDHAT_NETWORK=localhost node apps/index.js`
 */
const { ethers, deployments, network } = require('hardhat');
const { getContractInstance } = require('./contract-factory');

const { FaucetApp } = require('./faucet');
const { VenusApp } = require('./venus');
const { PiggyApp } = require('./piggy');

function App() {}

App.prototype.initialize = async function(privateKey) {
  this.userWallet = new ethers.Wallet(privateKey, ethers.provider);
  this.piggyApp = new PiggyApp(this.userWallet);
  const VaultMigration = await deployments.get('VaultMigration');
  this.vaultMigration = new ethers.Contract(VaultMigration.address, VaultMigration.abi, this.userWallet);
  [
    this.vBNB,
    this.vBUSD,
    this.tokenPUSD,
    this.dodoStablePool,
    this.venusComptroller,
    this.vPriceOracle,
  ] = await Promise.all([
    getContractInstance('vBNB', this.userWallet),
    getContractInstance('vBUSD', this.userWallet),
    getContractInstance('PUSD', this.userWallet),
    getContractInstance('DODOStablePool', this.userWallet),
    getContractInstance('VenusComptroller', this.userWallet),
    getContractInstance('VenusPriceOracle', this.userWallet),
  ]);
}

App.prototype.mockUserAccount = async function() {
  const faucet = new FaucetApp(this.userWallet);
  await faucet.requestBNB(20);
  const venusApp = new VenusApp(this.userWallet);
  // await venusApp.initMarketWithExactCR(5, 130);
  await venusApp.initMarketWithMultipleAssets(
    /* 将清空所有头寸 */
    // { 'vBNB': 1200 },  // collaterals
    // { 'vBUSD': 900 },  // debts

    /* Piggy 最低质押率不满足 */
    // { 'vBNB': 1500, 'vETH': 500 },  // collaterals
    // { 'vBUSD': 1400, 'vUSDC': 100 },  // debts

    /* 剩余抵押率不足 */
    // { 'vBNB': 1200, 'vETH': 60 },  // collaterals
    // { 'vBUSD': 900, 'vUSDC': 100 },  // debts

    /* 剩余抵押率足够 */
    { 'vBNB': 1000, 'vETH': 300 },  // collaterals
    { 'vBUSD': 800, 'vUSDC': 200 },  // debts
  );
}

App.prototype.precheck = async function() {
  const [exchangeRate, vBnbBalance, borrowBalance] = await Promise.all([
    this.vBNB.exchangeRateStored(),
    this.vBNB.balanceOf(this.userWallet.address),
    this.vBUSD.borrowBalanceStored(this.userWallet.address),
  ]);

  const _1e18 = ethers.utils.parseUnits('1', 18);
  const bnbBalance = vBnbBalance.mul(exchangeRate).div(_1e18);

  // busd 加上 flashloan 的手续费 0.3% ~ 1%
  // TODO, flashloan 的手续费还要确认下, 要用 querySellQuote 算出 pusdDebt
  // uint256 pusdDebt = venusVars.borrowBalance * 101 / 100;
  const pusdDebt = borrowBalance.mul(101).div(100);
  const bnbColl = bnbBalance;

  /*
   * 检查一下 liquidityToRemove
   * 合约里 vBNB.transferFrom 在 liquidity 不足的时候会执行失败, 合约里不需要再判断 liquidityToRemove
   * 因为 liquidityToRemove 计算有误差, 这里只是个大致的估算
   */
  const [,liquidity,] = await this.venusComptroller.getAccountLiquidity(this.userWallet.address);
  const [priceBNB, priceBUSD] = await Promise.all([
    this.vPriceOracle.getUnderlyingPrice(this.vBNB.address),
    this.vPriceOracle.getUnderlyingPrice(this.vBUSD.address),
  ]);
  const [,collateralFactorMantissa,] = await this.venusComptroller.markets(this.vBNB.address);

  const valueBNB = bnbBalance.mul(priceBNB).div(_1e18);  // usd value * 1e18
  const valueBUSD = borrowBalance.mul(priceBUSD).div(_1e18);  // usd value * 1e18
  const liquidityToRemove = valueBNB.mul(collateralFactorMantissa).div(_1e18).sub(valueBUSD);
  console.log(liquidityToRemove.toString(), liquidity.toString());
  if (liquidityToRemove.gt(liquidity)) {
    throw new Error('liquidity is not enough after migration');
  }

  return { vBnbBalance, borrowBalance, bnbColl, pusdDebt };
}

App.prototype.flashloan = async function({
  vBnbBalance, borrowBalance, bnbColl, pusdDebt
}) {
  /* 1. pre-calculate trove params */
  const maxFee = ethers.utils.parseEther('1').mul(3).div(100); // Slippage protection: 3%
  const [upperHint, lowerHint] = await this.piggyApp.findHintForTrove(bnbColl, pusdDebt);

  /* 2. approve to vault migration  */
  await this.vBNB.approve(this.vaultMigration.address, vBnbBalance.mul(2)).then((tx) => tx.wait());
  await this.tokenPUSD.approve(this.vaultMigration.address, pusdDebt.mul(2)).then((tx) => tx.wait());

  /* 3. flashloan */
  console.log('[FlashLoan] starting');
  console.log('[FlashLoan] bnbColl/pusdDebt', ethers.utils.formatEther(bnbColl), ethers.utils.formatEther(pusdDebt));
  const abiCoder = new ethers.utils.AbiCoder();
  // const baseAmount = borrowBalance.mul(101).div(100);  // 多借一点 BUSD, 因为执行期间利息又增加了
  // const quoteAmount = 0;  // PUSD
  // const assetTo = this.vaultMigration.address;
  // const data = abiCoder.encode(
  //   ['uint256', 'uint256', 'uint256', 'address', 'address'],
  //   [bnbColl, pusdDebt, maxFee, upperHint, lowerHint],
  // );
  // await this.dodoStablePool.flashLoan(baseAmount, quoteAmount, assetTo, data).then((tx) => tx.wait());
  await this.vaultMigration.startMigrate(upperHint, lowerHint).then((tx) => tx.wait());
  console.log('[FlashLoan] end');
}


/**
 * main process
 * run `npx hardhat revert [snapshotId] --network localhost` to send a `evm_revert` request
 */
async function shotshotAndRun() {
  if (!process.env.HARDHAT_NETWORK) {
    throw new Error('HARDHAT_NETWORK env is required');
  }

  const app = new App();
  await app.initialize(require('../.testaccount').privateKey);  /* user wallet for test */

  const snapshotId = await network.provider.send('evm_snapshot');
  console.log('start on snapshot:', snapshotId);

  try {
    await app.mockUserAccount();
    /* 实际的流程从 precheck 开始 */
    const precheckResult = await app.precheck();
    await app.flashloan(precheckResult);
  } catch(err) {
    console.log(err);
  }

  await network.provider.send('evm_revert', [snapshotId]);
  console.log('reverted to snapshot:', snapshotId);
}

shotshotAndRun()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
