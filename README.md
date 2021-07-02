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
