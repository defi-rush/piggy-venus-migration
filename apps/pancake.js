const { ethers, getNamedAccounts } = require('hardhat');
const { getContractInstance } = require('./contract-factory');


const PancakeSwapApp = function(userWallet) {
  if (!userWallet) {
    throw new Error('userWallet is required');
  }
  this.userWallet = userWallet;
}

/**
 * swapETHForExactTokens
 *
 * @param      {String}  tokenName  The token name (e.g. 'BUSD')
 * @param      {Number}  amountOut  The amount (in wei) to swap out
 */
PancakeSwapApp.prototype.swapETHForExactTokens = async function(tokenName, amountOutInWei) {
  const [tokenWBNB, pancakeRouter, targetToken] = await Promise.all([
    getContractInstance('WBNB', this.userWallet),
    getContractInstance('PancakeRouter', this.userWallet),
    getContractInstance(tokenName, this.userWallet),
  ]);
  const amountOut = amountOutInWei;
  const path = [tokenWBNB.address, targetToken.address];
  const to = this.userWallet.address;
  const deadline = parseInt((new Date()).valueOf() / 1000) + 300;
  const amountsIn = await pancakeRouter.getAmountsIn(amountOut, path);
  /* 多给 1% BNB, 没用完的 BNB 会返回 */
  const amountBNB = amountsIn[0].mul(101).div(100);
  await pancakeRouter.swapETHForExactTokens(amountOut, path, to, deadline, {
    value: amountBNB
  }).then((tx) => tx.wait());
}


module.exports = {
  PancakeSwapApp
}
