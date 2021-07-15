const { deployments, ethers, getNamedAccounts, network } = require('hardhat');
const { expect } = require('chai');
const setup = require('./helpers/setup');
const { getContractInstance } = require('../apps/contract-factory');

describe('Test Piggy Reward', function() {
  let piggyReward, userWallet, snapshotId;

  before(async () => {
    snapshotId = await network.provider.send('evm_snapshot');
    console.log(`took a snapshot: ${snapshotId}`);

    userWallet = setup.getUserWallet();

    const PiggyReward = await deployments.get('PiggyReward');
    piggyReward = new ethers.Contract(PiggyReward.address, PiggyReward.abi, ethers.provider);
  });

  it('Should reward me 100 PIGGY', async function() {
    const VaultMigration = await deployments.get('VaultMigration');
    await network.provider.send('hardhat_impersonateAccount', [VaultMigration.address]);
    const vaultMigrationMockAccount = await ethers.getSigner(VaultMigration.address);
    const amount = ethers.utils.parseEther('1');
    await piggyReward.connect(vaultMigrationMockAccount).reward(userWallet.address, amount, {
      gasPrice: 0
    }).then((tx) => tx.wait());
    const balanceReward = await piggyReward.balanceOf(userWallet.address);
    expect(balanceReward.eq(amount.mul(100))).to.be.true;
    const tokenPIGGY = await getContractInstance('PIGGY');
    const balancePiggy = await tokenPIGGY.balanceOf(userWallet.address);
    expect(balancePiggy.eq(0)).to.be.true;
  });

  it('Should transfer 10000 PIGGY to contract', async function() {
    const { piggyHolder } = await getNamedAccounts();
    await network.provider.send('hardhat_impersonateAccount', [piggyHolder]);
    const piggyHolderWallet = await ethers.getSigner(piggyHolder);
    const tokenPIGGY = await getContractInstance('PIGGY', piggyHolderWallet);
    const amount = ethers.utils.parseEther('1000');
    await tokenPIGGY.transfer(piggyReward.address, amount).then((tx) => tx.wait());
    const balance = await tokenPIGGY.balanceOf(piggyReward.address);
    expect(balance.eq(amount)).to.be.true;
  });

  it('Should reward me and transfer to me 100 PIGGY', async function() {
    const VaultMigration = await deployments.get('VaultMigration');
    await network.provider.send('hardhat_impersonateAccount', [VaultMigration.address]);
    const vaultMigrationMockAccount = await ethers.getSigner(VaultMigration.address);
    const amount = ethers.utils.parseEther('1');
    await piggyReward.connect(vaultMigrationMockAccount).reward(userWallet.address, amount, {
      gasPrice: 0
    }).then((tx) => tx.wait());
    const balanceReward = await piggyReward.balanceOf(userWallet.address);
    expect(balanceReward.eq(amount.mul(100))).to.be.true;
    // 这次转出了 100, 还剩下 100 是上一次 reward 留下的
    const tokenPIGGY = await getContractInstance('PIGGY');
    const balancePiggy = await tokenPIGGY.balanceOf(userWallet.address);
    expect(balancePiggy.eq(amount.mul(100))).to.be.true;
  });

  it('Should transfer to me 100 PIGGY more', async function() {
    const { deployer } = await getNamedAccounts();
    const governanceWallet = await ethers.getSigner(deployer);
    await piggyReward.connect(governanceWallet).claimRewardOnBehalfOf([
      userWallet.address
    ]).then((tx) => tx.wait());
    const balanceReward = await piggyReward.balanceOf(userWallet.address);
    expect(balanceReward.eq(0)).to.be.true;
    // 这次转出了 100, 还剩下 100 是上一次 reward 留下的
    const tokenPIGGY = await getContractInstance('PIGGY');
    const balancePiggy = await tokenPIGGY.balanceOf(userWallet.address);
    expect(balancePiggy.eq(ethers.utils.parseEther('200'))).to.be.true;
  });

  after(async () => {
    await network.provider.send('evm_revert', [snapshotId]);
  });

});
