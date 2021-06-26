// require('@nomiclabs/hardhat-waffle');
require('@nomiclabs/hardhat-ethers');
require('hardhat-deploy');
require('hardhat-ethernal');


// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task('accounts', 'Prints the list of accounts', async () => {
  const accounts = await ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

task('contracts', 'Prints the contract addresses for a network').setAction(async () => {
  // eslint-disable-next-line no-undef
  const contracts = await deployments.all();
  for (const contract in contracts) {
    console.log(contract, contracts[contract].address);
  }
});

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: '0.8.4',
  defaultNetwork: 'hardhat',
  networks: {
    hardhat: {
      live: false,
      saveDeployments: true, // hardhat 默认是 false
      chainId: process.env.CHAIN_ID ? +process.env.CHAIN_ID : 31337,
      forking: {
        url: 'https://bsc.getblock.io/mainnet/?api_key=d0aadfa6-57cf-4a78-b149-f4c743ef9a24',
        // blockNumber: 8631147
      },
      accounts: [{
        balance: '100000' + '000000000000000000',  // 100000eth
        privateKey: '0xdf57089febbacf7ba0bc227dafbffa9fc08a93fdc68e1e42411a14efcf23656e',
        address: '0x8626f6940e2eb28930efb4cef49b2d1f2c9c1199',
      }],
      // The address to use as default sender. If not present the first account of the Hardhat Network is used.
      // from: '0x8626f6940e2eb28930efb4cef49b2d1f2c9c1199',
    }
  },
  /* https://github.com/wighawag/hardhat-deploy#1-namedaccounts-ability-to-name-addresses
     有一点比较特殊, 对于 hardhat-deploy 来说, hardhat 的 network name 是 localhost
     包括执行 npx hardhat deploy, 必须用参数 --network localhost 而不是 --network hardhat
     https://hardhat.org/plugins/hardhat-deploy.html#flags-2
  */
  namedAccounts: {
    deployer: {
      default: 0,
    },
    stableSwap3Pool: {
      'localhost': '0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7',
      56: '0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7',
    },
    aaveLendingPool: {
      'localhost': '0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9',
      56: '0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9',
    },
    aaveWETHGateway: {
      'localhost': '0xcc9a0B7c43DC2a5F023Bb9b738E45B0Ef6B06E04',
      56: '0xcc9a0B7c43DC2a5F023Bb9b738E45B0Ef6B06E04',
    },
    DAI: {
      'localhost': '0x6B175474E89094C44Da98b954EedeAC495271d0F',
      56: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    },
    USDC: {
      'localhost': '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      56: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    },
    USDT: {
      'localhost': '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      56: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    },
    T3CRV: {
      'localhost': '0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490',
      56: '0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490',
    },
  }
};
