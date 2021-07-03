const { deployments, ethers, getNamedAccounts } = require('hardhat');
const { expect } = require('chai');
const setup = require('./helpers/setup');
const { getContractInstance } = require('../apps/ContractFactory');

const { parseEther, formatEther, formatUnits, parseUnits } = ethers.utils;


async function initVenusDebt() {
  const userWallet = setup.getUserWallet();
  const [
    vBNBContract, vBUSDContract, comptrollerContract, priceOracleContract
  ] = await Promise.all([
    getContractInstance('vBNB', userWallet),
    getContractInstance('vBUSD', userWallet),
    getContractInstance('VenusComptroller', userWallet),
    getContractInstance('VenusPriceOracle', userWallet),
  ]);
  const { vBNB: addressVBNB, vBUSD: addressVBUSD } = await getNamedAccounts();
  let [priceBNB, priceBUSD] = await Promise.all([
    priceOracleContract.getUnderlyingPrice(addressVBNB),
    priceOracleContract.getUnderlyingPrice(addressVBUSD),
  ]);
  const _1e18 = parseUnits('1', 18);
  [priceBNB, priceBUSD] = [priceBNB.div(_1e18), priceBUSD.div(_1e18)];
  const amountToDepositBNB = parseEther('5');
  // venus 的质押率现在是 1.25
  const amountToBorrowBUSD = amountToDepositBNB.mul((priceBNB).div(priceBUSD)).div(2);
  console.log('deposit/borrow amounts:',
    `${formatEther(amountToDepositBNB)} ($${formatEther(amountToDepositBNB.mul(priceBNB))})`,
    `${formatEther(amountToBorrowBUSD)} ($${formatEther(amountToBorrowBUSD.mul(priceBUSD))})`,
  );
  /* enter market */
  const txMarket = await comptrollerContract.enterMarkets([addressVBNB, addressVBUSD]);
  await txMarket.wait();
  /* deposit */
  const txMint = await vBNBContract.mint({ value: amountToDepositBNB });
  await txMint.wait();
  /* borrow */
  const txBorrow = await vBUSDContract.borrow(amountToBorrowBUSD);
  await txBorrow.wait();
  /* liquidity */
  const [error, liquidity, shortfall] = await comptrollerContract.getAccountLiquidity(userWallet.address);
  console.log('liquidity of venus before flashloan:', formatEther(liquidity));
  return { amountToDepositBNB, amountToBorrowBUSD };
}

async function clearVenusDebt() {
  const userWallet = setup.getUserWallet();
  const { vBUSD: addressVBUSD, WBNB: addressWBNB, BUSD: addressBUSD } = await getNamedAccounts();
  const [
    busdContract, vBNBContract, vBUSDContract,
    comptrollerContract, pancakeRouterContract,
  ] = await Promise.all([
    getContractInstance('BUSD', userWallet),
    getContractInstance('vBNB', userWallet),
    getContractInstance('vBUSD', userWallet),
    getContractInstance('VenusComptroller', userWallet),
    getContractInstance('PancakeRouter', userWallet),
  ]);
  /* accrueInterest */
  // accrueInterest 需要发送交易, 不能并行执行, 不然 nonce 会重复
  const txInterest1 = await vBUSDContract.accrueInterest();
  const txInterest2 = await vBNBContract.accrueInterest();
  await Promise.all([txInterest1.wait(), txInterest2.wait()]);
  /* calculate collateral and debt */
  const [
    balanceVBNB, borrowBalance, balanceBUSD
  ] = await Promise.all([
    vBNBContract.balanceOf(userWallet.address),
    vBUSDContract.borrowBalanceStored(userWallet.address),
    busdContract.balanceOf(userWallet.address),
  ]);
  console.log('amount of BUSD to repay:', formatEther(borrowBalance));
  console.log('amount of vBNB to redeem:', formatUnits(balanceVBNB, 8));
  const amountToRepay = borrowBalance.add(parseEther('1'));  // 多 swap 一点
  if (amountToRepay.gt(balanceBUSD)) {
    const amountOut = amountToRepay.sub(balanceBUSD);
    const path = [addressWBNB, addressBUSD];
    const to = userWallet.address;
    const deadline = parseInt((new Date()).valueOf() / 1000) + 300;
    const amountsIn = await pancakeRouterContract.getAmountsIn(amountOut, path);
    const amountBNB = amountsIn[0].add(parseEther('1'));  // 多给一点, 没用完的 BNB 会返回
    const txSwap = await pancakeRouterContract.swapETHForExactTokens(
      amountOut, path, to, deadline, { value: amountBNB }
    );
    await txSwap.wait();
  }
  /* repay */
  const txApprove = await busdContract.approve(addressVBUSD, amountToRepay);
  await txApprove.wait();
  // amountToRepay 好像不能超过实际的债务，用 -1 (2^256 - 1) 表示还清所有债务
  const amount = ethers.BigNumber.from(2).pow(256).sub(1);
  const txRepay = await vBUSDContract.repayBorrow(amount);
  await txRepay.wait();
  /* redeem */
  const txRedeem = await vBNBContract.redeem(balanceVBNB);
  await txRedeem.wait();
  /* liquidity */
  const [error, liquidity, shortfall] = await comptrollerContract.getAccountLiquidity(userWallet.address);
  console.log('liquidity of venus after cleared:', formatEther(liquidity));
}


async function _findHintForPiggyTrove(PUSDAmount, ETHColl) {
  const userWallet = setup.getUserWallet();
  /**/
  return [
    // userWallet.address,
    // userWallet.address,
    '0x0000000000000000000000000000000000000000',
    '0x96D9eBF8c3440b91aD2b51bD5107A495ca0513E5',
  ]
  /**/
  const troveManager = await getContractInstance('PiggyTroveManager', userWallet);
  const hintHelpers = await getContractInstance('PiggyHintHelpers', userWallet);
  const sortedTroves = await getContractInstance('PiggySortedTroves', userWallet);
  // const PUSDAmount = ethers.utils.parseEther('200'); // borrower wants to withdraw 200 PUSD
  // const ETHColl = ethers.utils.parseEther('1'); // borrower wants to lock 1 ETH collateral

  // Call deployed TroveManager contract to read the liquidation reserve and latest borrowing fee
  const liquidationReserve = await troveManager.LUSD_GAS_COMPENSATION();
  const expectedFee = await troveManager.getBorrowingFeeWithDecay(PUSDAmount);
  console.log('expectedFee', ethers.utils.formatEther(expectedFee));

  // Total debt of the new trove = PUSD amount drawn, plus fee, plus the liquidation reserve
  const expectedDebt = PUSDAmount.add(expectedFee).add(liquidationReserve);

  // Get the nominal NICR of the new trove
  const _1e20 = ethers.utils.parseEther('100');
  let NICR = ETHColl.mul(_1e20).div(expectedDebt);

  // Get an approximate address hint from the deployed HintHelper contract. Use (15 * number of troves) trials
  // to get an approx. hint that is close to the right position.
  let numTroves = await sortedTroves.getSize();
  console.log('numTroves', numTroves.toString());
  let numTrials = numTroves.mul(15);
  let { 0: approxHint } = await hintHelpers.getApproxHint(NICR, numTrials, 42);  // random seed of 42
  console.log('approxHint', approxHint);

  // Use the approximate hint to get the exact upper and lower hints from the deployed SortedTroves contract
  let { 0: upperHint, 1: lowerHint } = await sortedTroves.findInsertPosition(NICR, approxHint, approxHint);
  console.log('upperHint/lowerHint', upperHint, lowerHint);
  return [upperHint, lowerHint];
}


describe('Test DODO', function() {
  let userWallet;

  before(async () => {
    userWallet = setup.getUserWallet();
    await clearVenusDebt();
    await initVenusDebt();
  });

  // it ('should give 1 BUSD or PUSD to VaultMigration contract', async function() {
  //   const VaultMigration = await deployments.get('VaultMigration');
  //   const { WBNB: addressWBNB, BUSD: addressBUSD } = await getNamedAccounts();
  //   const pancakeRouterContract = await getContractInstance('PancakeRouter', userWallet);
  //   const busdContract = await getContractInstance('BUSD', userWallet);
  //   /* swap */
  //   const path = [addressWBNB, addressBUSD];
  //   const to = userWallet.address;
  //   const deadline = parseInt((new Date()).valueOf() / 1000) + 300;
  //   const amountOut = parseEther('1');
  //   const amountsIn = await pancakeRouterContract.getAmountsIn(amountOut, path);
  //   const amountBNB = amountsIn[0];  // .add(parseEther('1'));
  //   const txSwap = await pancakeRouterContract.swapETHForExactTokens(
  //     amountOut, path, to, deadline, { value: amountBNB }
  //   );
  //   await txSwap.wait();
  //   /* transfer */
  //   const txTsf = await busdContract.transfer(VaultMigration.address, amountOut);
  //   await txTsf.wait();
  // });

  it ('should callback to VaultMigration', async function() {
    const VaultMigration = await deployments.get('VaultMigration');
    /* 1. Precheck */
    const [vBNBContract, vBUSDContract, pusdContract] = await Promise.all([
      getContractInstance('vBNB', userWallet),
      getContractInstance('vBUSD', userWallet),
      getContractInstance('PUSD', userWallet),
    ]);
    const [exchangeRate, vBnbBalance, borrowBalance] = await Promise.all([
      vBNBContract.exchangeRateStored(),
      vBNBContract.balanceOf(userWallet.address),
      vBUSDContract.borrowBalanceStored(userWallet.address),
    ]);

    /* 2. Prepare for piggy trove */
    const _1e18 = parseUnits('1', 18);
    const bnbBalance = vBnbBalance.mul(exchangeRate).div(_1e18);
    // 加上手续费 0.3%
    const pusdDebt = borrowBalance.mul(101).div(100);
    // OpenTrove 获得的 PUSD 大致等于 borrowBalance, 存入的 BNB 也大致等于 bnbBalance
    const [upperHint, lowerHint] = await _findHintForPiggyTrove(bnbBalance, pusdDebt);

    /* 3. Approve to VaultMigration */
    const txApprove1 = await vBNBContract.approve(VaultMigration.address, vBnbBalance);
    await txApprove1.wait();
    const txApprove2 = await pusdContract.approve(VaultMigration.address, pusdDebt.mul(2));
    await txApprove2.wait();
    // 这里用户还需要 approve 一下 PUSD

    /* 4. FlashLoan */
    console.log('FlashLoan starting');
    const abiCoder = new ethers.utils.AbiCoder();
    const baseAmount = borrowBalance.mul(101).div(100);  // 多借一点 BUSD, 因为执行期间利息又增加了
    const quoteAmount = 0;  // PUSD
    const assetTo = VaultMigration.address;
    // data 现在是随便放了两个值, 用于 debug
    const data = abiCoder.encode(['address', 'address'], [upperHint, lowerHint]);
    const dspContract = await getContractInstance('DODOStablePool', userWallet);
    const txFlashLoan = await dspContract.flashLoan(baseAmount, quoteAmount, assetTo, data);
    await txFlashLoan.wait();
  });

  after(async () => {
    // await clearVenusDebt();
  });

});
