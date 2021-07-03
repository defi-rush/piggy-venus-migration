const { ethers } = require('hardhat');
const { getContractInstance } = require('./ContractFactory');

const FaucetApp = function(userWallet) {
  if (!userWallet) {
    throw new Error('userWallet is required');
  }
  this.userWallet = userWallet;
}

FaucetApp.prototype.requestBNB = async function(etherAmount) {
  const faucet = await getContractInstance('BNBFaucet', this.userWallet);
  const amount = ethers.utils.parseEther(etherAmount.toString());
  const tx = await faucet.requestBNB(amount, {
    gasPrice: 0
  });
  const res = await tx.wait();
}

module.exports = {
  FaucetApp
}
