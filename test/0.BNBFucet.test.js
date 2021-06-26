const { deployments, ethers, getNamedAccounts } = require('hardhat');
const { expect } = require('chai');
const setup = require('./helpers/setup');

describe('Test ether fucet', function() {
  let bNBFucet, userWallet;

  before(async () => {
    userWallet = setup.getUserWallet();
    const BNBFucet = await deployments.get('BNBFucet');
    bNBFucet = new ethers.Contract(BNBFucet.address, BNBFucet.abi, ethers.provider);
  });

  it ('should greet', async function() {
    const res = await bNBFucet.greet();
    expect(res).to.equal('greeting from xd');
  });

  it ('should carry ether balance', async function() {
    const res = await bNBFucet.balance();
    const ethBalance = await ethers.provider.getBalance(bNBFucet.address);
    // ethers.utils.parseEther('10000').toString()
    expect(res.toString()).to.equal(ethBalance.toString());
  });

  it ('should transfer 10 ether', async function() {
    const { deployer } = await getNamedAccounts();
    const signer = await ethers.getSigner(deployer);
    // 在 localhost 环境里默认的 signer 就是 deployer, 但其他环境不是
    const to = userWallet.address;
    const amount = ethers.utils.parseEther('10');
    const balanceBefore = await userWallet.getBalance();
    const res = await bNBFucet.connect(signer)['giveBNB(uint256,address)'](amount, to);
    const balanceAfter = await userWallet.getBalance();
    expect(amount.eq((balanceAfter - balanceBefore).toString())).to.equal(true);
  });

  it ('should transfer 10 ether again', async function() {
    const amount = ethers.utils.parseEther('10');
    const balanceBefore = await userWallet.getBalance();
    // const res = await bNBFucet.connect(userWallet)['giveBNB(uint256)'](amount, { gasPrice: 0 });
    const res = await bNBFucet.connect(userWallet).requestBNB(amount, {
      gasPrice: 0
    });
    const balanceAfter = await userWallet.getBalance();
    expect(amount.eq((balanceAfter - balanceBefore).toString())).to.equal(true);
  });

});
