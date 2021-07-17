const { ethers, deployments, network } = require('hardhat');
const { getContractInstance } = require('./contract-factory');

const { FaucetApp } = require('./faucet');
const { VenusApp } = require('./venus');

function App() {}

App.prototype.initialize = async function({ privateKey }) {
  this.userWallet = new ethers.Wallet(privateKey, ethers.provider);
  this.venusApp = new VenusApp(this.userWallet);
}

App.prototype.prepareVenusPositions = async function() {
  const faucet = new FaucetApp(this.userWallet);
  await faucet.requestBNB(50);
  await this.venusApp.initMarketWithMultipleAssets(
    { 'vBNB': 350 },  // collaterals
    { 'vBUSD': 185 },  // debts
  );
}

async function main() {
  if (network.name !== 'localhost') {
    throw new Error('This script only works on localhost');
  }
  const app = new App();
  const { privateKey } = require('../.testaccount');
  await app.initialize({ privateKey });
  const snapshotId = await network.provider.send('evm_snapshot');
  console.log('start on snapshot:', snapshotId);
  await app.prepareVenusPositions();
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
