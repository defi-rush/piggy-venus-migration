const { ethers} = require('hardhat');

function getUserWallet() {
  const userWallet = new ethers.Wallet(
    '02ee76f5967730d26d5adda9a38d8bd6308a68d87cfef12fa0752fc209aae310',
    ethers.provider
  );
  return userWallet;
}

module.exports = {
  getUserWallet,
}
