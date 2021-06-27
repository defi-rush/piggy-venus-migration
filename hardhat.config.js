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
        blockNumber: 8631147
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
    WBNB: {
      'localhost': '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c',
      56: '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c',
    }
    BUSD: {
      'localhost': '0xe9e7cea3dedca5984780bafc599bd69add087d56',
      56: '0xe9e7cea3dedca5984780bafc599bd69add087d56',
    },
    PUSD: {
      'localhost': '0xedbdb5c2f68ece62ef35134a22156e665c3b06e3',
      56: '0xedbdb5c2f68ece62ef35134a22156e665c3b06e3',
    },
    /* venus */
    venusComptroller: {
      'localhost': '0xfd36e2c2a6789db23113685031d7f16329158384',
      56: '0xfd36e2c2a6789db23113685031d7f16329158384',
    },
    vBNB: {
      'localhost': '0xa07c5b74c9b40447a954e1466938b865b6bbea36',
      56: '0xa07c5b74c9b40447a954e1466938b865b6bbea36',
    },
    vBUSD: {
      'localhost': '0x95c78222b3d6e262426483d42cfa53685a67ab9d',
      56: '0x95c78222b3d6e262426483d42cfa53685a67ab9d',
    },
    /* dodo  */
    dodoStablePool: {
      'localhost': '0x863f6adc264d5a3b9dea606a2d316ed31e7416aa',
      56: '0x863f6adc264d5a3b9dea606a2d316ed31e7416aa',
    },
    /* piggy */
    piggyBorrowerOperations: {
      'localhost': '0x8cB2C204F8e35fac27a76c32840f9364b923CD2b',
      56: '0x8cB2C204F8e35fac27a76c32840f9364b923CD2b',
    }
  }
};
