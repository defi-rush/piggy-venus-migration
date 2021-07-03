# Migrate BNB position from venus to piggy bank

## Getting contract addressses

Deployed addresses can be obtained by running:

```
npx hardhat contracts --network localhost
```

### Mainnet

```
...
```

### Localhost

```
...
```


## Scripts in `apps` folder
apps 目录下面的脚本依赖于 `HRE` (即`require('hardhat')`)，默认情况下 `HRE` 没有被完整的初始化，所以就算是 localhost 的 deployments 或者 provider 都不正确，调用这些脚本的时候需要注意。

1. 直接执行这些脚本的时候如果要切换网络，需要加上 `HARDHAT_NETWORK` 环境变量，比如

```bash
HARDHAT_NETWORK=localhost node apps/index.js
# or
HARDHAT_NETWORK=mainnet node apps/index.js
```

2. 如果是在 test/tasks 中调用这些脚本，`HRE` 的配置和 test/tasks 中的一致


## Upgrade piggy

deployer: `0xc839C1A7daa991717ad58Cd0179e6b3e3e70C579`
proxy admin: `0x03289F0734e7C09Ea7A608e404fD01c00EA8aA58`

```bash
yarn && cd packages/contracts/
```

```bash
npx hardhat compile
# npx hardhat upgrade --name borrowerOperations --network bsc
# upgrade 之前需要重置一下 unknown-31337.json, 还需要重置一下 bscDeploymentOutput.json
cp .openzeppelin/unknown-56.json .openzeppelin/unknown-31337.json
npx hardhat upgrade --name borrowerOperations --network localhost8546
```
