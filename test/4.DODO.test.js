const { deployments, ethers, getNamedAccounts } = require('hardhat');
const { expect } = require('chai');
const setup = require('./helpers/setup');
const { getContractInstance } = require('./helpers/contracts');

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
  const one18 = parseUnits('1', 18);
  [priceBNB, priceBUSD] = [priceBNB.div(one18), priceBUSD.div(one18)];
  const amountToDepositBNB = parseEther('5');
  // venus 的质押率现在是 1.25
  const amountToBorrowBUSD = amountToDepositBNB.mul((priceBNB).div(priceBUSD)).div(2);
  console.log('deposit/borrow amounts in USD',
    formatEther(amountToDepositBNB.mul(priceBNB)),
    formatEther(amountToBorrowBUSD.mul(priceBUSD)),
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
  console.log('liquidity of venus before flashloan', formatEther(liquidity));
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
  console.log('liquidity of venus after flashloan', formatEther(liquidity));
}

describe('Test DODO', function() {
  let userWallet;

  before(async () => {
    userWallet = setup.getUserWallet();
    await initVenusDebt();
  });

  it ('should give some BUSD/PUSD to VaultMigration contract', async function() {
    const VaultMigration = await deployments.get('VaultMigration');
    const { WBNB: addressWBNB, BUSD: addressBUSD } = await getNamedAccounts();
    const pancakeRouterContract = await getContractInstance('PancakeRouter', userWallet);
    const busdContract = await getContractInstance('BUSD', userWallet);
    /* swap */
    const path = [addressWBNB, addressBUSD];
    const to = userWallet.address;
    const deadline = parseInt((new Date()).valueOf() / 1000) + 300;
    const amountOut = parseEther('1');
    const amountsIn = await pancakeRouterContract.getAmountsIn(amountOut, path);
    const amountBNB = amountsIn[0];  // .add(parseEther('1'));
    const txSwap = await pancakeRouterContract.swapETHForExactTokens(amountOut, path, to, deadline, {
      value: amountBNB
    });
    await txSwap.wait();
    /* transfer */
    const txTsf = await busdContract.transfer(VaultMigration.address, parseEther('1'));
    await txTsf.wait();
  });

  it ('should callback to VaultMigration', async function() {
    const abiCoder = new ethers.utils.AbiCoder();
    const VaultMigration = await deployments.get('VaultMigration');
    const baseAmount = parseEther('15');  //BUSD
    const quoteAmount = parseEther('5');  // PUSD
    const assetTo = VaultMigration.address;
    const data = abiCoder.encode(['address', 'uint256'], [VaultMigration.address, baseAmount]);
    // console.log(data);
    const dspContract = await getContractInstance('DODOStablePool', userWallet);
    const tx = await dspContract.flashLoan(baseAmount, quoteAmount, assetTo, data);
    const res = await tx.wait();
    // console.log(tx, res);
  });

  after(async () => {
    await clearVenusDebt();
  });

});
