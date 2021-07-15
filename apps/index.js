/**
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
  this.venusApp = new VenusApp(this.userWallet);
  [
    this.vBNB,
    this.vBUSD,
    this.tokenPUSD,
  ] = await Promise.all([
    getContractInstance('vBNB', this.userWallet),
    getContractInstance('vBUSD', this.userWallet),
    getContractInstance('PUSD', this.userWallet),
  ]);
}

/**
 * 给测试账户充点钱并且加一些 Venus 头寸
 */
App.prototype.prepareVenusPositions = async function() {
  const faucet = new FaucetApp(this.userWallet);
  await faucet.requestBNB(20);
  await this.venusApp.initMarketWithMultipleAssets(
    /* 将清空所有头寸 */
    { 'vBNB': 1200 },  // collaterals
    { 'vBUSD': 900 },  // debts
    /* Piggy 最小 pusd debt 不满足 */
    // { 'vBNB': 225, 'vETH': 200 },  // collaterals
    // { 'vBUSD': 178 },  // debts
    /* Piggy 最低质押率不满足, 这个会自动把 busdRepay 改成 1000, 最后导致 venus 剩余抵押率足够 */
    // { 'vBNB': 1500, 'vETH': 500 },  // collaterals
    // { 'vBUSD': 1400, 'vUSDC': 100 },  // debts
    /* 剩余抵押率不足 */
    // { 'vBNB': 1200, 'vETH': 60 },  // collaterals
    // { 'vBUSD': 900, 'vUSDC': 100 },  // debts
    /* 剩余抵押率足够 */
    // { 'vBNB': 1000, 'vETH': 300 },  // collaterals
    // { 'vBUSD': 800, 'vUSDC': 200 },  // debts
  );
}

/**
 * 检查迁移前后 Venus 的健康状况, 以及迁移金额是否满足 Piggy 要求, 计算有误差, 这里只是估算
 * -
 * availableCredit: 总的借款额度 (USD)
 * totalBorrows: 所有债务的总价值, 即已借款金额 (USD)
 * liquidity = availableCredit - totalBorrows: 剩余可借款额度 (USD)
 * Venus 用 borrowLimitUsed = totalBorrows / availableCredit 来衡量健康度
 * Venus 的 collateralFactor 平均在 1.25 的样子
 * 为了达到 150% 的 collateral ratio, 需要 borrowLimitUsed 小于 5/6 (80%)
 * 也就是 liquidity / totalBorrows > 0.2
 * -
 * 合约里不再需要判断 liquidity 相关的信息, vBNB.transferFrom 在 liquidity 不足的时候会执行失败
 */
App.prototype.precheck = async function() {
  const {
    liquidity, totalBorrows, availableCredit
  } = await this.venusApp.getAccountData();
  const usedPercent = totalBorrows.mul(100).div(availableCredit);
  console.log('[Precheck] availableCredit', ethers.utils.formatEther(availableCredit));
  console.log('[Precheck] totalBorrows', ethers.utils.formatEther(totalBorrows));
  console.log('[Precheck] borrowLimitUsed before migration', `${usedPercent}%`);

  const {
    vBnbBalance, busdBorrowBalance, bnbBalance,
    bnbPrice, busdPrice, liquidityToRemove,
  } = await this.venusApp.getMigrationData();
  console.log('[Precheck] bnbBalance', ethers.utils.formatEther(bnbBalance));
  console.log('[Precheck] vBnbBalance', ethers.utils.formatUnits(vBnbBalance, 8));
  console.log('[Precheck] busdBorrowBalance', ethers.utils.formatEther(busdBorrowBalance));
  if (bnbBalance.lte(0) || busdBorrowBalance.lte(0)) {
    throw new Error('No BNB or BUSD positions');
  }
  // 为了检测合约健壮性, 禁用这两个检查
  // if (busdBorrowBalance.lt(ethers.utils.parseEther('180'))) {
  //   throw new Error('busdBorrowBalance must be greater than minimum');
  // }
  // if (liquidityToRemove.gt(liquidity.mul(101).div(100))) {
  //   // 预检查阶段允许 1% 的误差
  //   throw new Error('Liquidity is not enough after migration');
  // }
  let busdRepay = busdBorrowBalance;
  /* Piggy requires (bnbBalance * bnbPrice) / (busdBorrowBalance * busdPrice) >= 110 / 100  */
  if (bnbBalance.mul(bnbPrice).mul(100).lt(busdRepay.mul(busdPrice).mul(110))) {
    busdRepay = bnbBalance.mul(bnbPrice).mul(100).div(busdPrice.mul(150));
  }
  console.log('[Precheck] busdRepay', ethers.utils.formatEther(busdRepay));
  const _1e18 = ethers.utils.parseUnits('1', 18);
  const liquidityNew = liquidity.sub(liquidityToRemove);
  const totalBorrowsNew = totalBorrows.sub(busdRepay.mul(busdPrice).div(_1e18));
  const availableCreditNew = totalBorrowsNew.add(liquidityNew);
  const usedPercentNew = totalBorrowsNew.mul(100).div(availableCreditNew);
  console.log('[Precheck] borrowLimitUsed after migration', `${usedPercentNew}%`);
  return { bnbBalance, vBnbBalance, busdRepay };
}

App.prototype.execute = async function({
  bnbBalance, vBnbBalance, busdRepay
}) {
  const bnbColl = bnbBalance;
  const pusdDebt = busdRepay.mul(101).div(100);  // flashloan 的手续费和滑点 < 1%

  const VaultMigration = await deployments.get('VaultMigration');
  // vBnbBalance 余额是不会变的, 不需要 approve 两倍
  await this.vBNB.approve(VaultMigration.address, vBnbBalance).then((tx) => tx.wait());
  await this.tokenPUSD.approve(VaultMigration.address, pusdDebt.mul(2)).then((tx) => tx.wait());

  console.log('[Execute] bnbColl', ethers.utils.formatEther(bnbColl));
  console.log('[Execute] pusdDebt', ethers.utils.formatEther(pusdDebt));
  await this.piggyApp.startMigrate(bnbColl, pusdDebt);
}


/**
 * main process
 * 可以传一个已经在 venus 有头寸的用户的钱包地址
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
  await app.initialize(publicKey ? { publicKey } : { privateKey });

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

async function listUsersAndRun() {
  const borrowers = await VenusApp.listUsers(9170000, 9180000);
  for (let borrower of borrowers) {
    console.log(`---------- ${borrower} ----------`);
    await shotshotAndRun(borrower);
  }
}


listUsersAndRun()
// shotshotAndRun('0x0A1449Ed539d05990f4879dE851b468f24359978')
// shotshotAndRun()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
