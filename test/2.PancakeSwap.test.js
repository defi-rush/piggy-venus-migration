const { deployments, ethers, getNamedAccounts } = require('hardhat');
const { expect } = require('chai');
const setup = require('./helpers/setup');
const { getContractInstance } = require('./helpers/contracts');

describe('Test pancake swap', function() {
  let userWallet, pancakePairContract, pancakeRouterContract;

  before(async () => {
    userWallet = setup.getUserWallet();
    const {
      PancakePair: addressPancakePair,
      PancakeRouter: addressPancakeRouter
    } = await getNamedAccounts();
    // pancakePair 是给合约调用的底层方法, 改用
    pancakePairContract = new ethers.Contract(addressPancakePair, [
      'function swap(uint amount0Out, uint amount1Out, address to, bytes calldata data)'
    ], userWallet);
    // https://github.com/pancakeswap/pancake-swap-periphery/blob/master/contracts/PancakeRouter.sol
    pancakeRouterContract = await getContractInstance('PancakeRouter', userWallet);
  });

  it ('should swap BNB to BUSD', async function() {
    const block = await ethers.provider.getBlock();
    const { WBNB: addressWBNB, BUSD: addressBUSD } = await getNamedAccounts();
    const amount = ethers.utils.parseEther('10');
    const amountOutMin = amount.mul('200');
    // 把 BNB 换成 ERC20 时候, path 第一个参数必须是 WBNB
    const path = [addressWBNB, addressBUSD];
    const to = userWallet.address;
    // const deadline = block.timestamp + 300;  // transaction expires in 300 seconds (5 minutes)
    // fork chain 的时间有问题, 这里暂时先用本地时钟
    const deadline = parseInt((new Date()).valueOf() / 1000) + 300;
    const tx = await pancakeRouterContract.swapExactETHForTokens(amountOutMin, path, to, deadline, {
      value: amount
    });
    const res = await tx.wait();
    // console.log(res);
  });

});
