const { deployments, ethers, getNamedAccounts } = require('hardhat');
const { expect } = require('chai');
const setup = require('./helpers/setup');
const { getContractInstance } = require('../apps/contract-factory');


describe('Test piggy', function() {
  let userWallet;
  let borrowerOperations, troveManager, hintHelpers, sortedTroves;

  before(async () => {
    userWallet = setup.getUserWallet();
    borrowerOperations = await getContractInstance('PiggyBorrowerOperations', userWallet);
    troveManager = await getContractInstance('PiggyTroveManager', userWallet);
    hintHelpers = await getContractInstance('PiggyHintHelpers', userWallet);
    sortedTroves = await getContractInstance('PiggySortedTroves', userWallet);
  });

  async function _findHint() {
    // 我发现 opentrove 的执行有点慢这个是不是和 _lowerHint 还有 _upperHint 有点关系

    const PUSDAmount = ethers.utils.parseEther('200'); // borrower wants to withdraw 200 PUSD
    const ETHColl = ethers.utils.parseEther('1'); // borrower wants to lock 1 ETH collateral

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
    console.log(NICR.toString(), numTrials.toString(), 42);
    let { 0: approxHint } = await hintHelpers.getApproxHint(NICR, numTrials, 42);  // random seed of 42
    console.log('approxHint', approxHint);

    // Use the approximate hint to get the exact upper and lower hints from the deployed SortedTroves contract
    let { 0: upperHint, 1: lowerHint } = await sortedTroves.findInsertPosition(NICR, approxHint, approxHint);
    console.log('upperHint, lowerHint', upperHint, lowerHint);
    return [upperHint, lowerHint];
  }

  it ('should open trove', async function() {
    console.log('troveManager', await borrowerOperations.troveManager());
    const [upperHint, lowerHint] = await _findHint();
    const pusdAmount = ethers.utils.parseEther('200');
    const bnbAmount = ethers.utils.parseEther('1');
    const maxFeePercentage = ethers.utils.parseEther('0.1');
    const overrides = {
      value: bnbAmount,
      gasLimit: 12450000,
    };
    // const tx = await borrowerOperations.openTrove(
    const tx = await borrowerOperations.openTroveOnBehalfOf(
      userWallet.address, maxFeePercentage, pusdAmount, upperHint, lowerHint, overrides);
    const res = await tx.wait();
    // console.log(res);
  });

  it ('should open trove onBehalf', async function() {
    //
  });

});
