const { ethers } = require('hardhat');
const { getContractInstance } = require('./contract-factory');

const FaucetApp = function(userWallet) {
  if (!userWallet) {
    throw new Error('userWallet is required');
  }
  this.userWallet = userWallet;
}

FaucetApp.prototype.requestBNB = async function(amountInEther) {
  const faucet = await getContractInstance('BNBFaucet', this.userWallet);
  const amount = ethers.utils.parseEther(amountInEther.toString());
  const res = await faucet.requestBNB(amount, {
    gasPrice: 0
  }).then((tx) => tx.wait());
}

module.exports = {
  FaucetApp
}
