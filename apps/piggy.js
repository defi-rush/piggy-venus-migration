const { ethers, getNamedAccounts } = require('hardhat');
const { getContractInstance } = require('./contract-factory');


const PiggyApp = function(userWallet) {
  if (!userWallet) {
    throw new Error('userWallet is required');
  }
  this.userWallet = userWallet;
}

/**
 * Finds a hint for trove.
 * 本地执行超级慢, 估计是 hardhat 内存限制的关系, 还不知道明确的原因, 这个方法直接连 mainnet RPC node 计算
 *
 * @param      {BigNumber}  bnbColl     BNB amount (in wei) borrower wants to lock for collateral
 * @param      {BigNumber}  pusdDebt    PUSD amount (in wei) borrower wants to withdraw
 * @return     {Array}      [upperHint, lowerHint]
 */
PiggyApp.prototype.findHintForTrove = async function(bnbColl, pusdDebt) {
  // return ['0x0000000000000000000000000000000000000000', '0x96D9eBF8c3440b91aD2b51bD5107A495ca0513E5']
  const provider = new ethers.providers.JsonRpcProvider({
    url: 'https://bsc-dataseed.binance.org/',
  })
  const [troveManager, hintHelpers, sortedTroves] = await Promise.all([
    getContractInstance('PiggyTroveManager', provider),
    getContractInstance('PiggyHintHelpers', provider),
    getContractInstance('PiggySortedTroves', provider),
  ]);
  // Read the liquidation reserve and latest borrowing fee
  const liquidationReserve = await troveManager.LUSD_GAS_COMPENSATION();
  const expectedFee = await troveManager.getBorrowingFeeWithDecay(pusdDebt);
  console.log('[Piggy] expectedFee', ethers.utils.formatEther(expectedFee));
  // Total debt of the new trove = PUSD amount drawn, plus fee, plus the liquidation reserve
  const expectedDebt = pusdDebt.add(expectedFee).add(liquidationReserve);
  // Get the nominal NICR of the new trove
  const _1e20 = ethers.utils.parseEther('100');
  const NICR = bnbColl.mul(_1e20).div(expectedDebt);
  // Get an approximate address hint from the deployed HintHelper contract. Use (15 * number of troves) trials
  // to get an approx. hint that is close to the right position.
  const numTroves = await sortedTroves.getSize();
  console.log('[Piggy] numTroves', numTroves.toString());
  // const numTrials = numTroves.mul(15);
  const numTrials = numTroves.mul(10);
  const { 0: approxHint } = await hintHelpers.getApproxHint(NICR, numTrials, 42);  // random seed of 42
  console.log('[Piggy] approxHint', approxHint);
  // Use the approximate hint to get the exact upper and lower hints from the deployed SortedTroves contract
  const { 0: upperHint, 1: lowerHint } = await sortedTroves.findInsertPosition(NICR, approxHint, approxHint);
  console.log('[Piggy] upperHint', upperHint);
  console.log('[Piggy] lowerHint', lowerHint);
  return [upperHint, lowerHint];
}

/**
 * bnbColl 和 pusdDebt 都是预估的金额, 用来计算 hint, 在合约里还会重新计算
 *
 * @param      {BigNumber}  bnbColl     BNB amount (in wei) borrower wants to lock for collateral
 * @param      {BigNumber}  pusdDebt    PUSD amount (in wei) borrower wants to withdraw
 */
PiggyApp.prototype.startMigrate = async function(bnbColl, pusdDebt) {
  const { VaultMigration, PiggyReward } = await deployments.all();
  const troveManager = await getContractInstance('PiggyTroveManager', ethers.provider);
  const vaultMigration = new ethers.Contract(VaultMigration.address, VaultMigration.abi, this.userWallet);
  const piggyReward = new ethers.Contract(PiggyReward.address, PiggyReward.abi, this.userWallet);

  /* 1. pre-calculate trove params */
  const maxFee = ethers.utils.parseEther('1').mul(3).div(100); // Slippage protection: 3%
  const [upperHint, lowerHint] = await this.findHintForTrove(bnbColl, pusdDebt);

  /* 2. flashloan */
  console.log('[VaultMigration] flashloan starting');
  const res = await vaultMigration.startMigrate(upperHint, lowerHint).then((tx) => tx.wait());
  console.log('[VaultMigration] flashloan end');
  const troveDebt = await troveManager.getTroveDebt(this.userWallet.address);
  const troveColl = await troveManager.getTroveColl(this.userWallet.address);
  console.log('[VaultMigration] troveDebt', ethers.utils.formatEther(troveDebt));
  console.log('[VaultMigration] troveColl', ethers.utils.formatEther(troveColl));
  const rewardBalance = await piggyReward.balanceOf(this.userWallet.address)
  console.log('[VaultMigration] piggy rewards', ethers.utils.formatEther(rewardBalance));
}


module.exports = {
  PiggyApp
}
