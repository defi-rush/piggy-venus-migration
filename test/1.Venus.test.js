const { deployments, ethers, getNamedAccounts } = require('hardhat');
const { expect } = require('chai');
const setup = require('./helpers/setup');

describe('Test venus', function() {
  let userWallet, vBNBContract, vBUSDContract, comptrollerContract;

  before(async () => {
    userWallet = setup.getUserWallet();
    // await setup.initializeVenusMarket();
    const accounts = await getNamedAccounts();
    const vTokenAbi = [
      // 'function mint()',
      'function borrow(uint borrowAmount) returns (uint)',
      'function borrowBalanceCurrent(address account) returns (uint)',
      'function borrowBalanceStored(address account) public view returns (uint)',
    ];
    const vBNBAbi = [
      ...vTokenAbi,
      'function mint() payable'
    ];
    vBNBContract = new ethers.Contract(accounts['vBNB'], vBNBAbi, userWallet);
    const vBUSDAbi = [ ...vTokenAbi ];
    vBUSDContract = new ethers.Contract(accounts['vBUSD'], vBUSDAbi, userWallet);
    /* Unitroller */
    comptrollerContract = new ethers.Contract(accounts['venusComptroller'], [
      'function enterMarkets(address[] calldata vTokens) returns (uint[] memory)',
      'event MarketEntered(vToken vToken, address account)',
      'event MarketExited(vToken vToken, address account)'
    ], userWallet);
  });

  // it ('should 1', async function() {
  //   const balance = await userWallet.getBalance();
  //   console.log(balance.toString());
  //   // expect(balance.eq(ethers.utils.parseEther('10'))).to.equal(true);
  // });

  // it ('should mint vToken for BNB', async function() {
  //   const mintTx = await vBNBContract.mint({
  //     value: ethers.utils.parseEther('5')
  //   });
  //   await mintTx.wait();
  // });

  it ('should mint vToken for BNB', async function() {
    /*
     * contract.functions.METHOD_NAME will always returns a RESULT
     * contract.METHOD_NAME will return a value depending on ABI
     */
    const mintRes = await vBNBContract.functions.mint({
      value: ethers.utils.parseEther('5')
    });
  });

  it ('should enter market', async function() {
    const { vBNB: vBNBAddress, vBUSD: vBUSDAddress } = await getNamedAccounts();
    const tx = await comptrollerContract.functions.enterMarkets([vBNBAddress, vBUSDAddress]);
    const res = await tx.wait();
  });

  it ('should borrow me some BUSD', async function() {
    const tx = await vBUSDContract.functions.borrow(ethers.utils.parseEther('100'));
    const res = await tx.wait();
  });

});
