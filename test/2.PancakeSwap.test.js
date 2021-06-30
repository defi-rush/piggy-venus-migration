const { deployments, ethers, getNamedAccounts } = require('hardhat');
const { expect } = require('chai');
const setup = require('./helpers/setup');

describe('Test venus', function() {
  let userWallet;

  before(async () => {
    userWallet = setup.getUserWallet();
  });

});
