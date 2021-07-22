# Migrate BNB position from venus to piggy bank

## 调用 startMigrate 开始迁移

合约地址和 ABI: 

https://bscscan.com/address/0x034563d799c80345ff9dee0adfa7134471db37d1#code

```js
// ethers.js
const address = '0x034563d799c80345ff9dee0adfa7134471db37d1';
const abi = ['function startMigrate(address _upperHint, address _lowerHint)'];
const contract = ethers.Contract(address, abi, provider);
await contract.startMigrate(_upperHint, _lowerHint).then((tx) => tx.wait());
```

1. 前端在检查 Venus 的头寸并预估 BNB 和 PUSD 的数量以后，通过 piggy 的 `HintHelpers` 计算一下 `_upperHint` 和 `_lowerHint`，可以节省一点 gas。这两个参数也可以直接传用户的钱包地址。
2. 需要提前 approve vBNB 和 approve PUSD，其中 approve vBNB 的数量只要当前的余额就行，但是 approve PUSD 的数量最好在预估出来的数量上再多加 10%。

## 迁移奖励 PIGGY

这个合约记录了 PIGGY 的奖励，上线的时候需要留意该合约下 PIGGY 的余额。

https://bscscan.com/address/0xC5073d5eEe8baD2A14aAFB677E44B9177f8dF60a

合约用 BEP-20 (mrPIGGY) 来对未领取奖励计数。

用户迁移完成后，如果该合约地址上 PIGGY 余额足够，会直接把 PIGGY 转给用户。否则会以 1:1 的比例 mint 相同数量（现在是 100）的 mrPIGGY 给用户，然后我们这边通过 https://bscscan.com/token/0xC5073d5eEe8baD2A14aAFB677E44B9177f8dF60a#balances 来查看这些人。

给合约转入 PIGGY 以后，可以通过 `claimRewardOnBehalfOf(address[] memory _tos)` 方法来把 PIGGY 补发给 `_tos` 里面列出来的所有用户，发完后会销毁他们的 mrPIGGY。


# 在本地测试合约

## Getting contract addressses

Deployed addresses can be obtained by running:

```bash
npx hardhat contracts --network localhost
```

## Scripts in `apps` folder

apps 目录下面的脚本封装了一些测试用例、预检查逻辑和对迁移合约的调用

这些脚本依赖于 `HRE` (即`require('hardhat')`)，默认情况下 `HRE` 没有被完整的初始化，所以就算是 localhost 的 deployments 或者 provider 都不正确，调用这些脚本的时候需要注意。

1. 直接执行这些脚本的时候，需要加上 `HARDHAT_NETWORK` 环境变量，比如

```bash
HARDHAT_NETWORK=localhost node apps/index.js
# or
HARDHAT_NETWORK=mainnet node apps/index.js
```

2. 或者用 `hardhat run` 命令 带上 `--network` 参数，比如

```bash
npx hardhat run apps/index.js --network localhost
# or
npx hardhat run apps/index.js --network mainnet
```

3. 如果是在 test/tasks 中调用这些脚本，`HRE` 的配置和 test/tasks 中的一致


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
