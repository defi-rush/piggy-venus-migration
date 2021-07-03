/*
 * const hre = require('hardhat') returns an instance of the HRE.
 * using HRE outside the hardhat tasks is explained here:
 *   https://hardhat.org/advanced/hardhat-runtime-environment.html#explicitly
 *   https://hardhat.org/guides/scripts.html#writing-scripts-with-hardhat
 * HARDHAT_NETWORK environment variable is necessary to run these scripts:
 *   `HARDHAT_NETWORK=localhost node apps/index.js`
 */
const { ethers } = require('hardhat');

const { FaucetApp } = require('./faucet');
const { VenusApp } = require('./venus');
const { PiggyApp } = require('./piggy');

/* set user wallet for test */
const userWallet = new ethers.Wallet(
  require('../.testaccount').privateKey,
  ethers.provider
);


async function main() {
  if (!process.env.HARDHAT_NETWORK) {
    throw new Error('HARDHAT_NETWORK env is required');
  }

  const balanceInEther = +ethers.utils.formatEther(await userWallet.getBalance());
  if (balanceInEther < 5) {
    const faucet = new FaucetApp(userWallet);
    await faucet.requestBNB(20);
  }

  const venusApp = new VenusApp(userWallet);
  // await venusApp.clearDebtAndCollateral();
  // await venusApp.initMarketWithExactCR(5, 130);

  const piggyApp = new PiggyApp(userWallet);
  const [upperHint, lowerHint] = await piggyApp.findHintForTrove(
    ethers.utils.parseEther('1000'), ethers.utils.parseEther('5')
  );
  console.log('success', [upperHint, lowerHint]);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
