const { deployments, ethers, getNamedAccounts } = require('hardhat');
const { expect } = require('chai');
const setup = require('./helpers/setup');
const { getContractInstance } = require('./helpers/contracts');

describe('Test DODO', function() {
  let userWallet;

  before(async () => {
    userWallet = setup.getUserWallet();
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
    const amountOut = ethers.utils.parseEther('1');
    const amountsIn = await pancakeRouterContract.getAmountsIn(amountOut, path);
    const amountBNB = amountsIn[0];  // .add(ethers.utils.parseEther('1'));
    const txSwap = await pancakeRouterContract.swapETHForExactTokens(amountOut, path, to, deadline, {
      value: amountBNB
    });
    await txSwap.wait();
    /* transfer */
    const txTsf = await busdContract.transfer(VaultMigration.address, ethers.utils.parseEther('1'));
    await txTsf.wait();
  });

  it ('should callback to VaultMigration', async function() {
    const abiCoder = new ethers.utils.AbiCoder();
    const VaultMigration = await deployments.get('VaultMigration');
    const baseAmount = ethers.utils.parseEther('15');  //BUSD
    const quoteAmount = ethers.utils.parseEther('5');  // PUSD
    const assetTo = VaultMigration.address;
    const data = abiCoder.encode(['address', 'uint256'], [VaultMigration.address, baseAmount]);
    // console.log(data);
    const dspContract = await getContractInstance('DODOStablePool', userWallet);
    const tx = await dspContract.flashLoan(baseAmount, quoteAmount, assetTo, data);
    const res = await tx.wait();
    // console.log(tx, res);
  });

});
