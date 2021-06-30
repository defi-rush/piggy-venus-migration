const { deployments, ethers, getNamedAccounts } = require('hardhat');
const { expect } = require('chai');
const setup = require('./helpers/setup');

describe('Test DODO', function() {
  let userWallet, dspContract;

  before(async () => {
    userWallet = setup.getUserWallet();
    const { DODOStablePool: addressDSP } = await getNamedAccounts();
    dspContract = new ethers.Contract(addressDSP, [
      'function flashLoan(uint256 baseAmount, uint256 quoteAmount, address assetTo, bytes calldata data)'
    ], userWallet);
  });

  it ('callback to VaultMigration', async function() {
    const abiCoder = new ethers.utils.AbiCoder();
    const VaultMigration = await deployments.get('VaultMigration');
    const baseAmount = ethers.utils.parseEther('15');
    const quoteAmount = ethers.utils.parseEther('5');
    const assetTo = VaultMigration.address;
    const data = abiCoder.encode(['address', 'uint256'], [VaultMigration.address, baseAmount]);
    // console.log(data);
    const tx = await dspContract.flashLoan(baseAmount, quoteAmount, assetTo, data);
    const res = await tx.wait();
    // console.log(tx, res);
  });

});
