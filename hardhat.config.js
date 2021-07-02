require('@nomiclabs/hardhat-ethers');
require('hardhat-deploy');

// require('hardhat-ethernal');
// extendEnvironment((hre) => {
//   hre.ethernalSync = true;
//   hre.ethernalWorkspace = 'piggy-venus-migration';
//   hre.ethernalTrace = true;
// });

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: '0.8.4',
  defaultNetwork: 'hardhat',
  networks: {
    hardhat: {
      live: false,
      saveDeployments: true,
      chainId: +(process.env.CHAIN_ID || 31337),
      forking: {
        url: 'https://bsc.getblock.io/mainnet/?api_key=65f1d98d-ac5a-45f8-be38-00ca29126f92',
        blockNumber: 8773900
        // url: 'https://bsc-dataseed.binance.org/',
      },
      accounts: [{
        balance: '100000' + '000000000000000000',  // 100000eth
        privateKey: '0xdf57089febbacf7ba0bc227dafbffa9fc08a93fdc68e1e42411a14efcf23656e',
        address: '0x8626f6940e2eb28930efb4cef49b2d1f2c9c1199',
      }],
    },
    localhost: {
      url: 'http://127.0.0.1:8546',
      timeout: 20 * 60 * 1000
      // proxy 合约从 getblock 请求数据超级慢, 这里 timeout 设的大一点
    },
  },
  namedAccounts: {
    deployer: {
      default: 0,
    },
    WBNB: {
      'localhost': '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c',
      56: '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c',
    },
    BUSD: {
      'localhost': '0xe9e7cea3dedca5984780bafc599bd69add087d56',
      56: '0xe9e7cea3dedca5984780bafc599bd69add087d56',
    },
    PUSD: {
      'localhost': '0xedbdb5c2f68ece62ef35134a22156e665c3b06e3',
      56: '0xedbdb5c2f68ece62ef35134a22156e665c3b06e3',
    },
    /* venus */
    VenusComptroller: {
      'localhost': '0xfd36e2c2a6789db23113685031d7f16329158384',
      56: '0xfd36e2c2a6789db23113685031d7f16329158384',
    },
    VenusPriceOracle: {
      'localhost': '0x516c18dc440f107f12619a6d2cc320622807d0ee',
      56: '0x516c18dc440f107f12619a6d2cc320622807d0ee',
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
    DODOStablePool: {
      // PUSD/BUSD pair
      'localhost': '0x863f6adc264d5a3b9dea606a2d316ed31e7416aa',
      56: '0x863f6adc264d5a3b9dea606a2d316ed31e7416aa',
    },
    /* piggy */
    PiggyBorrowerOperations: {
      'localhost': '0x8cB2C204F8e35fac27a76c32840f9364b923CD2b',
      56: '0x8cB2C204F8e35fac27a76c32840f9364b923CD2b',
    },
    PiggyTroveManager: {
      'localhost': '0xb283466d09177c5c6507785d600cafdfa538c65c',
      56: '0xb283466d09177c5c6507785d600cafdfa538c65c',
    },
    PiggyHintHelpers: {
      'localhost': '0x9d3c5a071582947e3d7602ebc54851a487057888',
      56: '0x9d3c5a071582947e3d7602ebc54851a487057888',
    },
    PiggySortedTroves: {
      'localhost': '0x26ac9258d037766aeec27b808c77e853bdb2cdd8',
      56: '0x26ac9258d037766aeec27b808c77e853bdb2cdd8',
    },
    /* pancakeswap */
    PancakePair: {
      // WBNB/BUSD pair
      'localhost': '0x1b96b92314c44b159149f7e0303511fb2fc4774f',
      56: '0x1b96b92314c44b159149f7e0303511fb2fc4774f',
    },
    PancakeRouter: {
      'localhost': '0x10ed43c718714eb63d5aa57b78b54704e256024e',
      56: '0x10ed43c718714eb63d5aa57b78b54704e256024e',
    },
  },
  mocha: {
    timeout: 20 * 60 * 1000  // 20 minutes
  }
};
