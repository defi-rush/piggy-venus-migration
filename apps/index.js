/*
 * const hre = require('hardhat') returns an instance of the HRE.
 * using HRE outside the hardhat tasks is explained here:
 *   https://hardhat.org/advanced/hardhat-runtime-environment.html#explicitly
 *   https://hardhat.org/guides/scripts.html#writing-scripts-with-hardhat
 * HARDHAT_NETWORK environment variable is necessary to run these scripts:
 *   `HARDHAT_NETWORK=localhost node apps/index.js`
 */
const { ethers } = require('hardhat');

const { FaucetApp } = require('./Faucet');

/* set user wallet for test */
const userWallet = new ethers.Wallet(require('../.testaccount').privateKey, ethers.provider);


async function main() {
  if (!process.env.HARDHAT_NETWORK) {
    throw new Error('HARDHAT_NETWORK env is required');
  }
  const faucet = new FaucetApp(userWallet);
  await faucet.requestBNB(10);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
