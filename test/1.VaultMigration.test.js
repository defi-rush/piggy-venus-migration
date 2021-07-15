const { deployments, ethers, getNamedAccounts, network } = require('hardhat');
const { expect } = require('chai');
const setup = require('./helpers/setup');
const { getContractInstance } = require('../apps/contract-factory');

describe('Test Piggy Reward', function() {
  let userWallet, snapshotId;

  before(async () => {
    snapshotId = await network.provider.send('evm_snapshot');
    console.log(`took a snapshot: ${snapshotId}`);
    userWallet = setup.getUserWallet();
  });

  it('测试一下 governance 和 allowance', async function() {
    //
  });

  after(async () => {
    await network.provider.send('evm_revert', [snapshotId]);
  });

});
