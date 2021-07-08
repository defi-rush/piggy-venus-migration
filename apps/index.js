/*
 * const hre = require('hardhat') returns an instance of the HRE.
 * using HRE outside the hardhat tasks is explained here:
 *   https://hardhat.org/advanced/hardhat-runtime-environment.html#explicitly
 *   https://hardhat.org/guides/scripts.html#writing-scripts-with-hardhat
 * HARDHAT_NETWORK environment variable is necessary to run these scripts:
 *   `HARDHAT_NETWORK=localhost node apps/index.js`
 * or use `hardhat run` script with --network arg
 *   `npx hardhat run apps/index.js --network localhost`
 */
const { ethers, deployments, network } = require('hardhat');
const { getContractInstance } = require('./contract-factory');

const { FaucetApp } = require('./faucet');
const { VenusApp } = require('./venus');
const { PiggyApp } = require('./piggy');

function App() {}

App.prototype.initialize = async function({ publicKey, privateKey }) {
  if (privateKey) {
    this.userWallet = new ethers.Wallet(privateKey, ethers.provider);
  } else if (publicKey) {
    await network.provider.send('hardhat_impersonateAccount', [publicKey]);
    this.userWallet = await ethers.getSigner(publicKey);
    const balance = await this.userWallet.getBalance()
    console.log(`impersonate account ${publicKey}, balance ${ethers.utils.formatEther(balance)}`);
  } else {
    throw new Error('Ether publicKey or privateKey is required');
  }
  this.piggyApp = new PiggyApp(this.userWallet);
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

App.prototype.prepareVenusPositions = async function() {
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
  console.log('[Precheck] bnbBalance', ethers.utils.formatEther(bnbBalance));
  console.log('[Precheck] vBnbBalance', ethers.utils.formatUnits(vBnbBalance, 8));
  console.log('[Precheck] borrowBalance', ethers.utils.formatEther(borrowBalance));

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
  // console.log(liquidityToRemove.toString(), liquidity.toString());
  if (liquidityToRemove.gt(liquidity)) {
    throw new Error('liquidity is not enough after migration');
  }

  return { bnbBalance, vBnbBalance, borrowBalance };
}

App.prototype.execute = async function({
  bnbBalance, vBnbBalance, borrowBalance
}) {
  /*
   * 1. 预估一下 bnb 和 pusd 的数量
   * busd 加上 flashloan 的手续费 0.3% ~ 1%
   * TODO, flashloan 的手续费还要确认下, 要用 querySellQuote 算出 pusdDebt
   * uint256 pusdDebt = venusVars.borrowBalance * 101 / 100;
   */
  const bnbColl = bnbBalance;
  const pusdDebt = borrowBalance.mul(101).div(100);

  /* 2. approve to vault migration  */
  const VaultMigration = await deployments.get('VaultMigration');
  await this.vBNB.approve(VaultMigration.address, vBnbBalance.mul(2)).then((tx) => tx.wait());
  await this.tokenPUSD.approve(VaultMigration.address, pusdDebt.mul(2)).then((tx) => tx.wait());

  /* 3. execute */
  console.log('[Execute] bnbColl', ethers.utils.formatEther(bnbColl));
  console.log('[Execute] pusdDebt', ethers.utils.formatEther(pusdDebt));
  await this.piggyApp.startMigrate(bnbColl, pusdDebt);
}


/**
 * main process
 * run `npx hardhat revert [snapshotId] --network localhost` to send a `evm_revert` request
 */
async function shotshotAndRun(publicKey) {
  if (network.name !== 'localhost') {
    throw new Error('This script only works on localhost');
  }

  const app = new App();
  /* user wallet for test */
  const { privateKey } = require('../.testaccount');
  const hasVenusPositions = !!publicKey;
  await app.initialize({
    // privateKey
    publicKey,
  });

  const snapshotId = await network.provider.send('evm_snapshot');
  console.log('start on snapshot:', snapshotId);

  try {
    if (!hasVenusPositions) {
      await app.prepareVenusPositions();
    }
    /* 实际的流程从 precheck 开始 */
    const precheckResult = await app.precheck();
    await app.execute(precheckResult);
  } catch(err) {
    console.log(err);
  }

  await network.provider.send('evm_revert', [snapshotId]);
  console.log('reverted to snapshot:', snapshotId);
}

// 可以传一个已经在 venus 有头寸的用户的钱包地址
// shotshotAndRun('0x4be1c4779ea563f20371dbb689a61a60c3d8bf73')
shotshotAndRun()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
