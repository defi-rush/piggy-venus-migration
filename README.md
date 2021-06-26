# Migrate BNB position from venus to piggy bank

## Getting contract addressses

Deployed addresses can be obtained by running:

```bash
npx hardhat contracts --network localhost
```

## Scripts in `apps` folder

apps 目录下面的脚本封装了一些测试用例、预检查逻辑和对迁移合约的调用

这些脚本依赖于 `HRE` (即`require('hardhat')`)，默认情况下 `HRE` 没有被完整的初始化，所以就算是 localhost 的 deployments 或者 provider 都不正确，调用这些脚本的时候需要注意。

1. 直接执行这些脚本的时候如果要切换网络，需要加上 `HARDHAT_NETWORK` 环境变量，比如

```bash
HARDHAT_NETWORK=localhost node apps/index.js
# or
HARDHAT_NETWORK=mainnet node apps/index.js
```

2. 如果是在 test/tasks 中调用这些脚本，`HRE` 的配置和 test/tasks 中的一致


## Revert with `evm_revert`

`apps/index.js` 脚本运行初期会创建一个 `snapshot (evm_snapshot)`，并且在运行结束以后调用 `evm_revert` 重置状态

如果需要保留之行结束的状态，可以注释掉 `shotshotAndRun` 方法最后两行代码。并且随后在命令行里人工运行

```bash
npx hardhat revert --snapshot [snapshotId] --network localhost
```

其中 `snapshotId` 可以在 `apps/index.js` 的命令行输出中找到


## Upgrade piggy

需要对 piggy 项目的 `hardhat.config.js` 做一些修改, 具体可以看 `localhost8546.patch` 文件

deployer: `0xc839C1A7daa991717ad58Cd0179e6b3e3e70C579`

proxy admin: `0x03289F0734e7C09Ea7A608e404fD01c00EA8aA58`

```bash
yarn && cd packages/contracts/
# apply localhost8546.patch to modify content in hardhat.config.js
npx hardhat compile
# upgrade 之前需要重置一下 unknown-31337.json, 还需要重置一下 bscDeploymentOutput.json
cp .openzeppelin/unknown-56.json .openzeppelin/unknown-31337.json
npx hardhat upgrade --name borrowerOperations --network localhost8546
```
