const { deployments, ethers, getNamedAccounts } = require('hardhat');
const { expect } = require('chai');
const setup = require('./helpers/setup');

describe('Test venus', function() {
  let userWallet;

  before(async () => {
    userWallet = setup.getUserWallet();
    const accounts = await getNamedAccounts();
  });

  /*
  1. open trove
  open 之前需要检查下是否 open 了
  */

});
