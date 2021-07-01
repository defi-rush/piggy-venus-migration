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
    //
  });

  it ('should callback to VaultMigration', async function() {
    const abiCoder = new ethers.utils.AbiCoder();
    const VaultMigration = await deployments.get('VaultMigration');
    const baseAmount = ethers.utils.parseEther('15');
    const quoteAmount = ethers.utils.parseEther('5');
    const assetTo = VaultMigration.address;
    const data = abiCoder.encode(['address', 'uint256'], [VaultMigration.address, baseAmount]);
    // console.log(data);
    const dspContract = await getContractInstance('DODOStablePool', userWallet);
    const tx = await dspContract.flashLoan(baseAmount, quoteAmount, assetTo, data);
    const res = await tx.wait();
    // console.log(tx, res);
  });

});
