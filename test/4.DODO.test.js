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
    //
  });

});
