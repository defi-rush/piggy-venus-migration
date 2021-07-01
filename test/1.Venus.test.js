const { deployments, ethers, getNamedAccounts } = require('hardhat');
const { expect } = require('chai');
const setup = require('./helpers/setup');
const { getContractInstance } = require('./helpers/contracts');


describe('Test venus', function() {
  let userWallet, vBNBContract, vBUSDContract, comptrollerContract, pancakeRouterContract;

  before(async () => {
    userWallet = setup.getUserWallet();
    // await setup.initializeVenusMarket();
    vBNBContract = await getContractInstance('vBNB', userWallet);
    vBUSDContract = await getContractInstance('vBUSD', userWallet);
    /* Unitroller */
    comptrollerContract = await getContractInstance('VenusComptroller', userWallet);
    pancakeRouterContract = await getContractInstance('PancakeRouter', userWallet);
  });

  it ('should mint vToken for BNB', async function() {
    /*
     * contract.functions.METHOD_NAME will always returns a RESULT
     * contract.METHOD_NAME will return a value depending on ABI
     */
    const balanceVBefore = await vBNBContract.balanceOf(userWallet.address);
    const amount = ethers.utils.parseEther('5');
    // const txMint = await vBNBContract.functions.mint({
    const txMint = await vBNBContract.mint({
      value: amount
    });
    await txMint.wait();
    const [balanceVAfter, exchangeRate, decimals] = await Promise.all([
      await vBNBContract.balanceOf(userWallet.address),
      await vBNBContract.exchangeRateStored(),
      await vBNBContract.decimals(),
    ]);
    // 立即会产生利息, 所以 balanceOfUnderlying 计算出来的 balance 前后差异会大于 amount
    const amountVBNB = balanceVAfter.sub(balanceVBefore);
    const one18 = ethers.utils.parseEther('1');
    // BNB / vBNB == exchangeRate / 1e18, vBNB 的 decimals 是 8, 但 exchangeRate 在换算的时候, vBNB 和 BNB 都以 1e18 为底
    expect(amount.div(amountVBNB).eq(exchangeRate.div(one18))).to.be.true;
  });

  it ('should enter market', async function() {
    let assets = await comptrollerContract.getAssetsIn(userWallet.address);
    let [error, liquidity, shortfall] = await comptrollerContract.getAccountLiquidity(userWallet.address);
    const { vBNB: vBNBAddress, vBUSD: vBUSDAddress } = await getNamedAccounts();
    const txMarket = await comptrollerContract.enterMarkets([vBNBAddress, vBUSDAddress]);
    await txMarket.wait();
    assets = await comptrollerContract.getAssetsIn(userWallet.address);
    [error, liquidity, shortfall] = await comptrollerContract.getAccountLiquidity(userWallet.address);
    expect(assets).to.have.lengthOf(2);
    expect(liquidity.lt(0)).to.be.false;
    expect(shortfall.eq(0)).to.be.true;
  });

  it ('should borrow some BUSD', async function() {
    const borrowBalanceBefore = await vBUSDContract.borrowBalanceStored(userWallet.address);
    const amount = ethers.utils.parseEther('100');
    const txBorrow = await vBUSDContract.borrow(amount);
    await txBorrow.wait();
    const txInterest = await vBUSDContract.accrueInterest();
    await txInterest.wait();
    const borrowBalance = await vBUSDContract.borrowBalanceStored(userWallet.address);
    expect(borrowBalance.sub(borrowBalanceBefore).gt(amount)).to.be.true;
    // 因为有利息, borrow 以后实际的债务要大于 amount
  });

  it ('should repay BUSD with interests', async function() {
    const txInterest = await vBUSDContract.accrueInterest();
    await txInterest.wait();
    const borrowBalance = await vBUSDContract.borrowBalanceStored(userWallet.address);
    const { vBUSD: addressVBUSD, WBNB: addressWBNB, BUSD: addressBUSD } = await getNamedAccounts();

    const bUSDContract = await getContractInstance('BUSD', userWallet);
    const balance = await bUSDContract.balanceOf(userWallet.address);
    // 因为每个区块都会产生利息, 到最后调用 repayBorrow 的时候 borrowBalance 又增加了, 这里多换一点出来
    const amountToRepay = borrowBalance.add(ethers.utils.parseEther('1'));
    if (amountToRepay.gt(balance)) {
      const amountOut = amountToRepay.sub(balance);
      const path = [addressWBNB, addressBUSD];
      const to = userWallet.address;
      const deadline = parseInt((new Date()).valueOf() / 1000) + 300;
      // 给定要兑换出来的 BUSD 数量 amountOut, 计算需要多少 BNB
      const amountsIn = await pancakeRouterContract.getAmountsIn(amountOut, path);
      const amountBNB = amountsIn[0].add(ethers.utils.parseEther('1'));
      const txSwap = await pancakeRouterContract.swapETHForExactTokens(amountOut, path, to, deadline, {
        value: amountBNB
        // 多给一点, 没用完的 BNB 会返回
      });
      await txSwap.wait();
    }
    const balanceNew = await bUSDContract.balanceOf(userWallet.address);
    expect(balanceNew.gte(amountToRepay), 'enough balance to repay').to.be.true;

    const txApprove = await bUSDContract.approve(addressVBUSD, amountToRepay);
    await txApprove.wait();
    // const txRepay = await vBUSDContract.repayBorrow(amountToRepay);
    // amountToRepay 好像不能超过实际的债务，用 -1 (2^256 - 1) 表示还清所有债务
    const amount = ethers.BigNumber.from(2).pow(256).sub(1);
    const txRepay = await vBUSDContract.repayBorrow(amount);
    await txRepay.wait();
    const borrowBalanceNew = await vBUSDContract.borrowBalanceStored(userWallet.address);
    expect(borrowBalanceNew.eq(0), 'no debt').to.be.true;
  });

  it ('should redeem BNB with interests', async function() {
    const txInterest = await vBUSDContract.accrueInterest();
    await txInterest.wait();
    const balanceVBNB = await vBNBContract.balanceOf(userWallet.address);
    const txRedeem = await vBNBContract.redeem(balanceVBNB);
    await txRedeem.wait();
    const balanceVBNBNew = await vBNBContract.balanceOf(userWallet.address);
    expect(balanceVBNBNew.eq(0), 'no collateral').to.be.true;
  });

});
