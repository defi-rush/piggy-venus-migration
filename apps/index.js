/*
 * const hre = require('hardhat') returns an instance of the HRE.
 * using HRE outside the hardhat tasks is explained here:
 *   https://hardhat.org/advanced/hardhat-runtime-environment.html#explicitly
 *   https://hardhat.org/guides/scripts.html#writing-scripts-with-hardhat
 * HARDHAT_NETWORK environment variable is necessary to run these scripts:
 *   `HARDHAT_NETWORK=localhost node apps/index.js`
 */
const { ethers, network } = require('hardhat');

const { FaucetApp } = require('./faucet');
const { VenusApp } = require('./venus');
const { PiggyApp } = require('./piggy');

function App() {
  /* set user wallet for test */
  this.userWallet = new ethers.Wallet(
    require('../.testaccount').privateKey,
    ethers.provider
  );
}

App.prototype.initialize = async function() {
  const faucet = new FaucetApp(this.userWallet);
  await faucet.requestBNB(20);
  const venusApp = new VenusApp(this.userWallet);
  await venusApp.initMarketWithExactCR(5, 130);
}

App.prototype.precheck = async function() {
  //
}

App.prototype.flashloan = async function() {
  const piggyApp = new PiggyApp(this.userWallet);
  const [upperHint, lowerHint] = await piggyApp.findHintForTrove(
    ethers.utils.parseEther('1000'), ethers.utils.parseEther('5')
  );

  /* 开始 flashloan */
  const maxFee = '5'.concat('0'.repeat(16)) // Slippage protection: 5%
}


/**
 * main process
 * run `npx hardhat revert [snapshotId] --network localhost` to send a `evm_revert` request
 */
async function shotshotAndRun() {
  if (!process.env.HARDHAT_NETWORK) {
    throw new Error('HARDHAT_NETWORK env is required');
  }

  const app = new App();
  const snapshotId = await network.provider.send('evm_snapshot');
  console.log('start on snapshot:', snapshotId);

  try {
    await app.initialize();
    await app.precheck();
    await app.flashloan();
  } catch(err) {
    console.log(err);
  }

  // await network.provider.send('evm_revert', [snapshotId]);
}

shotshotAndRun()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
