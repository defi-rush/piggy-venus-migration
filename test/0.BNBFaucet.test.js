const { deployments, ethers, getNamedAccounts, network } = require('hardhat');
const { expect } = require('chai');
const setup = require('./helpers/setup');
const { getContractInstance } = require('../apps/contract-factory');

describe('Test BNB faucet', function() {
  let bNBFaucet, userWallet, snapshotId;

  before(async () => {
    snapshotId = await network.provider.send('evm_snapshot');
    console.log(`took a snapshot: ${snapshotId}`);
    userWallet = setup.getUserWallet();
    const BNBFaucet = await deployments.get('BNBFaucet');
    bNBFaucet = new ethers.Contract(BNBFaucet.address, BNBFaucet.abi, ethers.provider);
  });

  it ('should greet', async function() {
    const res = await bNBFaucet.greet();
    expect(res).to.equal('greeting from xd');
  });

  it ('should carry BNB balance', async function() {
    const res = await bNBFaucet.balance();
    const ethBalance = await ethers.provider.getBalance(bNBFaucet.address);
    // ethers.utils.parseEther('10000').toString()
    expect(res.toString()).to.equal(ethBalance.toString());
  });

  // it ('should transfer 100 BNB', async function() {
  //   const { deployer } = await getNamedAccounts();
  //   const signer = await ethers.getSigner(deployer);
  //   // 在 localhost 环境里默认的 signer 就是 deployer, 但其他环境不是
  //   const to = userWallet.address;
  //   const amount = ethers.utils.parseEther('10');
  //   const balanceBefore = await userWallet.getBalance();
  //   const res = await bNBFaucet.connect(signer)['giveBNB(uint256,address)'](amount, to);
  //   const balanceAfter = await userWallet.getBalance();
  //   expect(amount.eq((balanceAfter - balanceBefore).toString())).to.equal(true);
  // });

  it ('should transfer 100 BNB again', async function() {
    const amount = ethers.utils.parseEther('100');
    const balanceBefore = await userWallet.getBalance();
    // const res = await bNBFaucet.connect(userWallet)['giveBNB(uint256)'](amount, { gasPrice: 0 });
    const res = await bNBFaucet.connect(userWallet).requestBNB(amount, {
      gasPrice: 0
    });
    const balanceAfter = await userWallet.getBalance();
    expect(amount.eq(balanceAfter.sub(balanceBefore))).to.equal(true);
  });

  it ('should mint 50 WBNB', async function() {
    const wBNBContract = await getContractInstance('WBNB', userWallet);
    const amount = ethers.utils.parseEther('50');
    const balanceBefore = await wBNBContract.balanceOf(userWallet.address);
    const tx = await wBNBContract.functions.deposit({ value: amount });
    const res = await tx.wait();
    const balanceAfter = await wBNBContract.balanceOf(userWallet.address);
    expect(amount.eq(balanceAfter.sub(balanceBefore))).to.equal(true);

    // const res1 = await network.provider.request({
    //   method: 'evm_revert',
    //   params: ['0x1']
    // });
  });

  after(async () => {
    await network.provider.send('evm_revert', [snapshotId]);
  });

});
