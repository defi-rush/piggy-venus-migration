const { ethers} = require('hardhat');
const TestAccount = require('../../.testaccount');

function getUserWallet() {
  const userWallet = new ethers.Wallet(TestAccount.privateKey, ethers.provider);
  return userWallet;
}

/* fixture 的目的貌似是重新部署所有合约, 并且进行一系列初始化, 本项目用不到 */
const initializeVenusMarket = deployments.createFixture(async ({
  deployments, getNamedAccounts, ethers
}, options) => {
  // https://hardhat.org/plugins/hardhat-deploy.html#_2-test-task
  // .fixture() 就是重新部署所有合约
  // await deployments.fixture(); // ensure you start from a fresh deployments

  const userWallet = getUserWallet();
  const accounts = await getNamedAccounts();

  const vTokenAbi = [
    // 'function mint()',
    'function borrow(uint borrowAmount) returns (uint)',
    'function borrowBalanceCurrent(address account) returns (uint)',
    'function borrowBalanceStored(address account) public view returns (uint)',
  ];

  /* get BNB */
  const BNBFucet = await deployments.get('BNBFucet');
  const bNBFucet = new ethers.Contract(BNBFucet.address, BNBFucet.abi, userWallet);
  const txFucet = await bNBFucet.requestBNB(ethers.utils.parseEther('10'), {
    gasPrice: 0
  });
  await txFucet.wait();
  // console.log('111111', (await userWallet.getBalance()).toString());

  /* deposit */
  const vBNBContract = new ethers.Contract(accounts['vBNB'], [
    ...vTokenAbi,
    'function mint() payable'
  ], userWallet);
  const txDeposit = await vBNBContract.functions.mint({
    value: ethers.utils.parseEther('5')
  });
  await txDeposit.wait();

  /* enter market */
  const { vBNB: vBNBAddress, vBUSD: vBUSDAddress } = await getNamedAccounts();
  const comptrollerContract = new ethers.Contract(accounts['VenusComptroller'], [
    'function enterMarkets(address[] calldata vTokens) returns (uint[] memory)',
    'event MarketEntered(vToken vToken, address account)',
    'event MarketExited(vToken vToken, address account)'
  ], userWallet);
  const txMarket = await comptrollerContract.functions.enterMarkets([vBNBAddress, vBUSDAddress]);
  await txMarket.wait();

  /* borrow */
  const vBUSDContract = new ethers.Contract(accounts['vBUSD'], [ ...vTokenAbi ], userWallet);
  const txBorrow = await vBUSDContract.functions.borrow(ethers.utils.parseEther('100'));
  await txBorrow.wait();
});

module.exports = {
  getUserWallet,
  // initializeVenusMarket,
}
