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
  this.vaultMigration = await deployments.get('VaultMigration');
  [
    this.vBNB,
    this.vBUSD,
    this.tokenPUSD,
    this.dodoStablePool,
  ] = await Promise.all([
    getContractInstance('vBNB', this.userWallet),
    getContractInstance('vBUSD', this.userWallet),
    getContractInstance('PUSD', this.userWallet),
    getContractInstance('DODOStablePool', this.userWallet),
  ]);
}

App.prototype.mockUserAccount = async function() {
  const faucet = new FaucetApp(this.userWallet);
  await faucet.requestBNB(20);
  const venusApp = new VenusApp(this.userWallet);
  // await venusApp.initMarketWithExactCR(5, 130);
  await venusApp.initMarketWithMultipleAssets(
    /* 将清空所有头寸 */
    { 'vBNB': 1200 },  // collaterals
    { 'vBUSD': 900 },  // debts

    /* 剩余抵押率不足 */
    // { 'vBNB': 1200, 'vETH': 60 },  // collaterals
    // { 'vBUSD': 900, 'vUSDC': 100 },  // debts

    /* 剩余抵押率足够 */
    // { 'vBNB': 1000, 'vETH': 300 },  // collaterals
    // { 'vBUSD': 800, 'vUSDC': 200 },  // debts
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
  // 加上手续费 0.3% ~ 1%
  const pusdDebt = borrowBalance.mul(101).div(100);

  /* TODO !
   * 检查一下 liquidityToRemove
   * 合约里 vBNB.transferFrom 在 liquidity 不足的时候会执行失败, 合约里不需要在判断 liquidityToRemove
   * 因为 liquidityToRemove 计算有误差, 不能直接 require(liquidityToRemove <= liquidity)
   */
  // (uint256 error, uint256 liquidity, uint256 shortfall) = venusComptroller.getAccountLiquidity(sender);
  // assert(error == 0 && shortfall == 0 && liquidity > 0);
  //
  // (bool isListed, uint collateralFactorMantissa, bool isXvsed) = venusComptroller.markets(address(vBNB));
  // assert(isListed && isXvsed && collateralFactorMantissa > 0);
  //
  // uint256 valueBNB = venusVars.bnbBalance * venusVars.priceBNB / 1e18;  // usd value * 1e18
  // uint256 valueBUSD = venusVars.borrowBalance * venusVars.priceBUSD / 1e18;  // usd value * 1e18
  // uint256 liquidityToRemove = valueBNB * collateralFactorMantissa / 1e18 - valueBUSD;
  // // require(liquidityToRemove <= liquidity);

  return { vBnbBalance, bnbBalance, pusdDebt, borrowBalance };
}

App.prototype.flashloan = async function({
  vBnbBalance, bnbBalance, pusdDebt, borrowBalance
}) {
  /* 1. pre-calculate trove params */
  // const maxFee = '5'.concat('0'.repeat(16)) // Slippage protection: 5%
  // TODO 不要在合约里算, 前端算好
  // OpenTrove 获得的 PUSD 大致等于 borrowBalance, 存入的 BNB 也大致等于 bnbBalance
  const [upperHint, lowerHint] = await this.piggyApp.findHintForTrove(bnbBalance, pusdDebt);

  /* 2. approve to vault migration  */
  await this.vBNB.approve(this.vaultMigration.address, vBnbBalance).then((tx) => tx.wait());
  await this.tokenPUSD.approve(this.vaultMigration.address, pusdDebt.mul(2)).then((tx) => tx.wait());

  /* 3. flashloan */
  console.log('[FlashLoan] starting');
  const abiCoder = new ethers.utils.AbiCoder();
  const baseAmount = borrowBalance.mul(101).div(100);  // 多借一点 BUSD, 因为执行期间利息又增加了
  const quoteAmount = 0;  // PUSD
  const assetTo = this.vaultMigration.address;
  const data = abiCoder.encode(['address', 'address'], [upperHint, lowerHint]);
  await this.dodoStablePool.flashLoan(baseAmount, quoteAmount, assetTo, data).then((tx) => tx.wait());
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
