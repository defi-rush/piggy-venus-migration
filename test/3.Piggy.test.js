const { deployments, ethers, getNamedAccounts } = require('hardhat');
const { expect } = require('chai');
const setup = require('./helpers/setup');

describe('Test piggy', function() {
  let userWallet;

  before(async () => {
    userWallet = setup.getUserWallet();
    // await setup.initializeVenusMarket();
  });

  /*
  1. open trove
  open 之前需要检查下是否 open 了
  */

  it ('should 2', async function() {
    const balance = await userWallet.getBalance();
    console.log(balance.toString());
    // expect(balance.eq(ethers.utils.parseEther('10'))).to.equal(true);
  });

});
