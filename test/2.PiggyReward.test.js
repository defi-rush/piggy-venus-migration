const { deployments, ethers, getNamedAccounts, network } = require('hardhat');
const { expect } = require('chai');
const setup = require('./helpers/setup');
const { getContractInstance } = require('../apps/contract-factory');

describe('Test Piggy Reward', function() {
  let piggyReward, userWallet, snapshotId, piggyHolderWallet;

  before(async () => {
    snapshotId = await network.provider.send('evm_snapshot');
    console.log(`took a snapshot: ${snapshotId}`);

    userWallet = setup.getUserWallet();

    const PiggyReward = await deployments.get('PiggyReward');
    piggyReward = new ethers.Contract(PiggyReward.address, PiggyReward.abi, ethers.provider);

    const { piggyHolder } = await getNamedAccounts();
    await network.provider.send('hardhat_impersonateAccount', [piggyHolder]);
    piggyHolderWallet = await ethers.getSigner(piggyHolder);
  });

  it('Should transfer PIGGY to contract', async function() {
    const piggyContract = await getContractInstance('PIGGY', piggyHolderWallet);
    const amount = ethers.utils.parseEther('10000');
    await piggyContract.transfer(piggyReward.address, amount).then((tx) => tx.wait());
    const balance = await piggyContract.balanceOf(piggyReward.address);
    expect(balance.eq(amount)).to.be.true;
  });

  after(async () => {
    await network.provider.send('evm_revert', [snapshotId]);
  });

});
